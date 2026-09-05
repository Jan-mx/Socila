# PRD目录

> Author: Jan
> Status: Active
> Updated: 2026-09-05

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
| `09-05-stage-national-baseline-regional-overlays.md` | 国家baseline及广东、四川权威核心政策overlay | Draft |
| `09-05-feature-case-library-governance.md` | 案例库精简、质量治理与原始数据归档 | Draft |
| `09-05-feature-jurisdiction-aware-planning.md` | 用户规划按地区活动快照触发 | Draft |

## 全国政策能力执行顺序

全国政策与案例治理PRD具有强前置依赖，不得倒序宣称完成：

```text
Socila命名统一与地区DSL分层
  → 国家baseline及广东、四川权威overlay
  → 案例库精简、质量治理与原始数据归档
  → 用户规划按地区快照触发
```

- 第一阶段只整理协议、命名、Seed和测试数据边界，不新增真实粤川政策。
- 第二阶段只交付经权威来源验证的候选快照，不直接开放用户地区流量。
- 案例治理使用候选快照校验案例，形成452/36/528和可恢复归档。
- 地区规划只激活已通过政策与案例门禁的地区，缺失地区不得默认上海。

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
