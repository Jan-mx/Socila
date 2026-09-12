"""政策证据受控同步（09-11独立审查问题一，SHV2-FR-002运行时闭环）。

Git审计夹具中的政策原件（original.html/附件 + meta.json + DSL evidence）同步为
运行时对象与RAG元数据：

- bucket固定`policy-originals`；对象键固定`originals/<sha256>`（SHA=原件实际字节SHA-256）；
- 五方映射：Git原件字节、meta.json.sha256、DSL evidence.content_sha256、MinIO对象SHA、
  rag.fetches/rag.document_versions.content_hash 与 object_key 必须一致；
  rag.fetches.object_key 与 rag.document_versions.object_key 指向同一对象；
- 受控模式：audit（只读对账）/plan（输出待上传清单）/apply（幂等上传+登记）/verify（逐对象
  下载重算SHA并核对数据库记录）；
- 幂等：对象已存在且SHA一致→no-op；内容不一致→拒绝覆盖（OBJECT_CONFLICT）；
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

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

EVIDENCE_BUCKET = "policy-originals"
OBJECT_PREFIX = "originals/"
PIPELINE_VERSION = "rag-evidence-sync-1.0"
_PERSISTENT_DB = "policyops"
_LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "::1")


class EvidenceSyncError(RuntimeError):
    """受控同步失败（code用于CLI退出码映射与测试断言）。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def redact(text: str) -> str:
    """连接串/URL口令脱敏：`://user:password@` → `://user:***@`。"""
    return re.sub(r"(://[^:/\s]+:)([^@\s/]+)(@)", r"\1***\3", text)


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

    # ── 对象存储对账 ─────────────────────────────────────────────────────────

    def _object_states(self, docs: list[SyncDoc]) -> list[dict[str, Any]]:
        states = []
        for doc in docs:
            exists = self.store.exists(doc.object_key)
            object_sha = sha256_bytes(self.store.get(doc.object_key)) if exists else None
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

    def _db_state(self, docs: list[SyncDoc]) -> dict[str, dict[str, Any]]:
        if not self.database_url:
            return {}
        import psycopg

        state: dict[str, dict[str, Any]] = {}
        with psycopg.connect(self.database_url) as conn:
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

    def audit(self) -> dict[str, Any]:
        docs = self.collect()
        problems: list[str] = []
        objects = self._object_states(docs)
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
            "jurisdiction": self.jurisdiction,
            "ok": not problems,
            "problems": problems,
            "docs": [dict(o, **db_state.get(o["docId"], {})) for o in objects],
        }

    def plan(self, out_path: Path | None = None) -> dict[str, Any]:
        docs = self.collect()
        objects = self._object_states(docs)
        planned_uploads = [o for o in objects if not o["objectExists"]]
        conflicts = [o for o in objects if o["objectExists"] and o["objectShaMatches"] is not True]
        db_state = self._db_state(docs)
        planned_fetches = [doc.doc_id for doc in docs if not db_state.get(doc.doc_id, {}).get("fetchRecorded", True)]
        planned_versions = [doc.doc_id for doc in docs if not db_state.get(doc.doc_id, {}).get("versionRecorded", True)]
        plan = {
            "mode": "plan",
            "bucket": self.bucket,
            "plannedUploads": planned_uploads,
            "plannedFetches": planned_fetches,
            "plannedVersions": planned_versions,
            "conflicts": conflicts,
            "objectCount": len(objects),
        }
        if out_path:
            out_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return plan

    # ── apply：幂等上传 + 单事务登记 ─────────────────────────────────────────

    def apply(self) -> dict[str, Any]:
        if not self.database_url:
            raise EvidenceSyncError("USAGE", "apply需要数据库连接（--database-url或DATABASE_URL）")
        docs = self.collect()
        conflicts = [o for o in self._object_states(docs) if o["objectExists"] and o["objectShaMatches"] is not True]
        if conflicts:
            raise EvidenceSyncError(
                "OBJECT_CONFLICT",
                "MinIO已存在同键不同内容对象，禁止覆盖：" + "；".join(f"{o['docId']}:{o['objectKey']}" for o in conflicts),
            )
        uploaded = 0
        noop = 0
        for doc in docs:
            if self.store.exists(doc.object_key):
                noop += 1
            else:
                self.store.put(doc.object_key, doc.artifact.read_bytes(), doc.mime)
                uploaded += 1
        manifest, new_fetches, new_versions = self._register(docs)
        report = self.verify()
        if not report["ok"]:
            raise EvidenceSyncError("APPLY_VERIFY_FAILED", "apply后verify未通过：" + "；".join(report["problems"][:5]))
        return {
            "mode": "apply",
            "bucket": self.bucket,
            "uploaded": uploaded,
            "noopObjects": noop,
            "fetches": new_fetches,
            "versions": new_versions,
            "manifest": manifest,
            "verified": True,
        }

    def _register(self, docs: list[SyncDoc]) -> tuple[list[dict[str, Any]], int, int]:
        import psycopg

        assert self.database_url is not None, "apply已校验database_url"
        database_url: str = self.database_url
        manifest: list[dict[str, Any]] = []
        new_fetches = 0
        new_versions = 0
        with psycopg.connect(database_url) as conn, conn.transaction():
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

    # ── verify：逐对象下载重算SHA并核对数据库记录 ─────────────────────────────

    def verify(self) -> dict[str, Any]:
        docs = self.collect()
        problems: list[str] = []
        manifest: list[dict[str, Any]] = []
        for doc in docs:
            key = doc.object_key
            if not self.store.exists(key):
                problems.append(f"{doc.doc_id}: MinIO对象缺失 {key}")
            else:
                actual = sha256_bytes(self.store.get(key))
                if actual != doc.sha256:
                    problems.append(f"{doc.doc_id}: MinIO对象下载后SHA漂移：{actual} ≠ {doc.sha256}")
            if self.database_url:
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
            "bucket": self.bucket,
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m agent.rag.evidence_sync")
    parser.add_argument("mode", choices=["audit", "plan", "apply", "verify"])
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--dsl-root", default="dsl/regions")
    parser.add_argument("--bucket", default=EVIDENCE_BUCKET)
    parser.add_argument("--jurisdiction", default=None)
    parser.add_argument("--endpoint", default=os.environ.get("AGENT_MINIO_ENDPOINT"))
    parser.add_argument("--database-url", default=os.environ.get("AGENT_DATABASE_URL") or os.environ.get("DATABASE_URL"))
    parser.add_argument("--out", default=None, help="plan/manifest输出文件（JSON，不含凭据）")
    args = parser.parse_args(argv)

    def emit(payload: dict[str, Any]) -> None:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.out:
            Path(args.out).write_text(text + "\n", encoding="utf-8")
        print(text)

    try:
        if args.bucket != EVIDENCE_BUCKET:
            # 先于对象存储连接拒绝：内容寻址原件不进入其他bucket。
            raise EvidenceSyncError("BUCKET_REFUSED", f"bucket必须固定为{EVIDENCE_BUCKET}（收到{args.bucket}）")
        store = _build_store(args.endpoint, args.bucket)
        sync = PolicyEvidenceSync(
            Path(args.evidence_dir),
            store,
            bucket=args.bucket,
            dsl_root=Path(args.dsl_root) if args.dsl_root else None,
            database_url=args.database_url,
            jurisdiction=args.jurisdiction,
        )
        if args.mode == "audit":
            report = sync.audit()
            emit(report)
            return 0 if report["ok"] else 4
        if args.mode == "plan":
            emit(sync.plan(Path(args.out) if args.out else None))
            return 0
        if args.mode == "apply":
            emit(sync.apply())
            return 0
        report = sync.verify()
        emit(report)
        return 0 if report["ok"] else 5
    except EvidenceSyncError as err:
        print(f"[evidence-sync] {err.code}: {redact(str(err))}", file=sys.stderr)
        return 2 if err.code in ("USAGE", "BUCKET_REFUSED", "REMOTE_ENDPOINT_REFUSED", "PERSISTENT_TARGET_REFUSED") else 4
    except Exception as err:  # CLI边界统一脱敏，任何未预期错误不回显原始异常细节
        print(f"[evidence-sync] UNEXPECTED: {redact(str(err))}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
