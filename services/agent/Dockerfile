# PolicyOps Agent Runtime（FastAPI + Celery 共用镜像，REL-FR-001）
# 构建上下文=services/agent：docker build -f services/agent/Dockerfile -t agent:latest services/agent
FROM python:3.11-slim AS build
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
RUN useradd --create-home appuser
COPY --from=build /app/.venv ./.venv
COPY agent ./agent
COPY scripts ./scripts
COPY pyproject.toml ./
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 8100
# 默认启动控制面；worker/beat 由 compose 覆盖 command
CMD ["uvicorn", "agent.api.main:app", "--host", "0.0.0.0", "--port", "8100"]
