"""Agent Runtime 配置（AGT-FR-001/011）。环境变量前缀 AGENT_。"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", env_file=None, extra="ignore")

    # 数据库（agent 角色；core schema 不可访问由 GRANT 保证）
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ssp_ci"
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    # Next Core 内部 API（服务身份）
    core_base_url: str = "http://localhost:3000"
    core_service_name: str = "agent-runtime"
    core_timeout_seconds: float = 10.0
    # 工作流
    workflow_version: str = "policyops-graph-v1"
    max_verify_retries: int = 2
    # 队列
    task_max_retries: int = 3


def get_settings() -> Settings:
    return Settings()
