/**
 * 地区树用例（步骤03.1）：解析继承链，树非法/地区缺失时抛领域错误。
 * policy 模块合并器消费本服务获得“国家→…→目标地区”的 overlay 应用顺序。
 */
import {
  resolveChain,
  type JurisdictionNode,
} from "../domain/tree";
import type { JurisdictionReadRepository } from "./ports";

export class JurisdictionTreeError extends Error {
  constructor(
    public readonly reason: "not-found" | "invalid-tree",
    message: string,
  ) {
    super(message);
  }
}

export function createJurisdictionTreeService(deps: {
  read: JurisdictionReadRepository;
}) {
  return {
    async resolveChain(code: string): Promise<JurisdictionNode[]> {
      const rows = await deps.read.listEnabled();
      const chain = resolveChain(
        rows.map((r) => ({
          code: r.code,
          name: r.name,
          level: r.level as JurisdictionNode["level"],
          parentCode: r.parentCode,
          path: r.path,
          enabled: r.enabled,
        })),
        code,
      );
      if (!chain) {
        const exists = await deps.read.getByCode(code);
        throw new JurisdictionTreeError(
          exists ? "invalid-tree" : "not-found",
          exists ? `地区树校验失败，无法解析 ${code}` : `地区不存在: ${code}`,
        );
      }
      return chain;
    },
  };
}
