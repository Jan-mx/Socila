import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ShowcaseModule = {
  prepareShowcaseRows?: (records: unknown[]) => unknown[];
  filterHighQualityCases?: (records: unknown[]) => unknown[];
  isFallbackOnly?: (arguments_: string[]) => boolean;
};

async function builder(): Promise<Required<ShowcaseModule>> {
  const builderModule = await import("./builder").catch(() => ({} as ShowcaseModule));
  expect(builderModule.prepareShowcaseRows).toBeTypeOf("function");
  expect(builderModule.filterHighQualityCases).toBeTypeOf("function");
  expect(builderModule.isFallbackOnly).toBeTypeOf("function");
  return builderModule as Required<ShowcaseModule>;
}

describe("showcase builder", () => {
  it("prepares deterministic fallback rows from repository source data", async () => {
    const { filterHighQualityCases, prepareShowcaseRows } = await builder();
    const records = JSON.parse(readFileSync(path.join(process.cwd(), "data", "test-cases-from-transcripts.json"), "utf8"));

    const highQuality = filterHighQualityCases(records);
    const rows = prepareShowcaseRows(records);

    expect(records).toHaveLength(308);
    expect(highQuality).toHaveLength(233);
    expect(rows).toHaveLength(117);
    expect(new Set(rows.map((row) => (row as { caseUid: string }).caseUid)).size).toBe(117);
    for (const row of rows as Array<{ caseUid: string; title: string; tags: string[]; userMessage: string; aiResponse: string }>) {
      expect(row.caseUid).not.toBe("");
      expect(row.title).not.toBe("");
      expect(row.tags.length).toBeGreaterThan(0);
      expect(row.userMessage).not.toBe("");
      expect(row.aiResponse).not.toBe("");
    }
  });

  it("uses gender, birth year, and employment status for deduplication", async () => {
    const { prepareShowcaseRows } = await builder();
    const source = [
      { case_uid: "first", input: { basic: { gender: "female", birth_year: 1980 }, status: { employment_status: "employed" } }, expected: { retire_age: "55" }, case_text_excerpt: "x".repeat(101) },
      { case_uid: "duplicate", input: { basic: { gender: "female", birth_year: 1980 }, status: { employment_status: "employed" } }, expected: { retire_age: "55" }, case_text_excerpt: "x".repeat(101) },
      { case_uid: "other-status", input: { basic: { gender: "female", birth_year: 1980 }, status: { employment_status: "flexible" } }, expected: { retire_age: "55" }, case_text_excerpt: "x".repeat(101) },
    ];

    expect(prepareShowcaseRows(source).map((row) => (row as { caseUid: string }).caseUid)).toEqual(["first", "other-status"]);
  });

  it("recognizes fallback-only generation without enabling LLM mode", async () => {
    const { isFallbackOnly } = await builder();

    expect(isFallbackOnly(["node", "script.ts", "--fallback-only"])).toBe(true);
    expect(isFallbackOnly(["node", "script.ts", "--strict-llm"])).toBe(false);
  });
});
