"""AGT-AC-001/004 集成（需本地演练库）：PostgresSaver 恢复 + 角色隔离。

前提：AGENT_DATABASE_URL（默认回退 DATABASE_URL）指向已执行
`python -m agent.migrate --with-roles` 的演练库；agent_app 口令与迁移共用
AGENT_DB_PASSWORD（09-03 PMG-FR-019）。未设置时跳过（CI database-gates 自动提供）。
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.integration

DRILL = os.environ.get("AGENT_DATABASE_URL") or os.environ.get("DATABASE_URL")


@pytest.mark.skipif(
    not (DRILL and os.environ.get("AGENT_DB_PASSWORD")),
    reason="requires AGENT_DATABASE_URL/DATABASE_URL + AGENT_DB_PASSWORD",
)
def test_agent_schema_migration_and_role_isolation():
    """AGT-AC-004：agent_app 角色可读写 agent schema，但访问 core 表被数据库拒绝。"""
    from urllib.parse import urlparse

    import psycopg

    assert DRILL is not None and os.environ.get("AGENT_DB_PASSWORD") is not None
    admin_url = DRILL
    admin_pw = os.environ["AGENT_DB_PASSWORD"]
    parsed = urlparse(admin_url)
    # PMG-FR-019：host/port/dbname 一律从 AGENT_DATABASE_URL 派生，不得硬编码。
    agent_url = f"postgresql://agent_app:{admin_pw}@{parsed.hostname}:{parsed.port}{parsed.path}"
    with psycopg.connect(admin_url, autocommit=True) as conn:
        conn.execute("SELECT 1")  # 管理连接可用
    with psycopg.connect(agent_url, autocommit=True) as agent_conn:
        # agent schema 可访问。
        agent_conn.execute("SELECT count(*) FROM agent.agent_runs").fetchone()
        # core 表拒绝。
        try:
            agent_conn.execute("SELECT count(*) FROM public.rules")
        except psycopg.errors.InsufficientPrivilege:
            pass
        else:
            pytest.fail("agent_app 不应能读取 core 表 public.rules")
        # 写 agent 表允许。
        agent_conn.execute(
            "INSERT INTO agent.agent_runs (id, thread_id, workflow_version, input_hash, idempotency_key)"
            " VALUES (gen_random_uuid(), gen_random_uuid(), 'v1', 'h', 'role-check') ON CONFLICT DO NOTHING"
        )
    assert True


@pytest.mark.skipif(not DRILL, reason="requires AGENT_DATABASE_URL/DATABASE_URL")
def test_postgres_checkpointer_resume():
    """AGT-AC-001 前置：PostgresSaver 持久化 interrupt，重建 runner 后可从 Checkpoint 恢复。"""
    from langgraph.types import Command

    from agent.core_client import FakeCoreClient
    from agent.graph.runner import build_policyops_graph
    from agent.repositories import InMemoryRepositories, PostgresRepositories

    assert DRILL is not None
    postgres = PostgresRepositories(DRILL)
    repos = InMemoryRepositories()
    core = FakeCoreClient()
    with postgres.checkpointer_cm() as saver:
        saver.setup()

        graph = build_policyops_graph(repos.proposals, repos.events, core, saver, max_verify_retries=2)
        config = {"configurable": {"thread_id": "resume-test-1"}}
        result = graph.invoke(
            {
                "run_id": "resume-run-1",
                "thread_id": "resume-test-1",
                "jurisdiction_code": "310000",
                "as_of_date": "2026-01-01",
                "input_payload": {"verify_should_pass": True},
            },
            config=config,
        )
        assert result.get("__interrupt__"), "应在 human_review 暂停"

        # 模拟进程重启：重建图（同一 checkpointer），从 Checkpoint 恢复。
        graph2 = build_policyops_graph(repos.proposals, repos.events, core, saver, max_verify_retries=2)
        final = graph2.invoke(
            Command(resume={"decision": "approve", "patch": None}), config=config
        )
    assert (final.get("review_decision") or {}).get("decision") == "approve"
    # 前序节点不重复执行：created 调用恰好一次。
    assert len([c for c in core.calls if c[0] == "created"]) == 1
