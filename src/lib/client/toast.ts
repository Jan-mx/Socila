"use client";

/**
 * 极简全局错误提示。
 *
 * 在页面右下角插入一条 4 秒后自动消失的红色提示，供 admin 各页的写操作在失败时
 * 统一调用，避免静默吞错。用内联样式而非 Tailwind class，免去对编译产物的依赖。
 */
export function showError(message: string): void {
  if (typeof document === "undefined") return;

  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute("role", "alert");
  el.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:9999",
    "max-width:360px",
    "padding:12px 16px",
    "border-radius:12px",
    "border:1px solid #fecaca",
    "background:#fef2f2",
    "color:#b91c1c",
    "font-size:14px",
    "line-height:1.5",
    "box-shadow:0 4px 16px rgba(0,0,0,0.12)",
  ].join(";");

  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 4000);
}
