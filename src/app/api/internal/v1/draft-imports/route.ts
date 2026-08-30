/**
 * Route Handler 薄适配层（DRF-FR-013/014）：Agent → Core 的唯一 draft 导入入口。
 * 服务身份由内网 + X-Service-Name（阶段07升级为 ADR-0005 服务 JWT）验证。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  MaterializationRejected,
  materializeDraftBundle,
  parseAndReject,
} from "@/server/modules/agent-integration/application/materialize";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const serviceName = req.headers.get("x-service-name");
  if (serviceName !== "agent-runtime") {
    return NextResponse.json(
      { error: "unknown service identity" },
      { status: 401 },
    );
  }
  try {
    const raw = await req.json();
    const bundle = parseAndReject(raw);
    const result = await materializeDraftBundle(
      bundle,
      `agent-runtime:${bundle.proposal_id}`,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof MaterializationRejected) {
      return NextResponse.json(
        { error: err.reason, detail: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
