# PolicyOps Agent运行与恢复

> Author: Jan
> Status: Active
> Updated: 2026-09-12

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

## 任务3 Accepted、任务4/WI-04 Reopened运行边界（ADR-0011）

> 当前持久事实（2026-09-07，只读复审）：Drizzle账本16条，0015/0016已经执行；上海、广东release为active，四川0；`cases/showcase_cases/tests/policy_snapshots=452/36/528/6`。旧任务4已删除399/81，但case-library归档SHA无效、selection报告缺失、restore报告仍pending。禁止重复运行旧任务4apply。
>
> 历史时点（2026-09-09第二轮修复前）：任务3与任务4代码曾同时Reopened，0017/0018尚未执行。后续实际执行及当前第三轮结论见下一段。
>
> 2026-09-09持久执行历史：本机已变为36/36/78并写入0017/0018及沪粤日期快照，pre/post备份文件SHA与sidecar一致。第三轮复审撤回Accepted：账本实际21条、旧test归档hash为空、restore明细为空、applied manifest声明85 tests而当前实际78。当前冻结写入，禁止重跑stage-a/stage-b、恢复pre dump或执行最终合并。

- WI-20260907-02保持Accepted；WI-20260907-03与WI-20260907-04均Reopened。任务4修复只允许代码、生成资产、隔离数据库测试和当前库只读审计。
- 0015/0016历史SQL不可改写；源journal校正不等于持久账本已repair。
- 0017/0018、日期快照调度和案例替换已经发生，但验收因账本/manifest/归档缺口撤回；后续只允许WI-04 repair-forward，不得重跑旧替换。
- 治理前/后完整dump保留在Git忽略目录；现有错误case-library归档不得作为恢复门禁PASS证据。
- 未获fresh明确授权时，不得修改迁移账本、创建/激活snapshot区间或写案例表。

## 历史地区化案例持久替换runbook（WI-20260907-04，已执行但验收撤回）

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

## 当前repair-forward门禁（WI-20260907-04，已执行，等待复审）

1. 冻结当前36/36/78、10条snapshot；迁移账本已由repair-forward修复为18条（2026-09-10）、归档批次4个（2 applied+1 rolled_back+1 restore_verified）；旧stage-a/stage-b脚本仅作历史证据，不得重跑。
2. 代码层修复已完成（2026-09-10第三轮+第四轮+第五轮）：旧test真实hash、manifest自校验、SHA/selection/restore完整验证、42 example原子同步（第三轮）；**第四轮**——prepare-archive补偿（失败不留prepared批次/entries、只精确清理本次batchId、补偿错误与原始错误同报）、applied幂等重验（applied先完整重验manifest正文hash/批次hash/最终N/36/N+42/42 example/逐行hash，完全一致才noop，任一漂移稳定错误零写入）、migration换行契约（`.gitattributes` eol=lf，Drizzle读取hash===Git blob LF SHA）、迁移审计语义（blob/raw/LF/CRLF/账本/仅EOL/真实差异+journal与账本时间严格单调核对）；**第五轮**——journal非单调修复（`drizzle/meta/_journal.json`：0010～0014 when修正为1788560000000/1788600000000/1788640000000/1788680000000/1788705240000，0015～0018不变，idx/tag不变、SQL零修改、全部18条严格递增）、migration账本回归（`scripts/rcl-ledger-regression-task34.mjs`：隔离库删除18/19/20后migration×2 no-op等8项）、审计journal不符由仅报告改为阻断、归档目录保护（`prepareRclArchive`拒绝覆盖历史归档）。随机端口隔离PG17+pgvector `npm run test:db` 26文件/141零skip；`npm test` 74文件/720零skip。
3. 只读恢复pre/post dump已完成：当前库vs post恢复库仅`auth_refresh_sessions`运行期差异（40表+20 sequence其余一致）；pre dump重建旧452/36/500可信归档已永久保存至`F:/Socila/backup/case-library/task34-r4-trusted-old-2026-09-10T06-59-14/`（manifestHash `da0ea94d…`、500 test hash全部非空、verified restore-report 40表+20 sequence、sha256sums恰好7文件、第三库二次对账一致；目录永久保留，不得删除）。**第五轮只读复验**（2026-09-10）：8文件完整、SHA全部匹配、manifest 452/36/500、500 test hash全部非空、restore 40表/20 sequence/零mismatch、第三库再次恢复一致（40表/20 sequence/零mismatch），目录未覆盖未删除。
4. 当前36/36/78 attestation manifest已生成并绑定代码提交`1fe702b…`（attestationManifestHash `8941655b…`、targetFingerprint `56c479de…`），逐行绑定case/showcase/regression/example、snapshot、release、批次和账本；任一数据变化targetFingerprint即变化。
5. 账本21条迁移换行审计完成：ID 10/11/12/13/14/15/21/22账本hash===0010～0018 Git LF内容；ID 18/19/20===0012/0013/0014的CRLF重复登记；ID 17缺号不补写；0010/0011/0015账本hash为Git LF原值，不得更新。**第五轮起**journal严格单调且0010～0018与预期一致、ID 10～16/21/22账本hash===Git blob LF SHA、隔离库删除重复行后migration×2 no-op均为阻断门禁（任一不符不得生成repair-forward计划）。prepared批次`91d60c5f`、未引用snapshot处置见repair-forward计划。
6. **第六轮（代码提交`972b453`+`8b360c2`（可信归档校验移入事务内））已交付可审计、确定性、单事务、幂等的repair-forward执行器**`scripts/rcl-repair-forward-task34.mjs`（核心`src/lib/case-repair/repair-forward.ts`）并在post dump隔离库完成19场景演练（`F:/Socila/backup/case-library/task34-r6-repair-drill-2026-09-10/repair-executor-test-report.json` allPassed=true）。第六轮只读审计（`F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T13-42-41/`）生成attestation-current.json（codeSha `8b360c2…`、attestationManifestHash `3b7340c1…`、targetFingerprint `56c479de…`）、audit-summary.json、repair-forward-plan.json（单事务写集合、executor节、交叉核对10项全true）、executable-write-set.json（planHash `db55e4ab…`覆盖988条entries+确定性批次`c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141`+codeSha；ledgerDelete三行完整旧值；ledgerKeep 1..16/21/22）、repair-executor-test-report.json（19/19）。历史授权与本轮提交均不构成repair-forward授权。
7. **执行runbook（仅在用户针对planHash `db55e4ab…`明确授权后由用户执行）**：①新建紧邻操作时间的完整dump并核对SHA（未创建前不得写入）；②`DATABASE_URL=<policyops> node scripts/rcl-repair-forward-task34.mjs audit`确认state=pending、targetFingerprint `56c479de…`、planHash `db55e4ab…`；③`DATABASE_URL=<policyops> RCL_REPAIR_ALLOW_PERSISTENT=1 node scripts/rcl-repair-forward-task34.mjs apply --i-am-authorized --plan-hash db55e4ab990e84289a3e28d45910d455c6e90d5009643fe18eb072fb70c73848 --target-fingerprint 56c479deb89438ff3943b61b73812cc2`（单事务：REPEATABLE READ+advisory xact lock；事务内重算指纹、FOR UPDATE核对账本18/19/20与prepared批次91d60c5f、核对attestation/业务指纹/可信归档；精确删除RETURNING恰好18/19/20、批次→rolled_back恰好1行、新增restore_verified可信批次+988 entries；任一不一致回滚零写入；工作树必须干净、codeSha必须为计划绑定提交）；④`verify --plan <executable-write-set.json>`必须ok:true；⑤复跑apply必须`noop:true`（部分完成/不一致返回`REPAIR_STATE_DRIFT`，禁止补写，立即报告）；⑥新建post-repair完整dump并在全新PG17+pgvector实例恢复对账（40表/20 sequence）；⑦更新WI-20260907-04为Accepted并同步文档。任何差异立即停止，不默认恢复pre dump。
8. **已执行（2026-09-10，用户明确授权）**：按第7条runbook在本机policyops完成一次repair-forward——pre备份`policyops-rcl-repair-pre-20260910234300.dump`（`b190d1d1…`+sidecar，全新实例恢复对账40表/20 sequence一致）→ fresh audit/plan与授权参数（codeSha `aeb464f`、planHash `179507da…`、targetFingerprint `56c479de…`、attestation `ca4238a5…`）一致 → `RCL_REPAIR_ALLOW_PERSISTENT=1`仅子进程apply单事务成功（删除18/19/20、91d60c5f→rolled_back、新增c8a7c104+988 entries、attempts=1）→ 12项验证全过（账本18条原值、36/36/78/10/5与业务表hash零变化、migration×2 no-op、复跑noop、verify ok）→ post备份`policyops-rcl-repair-post-20260910234716.dump`（`8303a4c3…`+sidecar，第三个全新实例恢复对账40表/20 sequence一致）。当前持久事实：migrations=18（1～16、21、22）、36/36/78、10 snapshots、5 releases、archive batches=2 applied+1 rolled_back+1 restore_verified。证据`F:/Socila/backup/case-library/task34-r8-repair-exec-2026-09-10T15-41-40/`。WI-20260907-04标记等待复审；独立复审通过后置Accepted，随后方可评估WI-20260909-01。

## 任务3/4最终分支集成runbook（WI-20260909-01，Accepted）

只有WI-20260907-02、WI-20260907-03和WI-20260907-04全部Accepted后才能执行。本runbook只操作Git，不授权数据库、快照、Secret、部署、PR或`main`写入。

1. `fetch`后确认`codex/task34-regional-case-rebuild`和`refactor/policy-ops-agent-platform`工作区干净、upstream同步，记录源SHA、目标合并前SHA和merge-base。
2. 只合并`origin/codex/task34-regional-case-rebuild`；不得再次合并两个旧任务分支，也不得使用squash、rebase、cherry-pick或force-push。
3. 审查目标分支独有提交；存在未审查变更或远端前进时停止并更新基线。
4. 在目标工作区执行`git merge --no-ff --no-commit origin/codex/task34-regional-case-rebuild`。任何冲突立即`git merge --abort`，不得猜测解决。
5. 无冲突时审查完整暂存差异和0015→0018 journal顺序，运行完整Node、显式隔离数据库零skip、Chromium、TypeScript、ESLint、Build、Python及安全门禁。
6. 新增独立集成验收报告并同步状态文档后，创建`merge: 集成任务3与任务4地区化交付`，推送`origin/refactor/policy-ops-agent-platform`。
7. 核对本地HEAD、upstream和远端SHA一致；三个`codex/*`分支全部保留，不删除、不合并`main`。

执行结果（2026-09-11）：源`39f0e2a2d6bf694091d97341041e93558ac6ded6`、目标合并前与merge-base均为`57f051da7ffb4ce4862d44845a4a1e595f9f1eaf`；自动合并无冲突。隔离DB、Chromium 19/19、Node、TypeScript、ESLint、Build、Python及安全门禁完成，任务专属容器已清理；持久库只读计数未变化。最终merge commit由提交后本地/upstream/远端三方SHA核对，未合并`main`或创建tag。

## V1→V2受控原位改写runbook（WI-20260911-03，SHV2 §12/§18）

> 开发阶段只在隔离PG17+pgvector容器/库演练（已执行，证据`reports/feature-09-11-shanghai-case-v2/rewrite-drill-evidence-*.json`）。对持久`policyops`的执行属PRD §18第三个授权点，必须另行生成fresh授权包并取得用户对当次哈希与目标的明确授权；本runbook本身、历史授权与本Feature PRD均不构成授权。

1. 前置：持久库已完成0019（账本19条）；SH/GD快照与release为V2生成所绑定的现状；工作树干净且HEAD==计划codeSha。
2. 备份：紧邻操作时间的完整`pg_dump -Fc`+SHA-256清单，并在全新PG17+pgvector实例恢复对账（40表+20 sequence）。
3. 只读：`DATABASE_URL=<policyops> RCL_REWRITE_ALLOW_PERSISTENT=1 node scripts/rcl-case-rewrite-v2.mjs audit --generated <generated-scenarios-v2.json>`——状态必须pending、allV1=true、mismatches为空。
4. 计划：`plan --generated <gen.json> --out <dir>`——输出planHash/targetFingerprint/finalFingerprint与108条entries（36 cases+36 showcase+36 regression；整数ID保留；新旧UID/hash/快照hash/evidence hash/完整before/after）。
5. 授权apply：`RCL_REWRITE_ALLOW_PERSISTENT=1 node scripts/rcl-case-rewrite-v2.mjs apply --generated <gen.json> --plan-file <rewrite-plan-v2.json> --i-am-authorized --plan-hash <planHash> --target-fingerprint <fp>`——单事务REPEATABLE READ+advisory xact lock+FOR UPDATE锁定108行；逐行旧hash核对→原位UPDATE→新hash核对；1个applied批次+恰好108条entries；COMMIT前finalFingerprint核对；任一漂移整体回滚。
6. 验证：`verify --generated <gen.json> --plan-file <plan>`必须ok:true（终态指纹、批次/entries审计、逐行hash、36/36/80、沪粤18/18、case_text非空、transcript NULL）；复跑apply必须`noop:true`；部分完成/不一致返回`REWRITE_STATE_DRIFT`（禁止补写，立即报告）。
7. 操作后备份：完整dump+SHA，并在全新实例恢复对账。
8. 防误写：数据库名为`policyops`时apply在任何连接前拒绝（需`RCL_REWRITE_ALLOW_PERSISTENT=1`）；持久执行禁止`RCL_REWRITE_ALLOW_DIRTY`与`RCL_REWRITE_INJECT_FAILURE_AT`（仅隔离演练使用）。
9. 隔离演练重放：`RCL_REWRITE_DRILL_CONTAINER=<容器> RCL_REWRITE_DRILL_PORT=<端口> node scripts/rcl-rewrite-drill-v2.mjs`——全新库上完整走baseline→generate-v2→audit/plan/守卫反例→apply→verify/noop→0019×2幂等→post dump第三实例恢复对账→计数/审计核对，并输出证据JSON。

## SHV2政策原件MinIO同步与恢复runbook（隔离流程已实现并演练；持久执行待授权）

> Git中的`docs/refactor/policy-ops-agent/reports/**/evidence/`是审计夹具，不是运行时对象存储。同步入口已实现（`services/agent/agent/rag/evidence_sync.py`，CLI `python -m agent.rag.evidence_sync`）。2026-09-12在隔离MinIO+隔离PostgreSQL完成真实23件原件的12项演练（历史审查记录，证据`reports/feature-09-11-shanghai-case-v2/rag-evidence-drill-2026-09-12T04-14-59-793Z.json`）；同日控制契约复审修复（apply绑定fresh授权计划+verify范围契约）后以17项演练为准（证据`reports/feature-09-11-shanghai-case-v2/rag-evidence-drill-2026-09-12T08-43-47-471Z.json`，含守卫反例A-E、plan确定性、幂等noop、object-only降级、冲突拒绝+re-plan恢复、pg_dump+逐对象备份、全新库+全新MinIO恢复对账）。对生产MinIO/持久policyops的同步仍属独立持久操作，须针对fresh对象清单取得用户明确授权。

1. 以证据目录中每个`meta.json.sha256`为内容地址，目标bucket固定`policy-originals`，对象键固定`originals/<sha256>`；禁止使用文件名或可变URL作为唯一键。
2. 上传前核对原件文件存在、字节SHA等于`meta.json`和DSL evidence；任一不符停止。
3. 对象已存在时先读取并核对SHA，一致则幂等no-op；不同则拒绝覆盖，生成漂移报告。
4. 上传成功后写入或核对`rag.fetches.object_key`和`rag.document_versions.object_key`，两处均必须指向相同对象；数据库`content_hash`必须等于对象SHA。
5. 生成对象清单：document ID、bucket、object key、size、content type、Git SHA、MinIO SHA、数据库记录ID与状态；清单不得包含访问密钥或连接串。
6. 备份前同时记录PostgreSQL表/sequence清单和MinIO对象清单；执行既有PostgreSQL dump及MinIO mirror，禁止只备份其中一侧。
7. 在全新PG17+pgvector和全新MinIO实例恢复；逐对象比较字节SHA，并验证DocumentTree、Markdown、Chunk和引用仍能由`object_key`回溯到原件。
8. 持久MinIO同步未获授权时，只允许生成只读audit/plan和隔离演练证据；不得连接生产MinIO执行put、覆盖或删除。

## SHV2政策原件同步命令（隔离环境实测）

```bash
# audit（只读对账；--database-url可省略则只对账对象层）
uv run --project services/agent python -m agent.rag.evidence_sync audit   --evidence-dir docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence/310000   --dsl-root dsl/regions --database-url "$DRILL_URL"

# plan（输出待上传清单，零写入）
uv run --project services/agent python -m agent.rag.evidence_sync plan ... --out rag-plan.json

# plan（确定性计划：planHash/targetFingerprint/codeSha/evidenceManifestHash/对象清单/计划集合；
#       同状态两次输出逐字节一致；--out同时落盘，apply以该文件为不可变输入）
uv run --project services/agent python -m agent.rag.evidence_sync plan ... --out rag-plan.json

# apply（fresh授权契约：显式--i-am-authorized + 不可变计划文件 + planHash + targetFingerprint；
#       写入前校验计划结构/planHash重算、HEAD==计划codeSha、工作树干净、evidence未漂移、
#       MinIO+RAG状态指纹==targetFingerprint；终态幂等noop；漂移零写入拒绝）
uv run --project services/agent python -m agent.rag.evidence_sync apply ...   --plan-file rag-plan.json --i-am-authorized --plan-hash <planHash> --target-fingerprint <targetFingerprint>

# verify（完整四方：Git原件/meta/DSL+对象SHA+rag记录；恢复副本上重跑即"恢复后四方对账"）
uv run --project services/agent python -m agent.rag.evidence_sync verify ...

# verify --object-only（显式降级：仅对象层，结果带verificationScope/degraded/dbChecked标记，
#                       不得作为四方验收通过；完整audit/plan/apply/verify均必须连数据库）
uv run --project services/agent python -m agent.rag.evidence_sync verify ... --object-only

# 备份恢复编排（隔离PG容器+两个隔离MinIO endpoint）
RAG_DRILL_PG_CONTAINER=<容器> RAG_DRILL_PG_PORT=<端口> RAG_DRILL_MINIO_ENDPOINT=<隔离MinIO> RAG_DRILL_MINIO_RESTORE_ENDPOINT=<全新MinIO> RAG_DRILL_MINIO_ACCESS_KEY=... RAG_DRILL_MINIO_SECRET_KEY=... node scripts/rag-evidence-drill.mjs
```

- 对象存储凭据从`AGENT_MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY(/SECURE)`读取；`AGENT_MINIO_BUCKET`默认即`policy-originals`（固定值，其他bucket在连接前拒绝）。
- 守卫：非本机endpoint默认拒绝（`RAG_EVIDENCE_ALLOW_REMOTE=1`仅限隔离演练显式放行）；目标库名`policyops`默认拒绝（`RAG_EVIDENCE_ALLOW_PERSISTENT=1`仅限fresh授权）；对象已存在且SHA不一致→`OBJECT_CONFLICT`/状态漂移拒绝覆盖。
- **fresh授权契约（2026-09-12控制复审）**：apply必须绑定不可变计划文件与`--i-am-authorized/--plan-hash/--target-fingerprint`——环境开关只是endpoint/库名的附加保护，不能替代授权参数；授权缺失、hash错误、计划过期（evidenceManifestHash/状态指纹漂移）、HEAD≠codeSha或工作树dirty均零写入拒绝；状态达计划终态→幂等noop。并发apply由任务专属advisory锁串行化并在锁内重分类。
- 输出（stdout与`--out`文件）只含docId/bucket/objectKey/size/contentType/sha256/dslRefs/记录ID，连接串口令在错误路径统一redact。
