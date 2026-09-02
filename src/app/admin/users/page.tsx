/**
 * 管理员用户管理页（09-02 §9.1/§9.3，AUTH-US-004，AUTH-FR-008/009/010）。
 *
 * 用户查询（规范化用户名/角色/状态过滤 + 游标分页）、禁用/启用、
 * 角色提升/降级与一次性临时密码重置。所有写操作由服务端 requireFreshAdmin
 * 最终校验；前端按钮只是交互行为，不是安全控制（§12.1）。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Search } from "lucide-react";

interface AdminUserItem {
  id: string;
  username: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  authVersion: number;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const API_ERRORS: Record<string, string> = {
  INVALID_INPUT: "请求参数无效。",
  AUTH_REQUIRED: "登录状态已失效，请重新登录。",
  FORBIDDEN: "没有执行该操作的权限。",
  RESOURCE_NOT_FOUND: "用户不存在或已被删除。",
  USERNAME_TAKEN: "用户名冲突。",
  LAST_ADMIN_REQUIRED: "至少需要保留一个可用的 active 管理员。",
  RATE_LIMITED: "操作过于频繁，请稍后再试。",
  AUTH_STORE_UNAVAILABLE: "服务暂时不可用，请稍后重试。",
};

function describeError(code: string | undefined, fallback: string): string {
  if (code && API_ERRORS[code]) return API_ERRORS[code];
  return fallback;
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.userId;

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{
    username: string;
    password: string;
    expiresAt: string;
  } | null>(null);

  const buildQuery = useCallback(
    (cursorValue: string | null) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (cursorValue) params.set("cursor", cursorValue);
      return params.toString();
    },
    [q, roleFilter, statusFilter],
  );

  const loadUsers = useCallback(
    async (cursorValue: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const qs = buildQuery(cursorValue);
        const res = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(describeError(body.error, "用户列表加载失败。"));
          return;
        }
        const data = (await res.json()) as {
          items: AdminUserItem[];
          nextCursor: string | null;
        };
        setItems(cursorValue ? [...items, ...data.items] : data.items);
        setNextCursor(data.nextCursor);
      } catch {
        setError("网络异常，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildQuery],
  );

  useEffect(() => {
    void loadUsers(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patchStatus(user: AdminUserItem, status: "active" | "disabled") {
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setActionMessage(
          status === "disabled"
            ? `已禁用 ${user.username}，其全部会话已失效。`
            : `已启用 ${user.username}。`,
        );
        await loadUsers(null);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(describeError(body.error, "操作失败，请稍后重试。"));
    } catch {
      setError("网络异常，请稍后重试。");
    }
  }

  async function patchRole(user: AdminUserItem, role: "user" | "admin") {
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setActionMessage(
          role === "admin"
            ? `已将 ${user.username} 提升为管理员。`
            : `已将 ${user.username} 降级为普通用户。`,
        );
        await loadUsers(null);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(describeError(body.error, "操作失败，请稍后重试。"));
    } catch {
      setError("网络异常，请稍后重试。");
    }
  }

  async function resetPassword(user: AdminUserItem) {
    setError(null);
    setActionMessage(null);
    if (
      !window.confirm(
        `确认为 ${user.username} 生成临时密码？旧密码与全部会话将立即失效。`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          temporaryPassword: string;
          expiresAt: string;
        };
        setTempPassword({
          username: user.username,
          password: data.temporaryPassword,
          expiresAt: new Date(data.expiresAt).toLocaleString("zh-CN"),
        });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(describeError(body.error, "重置失败，请稍后重试。"));
    } catch {
      setError("网络异常，请稍后重试。");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">用户管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          管理注册账号的状态与角色；被禁用账号无法登录，所有会话立即撤销。
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadUsers(null);
              }}
              placeholder="按用户名搜索"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 focus:border-primary focus:outline-none"
          >
            <option value="">全部角色</option>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 focus:border-primary focus:outline-none"
          >
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
          <button
            type="button"
            onClick={() => void loadUsers(null)}
            className="cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-primary-hover"
          >
            查询
          </button>
        </div>
      </section>

      {actionMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {actionMessage}
        </div>
      )}
      {tempPassword && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-semibold">
            {tempPassword.username} 的临时密码（只显示这一次，请立即复制）：
          </p>
          <p className="mt-2 select-all font-mono text-lg tracking-wide">
            {tempPassword.password}
          </p>
          <p className="mt-2 text-xs">
            有效期至 {tempPassword.expiresAt}；用户登录后必须先修改密码。
          </p>
          <button
            type="button"
            onClick={() => setTempPassword(null)}
            className="mt-3 cursor-pointer rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            我已保存，关闭
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">用户名</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">强制改密</th>
              <th className="px-4 py-3">最近登录</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  没有匹配的用户
                </td>
              </tr>
            )}
            {items.map((user) => (
              <tr key={user.id} className="text-slate-700">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {user.username}
                </td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      user.status === "active"
                        ? "text-green-700"
                        : "text-red-600"
                    }
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.mustChangePassword ? "是" : "否"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString("zh-CN")
                    : "从未登录"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {user.id === currentUserId ? (
                      <span className="text-xs text-slate-400">当前账号</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void patchStatus(
                              user,
                              user.status === "active" ? "disabled" : "active",
                            )
                          }
                          className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        >
                          {user.status === "active" ? "禁用" : "启用"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void patchRole(
                              user,
                              user.role === "admin" ? "user" : "admin",
                            )
                          }
                          className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        >
                          {user.role === "admin" ? "降级为 user" : "提升为 admin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetPassword(user)}
                          className="cursor-pointer rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                        >
                          重置密码
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadUsers(nextCursor)}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            加载更多
          </button>
        </div>
      )}
    </div>
  );
}
