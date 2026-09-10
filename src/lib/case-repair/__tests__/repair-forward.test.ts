/**
 * WI-20260907-04 repair-forward执行器单元测试（Red先行，纯函数/不连库）：
 *
 * - 确定性可信归档批次ID：sha256("task34-r4-trusted-archive:<manifestHash>")
 *   前16字节设v5版本/变体位 → 固定 c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141；
 *   禁止运行时随机UUID；
 * - 988条entries由可信归档manifest逐条构建（452 case+36 showcase_case+500 test），
 *   contentHash必须64位小写hex、同批次entity_type+entity_id无重复；
 * - 可执行计划planHash覆盖完整988条写集合、确定性批次ID与codeSha；
 * - 账本删除语句带完整旧值条件（id+hash+created_at）且RETURNING id；
 * - 状态分类：pending/repaired/drift（部分完成或数据不一致→REPAIR_STATE_DRIFT）；
 * - 参数守卫：无参数失败、apply缺授权/planHash/targetFingerprint拒绝。
 */
import { describe, it, expect } from "vitest";
import {
  deriveTrustedBatchId,
  TRUSTED_ARCHIVE,
  TRUSTED_BATCH_ID,
  DUP_LEDGER_ROWS,
  PREPARED_BATCH,
  TRUSTED_BATCH_CREATED_BY,
  buildTrustedEntries,
  buildTrustedBatchRow,
  buildExecutablePlan,
  buildLedgerDeleteStatement,
  classifyRepairState,
  parseRepairArgs,
  RepairForwardError,
  type TrustedManifestLike,
  type LiveRepairState,
} from "../repair-forward";

const HEX = (seed: string) => {
  // 64位小写hex（测试用确定性伪hash）。
  let s = "";
  for (let i = 0; i < 64; i++) s += "0123456789abcdef"[(seed.charCodeAt(i % seed.length) + i) % 16];
  return s;
};

function syntheticManifest(overrides: Partial<TrustedManifestLike> = {}): TrustedManifestLike {
  const cases = Array.from({ length: 452 }, (_, i) => ({ rowId: i + 1, uid: `case-${i + 1}`, contentHash: HEX(`c${i}`) }));
  const showcase = Array.from({ length: 36 }, (_, i) => ({ rowId: i + 1, uid: `show-${i + 1}`, contentHash: HEX(`s${i}`) }));
  const tests = Array.from({ length: 500 }, (_, i) => ({ rowId: i + 1, uid: `test-${i + 1}`, contentHash: HEX(`t${i}`) }));
  return {
    manifestHash: TRUSTED_ARCHIVE.manifestHash,
    oldTargets: { cases, showcase, tests },
    exampleSync: { retained: new Array(7).fill({}), updated: [], added: new Array(35).fill({}), deleted: new Array(21).fill({}) },
    exampleTests: new Array(42).fill({}),
    ...overrides,
  };
}

function pendingLive(): LiveRepairState {
  return {
    ledger: [
      ...Array.from({ length: 16 }, (_, i) => ({ id: i + 1, hash: HEX(`l${i}`), createdAt: String(1788000000000 + i) })),
      ...DUP_LEDGER_ROWS.map((r) => ({ id: r.id, hash: r.hash, createdAt: r.createdAt })),
      { id: 21, hash: HEX("l21"), createdAt: "1788796800000" },
      { id: 22, hash: HEX("l22"), createdAt: "1788796860000" },
    ],
    preparedBatch: { id: PREPARED_BATCH.id, status: "prepared", manifestHash: PREPARED_BATCH.manifestHash, storagePath: "C:\\tmp\\rcl-stage-b" },
    trustedBatch: null,
    trustedEntries: [],
    counts: { cases: 36, showcase: 36, tests: 78, exampleTests: 42, regressionTests: 36, snapshots: 10, releases: 5, archiveBatches: 3 },
    targetFingerprint: "56c479deb89438ff3943b61b73812cc2",
    businessFingerprints: { cases: "a", showcaseCases: "b", tests: "c", policySnapshots: "d", jurisdictionPlanningReleases: "e" },
  };
}

describe("repair-forward：确定性批次ID", () => {
  it("由 task34-r4-trusted-archive:<manifestHash> 确定性派生为固定UUID", () => {
    const id = deriveTrustedBatchId(TRUSTED_ARCHIVE.manifestHash);
    expect(id).toBe("c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141");
    expect(deriveTrustedBatchId(TRUSTED_ARCHIVE.manifestHash)).toBe(id);
    expect(TRUSTED_BATCH_ID).toBe(id);
    // 版本位5、RFC4122变体位。
    expect(id[14]).toBe("5");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });

  it("不同manifestHash派生不同ID（非常量、非随机）", () => {
    expect(deriveTrustedBatchId("0".repeat(64))).not.toBe(TRUSTED_BATCH_ID);
    expect(deriveTrustedBatchId("0".repeat(64))).toBe(deriveTrustedBatchId("0".repeat(64)));
  });

  it("绑定常量与计划前置一致", () => {
    expect(TRUSTED_ARCHIVE.manifestHash).toBe("da0ea94d4e8ce07b06dd50d2cdd4780110c256705fd7f024c83f5e4378cb32ef");
    expect(TRUSTED_ARCHIVE.dumpSha256).toBe("0e3c3d8b984bd992508d7a8fc4a32d162a96bf76634392cdbb6b0e1bc4264c11");
    expect(TRUSTED_ARCHIVE.dir).toBe("F:/Socila/backup/case-library/task34-r4-trusted-old-2026-09-10T06-59-14");
    expect(PREPARED_BATCH.id).toBe("91d60c5f-d979-4843-a43f-20daf4fa8945");
    expect(PREPARED_BATCH.manifestHash).toBe("c86fcc26c0456be43a9c9dd581657229082edf3ed9eaf68d2edf2d4e90339d55");
    expect(DUP_LEDGER_ROWS).toEqual([
      { id: 18, hash: "00e5abd2967bb93fa7b072edb71c800582ce4d51d87106967766332529c24fdf", createdAt: "1788818400000" },
      { id: 19, hash: "781fe578fc346e3307de6bdd45392f6a9d4b3b6653e71e5cf2c3520605a4fe33", createdAt: "1788904800000" },
      { id: 20, hash: "1a037fe1649c14ddeac1c33ab7f3cda98d5ddabb338e6e0897675f0dc27e1585", createdAt: "1788991200000" },
    ]);
    expect(TRUSTED_BATCH_CREATED_BY).toBe("task34-repair-forward");
  });
});

describe("repair-forward：988条entries与可信批次行", () => {
  it("从manifest逐条构建452 case+36 showcase_case+500 test=988，字段真实", () => {
    const entries = buildTrustedEntries(syntheticManifest());
    expect(entries).toHaveLength(988);
    expect(entries.filter((e) => e.entityType === "case")).toHaveLength(452);
    expect(entries.filter((e) => e.entityType === "showcase_case")).toHaveLength(36);
    expect(entries.filter((e) => e.entityType === "test")).toHaveLength(500);
    for (const e of entries) {
      expect(e.archiveBatchId).toBe(TRUSTED_BATCH_ID);
      expect(e.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof e.entityId).toBe("number");
      expect(e.archiveReason.length).toBeGreaterThan(10);
    }
    expect(entries[0]).toMatchObject({ entityType: "case", entityId: 1, caseUid: "case-1" });
  });

  it("任一contentHash非64位小写hex → ENTRY_HASH_INVALID", () => {
    const m = syntheticManifest();
    m.oldTargets.tests[7] = { ...m.oldTargets.tests[7], contentHash: "" };
    expect(() => buildTrustedEntries(m)).toThrowError(/ENTRY_HASH_INVALID/);
    const m2 = syntheticManifest();
    m2.oldTargets.cases[3] = { ...m2.oldTargets.cases[3], contentHash: "ABCDEF".repeat(10) + "abcd" };
    expect(() => buildTrustedEntries(m2)).toThrowError(/ENTRY_HASH_INVALID/);
  });

  it("同批次entity_type+entity_id重复 → ENTRY_DUPLICATE", () => {
    const m = syntheticManifest();
    m.oldTargets.cases[1] = { ...m.oldTargets.cases[1], rowId: 1 };
    expect(() => buildTrustedEntries(m)).toThrowError(/ENTRY_DUPLICATE/);
  });

  it("计数不是452/36/500 → TRUSTED_ARCHIVE_MISMATCH", () => {
    const m = syntheticManifest();
    m.oldTargets.tests = m.oldTargets.tests.slice(0, 499);
    expect(() => buildTrustedEntries(m)).toThrowError(/TRUSTED_ARCHIVE_MISMATCH/);
  });

  it("可信批次行：确定性ID、restore_verified、真实计数与table_hashes（不得空对象占位）", () => {
    const row = buildTrustedBatchRow({
      manifest: syntheticManifest(),
      attestationManifestHash: HEX("att"),
      migrationLedgerFingerprint: HEX("mlf"),
      targetFingerprint: "56c479deb89438ff3943b61b73812cc2",
      retained: { cases: 36, showcaseCases: 36, tests: 78, exampleTests: 42, regressionTests: 36 },
    });
    expect(row.id).toBe(TRUSTED_BATCH_ID);
    expect(row.status).toBe("restore_verified");
    expect(row.sourceCounts).toEqual({ cases: 452, showcaseCases: 36, regressionTests: 500, historicalExampleTests: 28 });
    expect(row.retainedCounts).toEqual({ cases: 36, showcaseCases: 36, tests: 78, exampleTests: 42, regressionTests: 36 });
    expect(row.deletedCounts).toEqual({ cases: 0, showcaseCases: 0, tests: 0, exampleTests: 0, regressionTests: 0 });
    expect(row.tableHashes).toMatchObject({
      trustedArchiveManifestHash: TRUSTED_ARCHIVE.manifestHash,
      trustedArchiveDumpSha: TRUSTED_ARCHIVE.dumpSha256,
      attestationManifestHash: HEX("att"),
      migrationLedgerFingerprint: HEX("mlf"),
    });
    expect(row.manifestHash).toBe(TRUSTED_ARCHIVE.manifestHash);
    expect(row.storagePath).toBe(TRUSTED_ARCHIVE.dir);
    expect(row.createdBy).toBe("task34-repair-forward");
  });
});

describe("repair-forward：可执行计划与planHash", () => {
  const base = () => ({
    codeSha: "1fe702b2b61ac5b8c754ac966471998a6a38fa9f",
    manifest: syntheticManifest(),
    live: pendingLive(),
    attestationManifestHash: HEX("att"),
    migrationLedgerFingerprint: HEX("mlf"),
    trustedArchive: { manifestFileSha256: HEX("mf"), dumpSha256: TRUSTED_ARCHIVE.dumpSha256, restoreReport: { tableCount: 40, sequenceCount: 20 } },
  });

  it("planHash为64位hex且覆盖988条entries与确定性批次ID", () => {
    const plan = buildExecutablePlan(base());
    expect(plan.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.entries).toHaveLength(988);
    expect(plan.trustedBatch.id).toBe(TRUSTED_BATCH_ID);
    expect(plan.ledgerDelete.map((r) => r.id)).toEqual([18, 19, 20]);
    expect(plan.ledgerKeep.map((r) => r.id)).toEqual([...Array.from({ length: 16 }, (_, i) => i + 1), 21, 22]);
    // 任一entry hash变化 → planHash变化。
    const m2 = syntheticManifest();
    m2.oldTargets.tests[499] = { ...m2.oldTargets.tests[499], contentHash: HEX("changed") };
    expect(buildExecutablePlan({ ...base(), manifest: m2 }).planHash).not.toBe(plan.planHash);
    // codeSha变化 → planHash变化（绑定代码提交）。
    expect(buildExecutablePlan({ ...base(), codeSha: "0".repeat(40) }).planHash).not.toBe(plan.planHash);
    // 相同输入确定性。
    expect(buildExecutablePlan(base()).planHash).toBe(plan.planHash);
  });

  it("账本删除语句：三行完整旧值条件+RETURNING id（不允许仅按id删除）", () => {
    const stmt = buildLedgerDeleteStatement(DUP_LEDGER_ROWS);
    expect(stmt.text).toMatch(/DELETE FROM drizzle\.__drizzle_migrations/);
    expect(stmt.text).toMatch(/RETURNING id/);
    // 三组 (id AND hash AND created_at) 谓词。
    expect((stmt.text.match(/id = \$\d+ AND hash = \$\d+ AND created_at = \$\d+/g) ?? []).length).toBe(3);
    expect(stmt.values).toEqual([
      18, DUP_LEDGER_ROWS[0].hash, "1788818400000",
      19, DUP_LEDGER_ROWS[1].hash, "1788904800000",
      20, DUP_LEDGER_ROWS[2].hash, "1788991200000",
    ]);
  });
});

describe("repair-forward：状态分类（幂等/漂移）", () => {
  const plan = () => buildExecutablePlan({
    codeSha: "1fe702b2b61ac5b8c754ac966471998a6a38fa9f",
    manifest: syntheticManifest(),
    live: pendingLive(),
    attestationManifestHash: HEX("att"),
    migrationLedgerFingerprint: HEX("mlf"),
    trustedArchive: { manifestFileSha256: HEX("mf"), dumpSha256: TRUSTED_ARCHIVE.dumpSha256, restoreReport: { tableCount: 40, sequenceCount: 20 } },
  });

  it("修复前状态 → pending", () => {
    const r = classifyRepairState(pendingLive(), plan());
    expect(r.state).toBe("pending");
  });

  it("修复后完整状态 → repaired（第二次执行noop）", () => {
    const p = plan();
    const live = pendingLive();
    live.ledger = live.ledger.filter((r) => ![18, 19, 20].includes(r.id));
    live.preparedBatch = { ...live.preparedBatch!, status: "rolled_back" };
    live.trustedBatch = { ...p.trustedBatch };
    live.trustedEntries = p.entries.map((e) => ({ entityType: e.entityType, entityId: e.entityId, caseUid: e.caseUid, contentHash: e.contentHash }));
    live.counts.archiveBatches = 4;
    const r = classifyRepairState(live, p);
    expect(r.state).toBe("repaired");
  });

  it("只完成一部分（账本已删但批次仍prepared）→ drift（REPAIR_STATE_DRIFT，禁止补写）", () => {
    const p = plan();
    const live = pendingLive();
    live.ledger = live.ledger.filter((r) => ![18, 19, 20].includes(r.id));
    const r = classifyRepairState(live, p);
    expect(r.state).toBe("drift");
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("988 entries不完整/不匹配 → drift", () => {
    const p = plan();
    const live = pendingLive();
    live.ledger = live.ledger.filter((r) => ![18, 19, 20].includes(r.id));
    live.preparedBatch = { ...live.preparedBatch!, status: "rolled_back" };
    live.trustedBatch = { ...p.trustedBatch };
    live.trustedEntries = p.entries.slice(0, 987).map((e) => ({ entityType: e.entityType, entityId: e.entityId, caseUid: e.caseUid, contentHash: e.contentHash }));
    expect(classifyRepairState(live, p).state).toBe("drift");
  });

  it("业务指纹变化（36/36/78/10/5或表hash）→ drift", () => {
    const p = plan();
    const live = pendingLive();
    live.businessFingerprints.tests = "changed";
    expect(classifyRepairState(live, p).state).toBe("drift");
    const live2 = pendingLive();
    live2.counts.snapshots = 11;
    expect(classifyRepairState(live2, p).state).toBe("drift");
  });

  it("账本旧值漂移（id 19 hash不同）→ drift", () => {
    const p = plan();
    const live = pendingLive();
    live.ledger = live.ledger.map((r) => (r.id === 19 ? { ...r, hash: HEX("drift") } : r));
    expect(classifyRepairState(live, p).state).toBe("drift");
  });
});

describe("repair-forward：参数守卫（禁止默认写入）", () => {
  it("无参数 → 失败（不得默认执行任何写入）", () => {
    expect(() => parseRepairArgs([])).toThrowError(RepairForwardError);
  });

  it("audit/plan/verify只读模式可解析", () => {
    expect(parseRepairArgs(["audit"]).mode).toBe("audit");
    expect(parseRepairArgs(["plan"]).mode).toBe("plan");
    expect(parseRepairArgs(["verify"]).mode).toBe("verify");
  });

  it("apply缺 --i-am-authorized / --plan-hash / --target-fingerprint 任一 → 拒绝", () => {
    expect(() => parseRepairArgs(["apply"])).toThrowError(/AUTHORIZATION_REQUIRED/);
    expect(() => parseRepairArgs(["apply", "--i-am-authorized"])).toThrowError(/PLAN_HASH_REQUIRED/);
    expect(() => parseRepairArgs(["apply", "--i-am-authorized", "--plan-hash", "a".repeat(64)])).toThrowError(/TARGET_FINGERPRINT_REQUIRED/);
    const ok = parseRepairArgs(["apply", "--i-am-authorized", "--plan-hash", "a".repeat(64), "--target-fingerprint", "b".repeat(32)]);
    expect(ok).toMatchObject({ mode: "apply", authorized: true, planHash: "a".repeat(64), targetFingerprint: "b".repeat(32) });
  });

  it("未知模式 → 拒绝", () => {
    expect(() => parseRepairArgs(["delete-everything"])).toThrowError(RepairForwardError);
  });
});
