"""PolicyOpsGraph State 与节点契约（AGT-FR-005）。

State 为 TypedDict（JSON 可序列化，Postgres Checkpointer 可持久化）；
节点输入输出经 Pydantic 模型校验。
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from pydantic import BaseModel


class NodeOutput(BaseModel):
    """每个节点的产出（写回 State 的增量）。"""

    node: str
    artifacts: list[dict[str, Any]] = []
    proposal: dict[str, Any] | None = None
    error: str | None = None


def merge_dict(left: dict[str, Any] | None, right: dict[str, Any] | None) -> dict[str, Any] | None:
    if right is None:
        return left
    merged = dict(left or {})
    merged.update(right)
    return merged


class PolicyOpsState(TypedDict, total=False):
    run_id: Annotated[str, ...]
    thread_id: Annotated[str, ...]
    jurisdiction_code: Annotated[str, ...]
    as_of_date: Annotated[str, ...]
    input_payload: Annotated[dict[str, Any], ...]
    # 每节点产出（按节点名聚合 artifacts / proposal）
    artifacts: Annotated[list[dict[str, Any]], lambda a, b: (a or []) + (b or [])]
    proposal: Annotated[dict[str, Any] | None, merge_dict]
    # verify → draft 的重试计数
    verify_retries: Annotated[int, lambda a, b: b if b is not None else (a or 0)]
    # human_review 的决定（恢复时注入）
    review_decision: Annotated[dict[str, Any] | None, merge_dict]
    # materialize 幂等键
    materialize_idempotency_key: Annotated[str | None, merge_dict]
