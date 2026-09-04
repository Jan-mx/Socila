/**
 * SJWT-FR-001/AC-010 服务JWT启动校验Node专用模块（2026-09-04 Edge运行时隔离复查）：
 * service-jwt-startup-node.ts 必须调用 assertServiceJwtStartupConfig，配置无效时
 * 输出不含Secret的稳定错误并以退出码1终止进程（fail-fast，Next 16 standalone中
 * register抛错只触发unhandledRejection且进程存活，故必须显式退出）；配置合法时
 * 不得终止进程。纯单元：零数据库、零真实等待、合成Secret。
 */
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runServiceJwtStartupCheck } from "./service-jwt-startup-node";

const SYNTHETIC_CURRENT = "unit-synthetic-current-secret-0123456789-abcdef"; // 48 UTF-8字节
const SYNTHETIC_PREVIOUS = "unit-synthetic-previous-secret-0123456789-abcdef"; // 48 UTF-8字节

describe("Node专用启动校验模块（SJWT-FR-001/AC-010、NFR-004/006）", () => {
  let exitSpy: MockInstance<(code?: string | number | null | undefined) => never>;
  let errorSpy: MockInstance<(message?: unknown) => void>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number | string | null) => {
      throw new Error("process.exit called with " + String(code));
    }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    delete process.env.NEXT_RUNTIME;
    delete process.env.AGENT_SERVICE_JWT_CURRENT;
    delete process.env.AGENT_SERVICE_JWT_PREVIOUS;
  });

  it("current缺失 → 输出稳定错误并以exit(1)终止进程", () => {
    expect(() => runServiceJwtStartupCheck()).toThrow("process.exit called with 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("current少于32 UTF-8字节 → exit(1)", () => {
    process.env.AGENT_SERVICE_JWT_CURRENT = "a".repeat(31);
    expect(() => runServiceJwtStartupCheck()).toThrow("process.exit called with 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("previous与current相同 → exit(1)", () => {
    process.env.AGENT_SERVICE_JWT_CURRENT = SYNTHETIC_CURRENT;
    process.env.AGENT_SERVICE_JWT_PREVIOUS = SYNTHETIC_CURRENT;
    expect(() => runServiceJwtStartupCheck()).toThrow("process.exit called with 1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("合法current（previous缺失或合法且不同）→ 不终止进程且无错误输出", () => {
    process.env.AGENT_SERVICE_JWT_CURRENT = SYNTHETIC_CURRENT;
    expect(() => runServiceJwtStartupCheck()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    process.env.AGENT_SERVICE_JWT_PREVIOUS = SYNTHETIC_PREVIOUS;
    expect(() => runServiceJwtStartupCheck()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("错误输出不含Secret内容且为稳定消息（SJWT-NFR-006）", () => {
    const probe = "leak-probe-" + "q".repeat(32);
    process.env.AGENT_SERVICE_JWT_CURRENT = "x".repeat(10);
    process.env.AGENT_SERVICE_JWT_PREVIOUS = probe;
    expect(() => runServiceJwtStartupCheck()).toThrow("process.exit called with 1");
    const output = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).not.toContain(probe);
    expect(output).toContain("[service-jwt] startup validation failed, refusing to start:");
  });
});
