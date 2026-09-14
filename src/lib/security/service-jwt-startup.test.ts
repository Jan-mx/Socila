/**
 * SJWT-FR-001/AC-010 启动期校验（09-03复审缺漏二，2026-09-04运行时隔离复查）：
 * Node运行时启动入口（instrumentation register，覆盖next dev/start与standalone
 * server.js）必须在AGENT_SERVICE_JWT_CURRENT缺失、少于32 UTF-8字节或与previous
 * 相同时以exit(1)终止进程（fail-fast，/api/health不得成为绕过路径）；校验与终止
 * 逻辑位于Node专用模块service-jwt-startup-node.ts，register为async且仅在
 * NEXT_RUNTIME=nodejs分支动态加载该模块（Edge运行时零Node API，构建零警告）。
 * 纯单元：零数据库、零真实等待、合成Secret。
 */
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { register } from "../../instrumentation";
import { assertServiceJwtStartupConfig } from "./service-jwt-provider";

const SYNTHETIC_CURRENT = "unit-synthetic-current-secret-0123456789-abcdef"; // 48 UTF-8字节
const SYNTHETIC_PREVIOUS = "unit-synthetic-previous-secret-0123456789-abcdef"; // 48 UTF-8字节

describe("assertServiceJwtStartupConfig（SJWT-FR-001/NFR-003/AC-010）", () => {
  it("current缺失 → 启动校验失败", () => {
    expect(() => assertServiceJwtStartupConfig({})).toThrow();
  });

  it("current为空或不足32 UTF-8字节 → 启动校验失败", () => {
    expect(() => assertServiceJwtStartupConfig({ AGENT_SERVICE_JWT_CURRENT: "" })).toThrow();
    expect(() => assertServiceJwtStartupConfig({ AGENT_SERVICE_JWT_CURRENT: "a".repeat(31) })).toThrow();
    expect(() => assertServiceJwtStartupConfig({ AGENT_SERVICE_JWT_CURRENT: "a".repeat(32) })).not.toThrow();
  });

  it("previous与current相同或非法 → 启动校验失败", () => {
    expect(() =>
      assertServiceJwtStartupConfig({
        AGENT_SERVICE_JWT_CURRENT: SYNTHETIC_CURRENT,
        AGENT_SERVICE_JWT_PREVIOUS: SYNTHETIC_CURRENT,
      }),
    ).toThrow();
    expect(() =>
      assertServiceJwtStartupConfig({
        AGENT_SERVICE_JWT_CURRENT: SYNTHETIC_CURRENT,
        AGENT_SERVICE_JWT_PREVIOUS: "short",
      }),
    ).toThrow();
  });

  it("合法current（previous缺失或合法且不同）→ 通过", () => {
    expect(() => assertServiceJwtStartupConfig({ AGENT_SERVICE_JWT_CURRENT: SYNTHETIC_CURRENT })).not.toThrow();
    expect(() =>
      assertServiceJwtStartupConfig({
        AGENT_SERVICE_JWT_CURRENT: SYNTHETIC_CURRENT,
        AGENT_SERVICE_JWT_PREVIOUS: SYNTHETIC_PREVIOUS,
      }),
    ).not.toThrow();
  });

  it("错误消息不泄漏Secret内容（SJWT-NFR-006）", () => {
    const probe = "leak-probe-" + "z".repeat(32);
    try {
      assertServiceJwtStartupConfig({
        AGENT_SERVICE_JWT_CURRENT: "x".repeat(10),
        AGENT_SERVICE_JWT_PREVIOUS: probe,
      });
      throw new Error("startup validation must have thrown");
    } catch (err) {
      expect(String(err)).not.toContain(probe);
    }
  });
});

describe("Node运行时启动入口（instrumentation register，async+Node模块动态加载）", () => {
  // Next 16 standalone中register抛错只会unhandledRejection且进程存活；
  // 启动失败必须由Node专用模块显式process.exit(1)（fail-fast，/api/health不可绕过）。
  // register为async：动态import Node专用模块并调用启动校验（2026-09-04运行时隔离）。
  let exitSpy: MockInstance<(code?: string | number | null | undefined) => never>;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number | string | null) => {
      throw new Error("process.exit called with " + String(code));
    }) as never);
  });
  afterEach(() => {
    exitSpy.mockRestore();
    delete process.env.NEXT_RUNTIME;
    delete process.env.AGENT_SERVICE_JWT_CURRENT;
    delete process.env.AGENT_SERVICE_JWT_PREVIOUS;
  });

  it("NEXT_RUNTIME=nodejs且current缺失 → 启动入口以exit(1)终止进程", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await expect(register()).rejects.toThrow("process.exit called with 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("NEXT_RUNTIME=nodejs且current过短/与previous相同 → 同样exit(1)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.AGENT_SERVICE_JWT_CURRENT = "a".repeat(31);
    await expect(register()).rejects.toThrow("process.exit called with 1");
    process.env.AGENT_SERVICE_JWT_CURRENT = SYNTHETIC_CURRENT;
    process.env.AGENT_SERVICE_JWT_PREVIOUS = SYNTHETIC_CURRENT;
    await expect(register()).rejects.toThrow("process.exit called with 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("NEXT_RUNTIME=nodejs且current合法 → 不终止进程", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.AGENT_SERVICE_JWT_CURRENT = SYNTHETIC_CURRENT;
    await expect(register()).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("非Node运行时（edge）不执行启动校验（不终止、不影响Edge/纯类型导入）", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await expect(register()).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
