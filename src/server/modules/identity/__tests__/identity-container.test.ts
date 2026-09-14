/**
 * identity 启动配置测试（09-03 PMG-FR-032）：
 * 缺失 AUTH_REFRESH_PEPPER 必须拒绝启动；pepper 与 NEXTAUTH_SECRET 相同必须拒绝。
 * 纯环境变量断言，不连接数据库（仓储构造延迟连接）。
 *
 * 超时策略（2026-09-09 任务3复审 P2 稳定化）：freshContainer 经 vi.resetModules()
 * 重新求值 identity-container 的完整依赖图（@/lib/db → drizzle/pg 链），在并行
 * 单元套件负载下单测可能超过 vitest 默认 5 秒；本文件三个用例显式放宽到 30 秒，
 * 属于模块重载固有成本，不掩盖失败（断言本身仍是确定性环境变量契约）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = {
  PEPPER: process.env.AUTH_REFRESH_PEPPER,
  NEXTAUTH: process.env.NEXTAUTH_SECRET,
};

function setEnv(pepper: string | undefined, nextauth: string | undefined) {
  if (pepper === undefined) delete process.env.AUTH_REFRESH_PEPPER;
  else process.env.AUTH_REFRESH_PEPPER = pepper;
  if (nextauth === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = nextauth;
}

async function freshContainer() {
  // 清除模块缓存以重置进程级单例（getIdentityDeps 的 cachedDeps）。
  vi.resetModules();
  return import("../infrastructure/identity-container");
}

describe("identity container startup config (PMG-FR-032)", () => {
  afterEach(() => {
    setEnv(ORIGINAL.PEPPER, ORIGINAL.NEXTAUTH);
  });

  it("rejects startup when AUTH_REFRESH_PEPPER is missing", async () => {
    setEnv(undefined, "ci-nextauth-secret");
    const { getIdentityDeps } = await freshContainer();
    expect(() => getIdentityDeps()).toThrowError(/AUTH_REFRESH_PEPPER/);
  }, 30_000);

  it("rejects startup when pepper equals NEXTAUTH_SECRET", async () => {
    setEnv("same-secret-value", "same-secret-value");
    const { getIdentityDeps } = await freshContainer();
    expect(() => getIdentityDeps()).toThrowError(/must differ from NEXTAUTH_SECRET/);
  }, 30_000);

  it("accepts distinct pepper and returns deps", async () => {
    setEnv("pepper-value-a", "nextauth-value-b");
    const { getIdentityDeps } = await freshContainer();
    const deps = getIdentityDeps();
    expect(deps.pepper).toBe("pepper-value-a");
  }, 30_000);
});
