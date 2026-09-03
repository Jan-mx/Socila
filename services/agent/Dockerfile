# PolicyOps Agent Runtime（FastAPI + Celery 共用镜像，REL-FR-001 / 09-03 PMG-FR-031）
# 构建上下文=services/agent：docker build -f services/agent/Dockerfile -t agent:latest services/agent
#
# 镜像加固（PMG-FR-031）：
# - uv 只存在于 build stage（构建工具链固定 0.12.7，与 CI 一致）。
# - 最终运行镜像删除全局 pip/setuptools/wheel 构建工具（运行 venv 独立于
#   系统 site-packages，不受影响），保留非 root 用户与运行所需 venv。
FROM python:3.11-slim AS build
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:0.12.7 /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
# 更新可修复的 OS 安全包（Trivy 门禁：存在已有修复版本的 HIGH/CRITICAL 必须消除），
# 然后删除全局 pip/setuptools/wheel 构建工具（运行 venv 独立，不受影响）
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home appuser \
    && pip uninstall -y pip setuptools wheel \
    && rm -rf /root/.cache/pip
COPY --from=build /app/.venv ./.venv
COPY agent ./agent
COPY scripts ./scripts
COPY pyproject.toml ./
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 8100
# 默认启动控制面；worker/beat 由 compose 覆盖 command
CMD ["uvicorn", "agent.api.main:app", "--host", "0.0.0.0", "--port", "8100"]
