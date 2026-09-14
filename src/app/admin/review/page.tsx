/**
 * 步骤06.6 审核体验（DRF-FR-012 / PRD §9）：管理员审核提案。
 * Personal Demo 最小可用：提案列表 + 原文摘要/草案/校验状态展示 + 批准/驳回。
 * 通过内部代理调用 FastAPI（服务身份头由代理注入；阶段07升级为服务 JWT）。
 */
"use client";

import { useCallback, useEffect, useState } from "react";

interface ProposalView {
  proposal_id: string;
  run_id: string;
  status: string;
  jurisdiction_code: string;
  draft_bundle: Record<string, unknown> | null;
}

export default function ProposalsReviewPage() {
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/proposals", { cache: "no-store" });
      const data = await resp.json();
      setProposals(data.proposals ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const review = async (proposalId: string, decision: string) => {
    setMessage("");
    const resp = await fetch(`/api/admin/proposals/${proposalId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const data = await resp.json();
    setMessage(
      resp.ok
        ? `已提交 ${decision}（resumed=${data.resumed}）`
        : `失败：${data.error ?? resp.status}`,
    );
    await refresh();
  };

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-bold">政策草案审核</h1>
      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      <ul className="space-y-3">
        {proposals.map((p) => (
          <li key={p.proposal_id} className="rounded border p-4">
            <div className="flex items-center justify-between">
              <button
                className="font-medium text-blue-700 underline"
                onClick={() => setSelected(p.proposal_id)}
              >
                {p.proposal_id}
              </button>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                {p.status} · {p.jurisdiction_code}
              </span>
            </div>
            {selected === p.proposal_id && (
              <pre className="mt-3 max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs">
                {JSON.stringify(p.draft_bundle, null, 2)}
              </pre>
            )}
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                placeholder="审核理由（驳回必填）"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                className="rounded bg-green-600 px-3 py-1 text-sm text-white"
                onClick={() => review(p.proposal_id, "approve")}
              >
                批准
              </button>
              <button
                className="rounded bg-red-600 px-3 py-1 text-sm text-white"
                onClick={() => review(p.proposal_id, "reject")}
              >
                驳回
              </button>
            </div>
          </li>
        ))}
      </ul>
      {message && <p className="mt-4 text-sm text-blue-700">{message}</p>}
    </main>
  );
}
