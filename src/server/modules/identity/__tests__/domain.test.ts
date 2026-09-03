/**
 * identity domain 单元测试（09-02，AUTH-FR-001/003/009、§10.1/§10.2、AUTH-AC-010/011）。
 * 纯领域规则，无框架/数据库依赖；时钟与 HMAC 以注入替身驱动（AUTH-NFR-007）。
 */
import { describe, it, expect } from "vitest";
import {
  normalizeUsername,
  validateUsername,
  RESERVED_USERNAMES,
} from "../domain/username";
import { validatePassword } from "../domain/password";
import {
  decideRoleChange,
  decideStatusChange,
  isActiveAdmin,
  isUserRole,
} from "../domain/roles";
import {
  ACCESS_WINDOW_SECONDS,
  REFRESH_GRACE_SECONDS,
  TEMP_PASSWORD_TTL_HOURS,
  decideRefresh,
  deriveNextRefreshSecret,
} from "../domain/refresh-session";
import {
  decideApiAccess,
  decidePageAccess,
  type AuthenticatedActor,
} from "../domain/access";

// ─── 用户名（§10.1）────────────────────────────────────────────────────────

describe("username domain rules (AUTH-FR-001, §10.1)", () => {
  it("normalizes with trim + NFKC + lowercase", () => {
    expect(normalizeUsername("  Jan ")).toBe("jan");
    expect(normalizeUsername("ＪＡＮ")).toBe("jan"); // 全角 → NFKC → 小写
    expect(normalizeUsername("Alice_01")).toBe("alice_01");
  });

  it("keeps the display username as the trimmed NFKC original (case preserved)", () => {
    const result = validateUsername("  Jan ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.username).toBe("Jan");
      expect(result.normalized).toBe("jan");
    }
  });

  it("rejects outside length 3-32 after normalization", () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(33)).ok).toBe(false);
    expect(validateUsername("a".repeat(32)).ok).toBe(true);
    expect(validateUsername("abc").ok).toBe(true);
  });

  it("rejects characters outside ASCII letters/digits/_/-", () => {
    expect(validateUsername("张三").ok).toBe(false);
    expect(validateUsername("a b").ok).toBe(false);
    expect(validateUsername("a.b").ok).toBe(false);
    expect(validateUsername("user-1_ok").ok).toBe(true);
  });

  it("rejects reserved names but the bootstrap admin bypasses them via script", () => {
    for (const reserved of RESERVED_USERNAMES) {
      expect(validateUsername(reserved).ok).toBe(false);
      expect(validateUsername(reserved.toUpperCase()).ok).toBe(false);
    }
  });

  it("rejects empty and non-string-safe input", () => {
    expect(validateUsername("   ").ok).toBe(false);
    expect(validateUsername("").ok).toBe(false);
  });
});

// ─── 密码（§10.2）──────────────────────────────────────────────────────────

describe("password domain rules (§10.2, 2026-09-03 修订)", () => {
  it("accepts 8-72 UTF-8 bytes containing at least one letter and one digit", () => {
    expect(validatePassword("abc1234").ok).toBe(false); // 7 bytes
    expect(validatePassword("abcd1234").ok).toBe(true); // 8 bytes, 字母+数字
    expect(validatePassword("a".repeat(71) + "1").ok).toBe(true); // 72 bytes
  });

  it("requires letters and digits (weak composition rejected)", () => {
    const noDigit = validatePassword("abcdefgh");
    const noLetter = validatePassword("12345678");
    expect(noDigit.ok).toBe(false); // 无数字
    if (!noDigit.ok) expect(noDigit.reason).toBe("weak_composition");
    expect(noLetter.ok).toBe(false); // 无字母
    if (!noLetter.ok) expect(noLetter.reason).toBe("weak_composition");
  });

  it("rejects over-72-byte passwords without truncation", () => {
    const result = validatePassword("a".repeat(72) + "1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_long");
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 3 汉字 ×3 字节 + 2 ASCII = 11 字节，含字母与数字 → 合法
    expect(validatePassword("一二三a1").ok).toBe(true);
    // 2 汉字 ×3 字节 + 2 ASCII = 8 字节 → 合法
    expect(validatePassword("一二a1").ok).toBe(true);
    // 7 字节 → 不合法
    expect(validatePassword("一二a").ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(validatePassword("").ok).toBe(false);
  });
});

// ─── 固定双角色（AUTH-FR-003/009）───────────────────────────────────────────

describe("fixed dual roles (AUTH-FR-003/009)", () => {
  it("only accepts user/admin", () => {
    expect(isUserRole("user")).toBe(true);
    expect(isUserRole("admin")).toBe(true);
    expect(isUserRole("root")).toBe(false);
    expect(isUserRole("owner")).toBe(false);
    expect(isUserRole("")).toBe(false);
  });

  it("identifies active admins", () => {
    expect(isActiveAdmin({ role: "admin", status: "active" })).toBe(true);
    expect(isActiveAdmin({ role: "admin", status: "disabled" })).toBe(false);
    expect(isActiveAdmin({ role: "user", status: "active" })).toBe(false);
  });

  it("rejects demoting the last active admin (AUTH-AC-014)", () => {
    const target = { role: "admin", status: "active" } as const;
    expect(decideRoleChange(target, "user", ["u-1"])).toEqual({
      ok: false,
      code: "LAST_ADMIN_REQUIRED",
    });
    expect(decideRoleChange(target, "user", ["u-1", "u-2"])).toEqual({
      ok: true,
    });
    // 非管理员目标降级不受最后管理员约束
    expect(decideRoleChange({ role: "user", status: "active" }, "admin", [])).toEqual({ ok: true });
  });

  it("rejects disabling the last active admin (AUTH-AC-014)", () => {
    const target = { role: "admin", status: "active" } as const;
    expect(decideStatusChange(target, "disabled", ["u-1"])).toEqual({
      ok: false,
      code: "LAST_ADMIN_REQUIRED",
    });
    expect(decideStatusChange(target, "active", ["u-1"])).toEqual({ ok: true });
    expect(decideStatusChange(target, "disabled", ["u-1", "u-2"])).toEqual({
      ok: true,
    });
  });
});

// ─── 刷新会话领域规则（AUTH-FR-004，§7.3）────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-09-02T00:00:00.000Z");
  return {
    now,
    session: {
      id: "s-1",
      currentTokenHash: "hash-current",
      previousTokenHash: null as string | null,
      previousValidUntil: null as Date | null,
      rotationCounter: 0,
      authVersion: 1,
      idleExpiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
      absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
      revokedAt: null as Date | null,
      ...overrides,
    },
    user: { status: "active" as "active" | "disabled", authVersion: 1 },
  };
}

describe("refresh session decisions (AUTH-FR-004, §7.3)", () => {
  it("exposes PRD timing constants", () => {
    expect(ACCESS_WINDOW_SECONDS).toBe(900);
    expect(REFRESH_GRACE_SECONDS).toBe(30);
    expect(TEMP_PASSWORD_TTL_HOURS).toBe(24);
  });

  it("derives the next secret via HMAC with the fixed formula", () => {
    const calls: Array<[string, string]> = [];
    const hmac = (key: string, message: string) => {
      calls.push([key, message]);
      return `derived(${key}/${message})`;
    };
    const secret = deriveNextRefreshSecret(hmac, "pepper", "S0", "s-1", 1);
    expect(secret).toBe("derived(pepper/S0.s-1.1)");
    expect(calls[0][0]).toBe("pepper");
  });

  it("rotates when the presented hash matches the current hash", () => {
    const input = makeSession();
    const decision = decideRefresh({ ...input, presentedHash: "hash-current" });
    expect(decision).toEqual({ kind: "rotate", targetCounter: 1 });
  });

  it("allows the previous secret within the 30s grace without re-incrementing", () => {
    const input = makeSession({
      currentTokenHash: "hash-1",
      previousTokenHash: "hash-0",
      previousValidUntil: new Date(input0Time()),
      rotationCounter: 1,
    });
    const decision = decideRefresh({ ...input, presentedHash: "hash-0" });
    expect(decision).toEqual({ kind: "grace" });
  });

  it("treats the previous secret after grace as reuse and revokes (AUTH-AC-011)", () => {
    const now = new Date("2026-09-02T00:00:00.000Z");
    const input = makeSession({
      currentTokenHash: "hash-1",
      previousTokenHash: "hash-0",
      previousValidUntil: new Date(now.getTime() - 1),
      rotationCounter: 1,
    });
    const decision = decideRefresh({ ...input, presentedHash: "hash-0" });
    expect(decision).toEqual({ kind: "reject", reason: "reuse_detected" });
  });

  it("rejects unknown secrets as reuse (§7.3)", () => {
    const input = makeSession();
    const decision = decideRefresh({ ...input, presentedHash: "hash-attacker" });
    expect(decision).toEqual({ kind: "reject", reason: "reuse_detected" });
  });

  it("rejects revoked sessions", () => {
    const input = makeSession({ revokedAt: new Date("2026-09-01T00:00:00Z") });
    expect(decideRefresh({ ...input, presentedHash: "hash-current" })).toEqual({
      kind: "reject",
      reason: "revoked",
    });
  });

  it("rejects idle-expired and absolute-expired sessions (AUTH-AC-012)", () => {
    const now = new Date("2026-09-02T00:00:00.000Z");
    const idle = makeSession({ idleExpiresAt: new Date(now.getTime() - 1) });
    expect(decideRefresh({ ...idle, presentedHash: "hash-current" })).toEqual({
      kind: "reject",
      reason: "expired_idle",
    });
    const absolute = makeSession({
      absoluteExpiresAt: new Date(now.getTime() - 1),
    });
    expect(
      decideRefresh({ ...absolute, presentedHash: "hash-current" }),
    ).toEqual({ kind: "reject", reason: "expired_absolute" });
  });

  it("rejects when auth version or user status changed", () => {
    const versionInput = makeSession();
    versionInput.user.authVersion = 2;
    expect(
      decideRefresh({ ...versionInput, presentedHash: "hash-current" }),
    ).toEqual({ kind: "reject", reason: "auth_version_mismatch" });

    const disabledInput = makeSession();
    disabledInput.user.status = "disabled";
    expect(
      decideRefresh({ ...disabledInput, presentedHash: "hash-current" }),
    ).toEqual({ kind: "reject", reason: "user_disabled" });
  });
});

function input0Time(): number {
  return new Date("2026-09-02T00:00:10.000Z").getTime();
}

// ─── 路由门禁（AUTH-FR-003/006，权限矩阵 §7.4）───────────────────────────────

const userActor: AuthenticatedActor = {
  userId: "u1",
  username: "alice",
  role: "user",
  authVersion: 1,
  mustChangePassword: false,
};
const adminActor: AuthenticatedActor = { ...userActor, userId: "a1", role: "admin" };
const restrictedActor: AuthenticatedActor = { ...userActor, mustChangePassword: true };

describe("page access gate (AUTH-AC-001/004/005, §7.4)", () => {
  it("redirects anonymous /chat to /login with callback (AUTH-AC-001)", () => {
    expect(decidePageAccess(null, "/chat")).toEqual({
      effect: "redirect",
      location: "/login?callbackUrl=%2Fchat",
    });
  });

  it("redirects anonymous /admin pages to /login", () => {
    expect(decidePageAccess(null, "/admin/users")).toEqual({
      effect: "redirect",
      location: "/login?callbackUrl=%2Fadmin%2Fusers",
    });
  });

  it("sends users with an /admin callback away from the console (AUTH-AC-005)", () => {
    expect(decidePageAccess(userActor, "/admin/users")).toEqual({
      effect: "redirect",
      location: "/chat?error=forbidden",
    });
    expect(decidePageAccess(adminActor, "/admin/users")).toEqual({
      effect: "allow",
    });
  });

  it("forces mustChangePassword sessions into /account/security", () => {
    expect(decidePageAccess(restrictedActor, "/chat")).toEqual({
      effect: "redirect",
      location: "/account/security",
    });
    expect(decidePageAccess(restrictedActor, "/account/security")).toEqual({
      effect: "allow",
    });
  });

  it("keeps /account/security open for normal authenticated users", () => {
    expect(decidePageAccess(userActor, "/account/security")).toEqual({
      effect: "allow",
    });
  });
});

describe("api access gate (AUTH-AC-001/016, §7.4)", () => {
  it("rejects anonymous planning/chat/conversation APIs with 401", () => {
    for (const path of [
      "/api/plan/compute",
      "/api/plan/p1",
      "/api/chat",
      "/api/chat/c1",
      "/api/conversations",
      "/api/conversations/c1",
    ]) {
      expect(decideApiAccess(null, path)).toEqual({
        effect: "deny",
        status: 401,
        code: "AUTH_REQUIRED",
      });
    }
  });

  it("rejects anonymous admin APIs with 401 and user role with 403", () => {
    expect(decideApiAccess(null, "/api/admin/users")).toEqual({
      effect: "deny",
      status: 401,
      code: "AUTH_REQUIRED",
    });
    expect(decideApiAccess(userActor, "/api/admin/users")).toEqual({
      effect: "deny",
      status: 403,
      code: "FORBIDDEN",
    });
    expect(decideApiAccess(adminActor, "/api/admin/users")).toEqual({
      effect: "allow",
    });
  });

  it("blocks mustChangePassword sessions from non-security APIs (AUTH-AC-016)", () => {
    expect(
      decideApiAccess(restrictedActor, "/api/account/change-password"),
    ).toEqual({ effect: "allow" });
    expect(decideApiAccess(restrictedActor, "/api/chat")).toEqual({
      effect: "deny",
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    expect(decideApiAccess(restrictedActor, "/api/admin/users")).toEqual({
      effect: "deny",
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  });

  it("requires auth for logout but allows register/login endpoints", () => {
    expect(decideApiAccess(null, "/api/auth/logout")).toEqual({
      effect: "deny",
      status: 401,
      code: "AUTH_REQUIRED",
    });
    expect(decideApiAccess(null, "/api/auth/register")).toEqual({
      effect: "allow",
    });
  });
});
