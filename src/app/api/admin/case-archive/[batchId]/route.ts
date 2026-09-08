import { NextResponse } from "next/server";
import { caseArchiveReads } from "@/server/modules/case-governance/application";

export const dynamic = "force-dynamic";

/**
 * CLG-AC-012 归档条目元数据接口：只返回UID摘要/哈希/原因，
 * 归档表本身不保存原始转录正文，接口无法返回正文或dump。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await params;
    const batches = await caseArchiveReads.listBatches();
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) {
      return NextResponse.json({ error: "批次不存在" }, { status: 404 });
    }
    const entries = await caseArchiveReads.listBatchEntries(batchId);
    return NextResponse.json({ batch, entries });
  } catch {
    return NextResponse.json(
      { error: "加载归档条目失败" },
      { status: 500 },
    );
  }
}
