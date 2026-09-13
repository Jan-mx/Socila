/**
 * WI-20260913-01任务5：MinIO运行映射配置契约（SHV2-FR-028/AC-022）。
 *
 * - Agent/Worker必须显式使用 AGENT_MINIO_ENDPOINT=minio:9000 与
 *   AGENT_MINIO_BUCKET=policy-originals（Docker内部S3 API，内容寻址原件bucket）；
 * - 9001（MinIO Console）或含 /login 的值不得作为任何服务的S3 endpoint；
 * - MinIO服务 /data 必须绑定现有named volume minio-data（name: socila_minio-data），
 *   不得新增第二个MinIO数据卷；
 * - 不采用Compose无条件初始化建桶（bucket创建属于fresh授权apply的ensure_bucket）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const composePath = fileURLToPath(
  new URL("../../../infra/prod/docker-compose.yml", import.meta.url),
);

const composeYaml = readFileSync(composePath, "utf8");

/** 解析 compose 文件指定服务的 environment 映射（缩进敏感，针对本仓库 Compose 结构）。 */
function composeServiceEnv(yaml: string, service: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = yaml.split(/\r?\n/);
  let inServices = false;
  let inService = false;
  let inEnv = false;
  for (const line of lines) {
    if (/^[A-Za-z_][\w-]*:/.test(line)) {
      inServices = line.startsWith("services:");
      inService = false;
      inEnv = false;
      continue;
    }
    if (!inServices) continue;
    const serviceMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (serviceMatch) {
      inService = serviceMatch[1] === service;
      inEnv = false;
      continue;
    }
    if (!inService) continue;
    if (/^    environment:\s*$/.test(line)) {
      inEnv = true;
      continue;
    }
    if (inEnv) {
      const entry = line.match(/^      ([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
      if (entry) {
        out[entry[1]] = entry[2].trim();
      } else if (/^    \S/.test(line) || !line.trim()) {
        inEnv = false;
      }
    }
  }
  return out;
}

/** 提取指定服务 volumes 列表条目（短语法 `- name:target`）。 */
function composeServiceVolumes(yaml: string, service: string): string[] {
  const out: string[] = [];
  const lines = yaml.split(/\r?\n/);
  let inServices = false;
  let inService = false;
  let inVolumes = false;
  for (const line of lines) {
    if (/^[A-Za-z_][\w-]*:/.test(line)) {
      inServices = line.startsWith("services:");
      inService = false;
      inVolumes = false;
      continue;
    }
    if (!inServices) continue;
    const serviceMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (serviceMatch) {
      inService = serviceMatch[1] === service;
      inVolumes = false;
      continue;
    }
    if (!inService) continue;
    if (/^    volumes:\s*$/.test(line)) {
      inVolumes = true;
      continue;
    }
    if (inVolumes) {
      const entry = line.match(/^      -\s+(.+)$/);
      if (entry) {
        out.push(entry[1].trim());
      } else if (/^    \S/.test(line) || !line.trim()) {
        inVolumes = false;
      }
    }
  }
  return out;
}


describe("MinIO运行映射契约（SHV2-FR-028）", () => {
  it("agent与worker必须显式使用minio:9000与policy-originals", () => {
    for (const service of ["agent", "worker"]) {
      const env = composeServiceEnv(composeYaml, service);
      expect(env.AGENT_MINIO_ENDPOINT, `${service} AGENT_MINIO_ENDPOINT`).toBe("minio:9000");
      expect(env.AGENT_MINIO_BUCKET, `${service} AGENT_MINIO_BUCKET`).toBe("policy-originals");
    }
  });

  it("任何服务都不得把9001或含/login的endpoint配置为S3 API", () => {
    for (const service of ["proxy", "web", "agent", "worker", "beat", "migrate", "postgres", "redis", "minio"]) {
      const env = composeServiceEnv(composeYaml, service);
      for (const [key, value] of Object.entries(env)) {
        if (key.includes("MINIO_ENDPOINT")) {
          expect(value.includes("9001") || value.includes("/login"), `${service}.${key}=${value}`).toBe(false);
        }
      }
    }
  });

  it("MinIO /data必须绑定named volume minio-data且名称固定socila_minio-data", () => {
    expect(composeServiceVolumes(composeYaml, "minio")).toContain("minio-data:/data");
    const volumesSection = composeYaml.slice(composeYaml.indexOf("\nvolumes:"));
    expect(volumesSection).toMatch(/minio-data:\s*\n\s*name:\s*socila_minio-data/);
  });

  it("不得新增第二个MinIO数据卷", () => {
    const volumesSection = composeYaml.slice(composeYaml.indexOf("\nvolumes:"));
    const minioVolumeNames = [...volumesSection.matchAll(/^\s{2}([\w-]+):\s*$/gm)].map((m) => m[1]);
    const minioLike = minioVolumeNames.filter((name) => name.toLowerCase().includes("minio"));
    expect(minioLike).toEqual(["minio-data"]);
  });

  it("Compose不得无条件初始化建桶（无mc mb/init容器/启动建桶脚本）", () => {
    expect(composeYaml).not.toMatch(/mc\s+mb/);
    expect(composeYaml).not.toMatch(/make_bucket|create_bucket/i);
  });
});
