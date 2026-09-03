"""FastAPI 控制面（AGT-FR-001/002）：health/ready、Run 创建与查询、提案查询、审核决定。

- 仅内部网络可达（生产由反向代理不暴露本服务；此处监听由部署控制）。
- Run 创建幂等：Idempotency-Key 头 + input_hash 命中既有 Run 则原样返回（AGT-AC-002）。
- 审核决定幂等：同 Idempotency-Key 重复请求返回同一记录，只触发一次恢复（AGT-AC-003）。
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from ..config import Settings, get_settings
from ..repositories import (
    HumanReview,
    InMemoryRepositories,
    new_id,
)


class CreateRunRequest(BaseModel):
    jurisdiction_code: str = "310000"
    as_of_date: str
    payload: dict[str, Any] = {}


class CreateRunResponse(BaseModel):
    run_id: str
    thread_id: str
    status: str
    idempotent: bool = False


class ReviewRequest(BaseModel):
    decision: str  # approve | edit-and-approve | reject
    reason: str = ""
    patch: dict[str, Any] | None = None


class AppDeps:
    """可注入依赖（测试用 InMemory，生产装配为 Postgres + PostgresSaver + Celery）。"""

    def __init__(
        self,
        repos: InMemoryRepositories | Any,
        graph_runner: Any,
        settings: Settings | None = None,
    ) -> None:
        self.repos = repos
        self.runner = graph_runner
        self.settings = settings or get_settings()


def create_app(deps: AppDeps) -> FastAPI:
    app = FastAPI(title="PolicyOps Agent Runtime", version="0.1.0", docs_url="/internal/docs")

    @app.get("/internal/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/internal/ready")
    def ready() -> dict[str, str]:
        # 就绪 = 依赖配置可读（数据库/Redis连通性由部署探针与 ready 扩展点覆盖）。
        return {"status": "ready"}

    @app.post("/internal/v1/agent-runs", response_model=CreateRunResponse)
    def create_run(
        req: CreateRunRequest,
        idempotency_key: str = Header(default=""),
    ) -> CreateRunResponse:
        if not idempotency_key:
            raise HTTPException(status_code=400, detail="Idempotency-Key header required")

        existing = deps.repos.runs.find_by_idempotency_key(idempotency_key)
        if existing:
            return CreateRunResponse(
                run_id=existing.id, thread_id=existing.thread_id, status=existing.status, idempotent=True
            )

        run = deps.repos.create(_new_run(idempotency_key, req))
        # 触发图执行（API 进程只入队/调度，不执行耗时任务——由装配方注入 dispatcher）。
        dispatcher = getattr(deps, "dispatch", None)
        if dispatcher:
            dispatcher(run)
        return CreateRunResponse(run_id=run.id, thread_id=run.thread_id, status=run.status)

    def _new_run(idempotency_key: str, req: CreateRunRequest):
        from ..repositories import AgentRun, input_hash

        return AgentRun(
            id=new_id(),
            thread_id=new_id(),
            workflow_version=deps.settings.workflow_version,
            input_hash=input_hash(req.payload),
            idempotency_key=idempotency_key,
            status="queued",
        )

    @app.get("/internal/v1/agent-runs/{run_id}")
    def get_run(run_id: str) -> dict[str, Any]:
        run = deps.repos.runs.get(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="run not found")
        return {
            "run_id": run.id,
            "thread_id": run.thread_id,
            "status": run.status,
            "current_node": run.current_node,
            "workflow_version": run.workflow_version,
            "error": run.error,
        }

    @app.get("/internal/v1/proposals/{proposal_id}")
    def get_proposal(proposal_id: str) -> dict[str, Any]:
        proposal = deps.repos.proposals.get(proposal_id)
        if not proposal:
            raise HTTPException(status_code=404, detail="proposal not found")
        return {
            "proposal_id": proposal.id,
            "run_id": proposal.run_id,
            "status": proposal.status,
            "jurisdiction_code": proposal.jurisdiction_code,
            "draft_bundle": proposal.draft_bundle,
        }

    @app.post("/internal/v1/proposals/{proposal_id}/review")
    def review_proposal(
        proposal_id: str,
        req: ReviewRequest,
        idempotency_key: str = Header(default=""),
    ) -> dict[str, Any]:
        if req.decision not in ("approve", "edit-and-approve", "reject"):
            raise HTTPException(status_code=422, detail="invalid decision")
        proposal = deps.repos.proposals.get(proposal_id)
        if not proposal:
            raise HTTPException(status_code=404, detail="proposal not found")

        # 审核幂等（AGT-AC-003）：同键只产生一次恢复。
        prior = deps.repos.reviews.find_by_idempotency_key(idempotency_key) if idempotency_key else None
        if prior:
            return {"review_id": prior.id, "proposal_id": proposal_id, "resumed": False, "idempotent": True}

        if not idempotency_key:
            idempotency_key = f"{proposal_id}:{new_id()}"

        review = deps.repos.reviews.create(
            HumanReview(
                id=new_id(),
                proposal_id=proposal_id,
                decision=req.decision,
                patch=req.patch,
                reason=req.reason,
                actor_id="admin",  # 生产由 Next 转发的管理员身份注入。
                idempotency_key=idempotency_key,
            )
        )
        deps.repos.runs.update_status(proposal.run_id, "approved" if req.decision != "reject" else "rejected")
        resume = getattr(deps, "resume_review", None)
        resumed = False
        if resume:
            resumed = bool(
                resume(proposal.run_id, {
                    "decision": req.decision,
                    "reason": req.reason,
                    "patch": req.patch,
                    "actor_id": "admin",
                    "idempotency_key": idempotency_key,
                })
            )
        return {"review_id": review.id, "proposal_id": proposal_id, "resumed": resumed, "idempotent": False}

    return app
