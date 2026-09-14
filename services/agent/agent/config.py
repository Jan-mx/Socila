"""Agent Runtime 配置（AGT-FR-001/011）。环境变量前缀 AGENT_。"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", env_file=None, extra="ignore")

    # 数据库（agent 角色；core schema 不可访问由 GRANT 保证）
    database_url: str = "postgresql://postgres:postgres@localhost:5432/socila_ci"
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    # Next Core 内部 API（服务身份）
    core_base_url: str = "http://localhost:3000"
    core_service_name: str = "agent-runtime"
    core_timeout_seconds: float = 10.0
    # 服务JWT（SJWT-FR-001）：与Web共用同名Secret变量；current必填≥32字节，
    # previous可选（轮换期验证旧签名）。缺失或无效时生产装配启动失败（AC-010）。
    service_jwt_current: str = ""
    service_jwt_previous: str = ""
    # 工作流
    workflow_version: str = "policyops-graph-v1"
    max_verify_retries: int = 2
    # 队列
    task_max_retries: int = 3
    # 控制面监听（Dockerfile CMD 使用）
    api_host: str = "0.0.0.0"
    api_port: int = 8100


def get_settings() -> Settings:
    return Settings()
