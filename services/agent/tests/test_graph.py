"""图骨架测试（AGT-FR-005～009 / AGT-AC-001 前置）：Fake 节点全路由 + verify 回环。"""

from __future__ import annotations

from agent.core_client import FakeCoreClient
from agent.graph.runner import build_policyops_graph
from agent.repositories import InMemoryRepositories


def _drive(repos: InMemoryRepositories, core: FakeCoreClient, payload: dict) -> dict:
    """同步驱动：执行到 interrupt，再以审核决定恢复，返回最终结果。"""
    graph = build_policyops_graph(repos.proposals, repos.events, core, None, max_verify_retries=2)
    config = {"configurable": {"thread_id": "thread-1"}}
    result = graph.invoke(
        {
            "run_id": "run-1",
            "thread_id": "thread-1",
            "jurisdiction_code": "310000",
            "as_of_date": "2026-01-01",
            "input_payload": payload,
        },
        config=config,
    )
    interrupts = result.get("__interrupt__") or []
    if not interrupts:
        return result
    return graph.invoke(
        Command := __import__("langgraph.types", fromlist=["Command"]).Command(
            resume={"decision": payload.get("decision", "approve"), "patch": None}
        ),
        config=config,
    )


def test_full_route_creates_artifacts_and_materializes_once():
    repos = InMemoryRepositories()
    core = FakeCoreClient()
    result = _drive(repos, core, {"verify_should_pass": True})

    # 各节点产物存在。
    types = {a["type"] for a in result["artifacts"]}
    assert {"extracted", "diff", "impact", "draft_bundle", "draft_import"} <= types
    # 幂等：materialize 只调用一次 created。
    assert len([c for c in core.calls if c[0] == "created"]) == 1
    # 提案状态。
    proposal = repos.proposals.get_for_run("run-1")
    assert proposal is not None and proposal.status == "materialized_as_draft"


def test_verify_failure_routes_back_to_draft_then_human_review_with_uncertain_flag():
    repos = InMemoryRepositories()
    core = FakeCoreClient()
    result = _drive(repos, core, {"verify_should_pass": False, "decision": "approve"})
    # verify 重试两次后进入 human_review，interrupt payload 标记 uncertain。
    assert result["review_decision"] == {"decision": "approve", "patch": None}
    # 两次回环体现在 draft bundle 的 attempt 递增产物（最后一次 attempt=2）。
    draft_artifacts = [a for a in result["artifacts"] if a["type"] == "draft_bundle"]
    assert len(draft_artifacts) == 3  # 初始 1 次 + 回环 2 次
    assert draft_artifacts[-1]["content"]["attempt"] == 2
    proposal = repos.proposals.get_for_run("run-1")
    assert proposal is not None and proposal.status == "materialized_as_draft"


def test_reject_does_not_call_core():
    repos = InMemoryRepositories()
    core = FakeCoreClient()
    _drive(repos, core, {"verify_should_pass": True, "decision": "reject"})
    assert core.calls == []  # 驳回不触发 Core 写
    proposal = repos.proposals.get_for_run("run-1")
    assert proposal is not None and proposal.status == "rejected"
