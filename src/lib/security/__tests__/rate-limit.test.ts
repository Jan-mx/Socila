/**
 * 登录限流契约测试（09-02 AUTH-NFR-003：窗口5分钟，可控时钟）。
 *
 * 契约：
 * - 每IP最多20次/5分钟：第20次允许、第21次拒绝；
 * - 每IP+规范化用户名最多5次/5分钟：第5次允许、第6次拒绝；
 * - 拒绝后4分59秒仍拒绝，满5分钟窗口滚过恢复；
 * - 不同用户名的细粒度bucket相互隔离；
 * - 全IP上限不受细粒度bucket影响（继续有效）；
 * - 登录页限流提示精确为「请求频繁，请五分钟后再尝试。」。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  checkRateLimit,
  resetRateLimitBucketsForTest,
} from "@/lib/security/rate-limit";
import {
  LOGIN_IP_RATE_LIMIT,
  LOGIN_IP_RATE_WINDOW_MS,
  LOGIN_USER_RATE_LIMIT,
  LOGIN_USER_RATE_WINDOW_MS,
  LOGIN_RATE_LIMITED_MESSAGE,
} from "@/lib/auth/login-rate-limits";

const IP_KEY = "auth:login:ip:203.0.113.7";
const USER_KEY = (username: string) => `auth:login:ip:203.0.113.7:${username}`;

describe("登录限流5分钟窗口（AUTH-NFR-003，可控时钟）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T08:00:00Z"));
    resetRateLimitBucketsForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("每IP第20次允许、第21次拒绝", () => {
    for (let i = 1; i <= 20; i += 1) {
      const r = checkRateLimit(IP_KEY, {
        limit: LOGIN_IP_RATE_LIMIT,
        windowMs: LOGIN_IP_RATE_WINDOW_MS,
      });
      expect(r.allowed, `第${i}次应允许`).toBe(true);
    }
    const denied = checkRateLimit(IP_KEY, {
      limit: LOGIN_IP_RATE_LIMIT,
      windowMs: LOGIN_IP_RATE_WINDOW_MS,
    });
    expect(denied.allowed).toBe(false);
  });

  it("每IP+规范化用户名第5次允许、第6次拒绝", () => {
    const key = USER_KEY("localuser1");
    for (let i = 1; i <= 5; i += 1) {
      const r = checkRateLimit(key, {
        limit: LOGIN_USER_RATE_LIMIT,
        windowMs: LOGIN_USER_RATE_WINDOW_MS,
      });
      expect(r.allowed, `第${i}次应允许`).toBe(true);
    }
    const denied = checkRateLimit(key, {
      limit: LOGIN_USER_RATE_LIMIT,
      windowMs: LOGIN_USER_RATE_WINDOW_MS,
    });
    expect(denied.allowed).toBe(false);
  });

  it("拒绝后4分59秒仍拒绝，满5分钟恢复", () => {
    const key = USER_KEY("window-user");
    const first = checkRateLimit(key, {
      limit: LOGIN_USER_RATE_LIMIT,
      windowMs: LOGIN_USER_RATE_WINDOW_MS,
    });
    expect(first.allowed).toBe(true);
    for (let i = 2; i <= 5; i += 1) {
      checkRateLimit(key, { limit: LOGIN_USER_RATE_LIMIT, windowMs: LOGIN_USER_RATE_WINDOW_MS });
    }
    expect(
      checkRateLimit(key, { limit: LOGIN_USER_RATE_LIMIT, windowMs: LOGIN_USER_RATE_WINDOW_MS }).allowed,
    ).toBe(false);

    // 4分59秒：仍在同一窗口内
    vi.setSystemTime(new Date("2026-09-14T08:04:59Z"));
    expect(
      checkRateLimit(key, { limit: LOGIN_USER_RATE_LIMIT, windowMs: LOGIN_USER_RATE_WINDOW_MS }).allowed,
    ).toBe(false);

    // 满5分钟：窗口滚过，恢复允许
    vi.setSystemTime(new Date("2026-09-14T08:05:00Z"));
    const recovered = checkRateLimit(key, {
      limit: LOGIN_USER_RATE_LIMIT,
      windowMs: LOGIN_USER_RATE_WINDOW_MS,
    });
    expect(recovered.allowed).toBe(true);
  });

  it("不同用户名的细粒度bucket相互隔离", () => {
    const a = USER_KEY("user-a");
    const b = USER_KEY("user-b");
    for (let i = 1; i <= 5; i += 1) {
      checkRateLimit(a, { limit: LOGIN_USER_RATE_LIMIT, windowMs: LOGIN_USER_RATE_WINDOW_MS });
    }
    expect(
      checkRateLimit(a, { limit: LOGIN_USER_RATE_LIMIT, windowMs: LOGIN_USER_RATE_WINDOW_MS }).allowed,
    ).toBe(false);
    // 用户B不受用户A耗尽影响
    expect(
      checkRateLimit(b, { limit: LOGIN_USER_RATE_LIMIT, windowMs: LOGIN_USER_RATE_WINDOW_MS }).allowed,
    ).toBe(true);
  });

  it("全IP上限继续有效：细粒度bucket未耗尽也可被IP上限拦截", () => {
    // 单用户名仅尝试1次（远低于5次），但同一IP下20个不同用户名后触发IP上限
    for (let i = 1; i <= 20; i += 1) {
      const allowed = checkRateLimit(`auth:login:ip:198.51.100.9:user-${i}`, {
        limit: LOGIN_USER_RATE_LIMIT,
        windowMs: LOGIN_USER_RATE_WINDOW_MS,
      });
      expect(allowed.allowed).toBe(true);
      checkRateLimit(`auth:login:ip:198.51.100.9`, {
        limit: LOGIN_IP_RATE_LIMIT,
        windowMs: LOGIN_IP_RATE_WINDOW_MS,
      });
    }
    const ipDenied = checkRateLimit(`auth:login:ip:198.51.100.9`, {
      limit: LOGIN_IP_RATE_LIMIT,
      windowMs: LOGIN_IP_RATE_WINDOW_MS,
    });
    expect(ipDenied.allowed).toBe(false);
    // 第21个不同用户名自身bucket是新的，但登录页动作层先被IP上限拦截
    expect(
      checkRateLimit("auth:login:ip:198.51.100.9:user-21", {
        limit: LOGIN_USER_RATE_LIMIT,
        windowMs: LOGIN_USER_RATE_WINDOW_MS,
      }).allowed,
    ).toBe(true);
  });

  it("登录页限流提示精确为指定中文文案", () => {
    expect(LOGIN_RATE_LIMITED_MESSAGE).toBe("请求频繁，请五分钟后再尝试。");
  });

  it("窗口契约：两个层级均为5分钟、次数门槛不降低", () => {
    expect(LOGIN_IP_RATE_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(LOGIN_USER_RATE_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(LOGIN_IP_RATE_LIMIT).toBe(20);
    expect(LOGIN_USER_RATE_LIMIT).toBe(5);
  });
});
