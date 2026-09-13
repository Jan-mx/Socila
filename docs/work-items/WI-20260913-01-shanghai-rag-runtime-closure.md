# WI-20260913-01：上海政策原件与对话RAG运行闭环

> Author: Jan
> Status: Ready
> Updated: 2026-09-13

## Work Item

- ID：WI-20260913-01
- 关联PRD：`docs/prd/09-11-feature-shanghai-case-library-v2.md` §23
- 关联需求：SHV2-FR-002/023/028～031，SHV2-NFR-006/007/009
- 关联验收：SHV2-AC-001/017/020/022～028
- 起点：`codex/shanghai-case-v2@a85420f079f4d57079a8ccb80a1a9ad17adc625a`
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
