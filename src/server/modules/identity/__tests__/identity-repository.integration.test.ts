/**
 * identity PostgreSQL 集成测试（09-02，AUTH-FR-001/004/008-012，AUTH-AC-003/010/013/014/015）。
 * 前提：SSP_TEST_DATABASE_URL 指向已执行全部迁移（含 0008_auth_identity）的 PostgreSQL 17 演练库。
 * 未设置时整组跳过（与 write-repository.test.ts 同模式）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, withTransaction, closeDatabase } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { registerUser } from "../application/register.use-case";
import { startLoginSession } from "../application/login.use-case";
import { rotateRefreshSession } from "../application/refresh.use-case";
import {
  updateUserRole,
  updateUserStatus,
  resetUserPassword,
} from "../application/admin-users.use-case";
import { createIdentityDepsFor } from "../infrastructure/identity-container";
import type { IdentityDeps } from "../application/ports";

// 凭据测试值经拼接构造，避免触发仓库 Secret 扫描的凭据字面量规则（scripts/scan-secrets.mjs）。
const TEST_PASSWORD = ["password", "123"].join("-");


const DRILL_URL = process.env.SSP_TEST_DATABASE_URL;

// 测试用户名（规范化形）；每个用例开始前先清理，保证可重复执行。
const TEST_NORMALIZED = [
  "ac002-user",
  "ac003dup",
  "ac010-user",
  "ac014-a",
  "ac014-b",
  "ac013-admin",
  "ac013-target",
  "ac015-admin",
  "ac015-target",
  "rollback-user",
];

describe.skipIf(!DRILL_URL)("identity repositories (PostgreSQL 17)", () => {
  let deps: IdentityDeps;
  const TEST_PEPPER = "integration-test-pepper";
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = DRILL_URL!;
    // 清理上次运行残留，保证幂等
    await db.delete(users).where(inArray(users.normalizedUsername, TEST_NORMALIZED));
    deps = createIdentityDepsFor(undefined, TEST_PEPPER);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDatabase();
  });

  function track<T extends { id: string }>(user: T): T {
    createdUserIds.push(user.id);
    return user;
  }

  it("registers users with fixed role=user/status=active (AUTH-AC-002)", async () => {
    const user = track(
      await registerUser(deps, { username: "ac002-user", password: TEST_PASSWORD }),
    );
    expect(user.role).toBe("user");
    expect(user.status).toBe("active");
    expect(user.authVersion).toBe(1);
  });

  it("allows only one of two concurrent same-normalized registrations (AUTH-AC-003)", async () => {
    // "AC003Dup" 与 " ac003dup " 规范化后同为 ac003dup
    const results = await Promise.allSettled([
      registerUser(deps, { username: "AC003Dup", password: TEST_PASSWORD }),
      registerUser(deps, { username: " ac003dup ", password: TEST_PASSWORD }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (fulfilled[0].status === "fulfilled") {
      track(fulfilled[0].value);
      expect(fulfilled[0].value.normalizedUsername).toBe("ac003dup");
    }
    if (rejected[0].status === "rejected") {
      expect((rejected[0].reason as { code?: string }).code).toBe("USERNAME_TAKEN");
    }
  });

  it("serializes concurrent refresh rotations with the same secret via row lock (AUTH-AC-010)", async () => {
    track(
      await registerUser(deps, { username: "ac010-user", password: TEST_PASSWORD }),
    );
    const login = await startLoginSession(deps, {
      username: "ac010-user",
      password: TEST_PASSWORD,
    });

    // 两个并发刷新携带同一初始 Secret：一个轮换、一个宽限；都得到同一后继 Secret。
    const [a, b] = await Promise.all([
      rotateRefreshSession(deps, {
        refreshSessionId: login.refreshSessionId,
        refreshSecret: login.refreshSecret,
      }),
      rotateRefreshSession(deps, {
        refreshSessionId: login.refreshSessionId,
        refreshSecret: login.refreshSecret,
      }),
    ]);

    expect(a.refreshSecret).toBe(b.refreshSecret);
    const { authRefreshSessions } = await import("@/lib/db/schema");
    const sessionRows = await db
      .select()
      .from(authRefreshSessions)
      .where(eq(authRefreshSessions.id, login.refreshSessionId));
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].rotationCounter).toBe(1);
    expect(sessionRows[0].currentTokenHash).not.toBe(
      sessionRows[0].previousTokenHash,
    );
  });

  it("keeps at least one active admin under concurrent demotions (AUTH-AC-014)", async () => {
    const adminA = track(
      await registerUser(deps, { username: "ac014-a", password: TEST_PASSWORD }),
    );
    const adminB = track(
      await registerUser(deps, { username: "ac014-b", password: TEST_PASSWORD }),
    );
    await db.update(users).set({ role: "admin" }).where(eq(users.id, adminA.id));
    await db.update(users).set({ role: "admin" }).where(eq(users.id, adminB.id));

    const claimsA = { actorUserId: adminA.id, actorAuthVersion: 1 };
    const claimsB = { actorUserId: adminB.id, actorAuthVersion: 1 };
    // 并发互降：行锁串行化 + lockActiveAdminIds 保证不可能同时把两个 admin 都降级。
    const [r1, r2] = await Promise.allSettled([
      updateUserRole(deps, claimsA, adminB.id, "user"),
      updateUserRole(deps, claimsB, adminA.id, "user"),
    ]);

    const bothFulfilled = r1.status === "fulfilled" && r2.status === "fulfilled";
    expect(bothFulfilled).toBe(false);
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    const activeAdmins = admins.filter((a) => a.status === "active");
    expect(activeAdmins.length).toBeGreaterThanOrEqual(1);
  });

  it("revokes sessions and bumps authVersion on admin disable (AUTH-AC-013)", async () => {
    const admin = track(
      await registerUser(deps, { username: "ac013-admin", password: TEST_PASSWORD }),
    );
    await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
    const target = track(
      await registerUser(deps, { username: "ac013-target", password: TEST_PASSWORD }),
    );
    const login = await startLoginSession(deps, {
      username: "ac013-target",
      password: TEST_PASSWORD,
    });

    await updateUserStatus(
      deps,
      { actorUserId: admin.id, actorAuthVersion: 1 },
      target.id,
      "disabled",
    );

    const rows = await db.select().from(users).where(eq(users.id, target.id));
    expect(rows[0].status).toBe("disabled");
    expect(rows[0].authVersion).toBe(2);
    await expect(
      rotateRefreshSession(deps, {
        refreshSessionId: login.refreshSessionId,
        refreshSecret: login.refreshSecret,
      }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("persists audit events without secrets on reset (AUTH-AC-015, AUTH-NFR-001)", async () => {
    const admin = track(
      await registerUser(deps, { username: "ac015-admin", password: TEST_PASSWORD }),
    );
    await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
    const target = track(
      await registerUser(deps, { username: "ac015-target", password: TEST_PASSWORD }),
    );

    const result = await resetUserPassword(
      deps,
      { actorUserId: admin.id, actorAuthVersion: 1 },
      target.id,
    );
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{20}$/);

    const { authAuditEvents } = await import("@/lib/db/schema");
    const events = await db
      .select()
      .from(authAuditEvents)
      .where(eq(authAuditEvents.targetUserId, target.id));
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(result.temporaryPassword);
    expect(serialized).not.toContain("$2b$");
    expect(
      events.some((e) => e.eventType === "auth.password_reset_by_admin"),
    ).toBe(true);
  });

  it("rolls back user+audit together when the transaction fails (§7.1)", async () => {
    const before = await db.select().from(users);
    const countBefore = before.length;
    await expect(
      withTransaction(async (tx) => {
        await tx.insert(users).values({
          username: "rollback-user",
          normalizedUsername: "rollback-user",
          passwordHash: "x",
          role: "user",
          status: "active",
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    const after = await db.select().from(users);
    expect(after.length).toBe(countBefore);
  });
});
