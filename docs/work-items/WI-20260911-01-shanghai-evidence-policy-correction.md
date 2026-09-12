# WI-20260911-01：上海官方原文采集与政策纠偏

> Author: Jan
> Status: Reopened（代码与隔离证据已交付；MinIO运行时原件同步及独立复审待闭环）
> Updated: 2026-09-12

## Work Item

- ID：WI-20260911-01
- 关联PRD：`docs/prd/09-11-feature-shanghai-case-library-v2.md`
- 关联需求：SHV2-FR-001～007、SHV2-NFR-001/002/006/008
- 关联验收：SHV2-AC-001～005
- 前置：PRD提交`d7fd63a`；基线`0885613`
- 后置：WI-20260911-02（本Work Item未Accepted前不得开始验收）

## 背景与证据

2026-09-11只读核对：`dsl/regions/shanghai_dsl_v1/`的25个标量参数+2个表格全部只有`source: "policy"`/`"transcript"`/不完整文号伪引用，8条地方规则`evidence`均为空数组；`src/lib/dsl/citation-contract.test.ts`的`REGION_DIRS`只含`cn_dsl_v1/guangdong_dsl_v1/sichuan_dsl_v1`，上海从未进入引用契约。`reports/stage-09-05-national-baseline-overlays/evidence/310000/`下8个目录全部为空。

## 范围

1. 使用`scripts/capture-official-page.mjs`从白名单域名（`www.shanghai.gov.cn`、`rsj.sh.gov.cn`、`ybj.sh.gov.cn`）采集上海正式原文，每份保存`original.html`、`extracted-text.txt`、`http-headers.txt`、`meta.json`。
2. 上海加入引用契约扫描；全部活动参数/表格与政策承载规则evidence覆盖率100%；excerpt逐字存在于`extracted-text.txt`。
3. 按PRD §6.4纠正2026-09-01有效事实：缴费基数7546/37731（2026-07-01）、失业金2340/1872/1690（2026-07-01）、最低工资2740（2025-07-01）、灵活就业养老20%/医保10%、医保等待期6个月与≤3个月衔接豁免、退休职工医保累计超过15年、就业困难人员补贴一般不超过3年且距退休不足5年可延长至退休。
4. 移除或纠正：医保男25/女20口径、固定8年补贴延长、固定7/8月补差、`source="policy"/"transcript"`伪引用。
5. 历史值以`effective_from/effective_to`闭合窗口保留。
6. 新增`R-SH-UI-AMOUNT`与`R-SH-FLEX-CONTRIBUTION`，各至少一条黄金示例；上海example 9→11、全地区42→44。
7. 隔离库物化audit只规划上海预期delta，其他地区零漂移。

## 非目标

- 不写本机持久`policyops`；不代替管理员批准；不创建持久快照或切换release。
- 不修改广东、四川、CN政策含义。
- 找不到正式原文或含义不唯一的事实保持blocked，不猜测。

## 实现要求

1. 证据目录：`docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence/310000/<DOC-ID>/`。
2. DSL evidence结构含`document_id/jurisdiction_code/title/authority/official_url/fetched_at/content_sha256/artifact/parse_version/locator/excerpt`。
3. 参数多窗口同`param_id`并列，当前窗口列在最后（fresh seed与黄金夹具last-write-wins语义）。
4. 新规则加入`rules_manifest.json`与`rule_set_shanghai_plan_v1.json`（执行顺序：`R-SH-UI-AMOUNT`在`R-420`之后、`R-SH-FLEX-CONTRIBUTION`紧随其后）。
5. `R-SH-UI-AMOUNT`：缺领取阶段/资格不确定/无有效参数→`needs_agent`不估算。
6. `R-SH-FLEX-CONTRIBUTION`：基数越界→警告+`needs_agent`不截断；非灵活就业→`applicable=false`不伪造。
7. 冻结夹具（golden-snapshot、shanghai-reclassification-drift基线）因规则/参数合法变化重新生成并在验收报告记录差异原因。

## 测试矩阵（TDD Red先于实现）

| 场景 | 通过条件 |
| --- | --- |
| 上海加入citation contract | 27+新增参数/表与8+2规则100%覆盖 |
| 缺原件/SHA错误/URL错误/摘录不存在 | 稳定失败（citation-verifier反例） |
| 参数有效期边界 | 2026-06-30取旧值、2026-07-01取新值；无重叠 |
| 三档失业金 | 第1-12月2340、13-24月1872、延长1690 |
| 灵活缴费 | 7546×20%=1509.2、×10%=754.6、合计2263.8；缺基数/越界→needs_agent |
| 上海example | 11条；全地区44条 |
| 物化audit | 隔离库只规划上海delta，CN/GD/SC零新增 |

## 验收与回退

- SHV2-AC-001～005新鲜证据；`npm test`零skip；`test:db`随机端口PG17+pgvector零skip。
- 本Work Item只交付代码、证据文件与隔离证据；无持久库写入，无回退需求。

## 文档同步

- PRD §22边界、traceability、TESTING、ARCHITECTURE（引用契约范围）、PROGRESS。

## 独立审查补充（2026-09-12）

- Git证据目录中的23份上海原件不能替代架构规定的MinIO运行时原件；当前采集脚本只写本地`docs/.../evidence`，尚未完成`policy-originals/originals/<sha256>`上传和RAG `object_key`对账。
- 任务验收不得把“证据文件已提交”表述为“MinIO原件已入库”。
- 闭环条件：每份原件在MinIO存在同字节对象，bucket/key、对象SHA、`meta.json`和RAG数据库记录一致，并有恢复演练证据。
