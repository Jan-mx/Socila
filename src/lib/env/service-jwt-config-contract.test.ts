/**
 * 服务JWT宿主/Compose配置契约（09-03复审缺漏二/四及2026-09-04复查）：
 * - Compose web/agent/worker/beat四个消费者：AGENT_SERVICE_JWT_CURRENT必须使用
 *   :? 必填插值（缺失或空值时docker compose config直接失败，SJWT-AC-010），
 *   AGENT_SERVICE_JWT_PREVIOUS保持可选插值（双窗口轮换）；
 * - 根 .env.example 宿主模板必须声明两个变量，且current/previous模板值必须为空：
 *   可预测占位符不得通过启动校验（复查），直接复制未填写的模板必须由Node启动
 *   校验拒绝（模板为空是故意设计，未配置时必须启动失败，SJWT-AC-010）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { assertServiceJwtStartupConfig } from "../security/service-jwt-provider";

const root = fileURLToPath(new URL("../../..", import.meta.url));

function sourceOf(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

/** 提取 compose 文件指定服务的完整段落（从 `  service:` 到下一服务或顶层键）。 */
function composeServiceSection(yaml: string, service: string): string {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "  " + service + ":");
  if (start === -1) throw new Error("compose 缺少服务 " + service);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z_][\w-]*:/.test(lines[i]) || /^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const composeYaml = sourceOf("infra/prod/docker-compose.yml");
const jwtConsumers = ["web", "agent", "worker", "beat"];

/** 从 .env.example 模板提取两个服务JWT变量的值（空值即未填写）。 */
function templateJwtVars(): { current: string; previous: string } {
  let current = "";
  let previous = "";
  for (const line of sourceOf(".env.example").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("AGENT_SERVICE_JWT_CURRENT=")) {
      current = trimmed.slice("AGENT_SERVICE_JWT_CURRENT=".length);
    }
    if (trimmed.startsWith("AGENT_SERVICE_JWT_PREVIOUS=")) {
      previous = trimmed.slice("AGENT_SERVICE_JWT_PREVIOUS=".length);
    }
  }
  return { current, previous };
}

describe("Compose 服务JWT必填插值（SJWT-FR-001/AC-010，复审缺漏二）", () => {
  for (const service of jwtConsumers) {
    it(service + " 服务 AGENT_SERVICE_JWT_CURRENT 使用 :? 必填插值", () => {
      const section = composeServiceSection(composeYaml, service);
      expect(
        section,
        service + " 必须将 AGENT_SERVICE_JWT_CURRENT 设为 :? 必填插值",
      ).toMatch(/^\s*AGENT_SERVICE_JWT_CURRENT: \$\{AGENT_SERVICE_JWT_CURRENT:\?[^}\n]+\}\s*$/m);
    });

    it(service + " 服务 AGENT_SERVICE_JWT_PREVIOUS 保持可选插值", () => {
      const section = composeServiceSection(composeYaml, service);
      expect(
        section,
        service + " 的 AGENT_SERVICE_JWT_PREVIOUS 应为可选插值",
      ).toMatch(/^\s*AGENT_SERVICE_JWT_PREVIOUS: \$\{AGENT_SERVICE_JWT_PREVIOUS\}\s*$/m);
    });
  }

  it("其余Compose服务不注入服务JWT变量（最小权限）", () => {
    for (const service of ["proxy", "migrate", "postgres", "redis", "minio"]) {
      const section = composeServiceSection(composeYaml, service);
      expect(section, service + " 不应持有服务JWT变量").not.toContain("AGENT_SERVICE_JWT");
    }
  });
});

describe("宿主模板服务JWT变量（复审缺漏四及2026-09-04复查）", () => {
  it(".env.example 声明 AGENT_SERVICE_JWT_CURRENT 与 AGENT_SERVICE_JWT_PREVIOUS", () => {
    const lines = sourceOf(".env.example").split(/\r?\n/).map((line) => line.trim());
    expect(
      lines.some((line) => line.startsWith("AGENT_SERVICE_JWT_CURRENT=")),
      ".env.example 必须声明 AGENT_SERVICE_JWT_CURRENT",
    ).toBe(true);
    expect(
      lines.some((line) => line.startsWith("AGENT_SERVICE_JWT_PREVIOUS=")),
      ".env.example 必须声明 AGENT_SERVICE_JWT_PREVIOUS",
    ).toBe(true);
  });

  it("模板current/previous必须为空值（可预测占位符不得通过校验）", () => {
    const vars = templateJwtVars();
    expect(vars.current, "模板current必须为空（空值是故意设计，未配置必须启动失败）").toBe("");
    expect(vars.previous, "模板previous必须为空").toBe("");
  });

  it("直接复制未填写的模板会被Node启动校验拒绝（防回归）", () => {
    const vars = templateJwtVars();
    expect(
      () =>
        assertServiceJwtStartupConfig({
          AGENT_SERVICE_JWT_CURRENT: vars.current,
          AGENT_SERVICE_JWT_PREVIOUS: vars.previous,
        }),
      "未填写的模板值必须无法通过启动校验",
    ).toThrow();
  });
});
