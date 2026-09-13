"""运行时RAG读取面（SHV2-FR-030，WI-20260913-01任务3）。

内部搜索与原件读取的领域实现，供FastAPI`/internal/v1/rag/*`端点装配：

- search：混合检索（FTS+向量→RRF→rerank，仅indexed版本并执行地区/日期/状态过滤）
  后回填来源元数据（sourceName/officialUrl/contentSha256/mime）；
- original：从MinIO读取原件并重新核对对象SHA——未知版本DOCUMENT_NOT_FOUND（404）、
  对象缺失OBJECT_MISSING、SHA漂移OBJECT_SHA_DRIFT（失败关闭）；
- 不返回MinIO endpoint、凭据或预签名URL；附件响应头由API层设置
  （attachment/nosniff/private no-store）。
"""

from __future__ import annotations

from typing import Any

from .pipeline import RetrievalService
from .siliconflow import SiliconFlowClient
from .storage import ObjectStore


class RagRuntimeError(RuntimeError):
    """运行时RAG读取失败（code进入稳定错误体，不携带内部细节）。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


_MIME_EXTENSIONS = {
    "text/html": ".html",
    "application/pdf": ".pdf",
    "application/json": ".json",
    "text/plain": ".txt",
    "text/markdown": ".md",
}


def mime_extension(mime: str) -> str:
    return _MIME_EXTENSIONS.get((mime or "").split(";")[0].strip().lower(), ".bin")


class RagRuntime:
    """内部搜索与原件读取（只读；数据库与对象存储凭据不进入任何输出）。

    client可省略：装配环境可能没有SILICONFLOW_API_KEY（服务启动不得因此失败，
    AC-010只约束JWT Secret）；首次search时才构造真实客户端，缺key在请求时失败关闭。
    """

    def __init__(self, database_url: str, store: ObjectStore, client: SiliconFlowClient | None = None) -> None:
        self._url = database_url
        self._store = store
        self._client = client

    def _search_client(self) -> SiliconFlowClient:
        if self._client is None:
            self._client = SiliconFlowClient()
        return self._client

    def search(self, query: str, jurisdiction_code: str, as_of_date: str, top_k: int = 5) -> dict[str, Any]:
        """混合检索并回填来源元数据。无候选时返回空hits（不调用空文档rerank）。"""
        service = RetrievalService(self._url, self._search_client())
        hits = service.search(query, jurisdiction_code, as_of_date, top_k)
        if not hits:
            return {"hits": [], "candidateCount": 0}
        import psycopg

        version_ids = [h.document_version_id for h in hits]
        metadata: dict[str, dict[str, Any]] = {}
        with psycopg.connect(self._url) as conn:
            rows = conn.execute(
                """SELECT dv.id, dv.content_hash, dv.mime, s.name,
                          (SELECT f.url FROM rag.fetches f
                            WHERE f.content_hash = dv.content_hash AND f.object_key = dv.object_key
                            ORDER BY f.id LIMIT 1) AS official_url
                   FROM rag.document_versions dv
                   JOIN rag.sources s ON s.id = dv.source_id
                   WHERE dv.id = ANY(%s) AND dv.status = 'indexed'""",
                (version_ids,),
            ).fetchall()
        for row in rows:
            metadata[str(row[0])] = {
                "contentSha256": row[1],
                "mime": row[2],
                "sourceName": row[3],
                "officialUrl": row[4],
            }
        out: list[dict[str, Any]] = []
        for hit in hits:
            meta = metadata.get(hit.document_version_id)
            if meta is None:
                # 命中的chunk所属版本在元数据回填时缺失/非indexed：失败关闭，不输出半截来源。
                raise RagRuntimeError(
                    "HIT_METADATA_MISSING",
                    f"命中版本元数据缺失（documentVersionId={hit.document_version_id}）",
                )
            out.append(
                {
                    "chunkId": hit.chunk_id,
                    "documentVersionId": hit.document_version_id,
                    "text": hit.text,
                    "parentText": hit.parent_text,
                    "path": hit.citation.get("path") if isinstance(hit.citation, dict) else None,
                    "score": hit.score,
                    "sourceName": meta["sourceName"],
                    "officialUrl": meta["officialUrl"],
                    "contentSha256": meta["contentSha256"],
                    "mime": meta["mime"],
                }
            )
        return {"hits": out, "candidateCount": len(out)}

    def original(self, document_version_id: str) -> dict[str, Any]:
        """读取登记原件：未知版本404；对象缺失或SHA漂移失败关闭；
        返回字节与响应元数据（不包含MinIO地址/凭据/预签名URL）。"""
        import uuid as _uuid

        # 复审P3-2：非UUID在SQL前拒绝为DOCUMENT_NOT_FOUND（与未知版本同语义，
        # 避免Postgres uuid解析错误落入未预期500）。
        try:
            _uuid.UUID(str(document_version_id))
        except (ValueError, AttributeError, TypeError) as err:
            raise RagRuntimeError("DOCUMENT_NOT_FOUND", f"document version不存在：{document_version_id}") from err
        import psycopg

        with psycopg.connect(self._url) as conn:
            row = conn.execute(
                """SELECT dv.object_key, dv.content_hash, dv.mime, dv.status,
                          (SELECT f.url FROM rag.fetches f
                            WHERE f.content_hash = dv.content_hash AND f.object_key = dv.object_key
                            ORDER BY f.id LIMIT 1) AS official_url
                   FROM rag.document_versions dv WHERE dv.id = %s""",
                (document_version_id,),
            ).fetchone()
        if row is None:
            raise RagRuntimeError("DOCUMENT_NOT_FOUND", f"document version不存在：{document_version_id}")
        object_key, content_hash, mime, status, official_url = row[0], row[1], row[2], row[3], row[4]
        if not self._store.exists(object_key):
            raise RagRuntimeError("OBJECT_MISSING", f"登记对象缺失（失败关闭）：{object_key}")
        content = self._store.get(object_key)
        import hashlib

        actual = hashlib.sha256(content).hexdigest()
        if actual != content_hash:
            raise RagRuntimeError(
                "OBJECT_SHA_DRIFT",
                f"对象SHA漂移（失败关闭）：{actual} ≠ 登记content_hash {content_hash}",
            )
        return {
            "documentVersionId": document_version_id,
            "content": content,
            "mime": mime,
            "sha256": content_hash,
            "officialUrl": official_url,
            "status": status,
        }
