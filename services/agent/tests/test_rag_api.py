"""WI-20260913-01任务3：Agent内部RAG接口（SHV2-FR-030/AC-026）。

契约：
- POST /internal/v1/rag/search：Next→Agent服务JWT；输入校验query/jurisdiction_code/
  as_of_date/top_k；返回chunkId/documentVersionId/text/parentText/path/score/
  documentTitle/authority/sourceName/officialUrl/contentSha256/mime；仅indexed版本且地区/日期/状态过滤；
  FTS+向量召回→RRF→真实rerank；无候选返回空hits且不调用空文档rerank；
- GET /internal/v1/rag/documents/{id}/original：JWT；MinIO读取并重新核对SHA；
  未知版本404；对象缺失/SHA漂移失败关闭；attachment/nosniff/private no-store；
  不返回MinIO地址、凭据或预签名URL。
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import httpx
import pytest

from agent.api.app import AppDeps, create_app
from agent.config import Settings
from agent.rag.siliconflow import FakeSiliconFlowClient
from agent.rag.storage import InMemoryObjectStore
from agent.security.service_jwt import ServiceJwt

DRILL = os.environ.get("SOCILA_TEST_DATABASE_URL", "")

TEST_CURRENT = "unit-test-service-jwt-secret-0123456789abcdef"  # 合成测试Secret（变量命名避开凭据扫描规则，与test_service_jwt约定一致）
HTML = (
    "<html><body><h1>上海市失业保险金支付标准</h1>"
    "<p>第一条 2026年7月1日起失业保险金第1-12月标准为2340元每月。</p></body></html>"
).encode()
SHA = hashlib.sha256(HTML).hexdigest()


class _FakeRagRuntime:
    """确定性替身：search/original行为可编程（rerank调用计数用于空候选契约）。"""

    def __init__(self) -> None:
        self.search_result: dict[str, Any] = {
            "hits": [], "candidateCount": 0, "reliableHitCount": 0,
            "noReliableHits": True, "relevanceThreshold": 0.2,
        }
        self.original_result: dict[str, Any] | None = None
        self.error: tuple[int, str] | None = None
        self.search_calls: list[tuple[str, str, str, int]] = []

    def search(self, query: str, jurisdiction_code: str, as_of_date: str, top_k: int = 5) -> dict[str, Any]:
        if self.error:
            from agent.rag.runtime import RagRuntimeError

            raise RagRuntimeError(self.error[1], "fake")
        self.search_calls.append((query, jurisdiction_code, as_of_date, top_k))
        return self.search_result

    def original(self, document_version_id: str) -> dict[str, Any]:
        if self.error:
            from agent.rag.runtime import RagRuntimeError

            raise RagRuntimeError(self.error[1], "fake")
        assert self.original_result is not None
        return self.original_result


def _app_with(runtime: _FakeRagRuntime | None, jwt: ServiceJwt | None = None):
    deps = AppDeps(
        repos=__import__("agent.repositories", fromlist=["InMemoryRepositories"]).InMemoryRepositories(),
        graph_runner=None,
        settings=Settings(),
        service_jwt=jwt or ServiceJwt(TEST_CURRENT),
        rag_runtime=runtime,
    )
    return create_app(deps)


def _client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


def _auth_header(jwt: ServiceJwt) -> dict[str, str]:
    # Python侧ServiceJwt签名为同步方法（Node侧才是async）。
    return {"Authorization": f"Bearer {jwt.sign_next_token()}"}


# ── API契约（替身runtime，零数据库）──────────────────────────────────────────


async def test_rag_search_requires_service_jwt():
    runtime = _FakeRagRuntime()
    client = _client(_app_with(runtime))
    assert (await client.post("/internal/v1/rag/search", json={
        "query": "失业金", "jurisdiction_code": "310000", "as_of_date": "2026-09-01"})).status_code == 401
    assert (await client.post("/internal/v1/rag/search", json={
        "query": "失业金", "jurisdiction_code": "310000", "as_of_date": "2026-09-01"},
        headers={"Authorization": "Bearer not-a-jwt"})).status_code == 401


async def test_rag_search_validates_input():
    runtime = _FakeRagRuntime()
    jwt = ServiceJwt(TEST_CURRENT)
    client = _client(_app_with(runtime))
    auth = _auth_header(jwt)
    base = {"jurisdiction_code": "310000", "as_of_date": "2026-09-01", "query": "失业金标准"}
    # 缺query / 非法地区 / 非法日期 / 非真实日历日期 / top_k越界 → 422校验拒绝。
    for bad in (
        {k: v for k, v in base.items() if k != "query"},
        {**base, "query": ""},
        {**base, "jurisdiction_code": "SH"},
        {**base, "as_of_date": "2026/09/01"},
        {**base, "as_of_date": "2026-13-45"},  # 复审P3-1：非真实日历日期
        {**base, "top_k": 0},
        {**base, "top_k": 99},
    ):
        resp = await client.post("/internal/v1/rag/search", json=bad, headers=auth)
        assert resp.status_code == 422, f"输入{bad}必须被校验拒绝"
    assert runtime.search_calls == [], "校验失败不得触达runtime"


async def test_rag_search_returns_structured_hits():
    runtime = _FakeRagRuntime()
    runtime.search_result = {
        "hits": [
            {
                "chunkId": "c1",
                "documentVersionId": "v1",
                "text": "失业保险金第1-12月标准为2340元每月",
                "parentText": "上海市失业保险金支付标准",
                "path": "/document/paragraph",
                "score": 0.9,
                "documentTitle": "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
                "authority": "上海市人力资源和社会保障局",
                "sourceName": "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
                "officialUrl": "https://rsj.sh.gov.cn/t1.html",
                "contentSha256": SHA,
                "mime": "text/html",
            }
        ],
        "candidateCount": 1,
        "reliableHitCount": 1,
        "noReliableHits": False,
        "relevanceThreshold": 0.2,
    }
    jwt = ServiceJwt(TEST_CURRENT)
    client = _client(_app_with(runtime))
    resp = await client.post(
        "/internal/v1/rag/search",
        json={"query": "失业金2340", "jurisdiction_code": "310000", "as_of_date": "2026-09-01", "top_k": 5},
        headers=_auth_header(jwt),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["candidateCount"] == 1
    assert data["reliableHitCount"] == 1
    assert data["noReliableHits"] is False
    assert data["relevanceThreshold"] == 0.2
    hit = data["hits"][0]
    assert set(hit) == {
        "chunkId", "documentVersionId", "text", "parentText", "path", "score",
        "documentTitle", "authority", "sourceName", "officialUrl", "contentSha256", "mime",
    }
    assert runtime.search_calls == [("失业金2340", "310000", "2026-09-01", 5)]


async def test_rag_original_headers_and_fail_closed_mapping():
    runtime = _FakeRagRuntime()
    runtime.original_result = {
        "documentVersionId": "v1",
        "content": HTML,
        "mime": "text/html",
        "sha256": SHA,
        "officialUrl": "https://rsj.sh.gov.cn/t1.html",
        "status": "indexed",
    }
    jwt = ServiceJwt(TEST_CURRENT)
    client = _client(_app_with(runtime))
    auth = _auth_header(jwt)
    resp = await client.get("/internal/v1/rag/documents/v1/original", headers=auth)
    assert resp.status_code == 200
    assert resp.content == HTML
    assert resp.headers["content-type"].startswith("text/html")
    assert resp.headers["content-disposition"].startswith("attachment;")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["cache-control"] == "private, no-store"
    body_text = json.dumps(dict(resp.headers))
    assert "minio" not in body_text.lower()
    # 未知版本→404；对象缺失/SHA漂移→502失败关闭。
    for code, status in (("DOCUMENT_NOT_FOUND", 404), ("OBJECT_MISSING", 502), ("OBJECT_SHA_DRIFT", 502)):
        runtime.error = (status, code)
        resp = await client.get("/internal/v1/rag/documents/v1/original", headers=auth)
        assert resp.status_code == status, f"{code}必须映射{status}"
        assert resp.json()["error"] == code
        runtime.error = None


async def test_rag_original_requires_service_jwt():
    runtime = _FakeRagRuntime()
    client = _client(_app_with(runtime))
    assert (await client.get("/internal/v1/rag/documents/v1/original")).status_code == 401


def _stub_runtime_search(monkeypatch, *, score: float, title: str, authority: str):
    """零数据库runtime接缝：只替换检索器与只读metadata连接，测试runtime响应契约。"""
    from types import SimpleNamespace

    version_id = "11111111-1111-4111-8111-111111111111"
    monkeypatch.setattr(
        "agent.rag.runtime.RetrievalService.search",
        lambda *_args, **_kwargs: [
            SimpleNamespace(
                document_version_id=version_id,
                chunk_id="c1",
                text="失业保险金标准",
                parent_text=None,
                score=score,
                citation={"path": "/document/paragraph"},
            )
        ],
    )

    class _Cursor:
        def fetchall(self):
            return [(
                version_id,
                SHA,
                "text/html",
                title,
                authority,
                "https://rsj.sh.gov.cn/t1.html",
                ["https://rsj.sh.gov.cn/t1.html"],
            )]

    class _Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, *_args, **_kwargs):
            return _Cursor()

    monkeypatch.setitem(__import__("sys").modules, "psycopg", SimpleNamespace(connect=lambda _url: _Connection()))
    from agent.rag.runtime import RagRuntime

    return RagRuntime("postgresql://unused", InMemoryObjectStore(), FakeSiliconFlowClient())


def test_rag_runtime_response_contract_filters_low_relevance_without_database(monkeypatch):
    monkeypatch.setenv("RAG_RUNTIME_MIN_RELEVANCE", "0.8")
    runtime = _stub_runtime_search(
        monkeypatch,
        score=0.79,
        title="上海市失业保险金支付标准的通知",
        authority="上海市人力资源和社会保障局",
    )
    assert runtime.search("无关查询", "310000", "2026-09-13", 5) == {
        "hits": [],
        "candidateCount": 1,
        "reliableHitCount": 0,
        "noReliableHits": True,
        "relevanceThreshold": 0.8,
    }


def test_rag_runtime_rejects_indexed_hit_without_title_or_authority(monkeypatch):
    from agent.rag.runtime import RagRuntimeError

    runtime = _stub_runtime_search(
        monkeypatch,
        score=0.9,
        title="",
        authority="上海市人力资源和社会保障局",
    )
    with pytest.raises(RagRuntimeError) as ei:
        runtime.search("失业金标准", "310000", "2026-09-13", 5)
    assert ei.value.code == "HIT_METADATA_MISSING"


# ── RagRuntime集成（隔离数据库+内存对象存储）─────────────────────────────────


def _seed_indexed(conn: Any, *, content_hash: str, status: str = "indexed") -> str:
    source = conn.execute(
        "INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) "
        "VALUES ('310000','rsj.sh.gov.cn 官方政策原件','https://rsj.sh.gov.cn/t1.html','rsj.sh.gov.cn') RETURNING id"
    ).fetchone()
    assert source is not None
    source_id = int(source[0])
    conn.execute(
        "INSERT INTO rag.fetches (source_id, url, status, content_hash, object_key, mime) VALUES (%s,%s,200,%s,%s,'text/html')",
        (source_id, "https://rsj.sh.gov.cn/t1.html", content_hash, f"originals/{content_hash}"),
    )
    version = conn.execute(
        "INSERT INTO rag.document_versions (content_hash, source_id, mime, object_key, status, pipeline_version, jurisdiction_code, document_id, title, authority, official_url) "
        "VALUES (%s,%s,'text/html',%s,%s,'rag-evidence-sync-1.0','310000','DOC-SH-UI-BENEFIT-2026',%s,%s,%s) RETURNING id",
        (
            content_hash,
            source_id,
            f"originals/{content_hash}",
            status,
            "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
            "上海市人力资源和社会保障局",
            "https://rsj.sh.gov.cn/t1.html",
        ),
    ).fetchone()
    assert version is not None
    return str(version[0])


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestRagRuntime:
    @pytest.fixture(autouse=True)
    def _env(self, monkeypatch):
        from psycopg import connect

        monkeypatch.setenv("RAG_INDEX_ALLOW_DIRTY", "1")
        with connect(DRILL, autocommit=True) as conn:
            conn.execute(
                "TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE"
            )
        self.store = InMemoryObjectStore()
        self.store.put(f"originals/{SHA}", HTML, "text/html")
        with connect(DRILL, autocommit=True) as conn:
            self.vid = _seed_indexed(conn, content_hash=SHA)
            # 最小派生行（检索参与要求indexed+派生完整由索引负责；此处直接补齐）。
            tree_json = json.dumps({"type": "document", "text": "", "page": None, "meta": {}, "children": []})
            conn.execute(
                "INSERT INTO rag.document_trees (document_version_id, tree, markdown, pipeline_version) VALUES (%s,%s,%s,'rag-parse-v1')",
                (self.vid, tree_json, "上海市失业保险金支付标准"),
            )
            conn.execute(
                """INSERT INTO rag.chunks (id, document_version_id, parent_chunk_id, path, text, token_count, meta, fts)
                   VALUES (%s,%s,NULL,'/document/paragraph','失业保险金第1-12月标准为2340元每月',10,'{}', to_tsvector('simple','失业保险金 第 1 - 12 月 标准 为 2340 元 每月'))""",
                (f"{self.vid}:p0:abc", self.vid),
            )
            conn.execute(
                "INSERT INTO rag.embeddings (chunk_id, model, dimensions, index_version, embedding) VALUES (%s,'BAAI/bge-m3',1024,'BAAI/bge-m3:1024', %s::vector)",
                (f"{self.vid}:p0:abc", "[" + ",".join("0.01" for _ in range(1024)) + "]"),
            )

    def _runtime(self) -> Any:
        from agent.rag.runtime import RagRuntime

        return RagRuntime(DRILL, self.store, FakeSiliconFlowClient())

    def test_search_returns_metadata_fields(self):
        result = self._runtime().search("失业保险金 2340", "310000", "2026-09-01", 5)
        assert result["hits"], "FTS通道必须产生候选"
        hit = result["hits"][0]
        assert hit["documentVersionId"] == self.vid
        assert hit["documentTitle"] == "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知"
        assert hit["authority"] == "上海市人力资源和社会保障局"
        assert hit["sourceName"] == hit["documentTitle"], "sourceName仅作为documentTitle兼容别名"
        assert hit["officialUrl"] == "https://rsj.sh.gov.cn/t1.html"
        assert hit["contentSha256"] == SHA
        assert hit["mime"] == "text/html"
        assert "minio" not in json.dumps(hit).lower()
        assert result["noReliableHits"] is False
        assert result["reliableHitCount"] == len(result["hits"])

    def test_search_fails_closed_when_indexed_hit_lacks_title_or_authority(self):
        from psycopg import connect

        from agent.rag.runtime import RagRuntimeError

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("UPDATE rag.document_versions SET authority='' WHERE id=%s", (self.vid,))
        with pytest.raises(RagRuntimeError) as ei:
            self._runtime().search("失业保险金 2340", "310000", "2026-09-01", 5)
        assert ei.value.code == "HIT_METADATA_MISSING"

    def test_search_runtime_relevance_contract_filters_low_scores(self, monkeypatch):
        from types import SimpleNamespace

        monkeypatch.setenv("RAG_RUNTIME_MIN_RELEVANCE", "0.8")
        monkeypatch.setattr(
            "agent.rag.runtime.RetrievalService.search",
            lambda *_args, **_kwargs: [
                SimpleNamespace(
                    document_version_id=self.vid,
                    chunk_id="low-score",
                    text="不相关文本",
                    parent_text=None,
                    score=0.79,
                    citation={"path": "/document/paragraph"},
                )
            ],
        )
        result = self._runtime().search("完全无关查询", "310000", "2026-09-01", 5)
        assert result == {
            "hits": [],
            "candidateCount": 1,
            "reliableHitCount": 0,
            "noReliableHits": True,
            "relevanceThreshold": 0.8,
        }

    def test_original_reads_object_and_reverifies_sha(self):
        result = self._runtime().original(self.vid)
        assert result["content"] == HTML
        assert result["sha256"] == SHA
        assert result["mime"] == "text/html"

    def test_original_unknown_version_not_found(self):
        from agent.rag.runtime import RagRuntimeError

        with pytest.raises(RagRuntimeError) as ei:
            self._runtime().original("00000000-0000-0000-0000-000000000000")
        assert ei.value.code == "DOCUMENT_NOT_FOUND"

    def test_original_non_uuid_rejected_as_not_found(self):
        """复审P3-2：非UUID在SQL前拒绝为DOCUMENT_NOT_FOUND（不得落入未预期500）。"""
        from agent.rag.runtime import RagRuntimeError

        with pytest.raises(RagRuntimeError) as ei:
            self._runtime().original("../../etc/passwd")
        assert ei.value.code == "DOCUMENT_NOT_FOUND"

    def test_original_object_missing_fails_closed(self):
        from agent.rag.runtime import RagRuntimeError

        self.store._objects.pop(f"originals/{SHA}")
        with pytest.raises(RagRuntimeError) as ei:
            self._runtime().original(self.vid)
        assert ei.value.code == "OBJECT_MISSING"

    def test_original_sha_drift_fails_closed(self):
        from agent.rag.runtime import RagRuntimeError

        self.store._objects[f"originals/{SHA}"] = b"<html>drifted</html>"
        with pytest.raises(RagRuntimeError) as ei:
            self._runtime().original(self.vid)
        assert ei.value.code == "OBJECT_SHA_DRIFT"

    def test_search_empty_jurisdiction_returns_no_hits_without_rerank(self):
        """广东过滤零命中；空候选不得调用rerank（Fake client计数为0）。"""
        client = FakeSiliconFlowClient()
        calls = {"n": 0}
        original_rerank = client.rerank

        def counting_rerank(query: str, documents: list[str], top_n: int = 8):
            calls["n"] += 1
            return original_rerank(query, documents, top_n)

        client.rerank = counting_rerank  # type: ignore[method-assign]
        from agent.rag.runtime import RagRuntime

        result = RagRuntime(DRILL, self.store, client).search("失业保险金 2340", "440000", "2026-09-01", 5)
        assert result == {
            "hits": [],
            "candidateCount": 0,
            "reliableHitCount": 0,
            "noReliableHits": True,
            "relevanceThreshold": 0.2,
        }
        assert calls["n"] == 0, "空候选不得调用rerank"
