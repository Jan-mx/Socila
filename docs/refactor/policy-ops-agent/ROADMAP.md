# PolicyOps Agent未来开发路线图

> Author: Jan
> Status: Active
> Updated: 2026-09-05

## 状态说明

| 状态 | 含义 |
| --- | --- |
| Candidate | 已识别但尚未批准排期 |
| Planned | 已确认进入后续开发 |
| Blocked | 规格已确定，但前置PRD尚未Accepted |
| In Progress | 正在执行 |
| Done | 已完成并有证据 |

路线图不是完成证明。实际进度以[PROGRESS](./PROGRESS.md)和对应Work Item/PRD为准。

## Now

| 方向 | 状态 | 成功条件 |
| --- | --- | --- |
| 文档分类与低上下文读取改造 | Done | 当前事实、报告和归档分离，README路由可用 |
| Socila命名统一与地区DSL分层 | Done | `SOCILA-DSL-1.0`与地区Manifest稳定，粤川示例退出生产Seed，上海黄金结果无漂移 |
| 国家baseline及粤川权威overlay | Planned | CN、上海、广东、四川核心政策具有官方引用、显式overlay、黄金测试和候选快照；依赖命名Feature Accepted |
| 案例库精简、质量治理与原始数据归档 | Blocked | 依赖权威政策Stage候选快照；完成452/36/528、来源链和真实恢复归档 |
| 用户规划按地区快照触发 | Blocked | 依赖案例治理Accepted；地区代码必填，逐地区消费活动快照且绝不默认上海 |
| 远程Personal Demo服务器部署 | Planned | 目标服务器全栈healthy、域名/HTTPS和离机备份验证 |
| 首批公开政策采集与RAG建库 | Planned | 白名单来源原件、DocumentTree、Chunk和索引形成闭环 |
| 完整真实Agent闭环观察 | Planned | 真实政策从采集到管理员审核和Core draft可追踪完成 |
| CI补齐Python、容器和真实SiliconFlow门禁 | Planned | 受信任分支push后相关Job稳定通过 |

## Next

| 方向 | 状态 | 成功条件 |
| --- | --- | --- |
| Chat SSE数据库故障语义 | Candidate | 流式接口故障具有稳定、可恢复且可测试的协议 |
| 文档追踪自动化 | Candidate | PRD/Work Item、测试路径、报告和README状态可自动校验 |
| RAG黄金集持续扩充 | Candidate | 四地区覆盖养老、医保、失业、补贴和废止政策 |

## Later

| 方向 | 状态 | 触发条件 |
| --- | --- | --- |
| Future Production Profile | Candidate | 需要正式SLA、RPO、RTO或真实长期业务 |
| 连续WAL与异地恢复 | Candidate | Personal Demo每日备份不足以满足恢复目标 |
| 多管理员审批和企业身份 | Candidate | 需要四眼审批、SSO或更严格职责分离 |
| 多机与高可用 | Candidate | 并发持续超过5、用户显著超过100或单机阈值频繁触发 |

## 排期规则

- Candidate转为Planned前创建Feature PRD或Work Item。
- 涉及政策口径的任务必须以权威来源为依据。
- 涉及生产迁移、停写、域名切换、删除和Secret轮换时必须再次获得用户授权。
- 不通过降低测试、引用、安全或资源门禁缩短交付时间。
