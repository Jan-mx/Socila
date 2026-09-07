# 任务3地区感知规划独立复审报告

> Status: Reopened
> Date: 2026-09-07
> Scope: 分支`codex/task3-jurisdiction-planning`提交`24b0119`、`33af7ad`的只读复审

## 结论

任务3实现主体和0015可以复用，但原Accepted结论撤销。持久库已执行0015并激活上海、广东是历史事实，不代表当前JRP退出门禁通过。修复路径由WI-20260907-02定义。

## 阻断发现

| 等级 | 发现 | 影响 |
| --- | --- | --- |
| P1 | 新ChatPanel本地生成ID，但会话只在首次chat请求创建；地区确认先查询会话并返回404 | 新用户不能按设计先选地区再规划 |
| P1 | 公开Plan/AI Schema没有`profile.claim_city_code`，测试直接注入内部`claim_city` | 广东失业金额无法从真实入口触发 |
| P1 | active广东snapshot为2026-09-07且不含2030医保参数，规划却接受任意`as_of_date` | 2030男30/女25承诺无法由当前活动snapshot兑现 |
| P1 | 激活只检查存在/地区/成员/冲突，直接写`snapshot_replay=pass` | 引用、Schema、依赖、黄金、重放和hash门禁可被绕过 |
| P1 | compute不重算snapshot内容hash，也不验证完整gateResults | 篡改或不完整门禁不能fail-closed |
| P1 | 历史测试只检查saved snapshot ID，未实际重放 | JRP-FR-014未实现 |
| P1 | 缺少停用application/API和直接规划页面 | 管理回退和双入口不完整 |
| P2 | 验收报告同时保留“未执行”和“已执行”持久操作表述 | 状态事实易被误读或重复执行 |

## 已确认可复用部分

- 地区画像候选/确认基础结构、快照成员编排、plans地区留痕和0015表结构。
- 四川无release时返回unsupported的fail-closed方向。
- 分支工作区与远端同步；复审期间目标单元与完整Node单元可通过，但现有测试没有覆盖以上反例。

## 当前边界

- 本报告不修改任务3分支或持久库。
- 0015/沪粤active记录不得重复执行。
- 只有WI-20260907-02取得专用Red/Green、完整E2E和独立复审后，任务3才能恢复Accepted。
