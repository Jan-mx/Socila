/**
 * 步骤03.1 地区树测试（POL-FR-001/002 / POL-AC-002 基础）：
 * 树不变量（循环/孤儿/层级跳跃/路径一致性）+ 四地区路径正确性 + 真库集成。
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  validateJurisdictionTree,
  resolveChain,
  type JurisdictionNode,
} from "@/server/modules/jurisdiction/domain/tree";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const BASE: JurisdictionNode[] = [
  { code: "CN", name: "中国", level: "national", parentCode: null, path: "/CN/" },
  { code: "310000", name: "上海市", level: "province", parentCode: "CN", path: "/CN/310000/" },
  { code: "440000", name: "广东省", level: "province", parentCode: "CN", path: "/CN/440000/" },
  { code: "510000", name: "四川省", level: "province", parentCode: "CN", path: "/CN/510000/" },
];

describe("jurisdiction tree invariants (pure)", () => {
  it("four seeded paths are valid and chains resolve root-first", () => {
    expect(validateJurisdictionTree(BASE)).toEqual([]);
    expect(resolveChain(BASE, "310000")?.map((n) => n.code)).toEqual(["CN", "310000"]);
    expect(resolveChain(BASE, "440000")?.map((n) => n.code)).toEqual(["CN", "440000"]);
    expect(resolveChain(BASE, "510000")?.map((n) => n.code)).toEqual(["CN", "510000"]);
    expect(resolveChain(BASE, "CN")?.map((n) => n.code)).toEqual(["CN"]);
  });

  it("rejects orphans, level jumps, path mismatch and cycles", () => {
    const orphan: JurisdictionNode = { code: "9999", name: "孤儿", level: "province", parentCode: "NOPE", path: "/CN/9999/" };
    const jump: JurisdictionNode = { code: "441900", name: "跳级市", level: "city", parentCode: "CN", path: "/CN/441900/" };
    const badPath: JurisdictionNode = { code: "510100", name: "路径错", level: "city", parentCode: "510000", path: "/CN/9999/510100/" };
    const cycA: JurisdictionNode = { code: "A1", name: "环A", level: "province", parentCode: "A2", path: "/CN/A1/" };
    const cycB: JurisdictionNode = { code: "A2", name: "环B", level: "national", parentCode: "A1", path: "/CN/A1/A2/" };

    const kinds = validateJurisdictionTree([...BASE, orphan, jump, badPath, cycA, cycB]).map((v) => ({ kind: v.kind, code: v.code }));
    expect(kinds).toContainEqual({ kind: "orphan", code: "9999" });
    expect(kinds).toContainEqual({ kind: "level-jump", code: "441900" });
    expect(kinds).toContainEqual({ kind: "path-mismatch", code: "510100" });
    expect(kinds).toContainEqual({ kind: "cycle", code: "A1" });
    expect(resolveChain([...BASE, cycA, cycB], "310000")).toBeNull();
  });
});

const DRILL_URL = process.env.SSP_TEST_DATABASE_URL;

describe.skipIf(!DRILL_URL)("jurisdiction tree (drill DB)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("seeded migration rows resolve via repository service", async () => {
    const service = createJurisdictionTreeService({
      read: new DrizzleJurisdictionReadRepository(),
    });
    const chain = await service.resolveChain("310000");
    expect(chain.map((n) => n.code)).toEqual(["CN", "310000"]);
    expect(chain[0].name).toBe("中国");
    await expect(service.resolveChain("999999")).rejects.toMatchObject({
      reason: "not-found",
    });
  });
});
