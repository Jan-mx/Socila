"""Core↔Agent 服务JWT（09-03 SJWT，ADR-0005）：固定HS256内部服务令牌。

协议常量（PRD §6.1）：
- 仅允许HS256；Header必须alg=HS256且typ=JWT（拒绝none/其他算法/缺失typ/算法混淆）。
- TTL固定300秒（exp=iat+300）；时钟偏差最多30秒。
- Next→Agent：iss=socila-next-core、aud=policy-agent、sub=next-core。
- Agent→Core：iss=policy-agent、aud=socila-next-core、sub=agent-runtime。

安全约束（SJWT-NFR-001～006）：
- 验签显式固定算法列表["HS256"]，不按令牌Header动态选择算法。
- 验证依次尝试current、previous；签发只使用current；失败统一ServiceAuthInvalid
  （public_code恒为SERVICE_AUTH_INVALID，不区分失败原因，不暴露匹配了哪个Secret）；
  category仅供内部日志/指标（§10）。
- 异常与返回值不得包含原始令牌、Header、Secret或签名片段（NFR-006）。
- Clock/UUID可注入（NFR-005），生产默认系统时钟与uuid4，测试零真实等待。
"""

from __future__ import annotations

import re
import time
import uuid as _uuid
from collections.abc import Callable
from dataclasses import dataclass

import jwt as _pyjwt

SERVICE_JWT_TTL_SECONDS = 300
SERVICE_JWT_CLOCK_SKEW_SECONDS = 30
# 测试/装配侧惯用短名（同一常量）。
CLOCK_SKEW_SECONDS = SERVICE_JWT_CLOCK_SKEW_SECONDS

UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class ServiceIdentity(dict):
    """固定服务身份（SJWT-FR-004/005）：iss/aud/sub的dict（可直接{**展开}）+ 属性访问。"""

    def __init__(self, issuer: str, audience: str, subject: str) -> None:
        super().__init__(iss=issuer, aud=audience, sub=subject)
        self.issuer = issuer
        self.audience = audience
        self.subject = subject

    def as_claims(self) -> dict[str, str]:
        return dict(self)


NEXT_IDENTITY = ServiceIdentity("socila-next-core", "policy-agent", "next-core")
AGENT_IDENTITY = ServiceIdentity("policy-agent", "socila-next-core", "agent-runtime")


class ServiceJwtConfigError(Exception):
    """配置无效：服务必须启动失败（SJWT-FR-001/AC-010）。消息不含Secret内容。"""


class ServiceAuthInvalid(Exception):
    """统一服务鉴权失败（SJWT-FR-009）：HTTP 401 SERVICE_AUTH_INVALID。"""

    public_code = "SERVICE_AUTH_INVALID"

    def __init__(self, category: str) -> None:
        super().__init__(self.public_code)
        # category：稳定失败类别，仅用于内部日志与指标，绝不进入响应或客户端可见错误（§10）。
        self.category = category


@dataclass
class ServiceJwtClaims:
    """规范化claims（SJWT §8.2）：验证后只向业务层传递这些字段。"""

    iss: str
    aud: str
    sub: str
    jti: str
    iat: int
    exp: int
    verified_by: str = "current"  # current|previous，仅内部指标（FR-007），不返回客户端


def _system_now() -> int:
    return int(time.time())


def _system_uuid4() -> str:
    return str(_uuid.uuid4())


def validate_service_jwt_secrets(current: str | None, previous: str | None = None) -> None:
    """SJWT-FR-001/NFR-003/AC-010：current必填且不少于32 UTF-8字节；
    previous可选，提供时必须不少于32字节且不得与current相同。"""
    if not isinstance(current, str) or current == "":
        raise ServiceJwtConfigError("AGENT_SERVICE_JWT_CURRENT is required")
    if len(current.encode("utf-8")) < 32:
        raise ServiceJwtConfigError("AGENT_SERVICE_JWT_CURRENT must be at least 32 UTF-8 bytes")
    if previous is not None and previous != "":
        if len(previous.encode("utf-8")) < 32:
            raise ServiceJwtConfigError("AGENT_SERVICE_JWT_PREVIOUS must be at least 32 UTF-8 bytes")
        if previous == current:
            raise ServiceJwtConfigError("AGENT_SERVICE_JWT_PREVIOUS must differ from AGENT_SERVICE_JWT_CURRENT")


def extract_bearer_token(authorization: str | None) -> str | None:
    """SJWT-FR-006：解析Authorization Bearer令牌；缺失或格式错误返回None。"""
    if not isinstance(authorization, str) or len(authorization) < 7:
        return None
    scheme, sep, rest = authorization[:6], authorization[6:7], authorization[7:]
    if scheme.lower() != "bearer" or sep not in (" ", "\t"):
        return None
    if rest == "" or any(c.isspace() for c in rest):
        return None
    return rest


class ServiceJwt:
    """固定身份的服务JWT签发/验证器（SJWT-FR-002/003/007，Clock/UUID可注入）。"""

    def __init__(
        self,
        current: str,
        previous: str | None = None,
        *,
        now: Callable[[], int] | None = None,
        uuid4: Callable[[], str] | None = None,
    ) -> None:
        validate_service_jwt_secrets(current, previous)
        self._current = current
        self._previous = previous if previous else None
        self._now = now or _system_now
        self._uuid4 = uuid4 or _system_uuid4

    # ── 签发（SJWT-FR-007：只使用current）───────────────────────────────────

    def _sign(self, identity: ServiceIdentity) -> str:
        iat = self._now()
        payload = {
            **identity.as_claims(),
            "jti": self._uuid4(),
            "iat": iat,
            "exp": iat + SERVICE_JWT_TTL_SECONDS,
        }
        return _pyjwt.encode(
            payload,
            self._current.encode("utf-8"),
            algorithm="HS256",
            headers={"typ": "JWT"},  # SJWT-FR-002：Header必须typ=JWT
        )

    def sign_next_token(self) -> str:
        """Next Core → Agent 方向（SJWT-FR-004）。"""
        return self._sign(NEXT_IDENTITY)

    def sign_agent_token(self) -> str:
        """Agent → Core 方向（SJWT-FR-005）。"""
        return self._sign(AGENT_IDENTITY)

    # ── 验证 ────────────────────────────────────────────────────────────────

    def verify_next_token(self, token: str) -> ServiceJwtClaims:
        """验证Next→Agent固定身份令牌（SJWT-FR-004/AC-001）。"""
        return self._verify(token, NEXT_IDENTITY)

    def verify_agent_token(self, token: str) -> ServiceJwtClaims:
        """验证Agent→Core固定身份令牌（SJWT-FR-005/AC-002）。"""
        return self._verify(token, AGENT_IDENTITY)

    def _verify(self, token: str, identity: ServiceIdentity) -> ServiceJwtClaims:
        candidates: list[tuple[str, str]] = [(self._current, "current")]
        if self._previous:
            candidates.append((self._previous, "previous"))
        for secret, source in candidates:
            claims = self._attempt_verify(token, secret, identity)
            if claims is not None:
                claims.verified_by = source  # 仅内部指标（FR-007），不返回客户端
                return claims
        # SJWT-FR-009：统一失败——不暴露失败于哪个Secret、不区分原因细节。
        raise ServiceAuthInvalid("verification-failed")

    def _attempt_verify(self, token: str, secret: str, identity: ServiceIdentity) -> ServiceJwtClaims | None:
        if not isinstance(token, str) or token.count(".") != 2:
            return None
        # SJWT-FR-002/AC-004：固定Header预检（none/其他算法/缺失typ一律拒绝）。
        try:
            header = _pyjwt.get_unverified_header(token)
        except _pyjwt.PyJWTError:
            return None
        if header.get("alg") != "HS256" or header.get("typ") != "JWT":
            return None
        try:
            payload = _pyjwt.decode(
                token,
                key=secret.encode("utf-8"),
                algorithms=["HS256"],  # SJWT-NFR-001：显式固定算法，禁止协商
                options={"verify_aud": False, "verify_exp": False},
            )
        except _pyjwt.PyJWTError:
            return None

        jti, iat, exp = payload.get("jti"), payload.get("iat"), payload.get("exp")
        if (
            payload.get("iss") != identity.issuer
            or payload.get("aud") != identity.audience
            or payload.get("sub") != identity.subject
            or not isinstance(jti, str)
            or not UUID_V4_RE.fullmatch(jti)
            or not isinstance(iat, int)
            or not isinstance(exp, int)
        ):
            return None
        # SJWT-FR-003/NFR-002/AC-008：TTL固定300秒，不允许额外放宽。
        if exp - iat != SERVICE_JWT_TTL_SECONDS:
            return None
        # 期限检查绑定注入时钟（NFR-005）：decode已禁用真实时钟exp校验。
        now = self._now()
        if iat > now + SERVICE_JWT_CLOCK_SKEW_SECONDS:
            return None
        if exp < now - SERVICE_JWT_CLOCK_SKEW_SECONDS:
            return None
        return ServiceJwtClaims(
            iss=identity.issuer,
            aud=identity.audience,
            sub=identity.subject,
            jti=jti,
            iat=iat,
            exp=exp,
        )
