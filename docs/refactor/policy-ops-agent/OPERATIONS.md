# PolicyOps Agent运行与恢复

> Author: Jan
> Status: Active
> Updated: 2026-09-07

## 当前Profile

Personal Demo面向个人展示和试用：总用户不超过100、并发不超过5、单机4核4GB，不承诺正式SLA、RPO或RTO。

本机是开发机，socila生产Compose数据卷保留但不常驻；远程服务器部署仍在路线图中。开发测试需要时启动`infra/dev/docker-compose.dev.yml`（09-05 SDL-FR-009起容器/卷/网络命名为`socila-pg-dev`等；历史`ssp-*`开发资源不自动删除，需要时由运维人工处置）。

## 服务预算

| 服务 | 内存预算 |
| --- | ---: |
| Reverse Proxy | 64MB |
| Next.js | 512MB |
| FastAPI | 384MB |
| Parser/Celery Worker | 768MB |
| PostgreSQL | 768MB |
| Redis | 128MB |
| MinIO | 256MB |
| 系统和余量 | 约1GB |

OCR、批量索引和migration不得同时运行。Worker使用concurrency=1、prefetch=1、max_tasks_per_child=20和120秒默认任务超时。

## 网络

- Caddy是唯一外部入口。
- Next.js只通过内部网络访问FastAPI。
- PostgreSQL、Redis、MinIO和FastAPI默认不对公网开放。
- 本地调试端口不等于生产公开端口；服务器防火墙仍需限制访问来源。
- 宿主HTTP代理可能拦截localhost，健康检查应明确设置no_proxy。

## 资源保护

- 内存持续5分钟超过90%：暂停后台任务。
- 磁盘超过80%：停止采集和新索引。
- PostgreSQL连接超过池上限80%：暂停后台数据库任务。
- Celery积压超过50：暂停新来源调度。
- 连续OOM：将对应格式转到开发机离线处理，不自动提高限制。

## 日常检查

```bash
docker compose -f infra/prod/docker-compose.yml ps
docker stats --no-stream
docker compose -f infra/prod/docker-compose.yml logs --tail 100 web agent worker beat
```

同时检查磁盘、PostgreSQL连接、Celery积压、`/api/health`、`/internal/health`和最近备份。

## 备份与恢复

- 每日执行`infra/prod/backup.sh`，生成PostgreSQL dump并同步MinIO。
- 备份必须离开Demo服务器并保留14天。
- 公开演示前至少执行一次`infra/prod/restore-verify.sh`。
- 恢复后检查数据库记录、MinIO对象、Checkpoint、规划黄金结果和服务健康。
- 恢复点和耗时写入报告，作为Future Production容量输入。
- 本地开发机：`backup/db/`保存本机新鲜dump（Git忽略，不提交、不替代服务器备份）。

### PostgreSQL口令轮换runbook（09-03 CFG-FR-007/008）

严格串行，任何一步失败即停止并恢复原状：

1. 新鲜备份：`pg_dump -Fc`写入`backup/db/`并生成SHA-256清单；随后在临时PG17+pgvector容器中真实恢复，逐表行数必须与备份前基线完全一致（**必须先于口令轮换完成**）。
2. 停止依赖数据库的服务（web/agent/worker/beat）；**不得**停止或删除`socila_pg-data`，**不得**执行`down -v`。
3. 生成新口令（≥32随机字节、URL安全）仅保存在内存/临时文件，任何日志、报告、argv不得出现明文；临时轮换文件用完即删。
4. 经stdin执行`ALTER ROLE`（不进进程列表），验证新口令TCP连接成功、旧口令被拒绝。
5. 原子替换私有env文件（`infra/prod/.env`与`.env.local`：`POSTGRES_PASSWORD`、`DATABASE_URL`、`AGENT_DATABASE_URL`），替换前校验临时文件内容。
6. 重建服务；Compose与宿主migration各执行两次确认幂等；`/api/health`、`/internal/health`与容器健康检查全部通过。
7. 轮换后逐表行数对账必须与备份前基线一致；不一致即按恢复流程回滚并上报。

### 服务JWT Secret轮换runbook（09-03 SJWT-FR-007）

current/previous双Secret支持无中断轮换，严格串行，任何一步失败即停止并恢复原状：

1. 生成新Secret（≥32随机字节、URL安全）只保存在私有env文件；任何日志、报告、argv不得出现明文；临时轮换文件用完即删。
2. 更新全部四个消费者（web/agent/worker/beat）到同一组值：`AGENT_SERVICE_JWT_PREVIOUS`=旧current、`AGENT_SERVICE_JWT_CURRENT`=新Secret；不得有服务停留在旧值。
3. 按依赖顺序重启服务（web、agent、worker、beat）；模块级校验（SJWT-AC-010）保证缺失或无效值时进程启动失败，不存在带病运行的服务。
4. 重启后执行双向冒烟：`/internal/health`豁免可用、双向合法调用200、缺失/伪造/错误方向统一401、一次业务写JTI入台账；存量旧令牌在TTL 300秒+30秒偏差窗口内经`previous`继续通过验证。
5. 旧令牌窗口完全过期（≥5.5分钟）后，清空`AGENT_SERVICE_JWT_PREVIOUS`并再次重启四个服务。
6. `previous`命中只进入内部指标（签发/验证/401/重放计数），不向客户端输出；连续鉴权失败或重放在短窗口内超过阈值时按安全告警处理，不自动轮换Secret。

重放表在消费时机会式清理过期行，无需独立维护任务；两端migration（drizzle/0009、agent 0007）均可安全重跑；`agent.migrate --with-roles`重跑会自动重建`agent_app`角色对`agent.service_jwt_replays`的最小读写授权。回退旧镜像时保留两个重放表，不得删表或清理已记录JTI（SJWT §9）。

## 故障处理

| 故障 | 处理 |
| --- | --- |
| Web不可用 | 检查proxy/web健康和日志，必要时仅重启web |
| Worker OOM | 暂停队列、检查文件类型，转离线处理 |
| PostgreSQL不可用 | 停止后台写入，恢复服务后从Checkpoint继续 |
| SiliconFlow 401/403 | 不重试，检查Secret状态但不输出值 |
| SiliconFlow 429/503/超时 | 有限退避重试，超过上限进入人工处理 |
| 模型下线 | 暂停新任务，不自动切换未知模型 |

## 服务器部署门禁

1. 准备服务器Secret和离机备份目标；`AUTH_REFRESH_PEPPER`是Compose必填变量（`:?`插值，缺失即拒绝启动），且必须与`NEXTAUTH_SECRET`为不同值（应用启动时二次拒绝相同值，ADR-0007）；`AGENT_SERVICE_JWT_CURRENT`在web/agent/worker/beat四个服务必填（≥32 UTF-8字节，缺失、无效或与previous相同即启动失败，SJWT-AC-010），`AGENT_SERVICE_JWT_PREVIOUS`可选（双窗口轮换）。
2. 验证Compose配置（`docker compose --env-file .env config`）、镜像版本、网络、资源和健康检查。
3. 执行migration（含0008_auth_identity与0009_service_jwt_replays；Agent侧重放表由migrate服务随`agent.migrate --with-roles`应用0007并重建`agent_app`最小授权），再执行`node scripts/bootstrap-admin.mjs`幂等引导Jan管理员，然后启动完整服务。
4. 运行登录、规划、Agent、RAG、Worker和Beat冒烟；登录冒烟使用引导账号经`/login`（数据库事实），环境凭据仅服务一次性引导。
5. 执行一次备份及恢复验证。
6. 记录域名、HTTPS、部署版本（当前代码基线v0.2.0：PolicyOps+Auth）、恢复点和实际耗时。

生产迁移、停写、入口或DNS切换、删除数据和Secret轮换必须获得用户明确授权。

历史演练与切换细节见[Stage 07报告](./reports/stage-07/acceptance-report.md)和[Runbook](./reports/stage-07/runbook.md)。

## 阶段E 受控物化runbook（09-05 NRP，仅本机policyops）

> **历史状态（2026-09-07执行前）**：WI-20260906-02已完成0014和四包repair；当时新增广东资产会导致fresh audit错误重放四地区整包并规划74/116/9/8。该问题已由广东delta实现修复并完成受控apply、管理员批准和候选快照重放。当前结果见验收报告§17；未来任何政策变更仍必须基于当前HEAD fresh audit并取得单独明确授权。

1. 只读基线核对（规则/参数/规则集/案例计数与仓库权威资产清单）。
2. 完整备份：`docker exec socila-postgres pg_dump -U postgres -Fc policyops > backup/db/policyops-stage-e-pre-<ts>.dump`并生成SHA-256清单（backup/为Git忽略）。
3. 全新PG17+pgvector容器真实恢复：`cat <dump> | docker exec -i <容器> pg_restore -U postgres -d postgres --clean --if-exists`。
4. 逐表对账：`DATABASE_URL=<源库> TARGET_DATABASE_URL=<恢复库> node scripts/restore-reconcile.mjs`——任一表不符即禁止后续步骤。
5. 显式migration：`DATABASE_URL=<policyops> node scripts/run-migrations.mjs`（禁止dotenv回退）。
6. audit：`npx tsx scripts/materialize-policy-regions.ts audit`（只读，输出manifestHash/targetFingerprint/计划/幂等标志）。
7. 历史首次apply：`npx tsx scripts/materialize-policy-regions.ts apply --i-am-authorized --manifest-hash <audit输出> --target-fingerprint <audit输出>`——曾用于单事务四地区draft写入；后续增量不得直接复用首次全量计划，改走下方广东delta runbook。
8. 复核：固定计数、published行哈希、`scripts/planning-regression.ts`（与物化前输出一致）、`GET /api/admin/policy-coverage`地区就绪状态。
9. 同manifest重复apply为幂等no-op；连接串/口令不得出现在日志、manifest、审计表或Git（NRP-NFR-009）。
10. 包快照修复（审查缺陷4/WI-20260906-01已加固）：仅在WI-20260906-01 Accepted且取得本次明确授权后，先显式应用0014，再基于当前HEAD重新audit（repair目标指纹已绑定全部draft包行ID/地区/pack ID/版本/状态/快照哈希/成员哈希，audit后任何draft变化都会使指纹失配被拒）。执行`npx tsx scripts/materialize-policy-regions.ts repair --i-am-authorized --manifest-hash <同次audit的hash> --target-fingerprint <同次audit的fp>`（输出按实际修复数量报告，不固定声称4个）。repair在事务内`FOR UPDATE`锁定全部绑定目标并重校验，与audit不一致时以`REPAIR_TARGET_CHANGED`零写入退出；保留原物化批次/成员（不可改写），每目标新增确定性`repaired`批次（由基础manifest哈希+地区+pack ID+版本+旧/新内容哈希生成）和一条新成员；readiness/阻断原因继承Manifest地区语义（粤川不得为空）；不改published或业务实体计数。成功后预期批次4→8、成员74→78。
11. repair后重新audit必须得到`packSnapshotDrift=[]`；使用新的audit输入复跑repair必须no-op。任一步出现状态、版本、旧哈希或指纹不一致即停止，不得覆盖并发编辑。
12. 对账必须以`scripts/restore-reconcile.ts`的目录驱动结果为准（public/drizzle/agent/rag全部BASE TABLE+sequence，当前37表+18 sequence），不得以部分表清单宣称"完整恢复"。repair前后分别保留备份，并对repair后备份执行新的37表+18 sequence真实恢复对账。

## 广东delta与三地区候选快照runbook（ADR-0010，已执行；未来变更沿用）

1. 每次未来变更先在代码和隔离库证明audit只规划预期地区delta；本次已证明广东5参数、1规则、1规则集版本、1政策包版本，CN、上海、四川和既有GD实体零新增。
2. 目标计数由当前指纹+delta计算，本轮候选快照前应为50/75/6/5/528/851/117/0；audit出现74/116/9/8或任何非GD新增即停止。
3. 代码提交并通过门禁后，创建新备份、SHA-256并在全新PG17+pgvector恢复，完成全部表与sequence对账。
4. 向用户报告fresh audit的目标、delta、版本、目标计数和回退点，另行取得本次增量apply授权；不得沿用历史WI-02或本次已使用授权。
5. apply后验证幂等、published整行哈希、planning-regression和恢复零漂移；广东转awaiting_approval，四川继续blocked。
6. 分别生成CN、上海、广东管理员审核包；本次三地区批准已完成，未来版本仍必须由管理员决定，不得由Agent推断或直接SQL代替。
7. 管理员批准完成后，只读列出三地区候选快照成员、版本、provenance和黄金结果；本次三地区候选快照已创建并重放，未来新快照仍需另行取得写入授权。
8. 创建后重复重放并验证隔离；四川无快照且不开放流量。案例删除和地区激活不包含在本runbook授权内。

## 任务3/4 Reopened运行边界（ADR-0011）

> 当前持久事实（2026-09-07，只读复审）：Drizzle账本16条，0015/0016已经执行；上海、广东release为active，四川0；`cases/showcase_cases/tests/policy_snapshots=452/36/528/6`。旧任务4已删除399/81，但case-library归档SHA无效、selection报告缺失、restore报告仍pending。禁止重复运行旧任务4apply。
>
> 2026-09-08：任务3与任务4代码修复均已Accepted（分支`codex/task34-regional-case-rebuild`）。代码库新增0017快照区间migration（`effective_from/effective_to`+EXCLUDE不重叠）与0018案例库重建migration（质量分解/多标签/批次applying/归档条目唯一约束），但**持久库尚未执行0017/0018**；日期快照调度、0017/0018执行、旧452/36/500删除与新N/36/N插入全部属于WI-20260907-04受控写入。

- WI-20260907-02与WI-20260907-03只允许代码、生成资产和隔离数据库测试（WI-02已Accepted，2026-09-08）。
- 0015/0016历史SQL不可改写；源journal校正不等于持久账本已repair。
- 0017/0018、日期快照调度、旧案例删除和新案例插入全部属于WI-20260907-04受控写入。
- 治理前/后完整dump保留在Git忽略目录；现有错误case-library归档不得作为恢复门禁PASS证据。
- 未获fresh明确授权时，不得修改迁移账本、创建/激活snapshot区间或写案例表。

## 地区化案例持久替换runbook（WI-20260907-04，当前Blocked）

### 阶段A：只读与隔离准备

1. 只读核对持久账本、0015/0016 SQL hash和时间、沪粤release、四川0发布及452/36/528/6。
2. 新建紧邻操作时间的完整dump和SHA，并在全新PG17+pgvector完成全部表与sequence恢复对账。
3. 在另一个全新实例恢复治理前dump，核对完整旧851/117/528与500旧回归来源。
4. 使用修复后的归档器生成完整库/三表dump、selection、精确manifest、restore report和真实文件SHA；再次从该归档恢复。
5. 在隔离库应用组合0015→0018，生成上海/广东日期snapshot和新`N/36/N+42`案例。
6. fresh audit必须绑定：旧当前452/36/500逐行hash、新N/36/N逐行hash、42条DSL示例、snapshot区间/hash、账本目标行和目标指纹。
7. 报告N、删除/插入UID集合摘要、manifestHash、targetFingerprint、备份和回退点，然后停止请求明确授权。

### 阶段B：受控写入

授权必须由用户在阶段A报告后明确给出，并精确覆盖本机`localhost:5432/policyops`：0015/0016时间账本repair、0017/0018、沪粤日期snapshot调度、删除旧452/36/500及插入manifest的N/36/N。旧授权、代码提交和本runbook本身均不构成授权。

1. 事务内按SQL hash、旧时间和目标指纹精确repair 0015/0016账本时间；任一不符零写入停止。
2. 执行0017、0018并复跑，第二次必须no-op。
3. 经完整管理员门禁写入上海、广东非重叠snapshot区间；四川保持0发布。
4. 重验旧完整归档、当前旧库子集和新案例manifest。
5. 使用批次行`FOR UPDATE`及`restore_verified→applying`条件转换，单事务替换旧案例、同步42条DSL示例并写审计。
6. 复跑相同manifest必须no-op；并发测试只能一组成功。
7. 验证最终`N/36/N+42`、沪粤18/18、质量分解、来源链、snapshot和公开/管理接口。
8. 创建操作后dump和SHA，在全新PG17+pgvector完成全部表、sequence和规范化hash对账。

任一步失败立即停止。事务提交后的恢复不包含在原授权中，必须报告差异并再次取得用户确认；不得默认把治理前dump恢复到持久库。
