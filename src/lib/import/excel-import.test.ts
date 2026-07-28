import path from "node:path";
import { describe, expect, it } from "vitest";

type ImportModule = {
  parseCaseRows?: (rows: unknown[], regressionCaseUids?: Iterable<string>) => unknown[];
  parseRegressionTestRows?: (rows: unknown[]) => unknown[];
  readCaseWorkbook?: (filePath: string, regressionCaseUids?: Iterable<string>) => unknown[];
  readRegressionWorkbook?: (filePath: string) => unknown[];
  normalizeSourceCaseUid?: (value: string) => string;
};

async function importer(): Promise<Required<ImportModule>> {
  const importerModule = (await import("./excel-import")) as ImportModule;
  expect(importerModule.parseCaseRows).toBeTypeOf("function");
  expect(importerModule.parseRegressionTestRows).toBeTypeOf("function");
  expect(importerModule.readCaseWorkbook).toBeTypeOf("function");
  expect(importerModule.readRegressionWorkbook).toBeTypeOf("function");
  expect(importerModule.normalizeSourceCaseUid).toBeTypeOf("function");
  return importerModule as Required<ImportModule>;
}

describe("Excel import mapping", () => {
  it("maps current and legacy case headers", async () => {
    const { parseCaseRows } = await importer();

    expect(parseCaseRows([
      { transcript_id: "current", topics: "retirement_age, pension_calc", transcript_text: "Current transcript" },
      { case_uid: "legacy", topics: "[\"legacy\", \"topic\"]", case_text: "Legacy case" },
    ])).toMatchObject([
      { caseUid: "current", topics: ["retirement_age", "pension_calc"], transcriptText: "Current transcript" },
      { caseUid: "legacy", topics: ["legacy", "topic"], caseText: "Legacy case" },
    ]);
  });

  it("normalizes topic values and rejects malformed case rows", async () => {
    const { parseCaseRows } = await importer();

    expect(parseCaseRows([{ transcript_id: "topics", topics: " a, b , , c " }, { transcript_id: "blank", topics: "" }]))
      .toMatchObject([{ topics: ["a", "b", "c"] }, { topics: null }]);
    expect(() => parseCaseRows([{ transcript_id: "missing-json", topics: "[not json]" }])).toThrow(/topics/i);
    expect(() => parseCaseRows([{ transcript_id: "" }])).toThrow(/row 1.*case.*id/i);
    expect(() => parseCaseRows([{ transcript_id: "duplicate" }, { case_uid: "duplicate" }])).toThrow(/duplicate.*case/i);
  });

  it("maps current and legacy regression headers with boolean expected results", async () => {
    const { parseRegressionTestRows } = await importer();

    expect(parseRegressionTestRows([
      { test_id: "current", source_case_uid: "case-04", profile_json: "{\"city\":\"Shanghai\"}", expected_needs_agent: "1" },
      { name: "legacy", source_case_uid: "legacy-case", input: "{\"age\": 60}", expected: "{\"calc\":{\"needs_agent\":false}}" },
    ])).toMatchObject([
      { name: "current", sourceCaseUid: "case-04", input: { city: "Shanghai" }, expected: { calc: { needs_agent: true } } },
      { name: "legacy", input: { age: 60 }, expected: { calc: { needs_agent: false } } },
    ]);
  });

  it("accepts only engine result namespaces in generic regression expectations", async () => {
    const { parseRegressionTestRows } = await importer();

    const expected = {
      user: { basic: { gender: "male" } },
      calc: { needs_agent: false },
      plan: { template_id: "T-DIRECT" },
    };
    expect(parseRegressionTestRows([
      { test_id: "structured", source_case_uid: "case-01", profile_json: "{}", expected: JSON.stringify(expected) },
    ])).toMatchObject([{ expected }]);

    expect(() => parseRegressionTestRows([
      { test_id: "legacy-root", source_case_uid: "case-02", profile_json: "{}", expected: "{\"needs_agent\":true}" },
    ])).toThrow(/row 1.*expected.*needs_agent/i);
    expect(() => parseRegressionTestRows([
      { test_id: "unknown-root", source_case_uid: "case-03", profile_json: "{}", expected: "{\"result\":true}" },
    ])).toThrow(/row 1.*expected.*result/i);
  });

  it("rejects malformed required regression fields and duplicate business keys", async () => {
    const { parseRegressionTestRows } = await importer();

    expect(() => parseRegressionTestRows([{ test_id: "missing-source", profile_json: "{}", expected_needs_agent: true }]))
      .toThrow(/row 1.*source.*case.*id/i);
    expect(() => parseRegressionTestRows([{ test_id: "bad-input", source_case_uid: "case-01", profile_json: "[]", expected_needs_agent: true }]))
      .toThrow(/input.*object/i);
    expect(() => parseRegressionTestRows([{ test_id: "bad-json", source_case_uid: "case-01", profile_json: "nope", expected_needs_agent: true }]))
      .toThrow(/input.*JSON/i);
    expect(() => parseRegressionTestRows([{ test_id: "bad-expected", source_case_uid: "case-01", profile_json: "{}", expected_needs_agent: "maybe" }]))
      .toThrow(/expected.*boolean/i);
    expect(() => parseRegressionTestRows([{ test_id: "duplicate", source_case_uid: "case-01", profile_json: "{}", expected_needs_agent: true }, { name: "duplicate", source_case_uid: "case-02", input: "{}", expected: "{}" }]))
      .toThrow(/duplicate.*test/i);
  });

  it("parses the repository workbooks with the expected identities and regression markings", async () => {
    const { readCaseWorkbook, readRegressionWorkbook, normalizeSourceCaseUid } = await importer();
    const dataDir = path.join(process.cwd(), "data");
    const regressionTests = readRegressionWorkbook(path.join(dataDir, "runnable_testdata_from_cases_v5.xlsx"));
    const caseIds = new Set(regressionTests.map((test) => normalizeSourceCaseUid((test as { sourceCaseUid: string }).sourceCaseUid)));
    const importedCases = readCaseWorkbook(path.join(dataDir, "independent_cases_with_full_transcripts_v5.xlsx"), caseIds);

    expect(importedCases).toHaveLength(851);
    expect(new Set(importedCases.map((item) => (item as { caseUid: string }).caseUid)).size).toBe(851);
    expect(regressionTests).toHaveLength(500);
    expect(new Set(regressionTests.map((item) => (item as { name: string }).name)).size).toBe(500);
    expect(importedCases.filter((item) => (item as { isRegression: boolean }).isRegression)).toHaveLength(451);
  });
});
