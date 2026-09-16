import { publishReads } from "@/server/modules/publishing/application";
import { rulesReads } from "@/server/modules/rules/application";
import {
  buildNameIndex,
  resolveHistoryDisplayNames,
  type EntityNameRow,
} from "@/lib/admin/publish-history-names";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 发布历史（APR-FR-016/NFR-005）：按entity_type + jurisdiction_code + entity_id +
 * entity_version批量解析当时版本的中文名称（每实体类型一条查询，禁止逐记录N+1）。
 * 旧记录缺少身份或对应实体不存在时displayName=null（UI显示"名称不可用"），
 * 不得用当前版本名称或他区名称冒充历史名称。
 */
export async function GET() {
  try {
    const [publishes, rules, params, ruleSets] = await Promise.all([
      publishReads.listPublishes(200),
      rulesReads.listRules(),
      rulesReads.listParams(),
      rulesReads.listRuleSets(),
    ]);

    const nameRows: EntityNameRow[] = [
      ...rules.map((r) => ({
        entityType: "rule",
        jurisdictionCode: r.jurisdictionCode ?? "",
        entityId: r.ruleId,
        version: r.version,
        name: r.name,
      })),
      ...params.map((p) => ({
        entityType: "param",
        jurisdictionCode: p.jurisdictionCode ?? "",
        entityId: p.paramId,
        version: p.version,
        name: p.name,
      })),
      ...ruleSets.map((s) => ({
        entityType: "rule_set",
        jurisdictionCode: s.jurisdictionCode ?? "",
        entityId: s.ruleSetId,
        version: s.version,
        name: s.name,
      })),
    ];

    const decorated = resolveHistoryDisplayNames(
      publishes.map((p) => ({
        ...p,
        entityType: p.entityType,
        entityId: p.entityId,
        jurisdictionCode: p.jurisdictionCode,
        entityVersion: p.entityVersion,
      })),
      buildNameIndex(nameRows),
    );
    return NextResponse.json(decorated);
  } catch {
    return NextResponse.json(
      { error: "加载发布历史失败" },
      { status: 500 },
    );
  }
}
