export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-border bg-card/95">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3.5 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-[0.95rem]">
        <p>结果用于辅助决策，实际办理以官方政策窗口解释为准。</p>
        <p>&copy; {new Date().getFullYear()} 社保规划助手 · 数据来源：人力资源和社会保障部门</p>
      </div>
    </footer>
  );
}
