"""Agent schema 迁移执行器与角色引导（AGT-FR-004/010）。

用法：
  python -m agent.migrate                      # 应用 agent schema migration
  python -m agent.migrate --with-roles         # 另以管理员权限创建 agent_app 角色并授权

需要环境变量 AGENT_DATABASE_URL（默认回退 DATABASE_URL / 本地演练库）。
--with-roles 需要 AGENT_DB_PASSWORD（agent_app 角色口令），并以具备 CREATE ROLE
权限的连接执行——与 db-guard 同思路：默认仅允许 localhost。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _database_url() -> str:
    url = os.environ.get("AGENT_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        print("AGENT_DATABASE_URL/DATABASE_URL is required", file=sys.stderr)
        sys.exit(1)
    host = psycopg.conninfo.conninfo_to_dict(url).get("host", "")
    if host not in ("localhost", "127.0.0.1", "::1") and os.environ.get("ALLOW_REMOTE_DATABASE") != "1":
        print(f"[db-guard] 非本机主机 ({host})；远程需 ALLOW_REMOTE_DATABASE=1", file=sys.stderr)
        sys.exit(1)
    return url


def migrate() -> None:
    url = _database_url()
    with psycopg.connect(url) as conn:
        conn.execute("CREATE SCHEMA IF NOT EXISTS agent")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS agent.schema_migrations (
                 name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"""
        )
        applied = {
            row[0] for row in conn.execute("SELECT name FROM agent.schema_migrations").fetchall()
        }
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            for stmt in [s.strip() for s in sql.split("--> statement-breakpoint") if s.strip()]:
                conn.execute(stmt)
            conn.execute("INSERT INTO agent.schema_migrations(name) VALUES (%s)", (path.name,))
            print(f"applied: {path.name}")
        conn.commit()


def with_roles() -> None:
    url = _database_url()
    password = os.environ.get("AGENT_DB_PASSWORD")
    if not password:
        print("AGENT_DB_PASSWORD is required for --with-roles", file=sys.stderr)
        sys.exit(1)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("SELECT set_config('agent.db_password', %s, false)", (password,))
        for path in sorted(MIGRATIONS_DIR.glob("0002_*.sql")):
            conn.execute(path.read_text(encoding="utf-8"))
            print(f"applied roles: {path.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-roles", action="store_true")
    args = parser.parse_args()
    migrate()
    if args.with_roles:
        with_roles()
