"""WI-20260913-01任务2：受控真实索引（SHV2-FR-029）。

契约：
- `python -m agent.rag.evidence_index audit|plan|apply|verify|search`五模式；
- 计划绑定：codeSha、document versions、MinIO object key及SHA、派生状态指纹、
  BAAI/bge-m3、1024维、indexVersion、planHash、targetFingerprint、finalFingerprint、
  完整派生写集合；
- apply必须显式`--i-am-authorized --plan-file --plan-hash --target-fingerprint`，
  干净工作树、HEAD==计划codeSha、对象与数据库状态未漂移；
- 索引行为：MinIO读原件并复核SHA→DocumentTree+Markdown→chunks→embeddings→
  每份文档独立事务（清理旧派生行→写入→标记indexed）→失败回滚当前文档→
  部分完成后原计划失效必须重新plan→完整终态复跑noop；
- IngestService：downloaded/parsed版本不得返回伪indexed；派生索引完整才返回indexed；
- 9001或含/login的endpoint稳定拒绝。
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import pytest

from agent.rag.evidence_index import (
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    INDEX_ALGORITHM_VERSION,
    INDEX_PLAN_SCHEMA,
    EvidenceIndexError,
    PolicyEvidenceIndex,
    classify_index_state,
    guard_index_endpoint,
    parse_index_args,
    plan_hash_of,
)
from agent.rag.siliconflow import FakeSiliconFlowClient
from agent.rag.storage import InMemoryObjectStore, MinioObjectStore

DRILL = os.environ.get("SOCILA_TEST_DATABASE_URL", "")
MINIO_EP = os.environ.get("RAG_SYNC_TEST_MINIO_ENDPOINT", "")
MINIO_AK = os.environ.get("RAG_SYNC_TEST_MINIO_ACCESS_KEY", "minioadmin")
MINIO_SK = os.environ.get("RAG_SYNC_TEST_MINIO_SECRET_KEY", "minioadmin")

HTML_A = (
    "<html><body><h1>上海市失业保险金支付标准</h1>"
    "<p>第一条 2026年7月1日起，失业保险金第1-12月标准为2340元每月。</p>"
    "<p>第二条 第13-24月标准为1872元每月，延长领取为1690元每月。</p></body></html>"
).encode()
SHA_A = hashlib.sha256(HTML_A).hexdigest()
HTML_B = (
    "<html><body><h1>上海市社保缴费基数</h1>"
    "<p>第一条 2026年7月1日起社保缴费基数上限为37731元每月，下限为7546元每月。</p>"
    "<p>第二条 灵活就业人员参照执行。</p></body></html>"
).encode()
SHA_B = hashlib.sha256(HTML_B).hexdigest()


def _seed_version(conn: Any, *, content_hash: str, mime: str = "text/html", status: str = "downloaded") -> str:
    """登记一条source/fetch/document_version（evidence_sync终态形状；返回version id）。"""
    source = conn.execute(
        "SELECT id FROM rag.sources WHERE domain='rsj.sh.gov.cn' AND jurisdiction_code='310000' LIMIT 1"
    ).fetchone()
    if source is None:
        source = conn.execute(
            "INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) "
            "VALUES ('310000','rsj.sh.gov.cn 官方政策原件','https://rsj.sh.gov.cn/','rsj.sh.gov.cn') RETURNING id"
        ).fetchone()
    assert source is not None
    source_id = int(source[0])
    object_key = f"originals/{content_hash}"
    conn.execute(
        "INSERT INTO rag.fetches (source_id, url, status, content_hash, object_key, mime) "
        "VALUES (%s,%s,200,%s,%s,%s)",
        (source_id, f"https://rsj.sh.gov.cn/t/{content_hash[:8]}.html", content_hash, object_key, mime),
    )
    version = conn.execute(
        "INSERT INTO rag.document_versions (content_hash, source_id, mime, object_key, status, pipeline_version, jurisdiction_code) "
        "VALUES (%s,%s,%s,%s,%s,'rag-evidence-sync-1.0','310000') RETURNING id",
        (content_hash, source_id, mime, object_key, status),
    ).fetchone()
    assert version is not None
    return str(version[0])


def _truncate() -> None:
    from psycopg import connect

    with connect(DRILL, autocommit=True) as conn:
        conn.execute(
            "TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE"
        )


def _make_index(store: Any, *, client: Any = None) -> PolicyEvidenceIndex:
    return PolicyEvidenceIndex(DRILL, store, client or FakeSiliconFlowClient())


# ── CLI参数与守卫（零数据库单元）────────────────────────────────────────────


def _base_apply_args() -> list[str]:
    return [
        "apply",
        "--database-url", "postgresql://postgres:postgres@127.0.0.1:59999/x",
        "--plan-file", "plan.json",
        "--plan-hash", "a" * 64,
        "--target-fingerprint", "b" * 64,
        "--i-am-authorized",
    ]


def test_parse_apply_requires_full_authorization_binding():
    args = parse_index_args(_base_apply_args())
    assert args["mode"] == "apply" and args["i_am_authorized"] is True
    assert args["plan_hash"] == "a" * 64 and args["target_fingerprint"] == "b" * 64
    for drop in ("--i-am-authorized", "--plan-file", "--plan-hash", "--target-fingerprint"):
        argv = list(_base_apply_args())
        i = argv.index(drop)
        del argv[i : i + (1 if drop == "--i-am-authorized" else 2)]
        with pytest.raises(EvidenceIndexError, match=r"USAGE|授权|plan|hash|fingerprint"):
            parse_index_args(argv)


def test_parse_all_modes_require_database_url(monkeypatch):
    monkeypatch.delenv("AGENT_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    for argv in (
        ["audit"],
        ["plan"],
        ["verify"],
        ["search", "--query", "q", "--jurisdiction", "310000", "--as-of", "2026-09-01"],
    ):
        with pytest.raises(EvidenceIndexError, match=r"USAGE|数据库|database"):
            parse_index_args(argv)


def test_parse_search_requires_query_jurisdiction_asof(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:59999/x")
    with pytest.raises(EvidenceIndexError, match=r"USAGE|query"):
        parse_index_args(["search"])
    with pytest.raises(EvidenceIndexError, match=r"USAGE|jurisdiction"):
        parse_index_args(["search", "--query", "q"])
    with pytest.raises(EvidenceIndexError, match=r"USAGE|as-of|as_of"):
        parse_index_args(["search", "--query", "q", "--jurisdiction", "310000"])


def test_parse_rejects_unknown_mode():
    with pytest.raises(EvidenceIndexError, match=r"USAGE|mode"):
        parse_index_args(["bogus"])


def test_guard_index_endpoint_rejects_console_port_and_login_path():
    with pytest.raises(EvidenceIndexError, match=r"9001|console|endpoint"):
        guard_index_endpoint("127.0.0.1:9001")
    with pytest.raises(EvidenceIndexError, match=r"9001|console|endpoint"):
        guard_index_endpoint("minio:9001")
    with pytest.raises(EvidenceIndexError, match=r"login|endpoint"):
        guard_index_endpoint("127.0.0.1:9000/login")
    guard_index_endpoint("127.0.0.1:9000")
    guard_index_endpoint("minio:9000")


def test_classify_index_state_semantics():
    t, f = "t" * 64, "f" * 64
    assert classify_index_state(t, t, f) == "pending"
    assert classify_index_state(f, t, f) == "noop"
    assert classify_index_state("c" * 64, t, f) == "drift"


# ── 真实政府页面HTML解析（隔离验收暴露的gate路径bug回归）────────────────────


def test_parse_html_captures_nested_content_and_survives_comments():
    """真实政府页面：正文位于嵌套div内的p/表格，页面含HTML注释——
    旧实现只取标题兄弟节点（抓不到正文）且对注释节点.tag崩溃（cython函数无.lower）。"""
    from agent.rag.chunker import chunk_document
    from agent.rag.document_tree import parse_html

    raw = (
        "<html><head><style>.x{}</style></head>"
        "<body><!-- 管理注释 --><div class='page'><div class='main'>"
        "<h1>上海市失业保险金支付标准</h1>"
        "<div class='content'><p>第一条 失业保险金第1-12月标准为2340元每月。</p>"
        "<table><tr><td>阶段</td><td>标准</td></tr><tr><td>第13-24月</td><td>1872元</td></tr></table>"
        "<p>第二条 基数下限为7546元每月。</p></div>"
        "</div></div></body></html>"
    ).encode()
    parsed = parse_html(raw)
    chunks = chunk_document(parsed.tree, "v-html-regression")
    joined = " ".join(c.text for c in chunks)
    for token in ("2340", "1872", "7546"):
        assert token in joined, f"正文数字{token}必须进入chunk文本"
    assert any("|" in c.text for c in chunks), "表格行必须以单元格分隔保留"


def test_plan_hash_excludes_itself_and_binds_body():
    body = {"schema": INDEX_PLAN_SCHEMA, "k": "v"}
    h = plan_hash_of({**body, "planHash": "0" * 64})
    assert h == plan_hash_of(body)
    assert plan_hash_of({**body, "k": "changed"}) != h


# ── 受控索引（隔离数据库）────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestControlledIndex:
    @pytest.fixture()
    def index_env(self, monkeypatch):
        monkeypatch.setenv("RAG_INDEX_ALLOW_DIRTY", "1")
        _truncate()
        store = InMemoryObjectStore()
        store.put(f"originals/{SHA_A}", HTML_A, "text/html")
        store.put(f"originals/{SHA_B}", HTML_B, "text/html")
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            va = _seed_version(conn, content_hash=SHA_A)
            vb = _seed_version(conn, content_hash=SHA_B)
        index = _make_index(store)
        return {"index": index, "store": store, "va": va, "vb": vb}

    def _apply(self, index, plan, **overrides):
        kwargs = {
            "plan_hash": plan["planHash"],
            "target_fingerprint": plan["targetFingerprint"],
            "i_am_authorized": True,
        }
        kwargs.update(overrides)
        return index.apply(plan, **kwargs)

    def test_build_plan_binds_versions_objects_fingerprints_and_write_set(self, index_env):
        index = index_env["index"]
        plan = index.build_plan()
        again = index.build_plan()
        assert json.dumps(plan, sort_keys=True) == json.dumps(again, sort_keys=True)
        assert plan["schema"] == INDEX_PLAN_SCHEMA
        assert plan["algorithmVersion"] == INDEX_ALGORITHM_VERSION
        assert plan["bucket"] == "policy-originals"
        assert len(plan["codeSha"]) == 40
        assert plan["embeddingModel"] == EMBEDDING_MODEL == "BAAI/bge-m3"
        assert plan["embeddingDimensions"] == EMBEDDING_DIMENSIONS == 1024
        assert plan["indexVersion"] == "BAAI/bge-m3:1024"
        assert len(plan["planHash"]) == 64 and len(plan["targetFingerprint"]) == 64 and len(plan["finalFingerprint"]) == 64
        docs = plan["documents"]
        assert [d["contentHash"] for d in docs] == sorted([SHA_A, SHA_B])  # SQL ORDER BY content_hash
        assert docs[0]["objectKey"] == f"originals/{docs[0]['contentHash']}"
        assert docs[0]["objectShaMatches"] is True
        assert plan["plannedIndex"] == [d["documentVersionId"] for d in docs]
        assert plan["noopDocuments"] == []
        assert plan["conflicts"] == []
        # 完整派生写集合：每个plannedIndex条目绑定version/object/sha/mime。
        for entry in plan["writeSet"]:
            assert set(entry) >= {"documentVersionId", "objectKey", "contentHash", "mime"}
        assert plan_hash_of(plan) == plan["planHash"]

    def test_apply_indexes_documents_with_derived_rows_and_status(self, index_env):
        index = index_env["index"]
        plan = index.build_plan()
        result = self._apply(index, plan)
        assert result["applied"] is True and result["noop"] is False
        assert sorted(result["indexedVersions"]) == sorted([index_env["va"], index_env["vb"]])
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            for vid in (index_env["va"], index_env["vb"]):
                tree = conn.execute(
                    "SELECT tree, markdown, pipeline_version FROM rag.document_trees WHERE document_version_id=%s", (vid,)
                ).fetchone()
                assert tree is not None and tree[0] and tree[1], "DocumentTree与Markdown必须落库"
                chunk_rows = conn.execute(
                    "SELECT id, text, token_count, fts FROM rag.chunks WHERE document_version_id=%s", (vid,)
                ).fetchall()
                assert len(chunk_rows) > 0
                assert all(r[3] is not None for r in chunk_rows), "FTS列必须写入"
                emb_rows = conn.execute(
                    "SELECT chunk_id, model, dimensions, index_version FROM rag.embeddings e "
                    "JOIN rag.chunks c ON c.id=e.chunk_id WHERE c.document_version_id=%s",
                    (vid,),
                ).fetchall()
                assert len(emb_rows) == len(chunk_rows), "embeddings数量必须等于chunks"
                assert all(r[1] == "BAAI/bge-m3" and r[2] == 1024 for r in emb_rows)
                status = conn.execute(
                    "SELECT status FROM rag.document_versions WHERE id=%s", (vid,)
                ).fetchone()
                assert status is not None and status[0] == "indexed"

    def test_apply_refusals_zero_derived_write(self, index_env):
        index = index_env["index"]
        plan = index.build_plan()

        def derived_count() -> int:
            from psycopg import connect

            with connect(DRILL, autocommit=True) as conn:
                t = conn.execute("SELECT count(*) FROM rag.document_trees").fetchone()
                c = conn.execute("SELECT count(*) FROM rag.chunks").fetchone()
                e = conn.execute("SELECT count(*) FROM rag.embeddings").fetchone()
                assert t is not None and c is not None and e is not None
                return t[0] + c[0] + e[0]

        before = derived_count()
        with pytest.raises(EvidenceIndexError, match=r"AUTH|授权"):
            self._apply(index, plan, i_am_authorized=False)
        with pytest.raises(EvidenceIndexError, match=r"PLAN_HASH|planHash"):
            self._apply(index, plan, plan_hash="0" * 64)
        with pytest.raises(EvidenceIndexError, match=r"FINGERPRINT|fingerprint"):
            self._apply(index, plan, target_fingerprint="0" * 64)
        stale = json.loads(json.dumps(plan))
        stale["codeSha"] = "0" * 40
        stale["planHash"] = plan_hash_of(stale)
        with pytest.raises(EvidenceIndexError, match=r"CODE_SHA|codeSha"):
            self._apply(index, stale)
        assert derived_count() == before, "全部拒绝路径必须零派生写入"

    def test_apply_refuses_dirty_worktree_unless_opt_in(self, index_env, monkeypatch):
        from agent.rag import evidence_index as ei_mod

        index = index_env["index"]
        plan = index.build_plan()
        monkeypatch.delenv("RAG_INDEX_ALLOW_DIRTY", raising=False)
        monkeypatch.setattr(ei_mod, "git_head", lambda: {"sha": plan["codeSha"], "dirty": True})
        with pytest.raises(EvidenceIndexError, match=r"DIRTY|工作树"):
            self._apply(index, plan)
        monkeypatch.setenv("RAG_INDEX_ALLOW_DIRTY", "1")
        monkeypatch.setattr(ei_mod, "git_head", lambda: {"sha": plan["codeSha"], "dirty": False})
        assert self._apply(index, plan)["applied"] is True

    def test_per_document_transaction_isolation_on_failure(self, index_env):
        index = index_env["index"]
        plan = index.build_plan()
        # 注入点=plannedIndex顺序中的第二份文档（与contentHash排序无关）：
        # 第一份已提交保持indexed，失败份回滚保持downloaded无派生行。
        fail_vid = plan["plannedIndex"][1]
        ok_vid = plan["plannedIndex"][0]
        with pytest.raises(EvidenceIndexError, match=r"INJECTED|注入"):
            self._apply(index, plan, inject_failure_at="embed", inject_failure_document=fail_vid)
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            first = conn.execute(
                "SELECT status FROM rag.document_versions WHERE id=%s", (ok_vid,)
            ).fetchone()
            assert first is not None and first[0] == "indexed"
            first_chunks = conn.execute(
                "SELECT count(*) FROM rag.chunks WHERE document_version_id=%s", (ok_vid,)
            ).fetchone()
            assert first_chunks is not None and first_chunks[0] > 0
            second = conn.execute(
                "SELECT status FROM rag.document_versions WHERE id=%s", (fail_vid,)
            ).fetchone()
            assert second is not None and second[0] == "downloaded"
            second_rows = conn.execute(
                "SELECT count(*) FROM rag.chunks WHERE document_version_id=%s", (fail_vid,)
            ).fetchone()
            second_trees = conn.execute(
                "SELECT count(*) FROM rag.document_trees WHERE document_version_id=%s", (fail_vid,)
            ).fetchone()
            assert second_rows is not None and second_trees is not None
            assert second_rows[0] == 0 and second_trees[0] == 0

    def test_partial_completion_invalidates_plan_and_replan_completes(self, index_env):
        index = index_env["index"]
        plan = index.build_plan()
        fail_vid = plan["plannedIndex"][1]
        ok_vid = plan["plannedIndex"][0]
        with pytest.raises(EvidenceIndexError, match=r"INJECTED|注入"):
            self._apply(index, plan, inject_failure_at="embed", inject_failure_document=fail_vid)
        # 部分完成后原计划失效：重新apply同计划必须零写入拒绝（状态介于前置与终态之间）。
        with pytest.raises(EvidenceIndexError, match=r"DRIFT|漂移|重新plan"):
            self._apply(index, plan)
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            rows = conn.execute(
                "SELECT count(*) FROM rag.chunks WHERE document_version_id=%s", (fail_vid,)
            ).fetchone()
            assert rows is not None and rows[0] == 0, "拒绝路径必须零写入（不得自动补写）"
        # 重新plan绑定新前置状态→apply补齐剩余文档→verify ok。
        replan = index.build_plan()
        assert replan["planHash"] != plan["planHash"], "部分完成后计划必须变化"
        assert replan["plannedIndex"] == [fail_vid]
        assert replan["noopDocuments"] == [ok_vid]
        result = self._apply(index, replan)
        assert result["applied"] is True
        assert result["indexedVersions"] == [fail_vid]
        assert index.verify()["ok"] is True

    def test_reapply_same_plan_noop_at_final_state(self, index_env):
        index = index_env["index"]
        plan = index.build_plan()
        self._apply(index, plan)
        again = self._apply(index, plan)
        assert again["noop"] is True and again["applied"] is False
        assert again["indexedVersions"] == []

    def test_verify_ok_after_apply_and_fails_on_drift(self, index_env):
        index = index_env["index"]
        plan = index.build_plan()
        report = index.verify()
        assert report["ok"] is False  # 未索引：verify必须失败
        self._apply(index, plan)
        report = index.verify()
        assert report["ok"] is True and report["problems"] == []
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute(
                "DELETE FROM rag.embeddings WHERE chunk_id IN (SELECT id FROM rag.chunks WHERE document_version_id=%s LIMIT 1)",
                (index_env["va"],),
            )
        assert index.verify()["ok"] is False
        _truncate()
        store = InMemoryObjectStore()
        store.put(f"originals/{SHA_A}", HTML_A, "text/html")
        store.put(f"originals/{SHA_B}", HTML_B, "text/html")
        from psycopg import connect as _c

        with _c(DRILL, autocommit=True) as conn:
            va = _seed_version(conn, content_hash=SHA_A)
            _seed_version(conn, content_hash=SHA_B)
        index2 = _make_index(store)
        self._apply(index2, index2.build_plan())
        with _c(DRILL, autocommit=True) as conn:
            conn.execute("UPDATE rag.document_versions SET status='parsed' WHERE id=%s", (va,))
        assert index2.verify()["ok"] is False

    def test_plan_refuses_object_missing_or_conflict(self, index_env):
        index = index_env["index"]
        index_env["store"]._objects.pop(f"originals/{SHA_B}")
        with pytest.raises(EvidenceIndexError, match=r"OBJECT_MISSING|缺失"):
            index.build_plan()
        index_env["store"]._objects[f"originals/{SHA_B}"] = b"<html>wrong-bytes</html>"
        with pytest.raises(EvidenceIndexError, match=r"OBJECT_CONFLICT|冲突"):
            index.build_plan()
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            rows = conn.execute("SELECT count(*) FROM rag.chunks").fetchone()
            assert rows is not None and rows[0] == 0

    def test_search_returns_hits_with_jurisdiction_filter(self, index_env):
        index = index_env["index"]
        self._apply(index, index.build_plan())
        from agent.rag.pipeline import RetrievalService

        service = RetrievalService(DRILL, FakeSiliconFlowClient())
        hits = service.search("失业保险金标准 2340", "310000", "2026-09-01", top_k=5)
        assert hits, "索引后固定查询必须产生候选"
        assert all(h.document_version_id for h in hits)
        empty = service.search("失业保险金标准 2340", "440000", "2026-09-01", top_k=5)
        assert empty == [], "广东地区过滤必须为零命中"


# ── IngestService伪indexed修复（SHV2-NFR-006/任务2要求）──────────────────────


def _fake_fetch(monkeypatch, body: bytes):
    """注入fetch替身：IngestService.ingest不发起真实网络请求。"""
    import agent.rag.fetcher as fetcher_mod
    import agent.rag.pipeline as pipeline_mod

    def _fetch(url: str, whitelist: set[str], max_bytes: int, timeout: float = 30.0):
        return fetcher_mod.FetchResult(
            url=url,
            final_url=url,
            status=200,
            content=body,
            content_hash=hashlib.sha256(body).hexdigest(),
            mime="text/html",
        )

    monkeypatch.setattr(pipeline_mod, "fetch", _fetch)


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestIngestServiceDedupStatus:
    def test_downloaded_version_not_reported_as_indexed(self, monkeypatch):
        monkeypatch.setenv("RAG_INDEX_ALLOW_DIRTY", "1")
        _truncate()
        _fake_fetch(monkeypatch, HTML_A)
        store = InMemoryObjectStore()
        from agent.rag.pipeline import IngestService

        with __import__("psycopg").connect(DRILL, autocommit=True) as conn:
            source = conn.execute(
                "INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) "
                "VALUES ('310000','x','https://rsj.sh.gov.cn/','rsj.sh.gov.cn') RETURNING id"
            ).fetchone()
            assert source is not None
            source_id = int(source[0])
            conn.execute(
                "INSERT INTO rag.document_versions (content_hash, source_id, mime, object_key, status, pipeline_version, jurisdiction_code) "
                "VALUES (%s,%s,'text/html',%s,'downloaded','rag-evidence-sync-1.0','310000')",
                (SHA_A, source_id, f"originals/{SHA_A}"),
            )
        service = IngestService(DRILL, store, {"rsj.sh.gov.cn"}, FakeSiliconFlowClient())
        # 同hash版本已存在且为downloaded：不得返回伪indexed（旧实现直接返回indexed）。
        result = service.ingest(source_id, "https://rsj.sh.gov.cn/t/a.html")
        assert result.deduplicated is True
        assert result.status != "indexed", f"downloaded版本不得返回伪indexed（实际{result.status}）"

    def test_complete_derived_index_reported_as_indexed(self, monkeypatch):
        monkeypatch.setenv("RAG_INDEX_ALLOW_DIRTY", "1")
        _truncate()
        _fake_fetch(monkeypatch, HTML_A)
        store = InMemoryObjectStore()
        from agent.rag.pipeline import IngestService

        with __import__("psycopg").connect(DRILL, autocommit=True) as conn:
            source = conn.execute(
                "INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) "
                "VALUES ('310000','x','https://rsj.sh.gov.cn/','rsj.sh.gov.cn') RETURNING id"
            ).fetchone()
            assert source is not None
            source_id = int(source[0])
            conn.execute(
                "INSERT INTO rag.document_versions (content_hash, source_id, mime, object_key, status, pipeline_version, jurisdiction_code) "
                "VALUES (%s,%s,'text/html',%s,'downloaded','rag-evidence-sync-1.0','310000')",
                (SHA_A, source_id, f"originals/{SHA_A}"),
            )
        store.put(f"originals/{SHA_A}", HTML_A, "text/html")
        index = PolicyEvidenceIndex(DRILL, store, FakeSiliconFlowClient())
        plan = index.build_plan()
        index.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        service = IngestService(DRILL, store, {"rsj.sh.gov.cn"}, FakeSiliconFlowClient())
        result = service.ingest(source_id, "https://rsj.sh.gov.cn/t/a.html")
        assert result.deduplicated is True
        assert result.status == "indexed", "派生索引完整时必须返回indexed"


# ── 真实隔离MinIO索引（对象读取与SHA复核）────────────────────────────────────


@pytest.mark.integration
@pytest.mark.skipif(not (DRILL and MINIO_EP), reason="requires SOCILA_TEST_DATABASE_URL + RAG_SYNC_TEST_MINIO_ENDPOINT")
class TestRealMinioIndex:
    def test_apply_reads_objects_from_real_minio_and_verifies_sha(self, monkeypatch):
        from minio import Minio

        monkeypatch.setenv("RAG_INDEX_ALLOW_DIRTY", "1")
        _truncate()
        raw = Minio(MINIO_EP, access_key=MINIO_AK, secret_key=MINIO_SK, secure=False)
        if raw.bucket_exists("policy-originals"):
            for obj in raw.list_objects("policy-originals", recursive=True):
                raw.remove_object("policy-originals", obj.object_name)
            raw.remove_bucket("policy-originals")
        raw.make_bucket("policy-originals")
        store = MinioObjectStore(MINIO_EP, MINIO_AK, MINIO_SK, "policy-originals")
        store.put(f"originals/{SHA_A}", HTML_A, "text/html")
        store.put(f"originals/{SHA_B}", HTML_B, "text/html")
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            _seed_version(conn, content_hash=SHA_A)
            _seed_version(conn, content_hash=SHA_B)
        index = _make_index(store)
        plan = index.build_plan()
        result = index.apply(
            plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True
        )
        assert result["applied"] is True
        assert index.verify()["ok"] is True
        # 对象被外部篡改后apply必须失败关闭（重新索引前复核SHA）。
        drifted = b"<html>drifted</html>"
        raw.put_object("policy-originals", f"originals/{SHA_B}", __import__("io").BytesIO(drifted), length=len(drifted), content_type="text/html")
        _truncate()
        with connect(DRILL, autocommit=True) as conn:
            _seed_version(conn, content_hash=SHA_A)
            _seed_version(conn, content_hash=SHA_B)
        with pytest.raises(EvidenceIndexError, match=r"OBJECT_CONFLICT|冲突"):
            index.build_plan()


# ── CLI输出脱敏 ──────────────────────────────────────────────────────────────


def test_cli_error_output_redacts_credentials(monkeypatch, capsys):
    import agent.rag.evidence_index as ei_mod

    class _BoomStore(InMemoryObjectStore):
        def bucket_exists(self) -> bool:
            raise RuntimeError("minio connect failed: postgresql://minio:Sup3rSecret9@127.0.0.1:9000/policy-originals")

    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres:PgDrillS3cret7@localhost:59999/db")
    monkeypatch.setattr(ei_mod, "_build_store", lambda endpoint, bucket: _BoomStore())
    rc = ei_mod.main(["audit", "--database-url", "postgresql://postgres:PgDrillS3cret7@localhost:59999/db"])
    captured = capsys.readouterr()
    output = captured.out + captured.err
    assert rc == 1
    assert "Sup3rSecret9" not in output, "非预期错误输出泄露MinIO口令"
    assert "PgDrillS3cret7" not in output, "非预期错误输出泄露数据库口令"
