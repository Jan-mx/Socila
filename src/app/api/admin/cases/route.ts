import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema";
import { or, ilike, sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q") ?? "";
    const topic = searchParams.get("topic") ?? "";
    const pageStr = searchParams.get("page") ?? "1";
    const pageSizeStr = searchParams.get("pageSize") ?? "50";

    const page = Math.max(1, parseInt(pageStr, 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeStr, 10)));
    const offset = (page - 1) * pageSize;

    const whereClauses = [];

    if (q) {
      whereClauses.push(
        or(
          ilike(cases.caseUid, `%${q}%`),
          ilike(cases.caseText, `%${q}%`),
          ilike(cases.creator, `%${q}%`),
        ),
      );
    }

    if (topic) {
      whereClauses.push(sql`${cases.topics}::text ilike ${"%" + topic + "%"}`);
    }

    const whereExpr =
      whereClauses.length === 0
        ? undefined
        : whereClauses.length === 1
          ? whereClauses[0]
          : or(...whereClauses);

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(cases)
        .where(whereExpr)
        .orderBy(desc(cases.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(cases)
        .where(whereExpr),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);

    return NextResponse.json({
      cases: rows,
      total,
      page,
      pageSize,
    });
  } catch {
    return NextResponse.json(
      { error: "加载案例列表失败" },
      { status: 500 },
    );
  }
}
