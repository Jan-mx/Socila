/**
 * SJWT-FR-001/AC-010/AC-018 instrumentation运行时隔离契约（2026-09-04 Edge构建警告复查）：
 * Next.js会把instrumentation同时构建为Node与Edge运行时bundle，src/instrumentation.ts
 * 不得直接或静态引用process.exit或任何仅Node可用的模块，否则Edge构建报告
 * “process.exit is not supported in the Edge Runtime”（Turbopack警告+Ecmascript
 * file had an error，违反AC-018无未解释warning）。启动校验与进程终止逻辑必须位于
 * Node专用模块service-jwt-startup-node.ts，仅经nodejs分支的动态import加载。
 * 纯单元：源码契约+vi.mock运行时路由，零数据库、零真实等待。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));

function sourceOf(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const checkMock = vi.hoisted(() => vi.fn());

vi.mock("./service-jwt-startup-node", () => ({
  runServiceJwtStartupCheck: checkMock,
}));

import { register } from "../../instrumentation";

const SYNTHETIC_CURRENT = "unit-synthetic-current-secret-0123456789-abcdef"; // 48 UTF-8字节

describe("instrumentation源码契约（Edge构建警告防回归）", () => {
  const src = sourceOf("src/instrumentation.ts");

  it("instrumentation.ts不引用process.exit（Edge运行时不支持该Node API）", () => {
    expect(src).not.toMatch(/process\.exit/);
  });

  it("instrumentation.ts不静态导入仅Node可用模块（无node:前缀导入或require）", () => {
    expect(src).not.toMatch(/from\s+["']node:/);
    expect(src).not.toMatch(/import\s*\(\s*["']node:/);
    expect(src).not.toMatch(/require\(\s*["']node:/);
  });

  it("仅在nodejs分支动态导入Node专用启动模块（动态导入必须位于运行时守卫之后）", () => {
    const guardIndex = src.indexOf('NEXT_RUNTIME !== "nodejs"');
    const importMatch = src.match(/import\(\s*["']@\/lib\/security\/service-jwt-startup-node["']\s*\)/);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(importMatch).not.toBeNull();
    expect(importMatch?.index).toBeGreaterThan(guardIndex);
  });

  it("Node专用模块承载启动校验与退出码1终止（进程终止不留在instrumentation）", () => {
    const nodeSrc = sourceOf("src/lib/security/service-jwt-startup-node.ts");
    expect(nodeSrc).toContain("assertServiceJwtStartupConfig");
    expect(nodeSrc).toMatch(/process\.exit\(1\)/);
  });
});

describe("instrumentation运行时路由（register，2026-09-04改async）", () => {
  afterEach(() => {
    checkMock.mockClear();
    delete process.env.NEXT_RUNTIME;
    delete process.env.AGENT_SERVICE_JWT_CURRENT;
    delete process.env.AGENT_SERVICE_JWT_PREVIOUS;
  });

  it("Edge运行时不加载Node专用启动模块", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("NEXT_RUNTIME未设置（纯类型导入场景）不加载Node专用启动模块", async () => {
    await register();
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("Node运行时调用Node启动校验模块且仅一次", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.AGENT_SERVICE_JWT_CURRENT = SYNTHETIC_CURRENT;
    await register();
    expect(checkMock).toHaveBeenCalledTimes(1);
  });
});
