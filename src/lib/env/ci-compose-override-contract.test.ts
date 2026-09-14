/**
 * WI-20260914-01 CIG-FR-006～011（PMG-FR-022～024/NFR-001/NFR-008）：
 * CI Compose override 与工作流契约（源码级，零Docker、零数据库）。
 *
 * - `infra/prod/docker-compose.ci.yml` 只作为 CI 叠加：移除全部固定 container_name、
 *   不引用生产卷名（socila_pg-data / socila_minio-data / socila_caddy-data）、
 *   不绑定 80/443/5432/6380/9000/9001 宿主固定端口、minio 改用 MinIO 官方 Quay 仓库
 *   并按与生产在用镜像相同的 digest 固定；
 * - 生产文件 `docker-compose.yml` 运行语义不变（固定容器名、生产卷名、Docker Hub 镜像标签保持）；
 * - `.github/workflows/ci.yml`：ESLint 零 warning、RCL 演练容器 ID 显式传入、
 *   e2e-rcl-setup 与 pgvector 初始化步骤、失败诊断在 `down -v` 之前并上传 artifact、
 *   唯一项目名、第三方 Action 固定完整 SHA、触发条件不含临时分支。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));
// Windows 工作树可能为 CRLF（core.autocrlf）；契约按 LF 规范化后断言。
const read = (rel: string) => readFileSync(`${root}/${rel}`, "utf8").replace(/\r\n/g, "\n");
/** 去除注释行（契约只约束生效配置，不约束说明文字）。 */
const withoutComments = (yaml: string) =>
  yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

const prodCompose = read("infra/prod/docker-compose.yml");
const ciOverride = read("infra/prod/docker-compose.ci.yml");
const ciWorkflow = read(".github/workflows/ci.yml");

const MINIO_RELEASE = "RELEASE.2025-09-07T16-13-09Z";
const MINIO_DIGEST = "sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e";
const PROD_NAMED_SERVICES = ["proxy", "web", "agent", "worker", "beat", "migrate", "postgres", "redis", "minio"];
const FIXED_HOST_PORTS = ['"80:80"', '"443:443"', '"5432:5432"', '"6380:6379"', '"9000:9000"', '"9001:9001"'];

/** 取 override 中某服务的缩进块文本。 */
function serviceBlock(yaml: string, service: string): string {
  const m = yaml.match(new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|^[a-z]+:\\n|$(?![\\r\\n]))`, "m"));
  return m ? m[1] : "";
}

describe("生产 Compose 运行语义未变（CIG-FR-010 非目标护栏）", () => {
  it("生产文件仍固定 socila-* 容器名、生产卷名与 Docker Hub minio 标签", () => {
    for (const s of PROD_NAMED_SERVICES) {
      expect(prodCompose).toContain(`container_name: socila-${s}`);
    }
    expect(prodCompose).toContain("name: socila_pg-data");
    expect(prodCompose).toContain("name: socila_minio-data");
    expect(prodCompose).toContain("name: socila_caddy-data");
    expect(prodCompose).toContain(`image: minio/minio:${MINIO_RELEASE}`);
    for (const p of FIXED_HOST_PORTS) expect(prodCompose).toContain(p);
  });
});

describe("CI Compose override（CIG-FR-010/011）", () => {
  it("对生产文件中每个带 container_name 的服务显式 !reset", () => {
    for (const s of PROD_NAMED_SERVICES) {
      expect(serviceBlock(ciOverride, s), `service ${s}`).toMatch(/container_name: !reset null/);
    }
  });

  it("不引用任何生产卷名；生产卷键声明为 external 且不被挂载；声明 ci-* 临时卷", () => {
    expect(withoutComments(ciOverride)).not.toMatch(/socila_(pg|minio|caddy)-data/);
    for (const v of ["caddy-data", "pg-data", "minio-data"]) {
      expect(ciOverride).toMatch(new RegExp(`^  ${v}:\\n    external: true`, "m"));
      // 任何服务卷挂载都不得引用生产卷键。
      expect(ciOverride).not.toMatch(new RegExp(`- ${v}:/`));
    }
    expect(ciOverride).toMatch(/- ci-pg-data:\/var\/lib\/postgresql\/data/);
    expect(ciOverride).toMatch(/- ci-minio-data:\/data/);
    expect(ciOverride).toMatch(/- ci-caddy-data:\/data/);
    for (const v of ["ci-caddy-data", "ci-pg-data", "ci-minio-data"]) {
      expect(ciOverride).toMatch(new RegExp(`^  ${v}: \\{\\}`, "m"));
    }
  });

  it("不绑定宿主固定端口：proxy/redis/minio 端口 !reset，postgres 仅随机发布 5432", () => {
    for (const p of FIXED_HOST_PORTS) expect(ciOverride).not.toContain(p);
    for (const s of ["proxy", "redis", "minio"]) {
      expect(serviceBlock(ciOverride, s), `service ${s}`).toMatch(/ports: !reset \[\]/);
    }
    const pg = serviceBlock(ciOverride, "postgres");
    expect(pg).toMatch(/ports: !override\n\s+- "5432"/);
    expect(pg).not.toMatch(/"\d+:5432"/);
  });

  it("minio 改用 Quay 同 release 并按 digest 固定（与生产在用镜像 RepoDigest 一致）", () => {
    expect(serviceBlock(ciOverride, "minio")).toContain(
      `image: quay.io/minio/minio:${MINIO_RELEASE}@${MINIO_DIGEST}`,
    );
    // 与生产文件同一 release 标签（不同仓库、相同字节）。
    expect(prodCompose).toContain(`minio/minio:${MINIO_RELEASE}`);
  });

  it("不修改服务命令、健康检查、网络或服务 JWT 插值（保留内部 DNS 与冒烟前提）", () => {
    for (const key of ["command:", "healthcheck:", "networks:", "AGENT_SERVICE_JWT", "environment:", "depends_on:"]) {
      expect(ciOverride, key).not.toContain(key);
    }
  });
});

describe("CI 工作流契约（CIG-FR-002/006～009，PMG-FR-026/027）", () => {
  it("触发条件不含临时分支；权限只读", () => {
    const on = ciWorkflow.match(/^on:\n([\s\S]*?)\n\npermissions:/m);
    expect(on).not.toBeNull();
    expect(on![1]).toBe("  pull_request:\n  push:\n    branches: [main]\n  workflow_dispatch:");
    expect(ciWorkflow).toMatch(/^permissions:\n  contents: read/m);
  });

  it("gates：ESLint 覆盖 src 与 e2e 且零 warning", () => {
    expect(ciWorkflow).toContain("run: npx eslint src e2e --max-warnings 0");
    expect(ciWorkflow).not.toMatch(/run: npx eslint src\s*$/m);
  });

  it("database-gates 与 e2e-gates：RCL 演练容器 ID 来自 job.services.postgres.id，全新库创建 vector 扩展", () => {
    const occurrences = ciWorkflow.match(/RCL_DRILL_PG_CONTAINER: \$\{\{ job\.services\.postgres\.id \}\}/g) ?? [];
    expect(occurrences.length).toBe(2);
    const vectorSteps = ciWorkflow.match(/CREATE EXTENSION IF NOT EXISTS vector/g) ?? [];
    expect(vectorSteps.length).toBe(2);
    expect(ciWorkflow).not.toContain("jrp-drill-pg");
  });

  it("database-gates：Python 集成套件提供两个隔离 MinIO（Quay 同 digest），运行后无条件清理（零环境 skip）", () => {
    const dg = ciWorkflow.slice(ciWorkflow.indexOf("  database-gates:"), ciWorkflow.indexOf("  e2e-gates:"));
    const minioStart = dg.indexOf("name: isolated MinIO instances (RAG evidence sync tests)");
    const pySuite = dg.indexOf("name: Python database suite");
    const minioCleanup = dg.indexOf("name: remove isolated MinIO instances");
    expect(minioStart).toBeGreaterThan(0);
    expect(pySuite).toBeGreaterThan(minioStart);
    expect(minioCleanup).toBeGreaterThan(pySuite);
    expect(dg).toContain(`quay.io/minio/minio:${MINIO_RELEASE}@${MINIO_DIGEST}`);
    expect(dg).toMatch(/RAG_SYNC_TEST_MINIO_ENDPOINT: 127\.0\.0\.1:\d+/);
    expect(dg).toMatch(/RAG_SYNC_TEST_MINIO_RESTORE_ENDPOINT: 127\.0\.0\.1:\d+/);
    expect(dg).toMatch(/remove isolated MinIO instances\n\s+if: always\(\)/);
    // 不使用 Docker Hub 的 minio/minio（仓库已不存在）。
    expect(dg).not.toMatch(/[^/]minio\/minio:/);
  });

  it("e2e-gates：初始化顺序 migration→bootstrap→seed→vector→e2e-rcl-setup→build→E2E，失败上传诊断", () => {
    const e2e = ciWorkflow.slice(ciWorkflow.indexOf("  e2e-gates:"), ciWorkflow.indexOf("  container-gates:"));
    const order = [
      "name: migration",
      "name: admin bootstrap",
      "name: seed",
      "name: pgvector extension (fresh database)",
      "run: npx tsx scripts/e2e-rcl-setup.ts",
      "name: production build",
      "name: auth E2E",
      "name: upload E2E diagnostics",
    ];
    let last = -1;
    for (const marker of order) {
      const idx = e2e.indexOf(marker);
      expect(idx, marker).toBeGreaterThan(last);
      last = idx;
    }
    expect(e2e).toMatch(/upload E2E diagnostics\n\s+if: failure\(\)/);
    for (const p of ["playwright-report/", "test-results/", "e2e-artifacts/"]) expect(e2e).toContain(p);
    expect(e2e).toContain("tee e2e-artifacts/e2e-run.log");
  });

  it("container-gates：唯一项目名 + override 叠加；失败诊断与上传位于 down -v 之前；无条件清理并核验零残留", () => {
    const cg = ciWorkflow.slice(ciWorkflow.indexOf("  container-gates:"), ciWorkflow.indexOf("  security-gates:"));
    expect(cg).toContain("COMPOSE_PROJECT_NAME: socila-ci-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(cg).toContain("COMPOSE_FILE: docker-compose.yml:docker-compose.ci.yml");
    expect(cg).not.toContain("COMPOSE_PROJECT_NAME: socila-ci\n");
    const diag = cg.indexOf("name: compose diagnostics (on failure, before cleanup)");
    const upload = cg.indexOf("name: upload compose diagnostics");
    const down = cg.indexOf("name: compose down -v (unconditional)");
    const residue = cg.indexOf("name: verify zero task residue");
    expect(diag).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(diag);
    expect(down).toBeGreaterThan(upload);
    expect(residue).toBeGreaterThan(down);
    expect(cg).toMatch(/compose diagnostics \(on failure, before cleanup\)\n\s+if: failure\(\)/);
    expect(cg).toMatch(/upload compose diagnostics\n\s+if: failure\(\)/);
    expect(cg).toMatch(/compose down -v \(unconditional\)\n\s+if: always\(\)/);
    expect(cg).toMatch(/verify zero task residue\n\s+if: always\(\)/);
    for (const item of ["ps -a", "logs --no-color", ".State.Status", ".State.Health", ".State.ExitCode", "docker info", "docker system df", "ss -ltnp", "docker network ls", "docker volume ls"]) {
      expect(cg, item).toContain(item);
    }
    // 服务状态断言不再依赖固定容器名。
    expect(cg).not.toMatch(/docker inspect -f '\{\{\.State\.Status\}\}' "socila-/);
    expect(cg).toContain('ps -q "$svc"');
    // 健康检查对 web 与 agent 都是就绪条件轮询（CI #25真实失败：agent /internal/health
    // 单次无等待探测在 uvicorn 完成启动前返回 Connection refused）。
    expect(cg).toMatch(/wait_for "web \/api\/health"/);
    expect(cg).toMatch(/wait_for "agent \/internal\/health"/);
    // 不以 continue-on-error 掩盖失败。
    expect(ciWorkflow).not.toContain("continue-on-error");
    // Trivy固定v0.74.0且带v前缀（trivy-action的version输入与GitHub release tag一致；
    // CI #24真实失败：`0.74.0`无v前缀使install.sh报"unable to find '0.74.0'"）。
    const trivyVersions = cg.match(/version: "(v[\d.]+)"/g) ?? [];
    expect(trivyVersions, "两处Trivy步骤必须固定同一版本").toHaveLength(2);
    expect(new Set(trivyVersions).size).toBe(1);
    expect(trivyVersions[0]).toBe('version: "v0.74.0"');
  });

  it("第三方 Action 全部固定完整提交 SHA 并保留版本注释（PMG-FR-027）", () => {
    const uses = ciWorkflow.match(/uses: [^\n]+/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u).toMatch(/^uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v[\d.]+$/);
    }
    expect(ciWorkflow).toContain("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1");
  });
});
