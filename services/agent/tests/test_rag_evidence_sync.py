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

DRILL = os.environ.get("SOCILA_TEST_DATABASE_URL")

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
            source_id = conn.execute("SELECT id FROM rag.sources WHERE domain='rsj.sh.gov.cn' LIMIT 1").fetchone()[0]
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
            assert conn.execute("SELECT count(*) FROM rag.document_versions").fetchone()[0] == 0
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
            fetches = conn.execute("SELECT count(*) FROM rag.fetches WHERE object_key=%s", (f"originals/{SHA}",)).fetchone()[0]
            versions = conn.execute("SELECT count(*) FROM rag.document_versions WHERE content_hash=%s", (SHA,)).fetchone()[0]
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

MINIO_EP = os.environ.get("RAG_SYNC_TEST_MINIO_ENDPOINT")
MINIO_AK = os.environ.get("RAG_SYNC_TEST_MINIO_ACCESS_KEY", "minioadmin")
MINIO_SK = os.environ.get("RAG_SYNC_TEST_MINIO_SECRET_KEY", "minioadmin")
RESTORE_EP = os.environ.get("RAG_SYNC_TEST_MINIO_RESTORE_ENDPOINT")


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
            assert conn.execute("SELECT count(*) FROM rag.fetches").fetchone()[0] == 0
            assert conn.execute("SELECT count(*) FROM rag.document_versions").fetchone()[0] == 0

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
            source_id = conn.execute("SELECT id FROM rag.sources WHERE domain='rsj.sh.gov.cn' LIMIT 1").fetchone()[0]
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
            fetches = conn.execute("SELECT count(*) FROM rag.fetches WHERE object_key=%s", (f"originals/{SHA}",)).fetchone()[0]
            versions = conn.execute("SELECT count(*) FROM rag.document_versions WHERE content_hash=%s", (SHA,)).fetchone()[0]
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
