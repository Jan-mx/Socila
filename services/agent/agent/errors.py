"""错误分类与稳定错误映射（AGT-FR-011 / AGT-AC-005/006，PRD §11）。

- 网络超时、429、503：可重试（指数退避，有限次数）。
- 401、403、Schema/校验错误：不重试，记录为安全/确定性错误。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ErrorKind(StrEnum):
    RETRYABLE = "retryable"
    NON_RETRYABLE = "non-retryable"


@dataclass
class ErrorClassification:
    kind: ErrorKind
    safe_message: str  # 不含密钥/Authorization/完整文档


class NonRetryableError(Exception):
    """401/403/Schema 等确定性错误——直接失败，不重试。"""


def classify_error(err: BaseException | None) -> ErrorClassification:
    status = getattr(err, "status_code", None) or getattr(err, "status", None)
    if status is None:
        response = getattr(err, "response", None)
        status = getattr(response, "status_code", None)
    code = getattr(err, "code", None)
    message = str(err) if err else "unknown"

    if status in (401, 403):
        return ErrorClassification(ErrorKind.NON_RETRYABLE, f"auth error {status}")
    if isinstance(err, NonRetryableError):
        return ErrorClassification(ErrorKind.NON_RETRYABLE, message)
    if status in (429, 503):
        return ErrorClassification(ErrorKind.RETRYABLE, f"upstream busy {status}")
    if status is not None and isinstance(status, int) and 400 <= status < 500:
        # 其他 4xx（含 422 Schema 错误）不重试。
        return ErrorClassification(ErrorKind.NON_RETRYABLE, f"client error {status}")
    if code in ("ECONNREFUSED", "ETIMEDOUT", "ECONNRESET") or "timeout" in message.lower():
        return ErrorClassification(ErrorKind.RETRYABLE, "network timeout")

    return ErrorClassification(ErrorKind.RETRYABLE, "transient upstream error")
