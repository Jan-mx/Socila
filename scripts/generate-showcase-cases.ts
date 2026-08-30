/**
 * Batch generate showcase cases from test-cases-from-transcripts.json.
 *
 * Usage:
 *   npx tsx scripts/generate-showcase-cases.ts [--fallback-only] [--strict-llm]
 */

import "../src/lib/env/load-environment";
import { assertLocalDatabaseUrl } from "../src/lib/db/guard";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getOpenAIConfig } from "../src/lib/ai/config";
import { createShowcaseLlmRuntime } from "../src/lib/showcase/runtime";
import {
  filterHighQualityCases,
  isFallbackOnly,
  prepareShowcaseRows,
  type SourceShowcaseCase,
} from "../src/lib/showcase/builder";

const DATABASE_URL = assertLocalDatabaseUrl();
if (!DATABASE_URL) {
  process.stderr.write("DATABASE_URL not set\n");
  process.exit(1);
}

const fallbackOnly = isFallbackOnly(process.argv);
const requireLlmOnly = process.env.SHOWCASE_REQUIRE_LLM === "1" || process.argv.includes("--strict-llm");
if (fallbackOnly && requireLlmOnly) {
  process.stderr.write("--fallback-only cannot be combined with --strict-llm\n");
  process.exit(1);
}

function getOpenAIConfigOrExit() {
  try {
    return getOpenAIConfig();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

const llmRuntime = createShowcaseLlmRuntime(fallbackOnly, {
  getConfig: getOpenAIConfigOrExit,
  createClient: (config) => createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL }),
  setupStream: () => streamText,
});
const { config: llmConfig, client: openai, stream } = llmRuntime;
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool });

const SYSTEM_PROMPT = `你是"社保规划助手"，专注于上海社保规划。请基于用户信息和参考预期结果，生成一份可执行、无占位符的方案。

输出格式要求（Markdown）：

**结论**
- [一句话结论，不超过30字]

**关键数字**
- 推荐退休节点：[日期 + 年龄]
- 养老缺口：[X个月，<=0写已满足]
- 医保终身缺口：[X个月，缺失写“暂无数据（需补充医保月数）”]
- 可领失业金：[X个月，仅在适用时展示]

**你现在要做（0-30天）**
1. [动作 + 时间点 + 目的]
2. [动作 + 时间点 + 目的]
3. [动作 + 时间点 + 目的]

**路径对比**
- [方案A：退休节点、缺口、成本、补贴节省]
- [方案B：退休节点、缺口、成本、补贴节省]

**推荐路径时间线**
1. [年龄段]：[动作]
2. [年龄段]：[动作]
3. [退休节点]：[办理退休]

**补贴机会**
- [补贴名称]：[可申请/待确认/暂不符合]
  - 申请时机：[timing]
  - 预估金额：[金额或“暂无数据”]
  - 首步动作：[action_steps第一条]

**注意事项**
- [政策边界 + 风险提醒]
- 政策数据截至 [日期]，以官方最新发布为准

硬性约束：
- 禁止输出任何占位符： [X]、待定、TBD、...
- 只能使用给定上下文中的数字，不得编造。
- 缺失值统一写“暂无数据（需补充xxx）”。`;

async function generateAiResponse(userMessage: string, testCase: SourceShowcaseCase): Promise<string> {
  if (!openai || !llmConfig || !stream) throw new Error("LLM generation is disabled in fallback-only mode");
  const contextInfo = `
用户基本信息：
- 性别：${testCase.input.basic.gender === "female" ? "女" : "男"}
- 出生年份：${testCase.input.basic.birth_year}
${testCase.input.basic.birth_month ? `- 出生月份：${testCase.input.basic.birth_month}` : ""}
${testCase.input.basic.female_retire_type ? `- 退休口径：${testCase.input.basic.female_retire_type === "worker50" ? "工人50岁" : "管理岗55岁"}` : ""}
${testCase.input.social?.pension_contrib_months ? `- 养老已缴月数：${testCase.input.social.pension_contrib_months}` : ""}
${testCase.input.social?.pension_contrib_years ? `- 养老已缴年数：${testCase.input.social.pension_contrib_years}` : ""}
${testCase.input.status?.employment_status ? `- 就业状态：${testCase.input.status.employment_status}` : ""}

参考预期结果（来自真实案例数据）：
${testCase.expected.retire_age ? `- 退休年龄：${testCase.expected.retire_age}` : ""}
${testCase.expected.retire_date ? `- 退休日期：${testCase.expected.retire_date}` : ""}
${testCase.expected.min_contrib_years ? `- 最低缴费年限：${testCase.expected.min_contrib_years}年` : ""}
${testCase.expected.monthly_cost ? `- 月缴费：${testCase.expected.monthly_cost}元` : ""}
${testCase.expected.pension_amount ? `- 养老金：${testCase.expected.pension_amount}元/月` : ""}
${testCase.expected.subsidy_4050 ? "- 可享4050补贴" : ""}
${testCase.expected.subsidy_daling ? "- 可享大龄补贴" : ""}

原始案例文本参考：
${testCase.case_text_excerpt.slice(0, 500)}
`;
  const result = stream({
    model: openai(llmConfig.model),
    system: SYSTEM_PROMPT,
    prompt: `${userMessage}\n\n---\n以下是补充上下文（不要直接引用，仅作参考）：\n${contextInfo}`,
    maxOutputTokens: 1500,
  });
  let text = "";
  for await (const delta of result.textStream) text += delta;
  return text.trim();
}

async function generateAiResponseWithRetry(userMessage: string, testCase: SourceShowcaseCase, maxAttempts = 3): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateAiResponse(userMessage, testCase);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      process.stderr.write(`Retry ${attempt}/${maxAttempts - 1} for ${testCase.case_uid} after error: ${err instanceof Error ? err.message : String(err)}\n`);
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw lastError;
}

function hasPlaceholderText(text: string): boolean {
  return text.includes("[X]") || text.includes("待定") || text.includes("TBD") || text.includes("...");
}

async function main() {
  const allCases = JSON.parse(readFileSync(resolve(__dirname, "../data/test-cases-from-transcripts.json"), "utf-8")) as SourceShowcaseCase[];
  const highQuality = filterHighQualityCases(allCases);
  const preparedRows = prepareShowcaseRows(allCases);
  process.stdout.write(`Loaded ${allCases.length} cases, ${highQuality.length} high quality\n`);
  process.stdout.write(`After dedup: ${preparedRows.length} unique cases\n`);

  let llmSuccess = 0;
  let llmFailed = 0;
  let fallbackUsed = fallbackOnly ? preparedRows.length : 0;
  if (!fallbackOnly) {
    const BATCH_SIZE = 5;
    for (let i = 0; i < preparedRows.length; i += BATCH_SIZE) {
      const batch = preparedRows.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (row) => {
        try {
          const aiResponse = await generateAiResponseWithRetry(row.userMessage, row.sourceCase, 3);
          if (hasPlaceholderText(aiResponse)) {
            if (requireLlmOnly) throw new Error(`placeholder content returned for ${row.caseUid} in strict mode`);
            process.stderr.write(`Generated placeholder for ${row.caseUid}, fallback template used.\n`);
            llmFailed++;
            fallbackUsed++;
          } else {
            row.aiResponse = aiResponse;
            llmSuccess++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Failed for ${row.caseUid}: ${message}\n`);
          llmFailed++;
          if (requireLlmOnly) throw err;
          fallbackUsed++;
        }
      }));
      process.stdout.write(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(preparedRows.length / BATCH_SIZE)}: generated ${Math.min(i + BATCH_SIZE, preparedRows.length)}/${preparedRows.length}\n`);
    }
  }
  process.stdout.write(`LLM summary: success=${llmSuccess}, failed=${llmFailed}, fallback=${fallbackUsed}\n`);
  if (requireLlmOnly && fallbackUsed > 0) throw new Error(`strict mode failed: fallback used ${fallbackUsed} times, abort writing`);

  const existingResult = await db.execute(sql`SELECT count(*) as cnt FROM showcase_cases`);
  const existingCount = Number((existingResult.rows[0] as { cnt: number }).cnt);
  if (existingCount > 0) {
    process.stdout.write(`DB already has ${existingCount} showcase cases. Clearing...\n`);
    await db.execute(sql`TRUNCATE showcase_cases RESTART IDENTITY`);
  }
  for (const row of preparedRows) {
    await db.execute(sql`INSERT INTO showcase_cases (case_uid, title, tags, user_message, ai_response, input_data, expected_data, category, is_published, sort_order)
      VALUES (${row.caseUid}, ${row.title}, ${JSON.stringify(row.tags)}::jsonb, ${row.userMessage}, ${row.aiResponse}, ${JSON.stringify(row.inputData)}::jsonb, ${JSON.stringify(row.expectedData)}::jsonb, ${row.category}, ${row.isPublished}, ${row.sortOrder})`);
  }
  process.stdout.write(`\n=== Complete: ${preparedRows.length} showcase cases inserted ===\n`);
  await pool.end();
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
