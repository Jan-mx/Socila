"""政策证据受控同步（09-11独立审查问题一，SHV2-FR-002运行时闭环；控制契约复审加固）。

Git审计夹具中的政策原件（original.html/附件 + meta.json + DSL evidence）同步为
运行时对象与RAG元数据：

- bucket固定`policy-originals`；对象键固定`originals/<sha256>`（SHA=原件实际字节SHA-256）；
- 五方映射：Git原件字节、meta.json.sha256、DSL evidence.content_sha256、MinIO对象SHA、
  rag.fetches/rag.document_versions.content_hash 与 object_key 必须一致；
  rag.fetches.object_key 与 rag.document_versions.object_key 指向同一对象；
- 受控模式：audit（只读对账）/plan（确定性计划）/apply（授权绑定执行）/verify（四方逐件核对）；
- **fresh授权计划契约（控制复审）**：apply必须显式绑定不可变计划文件与
  `--i-am-authorized --plan-hash --target-fingerprint`；写入前校验计划结构与planHash、
  当前HEAD==计划codeSha、工作树干净（RAG_EVIDENCE_ALLOW_DIRTY仅限隔离演练）、
  evidence未漂移（evidenceManifestHash）、MinIO+RAG目标状态指纹==targetFingerprint；
  状态与计划的终态指纹一致→幂等noop；介于两者之间→零写入拒绝（TARGET_STATE_DRIFT）；
  `RAG_EVIDENCE_ALLOW_REMOTE`/`RAG_EVIDENCE_ALLOW_PERSISTENT`只是endpoint/库名的附加
  防误写保护，不能替代上述fresh授权参数；
- **verify范围契约（控制复审）**：完整audit/plan/apply/verify必须连数据库；缺少数据库时
  完整verify不得返回ok:true；仅对象层检查必须显式`--object-only`（结果带
  verificationScope="object-only"/degraded=true/dbChecked=false标记，不作为四方验收通过）；
- **缺桶生命周期契约（缺桶复审）**：MinioObjectStore构造与audit/plan/verify/拒绝路径
  零建桶（SHV2-FR-023持久默认拒绝、SHV2-NFR-006失败关闭）；MinIO可达但bucket缺失时
  audit/verify返回ok=false+BUCKET_MISSING，plan仍生成确定性只读计划并表达
  `bucketExists=false/plannedBucketCreate=true`（进入planHash与targetFingerprint/
  finalFingerprint）；bucket创建只发生在apply通过全部fresh授权校验并取得advisory锁后的
  显式`ensure_bucket()`写入段；不采用Compose无条件初始化建桶；
- 幂等：对象已存在且SHA一致→no-op；内容不一致→拒绝覆盖（OBJECT_CONFLICT）；
  并发apply经advisory xact锁串行化并在锁内复查，不产生重复rag记录；
- 防误写：bucket非`policy-originals`拒绝；非本机MinIO endpoint默认拒绝（需
  RAG_EVIDENCE_ALLOW_REMOTE=1）；目标库名为`policyops`默认拒绝（需
  RAG_EVIDENCE_ALLOW_PERSISTENT=1）；
- 输出清单不含凭据（连接串口令统一redact）。

复用：agent.rag.storage.ObjectStore（MinIO/内存实现）、agent/migrations/0003_rag_schema.sql
的rag.sources/rag.fetches/rag.document_versions结构、capture-official-page.mjs产出的
evidence目录布局（每份原件一个目录：original.html + meta.json + http-headers.txt +
extracted-text.txt）。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

EVIDENCE_BUCKET = "policy-originals"
OBJECT_PREFIX = "originals/"
PIPELINE_VERSION = "rag-evidence-sync-1.0"
EVIDENCE_SYNC_ALGORITHM_VERSION = "RAG-EVIDENCE-SYNC-1.1"
PLAN_SCHEMA = "rag-evidence-sync-plan/1.1"
_PERSISTENT_DB = "policyops"
_LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "::1")
_MODES = ("audit", "plan", "apply", "verify")
# 任务专属advisory锁键（sha256("rag-evidence-sync")前8字节的有符号bigint）：
# 并发apply在登记事务内串行化，锁内复查避免重复rag记录。
ADVISORY_LOCK_KEY = int.from_bytes(hashlib.sha256(b"rag-evidence-sync").digest()[:8], "big", signed=True)
_FLAG_OPTS = {"--i-am-authorized", "--object-only"}
_VALUE_OPTS = (
    "--evidence-dir",
    "--dsl-root",
    "--bucket",
    "--jurisdiction",
    "--endpoint",
    "--database-url",
    "--out",
    "--plan-file",
    "--plan-hash",
    "--target-fingerprint",
)


class EvidenceSyncError(RuntimeError):
    """受控同步失败（code前缀进入消息，便于CLI输出与测试断言）。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def redact(text: str) -> str:
    """连接串/URL口令脱敏：`://user:password@` → `://user:***@`。"""
    return re.sub(r"(://[^:/\s]+:)([^@\s/]+)(@)", r"\1***\3", text)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _canonical_sha256(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def plan_hash_of(plan: dict[str, Any]) -> str:
    """planHash：对除planHash自身外的计划体规范化JSON计算SHA-256。"""
    body = {k: v for k, v in plan.items() if k != "planHash"}
    return _canonical_sha256(body)


def classify_target_state(current_fingerprint: str, target_fingerprint: str, final_fingerprint: str) -> str:
    """pending=与计划前置状态一致可执行；noop=已达计划终态；其余=漂移（零写入拒绝）。"""
    if current_fingerprint == target_fingerprint:
        return "pending"
    if current_fingerprint == final_fingerprint:
        return "noop"
    return "drift"


def _repo_root() -> Path:
    root = Path(__file__).resolve()
    for parent in root.parents:
        if (parent / ".git").exists():
            return parent
    raise EvidenceSyncError("GIT_UNAVAILABLE", "未找到仓库根（无.git）")


def git_head(repo_root: Path | None = None) -> dict[str, Any]:
    """当前HEAD与工作树状态（apply的codeSha/DIRTY校验数据源；只读git子进程）。"""
    root = repo_root or _repo_root()

    def git(args: list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=120, check=False)

    head = git(["rev-parse", "HEAD"])
    if head.returncode != 0:
        raise EvidenceSyncError("GIT_UNAVAILABLE", f"无法读取git HEAD：{(head.stderr or head.stdout or '').strip()[:200]}")
    status = git(["status", "--porcelain"])
    if status.returncode != 0:
        raise EvidenceSyncError("GIT_UNAVAILABLE", f"git status失败：{(status.stderr or '').strip()[:200]}")
    return {"sha": head.stdout.strip(), "dirty": bool(status.stdout.strip())}


def guard_minio_endpoint(endpoint: str) -> str:
    """生产/远程MinIO默认拒绝：仅放行本机endpoint，远程需RAG_EVIDENCE_ALLOW_REMOTE=1。"""
    host = endpoint.rsplit(":", 1)[0].strip("[]")
    if host not in _LOOPBACK_HOSTS and os.environ.get("RAG_EVIDENCE_ALLOW_REMOTE") != "1":
        raise EvidenceSyncError(
            "REMOTE_ENDPOINT_REFUSED",
            f"MinIO endpoint非本机（{host}）：生产对象存储默认拒绝；"
            "隔离演练仅允许localhost，远程需fresh授权并显式RAG_EVIDENCE_ALLOW_REMOTE=1",
        )
    return endpoint


@dataclass
class SyncDoc:
    """一份政策原件的解析结果与对账状态。"""

    doc_id: str
    directory: Path
    artifact: Path
    meta: dict[str, Any]
    headers: dict[str, str] = field(default_factory=dict)
    sha256: str = ""
    size: int = 0
    mime: str = "application/octet-stream"
    object_key: str = ""
    dsl_refs: set[str] = field(default_factory=set)


def _parse_headers(raw: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            headers[k.strip().lower()] = v.strip()
    return headers


def load_dsl_evidence_index(dsl_root: Path) -> dict[str, set[str]]:
    """收集DSL evidence：{document_id: {content_sha256, ...}}（全部地区规则/参数JSON）。"""
    index: dict[str, set[str]] = {}
    for path in sorted(dsl_root.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        stack: list[Any] = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                doc_id = node.get("document_id")
                sha = node.get("content_sha256")
                if isinstance(doc_id, str) and isinstance(sha, str):
                    index.setdefault(doc_id, set()).add(sha.lower())
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
    return index


def evidence_manifest_hash(docs: list[SyncDoc]) -> str:
    """证据清单hash：文档集合（docId/SHA/size/mime/objectKey/meta SHA/DSL refs）的规范化SHA。"""
    entries = [
        {
            "docId": doc.doc_id,
            "sha256": doc.sha256,
            "size": doc.size,
            "mime": doc.mime,
            "objectKey": doc.object_key,
            "metaSha256": str(doc.meta.get("sha256", "")),
            "dslRefs": sorted(doc.dsl_refs),
        }
        for doc in sorted(docs, key=lambda d: d.doc_id)
    ]
    return _canonical_sha256({"docs": entries})


def verify_plan_structure(plan: dict[str, Any]) -> list[str]:
    """计划正文结构校验（读取侧）：schema/版本/必需键/hash形状/清单完整性。"""
    problems: list[str] = []
    if plan.get("schema") != PLAN_SCHEMA:
        problems.append(f"schema {plan.get('schema')!r} ≠ {PLAN_SCHEMA}")
    if plan.get("algorithmVersion") != EVIDENCE_SYNC_ALGORITHM_VERSION:
        problems.append(f"algorithmVersion {plan.get('algorithmVersion')!r} ≠ {EVIDENCE_SYNC_ALGORITHM_VERSION}")
    if plan.get("bucket") != EVIDENCE_BUCKET:
        problems.append(f"bucket {plan.get('bucket')!r} ≠ {EVIDENCE_BUCKET}")
    if not plan.get("jurisdiction"):
        problems.append("jurisdiction缺失")
    code_sha = plan.get("codeSha")
    if not isinstance(code_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", code_sha):
        problems.append("codeSha非法（需40位hex）")
    for key in ("evidenceManifestHash", "targetFingerprint", "finalFingerprint", "planHash"):
        value = plan.get(key)
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            problems.append(f"{key}非法（需64位hex）")
    objects = plan.get("objects")
    if not isinstance(objects, list) or not objects:
        problems.append("objects清单缺失或为空")
    else:
        ids = [o.get("docId") for o in objects if isinstance(o, dict)]
        if len(ids) != len(objects) or len(set(ids)) != len(ids):
            problems.append("objects清单docId重复或形状非法")
        for o in objects:
            if not isinstance(o, dict) or not isinstance(o.get("objectKey"), str):
                problems.append("objects条目缺objectKey")
                break
    for key in ("plannedUploads", "plannedFetches", "plannedVersions", "noopObjects", "conflicts"):
        if not isinstance(plan.get(key), list):
            problems.append(f"{key}缺失（需列表）")
    # 缺桶生命周期：计划必须显式表达bucket状态与建桶意图（进入planHash与指纹）。
    for key in ("bucketExists", "plannedBucketCreate"):
        if not isinstance(plan.get(key), bool):
            problems.append(f"{key}缺失（需布尔）")
    return problems


class PolicyEvidenceSync:
    """受控幂等政策证据同步（audit/plan/apply/verify共用一个枚举与校验核心）。"""

    def __init__(
        self,
        evidence_dir: Path,
        store: Any,
        *,
        bucket: str = EVIDENCE_BUCKET,
        dsl_root: Path | None = None,
        database_url: str | None = None,
        jurisdiction: str | None = None,
    ) -> None:
        if bucket != EVIDENCE_BUCKET:
            raise EvidenceSyncError(
                "BUCKET_REFUSED",
                f"bucket必须固定为{EVIDENCE_BUCKET}（收到{bucket}）：内容寻址原件不进入其他bucket",
            )
        self.evidence_dir = evidence_dir
        self.store = store
        self.bucket = bucket
        self.dsl_root = dsl_root
        self.database_url = database_url
        self.jurisdiction = jurisdiction or self._derive_jurisdiction(evidence_dir)
        if database_url:
            self._guard_database(database_url)

    @staticmethod
    def _derive_jurisdiction(evidence_dir: Path) -> str:
        name = evidence_dir.name
        if re.fullmatch(r"\d{6}", name):
            return name
        raise EvidenceSyncError("USAGE", f"evidence目录名需为6位行政区划码（{name}），或显式传--jurisdiction")

    @staticmethod
    def _guard_database(database_url: str) -> None:
        from psycopg import conninfo

        dbname = conninfo.conninfo_to_dict(database_url).get("dbname", "")
        if dbname == _PERSISTENT_DB and os.environ.get("RAG_EVIDENCE_ALLOW_PERSISTENT") != "1":
            raise EvidenceSyncError(
                "PERSISTENT_TARGET_REFUSED",
                "目标库名为policyops：持久RAG数据库默认拒绝；需用户fresh授权并显式RAG_EVIDENCE_ALLOW_PERSISTENT=1",
            )

    # ── 枚举与前置校验（文件/meta/DSL；失败即raise，对象/数据库状态走报告）──────

    def collect(self) -> list[SyncDoc]:
        if not self.evidence_dir.is_dir():
            raise EvidenceSyncError("EVIDENCE_DIR_MISSING", f"evidence目录不存在：{self.evidence_dir}")
        dsl_index = load_dsl_evidence_index(self.dsl_root) if self.dsl_root else {}
        docs: list[SyncDoc] = []
        for doc_dir in sorted(p for p in self.evidence_dir.iterdir() if p.is_dir()):
            meta_path = doc_dir / "meta.json"
            if not meta_path.is_file():
                raise EvidenceSyncError("META_MISSING", f"{doc_dir.name}: meta.json缺失")
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            doc_id = str(meta.get("docId") or doc_dir.name)
            artifact_default = doc_dir / "original.html"
            artifact: Path
            if artifact_default.is_file():
                artifact = artifact_default
            else:
                declared = meta.get("artifact")
                artifact = doc_dir / str(declared) if declared else artifact_default
            if not artifact.is_file():
                raise EvidenceSyncError("ARTIFACT_MISSING", f"{doc_id}: 原件缺失（original.html或meta声明的附件）")
            content = artifact.read_bytes()
            actual_sha = sha256_bytes(content)
            meta_sha = str(meta.get("sha256", ""))
            if meta_sha.lower() != actual_sha:
                raise EvidenceSyncError(
                    "META_SHA_MISMATCH",
                    f"{doc_id}: 原件字节SHA {actual_sha} ≠ meta.json.sha256 {meta_sha}",
                )
            declared_size = meta.get("byteSize")
            if isinstance(declared_size, int) and declared_size != len(content):
                raise EvidenceSyncError("META_SIZE_MISMATCH", f"{doc_id}: 原件字节数 {len(content)} ≠ meta.byteSize {declared_size}")
            headers_raw = doc_dir / "http-headers.txt"
            headers = _parse_headers(headers_raw.read_text(encoding="utf-8")) if headers_raw.is_file() else {}
            content_type = headers.get("content-type", "application/octet-stream")
            refs = dsl_index.get(doc_id, set())
            bad_refs = [s for s in refs if s != actual_sha]
            if bad_refs:
                raise EvidenceSyncError(
                    "DSL_SHA_MISMATCH",
                    f"{doc_id}: DSL evidence content_sha256与原件不一致（evidence={sorted(bad_refs)[0]} 实际={actual_sha}）",
                )
            docs.append(
                SyncDoc(
                    doc_id=doc_id,
                    directory=doc_dir,
                    artifact=artifact,
                    meta=meta,
                    headers=headers,
                    sha256=actual_sha,
                    size=len(content),
                    mime=content_type.split(";")[0].strip() or "application/octet-stream",
                    object_key=f"{OBJECT_PREFIX}{actual_sha}",
                    dsl_refs=refs,
                )
            )
        if not docs:
            raise EvidenceSyncError("EVIDENCE_EMPTY", f"evidence目录无原件：{self.evidence_dir}")
        return docs

    # ── 对象/数据库状态（指纹数据源）──────────────────────────────────────────

    def _object_states(self, docs: list[SyncDoc], *, bucket_exists: bool | None = None) -> list[dict[str, Any]]:
        """对象层状态枚举（只读）。bucket缺失时短路：不逐件stat（零建桶、零上传），
        全部对象记为缺失。"""
        if bucket_exists is None:
            bucket_exists = self.store.bucket_exists()
        states = []
        for doc in docs:
            if bucket_exists:
                exists = self.store.exists(doc.object_key)
                object_sha = sha256_bytes(self.store.get(doc.object_key)) if exists else None
            else:
                exists, object_sha = False, None
            states.append(
                {
                    "docId": doc.doc_id,
                    "bucket": self.bucket,
                    "objectKey": doc.object_key,
                    "size": doc.size,
                    "contentType": doc.mime,
                    "sha256": doc.sha256,
                    "dslRefs": len(doc.dsl_refs),
                    "objectExists": exists,
                    "objectShaMatches": object_sha == doc.sha256 if exists else None,
                }
            )
        return states

    def _db_state(self, docs: list[SyncDoc], conn: Any = None) -> dict[str, dict[str, Any]]:
        if not self.database_url:
            return {}
        import psycopg

        if conn is None:
            with psycopg.connect(self.database_url) as owned:
                return self._db_state(docs, conn=owned)
        state: dict[str, dict[str, Any]] = {}
        for doc in docs:
            fetch = conn.execute(
                "SELECT id FROM rag.fetches WHERE object_key=%s AND content_hash=%s",
                (doc.object_key, doc.sha256),
            ).fetchone()
            version = conn.execute(
                "SELECT id, object_key, status FROM rag.document_versions WHERE content_hash=%s",
                (doc.sha256,),
            ).fetchone()
            state[doc.doc_id] = {
                "fetchRecorded": fetch is not None,
                "versionRecorded": version is not None,
                "versionObjectKey": version[1] if version else None,
            }
        return state

    def _state_fingerprint(
        self, docs: list[SyncDoc], *, assume_applied: bool, conn: Any = None, bucket_exists: bool | None = None
    ) -> str:
        """目标状态指纹：bucket存在性+对象层+RAG登记层的规范化状态hash。
        assume_applied=False→当前真实状态（计划targetFingerprint）；
        assume_applied=True→计划执行后的期望终态（计划finalFingerprint，bucket必存在）。
        conn可传入持锁事务连接（apply锁内重分类），避免并发中间态误判。"""
        db_state = {} if assume_applied else self._db_state(docs, conn=conn)
        # 终态bucket必存在；前置态取真实bucket存在性。
        bucket_flag = True if assume_applied else (self.store.bucket_exists() if bucket_exists is None else bucket_exists)
        entries = []
        for doc in sorted(docs, key=lambda d: d.doc_id):
            if assume_applied:
                obj_exists, obj_match = True, True
                fetch_rec, version_rec = True, True
                version_key: str | None = doc.object_key
            else:
                obj_exists = self.store.exists(doc.object_key) if bucket_flag else False
                obj_match = obj_exists and sha256_bytes(self.store.get(doc.object_key)) == doc.sha256
                st = db_state.get(doc.doc_id, {})
                fetch_rec = bool(st.get("fetchRecorded"))
                version_rec = bool(st.get("versionRecorded"))
                version_key = st.get("versionObjectKey")
            entries.append(
                {
                    "docId": doc.doc_id,
                    "objectKey": doc.object_key,
                    "sha256": doc.sha256,
                    "objectExists": obj_exists,
                    "objectShaMatches": obj_match,
                    "fetchRecorded": fetch_rec,
                    "versionRecorded": version_rec,
                    "versionObjectKey": version_key,
                }
            )
        return _canonical_sha256(
            {"bucket": self.bucket, "bucketExists": bucket_flag, "jurisdiction": self.jurisdiction, "docs": entries}
        )

    def audit(self) -> dict[str, Any]:
        docs = self.collect()
        problems: list[str] = []
        bucket_exists = self.store.bucket_exists()
        if not bucket_exists:
            # 缺桶生命周期：audit零写入——不创建bucket、不上传对象、不修改RAG数据库。
            problems.append(
                f"BUCKET_MISSING: bucket {self.bucket}不存在（audit零写入，不创建bucket；bucket创建属于授权apply的ensure_bucket写入段）"
            )
        objects = self._object_states(docs, bucket_exists=bucket_exists)
        for o in objects:
            if not o["objectExists"]:
                problems.append(f"{o['docId']}: MinIO对象缺失 {o['objectKey']}")
            elif o["objectShaMatches"] is not True:
                problems.append(f"{o['docId']}: MinIO对象SHA漂移 {o['objectKey']}")
        db_state = self._db_state(docs)
        for doc in docs:
            st = db_state.get(doc.doc_id)
            if st is None:
                continue
            if not st["fetchRecorded"]:
                problems.append(f"{doc.doc_id}: rag.fetches记录缺失（object_key={doc.object_key}）")
            if not st["versionRecorded"]:
                problems.append(f"{doc.doc_id}: rag.document_versions记录缺失（content_hash={doc.sha256}）")
            elif st["versionObjectKey"] != doc.object_key:
                problems.append(f"{doc.doc_id}: document_versions.object_key不一致：{st['versionObjectKey']} ≠ {doc.object_key}")
        return {
            "mode": "audit",
            "bucket": self.bucket,
            "bucketExists": bucket_exists,
            "jurisdiction": self.jurisdiction,
            "ok": not problems,
            "problems": problems,
            "docs": [dict(o, **db_state.get(o["docId"], {})) for o in objects],
        }

    # ── 确定性计划（fresh授权apply的不可变输入）──────────────────────────────

    def build_plan(self) -> dict[str, Any]:
        """确定性计划：schema/version、codeSha、jurisdiction、bucket、bucket状态与建桶意图、
        evidence/manifest hash、当前MinIO+RAG目标状态指纹与期望终态指纹、完整对象清单、
        计划上传/登记/noop集合、规范化planHash。同状态重复生成逐字节一致；
        bucket缺失时仍只读生成计划（plannedBucketCreate=true，plan后bucket仍不存在）。"""
        if not self.database_url:
            raise EvidenceSyncError("USAGE", "build_plan需要数据库连接：完整plan必须绑定RAG目标状态指纹")
        docs = self.collect()
        head = git_head()
        bucket_exists = self.store.bucket_exists()
        objects = self._object_states(docs, bucket_exists=bucket_exists)
        db_state = self._db_state(docs)
        planned_uploads = [o["docId"] for o in objects if not o["objectExists"]]
        conflicts = [o["docId"] for o in objects if o["objectExists"] and o["objectShaMatches"] is not True]
        planned_fetches = [doc.doc_id for doc in docs if not db_state.get(doc.doc_id, {}).get("fetchRecorded", True)]
        planned_versions = [doc.doc_id for doc in docs if not db_state.get(doc.doc_id, {}).get("versionRecorded", True)]
        noop_objects = [o["docId"] for o in objects if o["objectExists"] and o["objectShaMatches"] is True]
        body: dict[str, Any] = {
            "schema": PLAN_SCHEMA,
            "algorithmVersion": EVIDENCE_SYNC_ALGORITHM_VERSION,
            "codeSha": head["sha"],
            "jurisdiction": self.jurisdiction,
            "bucket": self.bucket,
            "bucketExists": bucket_exists,
            "plannedBucketCreate": not bucket_exists,
            "evidenceManifestHash": evidence_manifest_hash(docs),
            "targetFingerprint": self._state_fingerprint(docs, assume_applied=False, bucket_exists=bucket_exists),
            "finalFingerprint": self._state_fingerprint(docs, assume_applied=True),
            "objectCount": len(docs),
            "objects": objects,
            "plannedUploads": planned_uploads,
            "plannedFetches": planned_fetches,
            "plannedVersions": planned_versions,
            "noopObjects": noop_objects,
            "conflicts": conflicts,
        }
        return {**body, "planHash": plan_hash_of(body)}

    # ── apply：fresh授权绑定 + 零写入前置校验 + 幂等上传/登记 ─────────────────

    def apply(
        self,
        plan: dict[str, Any],
        *,
        plan_hash: str,
        target_fingerprint: str,
        i_am_authorized: bool,
        inject_failure_at: str | None = None,
    ) -> dict[str, Any]:
        """按不可变计划执行。任何校验失败（授权/hash/指纹/codeSha/工作树/证据漂移/
        目标状态漂移）均零写入拒绝；状态已达计划终态→幂等noop。"""
        if not self.database_url:
            raise EvidenceSyncError("USAGE", "apply需要数据库连接：完整apply必须绑定RAG目标状态")
        if not i_am_authorized:
            raise EvidenceSyncError("AUTH_REQUIRED", "apply需要显式fresh授权参数 --i-am-authorized（环境开关不能替代）")
        structure_problems = verify_plan_structure(plan)
        if structure_problems:
            raise EvidenceSyncError("PLAN_INVALID", "计划结构校验失败：" + "；".join(structure_problems[:5]))
        recomputed = plan_hash_of(plan)
        if plan_hash != plan.get("planHash") or plan_hash != recomputed:
            raise EvidenceSyncError("PLAN_HASH_MISMATCH", f"planHash不一致：参数{plan_hash} 计划{plan.get('planHash')} 重算{recomputed}")
        if target_fingerprint != plan.get("targetFingerprint"):
            raise EvidenceSyncError("FINGERPRINT_MISMATCH", f"targetFingerprint不一致：参数{target_fingerprint} ≠ 计划{plan.get('targetFingerprint')}")
        head = git_head()
        if head["sha"] != plan.get("codeSha"):
            raise EvidenceSyncError(
                "CODE_SHA_MISMATCH",
                f"当前HEAD {head['sha']} ≠ 计划codeSha {plan.get('codeSha')}（重新plan以绑定当前代码）",
            )
        if head["dirty"] and os.environ.get("RAG_EVIDENCE_ALLOW_DIRTY") != "1":
            raise EvidenceSyncError("DIRTY_WORKTREE", "工作树存在未提交改动：apply拒绝（隔离演练可显式RAG_EVIDENCE_ALLOW_DIRTY=1）")

        # 证据与目标状态必须与计划生成时一致（计划不可变，状态漂移→重新plan）。
        docs = self.collect()
        if evidence_manifest_hash(docs) != plan.get("evidenceManifestHash"):
            raise EvidenceSyncError(
                "EVIDENCE_DRIFT",
                f"evidence在plan后漂移：现{evidence_manifest_hash(docs)[:16]}… ≠ 计划{str(plan.get('evidenceManifestHash'))[:16]}…（重新plan）",
            )
        current = self._state_fingerprint(docs, assume_applied=False)
        state = classify_target_state(current, plan["targetFingerprint"], plan["finalFingerprint"])
        if state == "noop":
            report = self.verify()
            if not report["ok"]:
                raise EvidenceSyncError("APPLY_VERIFY_FAILED", "noop终态verify未通过：" + "；".join(report["problems"][:5]))
            return {
                "mode": "apply",
                "applied": False,
                "noop": True,
                "planHash": plan["planHash"],
                "bucketCreated": False,
                "uploaded": 0,
                "noopObjects": len(docs),
                "fetches": 0,
                "versions": 0,
                "manifest": [],
                "verified": True,
            }

        # pending或乐观drift都进入持锁段：advisory锁串行化并发apply后重分类——
        # 另一apply的中间态（对象已上传、登记未提交）在锁内表现为终态→noop，而非误判漂移；
        # 锁内仍为漂移→零写入拒绝。上传与RAG登记在同一持锁事务内完成。
        import psycopg

        assert self.database_url is not None
        with psycopg.connect(self.database_url) as conn, conn.transaction():
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (ADVISORY_LOCK_KEY,))
            locked_current = self._state_fingerprint(docs, assume_applied=False, conn=conn)
            state = classify_target_state(locked_current, plan["targetFingerprint"], plan["finalFingerprint"])
            if state == "drift":
                raise EvidenceSyncError(
                    "TARGET_STATE_DRIFT",
                    f"MinIO/RAG目标状态在plan后漂移：现{locked_current[:16]}… 既非计划前置{plan['targetFingerprint'][:16]}…也非终态（零写入拒绝，请重新plan）",
                )
            if state == "noop":
                return {
                    "mode": "apply",
                    "applied": False,
                    "noop": True,
                    "planHash": plan["planHash"],
                    "bucketCreated": False,
                    "uploaded": 0,
                    "noopObjects": len(docs),
                    "fetches": 0,
                    "versions": 0,
                    "manifest": [],
                    "verified": True,
                }
            # pending：冲突对象先拒绝（禁止覆盖），再显式建桶（仅授权写入段）+幂等上传+登记。
            conflicts = [o for o in self._object_states(docs) if o["objectExists"] and o["objectShaMatches"] is not True]
            if conflicts:
                raise EvidenceSyncError(
                    "OBJECT_CONFLICT",
                    "MinIO已存在同键不同内容对象，禁止覆盖：" + "；".join(f"{o['docId']}:{o['objectKey']}" for o in conflicts),
                )
            # 缺桶生命周期：bucket创建发生在全部fresh授权校验通过并取得advisory锁之后的
            # 显式ensure_bucket写入段；计划未声明plannedBucketCreate而bucket缺失属状态漂移。
            bucket_created = False
            if not self.store.bucket_exists():
                if not plan.get("plannedBucketCreate"):
                    raise EvidenceSyncError(
                        "TARGET_STATE_DRIFT",
                        f"bucket {self.bucket}缺失但计划未声明plannedBucketCreate：计划与MinIO状态不一致（重新plan）",
                    )
                self.store.ensure_bucket()
                bucket_created = True
            uploaded = 0
            noop = 0
            for doc in docs:
                if self.store.exists(doc.object_key):
                    noop += 1
                else:
                    self.store.put(doc.object_key, doc.artifact.read_bytes(), doc.mime)
                    uploaded += 1
            if inject_failure_at == "after_uploads":
                raise EvidenceSyncError("INJECTED_FAILURE", "演练注入：after_uploads（对象已上传、RAG未登记）")
            manifest, new_fetches, new_versions = self._register(docs, conn=conn)
        report = self.verify()
        if not report["ok"]:
            raise EvidenceSyncError("APPLY_VERIFY_FAILED", "apply后verify未通过：" + "；".join(report["problems"][:5]))
        return {
            "mode": "apply",
            "applied": True,
            "noop": False,
            "planHash": plan["planHash"],
            "bucketCreated": bucket_created,
            "uploaded": uploaded,
            "noopObjects": noop,
            "fetches": new_fetches,
            "versions": new_versions,
            "manifest": manifest,
            "verified": True,
        }

    def _register(self, docs: list[SyncDoc], conn: Any = None) -> tuple[list[dict[str, Any]], int, int]:
        import psycopg

        if conn is None:
            assert self.database_url is not None, "apply已校验database_url"
            with psycopg.connect(self.database_url) as owned, owned.transaction():
                return self._register(docs, conn=owned)
        # 任务专属advisory锁：并发apply串行化，锁内复查避免重复rag记录。
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (ADVISORY_LOCK_KEY,))
        manifest: list[dict[str, Any]] = []
        new_fetches = 0
        new_versions = 0
        source_ids: dict[str, int] = {}
        for doc in docs:
            domain = doc.meta.get("finalUrl") or doc.meta.get("officialUrl") or ""
            host = re.sub(r"^https?://([^/]+).*$", r"\1", str(domain)) if domain else doc.doc_id
            if host not in source_ids:
                row = conn.execute(
                    "SELECT id FROM rag.sources WHERE domain=%s AND jurisdiction_code=%s ORDER BY id LIMIT 1",
                    (host, self.jurisdiction),
                ).fetchone()
                if row is None:
                    row = conn.execute(
                        """INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain, adapter, frequency, enabled, owner)
                           VALUES (%s,%s,%s,%s,'generic','weekly',true,'rag-evidence-sync') RETURNING id""",
                        (self.jurisdiction, f"{host} 官方政策原件", str(doc.meta.get("officialUrl", "")), host),
                    ).fetchone()
                assert row is not None
                source_ids[host] = int(row[0])
            source_id = source_ids[host]
            url = str(doc.meta.get("officialUrl", ""))
            final_url = doc.meta.get("finalUrl")
            status = doc.meta.get("httpStatus")
            fetch = conn.execute(
                "SELECT id FROM rag.fetches WHERE object_key=%s AND content_hash=%s",
                (doc.object_key, doc.sha256),
            ).fetchone()
            if fetch is None:
                fetch = conn.execute(
                    """INSERT INTO rag.fetches (source_id, url, final_url, status, content_hash, object_key, mime, response_headers, redirects)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (
                        source_id,
                        url,
                        final_url,
                        status,
                        doc.sha256,
                        doc.object_key,
                        doc.headers.get("content-type", doc.mime),
                        json.dumps(doc.headers, ensure_ascii=False),
                        0,
                    ),
                ).fetchone()
                new_fetches += 1
            assert fetch is not None
            version = conn.execute(
                "SELECT id, object_key FROM rag.document_versions WHERE content_hash=%s",
                (doc.sha256,),
            ).fetchone()
            if version is None:
                version = conn.execute(
                    """INSERT INTO rag.document_versions (content_hash, source_id, mime, object_key, status, pipeline_version, jurisdiction_code)
                       VALUES (%s,%s,%s,%s,'downloaded',%s,%s) RETURNING id, object_key""",
                    (doc.sha256, source_id, doc.mime, doc.object_key, PIPELINE_VERSION, self.jurisdiction),
                ).fetchone()
                new_versions += 1
            assert version is not None
            if version[1] != doc.object_key:
                raise EvidenceSyncError(
                    "VERSION_OBJECT_KEY_CONFLICT",
                    f"{doc.doc_id}: document_versions.object_key已存在且指向其他对象（{version[1]}）",
                )
            manifest.append(
                {
                    "docId": doc.doc_id,
                    "bucket": self.bucket,
                    "objectKey": doc.object_key,
                    "size": doc.size,
                    "contentType": doc.mime,
                    "sha256": doc.sha256,
                    "dslRefs": len(doc.dsl_refs),
                    "sourceId": source_id,
                    "fetchId": int(fetch[0]),
                    "documentVersionId": str(version[0]),
                }
            )
        return manifest, new_fetches, new_versions

    # ── verify：范围契约 + 逐对象下载重算SHA + 数据库记录核对 ─────────────────

    def verify(self, object_only: bool = False) -> dict[str, Any]:
        """object_only=False（默认）：完整四方verify——Git原件/meta/DSL已在collect固化，
        此处核对MinIO对象下载SHA与rag.fetches/rag.document_versions记录；缺少数据库时
        必须失败（不得返回ok:true）。object_only=True：显式降级为仅对象层，
        结果带verificationScope="object-only"/degraded=True/dbChecked=False标记。
        bucket缺失：对象层报BUCKET_MISSING且ok=false（零建桶），不隐式创建bucket。"""
        docs = self.collect()
        problems: list[str] = []
        manifest: list[dict[str, Any]] = []
        bucket_exists = self.store.bucket_exists()
        if not bucket_exists:
            problems.append(
                f"BUCKET_MISSING: bucket {self.bucket}不存在（verify零写入，不创建bucket；bucket创建属于授权apply的ensure_bucket写入段）"
            )
        for doc in docs:
            key = doc.object_key
            if bucket_exists:
                if not self.store.exists(key):
                    problems.append(f"{doc.doc_id}: MinIO对象缺失 {key}")
                else:
                    actual = sha256_bytes(self.store.get(key))
                    if actual != doc.sha256:
                        problems.append(f"{doc.doc_id}: MinIO对象下载后SHA漂移：{actual} ≠ {doc.sha256}")
            if not object_only:
                if self.database_url is None:
                    problems.append(
                        f"{doc.doc_id}: 完整verify需要数据库连接：缺少database_url，无法核对rag.fetches/rag.document_versions（不得作为四方验收通过）"
                    )
                    continue
                import psycopg

                with psycopg.connect(self.database_url) as conn:
                    version = conn.execute(
                        "SELECT object_key, content_hash, status FROM rag.document_versions WHERE content_hash=%s",
                        (doc.sha256,),
                    ).fetchone()
                    fetch = conn.execute(
                        "SELECT object_key, content_hash FROM rag.fetches WHERE object_key=%s AND content_hash=%s",
                        (key, doc.sha256),
                    ).fetchone()
                    cross = conn.execute(
                        """SELECT count(*)::int FROM rag.fetches f
                           JOIN rag.document_versions v ON v.content_hash = %s AND f.object_key <> v.object_key
                           WHERE f.content_hash = %s""",
                        (doc.sha256, doc.sha256),
                    ).fetchone()
                if version is None:
                    problems.append(f"{doc.doc_id}: rag.document_versions记录缺失（content_hash={doc.sha256}）")
                else:
                    if version[0] != key:
                        problems.append(f"{doc.doc_id}: document_versions.object_key不一致：{version[0]} ≠ {key}")
                    if version[1] != doc.sha256:
                        problems.append(f"{doc.doc_id}: 数据库content_hash漂移：{version[1]} ≠ 对象SHA {doc.sha256}")
                if fetch is None:
                    problems.append(f"{doc.doc_id}: rag.fetches记录缺失（object_key={key}）")
                if cross and cross[0]:
                    problems.append(f"{doc.doc_id}: fetches.object_key与document_versions.object_key不一致")
            manifest.append(
                {
                    "docId": doc.doc_id,
                    "bucket": self.bucket,
                    "objectKey": key,
                    "size": doc.size,
                    "contentType": doc.mime,
                    "sha256": doc.sha256,
                    "dslRefs": len(doc.dsl_refs),
                }
            )
        return {
            "mode": "verify",
            "verificationScope": "object-only" if object_only else "four-way",
            "degraded": bool(object_only),
            "dbChecked": bool(self.database_url) and not object_only,
            "bucket": self.bucket,
            "bucketExists": bucket_exists,
            "jurisdiction": self.jurisdiction,
            "ok": not problems,
            "problems": problems,
            "objectCount": len(manifest),
            "docs": manifest,
        }


def _build_store(endpoint: str | None, bucket: str) -> Any:
    if not endpoint:
        from .storage import InMemoryObjectStore

        return InMemoryObjectStore()
    from .storage import MinioObjectStore

    access_key = os.environ.get("AGENT_MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.environ.get("AGENT_MINIO_SECRET_KEY", "")
    if not secret_key:
        raise EvidenceSyncError("USAGE", "AGENT_MINIO_SECRET_KEY required when AGENT_MINIO_ENDPOINT is set")
    guard_minio_endpoint(endpoint)
    return MinioObjectStore(endpoint, access_key, secret_key, bucket, os.environ.get("AGENT_MINIO_SECURE", "0") == "1")


def parse_sync_args(argv: list[str]) -> dict[str, Any]:
    """CLI参数解析与授权契约：apply必须绑定--i-am-authorized/--plan-file/--plan-hash/
    --target-fingerprint；完整audit/plan/apply/verify必须提供数据库连接；仅对象层verify
    必须显式--object-only（降级标记）。缺任一即EvidenceSyncError("USAGE")。"""
    mode = argv[0] if argv else None
    if mode not in _MODES:
        raise EvidenceSyncError("USAGE", f"用法：python -m agent.rag.evidence_sync {'|'.join(_MODES)} --evidence-dir <dir> [options]")
    opts: dict[str, Any] = {}
    i = 1
    while i < len(argv):
        tok = argv[i]
        if tok in _FLAG_OPTS:
            opts[tok] = True
            i += 1
            continue
        if tok in _VALUE_OPTS:
            if i + 1 >= len(argv):
                raise EvidenceSyncError("USAGE", f"{tok}缺少取值")
            opts[tok] = argv[i + 1]
            i += 2
            continue
        raise EvidenceSyncError("USAGE", f"未知参数：{tok}")

    evidence_dir = opts.get("--evidence-dir")
    if not evidence_dir:
        raise EvidenceSyncError("USAGE", "缺少 --evidence-dir <dir>")
    database_url = opts.get("--database-url") or os.environ.get("AGENT_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if mode in ("audit", "plan", "apply") and not database_url:
        raise EvidenceSyncError("USAGE", f"{mode}需要数据库连接（--database-url或AGENT_DATABASE_URL/DATABASE_URL）：完整模式必须绑定RAG目标状态")
    if mode == "verify" and not database_url and not opts.get("--object-only"):
        raise EvidenceSyncError(
            "USAGE",
            "verify需要数据库连接进行四方核对；仅对象层检查必须显式--object-only（结果带degraded标记，不作为四方验收通过）",
        )
    args: dict[str, Any] = {
        "mode": mode,
        "evidence_dir": evidence_dir,
        "dsl_root": opts.get("--dsl-root", "dsl/regions"),
        "bucket": opts.get("--bucket", EVIDENCE_BUCKET),
        "jurisdiction": opts.get("--jurisdiction"),
        "endpoint": opts.get("--endpoint", os.environ.get("AGENT_MINIO_ENDPOINT")),
        "database_url": database_url,
        "out": opts.get("--out"),
        "i_am_authorized": bool(opts.get("--i-am-authorized")),
        "object_only": bool(opts.get("--object-only")),
        "plan_file": opts.get("--plan-file"),
        "plan_hash": opts.get("--plan-hash"),
        "target_fingerprint": opts.get("--target-fingerprint"),
    }
    if mode == "apply":
        missing = [
            name
            for name, value in (
                ("--i-am-authorized", args["i_am_authorized"]),
                ("--plan-file", args["plan_file"]),
                ("--plan-hash", args["plan_hash"]),
                ("--target-fingerprint", args["target_fingerprint"]),
            )
            if not value
        ]
        if missing:
            raise EvidenceSyncError("USAGE", "apply需要显式fresh授权绑定：" + "、".join(missing))
    return args


def main(argv: list[str] | None = None) -> int:
    raw = list(argv) if argv is not None else sys.argv[1:]
    try:
        args = parse_sync_args(raw)
    except EvidenceSyncError as err:
        print(f"[evidence-sync] {redact(str(err))}", file=sys.stderr)
        return 2

    def emit(payload: dict[str, Any]) -> None:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.get("out"):
            Path(args["out"]).write_text(text + "\n", encoding="utf-8")
        print(text)

    try:
        if args["bucket"] != EVIDENCE_BUCKET:
            # 先于对象存储连接拒绝：内容寻址原件不进入其他bucket。
            raise EvidenceSyncError("BUCKET_REFUSED", f"bucket必须固定为{EVIDENCE_BUCKET}（收到{args['bucket']}）")
        store = _build_store(args["endpoint"], args["bucket"])
        sync = PolicyEvidenceSync(
            Path(args["evidence_dir"]),
            store,
            bucket=args["bucket"],
            dsl_root=Path(args["dsl_root"]) if args["dsl_root"] else None,
            database_url=args["database_url"],
            jurisdiction=args["jurisdiction"],
        )
        mode = args["mode"]
        if mode == "audit":
            report = sync.audit()
            emit(report)
            return 0 if report["ok"] else 4
        if mode == "plan":
            plan = sync.build_plan()
            emit(plan)
            return 0
        if mode == "apply":
            plan_file = Path(args["plan_file"])
            if not plan_file.is_file():
                raise EvidenceSyncError("PLAN_FILE_MISSING", f"计划文件缺失：{plan_file}")
            plan = json.loads(plan_file.read_text(encoding="utf-8"))
            result = sync.apply(
                plan,
                plan_hash=args["plan_hash"],
                target_fingerprint=args["target_fingerprint"],
                i_am_authorized=args["i_am_authorized"],
            )
            emit(result)
            return 0
        report = sync.verify(object_only=args["object_only"])
        emit(report)
        return 0 if report["ok"] else 5
    except EvidenceSyncError as err:
        print(f"[evidence-sync] {redact(str(err))}", file=sys.stderr)
        usage_codes = ("USAGE", "BUCKET_REFUSED", "REMOTE_ENDPOINT_REFUSED", "PERSISTENT_TARGET_REFUSED", "AUTH_REQUIRED", "DIRTY_WORKTREE")
        return 2 if err.code in usage_codes else 4
    except Exception as err:  # CLI边界统一脱敏，任何未预期错误不回显原始异常细节
        print(f"[evidence-sync] UNEXPECTED: {redact(str(err))}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
