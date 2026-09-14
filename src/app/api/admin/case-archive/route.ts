import { NextResponse } from "next/server";
import { caseArchiveReads } from "@/server/modules/case-governance/application";

export const dynamic = "force-dynamic";

/**
 * CLG-AC-012 归档管理接口：只返回批次与哈希元数据。
 * 不返回dump路径之外的正文或下载URL；归档表本身不保存原始转录正文。
 */
export async function GET() {
  try {
    const batches = await caseArchiveReads.listBatches();
    return NextResponse.json({ batches });
  } catch {
    return NextResponse.json(
      { error: "加载归档批次失败" },
      { status: 500 },
    );
  }
}

export async function POST() {
  // 归档创建走本地受控脚本（govern-case-library.ts），不提供普通用户写入口。
  return NextResponse.json(
    { error: "归档创建仅限本地受控脚本执行" },
    { status: 403 },
  );
}
