/**
 * 步骤03.8 区域示例种子（POL-AC-002）：广东、四川 overlay 示例包与参数。
 * 幂等：按 (jurisdiction, packId/paramId+version) 已存在则跳过。
 */
import { db } from "@/lib/db";
import { params, policyPackVersions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

interface RegionalExample {
  jurisdictionCode: string;
  packId: string;
  name: string;
  params: Array<{
    paramId: string;
    businessKey: string;
    type: "number";
    value: number;
    note: string;
  }>;
}

const EXAMPLES: RegionalExample[] = [
  {
    jurisdictionCode: "440000",
    packId: "GD-EXAMPLE-BASE",
    name: "广东省 overlay 示例包（阶段03 示例数据）",
    params: [
      { paramId: "P-GD-MIN-WAGE-BASE", businessKey: "P-GD-MIN-WAGE-BASE", type: "number", value: 2300, note: "示例：广东最低工资基数（元/月）" },
      { paramId: "P-GD-MEDICAL-CAP", businessKey: "P-GD-MEDICAL-CAP", type: "number", value: 7800, note: "示例：广东医保封顶线相关基数（元/月）" },
    ],
  },
  {
    jurisdictionCode: "510000",
    packId: "SC-EXAMPLE-BASE",
    name: "四川省 overlay 示例包（阶段03 示例数据）",
    params: [
      { paramId: "P-SC-MIN-WAGE-BASE", businessKey: "P-SC-MIN-WAGE-BASE", type: "number", value: 2100, note: "示例：四川最低工资基数（元/月）" },
      { paramId: "P-SC-MEDICAL-CAP", businessKey: "P-SC-MEDICAL-CAP", type: "number", value: 6600, note: "示例：四川医保封顶线相关基数（元/月）" },
    ],
  },
];

export async function seedRegionalExamples() {
  for (const example of EXAMPLES) {
    const existingPack = await db
      .select({ id: policyPackVersions.id })
      .from(policyPackVersions)
      .where(
        and(
          eq(policyPackVersions.policyPackId, example.packId),
          eq(policyPackVersions.version, 1),
        ),
      )
      .limit(1);
    if (existingPack.length === 0) {
      await db.insert(policyPackVersions).values({
        policyPackId: example.packId,
        jurisdictionCode: example.jurisdictionCode,
        packKind: "overlay",
        version: 1,
        status: "published",
        effectiveFrom: "2025-01-01",
        paramSnapshot: example.params as unknown as Record<string, unknown>,
      });
      console.log(`  Inserted regional pack: ${example.packId}`);
    }

    for (const p of example.params) {
      const existingParam = await db
        .select({ id: params.id })
        .from(params)
        .where(and(eq(params.paramId, p.paramId), eq(params.version, 1)))
        .limit(1);
      if (existingParam.length === 0) {
        await db.insert(params).values({
          policyPackId: example.packId,
          jurisdictionCode: example.jurisdictionCode,
          businessKey: p.businessKey,
          paramId: p.paramId,
          type: p.type,
          value: p.value,
          effectiveFrom: "2025-01-01",
          note: p.note,
          version: 1,
          status: "published",
        });
        console.log(`  Inserted regional param: ${p.paramId}`);
      }
    }
  }
  console.log("Regional examples seeded.");
}
