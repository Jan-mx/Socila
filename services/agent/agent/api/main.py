"""生产装配入口（REL-FR-001 + 09-03 SJWT）：Postgres仓库 + Celery派发 + 服务JWT。

容器 CMD: uvicorn agent.api.main:app --host 0.0.0.0 --port 8100

SJWT-FR-001/AC-010：服务JWT Secret缺失/过短/previous与current相同时，模块级装配
直接抛 ServiceJwtConfigError 使进程启动失败——绝不回退内网Header信任（NFR-004）。
"""

from __future__ import annotations

from fastapi import FastAPI

from agent.api.app import AppDeps, create_app
from agent.config import Settings, get_settings
from agent.rag.runtime import RagRuntime
from agent.rag.storage import object_store_from_env
from agent.repositories import PostgresRepositories
from agent.security.replay import PostgresReplayGuard
from agent.security.service_jwt import ServiceJwt
from agent.worker.tasks import resume_graph, start_graph


def build_deps(settings: Settings | None = None) -> AppDeps:
    """强装配：服务JWT配置无效即抛 ServiceJwtConfigError（启动失败，AC-010）。"""
    settings = settings or get_settings()
    # SJWT-FR-001：Secret 只来自部署环境；无效配置启动失败且不输出Secret内容。
    service_jwt = ServiceJwt(settings.service_jwt_current, settings.service_jwt_previous or None)
    repos = PostgresRepositories(settings.database_url)
    # SHV2-FR-030：内部RAG读取面（搜索/原件）。容器经AGENT_MINIO_ENDPOINT（minio:9000）
    # 访问S3 API；未配置endpoint时回退内存实现（仅本地装配，不提供真实对象）。
    # SiliconFlow客户端在首次search时懒构造（服务启动不依赖外部模型凭据）。
    rag_runtime = RagRuntime(settings.database_url, object_store_from_env())
    return AppDeps(
        repos,
        graph_runner=None,
        settings=settings,
        service_jwt=service_jwt,
        # SJWT-FR-008：JTI消费与业务写入同事务（agent.service_jwt_replays）。
        replay=PostgresReplayGuard(settings.database_url),
        rag_runtime=rag_runtime,
    )


def _dispatch(run) -> None:
    start_graph.delay(run.id, run.thread_id, {
        "jurisdiction_code": "310000",
        "as_of_date": "",
        "payload": {},
    })


def _resume_review(run_id: str, decision: dict) -> bool:
    resume_graph.delay(run_id, decision.get("thread_id", ""), decision)
    return True


def build_app(settings: Settings | None = None) -> FastAPI:
    deps = build_deps(settings)
    deps.dispatch = _dispatch  # type: ignore[attr-defined]
    deps.resume_review = _resume_review  # type: ignore[attr-defined]
    return create_app(deps)


# 模块级装配：Secret缺失/无效 → import失败 → 容器启动失败（AC-010）。
deps = build_deps()
deps.dispatch = _dispatch  # type: ignore[attr-defined]
deps.resume_review = _resume_review  # type: ignore[attr-defined]
app = create_app(deps)
