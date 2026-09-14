/**
 * identity 用户仓储的 Drizzle 实现（09-02 §8.1）。
 * passwordHash 仅供应用层比较，任何查询出口都不得将其映射到 API 响应。
 */
import { and, asc, eq, ilike, sql } from "drizzle-orm";

import { db, type DbClient } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type {
  UserListQuery,
  UserPatch,
  UserRepository,
  UserRecord,
} from "../../application/ports";

type UserRow = typeof users.$inferSelect;

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalizedUsername,
    passwordHash: row.passwordHash,
    role: row.role as UserRecord["role"],
    status: row.status as UserRecord["status"],
    authVersion: row.authVersion,
    mustChangePassword: row.mustChangePassword,
    temporaryPasswordExpiresAt: row.temporaryPasswordExpiresAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPatchValues(patch: UserPatch): Partial<typeof users.$inferInsert> {
  const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.passwordHash !== undefined) values.passwordHash = patch.passwordHash;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.authVersion !== undefined) values.authVersion = patch.authVersion;
  if (patch.mustChangePassword !== undefined) {
    values.mustChangePassword = patch.mustChangePassword;
  }
  if (patch.temporaryPasswordExpiresAt !== undefined) {
    values.temporaryPasswordExpiresAt = patch.temporaryPasswordExpiresAt;
  }
  if (patch.lastLoginAt !== undefined) values.lastLoginAt = patch.lastLoginAt;
  return values;
}

/** 传入 executor 以支持事务绑定；默认使用进程级 db 单例。 */
export function createDrizzleUserRepository(executor: DbClient = db): UserRepository {
  const client = () => executor;
  return {
    async findByNormalizedUsername(normalized) {
      const rows = await client()
        .select()
        .from(users)
        .where(eq(users.normalizedUsername, normalized))
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async findById(id) {
      const rows = await client().select().from(users).where(eq(users.id, id)).limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async lockById(id) {
      const rows = await client()
        .select()
        .from(users)
        .where(eq(users.id, id))
        .for("update")
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async createUser(data) {
      const rows = await client()
        .insert(users)
        .values({
          username: data.username,
          normalizedUsername: data.normalizedUsername,
          passwordHash: data.passwordHash,
          role: data.role,
          status: data.status,
        })
        .returning();
      return toRecord(rows[0]);
    },

    async update(id, patch) {
      const rows = await client()
        .update(users)
        .set(toPatchValues(patch))
        .where(eq(users.id, id))
        .returning();
      return toRecord(rows[0]);
    },

    async listUsers(query: UserListQuery) {
      const conditions = [];
      if (query.qNormalized) {
        conditions.push(ilike(users.normalizedUsername, `%${escapeLike(query.qNormalized)}%`));
      }
      if (query.role) conditions.push(eq(users.role, query.role));
      if (query.status) conditions.push(eq(users.status, query.status));

      const orderBy = [asc(users.createdAt), asc(users.id)];
      if (query.cursorCreatedAt && query.cursorId) {
        // (created_at, id) 游标：严格大于（§9.3）
        conditions.push(
          sql`(${users.createdAt}, ${users.id}) > (${query.cursorCreatedAt.toISOString()}::timestamptz, ${query.cursorId}::uuid)`,
        );
      }

      const rows = await client()
        .select()
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(...orderBy)
        .limit(query.limit + 1);

      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      const last = page[page.length - 1];
      return {
        items: page.map(toRecord),
        nextCursor:
          hasMore && last
            ? `${last.createdAt.toISOString()}|${last.id}`
            : null,
      };
    },

    async lockActiveAdminIds() {
      const rows = await client()
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.status, "active")))
        .for("update");
      return rows.map((r) => r.id);
    },
  };
}

/** ilike 模式转义：q 只做规范化用户名包含匹配，不扩展到其他字段（§9.3）。 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
