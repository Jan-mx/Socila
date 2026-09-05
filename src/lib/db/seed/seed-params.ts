import fs from "fs";
import { db } from "@/lib/db";
import { params } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { DiscoveredRegion } from "@/lib/dsl/region-manifest";
import { parseOverlayOperation } from "@/lib/dsl/overlay-operation";

interface ScalarParamEntry {
  param_id: string;
  type: "number" | "boolean" | "string" | "array";
  value: unknown;
  unit?: string;
  effective_from?: string;
  source?: string;
  operation?: string;
  target_business_key?: string | null;
}

interface TableParamEntry {
  param_id: string;
  type: "table" | "timeline";
  effective_from?: string;
  key_fields: string[];
  value_fields: string[];
  rows: unknown[];
  note?: string;
  source?: string;
  operation?: string;
  target_business_key?: string | null;
}

interface PolicyPackFile {
  policy_pack_id: string;
  as_of: string;
  params: ScalarParamEntry[];
  tables: TableParamEntry[];
}

/**
 * 按地区Manifest装载参数包（SDL-FR-004）：参数文件与地区代码来自
 * DiscoveredRegion，装载器不硬编码地区目录或行政区划。
 */
export async function seedParams(region: DiscoveredRegion) {
  const raw = fs.readFileSync(region.paramsPath, "utf-8");
  const pack: PolicyPackFile = JSON.parse(raw);
  const policyPackId = pack.policy_pack_id;
  const jurisdictionCode = region.manifest.jurisdiction_code;

  console.log(`Seeding params for policy pack: ${policyPackId}...`);

  // Seed scalar params
  for (const p of pack.params) {
    const overlay = parseOverlayOperation(
      "param",
      p.param_id,
      p.operation,
      p.target_business_key,
      jurisdictionCode,
    );
    const existing = await db
      .select({ id: params.id })
      .from(params)
      .where(
        and(
          eq(params.jurisdictionCode, jurisdictionCode),
          eq(params.paramId, p.param_id),
          eq(params.policyPackId, policyPackId),
          eq(params.version, 1),
        ),
      )
      .limit(1);

    const data = {
      policyPackId,
      jurisdictionCode,
      businessKey: p.param_id,
      paramId: p.param_id,
      type: p.type,
      value: p.value,
      unit: p.unit ?? null,
      effectiveFrom: p.effective_from ?? pack.as_of,
      source: p.source ?? null,
      keyFields: null,
      valueFields: null,
      rows: null,
      note: null,
      version: 1,
      status: "published",
      operation: overlay.operation,
      targetBusinessKey: overlay.targetBusinessKey,
    };

    if (existing.length > 0) {
      await db
        .update(params)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(params.jurisdictionCode, jurisdictionCode),
            eq(params.paramId, p.param_id),
            eq(params.policyPackId, policyPackId),
            eq(params.version, 1),
          ),
        );
      console.log(`  Updated param: ${p.param_id}`);
    } else {
      await db.insert(params).values(data);
      console.log(`  Inserted param: ${p.param_id}`);
    }
  }

  // Seed table params
  for (const t of pack.tables) {
    const overlay = parseOverlayOperation(
      "param",
      t.param_id,
      t.operation,
      t.target_business_key,
      jurisdictionCode,
    );
    const existing = await db
      .select({ id: params.id })
      .from(params)
      .where(
        and(
          eq(params.jurisdictionCode, jurisdictionCode),
          eq(params.paramId, t.param_id),
          eq(params.policyPackId, policyPackId),
          eq(params.version, 1),
        ),
      )
      .limit(1);

    const data = {
      policyPackId,
      jurisdictionCode,
      businessKey: t.param_id,
      paramId: t.param_id,
      type: t.type,
      value: null,
      unit: null,
      effectiveFrom: t.effective_from ?? pack.as_of,
      source: t.source ?? null,
      keyFields: t.key_fields,
      valueFields: t.value_fields,
      rows: t.rows,
      note: t.note ?? null,
      version: 1,
      status: "published",
      operation: overlay.operation,
      targetBusinessKey: overlay.targetBusinessKey,
    };

    if (existing.length > 0) {
      await db
        .update(params)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(params.jurisdictionCode, jurisdictionCode),
            eq(params.paramId, t.param_id),
            eq(params.policyPackId, policyPackId),
            eq(params.version, 1),
          ),
        );
      console.log(`  Updated table param: ${t.param_id}`);
    } else {
      await db.insert(params).values(data);
      console.log(`  Inserted table param: ${t.param_id}`);
    }
  }

  console.log("Params seeded.");
}
