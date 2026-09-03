"""Core 客户端端口（AGT-FR-007/011 + 09-03 SJWT-FR-005）：Agent 对 Core 的唯一写通道——draft 导入。

HTTP 实现：每次请求签发新的Agent身份服务JWT（新JTI，§11重试语义）、超时与trace ID；
`Idempotency-Key` 保持现有业务幂等语义；`X-Service-Name` 仅作结构化日志上下文，
不参与Core侧鉴权（SJWT-FR-006）。Fake 实现确定性、可重放（AGT-FR-012）。
"""

from __future__ import annotations

import uuid
from typing import Any, Protocol

import httpx

from .errors import NonRetryableError
from .security.service_jwt import ServiceJwt


class CoreClient(Protocol):
    def materialize_draft(
        self, bundle: dict[str, Any], idempotency_key: str, trace_id: str
    ) -> dict[str, Any]: ...


class FakeCoreClient:
    """确定性 Fake：同幂等键返回同一 draftId（副作用只发生一次）。"""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._results: dict[str, dict[str, Any]] = {}
        # 可注入的故障（AC-005/006 演练）。
        self.next_status: int | None = None

    def materialize_draft(
        self, bundle: dict[str, Any], idempotency_key: str, trace_id: str
    ) -> dict[str, Any]:
        if self.next_status is not None:
            status = self.next_status
            self.next_status = None
            err = httpx.HTTPStatusError(
                f"fake core error {status}",
                request=None,  # type: ignore[arg-type]
                response=None,  # type: ignore[arg-type]
            )
            err.status_code = status  # type: ignore[attr-defined]
            raise err

        if idempotency_key in self._results:
            self.calls.append(("replayed", bundle))
            return self._results[idempotency_key]
        draft_id = f"draft-{uuid.uuid4()}"
        result = {"draftId": draft_id, "created": True, "idempotencyKey": idempotency_key}
        self._results[idempotency_key] = result
        self.calls.append(("created", bundle))
        return result


class HttpCoreClient:
    """Agent→Core HTTP 客户端：Authorization Bearer 携带每次新签的Agent身份令牌。"""

    def __init__(
        self,
        base_url: str,
        service_name: str,
        timeout_seconds: float,
        service_jwt: ServiceJwt,
        transport: httpx.BaseTransport | None = None,  # 测试注入
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._service_name = service_name
        self._timeout = timeout_seconds
        self._service_jwt = service_jwt
        self._transport = transport

    def materialize_draft(
        self, bundle: dict[str, Any], idempotency_key: str, trace_id: str
    ) -> dict[str, Any]:
        # SJWT-FR-005/§11：每次调用（含重试）签发新JTI令牌，复用业务幂等键。
        token = self._service_jwt.sign_agent_token()
        client_kwargs: dict[str, Any] = {"timeout": self._timeout}
        if self._transport is not None:
            client_kwargs["transport"] = self._transport
        with httpx.Client(**client_kwargs) as client:
            resp = client.post(
                f"{self._base_url}/api/internal/v1/draft-imports",
                json={"bundle": bundle, "idempotencyKey": idempotency_key},
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Service-Name": self._service_name,  # 可选日志上下文，不可信（FR-006）
                    "X-Trace-Id": trace_id,
                    "Idempotency-Key": idempotency_key,
                },
            )
        if resp.status_code >= 400:
            err = httpx.HTTPStatusError(
                f"core import failed: {resp.status_code}", request=resp.request, response=resp
            )
            err.status_code = resp.status_code  # type: ignore[attr-defined]
            if resp.status_code in (401, 403) or 400 <= resp.status_code < 500:
                raise NonRetryableError(f"core import client error {resp.status_code}")
            raise err
        return resp.json()


def default_core_client(settings: Any) -> CoreClient:
    """SJWT-FR-001/AC-010：Secret 无效 → 抛 ServiceJwtConfigError（失败关闭）。"""
    service_jwt = ServiceJwt(settings.service_jwt_current, settings.service_jwt_previous or None)
    return HttpCoreClient(
        settings.core_base_url, settings.core_service_name, settings.core_timeout_seconds, service_jwt
    )
