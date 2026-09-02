/**
 * identity 请求/响应契约（09-02 §9）。
 *
 * 严格模式：注册请求中出现 role、status 或其他未登记字段直接拒绝（AUTH-FR-001）；
 * 管理写请求的 role/status 只接受固定枚举。框架无关，供 Route Handler 消费。
 */
import { z } from "zod";

export const RegisterRequestSchema = z.strictObject({
  username: z.string(),
  password: z.string(),
});

export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: z.string(),
  newPassword: z.string(),
});

export const ADMIN_ROLES = ["user", "admin"] as const;
export const ADMIN_STATUSES = ["active", "disabled"] as const;

export const AdminUserListQuerySchema = z.strictObject({
  q: z.string().min(1).max(64).optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  status: z.enum(ADMIN_STATUSES).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const AdminStatusPatchSchema = z.strictObject({
  status: z.enum(ADMIN_STATUSES),
});

export const AdminRolePatchSchema = z.strictObject({
  role: z.enum(ADMIN_ROLES),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type AdminUserListQueryInput = z.infer<typeof AdminUserListQuerySchema>;

/** 注册响应（§9.2）：成功 201；界面跳转 /login?registered=1，不自动登录。 */
export interface RegisterResponse {
  user: {
    id: string;
    username: string;
    role: "user";
  };
}

/** 管理员用户列表项：不含 passwordHash / normalizedUsername 等内部字段。 */
export interface AdminUserListItem {
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
