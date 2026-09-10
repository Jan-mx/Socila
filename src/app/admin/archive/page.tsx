"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

/**
 * CLG-AC-012 归档管理页面：只展示批次与哈希元数据（状态/计数/哈希/路径/时间/操作者）。
 * 不提供原始归档正文或dump下载（恢复仅走OPERATIONS受控流程）。
 */
interface ArchiveBatch {
  id: string;
  status: string;
  sourceCounts: Record<string, number>;
  retainedCounts: Record<string, number>;
  deletedCounts: Record<string, number>;
  tableHashes: Record<string, string>;
  manifestHash: string;
  storagePath: string;
  createdAt: string;
  createdBy: string;
}

export default function CaseArchivePage() {
  const [batches, setBatches] = useState<ArchiveBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Array<Record<string, unknown>> | null>(null);

  useEffect(() => {
    fetch("/api/admin/case-archive")
      .then((r) => r.json())
      .then((data) => setBatches(data.batches))
      .catch(() => setError("加载归档批次失败"))
      .finally(() => setError(null));
  }, []);

  const loadEntries = (id: string) => {
    setSelectedId(id);
    setEntries(null);
    fetch(`/api/admin/case-archive/${id}`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries))
      .catch(() => setEntries([]));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>案例归档（只读元数据）</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-red-600">{error}</p>}
          {!batches && !error && <p>加载中…</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">状态</th>
                <th>manifestHash</th>
                <th>源计数</th>
                <th>保留/删除</th>
                <th>创建时间</th>
                <th>操作者</th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).map((b) => (
                <tr key={b.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => loadEntries(b.id)}>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">{b.status}</span>
                  </td>
                  <td className="font-mono text-xs">{b.manifestHash.slice(0, 12)}…</td>
                  <td className="font-mono text-xs">{JSON.stringify(b.sourceCounts)}</td>
                  <td className="font-mono text-xs">
                    保留{JSON.stringify(b.retainedCounts)} / 删除{JSON.stringify(b.deletedCounts)}
                  </td>
                  <td className="text-xs">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="text-xs">{b.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle>批次条目（UID/哈希/原因，无正文）</CardTitle>
          </CardHeader>
          <CardContent>
            {!entries && <p>加载中…</p>}
            {entries && entries.length === 0 && <p>无条目</p>}
            {entries && entries.length > 0 && (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2">类型</th>
                      <th>原ID</th>
                      <th>caseUid</th>
                      <th>contentHash</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1">{String(e.entity_type)}</td>
                        <td className="font-mono text-xs">{String(e.entity_id)}</td>
                        <td className="font-mono text-xs">{String(e.case_uid ?? "-")}</td>
                        <td className="font-mono text-xs">{String(e.content_hash ?? "-").slice(0, 12)}…</td>
                        <td className="text-xs">{String(e.archive_reason ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
