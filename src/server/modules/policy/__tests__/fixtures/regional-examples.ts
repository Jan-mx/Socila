/**
 * 粤川区域测试夹具（09-05 SDL-FR-012、SDL-US-004）。
 *
 * 原 seed-regional.ts 的广东、四川 overlay 示例包（GD-EXAMPLE-BASE、SC-EXAMPLE-BASE）
 * 与四个固定参数不是已完成权威引用审核的正式政策，自本Feature起只作为测试夹具存在：
 * 由区域隔离集成测试显式安装，并在测试数据库生命周期结束时清理。
 * 生产Seed不依赖、也不得引用本模块（SDL-AC-005）。
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, policyPackVersions } from "@/lib/db/schema";

interface RegionalExampleFixture {
  jurisdictionCode: string;
  packId: string;
  name: string;
  params: Array<{
    paramId: string;
    type: "number";
    value: number;
    note: string;
  }>;
}

export const REGIONAL_EXAMPLE_FIXTURES: RegionalExampleFixture[] = [
  {
    jurisdictionCode: "440000",
    packId: "GD-EXAMPLE-BASE",
    name: "广东省 overlay 示例包（阶段03 示例数据）",
    params: [
      { paramId: "P-GD-MIN-WAGE-BASE", type: "number", value: 2300, note: "示例：广东最低工资基数（元/月）" },
      { paramId: "P-GD-MEDICAL-CAP", type: "number", value: 7800, note: "示例：广东医保封顶线相关基数（元/月）" },
    ],
  },
  {
    jurisdictionCode: "510000",
    packId: "SC-EXAMPLE-BASE",
    name: "四川省 overlay 示例包（阶段03 示例数据）",
    params: [
      { paramId: "P-SC-MIN-WAGE-BASE", type: "number", value: 2100, note: "示例：四川最低工资基数（元/月）" },
      { paramId: "P-SC-MEDICAL-CAP", type: "number", value: 6600, note: "示例：四川医保封顶线相关基数（元/月）" },
    ],
  },
];

export const FIXTURE_PACK_IDS = REGIONAL_EXAMPLE_FIXTURES.map((f) => f.packId);
export const FIXTURE_PARAM_IDS = REGIONAL_EXAMPLE_FIXTURES.flatMap((f) =>
  f.params.map((p) => p.paramId),
);

/** 显式安装粤川示例夹具（幂等：已存在则跳过）。仅供测试调用。 */
export async function installRegionalExampleFixtures(): Promise<void> {
  for (const fixture of REGIONAL_EXAMPLE_FIXTURES) {
    const existingPack = await db
      .select({ id: policyPackVersions.id })
      .from(policyPackVersions)
      .where(
        and(
          eq(policyPackVersions.policyPackId, fixture.packId),
          eq(policyPackVersions.version, 1),
        ),
      )
      .limit(1);
    if (existingPack.length === 0) {
      await db.insert(policyPackVersions).values({
        policyPackId: fixture.packId,
        jurisdictionCode: fixture.jurisdictionCode,
        packKind: "overlay",
        version: 1,
        status: "published",
        effectiveFrom: "2025-01-01",
        paramSnapshot: fixture.params as unknown as Record<string, unknown>,
      });
    }

    for (const p of fixture.params) {
      const existingParam = await db
        .select({ id: params.id })
        .from(params)
        .where(and(eq(params.paramId, p.paramId), eq(params.version, 1)))
        .limit(1);
      if (existingParam.length === 0) {
        await db.insert(params).values({
          policyPackId: fixture.packId,
          jurisdictionCode: fixture.jurisdictionCode,
          businessKey: p.paramId,
          paramId: p.paramId,
          type: p.type,
          value: p.value,
          effectiveFrom: "2025-01-01",
          note: p.note,
          version: 1,
          status: "published",
        });
      }
    }
  }
}

/** 清理夹具数据（测试生命周期结束时调用）；断言零残留由调用方测试承担。 */
export async function cleanupRegionalExampleFixtures(): Promise<void> {
  await db.delete(params).where(inArray(params.paramId, FIXTURE_PARAM_IDS));
  await db
    .delete(policyPackVersions)
    .where(inArray(policyPackVersions.policyPackId, FIXTURE_PACK_IDS));
}
