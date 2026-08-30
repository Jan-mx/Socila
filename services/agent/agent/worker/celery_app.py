"""Celery 应用（AGT-FR-003）：队列路由、有限重试、指数退避、死信。

- 队列：agent.graph（图执行）、agent.schedule（Beat 定时）、agent.dead（死信）。
- 重试策略由 agent.errors.classify_error 决定：401/403/Schema 不重试。
"""

from __future__ import annotations

from celery import Celery
from celery.signals import task_failure

from ..config import get_settings


def make_celery(settings=None) -> Celery:
    settings = settings or get_settings()
    app = Celery(
        "policyops-agent",
        broker=settings.redis_url,
        backend=settings.redis_url,
    )
    app.conf.update(
        task_default_queue="agent.graph",
        task_routes={
            "agent.graph.*": {"queue": "agent.graph"},
            "agent.schedule.*": {"queue": "agent.schedule"},
            "agent.dead.*": {"queue": "agent.dead"},
        },
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        beat_schedule={
            "agent-heartbeat": {
                "task": "agent.schedule.heartbeat",
                "schedule": 60.0,
            }
        },
    )
    return app


celery_app = make_celery()


@task_failure.connect
def _on_task_failure(sender=None, task=None, args=None, kwargs=None, einfo=None, **extra):
    """死信：任务在有限重试后仍失败 → 发送到 agent.dead 队列留档。"""
    if task is None:
        return
    dead = celery_app.tasks.get("agent.dead.record")
    if dead is not None:
        dead.apply_async(
            args=[getattr(task, "name", str(task)), args, kwargs, str(einfo) if einfo else ""],
            queue="agent.dead",
        )
