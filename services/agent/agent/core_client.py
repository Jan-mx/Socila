"""Core 客户端端口（AGT-FR-007/011）：Agent 对 Core 的唯一写通道——draft 导入。

HTTP 实现带服务身份、超时与 trace ID；Fake 实现确定性、可重放（AGT-FR-012）。
"""

from __future__ import annotations

import uuid
from typing import Any, Protocol

import httpx

from .errors import NonRetryableError


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
    def __init__(self, base_url: str, service_name: str, timeout_seconds: float) -> None:
        self._base_url = base_url.rstrip("/")
        self._service_name = service_name
        self._timeout = timeout_seconds

    def materialize_draft(
        self, bundle: dict[str, Any], idempotency_key: str, trace_id: str
    ) -> dict[str, Any]:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(
                f"{self._base_url}/api/internal/v1/draft-imports",
                json={"bundle": bundle, "idempotencyKey": idempotency_key},
                headers={
                    "X-Service-Name": self._service_name,
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
    return HttpCoreClient(settings.core_base_url, settings.core_service_name, settings.core_timeout_seconds)
