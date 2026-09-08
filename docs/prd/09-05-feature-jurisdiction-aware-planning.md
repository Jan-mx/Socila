# 用户规划按地区快照触发 PRD

> Author: Jan
> Status: Reopened
> Updated: 2026-09-07

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-05-feature-jurisdiction-aware-planning.md` |
| 类型 | Feature |
| 状态 | Accepted（2026-09-08重开验收）；分支`codex/task34-regional-case-rebuild`完成WI-20260907-02全部修复并取得新鲜门禁 |
| 前置依赖 | 任务2首期Accepted；CN、上海、广东候选快照已存在；四川Deferred/Blocked |
| 后续消费者 | 地区化案例库重建Feature |
| 执行顺序 | 先完成本Feature修复，再开发地区化案例库；不再与任务4并行 |
| 退出门禁 | 真实用户入口、日期快照、发布门禁、历史重放、停用和地区隔离全部取得专用Red/Green与E2E证据 |

## 1. 背景与复审结论

任务3分支`24b0119`/`33af7ad`实现了地区画像、发布记录、快照驱动规划和0015，并已在本机持久库执行0015、激活上海与广东。复审确认代码主体可复用，但以下缺陷使Feature必须Reopened：

- 新会话尚未持久化时，地区选择器先调用确认接口会返回404。
- 广东失业待遇所需领取地市只在测试里以`user.profile.claim_city`注入，公开API和AI工具无法传入权威领取地市。
- 当前活动快照固定于2026-09-07，却允许任意`as_of_date`；广东2030参数不在该快照中。
- 激活用例没有真实执行引用、Schema、依赖、黄金、重放和内容哈希门禁，却直接记录`pass`。
- 规划执行不验证完整`gateResults`或快照成员内容哈希。
- 历史复算只证明旧plan的snapshot ID未变化，没有实际重放入口。
- 缺少停用应用用例/API和直接规划页面。

当前持久库0015和上海/广东active记录是审计事实，但不构成本PRD重新Accepted的证据。修复代码不得再次执行旧激活流程或改写持久库，持久执行由独立Work Item控制。

2026-09-08：WI-20260907-02全部修复完成并重新验收（分支`codex/task34-regional-case-rebuild`）——新会话预创建、`profile.claim_city_code`服务端规范化、0017快照区间（`effective_from/effective_to`+同地区不重叠EXCLUDE）、按`jurisdiction_code+as_of_date`唯一选择、2026/2030时间片派生、七道真实激活门禁、执行期hash与完整gateResults重验、历史plan真实重放API、停用API与`/plan/new`双入口、四川始终unsupported；0015/0016 SQL哈希不变，0017仅在隔离库执行。验收证据：`reports/feature-09-05-jurisdiction-planning/acceptance-report.md`（2026-09-08）。

## 2. 目标与非目标

### 2.1 目标

- 地区必须由用户明确确认并由服务端规范化，模型不能自动确认。
- 新会话可先创建、再选择地区、再计算，不产生404竞态。
- 规划按`jurisdiction_code + as_of_date`唯一选择已批准快照区间。
- 2026与2030广东请求使用不同的有效快照，2030使用男30年、女25年。
- 广东领取地市使用地级市行政代码，服务端解析后传入政策规则。
- 激活、切换、停用、历史重放和直接规划页面形成闭环。
- 四川始终返回`JURISDICTION_UNSUPPORTED`，不得读取上海或广东快照。

### 2.2 非目标

- 不修改任务2已发布政策含义或四川Deferred范围。
- 不允许客户端指定规则集、参数包、实体版本或snapshot ID。
- 不在本Feature生成或治理案例库。
- 不自动执行持久库migration、账本repair、快照创建或流量激活。

## 3. 功能需求

- **JRP-FR-001 必填地区**：直接规划API和AI`computePlan`必须携带稳定地区代码。
- **JRP-FR-002 地区树校验**：服务端重新解析代码、名称、层级和启用状态。
- **JRP-FR-003 禁止版本注入**：公开请求以strict Schema拒绝规则集、参数包、snapshot和未知字段。
- **JRP-FR-004 日期快照**：按地区和`as_of_date`读取恰好一个active快照区间，不使用“最新快照”隐式替代。
- **JRP-FR-005 发布记录**：保存地区、快照、生效起止日期、状态、完整门禁、操作者和时间。
- **JRP-FR-006 管理员操作**：只有新鲜管理员可激活、切换或停用；全部经过publishing application用例。
- **JRP-FR-007 完整激活门禁**：引用、Schema、参数依赖、冲突、黄金测试、两次重放和规范化内容哈希全部通过后才可active。
- **JRP-FR-008 快照执行**：规则、参数和顺序只从选中的不可变快照成员恢复。
- **JRP-FR-009 规划留痕**：plan保存地区、解析路径、snapshot ID/hash和`as_of_date`。
- **JRP-FR-010 双入口**：聊天和`/plan/new`在提交前使用同一服务端地区确认组件。
- **JRP-FR-011 AI约束**：AI只能提交地区候选；工具调用必须与会话已确认地区一致。
- **JRP-FR-012 文本候选**：自由文本只产生候选，零个或多个候选均要求用户确认。
- **JRP-FR-013 独立开放**：上海、广东按不重叠日期区间独立发布；四川无发布记录。
- **JRP-FR-014 历史复算**：历史plan始终按保存的snapshot ID/hash和日期重放，不随当前调度变化。
- **JRP-FR-015 地区画像**：会话保存服务端规范化的code/name/level/confirmedAt/source。
- **JRP-FR-016 候选确认**：只有地区选择器或明确确认接口能写`confirmed=true`。
- **JRP-FR-017 会话持久化**：恢复会话时恢复地区；无地区的旧会话必须重新确认。
- **JRP-FR-018 上下文一致性**：请求、画像、快照区间和plan地区必须一致，不一致返回409且零写入。
- **JRP-FR-019 地区切换**：保留历史消息，原子清除旧地区派生问题、缓存、plan和snapshot引用。
- **JRP-FR-020 能力级缺口**：广东2030年前医保退休地市年限缺失时只让该能力`needs_agent`，其他结果继续。
- **JRP-FR-021 会话预创建**：新增认证受控会话创建入口；选择器只能对已存在且归属当前用户的会话写入地区。
- **JRP-FR-022 领取地市代码**：公开画像使用`profile.claim_city_code`六位地级市代码；自由文本名称不能直接参与计算。
- **JRP-FR-023 城市规范化**：服务端确认代码属于广东启用地级市后，注入规则内部`claim_city`规范名称；未确认、非广东或未知代码均不计算金额。
- **JRP-FR-024 快照区间**：发布记录增加`effective_from/effective_to`，active区间必须闭合定义且同地区不重叠。
- **JRP-FR-025 时间片生成**：根据已批准规则/参数有效期边界确定性生成快照时间片，至少覆盖广东2026与2030窗口。
- **JRP-FR-026 执行期完整性**：每次计算重算成员规范化哈希，并确认完整门禁与当前快照hash一致。
- **JRP-FR-027 停用**：新鲜管理员可停用单一区间；停用不删除快照或历史plan。
- **JRP-FR-028 历史重放API**：owner可重放自己的plan；结果返回原快照元数据和漂移结论。
- **JRP-FR-029 迁移兼容**：0015/0016历史SQL不改；0017增加区间和约束，账本时间修复由独立受控Work Item执行。

## 4. 数据与接口

### 4.1 用户输入

```ts
type PlanningProfile = {
  jurisdiction: {
    code: "310000" | "440000";
    name: string;
    level: "province";
    confirmed: true;
    confirmedAt: string;
    source: "selector" | "conversation-confirmation";
  };
  profile?: { claim_city_code?: string };
};
```

`claim_city_code`只能由用户确认后保存。服务端内部可生成`claim_city`规范名称，但不得接受客户端直接提交该名称作为政策键。

### 4.2 快照区间

```ts
type JurisdictionSnapshotSchedule = {
  jurisdictionCode: string;
  snapshotId: string;
  snapshotContentHash: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "inactive" | "active";
  gateResults: Record<string, "pass">;
  activatedAt: string | null;
  activatedBy: string | null;
};
```

数据库必须拒绝同地区active日期区间重叠。无匹配或多匹配均映射409`POLICY_SNAPSHOT_UNAVAILABLE`。

### 4.3 对外入口

- `POST /api/conversations`：创建归属当前用户的空会话。
- `POST /api/conversations/:id/jurisdiction`：确认或切换地区。
- `POST /api/plan/compute`：按地区和日期计算，禁止版本注入。
- `POST /api/plan/:id/replay`：按保存快照重放owner的历史plan。
- `POST /api/admin/jurisdictions/:code/releases`：激活快照区间。
- `DELETE /api/admin/jurisdictions/:code/releases/:id`：停用区间。

## 5. 非功能需求

- **JRP-NFR-001 地区隔离**：跨地区实体混入率为0。
- **JRP-NFR-002 确定性**：相同输入、日期和snapshot产生逐字节一致结果。
- **JRP-NFR-003 Fail-closed**：地区、时间片、门禁、哈希或存储不确定时拒绝计算。
- **JRP-NFR-004 隐私**：规划数据不进入OCR、Embedding或Rerank。
- **JRP-NFR-005 可观测**：日志只记录脱敏用户ID、地区、snapshot、日期和稳定结果类别。
- **JRP-NFR-006 可回退**：调度可切回已验收snapshot，历史plan引用不变。
- **JRP-NFR-007 可测试**：地区树、时钟、快照和Repository经端口注入。
- **JRP-NFR-008 单一上下文**：客户端名称、AI候选和旧缓存不能覆盖服务端确认。
- **JRP-NFR-009 局部失败隔离**：单一政策能力缺参不得清空其他结果。
- **JRP-NFR-010 并发安全**：同地区区间激活串行裁决；重叠事务最多一组成功。

## 6. 迁移与发布顺序

- 源journal最终顺序固定：0015 idx14/`1788777720000`，0016 idx15/`1788785400000`，0017 idx16/`1788796800000`。
- 0015和0016 SQL内容已经在持久库执行，不得重写。
- 当前持久账本仍含未来时间戳；代码修复阶段只提供audit/repair工具和隔离测试，不修改持久账本。
- 新快照区间在代码验收后另行生成审核包，等待用户明确授权才可写入或激活。

## 7. 验收场景

- **JRP-AC-001** 新会话先创建再确认地区，不返回404。
- **JRP-AC-002** 缺少、未知或未确认地区拒绝且零plan。
- **JRP-AC-003** 版本字段注入和自由文本领取城市被拒绝。
- **JRP-AC-004** 2026与2030广东请求命中不同snapshot且结果分别符合能力边界。
- **JRP-AC-005** 时间片缺失、重叠、门禁缺项、hash漂移均fail-closed。
- **JRP-AC-006** 广东有效领取地市代码产生正确金额；缺失、未知、跨省代码只产生稳定问题且不估算。
- **JRP-AC-007** 激活真实运行全部门禁；伪造`pass`不能绕过。
- **JRP-AC-008** snapshot切换后历史plan仍按原snapshot逐字节重放。
- **JRP-AC-009** 停用广东不影响上海；四川始终unsupported且零快照读取。
- **JRP-AC-010** 聊天和直接规划页面使用相同确认、错误和结果契约。
- **JRP-AC-011** 两个重叠区间并发激活只有一组成功。
- **JRP-AC-012** 0017从零执行两次幂等，未修改0015/0016 SQL哈希。

## 8. Definition of Done

- JRP-FR-001～029、JRP-NFR-001～010和JRP-AC-001～012具有真实代码与测试映射。
- 新会话、领取地市、2026/2030、完整门禁、哈希漂移、历史重放、停用和直接页面全部有Red/Green。
- 上海、广东日期快照隔离通过；四川无发布记录。
- 0017只在隔离库执行；持久账本repair和快照调度未获授权时保持未执行。
- Node、数据库、Chromium E2E、TypeScript、ESLint、Build、Python和安全门禁全部新鲜通过且零skip。
- README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability和复审报告同步。

## 9. 关联任务

- `WI-20260907-02-task3-temporal-entry-hardening.md`：当前首要修复任务。
- `WI-20260907-03-regional-policy-case-rebuild.md`：本Feature重新Accepted后的下游。
- `WI-20260907-04-persistent-case-library-replacement.md`：前两项完成后的受控持久执行。
