# WI-20260909-01：任务3/4最终分支集成

> Author: Jan
> Status: Blocked
> Updated: 2026-09-09

## Work Item

- ID：WI-20260909-01
- 关联PRD：任务3地区感知规划、任务4地区化政策案例库
- 关联需求：任务3/4 Definition of Done及交付治理
- 源分支：`origin/codex/task34-regional-case-rebuild`
- 目标分支：`origin/refactor/policy-ops-agent-platform`
- 前置：WI-20260907-02、WI-20260907-03和WI-20260907-04全部Accepted；源、目标分支均已推送且工作区干净

## 目标

在任务3、任务4和持久库受控替换全部验收完成后，以一个显式merge commit把最终集成分支完整合入重构分支。只合并`codex/task34-regional-case-rebuild`，不再单独合并`codex/task3-jurisdiction-planning`或`codex/task4-case-governance`。

## 范围

- 记录源SHA、目标合并前SHA、merge-base及目标分支独有提交。
- 在目标工作区执行`git merge --no-ff --no-commit origin/codex/task34-regional-case-rebuild`。
- 审查完整合并差异，验证migration顺序、文档状态、敏感信息和全项目门禁。
- 创建唯一提交`merge: 集成任务3与任务4地区化交付`并推送目标分支。
- 新增独立验收报告，记录命令、退出码、提交SHA、门禁及远端核对。

## 非目标

- 不合并、rebase、squash或cherry-pick两个旧任务分支。
- 不创建PR，不合并或推送`main`，不force-push。
- 不删除任何本地或远端分支。
- 不执行migration、数据库repair、案例替换、快照激活或其他持久库写入。

## 执行步骤

1. `fetch`远端并确认源、目标工作区干净，两个本地分支分别与其upstream一致。
2. 确认三个前置Work Item均Accepted，验收报告包含可复核的零skip门禁和持久库收尾证据。
3. 记录`sourceSha`、`targetBeforeSha`和`mergeBaseSha`；列出并审查目标分支在merge-base之后的独有提交。
4. 如目标存在未审查提交、任一前置状态不符或远端已前进，停止并重新复审，不使用旧SHA继续。
5. 在`refactor/policy-ops-agent-platform`工作区执行带`--no-ff --no-commit`的合并。
6. 出现任何冲突立即执行`git merge --abort`并停止；不得猜测解决或部分提交。
7. 无冲突时检查完整暂存差异、0015→0018 migration/journal顺序、README/PROGRESS/Work Item状态和新增文本凭据特征。
8. 运行完整Node、显式隔离PG17+pgvector数据库零skip、Chromium E2E、TypeScript、ESLint、Build、Python、Gitleaks、Secret和allowlist门禁。
9. 门禁通过后更新本Work Item、README、PROGRESS、ROADMAP、OPERATIONS、traceability及独立集成验收报告。
10. 创建指定merge commit，推送`origin/refactor/policy-ops-agent-platform`，核对本地HEAD、upstream和远端SHA一致。

## 失败与回退

- 合并提交前任一冲突、门禁失败或差异异常均使用`git merge --abort`恢复目标分支。
- 合并提交后但推送前失败，不改写历史；保留提交并报告，不执行force-push。
- 推送后发现问题使用新的revert修复流程，不重写目标分支历史。
- 本Work Item不授权数据库回退；持久库回退仍受WI-20260907-04权限边界约束。

## 验收条件

- merge commit恰有目标分支合并前HEAD和最终集成分支sourceSha两个父提交。
- 最终树包含Agent 1、Agent 2、Agent 3的全部已验收交付。
- 两个旧任务分支的tip均未作为本次merge parent再次引入。
- 完整门禁新鲜通过，数据库测试显式使用隔离URL且零skip。
- 远端`origin/refactor/policy-ops-agent-platform`精确指向本次merge commit。
- 三个`codex/*`分支保留；`main`和持久库均未被本Work Item修改。

## 文档与证据

- 合并完成后创建`docs/refactor/policy-ops-agent/reports/task34-final-integration/acceptance-report.md`。
- 同步`docs/refactor/policy-ops-agent/reports/README.md`，不得提前填写PASS或虚构merge SHA。
- Agent执行提示词只在对话中交付，不写入本Work Item或其他开发文档。
