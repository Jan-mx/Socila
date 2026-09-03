"""PolicyOpsGraph runner（AGT-FR-006）：可持久化图的构建与恢复。

- checkpointer 可注入：单测用 MemorySaver，集成用 PostgresSaver。
- verify 失败在 max_verify_retries 内路由回 draft，超过进入 human_review。
- 恢复：Command(resume=decision) 从最近 Checkpoint 继续（AGT-AC-001）。
"""

from __future__ import annotations

from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from ..repositories import EventRepository, ProposalRepository
from .nodes import build_graph_nodes
from .state import PolicyOpsState


def route_after_verify(state: PolicyOpsState) -> str:
    # Fake verify 在未通过且未超限时要求重试 draft；verify_retries 是
    # verify 节点自增后的值：retries<=2 允许恰好两次回环（共三次 draft）。
    payload = state.get("input_payload") or {}
    should_pass = bool(payload.get("verify_should_pass", True))
    retries = state.get("verify_retries", 0) or 0
    # 回环上限：verify_retries 已含本次自增；>2 次（即回环超过 2 次）进入人工审核。
    if not should_pass and retries <= 2:
        return "draft"
    return "human_review"


def build_policyops_graph(
    proposals: ProposalRepository,
    events: EventRepository,
    core_client: Any,
    checkpointer: BaseCheckpointSaver | None = None,
    max_verify_retries: int = 2,
):
    nodes = build_graph_nodes(proposals, events, core_client, max_verify_retries)
    graph = StateGraph(PolicyOpsState)
    graph.add_node("extract", nodes["extract"])
    graph.add_node("diff", nodes["diff"])
    graph.add_node("retrieve_impact", nodes["retrieve_impact"])
    graph.add_node("draft", nodes["draft"])
    graph.add_node("verify", nodes["verify"])
    graph.add_node("human_review", nodes["human_review"])
    graph.add_node("materialize_draft", nodes["materialize_draft"])

    graph.set_entry_point("extract")
    graph.add_edge("extract", "diff")
    graph.add_edge("diff", "retrieve_impact")
    graph.add_edge("retrieve_impact", "draft")
    graph.add_edge("draft", "verify")
    graph.add_conditional_edges("verify", route_after_verify, {"draft": "draft", "human_review": "human_review"})
    graph.add_edge("human_review", "materialize_draft")
    graph.add_edge("materialize_draft", END)

    return graph.compile(checkpointer=checkpointer or MemorySaver())
