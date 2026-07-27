import path from "path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, tests } from "@/lib/db/schema";

const DATA_DIR = path.join(process.cwd(), "data");

type SpreadsheetRow = Record<string, unknown>;

export interface ImportedCase {
  caseUid: string;
  creator: string | null;
  postDate: string | null;
  videoId: string | null;
  topics: string[] | null;
  caseText: string | null;
  transcriptText: string | null;
  tags: unknown;
  isRegression: boolean;
  sourceFile: string;
}

export interface ImportedRegressionTest {
  name: string;
  sourceCaseUid: string;
  ruleId: string | null;
  input: Record<string, unknown>;
  paramsOverride: unknown;
  expected: Record<string, unknown>;
  source: "regression";
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
}

function optionalText(value: unknown): string | null {
  return hasValue(value) ? String(value) : null;
}

function requireText(value: unknown, rowNumber: number, field: string): string {
  const text = optionalText(value)?.trim();
  if (!text) {
    throw new Error(`Row ${rowNumber}: missing ${field}`);
  }
  return text;
}

function parseOptionalJson(value: unknown): unknown {
  if (!hasValue(value)) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return String(value);
  }
}

function parseTopics(value: unknown, rowNumber: number): string[] | null {
  if (!hasValue(value)) return null;
  const normalize = (topics: unknown[]): string[] => {
    if (!topics.every((topic) => typeof topic === "string")) {
      throw new Error(`Row ${rowNumber}: topics must be a JSON string array`);
    }
    return topics.map((topic) => topic.trim()).filter(Boolean);
  };

  if (Array.isArray(value)) return normalize(value);
  const text = String(value).trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("not an array");
      }
      return normalize(parsed);
    } catch {
      throw new Error(`Row ${rowNumber}: topics contains invalid JSON array`);
    }
  }
  return text.split(",").map((topic) => topic.trim()).filter(Boolean);
}

function parseRequiredObject(value: unknown, rowNumber: number, field: string): Record<string, unknown> {
  let parsed = value;
  if (!hasValue(parsed)) {
    throw new Error(`Row ${rowNumber}: missing ${field}`);
  }
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error(`Row ${rowNumber}: ${field} contains invalid JSON`);
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Row ${rowNumber}: ${field} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseBoolean(value: unknown, rowNumber: number): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  throw new Error(`Row ${rowNumber}: expected_needs_agent must be a boolean`);
}

function addUniqueKey(keys: Set<string>, value: string, rowNumber: number, label: string): void {
  if (keys.has(value)) {
    throw new Error(`Row ${rowNumber}: duplicate ${label} business key '${value}'`);
  }
  keys.add(value);
}

export function normalizeSourceCaseUid(value: string): string {
  return value.replace(/-\d{2}$/, "");
}

export function parseCaseRows(rows: SpreadsheetRow[], regressionCaseUids: Iterable<string> = []): ImportedCase[] {
  const regressionIds = new Set(regressionCaseUids);
  const caseIds = new Set<string>();

  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const caseUid = requireText(row.transcript_id ?? row.case_uid, rowNumber, "case ID");
    addUniqueKey(caseIds, caseUid, rowNumber, "case");
    const legacyRegression = row.is_regression;
    const isRegression = regressionIds.has(caseUid) || legacyRegression === true || legacyRegression === 1 || legacyRegression === "1" || legacyRegression === "true";

    return {
      caseUid,
      creator: optionalText(row.creator),
      postDate: optionalText(row.post_date),
      videoId: optionalText(row.video_id),
      topics: parseTopics(row.topics, rowNumber),
      caseText: optionalText(row.case_text),
      transcriptText: optionalText(row.transcript_text),
      tags: parseOptionalJson(row.tags),
      isRegression,
      sourceFile: "independent_cases_with_full_transcripts_v5.xlsx",
    };
  });
}

export function parseRegressionTestRows(rows: SpreadsheetRow[]): ImportedRegressionTest[] {
  const testNames = new Set<string>();

  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const name = requireText(row.test_id ?? row.name, rowNumber, "test ID");
    const sourceCaseUid = requireText(row.source_case_uid, rowNumber, "source case ID");
    addUniqueKey(testNames, name, rowNumber, "test");
    const input = parseRequiredObject(row.profile_json ?? row.input, rowNumber, "input");
    const expected = hasValue(row.expected_needs_agent)
      ? { needs_agent: parseBoolean(row.expected_needs_agent, rowNumber) }
      : parseRequiredObject(row.expected, rowNumber, "expected");

    return {
      name,
      sourceCaseUid,
      ruleId: optionalText(row.rule_id),
      input,
      paramsOverride: parseOptionalJson(row.params_override),
      expected,
      source: "regression",
    };
  });
}

function readWorkbookRows(filePath: string): SpreadsheetRow[] {
  const workbook = XLSX.read(readFileSync(filePath), { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error(`Workbook has no worksheets: ${filePath}`);
  }
  return XLSX.utils.sheet_to_json<SpreadsheetRow>(workbook.Sheets[firstSheet], { defval: null });
}

export function readCaseWorkbook(filePath: string, regressionCaseUids: Iterable<string> = []): ImportedCase[] {
  return parseCaseRows(readWorkbookRows(filePath), regressionCaseUids);
}

export function readRegressionWorkbook(filePath: string): ImportedRegressionTest[] {
  return parseRegressionTestRows(readWorkbookRows(filePath));
}

export async function importCases() {
  const regressionTests = readRegressionWorkbook(path.join(DATA_DIR, "runnable_testdata_from_cases_v5.xlsx"));
  const regressionCaseUids = new Set(regressionTests.map((test) => normalizeSourceCaseUid(test.sourceCaseUid)));
  const importedCases = readCaseWorkbook(
    path.join(DATA_DIR, "independent_cases_with_full_transcripts_v5.xlsx"),
    regressionCaseUids,
  );

  console.log(`Importing ${importedCases.length} cases from Excel...`);
  for (const data of importedCases) {
    const existing = await db.select({ id: cases.id }).from(cases).where(eq(cases.caseUid, data.caseUid)).limit(1);
    if (existing.length > 0) {
      await db.update(cases).set({ ...data, updatedAt: new Date() }).where(eq(cases.caseUid, data.caseUid));
    } else {
      await db.insert(cases).values(data);
    }
  }
  console.log(`Cases imported: ${importedCases.length}`);
}

export async function importRegressionTests() {
  const importedTests = readRegressionWorkbook(path.join(DATA_DIR, "runnable_testdata_from_cases_v5.xlsx"));

  console.log(`Importing ${importedTests.length} regression tests from Excel...`);
  for (const importedTest of importedTests) {
    const data = {
      name: importedTest.name,
      ruleId: importedTest.ruleId,
      input: importedTest.input,
      paramsOverride: importedTest.paramsOverride,
      expected: importedTest.expected,
      source: importedTest.source,
    };
    const existing = await db.select({ id: tests.id }).from(tests).where(eq(tests.name, data.name)).limit(1);
    if (existing.length > 0) {
      await db.update(tests).set({ ...data, updatedAt: new Date() }).where(eq(tests.name, data.name));
    } else {
      await db.insert(tests).values(data);
    }
  }
  console.log(`Regression tests imported: ${importedTests.length}`);
}
