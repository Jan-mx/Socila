/**
 * CLG-FR-008/009 确定性分层策展（PRD §6.3）：
 * - 18层：gender × birth_year_band × employment_status；
 * - 层内按 qualityScore DESC, caseUid ASC 排序；
 * - 固定字典序循环轮询，每轮每层取1条直至36；
 * - 配额不足时用最高分未选替换最低分已选（保持已满足配额），
 *   交换过程与原因写入报告；仍不满足全部约束则拒绝生成（ok=false）。
 * 纯函数：相同输入恒得相同选择与顺序（CLG-NFR-002）。
 */
import type {
  BirthYearBand,
  CurationReport,
  EmploymentStatus,
  SelectionEntry,
  ShowcaseCandidateRecord,
  SwapRecord,
} from "./types";
import { birthYearBand } from "./multi-label";

const TARGET_COUNT = 36;
const ALGORITHM_VERSION = "CLG-CURATION-1.0";

const GENDER_ORDER = ["female", "male"] as const;
const BAND_ORDER: BirthYearBand[] = ["before_1970", "1970_1979", "from_1980"];
const STATUS_ORDER: EmploymentStatus[] = ["employed", "flexible", "unemployed"];

interface QuotaWant {
  key: string;
  /** 已满足时返回true。 */
  satisfied: (stats: Record<string, number>) => boolean;
  /** 候选是否改善该配额。 */
  matches: (record: ShowcaseCandidateRecord) => boolean;
}

const WANTS: QuotaWant[] = [
  {
    key: "female",
    satisfied: (s) => s.female === 18,
    matches: (r) => r.gender === "female",
  },
  {
    key: "before_1970",
    satisfied: (s) => s.before_1970 >= 6,
    matches: (r) => birthYearBand(r.birthYear) === "before_1970",
  },
  {
    key: "1970_1979",
    satisfied: (s) => s["1970_1979"] >= 6,
    matches: (r) => birthYearBand(r.birthYear) === "1970_1979",
  },
  {
    key: "from_1980",
    satisfied: (s) => s.from_1980 >= 6,
    matches: (r) => birthYearBand(r.birthYear) === "from_1980",
  },
  {
    key: "flexible",
    satisfied: (s) => s.flexible >= 12,
    matches: (r) => r.employmentStatus === "flexible",
  },
  {
    key: "unemployed",
    satisfied: (s) => s.unemployed >= 12,
    matches: (r) => r.employmentStatus === "unemployed",
  },
  {
    key: "4050",
    satisfied: (s) => s["4050"] >= 6,
    matches: (r) => Boolean((r.expected ?? {}).subsidy_4050),
  },
  {
    key: "daling",
    satisfied: (s) => s.daling >= 4,
    matches: (r) => Boolean((r.expected ?? {}).subsidy_daling),
  },
  {
    key: "gangwei",
    satisfied: (s) => s.gangwei >= 3,
    matches: (r) => Boolean((r.expected ?? {}).subsidy_gangwei),
  },
];

export function curateShowcase(
  eligible: ShowcaseCandidateRecord[],
): CurationReport {
  if (eligible.length < TARGET_COUNT) {
    return {
      ok: false,
      selected: [],
      entries: [],
      swaps: [],
      quotas: {},
      violations: [`合格候选${eligible.length}条不足36条`],
      algorithmVersion: ALGORITHM_VERSION,
    };
  }

  // 1) 分层并按 qualityScore DESC, caseUid ASC 排序
  const layers = new Map<string, ShowcaseCandidateRecord[]>();
  for (const record of eligible) {
    const key = layerKey(record);
    const list = layers.get(key) ?? [];
    list.push(record);
    layers.set(key, list);
  }
  for (const list of layers.values()) {
    list.sort(byScoreDescThenUid);
  }

  // 2) 固定字典序循环轮询取36
  const selected: ShowcaseCandidateRecord[] = [];
  const layerConsumed = new Map<string, number>();
  const entries: SelectionEntry[] = [];
  const swaps: SwapRecord[] = [];
  const allCandidates = [...eligible].sort(byScoreDescThenUid);

  let round = 0;
  while (selected.length < TARGET_COUNT && round < TARGET_COUNT * 40) {
    const key = LAYER_ORDER[round % LAYER_ORDER.length];
    const list = layers.get(key) ?? [];
    const consumed = layerConsumed.get(key) ?? 0;
    if (consumed < list.length) {
      const record = list[consumed];
      layerConsumed.set(key, consumed + 1);
      selected.push(record);
      entries.push({
        caseUid: record.caseUid,
        qualityScore: record.qualityScore ?? 0,
        layer: layerOf(record),
        reason: "round-robin",
      });
    }
    round++;
  }

  if (selected.length < TARGET_COUNT) {
    return {
      ok: false,
      selected: [],
      entries,
      swaps,
      quotas: computeQuotas(selected),
      violations: [`轮询只选出${selected.length}条，不足36条`],
      algorithmVersion: ALGORITHM_VERSION,
    };
  }

  // 3) 配额修复：最高分未选替换最低分已选（保持已满足配额）
  let notSelected = allCandidates.filter(
    (r) => !selected.some((s) => s.caseUid === r.caseUid),
  );
  let violations: string[] = [];
  let guard = 0;
  while (guard < 500) {
    guard++;
    violations = collectViolations(selected);
    if (violations.length === 0) break;

    const stats = computeQuotas(selected);
    const employedOver = stats.employed > 3;
    const want = WANTS.find((w) => !w.satisfied(stats));

    let swapped = false;
    for (const candidate of notSelected) {
      if (employedOver && candidate.employmentStatus === "employed") continue;
      if (want && !want.matches(candidate)) continue;
      const victim = findVictim(selected, stats, want, employedOver, candidate);
      if (!victim) continue;
      selected.splice(selected.indexOf(victim), 1, candidate);
      notSelected = notSelected.filter((r) => r.caseUid !== candidate.caseUid);
      notSelected.push(victim);
      swaps.push({
        out: victim.caseUid,
        in: candidate.caseUid,
        reason: `替补：配额「${want ? want.key : "employed<=3"}」`,
      });
      swapped = true;
      break;
    }
    if (!swapped) break;
  }

  violations = collectViolations(selected);
  return {
    ok: violations.length === 0,
    selected: selected.map((r) => r.caseUid),
    entries,
    swaps,
    quotas: computeQuotas(selected),
    violations,
    algorithmVersion: ALGORITHM_VERSION,
  };
}

function findVictim(
  selected: ShowcaseCandidateRecord[],
  stats: Record<string, number>,
  want: QuotaWant | undefined,
  employedOver: boolean,
  candidate: ShowcaseCandidateRecord,
): ShowcaseCandidateRecord | null {
  // 按分数升序遍历（同分UID升序）：替换最低分已选。
  const ordered = [...selected].sort((a, b) => (a.qualityScore ?? 0) - (b.qualityScore ?? 0) || a.caseUid.localeCompare(b.caseUid));
  for (const r of ordered) {
    // 性别处理：female不足时victim必须为male（female+1/male-1）；
    // 其他配额保持性别平衡（替换者与被替换者同性别）。
    if (want && want.key === "female") {
      if (r.gender !== "male") continue;
    } else if (r.gender !== candidate.gender) {
      continue;
    }
    const band = birthYearBand(r.birthYear);
    // 保护已满足的约束（替换不得使其变差）
    if (stats[band] <= 6) continue;
    if (r.employmentStatus === "flexible" && stats.flexible <= 12) continue;
    if (r.employmentStatus === "unemployed" && stats.unemployed <= 12) continue;
    if (employedOver && r.employmentStatus !== "employed") continue;
    if (!employedOver && r.employmentStatus === "employed") continue;
    if ((r.expected ?? {}).subsidy_4050 && stats["4050"] <= 6) continue;
    if ((r.expected ?? {}).subsidy_daling && stats.daling <= 4) continue;
    if ((r.expected ?? {}).subsidy_gangwei && stats.gangwei <= 3) continue;
    if (want) {
      // 替换后该配额必须改善：victim不匹配want（candidate已匹配）
      if (want.matches(r)) continue;
    }
    return r;
  }
  return null;
}

function collectViolations(selected: ShowcaseCandidateRecord[]): string[] {
  const stats = computeQuotas(selected);
  const violations: string[] = [];
  for (const want of WANTS) {
    if (!want.satisfied(stats)) violations.push(want.key);
  }
  if (stats.employed > 3) violations.push(`employed>3`);
  return violations;
}

function computeQuotas(selected: ShowcaseCandidateRecord[]): Record<string, number> {
  const stats: Record<string, number> = {
    female: 0,
    male: 0,
    before_1970: 0,
    "1970_1979": 0,
    from_1980: 0,
    employed: 0,
    flexible: 0,
    unemployed: 0,
    "4050": 0,
    daling: 0,
    gangwei: 0,
  };
  for (const r of selected) {
    stats[r.gender] = (stats[r.gender] ?? 0) + 1;
    stats[birthYearBand(r.birthYear)]++;
    const status = r.employmentStatus as EmploymentStatus;
    if (status in stats) stats[status]++;
    const expected = r.expected ?? {};
    if (expected.subsidy_4050) stats["4050"]++;
    if (expected.subsidy_daling) stats.daling++;
    if (expected.subsidy_gangwei) stats.gangwei++;
  }
  return stats;
}

function layerKey(record: ShowcaseCandidateRecord): string {
  return `${record.gender}|${birthYearBand(record.birthYear)}|${record.employmentStatus}`;
}

function layerOf(record: ShowcaseCandidateRecord): SelectionEntry["layer"] {
  return {
    gender: record.gender,
    birthYearBand: birthYearBand(record.birthYear),
    employmentStatus: record.employmentStatus as EmploymentStatus,
  };
}

function byScoreDescThenUid(a: ShowcaseCandidateRecord, b: ShowcaseCandidateRecord): number {
  const diff = (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  if (diff !== 0) return diff;
  return a.caseUid.localeCompare(b.caseUid);
}

/** 固定字典序：female→male；before_1970→1970_1979→from_1980；employed→flexible→unemployed。 */
const LAYER_ORDER: string[] = GENDER_ORDER.flatMap((g) =>
  BAND_ORDER.flatMap((b) => STATUS_ORDER.map((s) => `${g}|${b}|${s}`)),
);
