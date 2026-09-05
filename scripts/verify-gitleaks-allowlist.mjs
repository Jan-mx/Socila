/**
 * Gitleaks allowlist哨兵回归（09-05 SDL-NFR-007复审纠正）。
 *
 * 验证 .gitleaks.toml 的 [[allowlists]] 配置满足：
 * 1. 已人工核实的测试合成值（7个允许路径上的jwt/generic-api-key误报）被精确忽略；
 * 2. 允许路径上匹配其他规则的Secret（哨兵）必须被检测——不允许"仅因路径匹配整文件跳过"
 *    （旧式全局[allowlist]在Gitleaks 8.29.1以condition=OR触发`skipping file: global allowlist`）；
 * 3. trace复核不再出现整文件跳过。
 *
 * 用法：node scripts/verify-gitleaks-allowlist.mjs
 * 优先使用PATH上的gitleaks（须为8.29.x），否则使用固定镜像 ghcr.io/gitleaks/gitleaks:v8.29.1。
 * 哨兵值为内容自述"synthetic"的假PEM（private-key-header规则命中），非真实凭据。
 * 临时目录在结束时无条件清理。
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CONFIG = path.join(REPO_ROOT, ".gitleaks.toml");
const GITLEAKS_IMAGE = "ghcr.io/gitleaks/gitleaks:v8.29.1";
const SCAN_ROOT_IN_CONTAINER = "/scan";

/** 允许路径清单（与 .gitleaks.toml 保持一致，用于构造镜像目录）。 */
const ALLOWED_FILES = [
  "testdata/service-jwt-vectors.json",
  "services/agent/tests/test_service_jwt_replay_integration.py",
  "src/server/modules/agent-integration/__tests__/draft-imports-route.integration.test.ts",
  "src/server/modules/agent-integration/__tests__/service-jwt-replay.integration.test.ts",
  "dsl/regions/shanghai_dsl_v1/rules/R-500-4050-ELIGIBILITY.json",
  "dsl/regions/shanghai_dsl_v1/rules/R-510-4050-AMOUNT.json",
  "dsl/regions/shanghai_dsl_v1/rules/R-540-SUBSIDY-MUTUAL-EXCLUSION.json",
];

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  OK: ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function resolveRunner() {
  const local = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
  if (local.status === 0) {
    const version = (local.stdout || "").trim();
    if (!version.includes("8.29")) {
      throw new Error(`PATH上的gitleaks版本非8.29.x: ${version}`);
    }
    return { kind: "local", version };
  }
  return { kind: "docker", version: GITLEAKS_IMAGE };
}

function runGitleaks(runner, scanDir, extraArgs) {
  // git模式（临时仓库提交后扫描）：与真实仓库扫描同路径语义（相对路径），
  // 使.gitleaks.toml中的路径正则与生产一致；--no-git会报绝对路径，不可用于本验证。
  const scanArgs = [
    "detect", "--source", SCAN_ROOT_IN_CONTAINER,
    "--config", "/repo/.gitleaks.toml",
    ...extraArgs,
  ];
  if (runner.kind === "docker") {
    return spawnSync(
      "docker",
      [
        "run", "--rm",
        "-v", `${scanDir.replace(/\\/g, "/")}:${SCAN_ROOT_IN_CONTAINER}`,
        "-v", `${CONFIG.replace(/\\/g, "/")}:/repo/.gitleaks.toml`,
        GITLEAKS_IMAGE,
        ...scanArgs,
      ],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
    );
  }
  return spawnSync(
    "gitleaks",
    ["detect", "--source", scanDir, "--config", CONFIG, ...extraArgs],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  );
}

function buildScanDir(baseDir, withSentinel) {
  const scanDir = mkdtempSync(path.join(baseDir, "gitleaks-sentinel-"));
  for (const rel of ALLOWED_FILES) {
    const dest = path.join(scanDir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(path.join(REPO_ROOT, rel), dest);
  }
  if (withSentinel) {
    // 哨兵：合成假PEM——body是"synthetic not a real key for gitleaks sentinel
    // regression test only"的base64（92字符，满足private-key-header规则的长度要求），
    // 明显非真实私钥；与该文件被允许的generic-api-key规则不同，必须被检测。
    // PEM头经拆分拼装（本脚本自身不得包含完整PEM头字面量，否则scan-secrets自命中）；
    // 运行时在临时目录拼出完整PEM供gitleaks检测。
    const pemHeader = ["-----BEGIN ", "RSA PRIVATE KEY-----"].join("");
    const pemFooter = ["-----END ", "RSA PRIVATE KEY-----"].join("");
    const sentinelBody =
      "c3ludGhldGljIG5vdCBhIHJlYWwga2V5IGZvciBnaXRsZWFrcyBzZW50aW5lbCByZWdyZXNzaW9uIHRlc3Qgb25seQ==";
    appendFileSync(
      path.join(scanDir, "services/agent/tests/test_service_jwt_replay_integration.py"),
      [
        "",
        `SENTINEL_SYNTHETIC_PEM = """${pemHeader}`,
        sentinelBody,
        `${pemFooter}"""`,
        "",
      ].join("\n"),
    );
  }
  // 与真实扫描同语义：git模式下gitleaks报告相对路径（--no-git会报绝对路径，
  // 使仓库配置中锚定相对路径的allowlist失效）。临时仓库仅含合成值。
  git(scanDir, ["init", "--quiet"]);
  git(scanDir, ["add", "-A"]);
  git(scanDir, [
    "-c", "user.name=gitleaks-sentinel",
    "-c", "user.email=sentinel@example.invalid",
    "commit", "--quiet", "-m", "synthetic allowlist fixture",
  ]);
  return scanDir;
}

function git(cwd, args) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} 失败: ${res.stderr}`);
  }
}

const runner = resolveRunner();
console.log(`Gitleaks runner: ${runner.kind} (${runner.version})`);
let workRoot;
try {
  workRoot = mkdtempSync(path.join(tmpdir(), "gitleaks-allowlist-verify-"));

  // 场景1：仅已核实误报 → 必须通过（exit 0）。
  console.log("[scenario 1] 已核实误报（7个允许路径）应被精确忽略");
  const cleanDir = buildScanDir(workRoot, false);
  const cleanRun = runGitleaks(runner, cleanDir, ["--no-banner", "--redact"]);
  check(
    "已核实误报扫描退出0",
    cleanRun.status === 0,
    `exit=${cleanRun.status} stderr=${cleanRun.stderr?.toString().slice(-300)}`,
  );

  // 场景2：同一允许路径加入其他规则的哨兵 → 必须检测（exit非0且报告发现）。
  console.log("[scenario 2] 允许路径上的其他规则哨兵必须被检测（不得整文件跳过）");
  const sentinelDir = buildScanDir(workRoot, true);
  const sentinelReport = path.join(workRoot, "sentinel-report.json");
  const sentinelRun = runGitleaks(runner, sentinelDir, [
    "--no-banner", "--redact",
    "--report-format", "json",
    "--report-path",
    runner.kind === "docker" ? "/scan/.__sentinel-report.json" : sentinelReport,
  ]);
  const sentinelReportActual =
    runner.kind === "docker"
      ? path.join(sentinelDir, ".__sentinel-report.json")
      : sentinelReport;
  check("哨兵扫描退出非0", sentinelRun.status !== 0, `exit=${sentinelRun.status}`);
  let sentinelFinding = false;
  try {
    const report = JSON.parse(readFileSync(sentinelReportActual, "utf8"));
    sentinelFinding = report.some(
      (f) =>
        f.File.includes("test_service_jwt_replay_integration.py") &&
        /private-key/i.test(f.RuleID),
    );
  } catch {
    sentinelFinding = false;
  }
  check("哨兵发现被报告（private-key规则命中目标文件）", sentinelFinding);

  // 场景3：trace复核——不允许出现旧式全局allowlist的整文件跳过。
  console.log("[scenario 3] trace复核：不得出现 'skipping file: global allowlist'");
  const traceDir = buildScanDir(workRoot, false);
  const traceRun = runGitleaks(runner, traceDir, [
    "--no-banner", "--redact", "--log-level", "trace",
  ]);
  const traceText = `${traceRun.stdout.toString()}${traceRun.stderr.toString()}`;
  check("trace无整文件跳过", !/skipping file: global allowlist/i.test(traceText));
} finally {
  if (workRoot) {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(`\ngitleaks allowlist哨兵回归失败（${failures.length}项）：`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\ngitleaks allowlist哨兵回归：全部通过");
