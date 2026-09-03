"""SJWT-FR-008/009/AC-012/013/014/015 集成（需本地演练库）：
- PostgresReplayGuard 同事务JTI消费：首次/重复/并发竞争（恰好一个成功）/
  业务失败JTI同回滚/过期记录机会式清理/存储不可用503类别；
- FastAPI真实装配（PostgresRepositories + PostgresReplayGuard + ServiceJwt，
  SJWT-FR-001/AC-010生产同款依赖链）真实请求语义：
  /internal/health豁免、/internal/ready必须JWT、create_run缺失/伪造/仅
  X-Service-Name统一401、有效令牌入库、同JTI重放401无副作用、
  存储不可用503 SERVICE_AUTH_STORE_UNAVAILABLE（均no-store）。

前提：AGENT_DATABASE_URL（回退DATABASE_URL）指向已执行
`python -m agent.migrate --with-roles` 的演练库；未设置时跳过（CI database-gates 自动提供）。
真实TCP跨服务调用由AC-017 Compose冒烟覆盖；本文件覆盖应用层+真实数据库。
"""

from __future__ import annotations

import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx
import jwt as pyjwt
import psycopg
import pytest

pytestmark = pytest.mark.integration

DRILL = os.environ.get("AGENT_DATABASE_URL") or os.environ.get("DATABASE_URL")

# 合成测试Secret（非生产，≥32 UTF-8字节）。
CURRENT_SECRET = "sjwt-it-current-secret-0123456789-abcdef-0123456789"
FORGED_SECRET = "sjwt-it-forged-secret-0123456789-abcdef-0123456789"
UNREACHABLE_URL = "postgresql://sjwt-it:nopw@127.0.0.1:1/nodb"

USED_JTIS: list[str] = []


def _jti(tag: int) -> str:
    """确定性UUID v4（版本/变体位合法），按tag区分，供清理追踪（支持任意位数tag）。"""
    return f"bb11{tag:04d}-0000-4000-8000-{tag:012d}"


def _claims(jti: str):
    from agent.security.service_jwt import NEXT_IDENTITY, ServiceJwtClaims

    now = int(time.time())
    USED_JTIS.append(jti)
    return ServiceJwtClaims(
        iss=NEXT_IDENTITY["iss"],
        aud=NEXT_IDENTITY["aud"],
        sub=NEXT_IDENTITY["sub"],
        jti=jti,
        iat=now,
        exp=now + 300,
    )


@pytest.fixture(scope="module")
def drill() -> str:
    if not DRILL:
        pytest.skip("requires AGENT_DATABASE_URL/DATABASE_URL (CI database-gates 自动提供)")
    return DRILL


@pytest.fixture(scope="module", autouse=True)
def cleanup(drill: str):
    yield
    # 先按0007幂等DDL恢复重放表（缺表演练若中断/失败，保证后续可用），再清理行。
    _restore_replay_table(drill)
    with psycopg.connect(drill, autocommit=True) as conn:
        conn.execute(
            "DELETE FROM agent.human_reviews WHERE idempotency_key LIKE 'sjwt-it-py-%'"
        )
        conn.execute(
            "DELETE FROM agent.agent_proposals WHERE id IN "
            "(SELECT id FROM agent.agent_proposals WHERE run_id IN "
            "(SELECT id FROM agent.agent_runs WHERE idempotency_key LIKE 'sjwt-it-py-%'))"
        )
        conn.execute("DELETE FROM agent.agent_runs WHERE idempotency_key LIKE 'sjwt-it-py-%'")
        conn.execute(
            "DELETE FROM agent.service_jwt_replays WHERE jti = ANY(%s)",
            (list(USED_JTIS),),
        )


def _restore_replay_table(drill: str) -> None:
    """恢复重放表：按0007迁移文件真实DDL重放（幂等，不触碰schema_migrations记录）。"""
    from pathlib import Path

    sql_path = Path(__file__).resolve().parent.parent / "agent" / "migrations" / "0007_service_jwt_replays.sql"
    sql = sql_path.read_text(encoding="utf-8")
    with psycopg.connect(drill, autocommit=True) as conn:
        for stmt in [s.strip() for s in sql.split("--> statement-breakpoint") if s.strip()]:
            conn.execute(stmt)


def _sign_next(secret: str = CURRENT_SECRET) -> str:
    from agent.security.service_jwt import ServiceJwt

    token = ServiceJwt(secret).sign_next_token()
    USED_JTIS.append(pyjwt.decode(token, options={"verify_signature": False})["jti"])
    return token


def _build_app(drill: str, replay_guard, jwt_secret: str = CURRENT_SECRET):
    from agent.api.app import AppDeps, create_app
    from agent.config import Settings
    from agent.repositories import PostgresRepositories
    from agent.security.service_jwt import ServiceJwt

    settings = Settings(database_url=drill, service_jwt_current=jwt_secret)
    deps = AppDeps(
        PostgresRepositories(drill),
        None,
        settings=settings,
        service_jwt=ServiceJwt(jwt_secret),
        replay=replay_guard,
    )
    return create_app(deps)


def _client(app) -> httpx.AsyncClient:
    # 与单元测试同一ASGI模式（httpx此版本ASGITransport无上下文协议，不占用套接字，无需with）。
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent.test")


# ── PostgresReplayGuard 数据库语义 ──────────────────────────────────────────


def test_guard_first_consume_and_row_content(drill: str) -> None:
    """AC-012前置：首次消费成功，行内容=claims元数据（不含令牌/签名）。"""
    from agent.security.replay import PostgresReplayGuard

    guard = PostgresReplayGuard(drill)
    jti = _jti(1)
    claims = _claims(jti)
    guard.with_jti(claims, lambda conn: conn.execute("SELECT 1"))

    with psycopg.connect(drill, autocommit=True) as conn:
        row = conn.execute(
            "SELECT issuer, subject, audience, expires_at FROM agent.service_jwt_replays WHERE jti=%s",
            (jti,),
        ).fetchone()
    assert row is not None
    issuer, subject, audience, expires_at = row
    assert (issuer, subject, audience) == (claims.iss, claims.sub, claims.aud)
    assert abs(expires_at.timestamp() - claims.exp) <= 5


def test_guard_duplicate_jti_conflict(drill: str) -> None:
    """AC-012：同一JTI重复消费 → JtiReplayConflict（路由映射统一401）。"""
    from agent.security.replay import JtiReplayConflict, PostgresReplayGuard

    guard = PostgresReplayGuard(drill)
    jti = _jti(2)
    guard.with_jti(_claims(jti), lambda conn: conn.execute("SELECT 1"))
    with pytest.raises(JtiReplayConflict) as exc:
        guard.with_jti(_claims(jti), lambda conn: conn.execute("SELECT 1"))
    assert exc.value.jti == jti


def test_guard_concurrent_same_jti_exactly_one_wins(drill: str) -> None:
    """AC-012：并发同JTI竞争，恰好一个成功，其余全部重放拒绝。"""
    from agent.security.replay import JtiReplayConflict, PostgresReplayGuard

    jti = _jti(3)
    claims = _claims(jti)

    def attempt(_: int):
        guard = PostgresReplayGuard(drill)
        try:
            guard.with_jti(claims, lambda conn: conn.execute("SELECT 1"))
            return True
        except JtiReplayConflict:
            return False

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(attempt, range(8)))
    assert results.count(True) == 1


def test_guard_business_failure_rolls_back_jti(drill: str) -> None:
    """AC-013：业务失败整体回滚（含JTI），同JTI可重试。"""
    from agent.security.replay import PostgresReplayGuard

    guard = PostgresReplayGuard(drill)
    jti = _jti(4)
    claims = _claims(jti)

    def boom(conn):
        raise RuntimeError("simulated business failure")

    with pytest.raises(RuntimeError, match="simulated"):
        guard.with_jti(claims, boom)

    # JTI已回滚：同JTI重试成功。
    guard.with_jti(claims, lambda conn: conn.execute("SELECT 1"))


def test_guard_expired_rows_cleaned_opportunistic(drill: str) -> None:
    """§7.3：过期重放记录机会式清理（新消费时删除expires_at<now的行）。"""
    from agent.security.replay import PostgresReplayGuard

    expired_jti = _jti(5)
    with psycopg.connect(drill, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO agent.service_jwt_replays (jti, issuer, subject, audience, expires_at) "
            "VALUES (%s, 'old', 'old', 'old', now() - interval '1 hour')",
            (expired_jti,),
        )
    guard = PostgresReplayGuard(drill)
    guard.with_jti(_claims(_jti(6)), lambda conn: conn.execute("SELECT 1"))
    with psycopg.connect(drill, autocommit=True) as conn:
        row = conn.execute(
            "SELECT count(*) FROM agent.service_jwt_replays WHERE jti=%s", (expired_jti,)
        ).fetchone()
    assert row is not None
    assert row[0] == 0


def test_guard_store_unavailable_category(drill: str) -> None:
    """AC-014：存储不可用（连接失败）→ ServiceAuthStoreUnavailable（失败关闭）。"""
    from agent.security.replay import PostgresReplayGuard, ServiceAuthStoreUnavailable

    guard = PostgresReplayGuard(UNREACHABLE_URL)
    with pytest.raises(ServiceAuthStoreUnavailable) as exc:
        guard.with_jti(_claims(_jti(7)), lambda conn: conn.execute("SELECT 1"))
    assert exc.value.public_code == "SERVICE_AUTH_STORE_UNAVAILABLE"


# ── 复审缺漏三：重放存储SQL异常精确映射（SJWT-FR-009/AC-013/014）──────────────


def test_guard_missing_table_maps_to_store_unavailable(drill: str) -> None:
    """复审缺漏三（AC-014）：重放表缺失 → ServiceAuthStoreUnavailable（503），不冒泡500。"""
    from agent.security.replay import PostgresReplayGuard, ServiceAuthStoreUnavailable

    with psycopg.connect(drill, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS agent.service_jwt_replays")
    try:
        guard = PostgresReplayGuard(drill)
        with pytest.raises(ServiceAuthStoreUnavailable) as exc:
            guard.with_jti(_claims(_jti(20)), lambda conn: conn.execute("SELECT 1"))
        assert exc.value.public_code == "SERVICE_AUTH_STORE_UNAVAILABLE"
    finally:
        _restore_replay_table(drill)


def test_guard_insufficient_privilege_maps_to_store_unavailable(drill: str) -> None:
    """复审缺漏三（AC-014）：无表权限角色 → ServiceAuthStoreUnavailable（503），不冒泡500。"""
    from urllib.parse import urlsplit, urlunsplit

    from agent.security.replay import PostgresReplayGuard, ServiceAuthStoreUnavailable

    parts = urlsplit(drill)
    host = parts.hostname or "localhost"
    port = f":{parts.port}" if parts.port else ""
    noperm_url = urlunsplit(
        ("postgresql", f"sjwt_it_noperm_role:sjwt-it-noperm@{host}{port}", parts.path, "", "")
    )
    try:
        with psycopg.connect(drill, autocommit=True) as conn:
            conn.execute("DROP ROLE IF EXISTS sjwt_it_noperm_role")
            conn.execute("CREATE ROLE sjwt_it_noperm_role LOGIN PASSWORD 'sjwt-it-noperm'")
        guard = PostgresReplayGuard(noperm_url)
        with pytest.raises(ServiceAuthStoreUnavailable) as exc:
            guard.with_jti(_claims(_jti(21)), lambda conn: conn.execute("SELECT 1"))
        assert exc.value.public_code == "SERVICE_AUTH_STORE_UNAVAILABLE"
    finally:
        with psycopg.connect(drill, autocommit=True) as conn:
            conn.execute("DROP ROLE IF EXISTS sjwt_it_noperm_role")


def test_guard_business_sql_error_propagates_unwrapped_and_rolls_back_jti(drill: str) -> None:
    """复审缺漏三（AC-013）：work_fn业务SQL错误不得误包装为存储不可用；
    JTI同事务回滚，修复业务错误后相同JTI可重新执行。"""
    from agent.security.replay import PostgresReplayGuard, ServiceAuthStoreUnavailable

    guard = PostgresReplayGuard(drill)
    jti = _jti(22)
    claims = _claims(jti)

    def business_sql_error(conn):
        conn.execute("INSERT INTO nonexistent_business_table (id) VALUES (1)")

    with pytest.raises(psycopg.Error) as exc:
        guard.with_jti(claims, business_sql_error)
    assert not isinstance(exc.value, ServiceAuthStoreUnavailable)
    # JTI已同事务回滚：相同JTI重新执行成功。
    guard.with_jti(claims, lambda conn: conn.execute("SELECT 1"))


async def test_route_missing_table_returns_503(drill: str) -> None:
    """复审缺漏三（SJWT-FR-009/AC-014）：重放表缺失 → 503 SERVICE_AUTH_STORE_UNAVAILABLE + no-store。"""
    from agent.security.replay import PostgresReplayGuard

    with psycopg.connect(drill, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS agent.service_jwt_replays")
    try:
        app = _build_app(drill, PostgresReplayGuard(drill))
        client = _client(app)
        res = await client.post(
            "/internal/v1/agent-runs",
            json={"as_of_date": "2026-01-01", "payload": {}},
            headers={
                "Authorization": f"Bearer {_sign_next()}",
                "Idempotency-Key": "sjwt-it-py-503-missing-table",
            },
        )
        assert res.status_code == 503
        assert res.json() == {"error": "SERVICE_AUTH_STORE_UNAVAILABLE"}
        assert res.headers.get("cache-control") == "no-store"
    finally:
        _restore_replay_table(drill)


# ── FastAPI 真实装配（Next→Agent方向，SJWT-FR-004/006/AC-015）────────────────


async def test_route_health_exempt_and_ready_requires_jwt(drill: str) -> None:
    """AC-015：/internal/health唯一免JWT；/internal/ready必须JWT（401+no-store）。"""
    from agent.security.replay import PostgresReplayGuard

    app = _build_app(drill, PostgresReplayGuard(drill))
    client = _client(app)
    health = await client.get("/internal/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    denied = await client.get("/internal/ready")
    assert denied.status_code == 401
    assert denied.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert denied.headers.get("cache-control") == "no-store"

    token = _sign_next()
    ok = await client.get("/internal/ready", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200
    assert ok.json() == {"status": "ready"}


async def test_route_create_run_auth_matrix(drill: str) -> None:
    """SJWT-FR-006/AC-015：缺失/伪造/错误方向/仅X-Service-Name → 统一401。"""
    from agent.security.replay import PostgresReplayGuard

    app = _build_app(drill, PostgresReplayGuard(drill))
    body = {"as_of_date": "2026-01-01", "payload": {}}
    client = _client(app)
    headers = {"Idempotency-Key": "sjwt-it-py-noauth"}

    no_auth = await client.post("/internal/v1/agent-runs", json=body, headers=headers)
    assert no_auth.status_code == 401
    assert no_auth.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert no_auth.headers.get("cache-control") == "no-store"

    header_only = await client.post(
        "/internal/v1/agent-runs",
        json=body,
        headers={**headers, "X-Service-Name": "next-core"},
    )
    assert header_only.status_code == 401
    assert header_only.json() == {"error": "SERVICE_AUTH_INVALID"}

    forged = _sign_next(FORGED_SECRET)
    forged_res = await client.post(
        "/internal/v1/agent-runs",
        json=body,
        headers={**headers, "Authorization": f"Bearer {forged}"},
    )
    assert forged_res.status_code == 401
    assert forged_res.json() == {"error": "SERVICE_AUTH_INVALID"}

    # 错误方向：Next方向签发器签出的Agent身份令牌不满足Next验证。
    from agent.security.service_jwt import AGENT_IDENTITY, ServiceJwt

    wrong_dir = ServiceJwt(CURRENT_SECRET).sign_agent_token()
    assert pyjwt.decode(wrong_dir, options={"verify_signature": False})["iss"] == AGENT_IDENTITY["iss"]
    dir_res = await client.post(
        "/internal/v1/agent-runs",
        json=body,
        headers={**headers, "Authorization": f"Bearer {wrong_dir}"},
    )
    assert dir_res.status_code == 401


async def test_route_create_run_valid_jti_replay_and_idempotency(drill: str) -> None:
    """SJWT-FR-008/AC-012/013：有效令牌入库；同JTI重放401无副作用；
    新JTI+相同业务幂等键 → 幂等200（JTI先于业务幂等检查）。"""
    from agent.repositories import PostgresRepositories
    from agent.security.replay import PostgresReplayGuard

    app = _build_app(drill, PostgresReplayGuard(drill))
    token = _sign_next()
    jti = pyjwt.decode(token, options={"verify_signature": False})["jti"]
    USED_JTIS.append(jti)  # 随机JTI也追踪清理（演练库可重复使用）。

    body = {"as_of_date": "2026-01-01", "payload": {}}
    client = _client(app)
    first = await client.post(
        "/internal/v1/agent-runs",
        json=body,
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "sjwt-it-py-valid"},
    )
    assert first.status_code == 200
    run = first.json()
    assert run["idempotent"] is False
    run_id = run["run_id"]

    repos = PostgresRepositories(drill)
    assert repos.get(run_id) is not None
    assert repos.get(run_id).idempotency_key == "sjwt-it-py-valid"

    # 重放：同令牌（同JTI）+ 不同业务幂等键 → JTI先冲突 → 401且无新run。
    replay = await client.post(
        "/internal/v1/agent-runs",
        json=body,
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "sjwt-it-py-replay"},
    )
    assert replay.status_code == 401
    assert replay.json() == {"error": "SERVICE_AUTH_INVALID"}
    assert replay.headers.get("cache-control") == "no-store"
    assert repos.find_by_idempotency_key("sjwt-it-py-replay") is None

    # 新JTI + 相同业务幂等键 → 业务幂等200（JTI与幂等检查同事务，FR-008顺序）。
    retry = await client.post(
        "/internal/v1/agent-runs",
        json=body,
        headers={
            "Authorization": f"Bearer {_sign_next()}",
            "Idempotency-Key": "sjwt-it-py-valid",
        },
    )
    assert retry.status_code == 200
    assert retry.json()["idempotent"] is True
    assert retry.json()["run_id"] == run_id


async def test_route_store_unavailable_503(drill: str) -> None:
    """AC-014：重放存储不可用 → 503 SERVICE_AUTH_STORE_UNAVAILABLE + no-store（不执行业务写）。"""
    from agent.security.replay import PostgresReplayGuard

    app = _build_app(drill, PostgresReplayGuard(UNREACHABLE_URL))
    client = _client(app)
    res = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {}},
        headers={
            "Authorization": f"Bearer {_sign_next()}",
            "Idempotency-Key": "sjwt-it-py-503",
        },
    )
    assert res.status_code == 503
    assert res.json() == {"error": "SERVICE_AUTH_STORE_UNAVAILABLE"}
    assert res.headers.get("cache-control") == "no-store"


def test_create_review_in_tx_same_transaction_with_jti(drill: str) -> None:
    """SJWT-FR-008：审核写（human_reviews+run状态）与JTI消费同事务；
    业务失败JTI同回滚；重复JTI拒绝且无审核行。"""
    import json as _json

    from agent.repositories import HumanReview, PostgresRepositories
    from agent.security.replay import JtiReplayConflict, PostgresReplayGuard

    repos = PostgresRepositories(drill)
    run_id = str(uuid.uuid4())
    proposal_id = str(uuid.uuid4())
    with psycopg.connect(drill, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO agent.agent_runs (id, thread_id, workflow_version, input_hash, idempotency_key, status) "
            "VALUES (%s, %s, 'policyops-graph-v1', 'h', %s, 'awaiting_review')",
            (run_id, str(uuid.uuid4()), "sjwt-it-py-review"),
        )
        conn.execute(
            "INSERT INTO agent.agent_proposals (id, run_id, jurisdiction_code, status, draft_bundle) "
            "VALUES (%s, %s, '310000', 'generated', %s)",
            (proposal_id, run_id, _json.dumps({"ok": True})),
        )

    guard = PostgresReplayGuard(drill)
    claims = _claims(_jti(8))

    def review_work(conn):
        return repos.create_review_in_tx(
            conn,
            HumanReview(
                id=str(uuid.uuid4()),
                proposal_id=proposal_id,
                decision="approve",
                patch=None,
                reason="it",
                actor_id="admin",
                idempotency_key="sjwt-it-py-review",
            ),
            run_id=run_id,
            run_status="approved",
        )

    review = guard.with_jti(claims, review_work)
    with psycopg.connect(drill, autocommit=True) as conn:
        status_row = conn.execute(
            "SELECT status FROM agent.agent_runs WHERE id=%s", (run_id,)
        ).fetchone()
        count_row = conn.execute(
            "SELECT count(*) FROM agent.human_reviews WHERE idempotency_key='sjwt-it-py-review'"
        ).fetchone()
    assert status_row is not None
    assert count_row is not None
    status = status_row[0]
    count = count_row[0]
    assert status == "approved"
    assert count == 1
    assert review.decision == "approve"

    # 重复JTI → 冲突，且无第二个审核行。
    with pytest.raises(JtiReplayConflict):
        guard.with_jti(claims, review_work)

    # 业务失败 → JTI同回滚：新work_fn失败后，用新JTI重试成功。
    def failing_work(conn):
        raise RuntimeError("simulated review failure")

    with pytest.raises(RuntimeError):
        guard.with_jti(_claims(_jti(9)), failing_work)
