/**
 * APR-FR-017 / APR-NFR-004（单元）：显示元数据不参与政策内容哈希。
 *
 * name/description是纯显示字段：补写名称后的DSL文件必须与补写前得到相同的
 * params contentHash与包快照哈希，否则受控物化会因显示元数据触发版本漂移，
 * 违反"不修改快照、发布门禁、历史重放语义"。规则集的name同理不参与规则集
 * payloadShape（description为原有业务字段，保留参与）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildManifest,
  type GitReader,
} from "./manifest";
import { buildPackSnapshotPayload } from "./plan";
import { payloadShapeHash } from "./shapes";
import { canonicalJson, sha256 } from "./target";

const REPO = process.cwd();

function worktreeGitReader(): GitReader {
  return {
    showHead(p: string) {
      if (p === "COMMIT") return "apr-display-metadata-test";
      return readFileSync(path.join(REPO, p), "utf8");
    },
    listCommittedFiles(dir: string) {
      return [dir];
    },
    isWorktreeDirty() {
      return false;
    },
  };
}

describe("显示元数据不参与params内容哈希（APR-FR-017/NFR-004）", () => {
  it("当前DSL文件的params contentHash等于剥离name/description后的哈希", () => {
    const manifest = buildManifest(worktreeGitReader());
    const cn = manifest.regions.find((r) => r.jurisdictionCode === "CN")!;
    const entry = cn.params.find(
      (p) => p.businessKey === "P-UNEMPLOYMENT-MAX-MONTHS",
    )!;
    // 文件本身已携带人工名称（APR-FR-011）。
    expect((entry.payload as { name?: string }).name).toBe(
      "失业保险金法定最长领取月数",
    );
    const stripped: Record<string, unknown> = { ...entry.payload };
    delete stripped.name;
    delete stripped.description;
    expect(entry.contentHash).toBe(sha256(canonicalJson(stripped)));
  });

  it("同一参数：补写名称前后manifest contentHash与包快照一致（旧库升级零漂移）", () => {
    const withNames = buildManifest(worktreeGitReader());
    // 构造"补写前"视图：从当前工作树内容反向移除params条目的name/description键。
    const before = buildManifest({
      ...worktreeGitReader(),
      showHead(p: string) {
        const text = worktreeGitReader().showHead(p);
        if (!p.includes("/params/")) return text;
        const pack = JSON.parse(text) as {
          params: Array<Record<string, unknown>>;
          tables: Array<Record<string, unknown>>;
        };
        for (const list of [pack.params, pack.tables]) {
          for (const item of list) {
            delete item.name;
            delete item.description;
          }
        }
        return JSON.stringify(pack);
      },
    });
    for (const region of withNames.regions) {
      const mirror = before.regions.find(
        (r) => r.jurisdictionCode === region.jurisdictionCode,
      )!;
      for (const param of region.params) {
        const same = mirror.params.find(
          (m) =>
            m.businessKey === param.businessKey &&
            m.payload.effective_from === param.payload.effective_from,
        )!;
        expect(
          param.contentHash,
          `${region.jurisdictionCode}|${param.businessKey} 显示字段改变了内容哈希`,
        ).toBe(same.contentHash);
      }
      // 包快照（含每参数contentHash）哈希不受显示元数据影响。
      expect(payloadShapeHash("param", region.params[0]!.payload as Record<string, unknown>)).toBe(
        payloadShapeHash("param", mirror.params[0]!.payload as Record<string, unknown>),
      );
    }
    // 规则集：name不在payloadShape内（description为原有字段保留）。
    const rsWith = withNames.regions.find((r) => r.jurisdictionCode === "CN")!;
    const rsBefore = before.regions.find((r) => r.jurisdictionCode === "CN")!;
    expect(
      payloadShapeHash("rule_set", rsWith.ruleSetPayload as Record<string, unknown>),
    ).toBe(
      payloadShapeHash("rule_set", rsBefore.ruleSetPayload as Record<string, unknown>),
    );
  });

  it("packSnapshotPayload的contentHash序列在补写名称前后完全一致", () => {
    const withNames = buildManifest(worktreeGitReader());
    const stripped = buildManifest({
      ...worktreeGitReader(),
      showHead(p: string) {
        const text = worktreeGitReader().showHead(p);
        if (!p.includes("/params/")) return text;
        const pack = JSON.parse(text) as {
          params: Array<Record<string, unknown>>;
          tables: Array<Record<string, unknown>>;
        };
        for (const list of [pack.params, pack.tables]) {
          for (const item of list) {
            delete item.name;
            delete item.description;
          }
        }
        return JSON.stringify(pack);
      },
    });
    for (const region of withNames.regions) {
      const mirror = stripped.regions.find(
        (r) => r.jurisdictionCode === region.jurisdictionCode,
      )!;
      expect(buildPackSnapshotPayload(mirror)).toEqual(
        buildPackSnapshotPayload(region),
      );
    }
  });
});
