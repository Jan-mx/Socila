/**
 * Secret 门禁扫描器（FND-FR-010）。
 *
 * 用法：node scripts/scan-secrets.mjs [--all]
 *   默认扫描 Git 候选（staged + 未staged + 未忽略的 untracked 文件）——提交前门禁；
 *   --all 扫描全部跟踪文件——CI 门禁，保证仓库当前状态无密钥。
 *
 * 输出只包含文件路径与规则名，绝不输出匹配内容——防止密钥经日志泄漏。
 * 退出码：0=干净，1=存在命中（禁止提交/合并）。
 */
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const BINARY_EXT =
  /\.(png|jpe?g|gif|ico|woff2?|ttf|eot|xlsx?|pdf|zip|gz|7z|mp4|webm|mov)$/i;
const MAX_BYTES = 1_000_000;

/** 文件名规则：候选路径命中即违规（.env.example 与 *.example 除外）。 */
const NAME_RULES = [
  [/^\.env$/i, "env-file"],
  [/\.local\.env$/i, "local-env-file"],
  [/\.(pem|key)$/i, "key-or-cert-file"],
  [/(^|\/)id_rsa/i, "private-ssh-key-file"],
  [/(^|\/)credentials.*\.json$/i, "credentials-file"],
  [/(^|\/)secrets\./i, "secrets-file"],
  [/\.(dump|bak|backup|sql\.gz)$/i, "backup-or-dump-file"],
];

/** 内容规则：命中即违规。 */
const CONTENT_RULES = [
  [
    /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    "private-key-header",
  ],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, "api-key-literal-sk"],
  [/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b/, "github-token"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, "aws-access-key"],
  [
    /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"'\n]{8,}["']/i,
    "credential-assignment",
  ],
];

const isAllowedName = (p) => /\.example$/i.test(p);

function listCandidates() {
  const out = execSync("git status --porcelain", {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((l) => l.replace(/^..s?/, "").trim())
    .filter(Boolean);
}

function listTracked() {
  return execSync("git ls-files", {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

const files = process.argv.includes("--all")
  ? listTracked()
  : listCandidates();

const findings = [];
for (const file of files) {
  if (isAllowedName(file)) continue;
  for (const [re, name] of NAME_RULES) {
    if (re.test(file)) findings.push({ file, rule: name });
  }
  if (BINARY_EXT.test(file)) continue;
  let content;
  try {
    if (statSync(file).size > MAX_BYTES) continue;
    content = readFileSync(file, "utf8");
  } catch {
    continue; // 已删除或暂不可读的候选路径
  }
  for (const [re, name] of CONTENT_RULES) {
    if (re.test(content)) findings.push({ file, rule: name });
  }
}

if (findings.length > 0) {
  console.error(`[scan-secrets] 命中 ${findings.length} 项（内容不回显）：`);
  for (const f of findings) console.error(`  ${f.file} :: ${f.rule}`);
  process.exit(1);
}
console.log(
  `[scan-secrets] clean：${files.length} 个候选文件未命中任何密钥模式。`,
);
