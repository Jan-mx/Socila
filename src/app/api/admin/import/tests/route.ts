import { rulesWrites } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未提供导入文件" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rows: Record<string, unknown>[] = [];

    const filename = file.name.toLowerCase();
    if (filename.endsWith(".json")) {
      const text = buffer.toString("utf-8");
      const data = JSON.parse(text);
      rows = Array.isArray(data) ? data : [data];
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet);
    } else {
      return NextResponse.json(
        { error: "不支持的文件格式，请使用 .json 或 .xlsx 文件" },
        { status: 400 },
      );
    }

    const testData = rows.map((row) => ({
      name: (row.name as string) ?? "Imported test",
      ruleId: (row.rule_id as string) ?? null,
      input: (row.input as Record<string, unknown>) ?? {},
      paramsOverride: (row.params_override as Record<string, unknown>) ?? null,
      expected: (row.expected as Record<string, unknown>) ?? {},
      source: "import",
    }));

    const inserted = await rulesWrites.insertTests(testData);
    return NextResponse.json({ inserted: inserted.length, tests: inserted });
  } catch {
    return NextResponse.json(
      { error: "导入测试失败" },
      { status: 500 },
    );
  }
}
