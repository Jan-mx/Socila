/**
 * CLG-FR-002/003/004 治理Schema落库（migration 0016）：
 * - cases新增jurisdiction/content_hash/quality_score/quality_status/governance_reason/governed_at；
 * - showcase_cases新增jurisdiction/source_case_uid/snapshot_id/quality/content_hash/curated_at/curated_by；
 * - tests新增source_case_uid；
 * - case_archive_batches/case_archive_entries两张归档表+CHECK约束+索引。
 *
 * Red：migration 0016未实现时，以下information_schema查询全部应为空/失败；
 * Green：0016应用后全部存在，重复迁移幂等（drizzle journal自动跳过）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

beforeAll(() => {
  if (!DRILL_URL) {
    throw new Error("SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库");
  }
  process.env.DATABASE_URL = DRILL_URL;
});

async function hasColumn(table: string, column: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}`);
  return result.rowCount === 1;
}

async function hasConstraint(table: string, constraint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = ${table} AND c.conname = ${constraint}`);
  return result.rowCount === 1;
}

async function hasIndex(indexName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM pg_indexes WHERE indexname = ${indexName}`);
  return result.rowCount === 1;
}

async function hasTable(table: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM information_schema.tables WHERE table_name = ${table}`);
  return result.rowCount === 1;
}

describe("CLG-FR-002 cases治理字段", () => {
  it("cases新增地区/内容哈希/质量分/质量状态/原因/治理时间", async () => {
    for (const col of [
      "jurisdiction_code",
      "content_hash",
      "quality_score",
      "quality_status",
      "governance_reason",
      "governed_at",
    ]) {
      expect(await hasColumn("cases", col), `cases.${col}`).toBe(true);
    }
  });

  it("cases.quality_status CHECK枚举 eligible/active/archive_candidate/quarantined", async () => {
    expect(await hasConstraint("cases", "cases_quality_status_check")).toBe(true);
  });
});

describe("CLG-FR-003 showcase_cases治理字段", () => {
  it("showcase新增地区/来源案例UID/候选快照ID/质量信息/内容哈希/策展时间与策展人", async () => {
    for (const col of [
      "jurisdiction_code",
      "source_case_uid",
      "snapshot_id",
      "quality_score",
      "quality_status",
      "content_hash",
      "curated_at",
      "curated_by",
    ]) {
      expect(await hasColumn("showcase_cases", col), `showcase_cases.${col}`).toBe(true);
    }
  });

  it("showcase.quality_status CHECK枚举 selected/archive_candidate/quarantined", async () => {
    expect(await hasConstraint("showcase_cases", "showcase_cases_quality_status_check")).toBe(true);
  });

  it("showcase.snapshot_id可引用policy_snapshots（候选快照绑定）", async () => {
    expect(await hasConstraint("showcase_cases", "showcase_cases_snapshot_id_fkey")).toBe(true);
  });
});

describe("CLG-FR-004 tests来源链列", () => {
  it("tests新增source_case_uid", async () => {
    expect(await hasColumn("tests", "source_case_uid")).toBe(true);
  });
});

describe("CLG-FR-013 归档元数据表", () => {
  it("case_archive_batches与case_archive_entries存在", async () => {
    expect(await hasTable("case_archive_batches")).toBe(true);
    expect(await hasTable("case_archive_entries")).toBe(true);
  });

  it("批次状态CHECK prepared/restore_verified/applied/rolled_back", async () => {
    expect(await hasConstraint("case_archive_batches", "case_archive_batches_status_check")).toBe(true);
  });

  it("条目实体类型CHECK case/showcase_case", async () => {
    expect(await hasConstraint("case_archive_entries", "case_archive_entries_entity_type_check")).toBe(true);
  });
});

describe("0016治理所需索引", () => {
  it("cases质量状态+地区索引存在", async () => {
    expect(await hasIndex("cases_jurisdiction_quality_status_idx")).toBe(true);
  });
  it("showcase质量状态索引存在", async () => {
    expect(await hasIndex("showcase_cases_quality_status_idx")).toBe(true);
  });
  it("归档条目按批次索引存在", async () => {
    expect(await hasIndex("case_archive_entries_batch_idx")).toBe(true);
  });
});

describe("0016幂等与journal", () => {
  it("drizzle journal包含0016且为最后一个条目（Task4预留编号）", async () => {
    const meta = await import("../../../../../drizzle/meta/_journal.json");
    const entries = (meta as { entries: Array<{ idx: number; tag: string }> }).entries;
    const last = entries[entries.length - 1];
    expect(last.tag).toMatch(/^0016_/);
  });
});