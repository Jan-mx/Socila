import { NextResponse } from "next/server";

import { checkDatabaseHealth } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await checkDatabaseHealth();
  return NextResponse.json(report, { status: report.status === "ok" ? 200 : 503 });
}
