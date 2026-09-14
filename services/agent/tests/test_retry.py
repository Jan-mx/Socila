"""重试分类（AGT-AC-005/006）：429/503/超时可重试；401/403/422 不重试。"""

from __future__ import annotations

import httpx

from agent.errors import ErrorKind, NonRetryableError, classify_error


def _http_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://core/internal")
    response = httpx.Response(status)
    return httpx.HTTPStatusError(f"status {status}", request=request, response=response)


def test_429_and_503_are_retryable():
    assert classify_error(_http_error(429)).kind is ErrorKind.RETRYABLE
    assert classify_error(_http_error(503)).kind is ErrorKind.RETRYABLE


def test_401_403_and_422_are_not_retryable():
    assert classify_error(_http_error(401)).kind is ErrorKind.NON_RETRYABLE
    assert classify_error(_http_error(403)).kind is ErrorKind.NON_RETRYABLE
    assert classify_error(_http_error(422)).kind is ErrorKind.NON_RETRYABLE


def test_timeout_is_retryable_and_schema_error_is_not():
    assert classify_error(httpx.ReadTimeout("read timeout")).kind is ErrorKind.RETRYABLE
    assert classify_error(NonRetryableError("schema validation failed")).kind is ErrorKind.NON_RETRYABLE
