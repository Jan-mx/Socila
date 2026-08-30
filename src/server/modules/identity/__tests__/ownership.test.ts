/**
 * user/admin 权限矩阵（CORE-FR-009 / CORE-AC-002）。
 * 纯单元测试：不启动 Next、不连数据库。
 *
 * 语义：认证用户（user）与匿名会话（session）只能触达自己的资源；
 * 管理员（admin）角色属于运营后台授权，不隐式获得他人用户资源。
 */
import { describe, it, expect } from "vitest";
import {
  decideOwnership,
  resolveOwnerKey,
  type OwnerKey,
} from "../domain/owner";

const USER_A: OwnerKey = { kind: "user", id: "user-A" };
const USER_B: OwnerKey = { kind: "user", id: "user-B" };
const SESSION_A: OwnerKey = { kind: "session", id: "sess-A" };
const SESSION_B: OwnerKey = { kind: "session", id: "sess-B" };

describe("resolveOwnerKey", () => {
  it("authenticated user takes precedence over anonymous session", () => {
    expect(resolveOwnerKey({ userId: "u1", sessionId: "s1" })).toEqual({
      kind: "user",
      id: "u1",
    });
    expect(resolveOwnerKey({ sessionId: "s1" })).toEqual({
      kind: "session",
      id: "s1",
    });
    expect(resolveOwnerKey({})).toBeNull();
  });
});

describe("ownership matrix (user)", () => {
  const planA = { ownerUserId: "user-A", sessionId: null };

  it("grants the owner", () => {
    expect(decideOwnership(planA, USER_A)).toEqual({ decision: "granted" });
  });

  it("denies another user and another session (CORE-AC-002)", () => {
    expect(decideOwnership(planA, USER_B)).toEqual({ decision: "forbidden" });
    expect(decideOwnership(planA, SESSION_A)).toEqual({ decision: "forbidden" });
    expect(decideOwnership(planA, null)).toEqual({ decision: "forbidden" });
  });

  it("session-owned resource grants only that session", () => {
    const convA = { ownerUserId: null, sessionId: "sess-A" };
    expect(decideOwnership(convA, SESSION_A)).toEqual({ decision: "granted" });
    expect(decideOwnership(convA, SESSION_B)).toEqual({ decision: "forbidden" });
    expect(decideOwnership(convA, USER_A)).toEqual({ decision: "forbidden" });
  });

  it("user binding takes precedence over legacy session binding", () => {
    const migrated = { ownerUserId: "user-A", sessionId: "sess-A" };
    // 旧会话cookie不再能访问已绑定用户的资源。
    expect(decideOwnership(migrated, SESSION_A)).toEqual({
      decision: "forbidden",
    });
    expect(decideOwnership(migrated, USER_A)).toEqual({ decision: "granted" });
  });
});

describe("ownership matrix (admin)", () => {
  it("admin identity is not an implicit owner of user resources", () => {
    // admin 访问用户资源必须走显式授权用例，而不是把 admin 当 owner。
    const adminAsUser: OwnerKey = { kind: "user", id: "admin-1" };
    expect(
      decideOwnership({ ownerUserId: "user-A", sessionId: null }, adminAsUser),
    ).toEqual({ decision: "forbidden" });
  });
});

describe("legacy-unowned rows", () => {
  it("flags rows with no owner binding for resource-specific semantics", () => {
    expect(
      decideOwnership({ ownerUserId: null, sessionId: null }, SESSION_A),
    ).toEqual({ decision: "legacy-unowned" });
    expect(decideOwnership({ ownerUserId: null, sessionId: null }, null)).toEqual({
      decision: "legacy-unowned",
    });
  });
});
