/**
 * CLG-FR-003 展示案例seed（离线确定性）：从 data/test-cases-from-transcripts.json
 * 经builder（与持久库117条同源）生成117条showcase_cases，并回填治理字段：
 * source_case_uid（归一化来源链）、jurisdiction_code=310000（权威来源归属）。
 *
 * 仅用于全新隔离测试库/验收库（持久库117条由任务2既有资产提供，
 * 来源链回填由治理apply在单事务内完成，不在此处覆盖）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db";
import { prepareShowcaseRows, type SourceShowcaseCase } from "./builder";
import { normalizeSourceCaseUid } from "@/lib/import/excel-import";

const DATA_FILE = path.join(process.cwd(), "data", "test-cases-from-transcripts.json");

export async function seedShowcaseCases(db: DbClient): Promise<number> {
  const records = JSON.parse(readFileSync(DATA_FILE, "utf-8")) as SourceShowcaseCase[];
  const rows = prepareShowcaseRows(records);

  await db.execute(sql`TRUNCATE showcase_cases RESTART IDENTITY`);
  for (const row of rows) {
    await db.execute(sql`
      INSERT INTO showcase_cases
        (case_uid, title, tags, user_message, ai_response, input_data, expected_data,
         category, is_published, sort_order, source_case_uid, jurisdiction_code)
      VALUES
        (${row.caseUid}, ${row.title}, ${JSON.stringify(row.tags)}::jsonb,
         ${row.userMessage}, ${row.aiResponse},
         ${JSON.stringify(row.inputData)}::jsonb, ${JSON.stringify(row.expectedData)}::jsonb,
         ${row.category}, ${row.isPublished}, ${row.sortOrder},
         ${normalizeSourceCaseUid(row.caseUid)}, '310000')`);
  }
  return rows.length;
}
