# WI-20260913-01：上海政策原件与对话RAG运行闭环

> Author: Jan
> Status: Ready for user testing（开发、隔离验收、独立复审、完整门禁与推送完成；不标记09-11 Feature最终Accepted）
> Updated: 2026-09-13

## Work Item

- ID：WI-20260913-01
- 关联PRD：`docs/prd/09-11-feature-shanghai-case-library-v2.md` §23
- 关联需求：SHV2-FR-002/023/028～031，SHV2-NFR-006/007/009
- 关联验收：SHV2-AC-001/017/020/022～028
- 起点：`codex/shanghai-case-v2@a85420f079f4d57079a8ccb80a1a9ad17adc625a`
- 当前交付包含实现主体`d32b812`及`91ee87e`完整Node套件命名扫描超时门禁修复；分支tip以交付报告和远端为准。
- 合并目标：`refactor/policy-ops-agent-platform`；用户人工测试通过前禁止合并

## 背景

生产`socila-minio`同时发布9000 S3 API和9001 Console，`/data`挂载named volume`socila_minio-data`。当前生产bucket和RAG七张表均为空。现有同步器只把原件登记为`downloaded`；`RetrievalService`只查询`indexed`版本，且Web对话没有RAG工具，因此当前对话不能检索这些原件，也不会返回RAG来源链接。

第四轮同步修复还存在一个竞态：外部进程可在`bucket_exists()`与`ensure_bucket()`之间创建bucket并写入冲突对象；现实现可能把该对象当作noop并提交RAG元数据，随后才在事务外verify失败。

## 范围

1. 修复ensure期间冲突对象竞态，保证冲突时RAG零写入。
2. Compose显式固定Agent/Worker的`AGENT_MINIO_BUCKET=policy-originals`；9000为S3 API，9001仅为Console。
3. 新增`agent.rag.evidence_index`的`audit/plan/apply/verify/search`模式。
4. 将23份MinIO原件解析为DocumentTree、Markdown、chunks和真实1024维SiliconFlow embeddings。
5. 新增服务JWT保护的Agent搜索与原件读取接口。
6. 新增Web登录态原件代理和AI `searchPolicy`工具；回复展示官网与归档原件链接。
7. 完成隔离环境、用户测试、refactor合并、当前Compose部署以及另行fresh授权的生产同步/索引。

## 非目标

- 不接入PolicyOps LangGraph的Fake `retrieve_impact`。
- 不修改案例API和36条案例内容。
- 不执行政策materialization、管理员批准、snapshot/release、0019或V1→V2持久改写。
- 不合并`main`，不创建PR、tag或Release。
- 不直接写Docker volume目录，不删除或替换`socila_minio-data`。

## 接口契约

### 索引CLI

```text
python -m agent.rag.evidence_index audit
python -m agent.rag.evidence_index plan
python -m agent.rag.evidence_index apply
python -m agent.rag.evidence_index verify
python -m agent.rag.evidence_index search
```

计划必须绑定code SHA、23个document version、对象SHA、当前派生索引指纹、`BAAI/bge-m3`、1024维、indexVersion、planHash和target fingerprint。apply必须显式提供授权、计划文件、planHash和target fingerprint；部分完成后旧计划失效，必须重新plan。

### Agent内部API

```text
POST /internal/v1/rag/search
GET /internal/v1/rag/documents/{documentVersionId}/original
```

搜索输入为`query/jurisdiction_code/as_of_date/top_k`；输出包含`chunkId/documentVersionId/text/parentText/path/score/sourceName/officialUrl/contentSha256/mime`。两端点均验证Next→Agent服务JWT；原件端点只读取已登记对象并重新核对SHA。

### Web接口与工具

```text
GET /api/rag/originals/{documentVersionId}
searchPolicy({query,jurisdiction_code,as_of_date,top_k})
```

Web下载必须要求登录并代理Agent原件流；不得返回MinIO内部地址或凭据。`searchPolicy`校验地区等于会话确认地区，为命中补充登录下载路径。政策事实与来源问题必须检索；无可靠命中时明确失败，不得编造链接。

## 实现要求

- ensure后重新枚举并下载验证所有目标对象；上传完成后、RAG登记前和数据库提交前再次验证SHA。
- 每份索引以单文档事务写入：删除该版本旧派生行，写tree/chunks/embeddings，全部成功后更新`indexed`；失败回滚当前文档。
- `IngestService`发现`downloaded/parsed`版本时不得返回伪`indexed`。
- 下载使用`Content-Disposition: attachment`、`X-Content-Type-Options: nosniff`、`Cache-Control: private, no-store`。
- 宿主CLI使用`127.0.0.1:9000`；容器使用`minio:9000`；9001或含`/login`的endpoint必须稳定拒绝。
- 同步与索引计划输出不得包含Secret、连接串口令、向量内容或预签名URL。

## TDD与测试矩阵

| 场景 | 验收 |
| --- | --- |
| ensure期间外部建桶+错误同键对象 | `OBJECT_CONFLICT`，对象不覆盖，RAG三表前后指纹一致 |
| 脚本与证据一致 | 证据中的script blob SHA等于Git blob SHA |
| 9001误作S3 API | 稳定失败且不回退9000 |
| 索引成功 | 23 versions/23 trees，chunks>0，embeddings=chunks，维度1024，全部indexed |
| 索引失败/部分完成 | 当前文档事务回滚，重新plan后才可继续 |
| 混合检索 | FTS和向量均有候选，RRF/rerank返回地区/日期正确结果 |
| 固定政策查询 | 命中7546、2340/1872/1690、等待期6个月及对应原文 |
| 内部API鉴权 | 缺失/错误JWT拒绝，合法JWT返回结构化命中 |
| 原件下载 | 未登录拒绝、未知版本404、SHA漂移失败、正确字节SHA一致 |
| 对话 | 调用searchPolicy并显示官网与归档链接；无命中不编造 |
| 持久卷 | `docker inspect`确认`socila_minio-data:/data`，容器更新后23对象仍在 |
| 恢复 | 全新PG17+pgvector和MinIO恢复后verify与固定查询一致 |

## 交付与授权

1. 功能分支完成隔离测试、完整门禁和独立复审后推送，状态改为`Ready for user testing`并暂停。
2. 用户人工测试通过后，从最新目标分支建立临时集成worktree，以`--no-ff`合并并在merge SHA重跑门禁。
3. 从merge SHA构建并更新Web/Agent/Worker/Beat；保持`socila-minio`和`socila_minio-data`不变。
4. 生产同步和索引分别生成fresh `codeSha/planHash/targetFingerprint/写集合`。默认开发授权不能替代这些未知hash的精确授权。
5. 授权后通过`127.0.0.1:9000`写当前MinIO，通过当前Agent数据库连接写RAG；9001仅供人工Console核验。

## 完成条件

- SHV2-AC-022～028全部通过并有实际测试/证据路径。
- Node、数据库、Python、Chromium、构建、引用和安全门禁零skip。
- PostgreSQL与MinIO pre/post备份均在全新实例恢复验证。
- 用户人工测试前不合并；生产fresh授权前不写持久MinIO/RAG。
- Work Item完成后可标记Accepted，但09-11 Feature在其余原PRD持久事项完成前不得标记最终Accepted。

## 交付记录（2026-09-13；起点4da7f1a，最终SHA=本任务提交HEAD）

| 任务 | 实现位置 | 测试路径 | 证据 |
| --- | --- | --- | --- |
| 1 同步竞态修复 | `services/agent/agent/rag/evidence_sync.py`（`_verify_objects_or_conflict`，ensure后/上传后/提交前三检查点） | `tests/test_rag_evidence_sync.py::TestEnsureRaceConflict`、`TestEnsureRaceConflictRealMinio`、`TestPostUploadConflictCheck`、`TestPreCommitObjectCheck`（3例RED→GREEN+提交前终检1例（复审P2-1修正注入点至第8次get并断言错误来自终检；旧实现该阈值下verify干净→RED，全套85/85） | OBJECT_CONFLICT、对象不覆盖、RAG三表前后指纹一致（确定性注入，无sleep） |
| 2 受控索引 | `services/agent/agent/rag/evidence_index.py`（五模式CLI）；`agent/rag/pipeline.py`（`derived_index_complete`+`IngestService` dedup修复；空候选不rerank） | `tests/test_rag_evidence_index.py` 22/22零skip（plan绑定/守卫零写入/单文档事务回滚/部分完成re-plan/终态noop/verify反例/端点守卫/伪indexed反例/真实MinIO SHA复核/真实页面解析回归） | drill索引步（真实SiliconFlow） |
| 3 内部RAG接口 | `agent/rag/runtime.py`、`agent/api/app.py`（`/internal/v1/rag/search`、`/internal/v1/rag/documents/{id}/original`）、`agent/api/main.py` | `tests/test_rag_api.py` 11/11零skip | JWT/校验/附件头/404/502失败关闭/元数据回填/空候选不rerank |
| 4 对话来源链 | `src/lib/ai/search-policy.ts`、`src/lib/ai/tools.ts`（searchPolicy）、`src/lib/ai/prompts.ts`（规则10～12）、`src/app/api/rag/originals/[documentVersionId]/route.ts` | `src/lib/ai/__tests__/search-policy.test.ts` 8例、route测试4例；E2E `e2e/shv2-rag-chat.spec.ts` 3例 | 对话双链展示+登录态下载字节一致+无命中不编造 |
| 5 Compose契约 | `infra/prod/docker-compose.yml`（agent/worker bucket显式）；`src/lib/env/rag-runtime-config-contract.test.ts` | 5/5（RED=bucket缺失） | `docker compose config --quiet`通过 |

配套产品修复（门禁路径暴露）：`agent/rag/document_tree.py parse_html`重写为全块级提取（真实政府页面正文在嵌套div内、HTML注释节点.tag为cython函数曾致崩溃——23份原件关键数字全部进入chunk文本）；`agent/rag/siliconflow.py FakeSiliconFlowClient.embed`维度修复（声明1024维但seed*4切片实际128）；`RetrievalService`无候选时不再以空文档调用rerank并写审计。

隔离验收与门禁数字详见`PROGRESS.md`对应章节与验收报告§10。演练33项全ok证据`reports/feature-09-11-shanghai-case-v2/rag-evidence-drill-2026-09-13T05-57-34-688Z.json`（scriptBlobSha=执行脚本Git blob SHA `4edd7d8a…`，与提交中脚本一致）。rewrite恢复演练证据`rewrite-drill-evidence-2026-09-13T06-39-43-390Z.json`（10步全ok）。

边界：生产socila-minio（bucket仍为0）与持久policyops未连接未写入；未合并refactor/main；未创建PR、tag或Release。状态**Ready for user testing**。

## 生产fresh授权执行记录（2026-09-13；生产MinIO同步+生产RAG索引完成）

按本WI交付与授权边界执行生产fresh授权两步（两个apply独立授权点），全程`AGENT_MINIO_ENDPOINT=127.0.0.1:9000`（S3 API；9001 Console未用于任何写入路径）、bucket固定`policy-originals`。

### 只读验证（执行前，零漂移）

工作树干净、HEAD与`origin/refactor/policy-ops-agent-platform`均=`da951594c…`；`sync-plan.json`规范化重算planHash一致；以相同参数对生产重新生成plan与存储计划深度相等（即当前状态精确等于计划targetFingerprint）；`socila_minio-data:/data`挂载未变；23个证据文件逐字节SHA/byteSize/对象键与计划一致；生产MinIO无bucket、RAG七表为0；socila-postgres/minio/redis容器与镜像均未变（agent/web镜像ID与`shv2-da95159`一致）。

### 第一步：生产同步（授权哈希：planHash `6751f812…`、targetFingerprint `0de35927…`）

`evidence_sync apply --plan-file --i-am-authorized --plan-hash --target-fingerprint`→`state=applied、bucketCreated=true、uploaded=23、fetches=23、versions=23、verified=true`。完整四方verify `ok=true、problems=0、objectCount=23`。精确核对：`policy-originals`为唯一bucket且恰含23个`originals/<sha256>`对象；`rag.fetches`/`rag.document_versions`各恰23行且(object_key, content_hash)与计划逐一相等、状态全部`downloaded`、jurisdiction=310000；`rag.sources`恰2行（rsj.sh.gov.cn、ybj.sh.gov.cn，owner=`rag-evidence-sync`）。同计划复跑apply→`noop:true`零写入。

### 第二步：生产索引（独立授权；授权哈希：planHash `2f737896…`、targetFingerprint `b87228f7…`）

索引audit报46条均为索引前预期pending态（sync登记路径不写`official_url/title/authority`，由索引apply最终UPDATE从打包固定清单`shanghai_index_manifest.json`回填；派生行为空）；`rag.fetches`实际URL与清单23/23精确一致，无真实漂移。生产index plan（`rag-evidence-index-plan/2.0`，重复生成深度相等）：恰好23个上海document version（version ID与同步登记逐一相等）、plannedIndex=23、noop=0、conflicts=0、BAAI/bge-m3/1024（indexVersion `BAAI/bge-m3:1024`）、23/23标题/发布机关/officialUrl(https gov.cn)/effectiveFrom完整（9份effectiveTo为空=长期有效）、派生写集合23份185 chunks。取得对上述精确哈希的第二次授权后`evidence_index apply`→`applied=true、indexedVersions=23、verified=true`；完整verify `ok=true、23/23 indexed+derivedComplete`；复跑apply→`noop:true`。`appliedFingerprint`与计划finalFingerprint不同属设计（终态承诺=确定性结构+有效receipt，不承诺模型字节；apply内post-verify通过）。

### 生产终态与固定查询

`rag.sources=2、fetches=23、document_versions=23全部indexed、document_trees=23、chunks=185、embeddings=185（model=BAAI/bge-m3、declared dims=1024、实际vector_dims=1024全部）、index_receipts=23`；每文档chunks数与计划写集合逐一相等；MinIO恰23对象无多余。固定查询（production与恢复副本双通过）：缴费基数top1命中7546/37731；失业金三档2340/1872/1690命中；医保"等待期6个月"+"中断后3个月内参保不受等待期限制"命中；jurisdiction=440000零命中；as-of 2026-06-30排除2026-07-01生效文档（7546/37731消失）；未收录问题（公积金贷款额度）0命中不凑数。

### 执行后备份与全新实例恢复演练

- 执行后PostgreSQL dump：`backup/post-shanghai-rag-20260913-233844/policyops.dump`（-Fc，1335292字节）。
- 23个MinIO对象逐字节备份+SHA清单：同目录`objects/`与`minio-objects-manifest.json`（全部objectKey==originals/<字节SHA256>）。
- 全新PG17+pgvector（`shv2-postrest-pg`:55432，库`policyops_restore`）+全新MinIO（`shv2-postrest-minio`:19000，一次性凭据仅存gitignored restore.env）：pg_restore仅9条`agent_app`角色GRANT报错（全新实例无该角色，属预期；数据/结构完整），RAG计数源/副本完全一致（sources=2/fetches=23/versions=23全部indexed/trees=23/chunks=185/embeddings=185/receipts=23）。
- 恢复副本复验全绿：evidence_sync四方verify `ok=true、23对象、problems=0`；evidence_index verify `ok=true、23/23 complete`；六项固定查询全部与生产一致。
- 运行证据（运行器脚本、apply/verify/查询JSON、恢复产物）均在gitignored `backup/rag-exec-20260913/`与`backup/post-shanghai-rag-20260913-233844/`，不进入版本库。

### 边界与状态

未执行政策release、0019、V1→V2持久改写、main合并、PR、tag或Release；`F:\Socila-shanghai-case-v2` worktree保留待用户测试确认。状态：**生产同步与索引完成，等待用户人工测试**（09-11 Feature最终Accepted仍待用户测试）。

## UAT阻断修复记录（2026-09-14；提交39fbd00「fix: 修复DeepSeek工具调用与登录限流」）

### 任务一：DeepSeek强制工具调用（先探测后决策）

- **脱敏探测矩阵**（生产Key，仅记录模型ID/HTTP状态/错误code/内容与工具调用标志）：
  - `GET /models` → 200，仅 `deepseek-flash`、`deepseek-v4-pro`；
  - `deepseek-v4.1-flash`：全部5场景400（账号不支持该模型ID，且不在/models）→ 按决策规则禁止使用；
  - `deepseek-flash` 与 `deepseek-v4-flash`（当前别名）行为一致：普通对话200（默认thinking开）、tools+auto 200并发起searchPolicy调用、**强制tool_choice（默认thinking）400 "Thinking mode does not support this tool_choice"（复现生产错误）**、显式 `thinking={type:"disabled"}`+强制工具→200并正确返回工具调用。
- **决策**：v4.1-flash不可用→跳过；可用模型在默认thinking下均拒绝强制tool_choice→保留实际可用模型 `deepseek-v4-flash`（不变更OPENAI_MODEL），新增 `src/lib/ai/deepseek-compat.ts` 的 `withDeepSeekCompat` fetch适配器：仅匹配DeepSeek模型+/chat/completions、仅修改JSON body、仅显式tool_choice时注入 `thinking={type:"disabled"}`；普通对话/auto/其他Provider/非JSON原样转发；零日志、Authorization透传。`agent.ts` 经 `createOpenAI({fetch})` 接入。**首步强制searchPolicy保留，未改为auto**；普通对话保持默认thinking。
- TDD：RED=模拟DeepSeek上游（默认thinking+强制tool_choice→400）在无适配器时复现生产错误；GREEN=适配器10/10（注入/幂等/auto不动/非DeepSeek不动/非chat端点不动/非JSON透传/头透传/零日志/AI SDK两种tool_choice对象形态）。

### 任务二：登录限流窗口15→5分钟

- 常量收口 `src/lib/auth/login-rate-limits.ts`（IP 20/5min登录页层；IP+规范化用户名 5/5min authorize层；次数门槛不变）；登录页文案精确改为「请求频繁，请五分钟后再尝试。」；PRD AUTH-NFR-003同步。
- 可控时钟单测7例：IP第20允许/21拒绝、用户名第5允许/6拒绝、4分59秒仍拒、满5分钟恢复、用户名bucket隔离、全IP上限有效、文案精确匹配。

### 任务三：管理员重置连续语义（自动化证明）

- 集成测试（全新PG17，9/9）新增2例：重置全语义（bcrypt hash变化、auth_version递增、must_change_password=true、temporary_password_expires_at非空、auth.password_reset_by_admin审计、明文不入库）；连续两次重置后仅最后一次临时密码可登录，改密后must_change_password=false、temporary_password_expires_at=NULL、auth_version再递增、新密码可登录、auth.password_changed审计。
- 管理员页确认框与临时密码展示处补充：「再次重置会立即使上一次临时密码及用户当前密码失效，请只把最后一次生成的临时密码交给用户。」

### 部署验证发现的同链路缺陷（一并修复）

1. **provenance门禁URL提取器**：纯文本提取把全角括号补充说明粘进归档路径（`/api/rag/originals/xxx（登录后可下载）`），`onlyApprovedLinks`精确匹配失败→真实带链接回复被整段替换为兜底。修复：`（`（及`(`、全角`：？！`）加入终止符；新增测试。
2. **输出门禁能力自述误伤**：`requiresPolicyOutputProvenance` 把助手人设/能力句段（“我是社保规划助手，主要帮你做……补贴测算”）判为无来源政策事实，普通祝福/寒暄回复被整段替换。修复：人设/服务性句段豁免（句段含数量化事实数字+单位/文号或官方来源引用时仍门禁）；新增3断言。
3. **e2e套件登录限流兼容**：登录页IP限流20次/5分钟为产品契约，套件UI登录提交总数已超阈值；非auth-spec的登录前置改走NextAuth callback API（`e2e/api-auth.ts`，共享Cookie、断言302重定向不含error=）；auth.spec保留UI登录与限流页面专测；5分钟窗口契约由 `rate-limit.test.ts`（可控时钟）覆盖。

### 生产部署与验证（仅重建socila-web）

- 旧web镜像保留回退标签 `web:rollback-pre-a04946e`（=a06969d3ab29，即shv2-da95159）；新镜像 `web:shv2-39fbd00`= `web:latest`（5ca9a230c98f）从干净HEAD 39fbd00构建；仅重建 socila-web（healthy）。agent/worker/beat/postgres/minio/redis与数据卷均未触碰；`.env`未改（模型保留deepseek-v4-flash）；`.env.example`值为实证可用模型ID。
- 部署后验证：①web healthy✓；②普通对话正常返回✓（384字符真实回复，能力自述不再误替换）；③政策问题实际调用searchPolicy✓（step_count=3，工具执行）；④回答含标题/机关/官网/归档链接 **未达成——阻塞**（见下）；⑤web/agent日志无 "Thinking mode does not support this tool_choice"✓（原阻断已消除）；⑥retrieval_audit未增加（同④阻塞）；⑦MinIO 23对象、185 chunks、185 embeddings不变✓；⑧登录页限流提示为5分钟文案✓；⑨最后一次临时密码完整改密流程留待用户人工测试。

### 遗留阻断（需用户决策；本次未越权处理）

生产 compose 将 agent 仅置于 `internal:true` 网络（无外网路由）：运行期检索的查询嵌入必须调用 api.siliconflow.cn，当前必然 `Temporary failure in name resolution`/`Network is unreachable` → `/internal/v1/rag/search` 500 → 工具失败关闭→兜底答复。即④⑥两项在任何代码修复之外、必须由基础设施变更解决（如 agent 增加edge网络附着或新增受控egress网络后重建agent容器）。该变更触碰「不得重建或修改socila-agent」边界，等待用户显式授权后另行执行。
