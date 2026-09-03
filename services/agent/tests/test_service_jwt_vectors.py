"""SJWT双栈契约互验（PRD §12交付物，SJWT-FR-004~006/009、AC-015/016）：
Python实现验证 testdata/service-jwt-vectors.json 中全部Node签发固定向量
（两方向 × current/previous，claims精确匹配、verified_by正确），
并拒绝跨方向/alg=none/已过期拒绝向量。

向量为测试专用固定值（非生产Secret）；固定时钟与向量生成时刻一致（NFR-005）。
纯文件读取+密码学验证，无数据库/网络依赖，运行于单元套件（不打integration标记）。
对称方向（Node验证Python向量）由 service-jwt-vectors.contract.test.ts 覆盖。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent.security.service_jwt import (
    AGENT_IDENTITY,
    NEXT_IDENTITY,
    SERVICE_JWT_TTL_SECONDS,
    ServiceAuthInvalid,
    ServiceJwt,
)

VECTORS_PATH = Path(__file__).resolve().parents[3] / "testdata" / "service-jwt-vectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
FIXED_NOW: int = VECTORS["fixedNow"]


@pytest.fixture(scope="module")
def svc() -> ServiceJwt:
    """验证器：current+previous双Secret，固定时钟=向量生成时刻。"""
    return ServiceJwt(
        VECTORS["testSecrets"]["current"],
        VECTORS["testSecrets"]["previous"],
        now=lambda: FIXED_NOW,
    )


def _expect_exact_claims(claims, identity: dict, jti: str) -> None:
    assert claims.iss == identity["iss"]
    assert claims.aud == identity["aud"]
    assert claims.sub == identity["sub"]
    assert claims.jti == jti
    assert claims.iat == FIXED_NOW
    assert claims.exp == FIXED_NOW + VECTORS["protocol"]["ttlSeconds"]


def test_vector_file_protocol_constants_match_module() -> None:
    """向量文件协议常量与模块固定值同源（防向量与实现漂移）。"""
    assert VECTORS["identities"]["nextToAgent"] == {
        "iss": NEXT_IDENTITY["iss"],
        "aud": NEXT_IDENTITY["aud"],
        "sub": NEXT_IDENTITY["sub"],
    }
    assert VECTORS["identities"]["agentToCore"] == {
        "iss": AGENT_IDENTITY["iss"],
        "aud": AGENT_IDENTITY["aud"],
        "sub": AGENT_IDENTITY["sub"],
    }
    assert VECTORS["protocol"]["algorithm"] == "HS256"
    assert VECTORS["protocol"]["ttlSeconds"] == SERVICE_JWT_TTL_SECONDS == 300
    assert VECTORS["fixedNow"] == 1_760_000_000


def test_node_signed_next_current_verifies_with_current_secret(svc) -> None:
    """nodeSigned.nextCurrent → Next→Agent方向、current命中、claims精确。"""
    block = VECTORS["nodeSigned"]
    claims = svc.verify_next_token(block["tokens"]["nextCurrent"])
    assert claims.verified_by == "current"
    _expect_exact_claims(claims, VECTORS["identities"]["nextToAgent"], block["jtis"]["nextCurrent"])


def test_node_signed_agent_current_verifies_with_current_secret(svc) -> None:
    """nodeSigned.agentCurrent → Agent→Core方向、current命中、claims精确。"""
    block = VECTORS["nodeSigned"]
    claims = svc.verify_agent_token(block["tokens"]["agentCurrent"])
    assert claims.verified_by == "current"
    _expect_exact_claims(claims, VECTORS["identities"]["agentToCore"], block["jtis"]["agentCurrent"])


def test_node_signed_next_previous_verifies_with_previous_secret(svc) -> None:
    """nodeSigned.nextPrevious → previous命中（仅内部指标，claims结构不变）。"""
    block = VECTORS["nodeSigned"]
    claims = svc.verify_next_token(block["tokens"]["nextPrevious"])
    assert claims.verified_by == "previous"
    _expect_exact_claims(claims, VECTORS["identities"]["nextToAgent"], block["jtis"]["nextPrevious"])


def test_node_signed_agent_previous_verifies_with_previous_secret(svc) -> None:
    """nodeSigned.agentPrevious → previous命中。"""
    block = VECTORS["nodeSigned"]
    claims = svc.verify_agent_token(block["tokens"]["agentPrevious"])
    assert claims.verified_by == "previous"
    _expect_exact_claims(claims, VECTORS["identities"]["agentToCore"], block["jtis"]["agentPrevious"])


def test_cross_direction_tokens_rejected(svc) -> None:
    """跨方向令牌拒绝：Agent身份不能通过Next验证，反之亦然（SJWT-FR-004/005）。"""
    reject = VECTORS["rejectVectors"]
    with pytest.raises(ServiceAuthInvalid):
        svc.verify_next_token(reject["wrongDirectionAgentAsNext"])
    with pytest.raises(ServiceAuthInvalid):
        svc.verify_agent_token(reject["wrongDirectionNextAsAgent"])


def test_alg_none_token_rejected_both_directions(svc) -> None:
    """alg=none令牌拒绝（两方向，SJWT-FR-002/AC-004）。"""
    none_token = VECTORS["rejectVectors"]["algNoneToken"]
    with pytest.raises(ServiceAuthInvalid):
        svc.verify_next_token(none_token)
    with pytest.raises(ServiceAuthInvalid):
        svc.verify_agent_token(none_token)


def test_expired_token_rejected_both_directions(svc) -> None:
    """已过期令牌拒绝（exp早于now-30秒，两方向，AC-008）。"""
    expired = VECTORS["rejectVectors"]["expiredToken"]
    with pytest.raises(ServiceAuthInvalid):
        svc.verify_next_token(expired)
    with pytest.raises(ServiceAuthInvalid):
        svc.verify_agent_token(expired)


def test_python_self_signed_vectors_satisfy_same_protocol(svc) -> None:
    """Python自签向量满足同一固定协议（Node侧对称验证）：四向量正确方向通过。"""
    block = VECTORS["pythonSigned"]
    assert svc.verify_next_token(block["tokens"]["nextCurrent"]).verified_by == "current"
    assert svc.verify_agent_token(block["tokens"]["agentCurrent"]).verified_by == "current"
    assert svc.verify_next_token(block["tokens"]["nextPrevious"]).verified_by == "previous"
    assert svc.verify_agent_token(block["tokens"]["agentPrevious"]).verified_by == "previous"
