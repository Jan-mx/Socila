"""摄取流水线（RAG-FR-002/003/005/008 / 步骤05.1～05.6）与混合检索（步骤05.9/05.10）。

- ingest：抓取（白名单/SSRF/大小限制）→ 哈希去重（AC-005）→ 原件入对象存储 →
  格式解析 → DocumentTree+Markdown → 分片 → 状态机 discovered→downloaded→parsed→indexed。
- 检索：地区/日期/状态过滤 → FTS + 向量 → RRF → rerank → 父条款回填 → 引用组装。
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from typing import Any

from .chunker import chunk_document
from .document_tree import TreeNode, parse_by_mime
from .fetcher import FetchRejected, fetch
from .siliconflow import SiliconFlowClient
from .storage import ObjectStore

MIME_LIMITS = {
    "text/html": 5 * 1024 * 1024,
    "application/pdf": 50 * 1024 * 1024,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 25 * 1024 * 1024,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 20 * 1024 * 1024,
    "application/json": 20 * 1024 * 1024,
    "text/markdown": 10 * 1024 * 1024,
    "text/plain": 10 * 1024 * 1024,
}


def tree_to_markdown(tree: TreeNode) -> str:
    lines: list[str] = []

    def walk(node: TreeNode, depth: int) -> None:
        prefix = "#" * min(depth + 1, 6)
        if node.type in ("chapter", "document") and node.text:
            lines.append(f"{prefix} {node.text}")
        elif node.type == "table":
            lines.append("[表格]")
        elif node.text:
            lines.append(node.text)
        for child in node.children:
            walk(child, depth + 1)

    walk(tree, 0)
    return "\n\n".join(lines)


@dataclass
class IngestResult:
    document_version_id: str
    content_hash: str
    deduplicated: bool
    status: str
    chunk_count: int = 0
    warnings: list[str] = field(default_factory=list)


class IngestService:
    def __init__(self, database_url: str, store: ObjectStore, whitelist: set[str], client: SiliconFlowClient) -> None:
        self._url = database_url
        self._store = store
        self._whitelist = whitelist
        self._client = client

    def _conn(self):
        import psycopg

        return psycopg.connect(self._url)

    def ingest(self, source_id: int, url: str) -> IngestResult:
        """抓取 → 去重 → 存原件 → 解析 → 分片 → 标记 indexed。"""
        size_limit = 10 * 1024 * 1024  # 先按保守上限抓取，落库后再按 MIME 校验。
        result = fetch(url, self._whitelist, max_bytes=size_limit)
        mime_main = result.mime.split(";")[0].strip()
        if len(result.content) > MIME_LIMITS.get(mime_main, size_limit):
            raise FetchRejected(f"payload-too-large-for-mime:{mime_main}")

        conn = self._conn()
        try:
            existing = conn.execute(
                "SELECT id FROM rag.document_versions WHERE content_hash=%s", (result.content_hash,)
            ).fetchone()
            if existing:
                conn.close()
                return IngestResult(
                    document_version_id=str(existing[0]),
                    content_hash=result.content_hash,
                    deduplicated=True,
                    status="indexed",
                )

            object_key = f"originals/{result.content_hash}"
            self._store.put(object_key, result.content, result.mime)
            conn.execute(
                """INSERT INTO rag.fetches (source_id, url, final_url, status, content_hash, object_key, mime, response_headers, redirects)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (source_id, url, result.final_url, result.status, result.content_hash, object_key,
                 result.mime, json.dumps(result.response_headers), result.redirects),
            )
            version_id = conn.execute(
                """INSERT INTO rag.document_versions (content_hash, source_id, mime, object_key, status, pipeline_version)
                   VALUES (%s,%s,%s,%s,'downloaded',%s) RETURNING id""",
                (result.content_hash, source_id, result.mime, object_key, "rag-parse-v1"),
            ).fetchone()[0]

            parsed = parse_by_mime(result.mime, result.final_url, result.content)
            markdown = tree_to_markdown(parsed.tree)
            conn.execute(
                """INSERT INTO rag.document_trees (document_version_id, tree, markdown, pipeline_version)
                   VALUES (%s,%s,%s,%s)""",
                (version_id, json.dumps(parsed.tree.to_dict(), ensure_ascii=False), markdown, parsed.pipeline_version),
            )
            conn.execute("UPDATE rag.document_versions SET status='parsed' WHERE id=%s", (version_id,))
            conn.commit()

            chunks = chunk_document(parsed.tree, str(version_id))
            import jieba

            for chunk in chunks:
                tokenized = " ".join(jieba.cut_for_search(chunk.text))
                conn.execute(
                    """INSERT INTO rag.chunks (id, document_version_id, parent_chunk_id, path, text, token_count, meta, fts)
                       VALUES (%s,%s,%s,%s,%s,%s,%s, to_tsvector('simple', %s))
                       ON CONFLICT (id) DO NOTHING""",
                    (chunk.chunk_id, version_id, chunk.parent_chunk_id, chunk.path, chunk.text,
                     chunk.token_count, json.dumps(chunk.meta, ensure_ascii=False), tokenized),
                )
            conn.execute("UPDATE rag.document_versions SET status='indexed' WHERE id=%s", (version_id,))
            conn.commit()
            return IngestResult(
                document_version_id=str(version_id),
                content_hash=result.content_hash,
                deduplicated=False,
                status="indexed",
                chunk_count=len(chunks),
                warnings=parsed.warnings,
            )
        finally:
            conn.close()


@dataclass
class RetrievalHit:
    chunk_id: str
    text: str
    parent_text: str | None
    document_version_id: str
    score: float
    citation: dict[str, Any]


class RetrievalService:
    """混合检索：过滤 → exact/FTS/向量 → RRF → rerank → 父回填（步骤05.9/05.10）。"""

    def __init__(self, database_url: str, client: SiliconFlowClient) -> None:
        self._url = database_url
        self._client = client

    def _conn(self):
        import psycopg

        return psycopg.connect(self._url)

    def search(
        self,
        query: str,
        jurisdiction_code: str,
        as_of_date: str,
        top_k: int = 5,
    ) -> list[RetrievalHit]:
        conn = self._conn()
        try:
            # 地区/日期/状态过滤：仅当前有效、已 indexed、发布地区匹配的文档参与召回。
            import jieba

            tokenized_query = " ".join(jieba.cut_for_search(query))
            fts_sql = """
                SELECT c.id, c.document_version_id, c.text, c.parent_chunk_id, c.path, s.jurisdiction_code,
                       ts_rank(c.fts, tq.query) AS rank
                FROM rag.chunks c
                CROSS JOIN (SELECT plainto_tsquery('simple', %(q)s) AS query) tq
                JOIN rag.document_versions dv ON dv.id = c.document_version_id
                JOIN rag.sources s ON s.id = dv.source_id
                WHERE dv.status = 'indexed'
                  AND s.jurisdiction_code = %(j)s
                  AND (dv.effective_from IS NULL OR dv.effective_from <= %(d)s)
                  AND (dv.effective_to IS NULL OR dv.effective_to >= %(d)s)
                ORDER BY rank DESC
                LIMIT 20
            """
            params = {"q": query, "j": jurisdiction_code, "d": as_of_date}
            fts_rows = conn.execute(fts_sql, params).fetchall()

            embedding = self._client.embed([query])
            vector_literal = "[" + ",".join(f"{x:.6f}" for x in embedding["_vectors"][0]) + "]"
            dense_sql = """
                SELECT c.id, c.document_version_id, c.text, c.parent_chunk_id, c.path, s.jurisdiction_code,
                       e.embedding <=> %(v)s::vector AS rank
                FROM rag.chunks c
                JOIN rag.embeddings e ON e.chunk_id = c.id
                JOIN rag.document_versions dv ON dv.id = c.document_version_id
                JOIN rag.sources s ON s.id = dv.source_id
                WHERE dv.status = 'indexed'
                  AND s.jurisdiction_code = %(j)s
                  AND (dv.effective_from IS NULL OR dv.effective_from <= %(d)s)
                  AND (dv.effective_to IS NULL OR dv.effective_to >= %(d)s)
                ORDER BY rank
                LIMIT 20
            """
            dense_rows = conn.execute(dense_sql, {**params, "v": vector_literal}).fetchall()
        finally:
            conn.close()

        # RRF 融合（FTS + 向量双通道，k=60）。
        rrf: dict[str, float] = {}
        detail: dict[str, dict[str, Any]] = {}
        for channel in (fts_rows, dense_rows):
            for rank, row in enumerate(channel, start=1):
                chunk_id = row[0]
                rrf[chunk_id] = rrf.get(chunk_id, 0.0) + 1.0 / (60 + rank)
                detail[chunk_id] = {
                    "document_version_id": str(row[1]),
                    "text": row[2],
                    "parent_chunk_id": row[3],
                    "path": row[4],
                }

        # rerank（Fake/真实均可）。
        ordered_ids = sorted(rrf, key=lambda k: -rrf[k])[: max(top_k * 3, 10)]
        reranked = self._client.rerank(query, [detail[i]["text"] for i in ordered_ids], top_n=top_k)
        min_score = float(os.environ.get("RAG_RERANK_MIN_SCORE", "0.2"))
        reranked = [r for r in reranked if float(r["relevance_score"]) >= min_score]
        hits: list[RetrievalHit] = []
        conn = self._conn()
        try:
            for item in reranked:
                chunk_id = ordered_ids[item["index"]]
                info = detail[chunk_id]
                parent_text = None
                if info["parent_chunk_id"]:
                    parent_row = conn.execute(
                        "SELECT text FROM rag.chunks WHERE id=%s", (info["parent_chunk_id"],)
                    ).fetchone()
                    parent_text = parent_row[0] if parent_row else None
                hits.append(
                    RetrievalHit(
                        chunk_id=chunk_id,
                        text=info["text"],
                        parent_text=parent_text,
                        document_version_id=info["document_version_id"],
                        score=float(item["relevance_score"]),
                        citation={
                            "documentVersionId": info["document_version_id"],
                            "path": info["path"],
                            "chunkId": chunk_id,
                        },
                    )
                )
        finally:
            conn.close()

        # 检索审计（含过滤条件与结果摘要）。
        conn = self._conn()
        try:
            conn.execute(
                """INSERT INTO rag.retrieval_audit (query, jurisdiction_code, as_of_date, top_k, candidate_count, result_ids, index_version)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (query, jurisdiction_code, as_of_date, top_k, len(rrf),
                 json.dumps([h.chunk_id for h in hits]), self._client.index_version),
            )
            conn.commit()
        finally:
            conn.close()
        return hits


def content_hash_of(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
