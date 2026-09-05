"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Clock } from "lucide-react";

/**
 * NRP-FR-022：各地区覆盖状态横幅。
 * blocked地区显示政策覆盖缺口；awaiting_approval显示待管理员批准。
 * 四川按PRD显示"0条地方规则、3个参数、blocked"。
 */
interface RegionCoverage {
  jurisdictionCode: string;
  readiness: string;
  blockingReasons: string[];
  entityCounts: Record<string, number>;
  status: string;
}

const REGION_NAMES: Record<string, string> = {
  CN: "国家 baseline",
  "310000": "上海",
  "440000": "广东",
  "510000": "四川",
};

export function RegionCoverageBanner() {
  const [regions, setRegions] = useState<RegionCoverage[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/policy-coverage")
      .then((r) => r.json())
      .then((d: { regions?: RegionCoverage[] }) => setRegions(d.regions ?? []))
      .catch(() => setRegions([]));
  }, []);

  if (!regions || regions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {regions.map((r) => {
        const blocked = r.readiness === "blocked";
        const rulesCount = r.entityCounts.rules ?? 0;
        const paramsCount = r.entityCounts.params ?? 0;
        return (
          <div
            key={r.jurisdictionCode}
            className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
              blocked
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {blocked ? (
                <ShieldAlert size={14} />
              ) : (
                <Clock size={14} />
              )}
              {REGION_NAMES[r.jurisdictionCode] ?? r.jurisdictionCode}：
              {rulesCount}条地方规则、{paramsCount}个参数、
              {blocked ? "blocked" : "awaiting_approval"}
            </div>
            {blocked && r.blockingReasons.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {r.blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
