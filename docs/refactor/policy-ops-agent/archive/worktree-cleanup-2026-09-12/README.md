# F盘Socila开发Worktree清理归档

> Status: Archived
> Date: 2026-09-12

## 来源与处理

- 主仓库基线：`refactor/policy-ops-agent-platform@0885613f2fbb68bf361d55c3b89694dc1024d1b4`。
- 归档来源：`F:\Socila-eval-worktree`，分支`codex/evaluation-suite@9170d5deb23c12ae585910c9411feb03586c19fd`。
- 该分支没有相对主仓库的独有已提交提交，但原工作目录包含两份未跟踪源码和`.superpowers/sdd`开发文档。
- 两份未跟踪源码与8份原始Markdown按原字节保存到Git忽略的`F:\Socila\backup\legacy-worktrees\Socila-eval-worktree-20260912\`，并以SHA-256清单核对；源码未写入`docs`。Git内的Markdown归档只规范化EOF空行，不改变正文。
- task3、task4和task34的Git文档路径均已存在于主仓库，主仓库版本包含后续修复，因此未复制旧版本覆盖。
- `F:\Socila-shanghai-case-v2`仍有未合并提交，不在本次清理范围。

## 归档文档

- [评测计划](./evaluation-suite-v1/plan.md)
- [执行进度](./evaluation-suite-v1/progress.md)
- [任务1简报](./evaluation-suite-v1/task-1-brief.md)
- [任务2简报](./evaluation-suite-v1/task-2-brief.md)
- [任务3简报](./evaluation-suite-v1/task-3-brief.md)
- [任务4简报](./evaluation-suite-v1/task-4-brief.md)
- [任务5简报](./evaluation-suite-v1/task-5-brief.md)
- [任务6简报](./evaluation-suite-v1/task-6-brief.md)

## 删除边界

用户明确选择删除`F:\Socila-task4`和`F:\Socila-task34-worktree`中的旧数据库dump、验收备份及错误命名dump。删除前文件名、大小和SHA-256记录在[删除备份清单](./deleted-backups-sha256.txt)。该清单只记录元数据，不包含数据库内容或凭据。

本次不删除任何Git分支，不触碰Docker、PostgreSQL、MinIO、数据卷、`main`、PR、tag或Release。
