"""受控真实索引CLI（SHV2-FR-029，WI-20260913-01任务2）。

把evidence_sync登记的`downloaded`版本推进为可检索的`indexed`版本：

- 模式：audit（只读对账）/plan（确定性计划）/apply（授权绑定执行）/verify（终态核对）
  /search（固定查询检索冒烟）；
- **计划绑定**：codeSha、全部document versions（id/contentHash/objectKey/mime/status）、
  MinIO对象SHA核对、派生状态指纹（tree/chunks/embeddings完整性）、Embedding模型
  `BAAI/bge-m3`、1024维、indexVersion、planHash、targetFingerprint、finalFingerprint
  与完整派生写集合（同状态两次生成逐字节一致）；
- **fresh授权apply**：显式`--i-am-authorized --plan-file --plan-hash --target-fingerprint`；
  写入前校验计划结构、planHash重算、HEAD==计划codeSha、工作树干净
  （RAG_INDEX_ALLOW_DIRTY仅限隔离演练）、当前派生状态==计划前置指纹（漂移零写入拒绝）；
  并发apply经任务专属advisory锁串行化并在锁内重分类；
- **索引行为**：从MinIO读原件并复核SHA→DocumentTree+Markdown→chunks→真实
  SiliconFlow BAAI/bge-m3 1024维embeddings；每份文档独立数据库事务（清理该版本旧
  派生行→写tree/chunks/embeddings→标记indexed）；当前文档失败整体回滚该文档；
  部分完成后原计划失效（状态介于前置与终态之间→零写入拒绝，必须重新plan）；
  完整终态复跑返回noop；
- **IngestService配套**（pipeline.py）：dedup命中downloaded/parsed版本不得返回伪
  indexed；只有派生索引完整才返回indexed；
- **endpoint守卫**：9001（Console）或含`/login`的endpoint稳定拒绝；远程endpoint默认
  拒绝（复用evidence_sync.guard_minio_endpoint）；目标库名`policyops`默认拒绝
  （RAG_INDEX_ALLOW_PERSISTENT=1仅限fresh授权）；
- 输出不含凭据（连接串口令统一redact）、不含完整向量。
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .evidence_sync import EVIDENCE_BUCKET, canonical_json, classify_target_state, git_head, redact
from .siliconflow import SiliconFlowClient
from .storage import ObjectStore

INDEX_ALGORITHM_VERSION = "RAG-EVIDENCE-INDEX-1.0"
INDEX_PLAN_SCHEMA = "rag-evidence-index-plan/1.0"
EMBEDDING_MODEL = "BAAI/bge-m3"
EMBEDDING_DIMENSIONS = 1024
PARSE_PIPELINE_VERSION = "rag-parse-v1"
INDEX_VERSION = f"{EMBEDDING_MODEL}:{EMBEDDING_DIMENSIONS}"
_PERSISTENT_DB = "policyops"
_MODES = ("audit", "plan", "apply", "verify", "search")
# 任务专属advisory锁键（sha256("rag-evidence-index")前8字节的有符号bigint）。
ADVISORY_LOCK_KEY = int.from_bytes(hashlib.sha256(b"rag-evidence-index").digest()[:8], "big", signed=True)
_EMBED_BATCH = 32
_FLAG_OPTS = {"--i-am-authorized"}
_VALUE_OPTS = (
    "--database-url",
    "--endpoint",
    "--bucket",
    "--out",
    "--plan-file",
    "--plan-hash",
    "--target-fingerprint",
    "--query",
    "--jurisdiction",
    "--as-of",
    "--top-k",
)


class EvidenceIndexError(RuntimeError):
    """受控索引失败（code前缀进入消息，便于CLI输出与测试断言）。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def canonical_sha256(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def plan_hash_of(plan: dict[str, Any]) -> str:
    """planHash：对除planHash自身外的计划体规范化JSON计算SHA-256。"""
    body = {k: v for k, v in plan.items() if k != "planHash"}
    return canonical_sha256(body)


def classify_index_state(current: str, target: str, final: str) -> str:
    """pending=与计划前置状态一致可执行；noop=已达计划终态；其余=漂移（零写入拒绝）。"""
    return classify_target_state(current, target, final)


def guard_index_endpoint(endpoint: str) -> str:
    """索引endpoint守卫：9001（Console）或含`/login`的endpoint稳定拒绝（不得回退9000）；
    仅接受host:port形式；远程host默认拒绝（复用同步守卫）。"""
    lowered = endpoint.strip().lower()
    host_port = lowered.split("/", 1)[0]
    if "9001" in lowered and host_port.endswith(":9001"):
        raise EvidenceIndexError(
            "INDEX_ENDPOINT_REFUSED",
            f"endpoint {endpoint} 是MinIO Console端口（9001）：S3 API仅允许9000，不得回退",
        )
    if "/login" in lowered:
        raise EvidenceIndexError(
            "INDEX_ENDPOINT_REFUSED",
            f"endpoint {endpoint} 含/login路径（Console登录页）：不得作为S3 API endpoint",
        )
    if "://" in lowered or "/" in lowered:
        raise EvidenceIndexError("INDEX_ENDPOINT_REFUSED", f"endpoint必须为host:port形式（收到{endpoint}）")
    if host_port.endswith(":9001"):
        raise EvidenceIndexError(
            "INDEX_ENDPOINT_REFUSED",
            f"endpoint {endpoint} 是MinIO Console端口（9001）：S3 API仅允许9000，不得回退",
        )
    host = host_port.rsplit(":", 1)[0]
    if host != "minio":  # minio:9000是Compose内部S3 API名（SHV2-FR-028）
        from .evidence_sync import guard_minio_endpoint

        guard_minio_endpoint(endpoint)
    return endpoint


@dataclass
class IndexDoc:
    """一个待索引document version的解析结果与派生状态。"""

    version_id: str
    content_hash: str
    object_key: str
    mime: str
    status: str
    jurisdiction_code: str | None
    object_exists: bool = False
    object_sha_matches: bool | None = None
    tree_exists: bool = False
    chunk_count: int = 0
    embedding_count: int = 0
    bad_embedding_count: int = 0

    @property
    def derived_complete(self) -> bool:
        return (
            self.status == "indexed"
            and self.tree_exists
            and self.chunk_count > 0
            and self.embedding_count == self.chunk_count
            and self.bad_embedding_count == 0
        )


def verify_index_plan_structure(plan: dict[str, Any]) -> list[str]:
    """计划正文结构校验（读取侧）：schema/版本/必需键/hash形状/清单完整性。"""
    problems: list[str] = []
    if plan.get("schema") != INDEX_PLAN_SCHEMA:
        problems.append(f"schema {plan.get('schema')!r} ≠ {INDEX_PLAN_SCHEMA}")
    if plan.get("algorithmVersion") != INDEX_ALGORITHM_VERSION:
        problems.append(f"algorithmVersion {plan.get('algorithmVersion')!r} ≠ {INDEX_ALGORITHM_VERSION}")
    if plan.get("bucket") != EVIDENCE_BUCKET:
        problems.append(f"bucket {plan.get('bucket')!r} ≠ {EVIDENCE_BUCKET}")
    if plan.get("embeddingModel") != EMBEDDING_MODEL:
        problems.append(f"embeddingModel {plan.get('embeddingModel')!r} ≠ {EMBEDDING_MODEL}")
    if plan.get("embeddingDimensions") != EMBEDDING_DIMENSIONS:
        problems.append(f"embeddingDimensions {plan.get('embeddingDimensions')!r} ≠ {EMBEDDING_DIMENSIONS}")
    if plan.get("indexVersion") != INDEX_VERSION:
        problems.append(f"indexVersion {plan.get('indexVersion')!r} ≠ {INDEX_VERSION}")
    code_sha = plan.get("codeSha")
    if not isinstance(code_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", code_sha):
        problems.append("codeSha非法（需40位hex）")
    for key in ("targetFingerprint", "finalFingerprint", "planHash"):
        value = plan.get(key)
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            problems.append(f"{key}非法（需64位hex）")
    documents = plan.get("documents")
    if not isinstance(documents, list) or not documents:
        problems.append("documents清单缺失或为空")
    else:
        ids = [d.get("documentVersionId") for d in documents if isinstance(d, dict)]
        if len(ids) != len(documents) or len(set(ids)) != len(ids):
            problems.append("documents清单versionId重复或形状非法")
        for d in documents:
            if not isinstance(d, dict) or not isinstance(d.get("objectKey"), str):
                problems.append("documents条目缺objectKey")
                break
    for key in ("plannedIndex", "noopDocuments", "conflicts", "writeSet"):
        if not isinstance(plan.get(key), list):
            problems.append(f"{key}缺失（需列表）")
    return problems


class PolicyEvidenceIndex:
    """受控幂等真实索引（audit/plan/apply/verify/search共用一个枚举与校验核心）。"""

    def __init__(
        self,
        database_url: str,
        store: ObjectStore,
        client: SiliconFlowClient,
        *,
        bucket: str = EVIDENCE_BUCKET,
    ) -> None:
        if bucket != EVIDENCE_BUCKET:
            raise EvidenceIndexError(
                "BUCKET_REFUSED",
                f"bucket必须固定为{EVIDENCE_BUCKET}（收到{bucket}）：派生索引只服务内容寻址原件bucket",
            )
        self._guard_database(database_url)
        self.database_url = database_url
        self.store = store
        self.bucket = bucket
        self.client = client
        self.index_version = getattr(client, "index_version", INDEX_VERSION)
        if self.client.embedding_model != EMBEDDING_MODEL or self.client.embedding_dimensions != EMBEDDING_DIMENSIONS:
            raise EvidenceIndexError(
                "MODEL_MISMATCH",
                f"Embedding模型/维度必须为{EMBEDDING_MODEL}/{EMBEDDING_DIMENSIONS}"
                f"（收到{self.client.embedding_model}/{self.client.embedding_dimensions}）",
            )

    @staticmethod
    def _guard_database(database_url: str) -> None:
        from psycopg import conninfo

        dbname = conninfo.conninfo_to_dict(database_url).get("dbname", "")
        if dbname == _PERSISTENT_DB and os.environ.get("RAG_INDEX_ALLOW_PERSISTENT") != "1":
            raise EvidenceIndexError(
                "PERSISTENT_TARGET_REFUSED",
                "目标库名为policyops：持久RAG数据库默认拒绝；需用户fresh授权并显式RAG_INDEX_ALLOW_PERSISTENT=1",
            )

    # ── 枚举与派生状态（只读）────────────────────────────────────────────────

    def collect(self) -> list[IndexDoc]:
        import psycopg

        with psycopg.connect(self.database_url) as conn:
            rows = conn.execute(
                "SELECT id, content_hash, object_key, mime, status, jurisdiction_code "
                "FROM rag.document_versions ORDER BY content_hash"
            ).fetchall()
        if not rows:
            raise EvidenceIndexError("NO_DOCUMENT_VERSIONS", "rag.document_versions为空：先执行evidence_sync apply登记原件")
        bucket_exists = self.store.bucket_exists()
        docs: list[IndexDoc] = []
        for version_id, content_hash, object_key, mime, status, jurisdiction in rows:
            object_exists = False
            object_sha_matches: bool | None = None
            if bucket_exists:
                object_exists = self.store.exists(object_key)
                object_sha_matches = (
                    sha256_bytes(self.store.get(object_key)) == content_hash if object_exists else None
                )
            tree_exists = False
            chunk_count = 0
            embedding_count = 0
            bad_embedding_count = 0
            with psycopg.connect(self.database_url) as conn:
                row = conn.execute(
                    """SELECT
                         EXISTS(SELECT 1 FROM rag.document_trees WHERE document_version_id=%s),
                         (SELECT count(*) FROM rag.chunks WHERE document_version_id=%s),
                         (SELECT count(*) FROM rag.embeddings e JOIN rag.chunks c ON c.id=e.chunk_id
                           WHERE c.document_version_id=%s),
                         (SELECT count(*) FROM rag.embeddings e JOIN rag.chunks c ON c.id=e.chunk_id
                           WHERE c.document_version_id=%s
                             AND (e.model<>%s OR e.dimensions<>%s OR e.index_version<>%s OR e.embedding IS NULL))
                       """,
                    (version_id, version_id, version_id, version_id, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, INDEX_VERSION),
                ).fetchone()
            if row is not None:
                tree_exists, chunk_count, embedding_count, bad_embedding_count = (
                    bool(row[0]),
                    int(row[1]),
                    int(row[2]),
                    int(row[3]),
                )
            docs.append(
                IndexDoc(
                    version_id=str(version_id),
                    content_hash=content_hash,
                    object_key=object_key,
                    mime=mime,
                    status=status,
                    jurisdiction_code=jurisdiction,
                    object_exists=object_exists,
                    object_sha_matches=object_sha_matches,
                    tree_exists=tree_exists,
                    chunk_count=chunk_count,
                    embedding_count=embedding_count,
                    bad_embedding_count=bad_embedding_count,
                )
            )
        return docs

    def _bucket_state(self) -> bool:
        return self.store.bucket_exists()

    def _state_entries(self, docs: list[IndexDoc], *, force_complete: bool) -> list[dict[str, Any]]:
        entries = []
        for doc in sorted(docs, key=lambda d: d.content_hash):
            entries.append(
                {
                    "documentVersionId": doc.version_id,
                    "contentHash": doc.content_hash,
                    "objectKey": doc.object_key,
                    "indexedComplete": True if force_complete else doc.derived_complete,
                }
            )
        return entries

    def _state_fingerprint(self, docs: list[IndexDoc], *, force_complete: bool, bucket_exists: bool) -> str:
        """派生状态指纹：bucket存在性+模型/维度/indexVersion+每版本完整性的规范化hash。
        force_complete=False→当前真实状态（计划targetFingerprint）；
        force_complete=True→计划执行后的期望终态（计划finalFingerprint）。"""
        return canonical_sha256(
            {
                "bucket": self.bucket,
                "bucketExists": bucket_exists,
                "embeddingModel": EMBEDDING_MODEL,
                "embeddingDimensions": EMBEDDING_DIMENSIONS,
                "indexVersion": INDEX_VERSION,
                "docs": self._state_entries(docs, force_complete=force_complete),
            }
        )

    # ── audit / verify（只读对账）────────────────────────────────────────────

    def _state_report(self, mode: str) -> dict[str, Any]:
        docs = self.collect()
        problems: list[str] = []
        bucket_exists = self._bucket_state()
        if not bucket_exists:
            problems.append(
                f"BUCKET_MISSING: bucket {self.bucket}不存在（{mode}零写入，不创建bucket）"
            )
        for doc in docs:
            if bucket_exists and not doc.object_exists:
                problems.append(f"OBJECT_MISSING: {doc.object_key}（{doc.content_hash[:12]}…）")
            elif doc.object_sha_matches is not True:
                problems.append(f"OBJECT_CONFLICT: {doc.object_key} 对象SHA与document_versions.content_hash不一致")
            if not doc.derived_complete:
                problems.append(
                    f"{doc.content_hash[:12]}…: 派生索引不完整"
                    f"（status={doc.status} tree={doc.tree_exists} chunks={doc.chunk_count} "
                    f"embeddings={doc.embedding_count} bad={doc.bad_embedding_count}）"
                )
        return {
            "mode": mode,
            "bucket": self.bucket,
            "bucketExists": bucket_exists,
            "embeddingModel": EMBEDDING_MODEL,
            "embeddingDimensions": EMBEDDING_DIMENSIONS,
            "indexVersion": INDEX_VERSION,
            "documentCount": len(docs),
            "completeCount": sum(1 for d in docs if d.derived_complete),
            "ok": not problems,
            "problems": problems,
            "documents": [
                {
                    "documentVersionId": d.version_id,
                    "contentHash": d.content_hash,
                    "objectKey": d.object_key,
                    "mime": d.mime,
                    "status": d.status,
                    "jurisdictionCode": d.jurisdiction_code,
                    "objectExists": d.object_exists,
                    "objectShaMatches": d.object_sha_matches,
                    "treeExists": d.tree_exists,
                    "chunkCount": d.chunk_count,
                    "embeddingCount": d.embedding_count,
                    "badEmbeddingCount": d.bad_embedding_count,
                    "derivedComplete": d.derived_complete,
                }
                for d in docs
            ],
        }

    def audit(self) -> dict[str, Any]:
        return self._state_report("audit")

    def verify(self) -> dict[str, Any]:
        """终态核对：对象SHA、tree/chunks/embeddings完整性与模型/维度/版本一致性。
        必须连数据库（构造已强制）；任何不完整/漂移均ok=false。"""
        report = self._state_report("verify")
        return report

    # ── 确定性计划（fresh授权apply的不可变输入）──────────────────────────────

    def build_plan(self) -> dict[str, Any]:
        """确定性计划：同状态重复生成逐字节一致。对象缺失/SHA不一致/缺bucket时
        失败关闭（零写入）——索引要求同步终态已达成。"""
        docs = self.collect()
        head = git_head()
        bucket_exists = self._bucket_state()
        if not bucket_exists:
            raise EvidenceIndexError(
                "BUCKET_MISSING",
                f"bucket {self.bucket}不存在：索引要求evidence_sync已完成后执行（先执行同步apply）",
            )
        missing = [d for d in docs if not d.object_exists]
        if missing:
            raise EvidenceIndexError(
                "OBJECT_MISSING",
                "MinIO目标对象缺失：" + "；".join(f"{d.content_hash[:12]}…:{d.object_key}" for d in missing),
            )
        conflicts = [d for d in docs if d.object_sha_matches is not True]
        if conflicts:
            raise EvidenceIndexError(
                "OBJECT_CONFLICT",
                "MinIO对象SHA与document_versions.content_hash不一致：" + "；".join(d.object_key for d in conflicts),
            )
        planned = [d for d in docs if not d.derived_complete]
        noop = [d for d in docs if d.derived_complete]
        documents = [
            {
                "documentVersionId": d.version_id,
                "contentHash": d.content_hash,
                "objectKey": d.object_key,
                "mime": d.mime,
                "status": d.status,
                "jurisdictionCode": d.jurisdiction_code,
                "objectExists": d.object_exists,
                "objectShaMatches": d.object_sha_matches,
                "treeExists": d.tree_exists,
                "chunkCount": d.chunk_count,
                "embeddingCount": d.embedding_count,
                "derivedComplete": d.derived_complete,
            }
            for d in docs
        ]
        write_set = [
            {
                "documentVersionId": d.version_id,
                "objectKey": d.object_key,
                "contentHash": d.content_hash,
                "mime": d.mime,
                "embeddingModel": EMBEDDING_MODEL,
                "embeddingDimensions": EMBEDDING_DIMENSIONS,
                "indexVersion": INDEX_VERSION,
            }
            for d in planned
        ]
        body: dict[str, Any] = {
            "schema": INDEX_PLAN_SCHEMA,
            "algorithmVersion": INDEX_ALGORITHM_VERSION,
            "codeSha": head["sha"],
            "bucket": self.bucket,
            "embeddingModel": EMBEDDING_MODEL,
            "embeddingDimensions": EMBEDDING_DIMENSIONS,
            "indexVersion": INDEX_VERSION,
            "targetFingerprint": self._state_fingerprint(docs, force_complete=False, bucket_exists=bucket_exists),
            "finalFingerprint": self._state_fingerprint(docs, force_complete=True, bucket_exists=True),
            "documentCount": len(docs),
            "documents": documents,
            "plannedIndex": [d.version_id for d in planned],
            "noopDocuments": [d.version_id for d in noop],
            "conflicts": [d.object_key for d in conflicts],
            "writeSet": write_set,
        }
        return {**body, "planHash": plan_hash_of(body)}

    # ── apply：fresh授权绑定 + 单文档事务索引 ─────────────────────────────────

    def apply(
        self,
        plan: dict[str, Any],
        *,
        plan_hash: str,
        target_fingerprint: str,
        i_am_authorized: bool,
        inject_failure_at: str | None = None,
        inject_failure_document: str | None = None,
    ) -> dict[str, Any]:
        """按不可变计划执行索引。任何校验失败（授权/hash/指纹/codeSha/工作树/状态漂移）
        均零写入拒绝；状态已达计划终态→幂等noop；每份文档独立事务，失败只回滚当前文档。"""
        if not i_am_authorized:
            raise EvidenceIndexError("AUTH_REQUIRED", "apply需要显式fresh授权参数 --i-am-authorized（环境开关不能替代）")
        structure_problems = verify_index_plan_structure(plan)
        if structure_problems:
            raise EvidenceIndexError("PLAN_INVALID", "计划结构校验失败：" + "；".join(structure_problems[:5]))
        recomputed = plan_hash_of(plan)
        if plan_hash != plan.get("planHash") or plan_hash != recomputed:
            raise EvidenceIndexError(
                "PLAN_HASH_MISMATCH",
                f"planHash不一致：参数{plan_hash} 计划{plan.get('planHash')} 重算{recomputed}",
            )
        if target_fingerprint != plan.get("targetFingerprint"):
            raise EvidenceIndexError(
                "FINGERPRINT_MISMATCH",
                f"targetFingerprint不一致：参数{target_fingerprint} ≠ 计划{plan.get('targetFingerprint')}",
            )
        head = git_head()
        if head["sha"] != plan.get("codeSha"):
            raise EvidenceIndexError(
                "CODE_SHA_MISMATCH",
                f"当前HEAD {head['sha']} ≠ 计划codeSha {plan.get('codeSha')}（重新plan以绑定当前代码）",
            )
        if head["dirty"] and os.environ.get("RAG_INDEX_ALLOW_DIRTY") != "1":
            raise EvidenceIndexError("DIRTY_WORKTREE", "工作树存在未提交改动：apply拒绝（隔离演练可显式RAG_INDEX_ALLOW_DIRTY=1）")
        if not self._bucket_state():
            raise EvidenceIndexError("BUCKET_MISSING", f"bucket {self.bucket}不存在：索引apply要求同步终态已达成")

        import psycopg

        # autocommit连接+会话级advisory锁：每份文档的conn.transaction()是独立事务，
        # 单文档失败只回滚当前文档（此前文档保持已提交）；psycopg3的
        # `with connect()`外层事务会把内部transaction()降级为savepoint，不能使用。
        conn = psycopg.connect(self.database_url, autocommit=True)
        try:
            conn.execute("SELECT pg_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
            docs = self.collect()
            planned_ids = {d for d in plan.get("plannedIndex", []) if isinstance(d, str)}
            current = self._state_fingerprint(docs, force_complete=False, bucket_exists=True)
            state = classify_index_state(current, plan["targetFingerprint"], plan["finalFingerprint"])
            if state == "noop":
                conn.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
                report = self.verify()
                if not report["ok"]:
                    raise EvidenceIndexError("APPLY_VERIFY_FAILED", "noop终态verify未通过：" + "；".join(report["problems"][:5]))
                return {
                    "mode": "apply",
                    "applied": False,
                    "noop": True,
                    "planHash": plan["planHash"],
                    "indexedVersions": [],
                    "verified": True,
                }
            if state == "drift":
                raise EvidenceIndexError(
                    "INDEX_STATE_DRIFT",
                    f"派生索引状态在plan后漂移：现{current[:16]}… 既非计划前置{plan['targetFingerprint'][:16]}…"
                    "也非终态（零写入拒绝；部分完成后必须重新plan）",
                )
            # pending：逐文档独立事务索引（会话锁内串行化）。
            by_id = {d.version_id: d for d in docs}
            indexed_versions: list[str] = []
            for doc_id in plan["plannedIndex"]:
                if doc_id not in planned_ids:
                    raise EvidenceIndexError("PLAN_INVALID", f"plannedIndex条目形状非法：{doc_id!r}")
                doc = by_id.get(doc_id)
                if doc is None:
                    raise EvidenceIndexError("INDEX_STATE_DRIFT", f"计划中的document version已不存在：{doc_id}")
                if doc.derived_complete:
                    continue  # 锁内重分类：并发另一方已完成的文档直接跳过
                if inject_failure_at == "embed" and inject_failure_document == doc_id:
                    raise EvidenceIndexError(
                        "INJECTED_FAILURE",
                        f"演练注入：embed阶段失败（documentVersionId={doc_id}；此前文档已独立提交）",
                    )
                self._index_single_document(doc, conn)
                indexed_versions.append(doc_id)
        finally:
            # 会话锁释放失败仅发生在连接已失效时——连接关闭后锁必然随之释放。
            with contextlib.suppress(Exception):
                conn.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
            conn.close()

        report = self.verify()
        if not report["ok"]:
            raise EvidenceIndexError("APPLY_VERIFY_FAILED", "apply后verify未通过：" + "；".join(report["problems"][:5]))
        return {
            "mode": "apply",
            "applied": True,
            "noop": False,
            "planHash": plan["planHash"],
            "indexedVersions": indexed_versions,
            "verified": True,
        }

    # ── 单文档索引（独立事务：清理旧派生行→tree/chunks/embeddings→indexed）────

    def _index_single_document(self, doc: IndexDoc, conn: Any) -> None:
        """从MinIO读原件并复核SHA→解析→分片→嵌入→单事务写入并标记indexed。
        任一步失败由调用方的conn.transaction()回滚当前文档（此前文档保持已提交）。"""
        content = self.store.get(doc.object_key)
        actual_sha = sha256_bytes(content)
        if actual_sha != doc.content_hash:
            raise EvidenceIndexError(
                "OBJECT_CONFLICT",
                f"{doc.object_key}: MinIO对象SHA漂移：{actual_sha} ≠ {doc.content_hash}（失败关闭，不索引漂移对象）",
            )
        from .chunker import chunk_document
        from .document_tree import parse_by_mime
        from .pipeline import tree_to_markdown

        parsed = parse_by_mime(doc.mime, doc.object_key, content)
        markdown = tree_to_markdown(parsed.tree)
        chunks = chunk_document(parsed.tree, doc.version_id, parsed.pipeline_version)
        if not chunks:
            raise EvidenceIndexError("EMPTY_CHUNKS", f"{doc.object_key}: 分片结果为空（拒绝标记indexed）")
        # 嵌入（批次调用真实/Fake客户端）：维度必须等于声明的1024，否则失败关闭。
        vectors: list[list[float]] = []
        for start in range(0, len(chunks), _EMBED_BATCH):
            batch = [c.text for c in chunks[start : start + _EMBED_BATCH]]
            result = self.client.embed(batch)
            if result["dimensions"] != EMBEDDING_DIMENSIONS:
                raise EvidenceIndexError(
                    "EMBEDDING_DIMENSION_MISMATCH",
                    f"{doc.object_key}: 嵌入维度{result['dimensions']} ≠ {EMBEDDING_DIMENSIONS}",
                )
            vectors.extend(result["_vectors"])
        if len(vectors) != len(chunks):
            raise EvidenceIndexError(
                "EMBEDDING_COUNT_MISMATCH",
                f"{doc.object_key}: 嵌入数量{len(vectors)} ≠ chunks数量{len(chunks)}",
            )
        import jieba

        with conn.transaction():
            # 清理该版本旧派生数据（重索引幂等），写入tree/chunks/embeddings后推进状态。
            conn.execute(
                "DELETE FROM rag.embeddings e USING rag.chunks c WHERE e.chunk_id=c.id AND c.document_version_id=%s",
                (doc.version_id,),
            )
            conn.execute("DELETE FROM rag.chunks WHERE document_version_id=%s", (doc.version_id,))
            conn.execute("DELETE FROM rag.document_trees WHERE document_version_id=%s", (doc.version_id,))
            conn.execute(
                "INSERT INTO rag.document_trees (document_version_id, tree, markdown, pipeline_version) VALUES (%s,%s,%s,%s)",
                (doc.version_id, json.dumps(parsed.tree.to_dict(), ensure_ascii=False), markdown, parsed.pipeline_version),
            )
            for chunk, vector in zip(chunks, vectors, strict=True):
                tokenized = " ".join(jieba.cut_for_search(chunk.text))
                conn.execute(
                    """INSERT INTO rag.chunks (id, document_version_id, parent_chunk_id, path, text, token_count, meta, fts)
                       VALUES (%s,%s,%s,%s,%s,%s,%s, to_tsvector('simple', %s))
                       ON CONFLICT (id) DO NOTHING""",
                    (
                        chunk.chunk_id,
                        doc.version_id,
                        chunk.parent_chunk_id,
                        chunk.path,
                        chunk.text,
                        chunk.token_count,
                        json.dumps(chunk.meta, ensure_ascii=False),
                        tokenized,
                    ),
                )
                vector_literal = "[" + ",".join(repr(float(x)) for x in vector) + "]"
                conn.execute(
                    """INSERT INTO rag.embeddings (chunk_id, model, dimensions, index_version, embedding)
                       VALUES (%s,%s,%s,%s,%s::vector)
                       ON CONFLICT (chunk_id) DO NOTHING""",
                    (chunk.chunk_id, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, INDEX_VERSION, vector_literal),
                )
            updated = conn.execute(
                "UPDATE rag.document_versions SET status='indexed', updated_at=now(), pipeline_version=%s "
                "WHERE id=%s AND status IN ('downloaded','parsed') RETURNING id",
                (PARSE_PIPELINE_VERSION, doc.version_id),
            ).fetchone()
            if updated is None:
                raise EvidenceIndexError(
                    "INDEX_STATE_DRIFT",
                    f"{doc.object_key}: document version状态不允许推进indexed（失败关闭）",
                )

    # ── search（检索冒烟）────────────────────────────────────────────────────

    def search(self, query: str, jurisdiction_code: str, as_of_date: str, top_k: int = 5) -> list[dict[str, Any]]:
        """固定查询检索：混合召回（FTS+向量）→RRF→rerank→审计。仅indexed版本参与。"""
        from .pipeline import RetrievalService

        service = RetrievalService(self.database_url, self.client)
        hits = service.search(query, jurisdiction_code, as_of_date, top_k)
        return [
            {
                "chunkId": h.chunk_id,
                "documentVersionId": h.document_version_id,
                "text": h.text,
                "parentText": h.parent_text,
                "path": h.citation.get("path") if isinstance(h.citation, dict) else None,
                "score": h.score,
                "citation": h.citation,
            }
            for h in hits
        ]


# ── CLI ──────────────────────────────────────────────────────────────────────


def _build_store(endpoint: str | None, bucket: str) -> Any:
    if not endpoint:
        from .storage import InMemoryObjectStore

        return InMemoryObjectStore()
    from .storage import MinioObjectStore

    access_key = os.environ.get("AGENT_MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.environ.get("AGENT_MINIO_SECRET_KEY", "")
    if not secret_key:
        raise EvidenceIndexError("USAGE", "AGENT_MINIO_SECRET_KEY required when AGENT_MINIO_ENDPOINT is set")
    guard_index_endpoint(endpoint)
    return MinioObjectStore(endpoint, access_key, secret_key, bucket, os.environ.get("AGENT_MINIO_SECURE", "0") == "1")


def _build_client() -> SiliconFlowClient:
    return SiliconFlowClient()


def parse_index_args(argv: list[str]) -> dict[str, Any]:
    """CLI参数解析与授权契约：apply必须绑定--i-am-authorized/--plan-file/--plan-hash/
    --target-fingerprint；全部模式必须提供数据库连接；search必须提供query/jurisdiction/
    as-of。缺任一即EvidenceIndexError("USAGE")。"""
    mode = argv[0] if argv else None
    if mode not in _MODES:
        raise EvidenceIndexError("USAGE", f"用法：python -m agent.rag.evidence_index {'|'.join(_MODES)} --database-url <url> [options]")
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
                raise EvidenceIndexError("USAGE", f"{tok}缺少取值")
            opts[tok] = argv[i + 1]
            i += 2
            continue
        raise EvidenceIndexError("USAGE", f"未知参数：{tok}")

    database_url = opts.get("--database-url") or os.environ.get("AGENT_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        raise EvidenceIndexError("USAGE", f"{mode}需要数据库连接（--database-url或AGENT_DATABASE_URL/DATABASE_URL）")
    args: dict[str, Any] = {
        "mode": mode,
        "database_url": database_url,
        "endpoint": opts.get("--endpoint", os.environ.get("AGENT_MINIO_ENDPOINT")),
        "bucket": opts.get("--bucket", EVIDENCE_BUCKET),
        "out": opts.get("--out"),
        "i_am_authorized": bool(opts.get("--i-am-authorized")),
        "plan_file": opts.get("--plan-file"),
        "plan_hash": opts.get("--plan-hash"),
        "target_fingerprint": opts.get("--target-fingerprint"),
        "query": opts.get("--query"),
        "jurisdiction": opts.get("--jurisdiction"),
        "as_of": opts.get("--as-of"),
        "top_k": opts.get("--top-k"),
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
            raise EvidenceIndexError("USAGE", "apply需要显式fresh授权绑定：" + "、".join(missing))
    if mode == "search":
        missing = [
            name
            for name, value in (("--query", args["query"]), ("--jurisdiction", args["jurisdiction"]), ("--as-of", args["as_of"]))
            if not value
        ]
        if missing:
            raise EvidenceIndexError("USAGE", "search需要：" + "、".join(missing))
    return args


def main(argv: list[str] | None = None) -> int:
    raw = list(argv) if argv is not None else sys.argv[1:]
    try:
        args = parse_index_args(raw)
    except EvidenceIndexError as err:
        print(f"[evidence-index] {redact(str(err))}", file=sys.stderr)
        return 2

    def emit(payload: dict[str, Any]) -> None:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.get("out"):
            Path(args["out"]).write_text(text + "\n", encoding="utf-8")
        print(text)

    try:
        if args["bucket"] != EVIDENCE_BUCKET:
            raise EvidenceIndexError("BUCKET_REFUSED", f"bucket必须固定为{EVIDENCE_BUCKET}（收到{args['bucket']}）")
        store = _build_store(args["endpoint"], args["bucket"])
        index = PolicyEvidenceIndex(args["database_url"], store, _build_client(), bucket=args["bucket"])
        mode = args["mode"]
        if mode == "audit":
            report = index.audit()
            emit(report)
            return 0 if report["ok"] else 4
        if mode == "plan":
            plan = index.build_plan()
            emit(plan)
            return 0
        if mode == "apply":
            plan_file = Path(args["plan_file"])
            if not plan_file.is_file():
                raise EvidenceIndexError("PLAN_FILE_MISSING", f"计划文件缺失：{plan_file}")
            plan = json.loads(plan_file.read_text(encoding="utf-8"))
            result = index.apply(
                plan,
                plan_hash=args["plan_hash"],
                target_fingerprint=args["target_fingerprint"],
                i_am_authorized=args["i_am_authorized"],
            )
            emit(result)
            return 0
        if mode == "verify":
            report = index.verify()
            emit(report)
            return 0 if report["ok"] else 5
        hits = index.search(args["query"], args["jurisdiction"], args["as_of"], int(args.get("top_k") or 5))
        emit({"mode": "search", "query": args["query"], "jurisdiction": args["jurisdiction"], "asOf": args["as_of"], "hits": hits})
        return 0
    except EvidenceIndexError as err:
        print(f"[evidence-index] {redact(str(err))}", file=sys.stderr)
        usage_codes = ("USAGE", "BUCKET_REFUSED", "INDEX_ENDPOINT_REFUSED", "PERSISTENT_TARGET_REFUSED", "AUTH_REQUIRED", "DIRTY_WORKTREE")
        return 2 if err.code in usage_codes else 4
    except Exception as err:  # CLI边界统一脱敏，任何未预期错误不回显原始异常细节
        print(f"[evidence-index] UNEXPECTED: {redact(str(err))}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
