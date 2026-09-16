/**
 * 修复轮I6（源码契约）：APR数据库门禁的MinIO镜像必须复用仓库CI已批准的
 * quay.io固定digest（不可拉取的minio/minio:latest在干净环境不可复现且不确定），
 * 且任务资源隔离面不回归：仅操作apr-*专属容器、不引用/删除生产卷与socila-*容器。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const gate = readFileSync(path.join(ROOT, "scripts", "apr-db-gate.mjs"), "utf8");
const composeCi = readFileSync(
  path.join(ROOT, "infra", "prod", "docker-compose.ci.yml"),
  "utf8",
);

/** CI compose中minio服务的image:值（仓库批准的唯一镜像来源）。 */
function approvedMinioImage(): string {
  const service = composeCi
    .split("\n  ")
    .find((block) => block.includes("minio") && block.includes("image:"));
  const match = service?.match(/image:\s*(\S+)/);
  if (!match) {
    throw new Error("docker-compose.ci.yml未找到minio镜像声明（批准来源缺失）");
  }
  return match[1];
}

describe("APR数据库门禁镜像与资源隔离契约（修复轮I6）", () => {
  it("禁止使用minio/minio:latest（Docker Hub denied/非确定性）", () => {
    expect(gate).not.toContain("minio/minio:latest");
    expect(gate).not.toMatch(/["']minio\/minio/);
  });

  it("MinIO镜像复用CI compose批准的quay.io固定digest（单一真相源，运行时解析）", () => {
    const approved = approvedMinioImage();
    expect(approved).toMatch(/^quay\.io\/minio\/minio:RELEASE\..+@sha256:[0-9a-f]{64}$/);
    // 门禁以docker-compose.ci.yml为唯一镜像来源并在运行时校验digest形状。
    expect(gate).toContain("docker-compose.ci.yml");
    expect(gate).toMatch(/approvedMinioImage/);
    // 脚本自身的digest形状校验必须要求quay.io+RELEASE+@sha256:{64hex}。
    expect(gate).toMatch(/quay\\?\.io\\/);
    expect(gate).toContain("RELEASE\\.");
    expect(gate).toContain("@sha256:");
    expect(gate).toContain("{64}");
  });

  it("任务容器清单全部为apr-*专属名称（cleanup只作用于任务资源）", () => {
    const match = gate.match(/const CONTAINERS = \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const names = match![1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0);
    expect(names.length).toBeGreaterThanOrEqual(2);
    for (const name of names) {
      expect(name).toMatch(/^apr-/);
    }
    // 删除动作仅限清单内容器名（不带-v卷枚举之外的路径）。
    expect(gate).toMatch(/for \(const name of CONTAINERS\)/);
  });

  it("不引用生产卷与生产容器名（代码字面量面；文档注释中'不触碰socila-*'声明除外）", () => {
    // 卷名与容器名只能以"禁止触碰"语义出现在注释中，不得成为任何docker参数。
    expect(gate).not.toMatch(/"(socila[-_][^"]*)"/);
    expect(gate).not.toMatch(/'socila[-_]/);
    expect(gate).not.toMatch(/`socila[-_]\w+`/); // 模板插值引用生产资源名
    // 删除路径唯一：spawnSync rm 只接受清单变量name。
    const rmCalls = gate.match(/\["rm",\s*"-f",\s*"-v",\s*([^\]]+)\]/g) ?? [];
    expect(rmCalls.length).toBeGreaterThan(0);
    for (const call of rmCalls) {
      expect(call).toContain("name");
    }
  });
});
