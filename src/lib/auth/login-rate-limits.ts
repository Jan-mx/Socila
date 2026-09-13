/**
 * 登录限流共享契约（09-02 AUTH-NFR-003；UAT修复2026-09-14）。
 *
 * 次数门槛不变，窗口由15分钟改为5分钟：
 * - 每IP：最多20次/5分钟（登录页动作层执行）；
 * - 每IP+规范化用户名：最多5次/5分钟（NextAuth authorize层执行）。
 * 登录页限流提示精确为 LOGIN_RATE_LIMITED_MESSAGE。
 */

/** 每IP登录尝试上限（次数不变）。 */
export const LOGIN_IP_RATE_LIMIT = 20;
/** 每IP限流窗口：5分钟。 */
export const LOGIN_IP_RATE_WINDOW_MS = 5 * 60 * 1000;

/** 每IP+规范化用户名登录尝试上限（次数不变）。 */
export const LOGIN_USER_RATE_LIMIT = 5;
/** 每IP+规范化用户名限流窗口：5分钟。 */
export const LOGIN_USER_RATE_WINDOW_MS = 5 * 60 * 1000;

/** 登录页限流提示（AUTH-NFR-003）。 */
export const LOGIN_RATE_LIMITED_MESSAGE = "请求频繁，请五分钟后再尝试。";
