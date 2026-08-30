/** jurisdiction 模块只读端口（步骤03.1）。 */
import type { jurisdictions } from "@/lib/db/schema";
import type { JurisdictionNode } from "../domain/tree";

export type JurisdictionRow = typeof jurisdictions.$inferSelect;

export interface JurisdictionReadRepository {
  getByCode(code: string): Promise<JurisdictionRow | null>;
  /** 全量启用地区（规模为国家级+省市区，量小，便于树校验）。 */
  listEnabled(): Promise<JurisdictionRow[]>;
}

/** 归属 jurisdiction 模块的树校验/链解析端口（供 application 与 policy 模块使用）。 */
export interface JurisdictionTreeService {
  /** 返回根到目标的继承链；地区缺失或树非法时抛出领域错误。 */
  resolveChain(code: string): Promise<JurisdictionNode[]>;
}
