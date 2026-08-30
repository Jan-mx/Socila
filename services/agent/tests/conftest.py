"""pytest fixtures：内存依赖 + MemorySaver 图（单测）；Postgres 路径走 integration 标记。"""

from __future__ import annotations

import pytest
from langgraph.types import Command

from agent.api.app import AppDeps, create_app
from agent.config import Settings
from agent.core_client import FakeCoreClient
from agent.graph.runner import build_policyops_graph
from agent.repositories import InMemoryRepositories


class SyncRunner:
    """单进程 runner：新建执行到 interrupt；resume 从 Checkpoint 继续。"""

    def __init__(self, repos: InMemoryRepositories, core: FakeCoreClient) -> None:
        self.repos = repos
        self.core = core
        self.graph = build_policyops_graph(repos.proposals, repos.events, core, None, max_verify_retries=2)

    def start(self, run_id: str, thread_id: str, payload: dict) -> dict:
        config = {"configurable": {"thread_id": thread_id}}
        result = self.graph.invoke(
            {
                "run_id": run_id,
                "thread_id": thread_id,
                "jurisdiction_code": payload.get("jurisdiction_code", "310000"),
                "as_of_date": payload.get("as_of_date", "2026-01-01"),
                "input_payload": payload,
            },
            config=config,
        )
        interrupts = result.get("__interrupt__") or []
        self.repos.update_status(
            run_id,
            "waiting_review" if interrupts else "completed",
            current_node="human_review" if interrupts else "materialize_draft",
        )
        return result

    def resume(self, run_id: str, thread_id: str, decision: dict) -> bool:
        config = {"configurable": {"thread_id": thread_id}}
        result = self.graph.invoke(Command(resume=decision), config=config)
        status = (
            "rejected"
            if (result.get("review_decision") or {}).get("decision") == "reject"
            else "completed"
        )
        self.repos.update_status(run_id, status, current_node="materialize_draft")
        return True


@pytest.fixture()
def fake_app():
    """FastAPI 应用 + 同步 runner（单进程闭环：创建→暂停→审核→完成）。"""
    repos = InMemoryRepositories()
    core = FakeCoreClient()
    runner = SyncRunner(repos, core)

    deps = AppDeps(repos=repos, graph_runner=runner, settings=Settings(workflow_version="policyops-graph-v1"))

    def dispatch(run) -> None:
        result = runner.start(run.id, run.thread_id, {"jurisdiction_code": "310000", "as_of_date": "2026-01-01"})
        # 有 interrupt 即 waiting_review；无则 completed。

    def resume_review(run_id: str, decision: dict) -> bool:
        run = repos.get(run_id)
        return runner.resume(run_id, run.thread_id, decision)

    deps.dispatch = dispatch  # type: ignore[attr-defined]
    deps.resume_review = resume_review  # type: ignore[attr-defined]

    app = create_app(deps)
    yield {"app": app, "repos": repos, "core": core, "runner": runner}
