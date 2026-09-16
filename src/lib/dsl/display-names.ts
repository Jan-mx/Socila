/**
 * APR-FR-003/010/017：政策资产显示元数据（中文名称/说明）的入口校验与回退识别。
 *
 * - 新建、Seed与物化入口强制name非空（DisplayMetaError携带实体编号，fail-closed）；
 * - 名称/说明不得包含未经转义的HTML（PRD §9：拒绝尖括号，React渲染层默认转义双保险）；
 * - 兼容迁移把无法确定名称的旧行回退为实体编号；isFallbackName用于识别"名称待补充"，
 *   正常读取不阻止（FR-017），但校验入口能识别未补全状态。
 */

export class DisplayMetaError extends Error {
  readonly entityId: string;
  readonly field: "name" | "description";

  constructor(entityId: string, field: "name" | "description", message: string) {
    super(message);
    this.name = "DisplayMetaError";
    this.entityId = entityId;
    this.field = field;
  }
}

/** 名称/说明不得包含HTML尖括号（PRD §9，防止存储型注入面）。 */
function assertNoHtml(entityId: string, field: "name" | "description", value: string): void {
  if (value.includes("<") || value.includes(">")) {
    throw new DisplayMetaError(
      entityId,
      field,
      `${entityId} 的 ${field} 不得包含HTML尖括号（PRD §9）`,
    );
  }
}

/**
 * 校验可选的说明字段（APR-FR-010/§9）：缺省/null→null，空串→null，
 * 非空拒绝HTML尖括号。用于编辑与创建入口的description独立校验。
 */
export function assertDisplayDescription(
  entityId: string,
  description: unknown,
): string | null {
  if (description === undefined || description === null) return null;
  if (typeof description !== "string") {
    throw new DisplayMetaError(entityId, "description", `${entityId} 的 description 必须是字符串或null`);
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) return null;
  assertNoHtml(entityId, "description", trimmed);
  return trimmed;
}

/**
 * 校验并规范化显示元数据。name必填非空字符串；description可选，
 * 缺省/空串规范化为null。用于seed装载、受控物化与管理端创建入口。
 */
export function assertDisplayMeta(
  entityId: string,
  meta: { name?: unknown; description?: unknown },
): { name: string; description: string | null } {
  if (typeof meta.name !== "string" || meta.name.trim().length === 0) {
    throw new DisplayMetaError(
      entityId,
      "name",
      `${entityId} 缺少正式中文名称（APR-FR-003/010/017：新建与物化入口名称必填）`,
    );
  }
  const name = meta.name.trim();
  assertNoHtml(entityId, "name", name);
  const description = assertDisplayDescription(entityId, meta.description);
  return { name, description };
}

/** 迁移回退名称识别：name恰为实体编号时视为"名称待补充"（APR-FR-017）。 */
export function isFallbackName(name: string, entityId: string): boolean {
  return name === entityId;
}
