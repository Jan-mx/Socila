# PRD目录

> Author: Jan
> Status: Active
> Updated: 2026-09-03

## 用途

本目录保存产品级、Feature级和Stage级需求文档，回答“为什么做、为谁做、必须实现什么、如何验收”。

PRD不记录日常执行日志、测试退出码和提交历史。

## 当前PRD

| 文件 | 用途 | 状态 |
| --- | --- | --- |
| `09-01-policy-ops-agent.md` | PolicyOps Agent当前产品需求和边界 | Active |
| `09-03-stage-runtime-configuration-remediation.md` | 本地运行配置、备份恢复与凭据整改 | Active |
| `09-03-feature-core-agent-service-jwt.md` | Core与Agent双向服务JWT鉴权 | Accepted |

## 何时创建PRD

- 新增完整用户流程或产品能力：创建Feature PRD。
- 涉及多个阶段、多个服务或多个里程碑：创建Stage PRD。
- 修改认证、权限、数据边界或对外契约：更新对应PRD。
- 中型任务使用Work Item，不创建完整PRD。
- 明确Bug或内部重构关联现有需求，不创建新PRD。

## 命名

所有PRD文件名前必须添加首次创建日期，格式为：

```text
MM-DD-name.md
```

示例：

```text
09-01-policy-ops-agent.md
09-05-policy-monitoring.md
10-12-feature-admin-review.md
```

具体规则：

- `MM`为两位月份。
- `DD`为两位日期。
- `name`使用小写英文和连字符。
- 日期使用PRD首次创建日期，后续更新不得修改文件名前缀。
- 同一产品后续修改直接更新原PRD，不因修改日期重复创建文件。
- 不同PRD即使同日创建，也应通过不同的`name`区分。
- 完整年份记录在文档的`Updated`和Git历史中，不写入文件名。

推荐形式：

```text
MM-DD-<product-name>.md
MM-DD-feature-<feature-name>.md
MM-DD-stage-<number>-<stage-name>.md
```

## 必需内容

- Author、Status、Updated；
- 背景、目标用户和问题；
- 范围与非目标；
- 编号需求；
- 用户流程；
- 数据、接口和权限边界；
- 失败模式；
- 测试矩阵；
- 验收场景；
- Definition of Done。

## 状态

```text
Draft → Approved → Active → Superseded → Archived
```

需求发生变化时更新PRD及关联Work Item、架构和追踪记录，不在旧报告中修改历史结果。
