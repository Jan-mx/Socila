/**
 * SiliconFlow 配置验证流程（FND-FR-008）。
 *
 * 读取被忽略的 local 配置（默认 docs/refactor/policy-ops-agent/config/siliconflow.local.env），
 * 只输出状态：文件存在性、Git 忽略状态、密钥是否已设置（布尔值，绝不输出密钥内容）、
 * 模型与维度等非敏感配置。真实 API 调用验证（/models、embedding、rerank、异常路径）
 * 属步骤 05.7，本脚本不发起网络请求。
 *
 * 用法：node scripts/validate-siliconflow.mjs [local-env路径]
 * 退出码：0=配置就绪（存在、被忽略、密钥已设置），1=未就绪。
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const file =
  process.argv[2] ??
  "docs/refactor/policy-ops-agent/config/siliconflow.local.env";

const result = {
  file,
  exists: existsSync(file),
  gitIgnored: false,
  apiKeySet: false,
  baseUrl: null,
  embeddingModel: null,
  embeddingDimensions: null,
  rerankModel: null,
};

if (result.exists) {
  try {
    execSync(`git check-ignore -q ${JSON.stringify(file)}`);
    result.gitIgnored = true;
  } catch {
    result.gitIgnored = false;
  }

  const config = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) config[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  result.apiKeySet = (config.SILICONFLOW_API_KEY ?? "").trim().length > 0;
  result.baseUrl = config.SILICONFLOW_BASE_URL ?? null;
  result.embeddingModel = config.SILICONFLOW_EMBEDDING_MODEL ?? null;
  result.embeddingDimensions = config.SILICONFLOW_EMBEDDING_DIMENSIONS ?? null;
  result.rerankModel = config.SILICONFLOW_RERANK_MODEL ?? null;
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.exists && result.gitIgnored && result.apiKeySet ? 0 : 1);
