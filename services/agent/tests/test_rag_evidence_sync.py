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
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from agent.rag.evidence_sync import (
    EVIDENCE_BUCKET,
    EvidenceSyncError,
    PolicyEvidenceSync,
    guard_minio_endpoint,
)
from agent.rag.storage import InMemoryObjectStore

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


# ── 受控同步（隔离数据库）────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.skipif(not DRILL, reason="requires SOCILA_TEST_DATABASE_URL")
class TestControlledSync:
    @pytest.fixture()
    def sync_env(self, evidence_env, monkeypatch):
        from psycopg import connect

        assert DRILL is not None
        monkeypatch.setenv("DATABASE_URL", DRILL)
        with connect(DRILL, autocommit=True) as conn:
            conn.execute("TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE")
        store = InMemoryObjectStore()
        sync = PolicyEvidenceSync(
            evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL
        )
        return {"sync": sync, "store": store, "evidence_env": evidence_env}

    def test_apply_uploads_new_objects_and_writes_rag_records(self, sync_env):
        result = sync_env["sync"].apply()
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

    def test_reapply_existing_object_noop(self, sync_env):
        sync_env["sync"].apply()
        again = sync_env["sync"].apply()
        assert again["uploaded"] == 0
        assert again["noopObjects"] == 1

    def test_conflicting_object_refused_no_overwrite(self, sync_env):
        key = f"originals/{SHA}"
        sync_env["store"].put(key, OTHER_BYTES, "text/html")
        with pytest.raises(EvidenceSyncError, match=r"conflict|冲突|覆盖"):
            sync_env["sync"].apply()
        assert sync_env["store"].get(key) == OTHER_BYTES

    def test_verify_detects_missing_rag_records(self, sync_env):
        sync_env["sync"].apply()
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("DELETE FROM rag.document_versions")
            conn.execute("DELETE FROM rag.fetches")
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("rag" in p or "记录" in p for p in report["problems"])

    def test_verify_detects_db_content_hash_drift(self, sync_env):
        sync_env["sync"].apply()
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("UPDATE rag.document_versions SET content_hash='9' || substr(content_hash, 2)")
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("content_hash" in p for p in report["problems"])

    def test_verify_detects_wrong_object_key(self, sync_env):
        sync_env["sync"].apply()
        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("UPDATE rag.document_versions SET object_key='originals/wrong-key'")
            conn.execute("UPDATE rag.fetches SET object_key='originals/another-wrong'")
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("object_key" in p for p in report["problems"])

    def test_verify_detects_object_download_sha_drift(self, sync_env):
        sync_env["sync"].apply()
        key = f"originals/{SHA}"
        sync_env["store"]._objects[key] = OTHER_BYTES
        report = sync_env["sync"].verify()
        assert report["ok"] is False
        assert any("sha|SHA|漂移" in p or "SHA" in p for p in report["problems"])

    def test_plan_emits_upload_list_without_writes(self, sync_env):
        plan = sync_env["sync"].plan()
        assert plan["plannedUploads"][0]["objectKey"] == f"originals/{SHA}"
        assert sync_env["store"]._objects == {}

    def test_verify_ok_after_apply(self, sync_env):
        sync_env["sync"].apply()
        report = sync_env["sync"].verify()
        assert report["ok"] is True
        assert report["problems"] == []


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
    def test_backup_restore_fresh_minio_four_way(self, evidence_env):
        from minio import Minio

        def client(ep: str) -> Minio:
            return Minio(ep, access_key=MINIO_AK, secret_key=MINIO_SK, secure=False)

        primary = client(MINIO_EP)
        if not primary.bucket_exists(EVIDENCE_BUCKET):
            primary.make_bucket(EVIDENCE_BUCKET)
        store = _MinioStoreAdapter(primary, EVIDENCE_BUCKET)
        sync = PolicyEvidenceSync(
            evidence_env["evidence_root"], store, dsl_root=evidence_env["dsl"], database_url=DRILL
        )
        sync.apply()
        assert sync.verify()["ok"] is True

        # 备份：逐对象下载到本地目录（含SHA清单）。
        backup_dir = evidence_env["evidence_root"].parent / "minio-backup"
        backup_dir.mkdir(exist_ok=True)
        objects = list(primary.list_objects(EVIDENCE_BUCKET, recursive=True))
        assert objects, "primary bucket为空"
        for obj in objects:
            data = store.get(obj.object_name)
            (backup_dir / obj.object_name.replace("/", "_")).write_bytes(data)

        # 全新MinIO实例：空bucket恢复后四方对账。
        fresh = client(RESTORE_EP)
        if fresh.bucket_exists(EVIDENCE_BUCKET):
            for obj in fresh.list_objects(EVIDENCE_BUCKET, recursive=True):
                fresh.remove_object(EVIDENCE_BUCKET, obj.object_name)
        else:
            fresh.make_bucket(EVIDENCE_BUCKET)
        fresh_store = _MinioStoreAdapter(fresh, EVIDENCE_BUCKET)
        for obj in objects:
            fresh_store.put(obj.object_name, store.get(obj.object_name), "text/html")

        from psycopg import connect

        with connect(DRILL, autocommit=True) as conn:
            conn.execute("TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE")
        restored_sync = PolicyEvidenceSync(
            evidence_env["evidence_root"], fresh_store, dsl_root=evidence_env["dsl"], database_url=DRILL
        )
        assert restored_sync.verify()["ok"] is False  # 空库：缺rag记录必须失败
        restored_sync.apply()
        report = restored_sync.verify()
        assert report["ok"] is True, report["problems"]


class _MinioStoreAdapter:
    """把Minio客户端适配成ObjectStore协议（测试专用）。"""

    def __init__(self, client, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def put(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        import io

        self._client.put_object(self._bucket, key, io.BytesIO(content), length=len(content), content_type=content_type)
        return key

    def get(self, key: str) -> bytes:
        resp = self._client.get_object(self._bucket, key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    def exists(self, key: str) -> bool:
        from minio.error import S3Error

        try:
            self._client.stat_object(self._bucket, key)
            return True
        except S3Error:
            return False


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
