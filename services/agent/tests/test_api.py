"""AGT-AC-002/003 + AGT-FR-001：Run 创建幂等、审核幂等、API 契约。"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_and_ready(fake_app):
    client = TestClient(fake_app["app"])
    assert client.get("/internal/health").json() == {"status": "ok"}
    assert client.get("/internal/ready").json() == {"status": "ready"}


def test_create_run_requires_idempotency_key(fake_app):
    client = TestClient(fake_app["app"])
    resp = client.post("/internal/v1/agent-runs", json={"as_of_date": "2026-01-01"})
    assert resp.status_code == 400


def test_create_run_idempotent(fake_app):
    """AGT-AC-002：同一创建幂等键重复调用返回同一 Run。"""
    client = TestClient(fake_app["app"])
    body = {"as_of_date": "2026-01-01", "payload": {"doc": "policy-text"}}
    first = client.post(
        "/internal/v1/agent-runs", json=body, headers={"Idempotency-Key": "run-key-1"}
    )
    assert first.status_code == 200
    assert first.json()["idempotent"] is False
    second = client.post(
        "/internal/v1/agent-runs", json=body, headers={"Idempotency-Key": "run-key-1"}
    )
    assert second.status_code == 200
    data = second.json()
    assert data["idempotent"] is True
    assert data["run_id"] == first.json()["run_id"]
    assert data["thread_id"] == first.json()["thread_id"]


def test_run_lifecycle_pauses_at_human_review(fake_app):
    client = TestClient(fake_app["app"])
    created = client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "lifecycle-1"},
    )
    run_id = created.json()["run_id"]
    # 图执行到 human_review 的 interrupt。
    run = client.get(f"/internal/v1/agent-runs/{run_id}").json()
    assert run["status"] == "waiting_review"
    assert run["current_node"] == "human_review"


def test_review_idempotent_single_resume(fake_app):
    """AGT-AC-003：重复审核请求只产生一次恢复和一次 draft 导入调用。"""
    client = TestClient(fake_app["app"])
    created = client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "review-flow-1"},
    )
    run_id = created.json()["run_id"]
    run = client.get(f"/internal/v1/agent-runs/{run_id}").json()
    assert run["status"] == "waiting_review"

    # 审核决定（第一次）。
    resp = client.post(
        f"/internal/v1/proposals/{_proposal_id(fake_app, run_id)}/review",
        json={"decision": "approve", "reason": "ok"},
        headers={"Idempotency-Key": "review-key-1"},
    )
    assert resp.status_code == 200
    assert resp.json()["resumed"] is True

    # 同键重复请求：不再恢复。
    resp2 = client.post(
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
    assert client.get(f"/internal/v1/agent-runs/{run_id}").json()["status"] == "completed"


def test_reject_decision_marks_proposal_rejected(fake_app):
    client = TestClient(fake_app["app"])
    created = client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "reject-flow-1"},
    )
    run_id = created.json()["run_id"]
    proposal_id = _proposal_id(fake_app, run_id)
    resp = client.post(
        f"/internal/v1/proposals/{proposal_id}/review",
        json={"decision": "reject", "reason": "quality"},
        headers={"Idempotency-Key": "reject-key-1"},
    )
    assert resp.status_code == 200
    proposal = client.get(f"/internal/v1/proposals/{proposal_id}").json()
    assert proposal["status"] == "rejected"
    assert client.get(f"/internal/v1/agent-runs/{run_id}").json()["status"] == "rejected"


def test_invalid_decision_422(fake_app):
    client = TestClient(fake_app["app"])
    created = client.post(
        "/internal/v1/agent-runs",
        json={"as_of_date": "2026-01-01", "payload": {"verify_should_pass": True}},
        headers={"Idempotency-Key": "invalid-1"},
    )
    proposal_id = _proposal_id(fake_app, created.json()["run_id"])
    resp = client.post(
        f"/internal/v1/proposals/{proposal_id}/review",
        json={"decision": "auto-approve"},
        headers={"Idempotency-Key": "invalid-key-1"},
    )
    assert resp.status_code == 422


def _proposal_id(fake_app, run_id: str) -> str:
    proposal = fake_app["repos"].proposals.get_for_run(run_id)
    assert proposal is not None, "run should have produced a proposal before review"
    return proposal.id
