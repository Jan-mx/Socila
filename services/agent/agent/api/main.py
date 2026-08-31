"""生产装配入口（REL-FR-001）：Postgres 仓库 + Celery 派发。

容器 CMD: uvicorn agent.api.main:app --host 0.0.0.0 --port 8100
"""

from __future__ import annotations

from agent.api.app import AppDeps, create_app
from agent.config import get_settings
from agent.repositories import PostgresRepositories
from agent.worker.tasks import resume_graph, start_graph

_settings = get_settings()
_repos = PostgresRepositories(_settings.database_url)


def _dispatch(run) -> None:
    start_graph.delay(run.id, run.thread_id, {
        "jurisdiction_code": "310000",
        "as_of_date": "",
        "payload": {},
    })


def _resume_review(run_id: str, decision: dict) -> bool:
    resume_graph.delay(run_id, decision.get("thread_id", ""), decision)
    return True


deps = AppDeps(_repos, graph_runner=None, settings=_settings)
deps.dispatch = _dispatch  # type: ignore[attr-defined]
deps.resume_review = _resume_review  # type: ignore[attr-defined]

app = create_app(deps)
