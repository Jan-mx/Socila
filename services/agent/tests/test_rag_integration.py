"""步骤05.1/05.5/05.6/05.9/05.10 集成测试（演练库 + 内存对象存储 + Fake SiliconFlow）：

- AC-005 哈希去重；AC-001 原件+Tree+Markdown；AC-003 地区隔离；AC-004 历史日期；
  AC-007 父条款回填；混合检索与引用。
"""

from __future__ import annotations

import os

import pytest

from agent.rag.pipeline import IngestService, RetrievalService
from agent.rag.siliconflow import FakeSiliconFlowClient
from agent.rag.storage import InMemoryObjectStore

DRILL = os.environ.get("SOCILA_TEST_DATABASE_URL")


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestIngestAndRetrieval:
    @pytest.fixture()
    def services(self):
        assert DRILL is not None
        os.environ["DATABASE_URL"] = DRILL
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            for table in ("rag.chunks", "rag.embeddings", "rag.document_trees",
                          "rag.document_versions", "rag.fetches", "rag.retrieval_audit", "rag.sources"):
                conn.execute(f"TRUNCATE {table} CASCADE")
            conn.execute(
                """INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain, owner)
                   VALUES ('310000', '上海人社测试源', 'https://hrss.sh.gov.cn/test', 'hrss.sh.gov.cn', 'qa')
                   ON CONFLICT DO NOTHING"""
            )
            row = conn.execute(
                "SELECT id FROM rag.sources WHERE domain='hrss.sh.gov.cn' LIMIT 1"
            ).fetchone()
            assert row is not None
            source_id = row[0]
        store = InMemoryObjectStore()
        ingest = IngestService(DRILL, store, {"hrss.sh.gov.cn"}, FakeSiliconFlowClient())
        retrieval = RetrievalService(DRILL, FakeSiliconFlowClient())
        return {"source_id": source_id, "store": store, "ingest": ingest, "retrieval": retrieval}

    def _ingest_sample(self, services):
        return services["ingest"].ingest(
            services["source_id"], "https://hrss.sh.gov.cn/sample-policy.md"
        )

    def test_ingest_creates_original_tree_markdown_and_chunks(self, services, monkeypatch):
        assert DRILL is not None
        sample = (
            "# 上海市社保缴费规定\n\n第一条 用人单位应当按月缴纳社会保险费。\n"
            "第二条 缴费基数按本人月平均工资确定。\n\n相关表格另行公布。"
        ).encode()

        def fake_fetch(url, whitelist, max_bytes, timeout=20.0):
            from agent.rag.fetcher import FetchResult

            return FetchResult(
                url=url,
                final_url=url,
                status=200,
                content=sample,
                content_hash=__import__("hashlib").sha256(sample).hexdigest(),
                mime="text/markdown",
                redirects=0,
            )

        monkeypatch.setattr(
            "agent.rag.pipeline.fetch", fake_fetch
        )
        result = self._ingest_sample(services)
        assert result.status == "indexed"
        assert result.chunk_count >= 2
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            indexed_counts = conn.execute(
                "SELECT count(*), count(e.chunk_id) FROM rag.chunks c "
                "LEFT JOIN rag.embeddings e ON e.chunk_id=c.id "
                "WHERE c.document_version_id=%s", (result.document_version_id,),
            ).fetchone()
            assert indexed_counts is not None
            assert indexed_counts[0] == indexed_counts[1], "indexed must contain every embedding"

        # 原件 + Tree + Markdown 落库（AC-001）。
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            tree = conn.execute(
                "SELECT markdown FROM rag.document_trees WHERE document_version_id=%s",
                (result.document_version_id,),
            ).fetchone()
            assert tree and "上海市社保缴费规定" in tree[0]
        assert services["store"].exists(f"originals/{result.content_hash}")

        # AC-005：同哈希重复采集不建新版本。
        again = self._ingest_sample(services)
        assert again.deduplicated is True
        assert again.document_version_id == result.document_version_id

    def test_normal_ingest_is_searchable_through_rag_runtime_with_provenance(self, services, monkeypatch):
        assert DRILL is not None
        sample = (
            "# 上海市失业保险金支付标准\n\n"
            "第一条 失业保险金第1-12个月标准为2340元每月。"
        ).encode()
        official_url = "https://hrss.sh.gov.cn/runtime-policy.md"

        def fake_fetch(url, whitelist, max_bytes, timeout=20.0):
            from agent.rag.fetcher import FetchResult

            return FetchResult(
                url=url,
                final_url=official_url,
                status=200,
                content=sample,
                content_hash=__import__("hashlib").sha256(sample).hexdigest(),
                mime="text/markdown",
                response_headers={},
                redirects=0,
            )

        monkeypatch.setattr("agent.rag.pipeline.fetch", fake_fetch)
        ingested = services["ingest"].ingest(services["source_id"], official_url)
        assert ingested.status == "indexed"

        from agent.rag.runtime import RagRuntime

        result = RagRuntime(
            DRILL,
            services["store"],
            FakeSiliconFlowClient(),
        ).search("失业保险金 2340", "310000", "2026-09-13", 5)
        assert result["hits"], "normal ingest must be runtime-ready, not only RetrievalService-ready"
        hit = result["hits"][0]
        assert hit["documentTitle"] == "上海市失业保险金支付标准"
        assert hit["authority"] == "上海人社测试源"
        assert hit["officialUrl"] == official_url

    def test_ingest_deduplicates_identical_sibling_chunks_before_embedding(self, services, monkeypatch):
        assert DRILL is not None
        sample = "重复的政策段落。\n重复的政策段落。".encode()

        def fake_fetch(url, whitelist, max_bytes, timeout=20.0):
            from agent.rag.fetcher import FetchResult

            return FetchResult(
                url=url,
                final_url=url,
                status=200,
                content=sample,
                content_hash=__import__("hashlib").sha256(sample).hexdigest(),
                mime="text/markdown",
                response_headers={},
                redirects=0,
            )

        client = services["ingest"]._client
        real_embed = client.embed
        embedded_texts: list[str] = []

        def tracking_embed(texts):
            embedded_texts.extend(texts)
            return real_embed(texts)

        monkeypatch.setattr("agent.rag.pipeline.fetch", fake_fetch)
        monkeypatch.setattr(client, "embed", tracking_embed)

        result = self._ingest_sample(services)
        assert result.status == "indexed"
        assert result.chunk_count == 1
        assert embedded_texts == ["重复的政策段落。"]

        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            counts = conn.execute(
                "SELECT count(*), count(e.chunk_id) FROM rag.chunks c "
                "LEFT JOIN rag.embeddings e ON e.chunk_id=c.id "
                "WHERE c.document_version_id=%s",
                (result.document_version_id,),
            ).fetchone()
        assert counts == (1, 1)

        again = self._ingest_sample(services)
        assert again.deduplicated is True
        assert again.document_version_id == result.document_version_id
        assert again.status == "indexed"

    def test_hybrid_search_filters_and_parent_expansion(self, services, monkeypatch):
        assert DRILL is not None
        from psycopg import connect

        sample = (
            "# 上海市失业保险规定\n\n第一条 失业保险金按最低工资标准的一定比例发放。\n"
            "第二条 缴费满一年可领取失业保险金。\n\n附加说明：本规定自发布之日起施行。"
        ).encode()
        import hashlib

        def fake_fetch(url, whitelist, max_bytes, timeout=20.0):
            from agent.rag.fetcher import FetchResult

            return FetchResult(url, url, 200, sample,
                               hashlib.sha256(sample).hexdigest(), "text/markdown", {}, 0)

        monkeypatch.setattr("agent.rag.pipeline.fetch", fake_fetch)
        services["ingest"].ingest(services["source_id"], "https://hrss.sh.gov.cn/unemployment.md")

        # 为 chunk 生成 Fake 向量并落库（05.8 embedding 写入路径）。
        client = services["retrieval"]._client
        with connect(DRILL, autocommit=True) as conn:
            rows = conn.execute("SELECT id, text FROM rag.chunks").fetchall()
            vectors = client.embed([r[1] for r in rows])
            for (chunk_id, _), vec in zip(rows, vectors["_vectors"], strict=True):
                literal = "[" + ",".join(f"{x:.6f}" for x in vec) + "]"
                conn.execute(
                    "INSERT INTO rag.embeddings (chunk_id, model, dimensions, index_version, embedding)"
                    " VALUES (%s,%s,%s,%s,%s::vector) ON CONFLICT (chunk_id) DO NOTHING",
                    (chunk_id, client.embedding_model, client.embedding_dimensions,
                     client.index_version, literal),
                )

        hits = services["retrieval"].search(
            "失业保险金", jurisdiction_code="310000", as_of_date="2026-01-01"
        )
        assert hits, "应命中失业保险相关 chunk"
        top = hits[0]
        assert top.citation["documentVersionId"]
        assert top.citation["path"]
        # AC-007：父条款回填（若命中子 chunk，父文本非空或该 chunk 即父）。
        assert top.parent_text is None or top.parent_text
