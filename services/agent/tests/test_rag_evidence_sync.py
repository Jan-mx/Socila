"""09-11独立审查问题一：政策原件MinIO同步（WI-20260911-01 SHV2-FR-002闭环）。

契约：
- bucket固定`policy-originals`，对象键固定`originals/<sha256>`（SHA=原件实际字节SHA-256）；
- Git原件、meta.json、DSL evidence、MinIO对象与RAG数据库（rag.sources/fetches/document_versions）
  形成完整映射：fetches.object_key == document_versions.object_key，DB content_hash == 对象SHA；
- 受控模式audit/plan/apply/verify；幂等（同SHA no-op）；冲突对象拒绝覆盖；生产MinIO默认拒绝；
- 输出清单不含凭据。
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest

from agent.rag.evidence_sync import (
    EVIDENCE_BUCKET,
    EVIDENCE_SYNC_ALGORITHM_VERSION,
    PLAN_SCHEMA,
    EvidenceSyncError,
    PolicyEvidenceSync,
    classify_target_state,
    guard_minio_endpoint,
    parse_sync_args,
    plan_hash_of,
)
from agent.rag.storage import InMemoryObjectStore, MinioObjectStore

DRILL = os.environ.get("SOCILA_TEST_DATABASE_URL", "")

HTML = "<html><body><h1>上海市失业保险金支付标准通知</h1><p>第一条 全文正文内容用于占位，长度超过采集下限。</p></body></html>".encode()
SHA = hashlib.sha256(HTML).hexdigest()
OTHER_BYTES = b"<html>totally-different-object-content</html>"


def make_evidence(jur_root: Path, doc_id: str = "DOC-SH-TEST-2026", *, meta_sha: str | None = None, body: bytes = HTML) -> Path:
    """jur_root为区划目录（如.../310000），其直接子目录为文档目录。"""
    d = jur_root / doc_id
    d.mkdir(parents=True)
    (d / "original.html").write_bytes(body)
    (d / "extracted-text.txt").write_text("第一条 全文正文内容用于占位。", encoding="utf-8")
    (d / "http-headers.txt").write_text("content-type: text/html; charset=utf-8\n", encoding="utf-8")
    meta = {
        "docId": doc_id,
        "title": "测试政策原件",
        "officialUrl": "https://rsj.sh.gov.cn/test/t0035_1.html",
        "finalUrl": "https://rsj.sh.gov.cn/test/t0035_1.html",
        "httpStatus": 200,
        "fetchedAt": "2026-09-11T03:39:47.468Z",
        "sha256": meta_sha if meta_sha is not None else hashlib.sha256(body).hexdigest(),
        "byteSize": len(body),
    }
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return d


def make_dsl(root: Path, doc_id: str, content_sha256: str) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    payload = {
        "rule_id": "R-SH-TEST",
        "evidence": [
            {
                "document_id": doc_id,
                "jurisdiction_code": "310000",
                "content_sha256": content_sha256,
                "artifact": "original.html",
                "locator": "正文",
                "excerpt": "全文正文内容用于占位",
            }
        ],
    }
    p = root / "R-SH-TEST.json"
    p.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return p


@pytest.fixture()
def evidence_env(tmp_path: Path):
    jur_dir = tmp_path / "evidence" / "310000"
    evidence = make_evidence(jur_dir)
    dsl = tmp_path / "dsl"
    make_dsl(dsl, "DOC-SH-TEST-2026", SHA)
    return {"evidence": evidence, "dsl": dsl, "evidence_root": jur_dir}


# ── 守卫与枚举（零数据库）────────────────────────────────────────────────────


def test_bucket_fixed_to_policy_originals():
    assert EVIDENCE_BUCKET == "policy-originals"


def test_wrong_bucket_refused(evidence_env):
    with pytest.raises(EvidenceSyncError, match=r"bucket"):
        PolicyEvidenceSync(
            evidence_env["evidence_root"],
            InMemoryObjectStore(),
            bucket="policyops",
            dsl_root=evidence_env["dsl"],
            database_url=None,
        )


def test_remote_minio_endpoint_refused_by_default():
    with pytest.raises(EvidenceSyncError, match=r"endpoint|remote|远程"):
        guard_minio_endpoint("minio.prod.example:9000")
    guard_minio_endpoint("localhost:9000")
    guard_minio_endpoint("127.0.0.1:9001")


def test_collect_verifies_file_meta_and_dsl_sha(evidence_env):
    sync = PolicyEvidenceSync(
        evidence_env["evidence_root"], InMemoryObjectStore(), dsl_root=evidence_env["dsl"]
    )
    docs = sync.collect()
    assert [d.doc_id for d in docs] == ["DOC-SH-TEST-2026"]
    assert docs[0].sha256 == SHA
    assert docs[0].object_key == f"originals/{SHA}"


def test_file_sha_mismatch_with_meta_refused(evidence_env, tmp_path):
    jur_dir = tmp_path / "310000"
    bad = make_evidence(jur_dir, meta_sha="0" * 64)
    dsl = tmp_path / "dsl2"
    make_dsl(dsl, "DOC-SH-TEST-2026", SHA)
    sync = PolicyEvidenceSync(bad.parent, InMemoryObjectStore(), dsl_root=dsl)
    with pytest.raises(EvidenceSyncError, match=r"meta|sha|SHA"):
        sync.collect()


def test_dsl_evidence_sha_mismatch_refused(evidence_env, tmp_path):
    dsl_bad = tmp_path / "dsl-bad"
    make_dsl(dsl_bad, "DOC-SH-TEST-2026", "1" * 64)
    sync = PolicyEvidenceSync(evidence_env["evidence_root"], InMemoryObjectStore(), dsl_root=dsl_bad)
    with pytest.raises(EvidenceSyncError, match=r"evidence|dsl|DSL|sha|SHA"):
        sync.collect()


def test_missing_artifact_refused(tmp_path):
    jur_dir = tmp_path / "310000"
    d = jur_dir / "DOC-SH-BROKEN"
    d.mkdir(parents=True)
    (d / "meta.json").write_text(json.dumps({"docId": "DOC-SH-BROKEN", "sha256": "2" * 64, "byteSize": 1}), encoding="utf-8")
    sync = PolicyEvidenceSync(jur_dir, InMemoryObjectStore(), dsl_root=None)
    with pytest.raises(EvidenceSyncError, match=r"original|artifact|原件"):
        sync.collect()


# ── CLI参数与授权契约（零数据库单元）────────────────────────────────────────


def _base_apply_args() -> list[str]:
    return [
        "apply",
        "--evidence-dir", "evidence/310000",
        "--database-url", "postgresql://postgres:postgres@127.0.0.1:59999/x",
        "--plan-file", "plan.json",
        "--plan-hash", "a" * 64,
        "--target-fingerprint", "b" * 64,
    ]


def test_parse_apply_requires_full_authorization_binding():
    args = parse_sync_args([*_base_apply_args(), "--i-am-authorized"])
    assert args["mode"] == "apply" and args["i_am_authorized"] is True
    assert args["plan_hash"] == "a" * 64 and args["target_fingerprint"] == "b" * 64
    # 逐项剔除授权参数都必须拒绝。
    for drop in ("--i-am-authorized", "--plan-file", "--plan-hash", "--target-fingerprint"):
        argv = [*_base_apply_args(), "--i-am-authorized"]
        i = argv.index(drop)
        del argv[i : i + (1 if drop == "--i-am-authorized" else 2)]
        with pytest.raises(EvidenceSyncError, match=r"USAGE|授权|plan|hash|fingerprint"):
            parse_sync_args(argv)


def test_parse_full_modes_require_database_url(monkeypatch):
    monkeypatch.delenv("AGENT_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    for mode in ("audit", "plan", "apply", "verify"):
        argv = [mode, "--evidence-dir", "evidence/310000"]
        if mode == "apply":
            argv += ["--i-am-authorized", "--plan-file", "p.json", "--plan-hash", "a" * 64, "--target-fingerprint", "b" * 64]
        with pytest.raises(EvidenceSyncError, match=r"数据库|database"):
            parse_sync_args(argv)


def test_parse_verify_object_only_allowed_without_database(monkeypatch):
    monkeypatch.delenv("AGENT_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    args = parse_sync_args(["verify", "--evidence-dir", "evidence/310000", "--object-only"])
    assert args["mode"] == "verify" and args["object_only"] is True
    assert args["database_url"] in (None, "")


def test_parse_rejects_unknown_mode_and_missing_evidence_dir():
    with pytest.raises(EvidenceSyncError, match=r"USAGE|mode"):
        parse_sync_args(["bogus", "--evidence-dir", "x"])
    with pytest.raises(EvidenceSyncError, match=r"USAGE|evidence"):
        parse_sync_args(["audit", "--database-url", "postgresql://u:p@localhost:1/d"])


def test_classify_target_state_semantics():
    t, f = "t" * 64, "f" * 64
    assert classify_target_state(t, t, f) == "pending"
    assert classify_target_state(f, t, f) == "noop"
    assert classify_target_state("c" * 64, t, f) == "drift"


# ── 受控同步（隔离数据库）────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestControlledSync:
    @pytest.fixture()
    def sync_env(self, evidence_env, monkeypatch):
        from psycopg import connect

        assert DRILL is not None
        monkeypatch.setenv("DATABASE_URL", DRILL)
        # 集成测试不针对工作树策略；dirty反例由test_apply_refuses_dirty_worktree_unless_drill_opt_in单独覆盖。
        monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
        with connect(DRILL, autocommit=True) as conn:
            conn.execute("TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE")
        store = InMemoryObjectStore()
        sync = PolicyEvidenceSync(
            evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL
        )
        return {"sync": sync, "store": store, "evidence_env": evidence_env}

    def _apply(self, sync, **overrides):
        """按新契约执行apply：build_plan → 显式授权参数。"""
        plan = overrides.pop("plan", None) or sync.build_plan()
        kwargs = {
            "plan_hash": overrides.pop("plan_hash", plan["planHash"]),
            "target_fingerprint": overrides.pop("target_fingerprint", plan["targetFingerprint"]),
            "i_am_authorized": overrides.pop("i_am_authorized", True),
        }
        kwargs.update(overrides)
        return sync.apply(plan, **kwargs)

    def test_build_plan_deterministic_and_complete(self, sync_env):
        p1 = sync_env["sync"].build_plan()
        p2 = sync_env["sync"].build_plan()
        assert json.dumps(p1, sort_keys=True) == json.dumps(p2, sort_keys=True)
        assert p1["schema"] == PLAN_SCHEMA
        assert p1["algorithmVersion"] == EVIDENCE_SYNC_ALGORITHM_VERSION
        assert p1["bucket"] == "policy-originals"
        assert p1["jurisdiction"] == "310000"
        assert len(p1["codeSha"]) == 40
        assert len(p1["evidenceManifestHash"]) == 64
        assert len(p1["targetFingerprint"]) == 64
        assert len(p1["finalFingerprint"]) == 64
        assert len(p1["planHash"]) == 64
        assert p1["objects"][0]["objectKey"] == f"originals/{SHA}"
        assert p1["plannedUploads"] == ["DOC-SH-TEST-2026"]
        assert p1["noopObjects"] == []
        # planHash不进入自身hash；正文任何字段漂移都改变planHash。
        assert plan_hash_of(p1) == p1["planHash"]
        forged = json.loads(json.dumps(p1))
        forged["jurisdiction"] = "440000"
        assert plan_hash_of(forged) != p1["planHash"]
        with_other_hash = json.loads(json.dumps(p1))
        with_other_hash["planHash"] = "0" * 64
        assert plan_hash_of(with_other_hash) == p1["planHash"]

    def test_apply_uploads_new_objects_and_writes_rag_records(self, sync_env):
        result = self._apply(sync_env["sync"])
        assert result["applied"] is True and result["noop"] is False
        assert result["uploaded"] == 1
        key = f"originals/{SHA}"
        assert sync_env["store"].exists(key)
        assert hashlib.sha256(sync_env["store"].get(key)).hexdigest() == SHA
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            fetch = conn.execute(
                "SELECT object_key, content_hash, status FROM rag.fetches WHERE object_key=%s", (key,)
            ).fetchone()
            version = conn.execute(
                "SELECT object_key, content_hash, status, jurisdiction_code FROM rag.document_versions WHERE content_hash=%s",
                (SHA,),
            ).fetchone()
            source = conn.execute(
                "SELECT id FROM rag.sources WHERE domain='rsj.sh.gov.cn' AND jurisdiction_code='310000'"
            ).fetchone()
        assert fetch is not None and fetch[1] == SHA
        assert version is not None and version[0] == key and version[1] == SHA
        assert source is not None
        # fetches.object_key与document_versions.object_key相同；清单不含凭据。
        assert result["manifest"][0]["objectKey"] == key
        assert "password" not in json.dumps(result).lower()

    def test_apply_without_authorization_refused_zero_write(self, sync_env):
        plan = sync_env["sync"].build_plan()
        with pytest.raises(EvidenceSyncError, match=r"AUTH|授权|authorized"):
            self._apply(sync_env["sync"], plan=plan, i_am_authorized=False)
        assert sync_env["store"]._objects == {}
        with pytest.raises(EvidenceSyncError, match=r"授权|i_am_authorized|plan_hash|planHash|PLAN_HASH"):
            self._apply(sync_env["sync"], plan=plan, plan_hash="0" * 64)
        assert sync_env["store"]._objects == {}

    def test_apply_with_wrong_plan_hash_or_fingerprint_refused(self, sync_env):
        plan = sync_env["sync"].build_plan()
        with pytest.raises(EvidenceSyncError, match=r"planHash|PLAN_HASH"):
            self._apply(sync_env["sync"], plan=plan, plan_hash="0" * 64)
        with pytest.raises(EvidenceSyncError, match=r"fingerprint|FINGERPRINT|指纹"):
            self._apply(sync_env["sync"], plan=plan, target_fingerprint="0" * 64)
        # 计划正文被篡改（planHash重算不符）→ 拒绝。
        forged = json.loads(json.dumps(plan))
        forged["plannedUploads"] = []
        with pytest.raises(EvidenceSyncError, match=r"planHash|PLAN_HASH|计划"):
            self._apply(sync_env["sync"], plan=forged)
        assert sync_env["store"]._objects == {}

    def test_apply_with_code_sha_mismatch_refused(self, sync_env):
        plan = sync_env["sync"].build_plan()
        stale = json.loads(json.dumps(plan))
        stale["codeSha"] = "0" * 40
        stale["planHash"] = plan_hash_of(stale)
        with pytest.raises(EvidenceSyncError, match=r"codeSha|CODE_SHA|HEAD"):
            self._apply(sync_env["sync"], plan=stale)
        assert sync_env["store"]._objects == {}

    def test_apply_refuses_dirty_worktree_unless_drill_opt_in(self, sync_env, monkeypatch):
        from agent.rag import evidence_sync as es

        plan = sync_env["sync"].build_plan()
        monkeypatch.delenv("RAG_EVIDENCE_ALLOW_DIRTY", raising=False)
        monkeypatch.setattr(es, "git_head", lambda: {"sha": plan["codeSha"], "dirty": True})
        with pytest.raises(EvidenceSyncError, match=r"DIRTY|工作树"):
            self._apply(sync_env["sync"], plan=plan)
        assert sync_env["store"]._objects == {}
        monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
        result = self._apply(sync_env["sync"], plan=plan)
        assert result["applied"] is True

    def test_apply_refuses_evidence_drift_after_plan(self, sync_env):
        plan = sync_env["sync"].build_plan()
        # evidence_env["evidence"]即文档目录（fixture返回doc dir）。
        (sync_env["evidence_env"]["evidence"] / "original.html").write_bytes(HTML + b"drift")
        with pytest.raises(EvidenceSyncError, match=r"drift|漂移|evidence|manifest|META_SHA"):
            self._apply(sync_env["sync"], plan=plan)
        assert sync_env["store"]._objects == {}

    def test_apply_refuses_minio_state_drift_after_plan(self, sync_env):
        plan = sync_env["sync"].build_plan()
        # plan之后受管对象漂移：目标键被放入不同内容（指纹从缺失变为冲突）。
        sync_env["store"].put(f"originals/{SHA}", OTHER_BYTES, "text/html")
        with pytest.raises(EvidenceSyncError, match=r"drift|漂移|状态"):
            self._apply(sync_env["sync"], plan=plan)
        assert sync_env["store"].get(f"originals/{SHA}") == OTHER_BYTES

    def test_apply_refuses_db_state_drift_after_plan(self, sync_env):
        from psycopg import connect

        plan = sync_env["sync"].build_plan()
        # plan之后RAG登记层漂移：提前写入目标object_key的fetch记录（指纹改变）。
        with connect(DRILL, autocommit=True) as conn:
            conn.execute(
                "INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) VALUES ('310000','x','https://rsj.sh.gov.cn/x','rsj.sh.gov.cn')"
            )
            source_row = conn.execute("SELECT id FROM rag.sources WHERE domain='rsj.sh.gov.cn' LIMIT 1").fetchone()
            assert source_row is not None
            source_id = source_row[0]
            conn.execute(
                "INSERT INTO rag.fetches (source_id, url, status, content_hash, object_key, mime) VALUES (%s,'https://rsj.sh.gov.cn/x',200,%s,%s,'text/html')",
                (source_id, SHA, f"originals/{SHA}"),
            )
        with pytest.raises(EvidenceSyncError, match=r"drift|漂移|状态"):
            self._apply(sync_env["sync"], plan=plan)
        assert sync_env["store"]._objects == {}

    def test_reapply_same_plan_is_noop(self, sync_env):
        sync = sync_env["sync"]
        plan = sync.build_plan()
        first = self._apply(sync, plan=plan)
        assert first["applied"] is True
        second = self._apply(sync, plan=plan)
        assert second["noop"] is True and second["applied"] is False
        assert second["uploaded"] == 0

    def test_conflicting_object_refused_no_overwrite(self, sync_env):
        key = f"originals/{SHA}"
        sync_env["store"].put(key, OTHER_BYTES, "text/html")
        with pytest.raises(EvidenceSyncError, match=r"conflict|冲突|覆盖|drift|漂移"):
            self._apply(sync_env["sync"])
        assert sync_env["store"].get(key) == OTHER_BYTES

    def test_recoverable_after_failure_via_replan(self, sync_env):
        sync = sync_env["sync"]
        plan = sync.build_plan()
        # 故障注入：对象上传后、数据库登记前失败。
        with pytest.raises(EvidenceSyncError, match=r"INJECTED|注入"):
            self._apply(sync, plan=plan, inject_failure_at="after_uploads")
        assert sync_env["store"]._objects, "注入点前对象已上传"
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            version_row = conn.execute("SELECT count(*) FROM rag.document_versions").fetchone()
            assert version_row is not None and version_row[0] == 0
        # 重新plan（新目标状态=对象已存在+记录缺失）→ apply补齐登记 → verify ok。
        recovery = self._apply(sync)
        assert recovery["applied"] is True
        assert sync.verify()["ok"] is True

    def test_concurrent_apply_no_duplicate_records(self, sync_env):
        from concurrent.futures import ThreadPoolExecutor

        from psycopg import connect

        sync = sync_env["sync"]
        plan = sync.build_plan()
        args = (plan,)
        kwargs = {"plan_hash": plan["planHash"], "target_fingerprint": plan["targetFingerprint"], "i_am_authorized": True}
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: sync.apply(*args, **kwargs), range(2)))
        applied = [r for r in results if r["applied"]]
        assert len(applied) >= 1
        with connect(DRILL, autocommit=True) as conn:
            fetch_row = conn.execute("SELECT count(*) FROM rag.fetches WHERE object_key=%s", (f"originals/{SHA}",)).fetchone()
            version_row = conn.execute("SELECT count(*) FROM rag.document_versions WHERE content_hash=%s", (SHA,)).fetchone()
            assert fetch_row is not None and version_row is not None
            fetches = fetch_row[0]
            versions = version_row[0]
        assert fetches == 1 and versions == 1
        assert sync.verify()["ok"] is True

    def test_verify_detects_missing_rag_records(self, sync_env):
        self._apply(sync_env["sync"])
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("DELETE FROM rag.document_versions")
            conn.execute("DELETE FROM rag.fetches")
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("rag" in p or "记录" in p for p in report["problems"])

    def test_verify_detects_db_content_hash_drift(self, sync_env):
        self._apply(sync_env["sync"])
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("UPDATE rag.document_versions SET content_hash='9' || substr(content_hash, 2)")
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("content_hash" in p for p in report["problems"])

    def test_verify_detects_wrong_object_key(self, sync_env):
        self._apply(sync_env["sync"])
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("UPDATE rag.document_versions SET object_key='originals/wrong-key'")
            conn.execute("UPDATE rag.fetches SET object_key='originals/another-wrong'")
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("object_key" in p for p in report["problems"])

    def test_verify_detects_object_download_sha_drift(self, sync_env):
        self._apply(sync_env["sync"])
        key = f"originals/{SHA}"
        sync_env["store"]._objects[key] = OTHER_BYTES
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("sha|SHA|漂移" in p or "SHA" in p for p in report["problems"])

    def test_full_verify_without_database_never_ok(self, sync_env, evidence_env):
        store = InMemoryObjectStore()
        broken = PolicyEvidenceSync(
            evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=None
        )
        report = broken.verify()
        assert report["ok"] is False
        assert any("数据库" in p or "database" in p.lower() for p in report["problems"])
        assert report.get("degraded") is not True or report.get("verificationScope") != "four-way"

    def test_object_only_verify_marks_degraded_scope(self, sync_env, evidence_env):
        store = InMemoryObjectStore()
        object_only = PolicyEvidenceSync(
            evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=None
        )
        report = object_only.verify(object_only=True)
        assert report["verificationScope"] == "object-only"
        assert report["degraded"] is True
        assert report["dbChecked"] is False
        # object-only不得作为最终四方验收通过：标记必须显式存在。

    def test_plan_emits_upload_list_without_writes(self, sync_env):
        plan = sync_env["sync"].build_plan()
        assert plan["plannedUploads"] == ["DOC-SH-TEST-2026"]
        assert plan["plannedFetches"] == ["DOC-SH-TEST-2026"]
        assert plan["plannedVersions"] == ["DOC-SH-TEST-2026"]
        assert sync_env["store"]._objects == {}

    def test_verify_ok_after_apply(self, sync_env):
        self._apply(sync_env["sync"])
        report = sync_env["sync"].verify()
        assert report["ok"] is True
        assert report["problems"] == []
        assert report["verificationScope"] == "four-way"
        assert report["dbChecked"] is True


# ── 真实隔离MinIO（备份→全新bucket恢复→四方对账）─────────────────────────────

MINIO_EP = os.environ.get("RAG_SYNC_TEST_MINIO_ENDPOINT", "")
MINIO_AK = os.environ.get("RAG_SYNC_TEST_MINIO_ACCESS_KEY", "minioadmin")
MINIO_SK = os.environ.get("RAG_SYNC_TEST_MINIO_SECRET_KEY", "minioadmin")
RESTORE_EP = os.environ.get("RAG_SYNC_TEST_MINIO_RESTORE_ENDPOINT", "")


@pytest.mark.integration
@pytest.mark.skipif(
    not (DRILL and MINIO_EP and RESTORE_EP),
    reason="requires SOCILA_TEST_DATABASE_URL + RAG_SYNC_TEST_MINIO_ENDPOINT + RAG_SYNC_TEST_MINIO_RESTORE_ENDPOINT",
)
class TestMinioBackupRestore:
    def test_backup_restore_fresh_minio_four_way(self, evidence_env, monkeypatch):
        monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
        from minio import Minio
        from psycopg import connect

        def client(ep: str) -> Minio:
            return Minio(ep, access_key=MINIO_AK, secret_key=MINIO_SK, secure=False)

        def wipe(raw: Minio) -> None:
            if raw.bucket_exists(EVIDENCE_BUCKET):
                for obj in raw.list_objects(EVIDENCE_BUCKET, recursive=True):
                    raw.remove_object(EVIDENCE_BUCKET, obj.object_name)
                raw.remove_bucket(EVIDENCE_BUCKET)

        primary = client(MINIO_EP)
        wipe(primary)  # 演练从“MinIO可达、bucket不存在”开始：零隐式建桶
        store = MinioObjectStore(MINIO_EP, MINIO_AK, MINIO_SK, EVIDENCE_BUCKET)
        sync = PolicyEvidenceSync(
            evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL
        )
        plan = sync.build_plan()
        assert plan["plannedBucketCreate"] is True
        result = sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert result["applied"] is True and result["bucketCreated"] is True
        assert sync.verify()["ok"] is True

        # 备份：逐对象下载到本地目录（含SHA清单）。
        backup_dir = evidence_env["evidence_root"].parent / "minio-backup"
        backup_dir.mkdir(exist_ok=True)
        objects = list(primary.list_objects(EVIDENCE_BUCKET, recursive=True))
        assert objects, "primary bucket为空"
        for obj in objects:
            data = store.get(obj.object_name)
            (backup_dir / obj.object_name.replace("/", "_")).write_bytes(data)

        # 全新MinIO实例：受控恢复（显式建桶+按备份回填，恢复程序自身负责，不属于evidence_sync副作用）。
        fresh = client(RESTORE_EP)
        wipe(fresh)
        fresh_store = MinioObjectStore(RESTORE_EP, MINIO_AK, MINIO_SK, EVIDENCE_BUCKET)
        fresh.make_bucket(EVIDENCE_BUCKET)
        for obj in objects:
            fresh_store.put(obj.object_name, store.get(obj.object_name), "text/html")

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE")
        restored_sync = PolicyEvidenceSync(
            evidence_env["evidence_root"], fresh_store, dsl_root=evidence_env["dsl"], database_url=DRILL
        )
        assert restored_sync.verify()["ok"] is False  # 空库：缺rag记录必须失败
        restored_plan = restored_sync.build_plan()
        assert restored_plan["bucketExists"] is True and restored_plan["plannedBucketCreate"] is False
        restored_sync.apply(
            restored_plan,
            plan_hash=restored_plan["planHash"],
            target_fingerprint=restored_plan["targetFingerprint"],
            i_am_authorized=True,
        )
        report = restored_sync.verify()
        assert report["ok"] is True, report["problems"]
        wipe(primary)
        wipe(fresh)

# ── MinIO缺桶生命周期（只读命令与拒绝路径零建桶；建桶仅属于授权apply写入段）──


def _wipe_bucket(raw) -> None:
    if raw.bucket_exists(EVIDENCE_BUCKET):
        for obj in raw.list_objects(EVIDENCE_BUCKET, recursive=True):
            raw.remove_object(EVIDENCE_BUCKET, obj.object_name)
        raw.remove_bucket(EVIDENCE_BUCKET)


@pytest.fixture()
def fresh_minio():
    """隔离MinIO且policy-originals不存在：每个测试前后清空bucket（自我准备/恢复现场）。"""
    from minio import Minio

    raw = Minio(MINIO_EP, access_key=MINIO_AK, secret_key=MINIO_SK, secure=False)
    _wipe_bucket(raw)
    yield raw
    _wipe_bucket(raw)


def _fresh_sync(fresh_minio, evidence_env, monkeypatch):
    """bucket缺失的隔离同步实例（每个测试先清RAG表，互不污染）。"""
    from psycopg import connect

    monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
    with connect(DRILL, autocommit=True) as conn:
        conn.execute("TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE")
    store = MinioObjectStore(MINIO_EP, MINIO_AK, MINIO_SK, EVIDENCE_BUCKET)
    return PolicyEvidenceSync(
        evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL
    )


@pytest.mark.integration
@pytest.mark.skipif(
    not (DRILL and MINIO_EP),
    reason="requires SOCILA_TEST_DATABASE_URL + RAG_SYNC_TEST_MINIO_ENDPOINT",
)
class TestBucketLifecycle:
    """SHV2-FR-023/SHV2-NFR-006：构造/audit/plan/verify/拒绝路径零建桶；bucket创建是授权apply的显式写入步骤（plannedBucketCreate进入计划与指纹）。"""

    def test_store_constructor_does_not_create_bucket(self, fresh_minio):
        store = MinioObjectStore(MINIO_EP, MINIO_AK, MINIO_SK, EVIDENCE_BUCKET)
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False  # 旧实现在此失败：构造期隐式make_bucket
        assert store.bucket_exists() is False
        assert store.ensure_bucket() is True
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is True
        assert store.ensure_bucket() is False  # 已存在：幂等返回False，不报错

    def test_ensure_bucket_concurrent_exactly_one_creator(self, fresh_minio):
        from concurrent.futures import ThreadPoolExecutor

        store = MinioObjectStore(MINIO_EP, MINIO_AK, MINIO_SK, EVIDENCE_BUCKET)
        with ThreadPoolExecutor(max_workers=4) as pool:
            created = list(pool.map(lambda _: store.ensure_bucket(), range(4)))
        assert created.count(True) == 1, created  # 并发创建恰好一次成功，其余按“已存在”幂等
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is True

    def test_audit_fresh_minio_bucket_missing_zero_write(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        report = sync.audit()
        assert report["ok"] is False
        assert any("BUCKET_MISSING" in p for p in report["problems"])
        assert report["bucketExists"] is False
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False  # 旧实现：audit构造store时已建桶
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            fetch_row = conn.execute("SELECT count(*) FROM rag.fetches").fetchone()
            version_row = conn.execute("SELECT count(*) FROM rag.document_versions").fetchone()
            assert fetch_row is not None and version_row is not None
            assert fetch_row[0] == 0 and version_row[0] == 0

    def test_plan_fresh_minio_deterministic_planned_bucket_create_zero_write(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        assert plan["bucketExists"] is False
        assert plan["plannedBucketCreate"] is True
        plan2 = sync.build_plan()
        assert json.dumps(plan, sort_keys=True) == json.dumps(plan2, sort_keys=True)  # 逐字节一致
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False  # 两次plan后bucket仍不存在
        assert len(plan["objects"]) == 1 and plan["objects"][0]["objectExists"] is False

    def test_apply_refusals_never_create_bucket(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        with pytest.raises(EvidenceSyncError, match=r"AUTH|授权"):
            sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=False)
        with pytest.raises(EvidenceSyncError, match=r"PLAN_HASH|planHash"):
            sync.apply(plan, plan_hash="0" * 64, target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        with pytest.raises(EvidenceSyncError, match=r"FINGERPRINT|fingerprint"):
            sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint="0" * 64, i_am_authorized=True)
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False  # bucket缺失则对象必然不存在

    def test_apply_refuses_evidence_drift_without_creating_bucket(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        (evidence_env["evidence"] / "original.html").write_bytes(HTML + b"drift")
        with pytest.raises(EvidenceSyncError, match=r"drift|漂移|META_SHA"):
            sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False

    def test_apply_refuses_db_state_drift_without_creating_bucket(self, fresh_minio, evidence_env, monkeypatch):
        from psycopg import connect

        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        with connect(DRILL, autocommit=True) as conn:
            conn.execute(
                "INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) VALUES ('310000','x','https://rsj.sh.gov.cn/x','rsj.sh.gov.cn')"
            )
            source_row = conn.execute("SELECT id FROM rag.sources WHERE domain='rsj.sh.gov.cn' LIMIT 1").fetchone()
            assert source_row is not None
            source_id = source_row[0]
            conn.execute(
                "INSERT INTO rag.fetches (source_id, url, status, content_hash, object_key, mime) VALUES (%s,'https://rsj.sh.gov.cn/x',200,%s,%s,'text/html')",
                (source_id, SHA, f"originals/{SHA}"),
            )
        with pytest.raises(EvidenceSyncError, match=r"drift|漂移|状态"):
            sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False

    def test_authorized_apply_creates_bucket_uploads_and_verifies(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        result = sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert result["applied"] is True and result["bucketCreated"] is True
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is True
        objects = list(fresh_minio.list_objects(EVIDENCE_BUCKET, recursive=True))
        assert [o.object_name for o in objects] == [f"originals/{SHA}"]
        report = sync.verify()
        assert report["ok"] is True and report["bucketExists"] is True
        assert report["verificationScope"] == "four-way" and report["dbChecked"] is True

    def test_reapply_same_plan_noop_after_bucket_created(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        again = sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert again["noop"] is True and again["applied"] is False
        assert len(list(fresh_minio.list_objects(EVIDENCE_BUCKET, recursive=True))) == 1

    def test_concurrent_apply_single_bucket_single_records(self, fresh_minio, evidence_env, monkeypatch):
        from concurrent.futures import ThreadPoolExecutor

        from psycopg import connect

        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        kwargs = {"plan_hash": plan["planHash"], "target_fingerprint": plan["targetFingerprint"], "i_am_authorized": True}
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: sync.apply(plan, **kwargs), range(2)))
        assert any(r["applied"] for r in results)
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is True
        with connect(DRILL, autocommit=True) as conn:
            fetch_row = conn.execute("SELECT count(*) FROM rag.fetches WHERE object_key=%s", (f"originals/{SHA}",)).fetchone()
            version_row = conn.execute("SELECT count(*) FROM rag.document_versions WHERE content_hash=%s", (SHA,)).fetchone()
            assert fetch_row is not None and version_row is not None
            fetches = fetch_row[0]
            versions = version_row[0]
        assert fetches == 1 and versions == 1

    def test_preexisting_bucket_plan_compatible_no_recreate(self, fresh_minio, evidence_env, monkeypatch):
        fresh_minio.make_bucket(EVIDENCE_BUCKET)  # 模拟bucket已存在（不经受控apply）
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        assert plan["bucketExists"] is True and plan["plannedBucketCreate"] is False
        result = sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert result["applied"] is True and result["bucketCreated"] is False
        assert sync.verify()["ok"] is True

    def test_conflicting_object_refused_with_bucket_present(self, fresh_minio, evidence_env, monkeypatch):
        fresh_minio.make_bucket(EVIDENCE_BUCKET)
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        result = sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert result["applied"] is True
        key = f"originals/{SHA}"
        fresh_minio.put_object(EVIDENCE_BUCKET, key, io.BytesIO(OTHER_BYTES), length=len(OTHER_BYTES), content_type="text/html")
        with pytest.raises(EvidenceSyncError, match=r"CONFLICT|冲突|DRIFT|漂移"):
            sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert fresh_minio.get_object(EVIDENCE_BUCKET, key).read() == OTHER_BYTES  # 拒绝覆盖

    def test_verify_missing_bucket_fails_without_creating(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        for kwargs, scope, degraded, dbchecked in (
            ({}, "four-way", False, True),
            ({"object_only": True}, "object-only", True, False),
        ):
            report = sync.verify(**kwargs)
            assert report["ok"] is False
            assert any("BUCKET_MISSING" in p for p in report["problems"])
            assert report["verificationScope"] == scope
            assert report["degraded"] is degraded and report["dbChecked"] is dbchecked
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False


# ── CLI与凭据不泄露 ──────────────────────────────────────────────────────────

SECRET_MARKER = "topsecret-minio-key-9137"
PG_PASSWORD_MARKER = "topsecret-pg-pass-9137"


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
def test_cli_outputs_do_not_leak_credentials(tmp_path, evidence_env, monkeypatch):
    fake_url = f"postgresql://postgres:{PG_PASSWORD_MARKER}@localhost:59999/rag_drill_nonexistent"
    env = {
        **os.environ,
        "AGENT_MINIO_ENDPOINT": "127.0.0.1:59998",
        "AGENT_MINIO_ACCESS_KEY": "minioadmin",
        "AGENT_MINIO_SECRET_KEY": SECRET_MARKER,
        "DATABASE_URL": fake_url,
    }
    r = subprocess.run(
        [sys.executable, "-m", "agent.rag.evidence_sync", "audit",
         "--evidence-dir", str(evidence_env["evidence_root"]), "--dsl-root", str(evidence_env["dsl"])],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    output = r.stdout + r.stderr
    assert SECRET_MARKER not in output, "输出泄露MinIO访问密钥"
    assert PG_PASSWORD_MARKER not in output, "输出泄露数据库口令"
    # 数据库不可达走错误路径：退出码非0，但不得打印连接串。
    assert r.returncode != 0


# ── 第四轮复审修复：S3错误失败关闭/bucket创建归属/拒绝路径零写入证据 ──────────


def _s3err(code: str) -> Exception:
    from minio.error import S3Error

    # S3Error首参为HTTP响应对象；错误分类契约只依赖code字段，注入None即可。
    return S3Error(cast(Any, None), code, f"drill-{code}", "resource", "request-id", "host-id")


class _FakeS3Client:
    """确定性S3客户端替身：stat_object按注入异常失败，put_object计数。"""

    def __init__(self, exc: Exception | None) -> None:
        self.exc = exc
        self.put_calls = 0

    def stat_object(self, bucket: str, key: str) -> None:
        if self.exc is not None:
            raise self.exc

    def put_object(self, bucket: str, key: str, data: bytes, length: int, content_type: str) -> None:
        self.put_calls += 1


def _minio_store_with_stat_error(exc: Exception | None) -> tuple[MinioObjectStore, _FakeS3Client]:
    store = MinioObjectStore("127.0.0.1:59999", "ak", "sk", EVIDENCE_BUCKET)
    fake = _FakeS3Client(exc)
    store._client = fake  # type: ignore[assignment]  # 测试注入：绕过网络构造确定性S3错误
    return store, fake


class _FakeResponse:
    def __init__(self, data: bytes) -> None:
        self._data = data

    def read(self) -> bytes:
        return self._data

    def close(self) -> None:
        pass

    def release_conn(self) -> None:
        pass


class _HealthyFakeS3Client:
    """权限正常替身（无网络）：bucket存在、对象缺失（NoSuchKey）、put可用。"""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def bucket_exists(self, bucket: str) -> bool:
        return True

    def stat_object(self, bucket: str, key: str) -> None:
        if key not in self.objects:
            raise _s3err("NoSuchKey")

    def put_object(self, bucket: str, key: str, data, length: int, content_type: str) -> None:
        self.objects[key] = data.read()

    def get_object(self, bucket: str, key: str) -> _FakeResponse:
        return _FakeResponse(self.objects[key])


class _WriteOnlyFakeS3Client(_HealthyFakeS3Client):
    """write-only权限组合替身：stat_object一律AccessDenied（权限降级），put仍可用并计数。
    必须穿过真实MinioObjectStore.exists的调用路径（错误吞噬层在storage.py中）。"""

    def __init__(self) -> None:
        super().__init__()
        self.put_calls = 0

    def stat_object(self, bucket: str, key: str) -> None:
        raise _s3err("AccessDenied")

    def put_object(self, bucket: str, key: str, data, length: int, content_type: str) -> None:
        self.put_calls += 1
        super().put_object(bucket, key, data, length, content_type)


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestAccessDeniedFailsClosed:
    """问题1×问题3交叉：plan后权限降级为write-only组合（stat拒绝、put可用）时，
    apply必须在exists处原样抛出AccessDenied且put调用次数为0（防止覆盖内容寻址对象）、
    数据库零写入；audit/verify同样必须失败（不得把权限错误转换为"对象缺失"报告）。"""

    def test_apply_access_denied_zero_put_zero_db_write(self, evidence_env, monkeypatch):
        from minio.error import S3Error

        monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
        _truncate_rag()
        store = MinioObjectStore("127.0.0.1:59999", "ak", "sk", EVIDENCE_BUCKET)
        store._client = _HealthyFakeS3Client()  # type: ignore[assignment]  # plan时权限正常
        sync = PolicyEvidenceSync(evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL)
        plan = sync.build_plan()
        degraded = _WriteOnlyFakeS3Client()
        store._client = degraded  # type: ignore[assignment]  # apply前权限降级为write-only组合
        before = _rag_db_fingerprint()
        with pytest.raises(S3Error):
            sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert degraded.put_calls == 0, "权限错误后不得继续put（write-only组合禁止覆盖内容寻址对象）"
        assert _rag_db_fingerprint() == before, "权限错误拒绝路径必须零写入"

    def test_audit_and_verify_fail_on_access_denied(self, evidence_env, monkeypatch):
        from minio.error import S3Error

        monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
        _truncate_rag()
        store = MinioObjectStore("127.0.0.1:59999", "ak", "sk", EVIDENCE_BUCKET)
        store._client = _WriteOnlyFakeS3Client()  # type: ignore[assignment]
        sync = PolicyEvidenceSync(evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL)
        with pytest.raises(S3Error):
            sync.audit()  # 旧实现：权限错误被吞→全部"对象缺失"报告，不失败
        with pytest.raises(S3Error):
            sync.verify()


class _ExternalBucketRaceStore(InMemoryObjectStore):
    """确定性建桶竞态（无sleep）：守卫与计划读到bucket缺失后、ensure_bucket执行前，
    外部进程抢先建桶——真实ensure_bucket此时发现已存在并返回False（本次调用者非创建者）。"""

    def __init__(self) -> None:
        super().__init__(with_bucket=False)

    def ensure_bucket(self) -> bool:
        self._bucket_exists = True  # 外部进程创建成功，bucket此后存在
        return False  # 本次ensure_bucket不是创建者


def _truncate_rag() -> None:
    from psycopg import connect

    with connect(DRILL, autocommit=True) as conn:
        conn.execute(
            "TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE"
        )


def _norm_db_value(value):
    import datetime
    import uuid

    if isinstance(value, datetime.timedelta):
        return str(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
    return value


def _rag_db_fingerprint() -> dict:
    """三张RAG表的规范化行内容hash与行数（拒绝路径数据库零写入断言数据源）。"""
    from psycopg import connect

    state: dict[str, dict] = {}
    with connect(DRILL, autocommit=True) as conn:
        for table in ("rag.sources", "rag.fetches", "rag.document_versions"):
            cur = conn.execute(f"SELECT * FROM {table} ORDER BY 1")
            assert cur.description is not None
            cols = [d.name for d in cur.description]
            rows = cur.fetchall()
            canonical = json.dumps(
                {"cols": cols, "rows": [[_norm_db_value(v) for v in row] for row in rows]},
                sort_keys=True,
                ensure_ascii=False,
            )
            state[table] = {"rows": len(rows), "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest()}
    return state


def _minio_fingerprint(raw) -> dict:
    """bucket存在状态+全部对象键与字节SHA+对象数（拒绝路径对象层零写入断言数据源）。"""
    exists = raw.bucket_exists(EVIDENCE_BUCKET)
    objects: dict[str, str] = {}
    if exists:
        for obj in raw.list_objects(EVIDENCE_BUCKET, recursive=True):
            data = raw.get_object(EVIDENCE_BUCKET, obj.object_name).read()
            objects[obj.object_name] = hashlib.sha256(data).hexdigest()
    return {"bucketExists": exists, "objectCount": len(objects), "objects": objects}


def _zero_write_snapshot(raw) -> dict:
    return {"db": _rag_db_fingerprint(), "minio": _minio_fingerprint(raw)}


class TestS3ErrorClassification:
    """问题1（失败关闭）：exists只有明确的NoSuchKey/NoSuchObject/NoSuchBucket才返回False；
    AccessDenied、InvalidAccessKeyId、SignatureDoesNotMatch、连接失败、超时、服务端错误
    及其他未知错误必须原样抛出，不得转换为"对象缺失"。"""

    @pytest.mark.parametrize("code", ["NoSuchKey", "NoSuchObject", "NoSuchBucket"])
    def test_exists_false_only_on_explicit_absence_codes(self, code):
        store, _ = _minio_store_with_stat_error(_s3err(code))
        assert store.exists("originals/abc") is False

    @pytest.mark.parametrize(
        "code",
        [
            "AccessDenied",
            "InvalidAccessKeyId",
            "SignatureDoesNotMatch",
            "InternalError",
            "ServiceUnavailable",
            "SlowDown",
            "RequestTimeout",
        ],
    )
    def test_exists_raises_on_non_absence_s3_errors(self, code):
        from minio.error import S3Error

        store, _ = _minio_store_with_stat_error(_s3err(code))
        with pytest.raises(S3Error) as ei:
            store.exists("originals/abc")
        assert ei.value.code == code

    def test_exists_raises_on_connection_failure(self):
        store, _ = _minio_store_with_stat_error(ConnectionError("connection refused by peer"))
        with pytest.raises(ConnectionError):
            store.exists("originals/abc")

    def test_exists_raises_on_timeout(self):
        store, _ = _minio_store_with_stat_error(TimeoutError("read timed out"))
        with pytest.raises(TimeoutError):
            store.exists("originals/abc")

    def test_stat_error_code_surface_through_sdk_contract(self):
        """实证契约：真实MinIO对缺失对象/缺失bucket分别返回NoSuchKey/NoSuchBucket。"""
        store, fake = _minio_store_with_stat_error(_s3err("NoSuchKey"))
        assert store.exists("originals/abc") is False
        fake.exc = _s3err("NoSuchBucket")
        assert store.exists("originals/abc") is False
        fake.exc = _s3err("AccessDenied")
        from minio.error import S3Error

        with pytest.raises(S3Error):
            store.exists("originals/abc")


@pytest.mark.integration
@pytest.mark.skipif(not MINIO_EP, reason="requires RAG_SYNC_TEST_MINIO_ENDPOINT")
class TestS3ErrorRealMinio:
    """真实隔离MinIO上的错误分类：缺失对象/缺失bucket返回False，权限类错误必须抛出。"""

    def test_missing_object_and_missing_bucket_return_false(self, fresh_minio):
        store = MinioObjectStore(MINIO_EP, MINIO_AK, MINIO_SK, EVIDENCE_BUCKET)
        assert fresh_minio.bucket_exists(EVIDENCE_BUCKET) is False
        assert store.exists("originals/abc") is False  # bucket缺失：NoSuchBucket→False
        fresh_minio.make_bucket(EVIDENCE_BUCKET)
        assert store.exists("originals/abc") is False  # 对象缺失：NoSuchKey→False

    def test_wrong_credentials_raise_instead_of_false(self, fresh_minio):
        from minio.error import S3Error

        bad = MinioObjectStore(MINIO_EP, MINIO_AK, "definitely-not-the-real-secret", EVIDENCE_BUCKET)
        with pytest.raises(S3Error) as ei:
            bad.exists("originals/abc")
        assert ei.value.code == "SignatureDoesNotMatch"


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestBucketCreatedAttribution:
    """问题2：bucketCreated必须使用ensure_bucket()的实际返回值——外部进程在
    bucket_exists与ensure_bucket之间抢先建桶时，本次apply必须报告bucketCreated=false，
    且对象上传/RAG登记/verify不受影响（确定性竞态，无随机sleep）。"""

    def test_apply_reports_false_when_external_process_won_the_race(self, evidence_env, monkeypatch):
        monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
        _truncate_rag()
        store = _ExternalBucketRaceStore()
        sync = PolicyEvidenceSync(evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL)
        plan = sync.build_plan()
        assert plan["plannedBucketCreate"] is True
        result = sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert result["applied"] is True
        assert result["bucketCreated"] is False, "外部进程抢先建桶时apply必须如实报告bucketCreated=false"
        assert store.exists(f"originals/{SHA}"), "竞态失败方仍须完成对象上传"
        assert sync.verify()["ok"] is True, "RAG登记与四方verify不受竞态影响"


@pytest.mark.integration
@pytest.mark.skipif(not (DRILL and MINIO_EP), reason="requires SOCILA_TEST_DATABASE_URL + RAG_SYNC_TEST_MINIO_ENDPOINT")
class TestBucketCreatedAttributionRealMinio:
    def test_external_bucket_creation_race_reports_created_false(self, fresh_minio, evidence_env, monkeypatch):
        monkeypatch.setenv("RAG_EVIDENCE_ALLOW_DIRTY", "1")
        _truncate_rag()

        class _RaceStore(MinioObjectStore):
            """ensure_bucket执行前外部进程抢先make_bucket（确定性注入竞态窗口）。"""

            def ensure_bucket(self) -> bool:
                fresh_minio.make_bucket(EVIDENCE_BUCKET)
                return super().ensure_bucket()  # 已存在→False

        store = _RaceStore(MINIO_EP, MINIO_AK, MINIO_SK, EVIDENCE_BUCKET)
        sync = PolicyEvidenceSync(evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL)
        plan = sync.build_plan()
        assert plan["bucketExists"] is False and plan["plannedBucketCreate"] is True
        result = sync.apply(plan, plan_hash=plan["planHash"], target_fingerprint=plan["targetFingerprint"], i_am_authorized=True)
        assert result["applied"] is True
        assert result["bucketCreated"] is False
        objects = list(fresh_minio.list_objects(EVIDENCE_BUCKET, recursive=True))
        assert [o.object_name for o in objects] == [f"originals/{SHA}"]
        assert sync.verify()["ok"] is True


@pytest.mark.integration
@pytest.mark.skipif(not (DRILL and MINIO_EP), reason="requires SOCILA_TEST_DATABASE_URL + RAG_SYNC_TEST_MINIO_ENDPOINT")
class TestRejectionPathsZeroWrite:
    """问题3：每个拒绝路径在apply调用前后比较三张RAG表（规范化行hash+行数）、
    bucket存在状态与MinIO对象键/字节SHA/对象数；外部夹具制造的漂移以"漂移后基线"
    为断言基准（外部漂移不计入apply写集合，并分别记录）。"""

    def _apply(self, sync, plan, **overrides):
        kwargs = {
            "plan_hash": plan["planHash"],
            "target_fingerprint": plan["targetFingerprint"],
            "i_am_authorized": True,
        }
        kwargs.update(overrides)
        return sync.apply(plan, **kwargs)

    def test_refusal_missing_authorization(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"AUTH|授权"):
            self._apply(sync, plan, i_am_authorized=False)
        assert _zero_write_snapshot(fresh_minio) == before

    def test_refusal_wrong_plan_hash(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"PLAN_HASH|planHash"):
            self._apply(sync, plan, plan_hash="0" * 64)
        assert _zero_write_snapshot(fresh_minio) == before

    def test_refusal_wrong_target_fingerprint(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"FINGERPRINT|fingerprint"):
            self._apply(sync, plan, target_fingerprint="0" * 64)
        assert _zero_write_snapshot(fresh_minio) == before

    def test_refusal_code_sha_mismatch(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        stale = json.loads(json.dumps(plan))
        stale["codeSha"] = "0" * 40
        stale["planHash"] = plan_hash_of(stale)
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"CODE_SHA|codeSha"):
            self._apply(sync, stale)
        assert _zero_write_snapshot(fresh_minio) == before

    def test_refusal_dirty_worktree(self, fresh_minio, evidence_env, monkeypatch):
        from agent.rag import evidence_sync as es

        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        monkeypatch.delenv("RAG_EVIDENCE_ALLOW_DIRTY", raising=False)
        monkeypatch.setattr(es, "git_head", lambda: {"sha": plan["codeSha"], "dirty": True})
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"DIRTY|工作树"):
            self._apply(sync, plan)
        assert _zero_write_snapshot(fresh_minio) == before

    def test_refusal_evidence_manifest_hash_drift(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        make_evidence(evidence_env["evidence_root"], "DOC-SH-EXTRA-2026")  # plan后证据集合漂移
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"EVIDENCE_DRIFT|drift|漂移"):
            self._apply(sync, plan)
        assert _zero_write_snapshot(fresh_minio) == before

    def test_refusal_minio_state_drift(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        fresh_minio.make_bucket(EVIDENCE_BUCKET)  # 外部漂移：建桶并放入冲突对象
        fresh_minio.put_object(EVIDENCE_BUCKET, f"originals/{SHA}", io.BytesIO(OTHER_BYTES), length=len(OTHER_BYTES), content_type="text/html")
        baseline = _zero_write_snapshot(fresh_minio)  # 外部漂移后基线（漂移≠apply写入）
        with pytest.raises(EvidenceSyncError, match=r"DRIFT|漂移"):
            self._apply(sync, plan)
        assert _zero_write_snapshot(fresh_minio) == baseline, "apply自身对漂移必须零写入"

    def test_refusal_rag_db_state_drift(self, fresh_minio, evidence_env, monkeypatch):
        from psycopg import connect

        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        with connect(DRILL, autocommit=True) as conn:
            conn.execute(
                "INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) VALUES ('310000','x','https://rsj.sh.gov.cn/x','rsj.sh.gov.cn')"
            )
            source_row = conn.execute("SELECT id FROM rag.sources WHERE domain='rsj.sh.gov.cn' LIMIT 1").fetchone()
            assert source_row is not None
            source_id = source_row[0]
            conn.execute(
                "INSERT INTO rag.fetches (source_id, url, status, content_hash, object_key, mime) VALUES (%s,'https://rsj.sh.gov.cn/x',200,%s,%s,'text/html')",
                (source_id, SHA, f"originals/{SHA}"),
            )
        baseline = _zero_write_snapshot(fresh_minio)  # 外部漂移后基线
        with pytest.raises(EvidenceSyncError, match=r"DRIFT|漂移"):
            self._apply(sync, plan)
        assert _zero_write_snapshot(fresh_minio) == baseline, "apply自身对RAG漂移必须零写入"

    def test_refusal_object_conflict(self, fresh_minio, evidence_env, monkeypatch):
        fresh_minio.make_bucket(EVIDENCE_BUCKET)
        fresh_minio.put_object(EVIDENCE_BUCKET, f"originals/{SHA}", io.BytesIO(OTHER_BYTES), length=len(OTHER_BYTES), content_type="text/html")
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        assert plan["conflicts"] == ["DOC-SH-TEST-2026"]
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"CONFLICT|冲突"):
            self._apply(sync, plan)
        after = _zero_write_snapshot(fresh_minio)
        assert after == before, "冲突拒绝必须零写入且对象字节不变"
        assert after["minio"]["objects"][f"originals/{SHA}"] == hashlib.sha256(OTHER_BYTES).hexdigest()

    def test_refusal_injected_failure_rolls_back_db_and_records_apply_side_minio(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        before = _zero_write_snapshot(fresh_minio)
        with pytest.raises(EvidenceSyncError, match=r"INJECTED|注入"):
            self._apply(sync, plan, inject_failure_at="after_uploads")
        after = _zero_write_snapshot(fresh_minio)
        assert after["db"] == before["db"], "注入点失败必须整体回滚：三张RAG表零写入"
        # apply自身副作用如实记录：对象在注入前已上传（MinIO非事务资源）——
        # 该变化属于apply的部分写入，与外部漂移分别记录。
        assert before["minio"]["objectCount"] == 0
        assert after["minio"]["bucketExists"] is True and after["minio"]["objectCount"] == 1

    def test_concurrent_race_exactly_one_writer_loser_zero_extra_write(self, fresh_minio, evidence_env, monkeypatch):
        from concurrent.futures import ThreadPoolExecutor

        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        plan = sync.build_plan()
        before = _zero_write_snapshot(fresh_minio)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self._apply(sync, plan), range(2)))
        assert sorted(r["applied"] for r in results) == [False, True]
        after = _zero_write_snapshot(fresh_minio)
        # 胜者一次合法写入的精确终态：恰好单行登记、单对象；失败方零额外写入。
        assert after["db"]["rag.sources"]["rows"] == 1
        assert after["db"]["rag.fetches"]["rows"] == 1
        assert after["db"]["rag.document_versions"]["rows"] == 1
        assert after["minio"]["bucketExists"] is True and after["minio"]["objectCount"] == 1
        assert after["db"] != before["db"] or before["db"]["rag.sources"]["rows"] > 0


@pytest.mark.integration
@pytest.mark.skipif(not (DRILL and MINIO_EP), reason="requires SOCILA_TEST_DATABASE_URL + RAG_SYNC_TEST_MINIO_ENDPOINT")
class TestFingerprintSemantics:
    """问题4语义：planHash绑定整个计划（含bucketExists与plannedBucketCreate执行意图）；
    targetFingerprint只绑定真实前置状态（bucketExists+对象+RAG）；
    finalFingerprint只描述真实预期终态；plannedBucketCreate不是状态指纹的独立字段。"""

    def test_bucket_state_change_updates_plan_hash_and_target_fingerprint_but_not_final(self, fresh_minio, evidence_env, monkeypatch):
        sync = _fresh_sync(fresh_minio, evidence_env, monkeypatch)
        absent = sync.build_plan()
        assert absent["bucketExists"] is False and absent["plannedBucketCreate"] is True
        fresh_minio.make_bucket(EVIDENCE_BUCKET)  # bucket真实存在性变化（外部操作）
        present = sync.build_plan()
        assert present["bucketExists"] is True and present["plannedBucketCreate"] is False
        assert present["planHash"] != absent["planHash"], "plannedBucketCreate/bucketExists变化必须改变planHash"
        assert present["targetFingerprint"] != absent["targetFingerprint"], "bucket真实存在性变化必须改变targetFingerprint"
        assert present["finalFingerprint"] == absent["finalFingerprint"], "finalFingerprint只描述终态，与前置无关"
        assert sync.build_plan()["planHash"] == present["planHash"], "同状态计划必须确定性"

    def test_changing_planned_bucket_create_changes_plan_hash(self, evidence_env):
        """plannedBucketCreate是执行意图并进入planHash（计划体成分）。"""
        body_created = {"schema": PLAN_SCHEMA, "plannedBucketCreate": True, "k": "v"}
        body_existing = {"schema": PLAN_SCHEMA, "plannedBucketCreate": False, "k": "v"}
        assert plan_hash_of(body_existing) != plan_hash_of(body_created)


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
def test_cli_unexpected_s3_error_output_redacts_credentials(evidence_env, monkeypatch, capsys):
    """CLI对非预期S3/连接错误统一脱敏：凭据与连接串口令不得出现在输出。"""
    import agent.rag.evidence_sync as es

    class _BoomStore(InMemoryObjectStore):
        def bucket_exists(self):
            raise RuntimeError(
                "minio connect failed: postgresql://minio:Sup3rSecret9@127.0.0.1:9000/policy-originals"
            )

    monkeypatch.setattr(es, "_build_store", lambda endpoint, bucket: _BoomStore())
    rc = es.main(
        [
            "audit",
            "--evidence-dir", str(evidence_env["evidence_root"]),
            "--dsl-root", str(evidence_env["dsl"]),
            "--database-url", "postgresql://postgres:PgDrillS3cret7@localhost:59999/db",
        ]
    )
    captured = capsys.readouterr()
    output = captured.out + captured.err
    assert rc == 1
    assert "Sup3rSecret9" not in output, "非预期错误输出泄露MinIO口令"
    assert "PgDrillS3cret7" not in output, "非预期错误输出泄露数据库口令"
