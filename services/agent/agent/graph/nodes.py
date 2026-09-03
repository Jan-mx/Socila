"""PolicyOpsGraph 节点（AGT-FR-005～009 / PRD §7）。

本阶段节点为固定 Fake 实现 + 正式接口：
extract → diff → retrieve_impact → draft → verify → human_review → materialize_draft

- verify 失败可在限定次数内路由回 draft，超过则进入 human_review 并标记不确定。
- human_review 通过 langgraph interrupt 暂停；恢复时注入 review_decision。
- materialize_draft 是唯一 Core 写节点，幂等键 = f"{run_id}:{proposal_id}"，
  重复执行（副作用成功但确认丢失）通过幂等查询返回原结果。
"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from langgraph.types import interrupt

from ..core_client import CoreClient
from ..repositories import (
    AgentArtifact,
    AgentEvent,
    AgentProposal,
    EventRepository,
    ProposalRepository,
    hash_content,
    new_id,
)
from .state import PolicyOpsState

MAX_VERIFY_RETRIES = 2


def make_artifact(run_id: str, node: str, type_: str, content: Any) -> AgentArtifact:
    return AgentArtifact(
        id=new_id(),
        run_id=run_id,
        type=type_,
        version=1,
        content=content,
        content_hash=hash_content(content),
        source_node=node,
    )


def node_event(
    run_id: str, node: str, event_type: str, duration_ms: int | None = None,
    model: str | None = None, tokens: int | None = None, trace_id: str | None = None,
    metadata: Any = None,
) -> AgentEvent:
    # PMG-FR-013：事件仓储类型一致性——节点只产出 AgentEvent，不再裸 dict。
    return AgentEvent(
        id=new_id(),
        run_id=run_id,
        node=node,
        event_type=event_type,
        duration_ms=duration_ms,
        model=model,
        tokens=tokens,
        trace_id=trace_id,
        metadata=metadata,
    )


def build_graph_nodes(
    proposals: ProposalRepository,
    events: EventRepository,
    core_client: CoreClient,
    max_verify_retries: int = MAX_VERIFY_RETRIES,
):
    """返回节点函数字典（固定 Fake 实现，接口与后续阶段一致）。"""

    def extract(state: PolicyOpsState) -> dict[str, Any]:
        run_id = state["run_id"]
        payload = state.get("input_payload", {})
        artifact = make_artifact(run_id, "extract", "extracted", {"fields": payload})
        events.append(node_event(run_id, "extract", "node_completed", model="fake"))
        return {"artifacts": [asdict(artifact)], "verify_retries": 0}

    def diff(state: PolicyOpsState) -> dict[str, Any]:
        run_id = state["run_id"]
        artifact = make_artifact(run_id, "diff", "diff", {"changes": [], "fake": True})
        events.append(node_event(run_id, "diff", "node_completed", model="fake"))
        return {"artifacts": [asdict(artifact)]}

    def retrieve_impact(state: PolicyOpsState) -> dict[str, Any]:
        run_id = state["run_id"]
        artifact = make_artifact(run_id, "retrieve_impact", "impact", {"impacts": [], "fake": True})
        events.append(node_event(run_id, "retrieve_impact", "node_completed", model="fake"))
        return {"artifacts": [asdict(artifact)]}

    def draft(state: PolicyOpsState) -> dict[str, Any]:
        run_id = state["run_id"]
        bundle = {
            "rules": [],
            "params": [],
            "tests": [],
            "fake": True,
            "attempt": state.get("verify_retries", 0),
        }
        proposal = proposals.get_for_run(run_id) or proposals.create(
            AgentProposal(
                id=new_id(),
                run_id=run_id,
                base_snapshot_id=None,
                jurisdiction_code=state.get("jurisdiction_code", "310000"),
                status="needs_review",
                draft_bundle=bundle,
            )
        )
        proposal.draft_bundle = bundle
        artifact = make_artifact(run_id, "draft", "draft_bundle", bundle)
        events.append(node_event(run_id, "draft", "node_completed", model="fake-model-v1", tokens=42))
        return {
            "artifacts": [asdict(artifact)],
            "proposal": {
                "id": proposal.id,
                "run_id": run_id,
                "jurisdiction_code": proposal.jurisdiction_code,
                "status": proposal.status,
                "draft_bundle": bundle,
            },
        }

    def verify(state: PolicyOpsState) -> dict[str, Any]:
        run_id = state["run_id"]
        retries = state.get("verify_retries", 0) or 0
        # Fake 校验：未通过时自增并路由回 draft（回环次数上限由 runner 路由判定）。
        should_pass = bool((state.get("input_payload") or {}).get("verify_should_pass", True))
        events.append(node_event(run_id, "verify", "verify_attempt", metadata={"retries": retries}))
        if should_pass:
            return {"verify_retries": retries, "proposal": None}
        return {"verify_retries": retries + 1, "proposal": None}

    def human_review(state: PolicyOpsState) -> dict[str, Any]:
        run_id = state["run_id"]
        proposal = proposals.get_for_run(run_id)
        # interrupt：暂停等待管理员 approve / edit-and-approve / reject。
        decision = interrupt(
            {
                "proposal_id": proposal.id if proposal else None,
                "draft_bundle": proposal.draft_bundle if proposal else None,
                "uncertain": (state.get("verify_retries", 0) or 0) >= MAX_VERIFY_RETRIES
                and not bool((state.get("input_payload") or {}).get("verify_should_pass", True)),
            }
        )
        events.append(node_event(run_id, "human_review", "review_decision", metadata={"decision": decision.get("decision")}))
        return {"review_decision": decision}

    def materialize_draft(state: PolicyOpsState) -> dict[str, Any]:
        run_id = state["run_id"]
        decision = state.get("review_decision") or {}
        proposal = proposals.get_for_run(run_id)
        if proposal is None:
            return {"error": "proposal missing"}
        if decision.get("decision") == "reject":
            proposals.update_status(proposal.id, "rejected")
            events.append(node_event(run_id, "materialize_draft", "rejected"))
            return {"proposal": {"id": proposal.id, "status": "rejected", "run_id": run_id, "jurisdiction_code": proposal.jurisdiction_code, "draft_bundle": proposal.draft_bundle}}

        if decision.get("decision") in ("approve", "edit-and-approve"):
            if decision.get("decision") == "edit-and-approve" and decision.get("patch") is not None:
                # AC-004：保留 Agent 原稿，另存管理员补丁版本用于 Core 物化。
                agent_original = json.loads(json.dumps(proposal.draft_bundle, default=str))
                proposal.draft_bundle = {
                    **agent_original,
                    "admin_patch": decision["patch"],
                    "agent_original": agent_original,
                }
                proposals.update_status(proposal.id, "approved")
            else:
                proposals.update_status(proposal.id, "approved")

            idempotency_key = f"{run_id}:{proposal.id}"
            # 幂等：副作用成功但确认丢失时，重复执行返回原结果（AGT-FR-007，由 CoreClient 的结果缓存 + artifact 查询实现）。
            result = core_client.materialize_draft(
                json.loads(json.dumps(proposal.draft_bundle, default=str)), idempotency_key, f"trace-{run_id}"
            )
            artifact = make_artifact(run_id, "materialize_draft", "draft_import", result)
            events.append(node_event(run_id, "materialize_draft", "draft_imported", metadata={"draftId": result.get("draftId")}))
            proposals.update_status(proposal.id, "materialized_as_draft")
            return {
                "artifacts": [asdict(artifact)],
                "proposal": {
                    "id": proposal.id,
                    "run_id": run_id,
                    "jurisdiction_code": proposal.jurisdiction_code,
                    "status": "materialized_as_draft",
                    "draft_bundle": proposal.draft_bundle,
                },
            }

        events.append(node_event(run_id, "materialize_draft", "invalid_decision"))
        return {"error": f"invalid review decision: {decision.get('decision')}"}

    return {
        "extract": extract,
        "diff": diff,
        "retrieve_impact": retrieve_impact,
        "draft": draft,
        "verify": verify,
        "human_review": human_review,
        "materialize_draft": materialize_draft,
    }
