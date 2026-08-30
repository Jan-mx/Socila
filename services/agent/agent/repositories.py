"""Agent 数据仓储（AGT-FR-004/008/009）：协议 + 内存实现（单测）+ Postgres 实现。

数据模型（PRD §8）：AgentRun / AgentArtifact / AgentProposal / HumanReview / AgentEvent。
所有行位于 `agent` schema——Agent 数据库角色对 core schema 无权限（AGT-FR-010）。
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def input_hash(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


# ── 数据类 ───────────────────────────────────────────────────────────────────


@dataclass
class AgentRun:
    id: str
    thread_id: str
    workflow_version: str
    input_hash: str
    idempotency_key: str
    status: str = "queued"  # queued|running|waiting_review|approved|rejected|failed|completed
    current_node: str | None = None
    error: str | None = None
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)


@dataclass
class AgentArtifact:
    id: str
    run_id: str
    type: str
    version: int
    content: Any
    content_hash: str
    source_node: str
    created_at: str = field(default_factory=now_iso)


@dataclass
class AgentProposal:
    id: str
    run_id: str
    base_snapshot_id: str | None
    jurisdiction_code: str
    status: str = "generated"  # generated|needs_review|approved|rejected|materialized_as_draft
    draft_bundle: Any = None
    created_at: str = field(default_factory=now_iso)


@dataclass
class HumanReview:
    id: str
    proposal_id: str
    decision: str  # approve|edit-and-approve|reject
    patch: Any | None
    reason: str
    actor_id: str
    idempotency_key: str
    created_at: str = field(default_factory=now_iso)


@dataclass
class AgentEvent:
    id: str
    run_id: str
    node: str
    event_type: str
    duration_ms: int | None
    model: str | None
    tokens: int | None
    trace_id: str | None
    metadata: Any
    created_at: str = field(default_factory=now_iso)


# ── 协议 ─────────────────────────────────────────────────────────────────────


class RunRepository(Protocol):
    def create(self, run: AgentRun) -> AgentRun: ...
    def find_by_idempotency_key(self, key: str) -> AgentRun | None: ...
    def get(self, run_id: str) -> AgentRun | None: ...
    def update_status(
        self, run_id: str, status: str, current_node: str | None = None, error: str | None = None
    ) -> None: ...
    def list(self) -> list[AgentRun]: ...


class ArtifactRepository(Protocol):
    def create(self, artifact: AgentArtifact) -> AgentArtifact: ...
    def find(self, run_id: str, type_: str, content_hash: str | None = None) -> list[AgentArtifact]: ...


class ProposalRepository(Protocol):
    def create(self, proposal: AgentProposal) -> AgentProposal: ...
    def get(self, proposal_id: str) -> AgentProposal | None: ...
    def update_status(self, proposal_id: str, status: str) -> None: ...
    def get_for_run(self, run_id: str) -> AgentProposal | None: ...


class ReviewRepository(Protocol):
    def find_by_idempotency_key(self, key: str) -> HumanReview | None: ...
    def create(self, review: HumanReview) -> HumanReview: ...
    def list_for_proposal(self, proposal_id: str) -> list[HumanReview]: ...


class EventRepository(Protocol):
    def append(self, event: AgentEvent) -> None: ...


# ── 内存实现（单元测试 / API 内嵌模式）：按聚合拆分，避免同名方法覆盖 ────────


class InMemoryRunRepository:
    def __init__(self, store: dict[str, AgentRun]) -> None:
        self._store = store

    def create(self, run: AgentRun) -> AgentRun:
        self._store[run.id] = run
        return run

    def find_by_idempotency_key(self, key: str) -> AgentRun | None:
        return next((r for r in self._store.values() if r.idempotency_key == key), None)

    def get(self, run_id: str) -> AgentRun | None:
        return self._store.get(run_id)

    def update_status(
        self, run_id: str, status: str, current_node: str | None = None, error: str | None = None
    ) -> None:
        run = self._store.get(run_id)
        if run:
            run.status = status
            if current_node is not None:
                run.current_node = current_node
            if error is not None:
                run.error = error
            run.updated_at = now_iso()

    def list(self) -> list[AgentRun]:
        return list(self._store.values())


class InMemoryArtifactRepository:
    def __init__(self, store: list[AgentArtifact]) -> None:
        self._store = store

    def create(self, artifact: AgentArtifact) -> AgentArtifact:
        self._store.append(artifact)
        return artifact

    def find(self, run_id: str, type_: str, content_hash: str | None = None) -> list[AgentArtifact]:
        return [
            a
            for a in self._store
            if a.run_id == run_id
            and a.type == type_
            and (content_hash is None or a.content_hash == content_hash)
        ]


class InMemoryProposalRepository:
    def __init__(self, store: dict[str, AgentProposal]) -> None:
        self._store = store

    def create(self, proposal: AgentProposal) -> AgentProposal:
        self._store[proposal.id] = proposal
        return proposal

    def get(self, proposal_id: str) -> AgentProposal | None:
        return self._store.get(proposal_id)

    def update_status(self, proposal_id: str, status: str) -> None:
        p = self._store.get(proposal_id)
        if p:
            p.status = status

    def get_for_run(self, run_id: str) -> AgentProposal | None:
        return next((p for p in self._store.values() if p.run_id == run_id), None)


class InMemoryReviewRepository:
    def __init__(self, store: list[HumanReview]) -> None:
        self._store = store

    def find_by_idempotency_key(self, key: str) -> HumanReview | None:
        return next((r for r in self._store if r.idempotency_key == key), None)

    def create(self, review: HumanReview) -> HumanReview:
        self._store.append(review)
        return review

    def list_for_proposal(self, proposal_id: str) -> list[HumanReview]:
        return [r for r in self._store if r.proposal_id == proposal_id]


class InMemoryEventRepository:
    def __init__(self, store: list[AgentEvent]) -> None:
        self._store = store

    def append(self, event: AgentEvent) -> None:
        self._store.append(event)


class InMemoryRepositories:
    """聚合门面：runs 提供与 Postgres 实现一致的接口；各聚合经子仓储访问。"""

    def __init__(self) -> None:
        self._run_store: dict[str, AgentRun] = {}
        self._artifact_store: list[AgentArtifact] = []
        self._proposal_store: dict[str, AgentProposal] = {}
        self._review_store: list[HumanReview] = []
        self._event_store: list[AgentEvent] = []

        self.runs = InMemoryRunRepository(self._run_store)
        self.artifacts = InMemoryArtifactRepository(self._artifact_store)
        self.proposals = InMemoryProposalRepository(self._proposal_store)
        self.reviews = InMemoryReviewRepository(self._review_store)
        self.events = InMemoryEventRepository(self._event_store)

    # Run 聚合门面（API / Worker 使用）。
    def create(self, run: AgentRun) -> AgentRun:
        return self.runs.create(run)

    def find_by_idempotency_key(self, key: str) -> AgentRun | None:
        return self.runs.find_by_idempotency_key(key)

    def get(self, run_id: str) -> AgentRun | None:
        return self.runs.get(run_id)

    def update_status(
        self, run_id: str, status: str, current_node: str | None = None, error: str | None = None
    ) -> None:
        self.runs.update_status(run_id, status, current_node, error)

    def list(self) -> list[AgentRun]:
        return self.runs.list()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_content(content: Any) -> str:
    return hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False, default=str).encode()
    ).hexdigest()


# ── Postgres 实现（psycopg，agent schema）────────────────────────────────────


class PostgresProposalRepository:
    def __init__(self, database_url: str) -> None:
        self._url = database_url

    def _conn(self):
        import psycopg

        return psycopg.connect(self._url)

    def create(self, proposal: AgentProposal) -> AgentProposal:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO agent.agent_proposals (id, run_id, base_snapshot_id, jurisdiction_code, status, draft_bundle)
                   VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (proposal.id, proposal.run_id, proposal.base_snapshot_id, proposal.jurisdiction_code,
                 proposal.status, json.dumps(proposal.draft_bundle, default=str)),
            )
            conn.commit()
        return proposal

    def get(self, proposal_id: str) -> AgentProposal | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id, run_id, base_snapshot_id, jurisdiction_code, status, draft_bundle FROM agent.agent_proposals WHERE id=%s",
                (proposal_id,),
            ).fetchone()
        if not row:
            return None
        return AgentProposal(id=str(row[0]), run_id=str(row[1]), base_snapshot_id=row[2],
                             jurisdiction_code=row[3], status=row[4], draft_bundle=row[5])

    def update_status(self, proposal_id: str, status: str) -> None:
        with self._conn() as conn:
            conn.execute("UPDATE agent.agent_proposals SET status=%s WHERE id=%s", (status, proposal_id))
            conn.commit()

    def get_for_run(self, run_id: str) -> AgentProposal | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id FROM agent.agent_proposals WHERE run_id=%s ORDER BY created_at LIMIT 1",
                (run_id,),
            ).fetchone()
        return self.get(str(row[0])) if row else None


class PostgresEventRepository:
    def __init__(self, database_url: str) -> None:
        self._url = database_url

    def append(self, event: AgentEvent) -> None:
        import psycopg

        with psycopg.connect(self._url) as conn:
            conn.execute(
                """INSERT INTO agent.agent_events (id, run_id, node, event_type, duration_ms, model, tokens, trace_id, metadata)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (event.id, event.run_id, event.node, event.event_type, event.duration_ms,
                 event.model, event.tokens, event.trace_id, json.dumps(event.metadata, default=str)),
            )
            conn.commit()


class PostgresRepositories:
    """生产/集成实现：agent schema 直连 + LangGraph PostgresSaver。"""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self.proposals = PostgresProposalRepository(database_url)
        self.events = PostgresEventRepository(database_url)

    def _conn(self):
        import psycopg

        return psycopg.connect(self._database_url)

    def checkpointer_cm(self):
        """返回上下文管理器：with repos.checkpointer_cm() as saver: ..."""
        from langgraph.checkpoint.postgres import PostgresSaver

        return PostgresSaver.from_conn_string(self._database_url)

    @property
    def core_client(self):
        from .config import get_settings
        from .core_client import default_core_client

        return default_core_client(get_settings())

    def update_status(self, run_id: str, status: str, current_node: str | None = None, error: str | None = None) -> None:
        with self._conn() as conn:
            conn.execute(
                """UPDATE agent.agent_runs SET status=%s, current_node=COALESCE(%s, current_node),
                   error=COALESCE(%s, error), updated_at=now() WHERE id=%s""",
                (status, current_node, error, run_id),
            )
            conn.commit()

    def get(self, run_id: str):
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id, thread_id, workflow_version, input_hash, idempotency_key, status, current_node, error FROM agent.agent_runs WHERE id=%s",
                (run_id,),
            ).fetchone()
        if not row:
            return None
        return AgentRun(
            id=str(row[0]), thread_id=str(row[1]), workflow_version=row[2], input_hash=row[3],
            idempotency_key=row[4], status=row[5], current_node=row[6], error=row[7],
        )

    def create(self, run: AgentRun) -> AgentRun:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO agent.agent_runs (id, thread_id, workflow_version, input_hash, idempotency_key, status)
                   VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (run.id, run.thread_id, run.workflow_version, run.input_hash, run.idempotency_key, run.status),
            )
            conn.commit()
        return run

    def find_by_idempotency_key(self, key: str):
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id FROM agent.agent_runs WHERE idempotency_key=%s", (key,)
            ).fetchone()
        return self.get(str(row[0])) if row else None

    def list(self) -> list[AgentRun]:
        return []
