"""FastAPI 控制面（AGT-FR-001/002）+ 服务JWT鉴权接线（09-03 SJWT，ADR-0005）。

- 仅内部网络可达（生产由反向代理不暴露本服务；此处监听由部署控制）。
- SJWT-FR-004/AC-015：除`/internal/health`外所有`/internal/*`端点验证固定Next身份
  服务JWT；`/internal/ready`必须验证JWT。
- SJWT-FR-008/§6.4：run创建与proposal审核写请求在接收方事务中消费JTI，
  重复JTI统一401且不产生业务写入；业务回滚时JTI同回滚。
- SJWT-FR-006：`X-Service-Name`不再参与允许/拒绝判断（仅可作结构化日志上下文）。
- Run 创建幂等：Idempotency-Key 头 + input_hash 命中既有 Run 则原样返回（AGT-AC-002）。
- 审核决定幂等：同 Idempotency-Key 重复请求返回同一记录，只触发一次恢复（AGT-AC-003）。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..config import Settings, get_settings
from ..repositories import (
    HumanReview,
    InMemoryRepositories,
    new_id,
)
from ..security.replay import JtiReplayConflict, ServiceAuthStoreUnavailable
from ..security.service_jwt import (
    ServiceAuthInvalid,
    ServiceJwt,
    ServiceJwtClaims,
    extract_bearer_token,
)

logger = logging.getLogger("agent.api")


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
    """可注入依赖（测试用 InMemory，生产装配为 Postgres + PostgresSaver + Celery）。

    service_jwt/replay 由生产入口 agent.api.main.build_app 强制注入
    （SJWT-FR-001/AC-010：Secret 无效时启动失败）；内存单元测试装配可省略，
    省略时路由保持无JWT行为（测试接缝，生产路径不存在该分支）。
    """

    def __init__(
        self,
        repos: InMemoryRepositories | Any,
        graph_runner: Any,
        settings: Settings | None = None,
        service_jwt: ServiceJwt | None = None,
        replay: Any | None = None,
    ) -> None:
        self.repos = repos
        self.runner = graph_runner
        self.settings = settings or get_settings()
        self.service_jwt = service_jwt
        self.replay = replay


class _AuthDenied(Exception):
    """内部信号：Bearer缺失/验证失败/JTI重放 → 统一401（FR-009）。"""


def _service_auth_response(status_code: int, error: str) -> JSONResponse:
    """SJWT §8.3：统一错误体 + Cache-Control: no-store；不区分失败原因（FR-009/NFR-006）。"""
    return JSONResponse(status_code=status_code, content={"error": error}, headers={"Cache-Control": "no-store"})


def create_app(deps: AppDeps) -> FastAPI:
    # 复审缺漏一/SJWT-AC-015：关闭全部文档与OpenAPI入口（生产与测试装配一致，
    # 不新增环境开关）；/internal/health保持唯一免JWT内部端点。
    app = FastAPI(title="PolicyOps Agent Runtime", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)

    def _handle_auth_denied(request: Request, exc: Exception) -> JSONResponse:
        return _service_auth_response(401, "SERVICE_AUTH_INVALID")

    def _handle_store_unavailable(request: Request, exc: Exception) -> JSONResponse:
        # 存储不可用属基础设施失败：失败关闭（NFR-004），绝不回退Header信任。
        category = exc.category if isinstance(exc, ServiceAuthStoreUnavailable) else "unknown"
        logger.warning("service_auth_store_unavailable category=%s", category)
        return _service_auth_response(503, "SERVICE_AUTH_STORE_UNAVAILABLE")

    app.add_exception_handler(_AuthDenied, _handle_auth_denied)
    app.add_exception_handler(ServiceAuthStoreUnavailable, _handle_store_unavailable)

    def require_service_jwt(request: Request) -> ServiceJwtClaims | None:
        """SJWT-FR-004/AC-015：验证固定Next身份Bearer令牌。

        验证后只向业务层传递规范化claims（§8.2）；日志只记录方向/结果/issuer/
        subject/jti/稳定类别，绝不记录令牌、Header或Secret（§10/NFR-006）。
        """
        if deps.service_jwt is None:
            return None  # 内存单元测试接缝（见AppDeps docstring）
        token = extract_bearer_token(request.headers.get("Authorization"))
        if token is None:
            logger.info("service_jwt deny direction=next-to-agent category=missing-bearer")
            raise _AuthDenied()
        try:
            claims = deps.service_jwt.verify_next_token(token)
        except ServiceAuthInvalid:
            logger.info("service_jwt deny direction=next-to-agent category=verification-failed")
            raise _AuthDenied() from None
        logger.info(
            "service_jwt ok direction=next-to-agent issuer=%s subject=%s jti=%s",
            claims.iss,
            claims.sub,
            claims.jti,
        )
        return claims

    def _execute_write(claims: ServiceJwtClaims | None, work_fn):
        """接收方事务端口（§6.3）：JWT启用时JTI消费与业务写入同事务（replay.with_jti）。"""
        if claims is None:
            return work_fn(None)
        if deps.replay is None:
            raise ServiceAuthStoreUnavailable("replay-store-missing")
        try:
            return deps.replay.with_jti(claims, work_fn)
        except JtiReplayConflict:
            logger.info("service_jwt deny direction=next-to-agent category=jti-replay")
            raise _AuthDenied() from None

    @app.get("/internal/health")
    def health() -> dict[str, str]:
        # AC-015：唯一免JWT的内部端点（部署健康探针）。
        return {"status": "ok"}

    @app.get("/internal/ready")
    def ready(request: Request) -> dict[str, str]:
        # 就绪 = 依赖配置可读（数据库/Redis连通性由部署探针与 ready 扩展点覆盖）；FR-004：必须JWT。
        require_service_jwt(request)
        return {"status": "ready"}

    @app.post("/internal/v1/agent-runs", response_model=CreateRunResponse)
    def create_run(
        req: CreateRunRequest,
        request: Request,
        idempotency_key: str = Header(default=""),
    ) -> CreateRunResponse:
        claims = require_service_jwt(request)
        if not idempotency_key:
            raise HTTPException(status_code=400, detail="Idempotency-Key header required")

        def business(conn):
            existing = deps.repos.find_by_idempotency_key(idempotency_key)
            if existing:
                return CreateRunResponse(
                    run_id=existing.id, thread_id=existing.thread_id, status=existing.status, idempotent=True
                ), None
            run = deps.repos.create_run_in_tx(conn, _new_run(idempotency_key, req))
            return CreateRunResponse(run_id=run.id, thread_id=run.thread_id, status=run.status), run

        response, created = _execute_write(claims, business)
        # 图执行由装配方注入 dispatcher（API 进程只入队/调度，不执行耗时任务）——提交后触发。
        if created is not None:
            dispatcher = getattr(deps, "dispatch", None)
            if dispatcher:
                dispatcher(created)
        return response

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
    def get_run(run_id: str, request: Request) -> dict[str, Any]:
        require_service_jwt(request)
        run = deps.repos.get(run_id)
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
    def get_proposal(proposal_id: str, request: Request) -> dict[str, Any]:
        require_service_jwt(request)
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
        request: Request,
        idempotency_key: str = Header(default=""),
    ) -> dict[str, Any]:
        claims = require_service_jwt(request)
        if req.decision not in ("approve", "edit-and-approve", "reject"):
            raise HTTPException(status_code=422, detail="invalid decision")

        def business(conn):
            proposal = deps.repos.proposals.get(proposal_id)
            if not proposal:
                raise HTTPException(status_code=404, detail="proposal not found")

            # 审核幂等（AGT-AC-003）：同键只产生一次恢复（JTI重放由外层先拒绝）。
            prior = deps.repos.find_review_by_idempotency_key(idempotency_key) if idempotency_key else None
            if prior:
                return {"review_id": prior.id, "proposal_id": proposal_id, "resumed": False, "idempotent": True}

            key = idempotency_key or f"{proposal_id}:{new_id()}"

            review = deps.repos.create_review_in_tx(
                conn,
                HumanReview(
                    id=new_id(),
                    proposal_id=proposal_id,
                    decision=req.decision,
                    patch=req.patch,
                    reason=req.reason,
                    actor_id="admin",  # 生产由 Next 转发的管理员身份注入。
                    idempotency_key=key,
                ),
                run_id=proposal.run_id,
                run_status="approved" if req.decision != "reject" else "rejected",
            )
            # 恢复触发与业务写入同事务：失败则整体回滚（含JTI），调用方可新令牌重试（AC-013）。
            resume = getattr(deps, "resume_review", None)
            resumed = False
            if resume:
                resumed = bool(
                    resume(proposal.run_id, {
                        "decision": req.decision,
                        "reason": req.reason,
                        "patch": req.patch,
                        "actor_id": "admin",
                        "idempotency_key": key,
                    })
                )
            return {"review_id": review.id, "proposal_id": proposal_id, "resumed": resumed, "idempotent": False}

        return _execute_write(claims, business)

    return app
