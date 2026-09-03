"""AGT-AC-002/003 + AGT-FR-001：Run 创建幂等、审核幂等、API 契约。

PMG-FR-014：使用 httpx AsyncClient + ASGITransport 直连 ASGI 应用，
替代已弃用的 Starlette TestClient（starlette 1.6 起其 httpx 集成弃用），
从根因消除 StarletteDeprecationWarning，而非用全局过滤器隐藏。
"""

from __future__ import annotations

import httpx


def _client(fake_app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=fake_app["app"]), base_url="http://testserver")


async def test_health_and_ready(fake_app):
    client = _client(fake_app)
    assert (await client.get("/internal/health")).json() == {"status": "ok"}
    assert (await client.get("/internal/ready")).json() == {"status": "ready"}


async def test_create_run_requires_idempotency_key(fake_app):
    client = _client(fake_app)
    resp = await client.post("/internal/v1/agent-runs", json={"as_of_date": "2026-01-01"})
    assert resp.status_code == 400


async def test_create_run_idempotent(fake_app):
    """AGT-AC-002：同一创建幂等键重复调用返回同一 Run。"""
    client = _client(fake_app)
    body = {"as_of_date": "2026-01-01", "payload": {"doc": "policy-text"}}
    first = await client.post(
        "/internal/v1/agent-runs", json=body, headers={"Idempotency-Key": "run-key-1"}
    )
    assert first.status_code == 200
    assert first.json()["idempotent"] is False
    second = await client.post(
        "/internal/v1/agent-runs", json=body, headers={"Idempotency-Key": "run-key-1"}
    )
    assert second.status_code == 200
    data = second.json()
    assert data["idempotent"] is True
    assert data["run_id"] == first.json()["run_id"]
    assert data["thread_id"] == first.json()["thread_id"]


async def test_run_lifecycle_pauses_at_human_review(fake_app):
    client = _client(fake_app)
    created = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "lifecycle-1"},
    )
    run_id = created.json()["run_id"]
    # 图执行到 human_review 的 interrupt。
    run = (await client.get(f"/internal/v1/agent-runs/{run_id}")).json()
    assert run["status"] == "waiting_review"
    assert run["current_node"] == "human_review"


async def test_review_idempotent_single_resume(fake_app):
    """AGT-AC-003：重复审核请求只产生一次恢复和一次 draft 导入调用。"""
    client = _client(fake_app)
    created = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "review-flow-1"},
    )
    run_id = created.json()["run_id"]
    run = (await client.get(f"/internal/v1/agent-runs/{run_id}")).json()
    assert run["status"] == "waiting_review"

    # 审核决定（第一次）。
    resp = await client.post(
        f"/internal/v1/proposals/{_proposal_id(fake_app, run_id)}/review",
        json={"decision": "approve", "reason": "ok"},
        headers={"Idempotency-Key": "review-key-1"},
    )
    assert resp.status_code == 200
    assert resp.json()["resumed"] is True

    # 同键重复请求：不再恢复。
    resp2 = await client.post(
        f"/internal/v1/proposals/{_proposal_id(fake_app, run_id)}/review",
        json={"decision": "approve", "reason": "ok"},
        headers={"Idempotency-Key": "review-key-1"},
    )
    assert resp2.json()["idempotent"] is True
    assert resp2.json()["resumed"] is False

    # 副作用只发生一次（Core 调用一次 created）。
    created_calls = [c for c in fake_app["core"].calls if c[0] == "created"]
    assert len(created_calls) == 1
    # Run 完成、提案已物化。
    assert (await client.get(f"/internal/v1/agent-runs/{run_id}")).json()["status"] == "completed"


async def test_reject_decision_marks_proposal_rejected(fake_app):
    client = _client(fake_app)
    created = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "reject-flow-1"},
    )
    run_id = created.json()["run_id"]
    proposal_id = _proposal_id(fake_app, run_id)
    resp = await client.post(
        f"/internal/v1/proposals/{proposal_id}/review",
        json={"decision": "reject", "reason": "quality"},
        headers={"Idempotency-Key": "reject-key-1"},
    )
    assert resp.status_code == 200
    proposal = (await client.get(f"/internal/v1/proposals/{proposal_id}")).json()
    assert proposal["status"] == "rejected"
    assert (await client.get(f"/internal/v1/agent-runs/{run_id}")).json()["status"] == "rejected"


async def test_invalid_decision_422(fake_app):
    client = _client(fake_app)
    created = await client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "invalid-1"},
    )
    proposal_id = _proposal_id(fake_app, created.json()["run_id"])
    resp = await client.post(
        f"/internal/v1/proposals/{proposal_id}/review",
        json={"decision": "auto-approve"},
        headers={"Idempotency-Key": "invalid-key-1"},
    )
    assert resp.status_code == 422


def _proposal_id(fake_app, run_id: str) -> str:
    proposal = fake_app["repos"].proposals.get_for_run(run_id)
    assert proposal is not None, "run should have produced a proposal before review"
    return proposal.id
