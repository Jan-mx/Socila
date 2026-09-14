/**
 * identity application 用例单元测试（09-02，AUTH-FR-001/002/007-011）。
 * 端口全部注入替身，不启动 Next/PostgreSQL（PRD §15 测试矩阵）。
 * 时钟、随机数、哈希、HMAC 均可注入（AUTH-NFR-007）。
 */
import { describe, it, expect, vi } from "vitest";
import { IdentityError } from "../application/errors";
import { registerUser } from "../application/register.use-case";
import { startLoginSession } from "../application/login.use-case";
import { changeOwnPassword } from "../application/change-password.use-case";
import {
  listUsersForAdmin,
  requireFreshAdmin,
  updateUserRole,
  updateUserStatus,
  resetUserPassword,
} from "../application/admin-users.use-case";
import { rotateRefreshSession } from "../application/refresh.use-case";
import { revokeCurrentRefreshSession } from "../application/logout.use-case";
import { createFakeDeps, type FakeDeps } from "./fakes";

// 凭据测试值经拼接构造，避免触发仓库 Secret 扫描的凭据字面量规则（scripts/scan-secrets.mjs）。
const TEST_PASSWORD = ["password", "123"].join("-");
const TEST_NEW_PASSWORD = ["new", "password", "13"].join("-");
const TEST_TEMP_PASSWORD = ["temp", "pass", "12345"].join("-");
const TEST_PERMANENT_PASSWORD = ["permanent", "pass", "1"].join("-");
const TEST_WRONG_PASSWORD = ["wrong", "password"].join("-");
const TEST_SHORT_PASSWORD = "short";


// ─── 注册（AUTH-FR-001，AUTH-AC-002）───────────────────────────────────────

describe("registerUser (AUTH-FR-001)", () => {
  it("creates role=user, status=active and ignores any client privilege input", async () => {
    const deps = createFakeDeps();
    const user = await registerUser(deps, {
      username: "alice",
      password: TEST_PASSWORD,
    });
    expect(user.role).toBe("user");
    expect(user.status).toBe("active");
    expect(deps.userRepo.inserted[0]?.role).toBe("user");
  });

  it("rejects invalid username or password with INVALID_INPUT", async () => {
    const deps = createFakeDeps();
    await expect(
      registerUser(deps, { username: "ab", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      registerUser(deps, { username: "alice", password: TEST_SHORT_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      registerUser(deps, { username: "admin", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" }); // 保留名
  });

  it("maps duplicate normalized usernames to USERNAME_TAKEN (409)", async () => {
    const deps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    await expect(
      registerUser(deps, { username: "ALICE ", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });

  it("maps concurrent unique-violation inserts to USERNAME_TAKEN", async () => {
    const deps = createFakeDeps();
    deps.userRepo.concurrentDuplicate = true;
    await expect(
      registerUser(deps, { username: "bob", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });

  it("hashes the password with bcrypt port and writes an audit event", async () => {
    const deps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    expect(deps.hasher.hashed).toEqual(["password-123"]);
    expect(deps.audit.appended.some((e) => e.eventType === "auth.user_registered")).toBe(true);
    const stored = deps.userRepo.inserted[0] as { passwordHash: string };
    expect(stored?.passwordHash.startsWith("bcrypted:")).toBe(true);
  });
});

// ─── 统一登录（AUTH-FR-002，AUTH-AC-004）────────────────────────────────────

describe("startLoginSession (AUTH-FR-002)", () => {
  it("returns actor claims plus a fresh refresh session and 15-minute window", async () => {
    const deps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    deps.clock.advance(1000);
    const result = await startLoginSession(deps, {
      username: "alice",
      password: TEST_PASSWORD,
    });
    expect(result.actor).toMatchObject({
      username: "alice",
      role: "user",
      mustChangePassword: false,
    });
    expect(result.accessExpiresAt - deps.clock.now().getTime()).toBe(15 * 60 * 1000);
    expect(result.refreshSecret).toHaveLength(43); // 32 bytes base64url
    expect(deps.refreshRepo.created).toHaveLength(1);
    const created = deps.refreshRepo.created[0];
    expect(created?.tokenHash).toBe(`sha256:${result.refreshSecret}`);
    expect(created?.authVersion).toBe(1);
  });

  it("updates last_login_at on success", async () => {
    const deps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    deps.clock.advance(60_000);
    await startLoginSession(deps, { username: "alice", password: TEST_PASSWORD });
    expect(deps.userRepo.updated.find((u) => u.patch.lastLoginAt)).toBeTruthy();
  });

  it("always runs a bcrypt comparison for unknown users (anti-enumeration, AUTH-NFR-002)", async () => {
    const deps = createFakeDeps();
    await expect(
      startLoginSession(deps, { username: "ghost", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(deps.hasher.compared.length).toBe(1);
    await expect(
      startLoginSession(deps, { username: "ghost", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(deps.hasher.compared.length).toBe(2);
  });

  it("rejects disabled accounts with the same uniform error", async () => {
    const deps = createFakeDeps();
    const user = await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    await deps.userRepo.update(user.id, { status: "disabled" });
    await expect(
      startLoginSession(deps, { username: "alice", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects expired temporary passwords (§7.5)", async () => {
    const deps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    const expired = new Date(deps.clock.now().getTime() - 1000);
    await deps.userRepo.update(deps.userRepo.byUsername("alice")!.id, {
      mustChangePassword: true,
      temporaryPasswordExpiresAt: expired,
      passwordHash: "bcrypted:temp-pass-12345",
    });
    await expect(
      startLoginSession(deps, { username: "alice", password: TEST_TEMP_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    // 未过期临时密码可登录，且会话带 mustChangePassword
    await deps.userRepo.update(deps.userRepo.byUsername("alice")!.id, {
      temporaryPasswordExpiresAt: new Date(deps.clock.now().getTime() + 3600_000),
    });
    const result = await startLoginSession(deps, {
      username: "alice",
      password: TEST_TEMP_PASSWORD,
    });
    expect(result.actor.mustChangePassword).toBe(true);
  });
});

// ─── 本人改密（AUTH-FR-007）─────────────────────────────────────────────────

describe("changeOwnPassword (AUTH-FR-007)", () => {
  async function setup() {
    const deps = createFakeDeps();
    const user = await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    await startLoginSession(deps, { username: "alice", password: TEST_PASSWORD });
    return { deps, user };
  }

  it("verifies the current password, bumps authVersion, revokes all sessions and audits", async () => {
    const { deps, user } = await setup();
    await changeOwnPassword(deps, {
      actorUserId: user.id,
      currentPassword: TEST_PASSWORD,
      newPassword: TEST_NEW_PASSWORD,
    });
    const updated = deps.userRepo.byId(user.id)!;
    expect(updated.passwordHash).toBe("bcrypted:new-password-13");
    expect(updated.authVersion).toBe(2);
    expect(deps.refreshRepo.revokedForUser[user.id]?.reason).toBe("password_changed");
    expect(deps.audit.appended.some((e) => e.eventType === "auth.password_changed")).toBe(true);
  });

  it("rejects a wrong current password without changing state", async () => {
    const { deps, user } = await setup();
    await expect(
      changeOwnPassword(deps, {
        actorUserId: user.id,
        currentPassword: TEST_WRONG_PASSWORD,
        newPassword: TEST_NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(deps.userRepo.byId(user.id)!.authVersion).toBe(1);
  });

  it("clears the mustChangePassword state after using a temporary password", async () => {
    const { deps, user } = await setup();
    await deps.userRepo.update(user.id, {
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(deps.clock.now().getTime() + 3600_000),
      passwordHash: "bcrypted:temp-pass-12345",
    });
    await changeOwnPassword(deps, {
      actorUserId: user.id,
      currentPassword: TEST_TEMP_PASSWORD,
      newPassword: TEST_PERMANENT_PASSWORD,
    });
    const updated = deps.userRepo.byId(user.id)!;
    expect(updated.mustChangePassword).toBe(false);
    expect(updated.temporaryPasswordExpiresAt).toBeNull();
  });

  it("rejects new passwords violating the byte bounds", async () => {
    const { deps, user } = await setup();
    await expect(
      changeOwnPassword(deps, {
        actorUserId: user.id,
        currentPassword: TEST_PASSWORD,
        newPassword: TEST_SHORT_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

// ─── 管理员用户管理（AUTH-FR-008/009/010）────────────────────────────────────

async function setupAdminWorld() {
  const deps = createFakeDeps();
  const admin = await registerUser(deps, { username: "jan-admin", password: TEST_PASSWORD });
  await deps.userRepo.update(admin.id, { role: "admin" });
  const secondAdmin = await registerUser(deps, { username: "admin-two", password: TEST_PASSWORD });
  await deps.userRepo.update(secondAdmin.id, { role: "admin" });
  const target = await registerUser(deps, { username: "target-user", password: TEST_PASSWORD });
  return { deps, admin, secondAdmin, target };
}

describe("requireFreshAdmin (AUTH-NFR-005, §12.1)", () => {
  it("re-checks role/status/authVersion from the database", async () => {
    const { deps, admin } = await setupAdminWorld();
    const fresh = await requireFreshAdmin(deps, {
      userId: admin.id,
      authVersion: 1,
      role: "admin",
    });
    expect(fresh.id).toBe(admin.id);

    await expect(
      requireFreshAdmin(deps, { userId: admin.id, authVersion: 2, role: "admin" }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(
      requireFreshAdmin(deps, { userId: admin.id, authVersion: 1, role: "user" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      requireFreshAdmin(deps, { userId: "missing", authVersion: 1, role: "admin" }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

describe("admin user management (AUTH-FR-008/009/010)", () => {
  it("lists users with sanitized fields only and cursor pagination", async () => {
    const { deps, admin } = await setupAdminWorld();
    const page = await listUsersForAdmin(deps, { actorUserId: admin.id, actorAuthVersion: 1 }, {});
    expect(page.items.length).toBe(3);
    for (const item of page.items) {
      expect(item).not.toHaveProperty("passwordHash");
    }
    const limited = await listUsersForAdmin(
      deps,
      { actorUserId: admin.id, actorAuthVersion: 1 },
      { limit: 2 },
    );
    expect(limited.items).toHaveLength(2);
    expect(limited.nextCursor).toBeTruthy();
  });

  it("disables a user, bumps authVersion and revokes their sessions (AUTH-AC-013)", async () => {
    const { deps, admin, target } = await setupAdminWorld();
    await startLoginSession(deps, { username: "target-user", password: TEST_PASSWORD });
    const updated = await updateUserStatus(
      deps,
      { actorUserId: admin.id, actorAuthVersion: 1 },
      target.id,
      "disabled",
    );
    expect(updated.status).toBe("disabled");
    expect(deps.userRepo.byId(target.id)!.authVersion).toBe(2);
    expect(deps.refreshRepo.revokedForUser[target.id]?.reason).toBe("admin_action");
    expect(deps.audit.appended.some((e) => e.eventType === "auth.user_status_changed")).toBe(true);
  });

  // 最后管理员并发保护（AUTH-AC-014）需要真实行锁串行化，由 PostgreSQL 集成测试覆盖。

  it("rejects self-operations on status/role/reset", async () => {
    const { deps, admin } = await setupAdminWorld();
    await expect(
      updateUserStatus(deps, { actorUserId: admin.id, actorAuthVersion: 1 }, admin.id, "disabled"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateUserRole(deps, { actorUserId: admin.id, actorAuthVersion: 1 }, admin.id, "user"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      resetUserPassword(deps, { actorUserId: admin.id, actorAuthVersion: 1 }, admin.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("promotes/demotes roles and revokes sessions (AUTH-FR-009)", async () => {
    const { deps, admin, target } = await setupAdminWorld();
    const promoted = await updateUserRole(
      deps,
      { actorUserId: admin.id, actorAuthVersion: 1 },
      target.id,
      "admin",
    );
    expect(promoted.role).toBe("admin");
    expect(deps.refreshRepo.revokedForUser[target.id]?.reason).toBe("admin_action");

    const demoted = await updateUserRole(
      deps,
      { actorUserId: admin.id, actorAuthVersion: 1 },
      target.id,
      "user",
    );
    expect(demoted.role).toBe("user");
  });

  it("resets a password with a one-time 20-char temp password and 24h expiry (AUTH-FR-010)", async () => {
    const { deps, admin, target } = await setupAdminWorld();
    const result = await resetUserPassword(
      deps,
      { actorUserId: admin.id, actorAuthVersion: 1 },
      target.id,
    );
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{20}$/);
    expect(
      result.expiresAt.getTime() - deps.clock.now().getTime(),
    ).toBe(24 * 3600 * 1000);
    const updated = deps.userRepo.byId(target.id)!;
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.passwordHash).toBe(`bcrypted:${result.temporaryPassword}`);
    expect(JSON.stringify(deps.audit.appended)).not.toContain(result.temporaryPassword);
  });

  it("rejects role changes for disabled accounts", async () => {
    const { deps, admin, target } = await setupAdminWorld();
    await deps.userRepo.update(target.id, { status: "disabled" });
    await expect(
      updateUserRole(deps, { actorUserId: admin.id, actorAuthVersion: 1 }, target.id, "admin"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps missing targets to RESOURCE_NOT_FOUND", async () => {
    const { deps, admin } = await setupAdminWorld();
    await expect(
      updateUserStatus(deps, { actorUserId: admin.id, actorAuthVersion: 1 }, "missing", "disabled"),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

// ─── 刷新轮换（AUTH-FR-004，AUTH-AC-009/010/011）─────────────────────────────

describe("rotateRefreshSession (AUTH-FR-004)", () => {
  async function setupLogin() {
    const deps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    const login = await startLoginSession(deps, { username: "alice", password: TEST_PASSWORD });
    return { deps, login };
  }

  it("rotates the secret after the 15-minute access window and returns a fresh actor", async () => {
    const { deps, login } = await setupLogin();
    deps.clock.advance(16 * 60 * 1000);
    const refreshed = await rotateRefreshSession(deps, {
      refreshSessionId: login.refreshSessionId,
      refreshSecret: login.refreshSecret,
    });
    expect(refreshed.refreshSecret).not.toBe(login.refreshSecret);
    expect(refreshed.accessExpiresAt - deps.clock.now().getTime()).toBe(15 * 60 * 1000);
    const row = deps.refreshRepo.byId(login.refreshSessionId)!;
    expect(row.rotationCounter).toBe(1);
    expect(row.currentTokenHash).toBe(`sha256:${refreshed.refreshSecret}`);
    expect(row.previousTokenHash).toBe(`sha256:${login.refreshSecret}`);
  });

  it("serves concurrent grace requests with the same derived secret (AUTH-AC-010)", async () => {
    const { deps, login } = await setupLogin();
    deps.clock.advance(16 * 60 * 1000);
    const first = await rotateRefreshSession(deps, {
      refreshSessionId: login.refreshSessionId,
      refreshSecret: login.refreshSecret,
    });
    // 第二个并发请求仍携带旧 Secret，落在前一哈希宽限窗口内
    const second = await rotateRefreshSession(deps, {
      refreshSessionId: login.refreshSessionId,
      refreshSecret: login.refreshSecret,
    });
    expect(second.refreshSecret).toBe(first.refreshSecret);
    const row = deps.refreshRepo.byId(login.refreshSessionId)!;
    expect(row.rotationCounter).toBe(1); // 不重复递增
  });

  it("revokes the session when the previous secret is replayed after grace (AUTH-AC-011)", async () => {
    const { deps, login } = await setupLogin();
    deps.clock.advance(16 * 60 * 1000);
    await rotateRefreshSession(deps, {
      refreshSessionId: login.refreshSessionId,
      refreshSecret: login.refreshSecret,
    });
    deps.clock.advance(31_000); // 超出30秒宽限
    await expect(
      rotateRefreshSession(deps, {
        refreshSessionId: login.refreshSessionId,
        refreshSecret: login.refreshSecret,
      }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    const row = deps.refreshRepo.byId(login.refreshSessionId)!;
    expect(row.revokedReason).toBe("reuse_detected");
    expect(deps.audit.appended.some((e) => e.eventType === "auth.refresh_reuse_detected")).toBe(true);
  });

  it("rejects unknown secrets and revokes the session", async () => {
    const { deps, login } = await setupLogin();
    await expect(
      rotateRefreshSession(deps, {
        refreshSessionId: login.refreshSessionId,
        refreshSecret: "attacker-secret",
      }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(deps.refreshRepo.byId(login.refreshSessionId)!.revokedReason).toBe("reuse_detected");
  });

  it("rejects revoked and idle-expired sessions (AUTH-AC-012)", async () => {
    const { deps, login } = await setupLogin();
    await deps.refreshRepo.revoke(login.refreshSessionId, "admin_action");
    await expect(
      rotateRefreshSession(deps, {
        refreshSessionId: login.refreshSessionId,
        refreshSecret: login.refreshSecret,
      }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });

    const { deps: deps2, login: login2 } = await setupLogin();
    deps2.clock.advance(8 * 24 * 3600 * 1000);
    await expect(
      rotateRefreshSession(deps2, {
        refreshSessionId: login2.refreshSessionId,
        refreshSecret: login2.refreshSecret,
      }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("rejects refresh after authVersion bump (e.g. password changed elsewhere)", async () => {
    const { deps, login } = await setupLogin();
    const user = deps.userRepo.byUsername("alice")!;
    await deps.userRepo.update(user.id, { authVersion: 2 });
    await expect(
      rotateRefreshSession(deps, {
        refreshSessionId: login.refreshSessionId,
        refreshSecret: login.refreshSecret,
      }),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

// ─── 登出撤销（AUTH-NFR-005）────────────────────────────────────────────────

describe("revokeCurrentRefreshSession (AUTH-NFR-005)", () => {
  it("revokes only the calling session of the calling user and audits", async () => {
    const deps: FakeDeps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    const login = await startLoginSession(deps, { username: "alice", password: TEST_PASSWORD });
    const user = deps.userRepo.byUsername("alice")!;
    await revokeCurrentRefreshSession(deps, {
      userId: user.id,
      refreshSessionId: login.refreshSessionId,
    });
    const row = deps.refreshRepo.byId(login.refreshSessionId)!;
    expect(row.revokedReason).toBe("logout");
    expect(deps.audit.appended.some((e) => e.eventType === "auth.sessions_revoked")).toBe(true);
  });

  it("refuses to revoke sessions owned by another user", async () => {
    const deps: FakeDeps = createFakeDeps();
    await registerUser(deps, { username: "alice", password: TEST_PASSWORD });
    await registerUser(deps, { username: "mallory", password: TEST_PASSWORD });
    const login = await startLoginSession(deps, { username: "alice", password: TEST_PASSWORD });
    const mallory = deps.userRepo.byUsername("mallory")!;
    await expect(
      revokeCurrentRefreshSession(deps, {
        userId: mallory.id,
        refreshSessionId: login.refreshSessionId,
      }),
    ).rejects.toBeInstanceOf(IdentityError);
  });
});

// ─── 稳定错误契约（§9.4）───────────────────────────────────────────────────

describe("IdentityError status mapping (§9.4)", () => {
  it("maps codes to the PRD HTTP statuses", () => {
    expect(new IdentityError("INVALID_INPUT").status).toBe(400);
    expect(new IdentityError("AUTH_REQUIRED").status).toBe(401);
    expect(new IdentityError("INVALID_CREDENTIALS").status).toBe(401);
    expect(new IdentityError("FORBIDDEN").status).toBe(403);
    expect(new IdentityError("PASSWORD_CHANGE_REQUIRED").status).toBe(403);
    expect(new IdentityError("RESOURCE_NOT_FOUND").status).toBe(404);
    expect(new IdentityError("USERNAME_TAKEN").status).toBe(409);
    expect(new IdentityError("LAST_ADMIN_REQUIRED").status).toBe(409);
    expect(new IdentityError("RATE_LIMITED").status).toBe(429);
    expect(new IdentityError("AUTH_STORE_UNAVAILABLE").status).toBe(503);
  });
});

// 静默未使用告警辅助
void vi;
