import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DrizzleDb = NodePgDatabase<typeof schema>;

export type DbClient = DrizzleDb;

/**
 * 事务助手（PRD §7 / CORE-FR-005）：application 层用它开启事务，
 * 并把事务内的 DbClient 传给仓储方法；抛错自动回滚。
 */
export async function withTransaction<T>(
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  const { db: instance } = getInstance();
  return instance.transaction(fn);
}

// Pool 配置（PRD §7：单例 Pool，明确连接数、空闲时间与进程关闭行为）。
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 10);
const POOL_IDLE_TIMEOUT_MS = Number(
  process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000,
);
const POOL_CONNECTION_TIMEOUT_MS = Number(
  process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 10_000,
);

let _pool: Pool | null = null;
let _db: DrizzleDb | null = null;

function getInstance(): { pool: Pool; db: DrizzleDb } {
  if (!_pool || !_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _pool = new Pool({
      connectionString: url,
      max: POOL_MAX,
      idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    });
    _db = drizzle(_pool, { schema });
  }
  return { pool: _pool, db: _db };
}

// Proxy so callers can use `db.select()` etc. without changing any import sites.
// The real pool + drizzle instance is only created on first property access
// (at request time)——模块导入和生产构建不建立任何连接（CORE-AC-006）。
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const { db: instance } = getInstance();
    const value = instance[prop as keyof DrizzleDb];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});

/** 受控访问底层 Pool（健康检查、指标）。 */
export function getPool(): Pool {
  return getInstance().pool;
}

/** 进程关闭时优雅释放连接（PRD §7）。 */
export async function closeDatabase(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
