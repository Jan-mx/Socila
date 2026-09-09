# PRD目录

> Author: Jan
> Status: Active
> Updated: 2026-09-09

## 用途

本目录保存产品级、Feature级和Stage级需求文档，回答“为什么做、为谁做、必须实现什么、如何验收”。

PRD不记录日常执行日志、测试退出码和提交历史。

## 当前PRD

| 文件 | 用途 | 状态 |
| --- | --- | --- |
| `09-01-policy-ops-agent.md` | PolicyOps Agent当前产品需求和边界 | Active |
| `09-03-stage-runtime-configuration-remediation.md` | 本地运行配置、备份恢复与凭据整改 | Active |
| `09-03-feature-core-agent-service-jwt.md` | Core与Agent双向服务JWT鉴权 | Accepted |
| `09-05-feature-socila-naming-regional-dsl.md` | Socila活动命名统一、地区DSL分层与粤川示例测试化 | Active |
| `09-05-stage-national-baseline-regional-overlays.md` | CN、上海、广东首期权威政策交付；四川Deferred | Accepted |
| `09-05-feature-case-library-governance.md` | 上海/广东确定性政策案例库全量重建 | Reopened（第三轮复审） |
| `09-05-feature-jurisdiction-aware-planning.md` | 用户规划按地区日期快照触发 | Accepted |

## 全国政策能力执行顺序

任务2首期保持Accepted；任务3、任务4原并行交付经独立复审后改为顺序修复：

```text
Socila命名统一与地区DSL分层
  → 任务2：CN、上海、广东权威政策与候选快照
  → 任务3：修复真实入口、领取地市和日期快照
  → 任务4：全量退役旧案例并重建上海/广东确定性政策案例
  → 持久库repair-forward（另行明确授权）
  → 最终集成分支合入重构分支
```

- 第一阶段只整理协议、命名、Seed和测试数据边界，不新增真实粤川政策。
- 任务2首期只交付CN、上海、广东经权威来源验证的候选快照，不直接开放用户地区流量；四川按ADR-0010延期且保持blocked。
- 任务4必须消费任务3修复并验收的日期快照；两者不再并行。
- 旧851/117语料及500条旧回归测试完整归档后退出运行库；新案例数由覆盖manifest确定，公开36条固定上海18、广东18。
- 新案例使用确定性模板，不使用LLM或真实用户数据；CN只做内部基线，四川只做unsupported负例。
- 持久库已经执行替换并处于36/36/78，但归档manifest、迁移账本和恢复证据尚未可信闭环；当前冻结写入，未经fresh audit和新授权不得repair或回退，最终分支合并保持Blocked。

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

## Agent提示词规则

开发提示词只在对话中提供，不写入PRD。PRD只记录需求、边界、接口、验收标准和授权条件；长期规则放在README中，不复制可执行提示词。
