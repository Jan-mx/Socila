"""图执行任务（AGT-AC-001/005/006）：Worker 调用 LangGraph runner，从 Checkpoint 恢复。"""

from __future__ import annotations

import json
from typing import Any

from ..config import get_settings
from ..errors import classify_error
from ..graph.runner import build_policyops_graph
from ..repositories import PostgresRepositories
from .celery_app import celery_app

_settings = get_settings()


def _postgres_repos() -> PostgresRepositories:
    return PostgresRepositories(_settings.database_url)


def _fail_or_retry(task, repos: PostgresRepositories, run_id: str, err: Exception) -> dict[str, Any]:
    classification = classify_error(err)
    if classification.kind.value == "retryable" and task.request.retries < task.max_retries:
        raise task.retry(exc=err, countdown=2**task.request.retries * 5)
    repos.update_status(run_id, "failed", error=classification.safe_message)
    return {"status": "failed", "error": classification.safe_message}


@celery_app.task(name="agent.graph.start", bind=True, max_retries=_settings.task_max_retries, default_retry_delay=5)
def start_graph(self, run_id: str, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """执行图（新建）。恢复走 resume_graph。"""
    repos = _postgres_repos()
    config = {"configurable": {"thread_id": thread_id}}
    try:
        repos.update_status(run_id, "running", current_node="extract")
        with repos.checkpointer_cm() as checkpointer:
            graph = build_policyops_graph(
                repos.proposals, repos.events, repos.core_client, checkpointer,
                max_verify_retries=_settings.max_verify_retries,
            )
            final = graph.invoke(
                {
                    "run_id": run_id,
                    "thread_id": thread_id,
                    "jurisdiction_code": payload.get("jurisdiction_code", "310000"),
                    "as_of_date": payload.get("as_of_date", ""),
                    "input_payload": payload,
                },
                config=config,
            )
        waiting = bool(final.get("__interrupt__"))
        repos.update_status(
            run_id,
            "waiting_review" if waiting else "completed",
            current_node="human_review" if waiting else "materialize_draft",
        )
        return {"status": "waiting_review" if waiting else "completed", "proposal": final.get("proposal")}
    except Exception as err:
        return _fail_or_retry(self, repos, run_id, err)


@celery_app.task(name="agent.graph.resume", bind=True, max_retries=_settings.task_max_retries, default_retry_delay=5)
def resume_graph(self, run_id: str, thread_id: str, decision: dict[str, Any]) -> dict[str, Any]:
    """人工审核后恢复：Command(resume=decision) 从最近 Checkpoint 继续。"""
    repos = _postgres_repos()
    config = {"configurable": {"thread_id": thread_id}}
    from langgraph.types import Command

    try:
        repos.update_status(run_id, "running", current_node="human_review")
        with repos.checkpointer_cm() as checkpointer:
            graph = build_policyops_graph(
                repos.proposals, repos.events, repos.core_client, checkpointer,
                max_verify_retries=_settings.max_verify_retries,
            )
            final = graph.invoke(Command(resume=decision), config=config)
        status = "rejected" if (final.get("review_decision") or {}).get("decision") == "reject" else "completed"
        repos.update_status(run_id, status, current_node="materialize_draft")
        return {"status": status, "proposal": final.get("proposal")}
    except Exception as err:
        return _fail_or_retry(self, repos, run_id, err)


@celery_app.task(name="agent.dead.record")
def dead_letter_record(task_name: str, args: list | None, kwargs: dict | None, einfo: str) -> dict[str, Any]:
    """死信留档（不入业务库，只打结构化日志；运维可查 agent.dead 队列）。"""
    print(json.dumps({"dead_letter": {"task": task_name, "args": args, "einfo": einfo[:500]}}))
    return {"recorded": True}


@celery_app.task(name="agent.schedule.heartbeat")
def heartbeat() -> str:
    return "ok"
