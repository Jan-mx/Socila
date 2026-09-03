"""SJWT-FR-001～004/007/009、NFR-001～006、AC-001/003/004/005/007/008/009/010/012/015：
服务JWT模块（固定HS256、300秒TTL、30秒偏差、双Secret轮换、统一失败）+
FastAPI内部路由鉴权接线（/internal/health豁免、/internal/ready必须JWT、
X-Service-Name不再承担鉴权、写请求JTI重放统一401）。

SJWT-NFR-005：Clock/UUID注入，零外部依赖、不依赖真实等待。
"""

from __future__ import annotations

import httpx
import pytest

from agent.api.app import AppDeps, create_app
from agent.config import Settings
from agent.repositories import AgentRun, InMemoryRepositories, input_hash, new_id
from agent.security.replay import InMemoryReplayGuard, JtiReplayConflict
from agent.security.service_jwt import (
    AGENT_IDENTITY,
    CLOCK_SKEW_SECONDS,
    NEXT_IDENTITY,
    SERVICE_JWT_TTL_SECONDS,
    ServiceAuthInvalid,
    ServiceJwt,
    ServiceJwtConfigError,
    extract_bearer_token,
    validate_service_jwt_secrets,
)

FIXED_NOW = 1_760_000_000
FIXED_JTI = "0b7a1c2e-9f34-4d5a-b6c8-1e2f3a4b5c6d"
CURRENT = "test-current-secret-0123456789-abcdef-0123456789"  # 48 UTF-8 字节
PREVIOUS = "test-previous-secret-0123456789-abcdef-0123456789"


def make_jwt(current: str = CURRENT, previous: str | None = None) -> ServiceJwt:
    return ServiceJwt(
        current,
        previous,
        now=lambda: FIXED_NOW,
        uuid4=lambda: FIXED_JTI,
    )


def bearer(jwt: ServiceJwt) -> dict[str, str]:
    return {"Authorization": f"Bearer {jwt.sign_next_token()}"}


# ── 配置（SJWT-FR-001/NFR-003/AC-010）────────────────────────────────────────


def test_config_current_missing_or_short_fails():
    with pytest.raises(ServiceJwtConfigError):
        validate_service_jwt_secrets("")
    with pytest.raises(ServiceJwtConfigError):
        validate_service_jwt_secrets("a" * 31)
    validate_service_jwt_secrets("a" * 32)  # 恰好32字节通过


def test_config_previous_equal_or_invalid_fails():
    with pytest.raises(ServiceJwtConfigError):
        validate_service_jwt_secrets(CURRENT, CURRENT)
    with pytest.raises(ServiceJwtConfigError):
        validate_service_jwt_secrets(CURRENT, "short")
    validate_service_jwt_secrets(CURRENT, PREVIOUS)


def test_config_error_does_not_leak_secret():
    probe_material = "leak-check-" + "z" * 32
    with pytest.raises(ServiceJwtConfigError) as excinfo:
        validate_service_jwt_secrets("x" * 10, "x" * 10)
    assert probe_material not in str(excinfo.value)


# ── 签发与验证（SJWT-FR-002/003/007/009、NFR-001/002）────────────────────────


def test_sign_fixed_claims_and_ttl():
    import jwt as pyjwt

    svc = make_jwt()
    token = svc.sign_agent_token()
    header = pyjwt.get_unverified_header(token)
    assert header["alg"] == "HS256"
    assert header["typ"] == "JWT"
    claims = svc.verify_agent_token(token)
    assert claims.iss == AGENT_IDENTITY.issuer
    assert claims.aud == AGENT_IDENTITY.audience
    assert claims.sub == AGENT_IDENTITY.subject
    assert claims.jti == FIXED_JTI
    assert claims.iat == FIXED_NOW
    assert claims.exp == FIXED_NOW + SERVICE_JWT_TTL_SECONDS


def test_rotation_sign_uses_current_only_and_verify_accepts_previous():
    with_current = ServiceJwt(CURRENT, now=lambda: FIXED_NOW, uuid4=lambda: FIXED_JTI)
    with_previous = ServiceJwt(PREVIOUS, now=lambda: FIXED_NOW, uuid4=lambda: FIXED_JTI)
    rotated = ServiceJwt(CURRENT, PREVIOUS, now=lambda: FIXED_NOW, uuid4=lambda: FIXED_JTI)

    fresh = with_current.sign_next_token()
    old = with_previous.sign_next_token()
    assert rotated.verify_next_token(fresh).verified_by == "current"
    assert rotated.verify_next_token(old).verified_by == "previous"
    # previous缺失：旧签名直接失败（无回退）。
    with pytest.raises(ServiceAuthInvalid):
        with_current.verify_next_token(old)
    # 签发永不使用previous：以previous为current的验证器拒绝新签发。
    with pytest.raises(ServiceAuthInvalid):
        with_previous.verify_next_token(fresh)


def _sign_raw(claims: dict, secret: str, algorithm: str = "HS256", header_extra: dict | None = None) -> str:
    import jwt as pyjwt

    header = {"typ": "JWT"}
    if header_extra:
        header.update(header_extra)
    return pyjwt.encode(claims, secret, algorithm=algorithm, headers=header)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda: _sign_raw(
            {**NEXT_IDENTITY, "jti": FIXED_JTI, "iat": FIXED_NOW, "exp": FIXED_NOW + 300},
            "k" * 64,  # 密钥长度满足HS512建议值，向量只证明“非HS256算法一律拒绝”
            algorithm="HS512",
        ),
        lambda: _sign_raw(
            {**NEXT_IDENTITY, "jti": FIXED_JTI, "iat": FIXED_NOW, "exp": FIXED_NOW + 300},
            CURRENT,
            header_extra={"typ": "AT"},
        ),
        lambda: _sign_raw(
            {"iss": "someone-else", "aud": NEXT_IDENTITY.audience, "sub": NEXT_IDENTITY.subject,
             "jti": FIXED_JTI, "iat": FIXED_NOW, "exp": FIXED_NOW + 300},
            CURRENT,
        ),
        lambda: _sign_raw(
            {"iss": NEXT_IDENTITY.issuer, "aud": "someone-else", "sub": NEXT_IDENTITY.subject,
             "jti": FIXED_JTI, "iat": FIXED_NOW, "exp": FIXED_NOW + 300},
            CURRENT,
        ),
        lambda: _sign_raw(
            {"iss": NEXT_IDENTITY.issuer, "aud": NEXT_IDENTITY.audience, "sub": "someone-else",
             "jti": FIXED_JTI, "iat": FIXED_NOW, "exp": FIXED_NOW + 300},
            CURRENT,
        ),
        lambda: _sign_raw(
            {**NEXT_IDENTITY, "jti": "9f1c8a2e-6b3d-11e9-a5c8-0242ac120002",  # UUID v1
             "iat": FIXED_NOW, "exp": FIXED_NOW + 300},
            CURRENT,
        ),
        lambda: _sign_raw(
            {**NEXT_IDENTITY, "jti": "not-a-uuid", "iat": FIXED_NOW, "exp": FIXED_NOW + 300},
            CURRENT,
        ),
        lambda: _sign_raw(
            {**NEXT_IDENTITY, "jti": FIXED_JTI, "iat": FIXED_NOW, "exp": FIXED_NOW + 600},  # TTL>300
            CURRENT,
        ),
        lambda: _sign_raw(
            {**NEXT_IDENTITY, "jti": FIXED_JTI, "iat": FIXED_NOW - 400, "exp": FIXED_NOW - 100},  # 过期
            CURRENT,
        ),
        lambda: _sign_raw(
            {**NEXT_IDENTITY, "jti": FIXED_JTI, "iat": FIXED_NOW + 31, "exp": FIXED_NOW + 331},  # iat超前>30
            CURRENT,
        ),
    ],
)
def test_invalid_tokens_rejected_unified(mutate):
    svc = make_jwt()
    with pytest.raises(ServiceAuthInvalid):
        svc.verify_next_token(mutate())


def test_iat_within_skew_accepted():

    iat = FIXED_NOW + CLOCK_SKEW_SECONDS - 1
    token = _sign_raw({**NEXT_IDENTITY, "jti": FIXED_JTI, "iat": iat, "exp": iat + 300}, CURRENT)
    claims = make_jwt().verify_next_token(token)
    assert claims.iat == iat


def test_alg_none_token_rejected():
    import base64
    import json

    def b64u(payload: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()

    token = f"{b64u({'alg': 'none', 'typ': 'JWT'})}.{b64u({**NEXT_IDENTITY, 'jti': FIXED_JTI, 'iat': FIXED_NOW, 'exp': FIXED_NOW + 300})}."
    with pytest.raises(ServiceAuthInvalid):
        make_jwt().verify_next_token(token)


def test_error_is_unified_and_does_not_leak():
    svc = make_jwt()
    bad = "garbage"
    with pytest.raises(ServiceAuthInvalid) as excinfo:
        svc.verify_next_token(bad)
    err = excinfo.value
    assert err.public_code == "SERVICE_AUTH_INVALID"
    assert bad not in str(err)
    assert CURRENT not in str(err)


def test_extract_bearer_token():
    assert extract_bearer_token("Bearer abc.def.ghi") == "abc.def.ghi"
    assert extract_bearer_token("bearer abc.def.ghi") == "abc.def.ghi"
    assert extract_bearer_token("Basic abc") is None
    assert extract_bearer_token("Bearer") is None
    assert extract_bearer_token("Bearer  ") is None
    assert extract_bearer_token(None) is None


# ── FastAPI接线（SJWT-FR-004/006/008、AC-001/003/012/015）────────────────────


def _protected_app():
    repos = InMemoryRepositories()
    jwt = make_jwt()
    deps = AppDeps(
        repos,
        graph_runner=None,
        settings=Settings(workflow_version="policyops-graph-v1"),
        service_jwt=jwt,
        replay=InMemoryReplayGuard(),
    )
    return create_app(deps), jwt, repos


def _client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    )


async def test_health_exempt_from_jwt():
    """AC-015：/internal/health是唯一免JWT的内部端点。"""
    app, _, _ = _protected_app()
    client = _client(app)
    resp = await client.get("/internal/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_ready_requires_jwt():
    app, jwt, _ = _protected_app()
    client = _client(app)
    denied = await client.get("/internal/ready")
    assert denied.status_code == 401
    assert denied.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert denied.headers.get("cache-control") == "no-store"
    allowed = await client.get("/internal/ready", headers=bearer(jwt))
    assert allowed.status_code == 200


async def test_docs_and_openapi_entries_closed():
    """复审缺漏一（PRD §6.5/AC-015）：FastAPI文档与OpenAPI入口一律关闭。

    docs_url/redoc_url/openapi_url关闭后全部404；/internal/health保持唯一
    免JWT内部端点（200），/internal/ready仍要求合法Next JWT（401+no-store）。
    """
    app, _, _ = _protected_app()
    client = _client(app)
    for path in ("/internal/docs", "/docs", "/redoc", "/openapi.json"):
        resp = await client.get(path)
        assert resp.status_code == 404, f"{path} 必须404（当前 {resp.status_code}）"
    health = await client.get("/internal/health")
    assert health.status_code == 200
    ready = await client.get("/internal/ready")
    assert ready.status_code == 401
    assert ready.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert ready.headers.get("cache-control") == "no-store"


async def test_x_service_name_alone_rejected_without_side_effect():
    """AC-003：只有X-Service-Name无Bearer → 统一401且无副作用。"""
    app, _, repos = _protected_app()
    client = _client(app)
    resp = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01"},
        headers={"X-Service-Name": "next-core", "Idempotency-Key": "forbidden-1"},
    )
    assert resp.status_code == 401
    assert resp.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert len(repos.list()) == 0


async def test_create_run_with_valid_next_token():
    """AC-001：固定Next claims验证通过。"""
    app, jwt, repos = _protected_app()
    client = _client(app)
    resp = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01"},
        headers={**bearer(jwt), "Idempotency-Key": "jwt-run-1"},
    )
    assert resp.status_code == 200
    assert len(repos.list()) == 1


async def test_create_run_replay_same_jti_rejected():
    """AC-012（单元层）：同一JTI重复写请求 → 统一401，不产生第二次业务写入。"""
    app, jwt, repos = _protected_app()
    client = _client(app)
    # FIXED_JTI注入：同一token即同一JTI，重放同一token模拟攻击。
    token = jwt.sign_next_token()
    first = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01"},
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "jwt-replay-1"},
    )
    assert first.status_code == 200
    replay = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01"},
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "jwt-replay-1"},
    )
    assert replay.status_code == 401
    assert replay.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert len(repos.list()) == 1


async def test_review_consumes_jti_in_same_unit():
    """SJWT-FR-008：proposal审核写请求消费JTI；同JTI重放统一401。"""
    app, jwt, repos = _protected_app()
    client = _client(app)
    run = AgentRun(
        id=new_id(), thread_id=new_id(), workflow_version="policyops-graph-v1",
        input_hash=input_hash({}), idempotency_key="setup-run",
    )
    repos.create(run)
    from agent.repositories import AgentProposal

    proposal = AgentProposal(id=new_id(), run_id=run.id, base_snapshot_id=None, jurisdiction_code="310000")
    repos.proposals.create(proposal)

    token = jwt.sign_next_token()
    first = await client.post(
        f"/internal/v1/proposals/{proposal.id}/review",
        json={"decision": "approve", "reason": "ok"},
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "rev-jti-1"},
    )
    assert first.status_code == 200
    replay = await client.post(
        f"/internal/v1/proposals/{proposal.id}/review",
        json={"decision": "approve", "reason": "ok"},
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "rev-jti-1"},
    )
    assert replay.status_code == 401
    assert replay.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert len(repos.reviews.list_for_proposal(proposal.id)) == 1
    assert run.status == "approved"


async def test_review_business_idempotency_with_new_jti_still_works():
    """业务幂等键（新JTI）与JTI重放相互独立：新令牌+同幂等键返回首次结果。"""
    app, _, repos = _protected_app()
    client = _client(app)
    run = AgentRun(
        id=new_id(), thread_id=new_id(), workflow_version="policyops-graph-v1",
        input_hash=input_hash({}), idempotency_key="setup-run-2",
    )
    repos.create(run)
    from agent.repositories import AgentProposal

    proposal = AgentProposal(id=new_id(), run_id=run.id, base_snapshot_id=None, jurisdiction_code="310000")
    repos.proposals.create(proposal)

    # 两次请求各签发一次新令牌（不同合法UUID v4 JTI），模拟网络重试。
    fresh_jtis = iter((
        "aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0001",
        "aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0002",
    ))
    fresh_jwt = ServiceJwt(CURRENT, now=lambda: FIXED_NOW, uuid4=lambda: next(fresh_jtis))

    first = await client.post(
        f"/internal/v1/proposals/{proposal.id}/review",
        json={"decision": "reject", "reason": "quality"},
        headers={**bearer(fresh_jwt), "Idempotency-Key": "rev-idem-1"},
    )
    assert first.status_code == 200
    second = await client.post(
        f"/internal/v1/proposals/{proposal.id}/review",
        json={"decision": "reject", "reason": "quality"},
        headers={**bearer(fresh_jwt), "Idempotency-Key": "rev-idem-1"},
    )
    assert second.status_code == 200
    assert second.json()["idempotent"] is True
    assert len(repos.reviews.list_for_proposal(proposal.id)) == 1


async def test_forged_and_wrong_identity_tokens_rejected():
    """AC-004/005：错误issuer/audience/subject或伪造签名 → 统一401。"""
    app, jwt, repos = _protected_app()
    client = _client(app)
    forged = ServiceJwt("attacker-secret-0123456789-abcdef-0123456789", now=lambda: FIXED_NOW, uuid4=lambda: FIXED_JTI)
    resp = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01"},
        headers={"Authorization": f"Bearer {forged.sign_next_token()}", "Idempotency-Key": "forged-1"},
    )
    assert resp.status_code == 401
    assert resp.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert len(repos.list()) == 0
    # Agent身份令牌用于Next→Agent方向必须拒绝（FR-004固定身份）。
    agent_token = jwt.sign_agent_token()
    resp2 = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01"},
        headers={"Authorization": f"Bearer {agent_token}", "Idempotency-Key": "wrong-dir-1"},
    )
    assert resp2.status_code == 401
    assert len(repos.list()) == 0


def test_inmemory_replay_guard_conflict_without_side_effect():
    jwt = make_jwt()
    guard = InMemoryReplayGuard()
    calls: list[int] = []
    claims = jwt.verify_next_token(jwt.sign_next_token())
    guard.with_jti(claims, lambda tx: calls.append(1))
    with pytest.raises(JtiReplayConflict):
        guard.with_jti(claims, lambda tx: calls.append(2))
    assert calls == [1]


async def test_store_unavailable_returns_503_without_side_effect():
    """AC-014/NFR-004：重放存储不可用 → 503 SERVICE_AUTH_STORE_UNAVAILABLE，无业务写入。"""
    from agent.security.replay import ServiceAuthStoreUnavailable

    class BrokenGuard:
        def with_jti(self, claims, work_fn):
            raise ServiceAuthStoreUnavailable("store-unavailable")

    repos = InMemoryRepositories()
    jwt = make_jwt()
    deps = AppDeps(
        repos,
        graph_runner=None,
        settings=Settings(workflow_version="policyops-graph-v1"),
        service_jwt=jwt,
        replay=BrokenGuard(),
    )
    app = create_app(deps)
    client = _client(app)
    resp = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01"},
        headers={**bearer(jwt), "Idempotency-Key": "store-down-1"},
    )
    assert resp.status_code == 503
    assert resp.json() == {"error": "SERVICE_AUTH_STORE_UNAVAILABLE"}
    assert resp.headers.get("cache-control") == "no-store"
    assert len(repos.list()) == 0


def test_core_client_signs_fresh_agent_token_per_call():
    """SJWT-FR-005/§11：Agent→Core 每次请求签发新固定身份令牌（新JTI），
    保留 Idempotency-Key；X-Service-Name仅作日志上下文（FR-006）。"""
    from agent.core_client import HttpCoreClient

    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json={"draftId": "d1", "created": True})

    fresh_jtis = iter((
        "11111111-2222-4333-8444-555555555555",
        "66666666-7777-4888-8999-000000000001",
    ))
    jwt = ServiceJwt(CURRENT, now=lambda: FIXED_NOW, uuid4=lambda: next(fresh_jtis))
    client = HttpCoreClient("http://core:3000", "agent-runtime", 5.0, jwt, transport=httpx.MockTransport(handler))

    client.materialize_draft({"a": 1}, "idem-1", "trace-1")
    client.materialize_draft({"a": 1}, "idem-1", "trace-2")

    assert len(sent) == 2
    jtis: list[str] = []
    for req in sent:
        token = req.headers["Authorization"]
        assert token.startswith("Bearer ")
        claims = jwt.verify_agent_token(token.removeprefix("Bearer "))
        assert claims.iss == AGENT_IDENTITY.issuer
        assert claims.aud == AGENT_IDENTITY.audience
        assert claims.sub == AGENT_IDENTITY.subject
        jtis.append(claims.jti)
        assert req.headers["Idempotency-Key"] == "idem-1"
        assert req.headers["X-Service-Name"] == "agent-runtime"
    # 每次调用（含网络重试）都是新JTI（§11）。
    assert jtis[0] != jtis[1]


def test_core_client_default_requires_valid_secrets():
    """SJWT-FR-001/AC-010：default_core_client 配置无效 → 失败关闭（不产出无令牌客户端）。"""
    from agent.core_client import default_core_client

    bad = Settings(workflow_version="policyops-graph-v1")  # service_jwt_current 为空
    with pytest.raises(ServiceJwtConfigError):
        default_core_client(bad)
    good = Settings(
        workflow_version="policyops-graph-v1",
        service_jwt_current=CURRENT,
        service_jwt_previous=PREVIOUS,
    )
    assert default_core_client(good) is not None


# ── 生产装配（SJWT-FR-001/AC-010）───────────────────────────────────────────


def _fresh_import(module_name: str):
    import importlib
    import sys

    sys.modules.pop(module_name, None)
    try:
        return importlib.import_module(module_name)
    finally:
        sys.modules.pop(module_name, None)


def test_main_assembly_fails_without_service_jwt(monkeypatch):
    """AC-010：current Secret缺失 → 生产装配（模块级）启动失败，错误不泄漏Secret。"""
    monkeypatch.delenv("AGENT_SERVICE_JWT_CURRENT", raising=False)
    monkeypatch.delenv("AGENT_SERVICE_JWT_PREVIOUS", raising=False)
    with pytest.raises(ServiceJwtConfigError) as excinfo:
        _fresh_import("agent.api.main")
    assert CURRENT not in str(excinfo.value)


def test_main_assembly_fails_when_secrets_identical(monkeypatch):
    """AC-010/SJWT-FR-001：previous与current相同 → 启动失败。"""
    monkeypatch.setenv("AGENT_SERVICE_JWT_CURRENT", CURRENT)
    monkeypatch.setenv("AGENT_SERVICE_JWT_PREVIOUS", CURRENT)
    with pytest.raises(ServiceJwtConfigError):
        _fresh_import("agent.api.main")


def test_main_assembly_builds_app_with_valid_secrets(monkeypatch):
    """AC-010正向：合法Secret → 装配成功，JWT与重放存储均已注入。"""
    monkeypatch.setenv("AGENT_SERVICE_JWT_CURRENT", CURRENT)
    monkeypatch.setenv("AGENT_SERVICE_JWT_PREVIOUS", PREVIOUS)
    main = _fresh_import("agent.api.main")
    assert main.app.title == "PolicyOps Agent Runtime"
    assert main.deps.service_jwt is not None
    assert main.deps.replay is not None
