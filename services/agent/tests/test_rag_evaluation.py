"""步骤05.10 评测集成测试（演练库）：quality-gates 预设门禁验证。

门禁：Context Precision≥0.85、Context Recall≥0.90、引用覆盖率100%、错地区混入率0。
语料：沪（养老/失业）、粤（最低工资）、川（医保）固定示例文档；
向量/rerank 使用 FakeSiliconFlowClient（确定性，按文本哈希种子，PMG-FR-012：
CI 质量门禁不读取 local env 或真实 API Key；真实模型验证由 validate_siliconflow 人工路径承担）。
"""

from __future__ import annotations

import hashlib
import os

import pytest

from agent.rag.evaluation import evaluate
from agent.rag.pipeline import IngestService, RetrievalService
from agent.rag.siliconflow import FakeSiliconFlowClient
from agent.rag.storage import InMemoryObjectStore

DRILL = os.environ.get("SSP_TEST_DATABASE_URL")

SAMPLES = [
    (
        "310000",
        "https://hrss.sh.gov.cn/pension.md",
        "# 上海市养老保险规定\n\n第一条 养老保险累计缴费满十五年，达到法定退休年龄可按月领取养老金。\n第二条 缴费基数按本人上年度月平均工资确定。\n\n附则：本规定由市人社局解释。",
    ),
    (
        "310000",
        "https://hrss.sh.gov.cn/unemployment.md",
        "# 上海市失业保险规定\n\n第一条 失业保险金领取期限最长不超过二十四个月。\n第二条 缴费满一年不满五年的，领取期限最长十二个月。\n\n附则：本规定自发布之日起施行。",
    ),
    (
        "440000",
        "https://hrss.gd.gov.cn/minwage.md",
        "# 广东省最低工资标准\n\n第一条 全省最低工资标准分为四类，一类地区每月2500元。\n第二条 最低工资标准不含加班费和高夜温津贴。\n\n附则：本标准自发布之日起施行。",
    ),
    (
        "510000",
        "https://rst.sc.gov.cn/medical.md",
        "# 四川省医保封顶线规定\n\n第一条 职工医保统筹基金年度封顶线按上年度全省平均工资确定。\n第二条 退休人员缴费年限不足的按规定补缴。\n\n附则：本规定由省医保局解释。",
    ),
]


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SSP_TEST_DATABASE_URL")
class TestRagGoldenGates:
    @pytest.fixture()
    def services(self, monkeypatch):
        assert DRILL is not None
        os.environ["DATABASE_URL"] = DRILL
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            for table in (
                "rag.chunks",
                "rag.embeddings",
                "rag.document_trees",
                "rag.document_versions",
                "rag.fetches",
                "rag.retrieval_audit",
                "rag.sources",
            ):
                conn.execute(f"TRUNCATE {table} CASCADE")
            for jurisdiction, url, _content in SAMPLES:
                domain = url.split("//")[1].split("/")[0]
                conn.execute(
                    """INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain, owner)
                       VALUES (%s, %s, %s, %s, 'qa')""",
                    (jurisdiction, domain, f"https://{domain}/", domain),
                )

        client = FakeSiliconFlowClient()

        store = InMemoryObjectStore()
        ingest = IngestService(DRILL, store, set(), client)
        retrieval = RetrievalService(DRILL, client)

        for _jurisdiction, url, content in SAMPLES:
            content_bytes = content.encode()
            content_hash = hashlib.sha256(content_bytes).hexdigest()

            def fake_fetch(u, w, max_bytes, timeout=20.0, _url=url, _content=content_bytes, _hash=content_hash, **kw):
                from agent.rag.fetcher import FetchResult

                return FetchResult(_url, _url, 200, _content, _hash, "text/markdown", {}, 0)

            # 直接绕过白名单（示例域名为注册表中的域名，抓取由 Fake 模拟）。
            monkeypatch.setattr("agent.rag.pipeline.fetch", fake_fetch)
            with connect(DRILL, autocommit=True) as conn:
                source_row = conn.execute(
                    "SELECT id FROM rag.sources WHERE entry_url=%s",
                    (f"https://{url.split('//')[1].split('/')[0]}/",),
                ).fetchone()
                assert source_row is not None
                source_id = source_row[0]
            result = ingest.ingest(source_id, url)
            assert result.status == "indexed"

            # Fake 向量落库。
            with connect(DRILL, autocommit=True) as conn:
                rows = conn.execute("SELECT id, text FROM rag.chunks WHERE document_version_id=%s", (result.document_version_id,)).fetchall()
                if rows:
                    vectors = client.embed([r[1] for r in rows])
                    for (chunk_id, _), vec in zip(rows, vectors["_vectors"], strict=True):
                        literal = "[" + ",".join(f"{x:.6f}" for x in vec) + "]"
                        conn.execute(
                            "INSERT INTO rag.embeddings (chunk_id, model, dimensions, index_version, embedding)"
                            " VALUES (%s,%s,%s,%s,%s::vector) ON CONFLICT (chunk_id) DO NOTHING",
                            (chunk_id, client.embedding_model, client.embedding_dimensions, client.index_version, literal),
                        )

        return {"retrieval": retrieval}

    def test_golden_gates(self, services):
        metrics = evaluate(services["retrieval"])
        assert float(metrics["context_precision"]) >= 0.85
        assert float(metrics["context_recall"]) >= 0.90
        assert float(metrics["citation_coverage"]) == 1.0
        assert int(metrics["wrong_jurisdiction_count"]) == 0
