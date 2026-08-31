"""Neon 迁移演练工具（REL-FR-005/006 / PRD §7.1，步骤07.4/07.5）。

只读导出 Neon（pg_dump 18，与数据源版本一致）→ 临时 postgres:18 容器恢复 →
按目标 Schema 映射复制（INSERT，与服务器版本无关）→ 修复序列 →
对账（数量+共享列哈希）→ JSON 报告。

用法（在仓库根，DATABASE_URL 指向 Neon，只读使用）：
  DRILL_ROUND=1 SSP_PG_DEV_PASSWORD=... DATABASE_URL=<neon> \
    uv run --project services/agent python services/agent/scripts/neon_drill.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

REPO = Path(__file__).resolve().parents[3]
PG_HOST, PG_PORT = "localhost", 5433
ROUND = os.environ.get("DRILL_ROUND", "1")
NEON_RESTORE_DB = f"neon-restore-r{ROUND}"
TARGET_DB = os.environ.get("DRILL_TARGET_DB", f"drill-target-{ROUND}")

# 目标库新增列映射（BLOCKER-001：transcript_text 不复制，另行保全）。
EXTRA_VALUES = {
    "rules": {"jurisdiction_code": "310000"},
    "params": {"jurisdiction_code": "310000", "effective_to": None},
    "rule_sets": {"jurisdiction_code": "310000"},
    "tests": {"jurisdiction_code": "310000"},
    "policy_pack_versions": {"jurisdiction_code": "310000", "pack_kind": "overlay"},
    "conversations": {"owner_user_id": None},
    "plans": {"owner_user_id": None},
}
COMPUTED = {
    ("rules", "business_key"): lambda row: row["rule_id"],
    ("params", "business_key"): lambda row: row["param_id"],
}
NOT_NULL_FALLBACK = {("showcase_cases", "ai_response"): "", ("showcase_cases", "user_message"): ""}
PRESERVE_NEON_ONLY = {"showcase_cases": ["transcript_text"]}
PK = {
    "rules": "id", "params": "id", "rule_sets": "id", "workflows": "id",
    "policy_pack_versions": "id", "publishes": "id", "plans": "id",
    "conversations": "id", "showcase_cases": "id", "cases": "id", "tests": "id",
}


def sh(cmd: list[str], *, binary_out: bool = False, stdin_file=None, **extra) -> bytes | str:
    """执行命令；失败只打印 stderr 尾段（含连接串的命令行不回显）。"""
    kwargs: dict = dict(extra)
    if not binary_out:
        kwargs["text"] = True
    if stdin_file is not None:
        kwargs["stdin"] = stdin_file
    if "stdout" not in kwargs or "stderr" not in kwargs:
        kwargs["capture_output"] = True
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        stderr = result.stderr or b""
        if isinstance(stderr, bytes):
            stderr = stderr.decode(errors="replace")
        raise RuntimeError(f"command failed ({result.returncode}): {stderr[-400:]}")
    return result.stdout


def pg_conn(db: str, autocommit: bool = False):
    password = os.environ["SSP_PG_DEV_PASSWORD"]
    conn = psycopg.connect(f"postgresql://postgres:{password}@{PG_HOST}:{PG_PORT}/{db}")
    conn.autocommit = autocommit or False
    return conn


def main() -> None:
    neon_url = os.environ.get("DATABASE_URL")
    if not neon_url:
        print("DATABASE_URL (Neon) is required", file=sys.stderr)
        sys.exit(1)
    if "sslmode" not in neon_url:
        neon_url += ("&" if "?" in neon_url else "?") + "sslmode=require"
    started = datetime.now(timezone.utc).isoformat()
    report: dict[str, object] = {"round": ROUND, "started": started, "steps": []}

    work = Path(os.environ.get("NEON_DRILL_DIR", Path.home() / "AppData" / "Local" / "Temp" / "neon-drill"))
    work.mkdir(parents=True, exist_ok=True)
    dump_path = work / f"neon-round{ROUND}.dump"

    # 1) 只读导出 Neon（postgres:18 客户端，stdout → 本地文件）
    out = sh(["docker", "run", "--rm", "postgres:18-alpine", "pg_dump", neon_url,
              "--no-owner", "--no-privileges", "-Fc"], binary_out=True)
    dump_path.write_bytes(out if isinstance(out, bytes) else out.encode())
    report["steps"].append({"step": "neon-export(readonly)", "status": "ok", "bytes": len(out)})
    print(f"[drill] neon export ok: {len(out)} bytes", flush=True)

    # 2) Neon 形状恢复：临时 postgres:18 容器（与数据源版本一致）
    sh(["docker", "rm", "-f", "neon-restore-tmp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sh(["docker", "run", "--rm", "-d", "--name", "neon-restore-tmp",
        "-e", "POSTGRES_PASSWORD=restore-verify", "-p", "5434:5432", "postgres:18-alpine"])
    time.sleep(8)
    sh(["docker", "cp", str(dump_path), "neon-restore-tmp:/tmp/export.dump"])
    sh(["docker", "exec", "neon-restore-tmp", "psql", "-U", "postgres",
        "-c", f'CREATE DATABASE "{NEON_RESTORE_DB}"'])
    sh(["docker", "exec", "neon-restore-tmp", "pg_restore", "-U", "postgres",
        "-d", NEON_RESTORE_DB, "--no-owner", "--no-privileges", "/tmp/export.dump"])
    report["steps"].append({"step": "neon-restore(pg18)", "status": "ok"})
    print("[drill] neon restore ok (pg18 临时容器)", flush=True)

    def restore_conn():
        return psycopg.connect(f"postgresql://postgres:restore-verify@localhost:5434/{NEON_RESTORE_DB}")

    # 3) 目标库：空库 + core migrations（pgvector/pg17）
    with pg_conn("postgres", autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{TARGET_DB}"')
        conn.execute(f'CREATE DATABASE "{TARGET_DB}"')
    env = dict(os.environ, DATABASE_URL=f"postgresql://postgres:{os.environ['SSP_PG_DEV_PASSWORD']}@{PG_HOST}:{PG_PORT}/{TARGET_DB}")
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm not found on PATH")
    sh([npm, "run", "db:migrate", "--silent"], cwd=str(REPO), env=env)
    report["steps"].append({"step": "target-migrations", "status": "ok"})

    # 4) 映射复制（INSERT 与服务器版本无关）
    copied: dict[str, int] = {}
    preserved: dict[str, int] = {}
    with restore_conn() as src:
        neon_tables = [
            r[0] for r in src.execute(
                """SELECT table_name FROM information_schema.tables
                   WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"""
            ).fetchall()
        ]
        for table in neon_tables:
            with pg_conn(TARGET_DB) as target:
                target_col_info = {
                    r[0]: r[1] for r in target.execute(
                        """SELECT column_name, data_type FROM information_schema.columns
                           WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position""",
                        (table,),
                    ).fetchall()
                }
                target_cols = set(target_col_info)
            src_cols = [r[0] for r in src.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position""",
                (table,),
            ).fetchall()]
            for col in PRESERVE_NEON_ONLY.get(table, []):
                if col in src_cols:
                    data = src.execute(
                        f"SELECT coalesce(string_agg({col}, ' § ' ORDER BY {PK[table]}),'') FROM public.{table}"
                    ).fetchone()[0]
                    out2 = work / f"preserved-{table}-{col}-round{ROUND}.txt"
                    out2.write_text(data or "", encoding="utf-8")
                    preserved[f"{table}.{col}"] = len(data or "")

            insert_cols = sorted(target_cols)
            rows: list[tuple] = []
            cur = src.cursor(name=f"read_{table}")
            cur.execute(f"SELECT {', '.join(chr(34) + c + chr(34) for c in src_cols)} FROM public.{table}")
            while True:
                batch = cur.fetchmany(500)
                if not batch:
                    break
                for row in batch:
                    src_row = dict(zip(src_cols, row))
                    target_row: dict[str, object] = {}
                    for col in insert_cols:
                        if col in src_cols:
                            val = src_row.get(col)
                        elif col in EXTRA_VALUES.get(table, {}):
                            val = EXTRA_VALUES[table][col]
                        elif (table, col) in COMPUTED:
                            val = COMPUTED[(table, col)](src_row)
                        elif (table, col) in NOT_NULL_FALLBACK:
                            val = src_row.get(col) or NOT_NULL_FALLBACK[(table, col)]
                        else:
                            val = None
                        target_row[col] = val
                    rows.append(tuple(target_row[c] for c in insert_cols))
            cur.close()

            # psycopg3 默认把 list/dict 适配为 PG 数组，写 json/jsonb 列必须包 Jsonb；
            # str 标量同样包装，保持源 jsonb 字符串标量语义（NULL 保持 NULL）。
            json_cols = {c for c, t in target_col_info.items() if t in ("json", "jsonb")}
            if json_cols:
                rows = [
                    tuple(
                        (Jsonb(v) if v is not None else None) if c in json_cols else v
                        for c, v in zip(insert_cols, row)
                    )
                    for row in rows
                ]

            with pg_conn(TARGET_DB) as target:
                target.execute("SET synchronous_commit TO off")
                placeholders = ", ".join(["%s"] * len(insert_cols))
                col_list = ", ".join(f'"{c}"' for c in insert_cols)
                sql = f'INSERT INTO public."{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
                with target.cursor() as ins:
                    try:
                        ins.executemany(sql, rows)
                    except Exception:
                        target.rollback()
                        # 逐行定位失败行；只输出列名+类型+前80字符，避免个人数据进日志
                        with pg_conn(TARGET_DB) as probe_conn:
                            with probe_conn.cursor() as probe:
                                for i, r in enumerate(rows):
                                    try:
                                        probe.execute(sql, r)
                                    except Exception as e2:
                                        bad = {
                                            c: f"{type(v).__name__}:{str(v)[:80]!r}"
                                            for c, v in zip(insert_cols, r)
                                            if isinstance(v, str) and "{" in v[:1]
                                        }
                                        raise RuntimeError(
                                            f"copy {table} row {i} failed: {e2}; bracket-params: {bad}"
                                        ) from e2
                        raise
                target.commit()
            print(f"[drill] copy {table}: {len(rows)} rows", flush=True)
            copied[table] = len(rows)
    report["steps"].append({"step": "copy", "status": "ok", "rows": copied, "preserved": preserved})
    print(f"[drill] copy ok: {sum(copied.values())} rows", flush=True)

    # 5) 序列修复（仅整型主键且存在 serial 序列的表；UUID 主键无序列）
    with pg_conn(TARGET_DB) as target:
        for table, pk in PK.items():
            if table not in copied:
                continue
            seq = target.execute(
                "SELECT pg_get_serial_sequence(%s, %s)", (f"public.{table}", pk)
            ).fetchone()[0]
            if not seq:
                continue
            dtype = target.execute(
                """SELECT data_type FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=%s AND column_name=%s""",
                (table, pk),
            ).fetchone()[0]
            if dtype not in ("smallint", "integer", "bigint"):
                continue
            target.execute(
                f"SELECT setval(%s, COALESCE((SELECT MAX({pk}) FROM public.{table}), 1))",
                (seq,),
            )
        target.commit()
    report["steps"].append({"step": "sequences", "status": "ok"})

    # 6) 对账：数量 + 共享列哈希
    reconciliation: dict[str, dict] = {}
    with restore_conn() as src, pg_conn(TARGET_DB) as target:
        for table in neon_tables:
            src_cols = {r[0] for r in src.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=%s""", (table,)).fetchall()}
            tgt_cols = {r[0] for r in target.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=%s""", (table,)).fetchall()}
            shared = sorted(src_cols & tgt_cols)
            pk = PK[table]
            src_count = src.execute(f"SELECT count(*) FROM public.{table}").fetchone()[0]
            tgt_count = target.execute(f"SELECT count(*) FROM public.{table}").fetchone()[0]
            col_list = ", ".join(f'"{c}"' for c in shared)
            hash_sql = f'SELECT md5(string_agg(md5(to_jsonb(t)::text), \'\' ORDER BY "{pk}")) FROM (SELECT {col_list} FROM public.{table}) t'
            src_hash = src.execute(hash_sql).fetchone()[0]
            tgt_hash = target.execute(hash_sql).fetchone()[0]
            reconciliation[table] = {
                "count_source": src_count, "count_target": tgt_count,
                "count_match": src_count == tgt_count,
                "shared_hash_match": src_hash == tgt_hash,
            }
    report["steps"].append({"step": "reconcile", "status": "ok", "tables": reconciliation})
    all_ok = all(t["count_match"] and t["shared_hash_match"] for t in reconciliation.values())
    report["reconciliation_all_match"] = all_ok
    print(f"[drill] 对账：{'全部一致' if all_ok else '存在差异'}", flush=True)

    report["finished"] = datetime.now(timezone.utc).isoformat()
    report_path = REPO / "docs/refactor/policy-ops-agent/reports/stage-07" / f"neon-drill-round{ROUND}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[drill] 报告：{report_path}", flush=True)


if __name__ == "__main__":
    main()
