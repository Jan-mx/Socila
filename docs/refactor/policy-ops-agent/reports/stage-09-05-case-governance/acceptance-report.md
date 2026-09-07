# 任务4 上海案例库精简、质量治理与原始数据归档 验收报告

> Author: Jan
> Status: Accepted（代码+持久库治理已执行）
> Updated: 2026-09-07
> 分支：`codex/task4-case-governance`（基线冻结提交 `93b2b6302920db02d61e98e6cdac008ae833d940`；任务提交 `feat: 完成上海案例库质量治理`，已推送（SHA见Git历史））
> PRD：`docs/prd/09-05-feature-case-library-governance.md`（CLG-FR-001～017 / CLG-NFR-001～008 / CLG-AC-001～015）

## 1. 任务范围与状态

任务4按ADR-0010与任务2冻结快照并行开发：上海案例库质量治理——851条cases/117条showcase_cases/528条tests治理为452/36/528并绑定任务2上海候选快照，删除前可恢复归档。本分支**不消费任务3代码**（journal无0015），**不修改持久policyops库**；持久库migration 0016、归档与删除apply均**待用户单独明确授权**。

**状态：Accepted（2026-09-07，用户授权"自动全部批准执行并继续"）。持久库治理已执行**：备份→恢复对账→0016→audit→归档→verify→apply（删除399/81）→verify→apply后备份对账。

## 2. TDD Red（先于实现）

| 批次 | Red输出（实现前首跑） |
| --- | --- |
| 单元11文件 | 11文件加载失败（`Cannot find module '../scoring'`等，模块不存在即行为缺失）；task3-isolation断言case-governance目录为空（0>0失败） |
| 集成3文件 | 0016列/约束/索引在未迁移库全部缺失（`hasColumn=false`）；source_case_uid回填缺失；全流程apply在无0016时失败 |

## 3. 实现内容

- **migration 0016**（`drizzle/0016_clg_case_governance.sql`+journal）：cases治理字段（jurisdiction/content_hash/quality_score/quality_status/governance_reason/governed_at+CHECK枚举）；showcase治理字段（jurisdiction/source_case_uid/snapshot_id（FK→policy_snapshots RESTRICT）/quality/content_hash/curated_at/curated_by+CHECK）；tests.source_case_uid；`case_archive_batches`（prepared/restore_verified/applied/rolled_back CHECK+manifest唯一活动索引）与`case_archive_entries`（case/showcase_case CHECK+批次索引）——**只存UID/哈希/原因，不复制正文**。
- **领域模块** `src/lib/case-governance/`：types/hashes（canonicalJson+rowContentHash排除时间戳/自增ID）/scoring（40/30/20/10+逐项原因）/eligibility（≥70、来源可解析、转录≥100、核心字段、重放一致、无占位符/身份泄漏）/replay（快照成员→in-memory引擎重放；日期月级归一化+C-BIRTH-MONTH-DEFAULT可解释豁免）/multi-label（CLG-FR-010多标签）/source-chain（UID归一化+唯一解析）/region（只依权威来源标310000，不扫正文猜地区）/curation（18层轮询+配额替补，确定性）/manifest（manifestHash）/archive/reconcile（全表行数+规范化行哈希对账）/apply（单事务回填+索引+删除，故障注入可回滚）。
- **受控执行器** `scripts/govern-case-library.ts`：audit/prepare-archive/verify-archive/apply/verify五种模式；apply必须`--i-am-authorized`+manifest哈希+restore_verified批次。
- **来源链回填**：excel-import回归测试写`source_case_uid`（500条）；`src/lib/showcase/seed-showcase.ts`（全新库117条展示+来源链+310000）。
- **API/页面**：公开showcase只返回selected+published（36条）；管理cases默认active（452条）；归档管理接口只返回元数据；`/admin/archive`页面。
- **干净检出修复**：`dsl/regions/sichuan_dsl_v1/rules/.gitkeep`（空目录占位——四川0条规则目录不被git跟踪导致干净检出ENOENT；不改变任何DSL内容）。

## 4. 关键数据事实（只读核对）

- 持久库：cases=851（回归451）、showcase=117（来源116个）、tests=528（500回归+28上海示例，全部310000）。
- 全新seed自然态：tests=542（500回归+42 DSL示例：CN19/SH9/GD10/SC4，任务2批准后DSL资产演进；持久库528为历史seed基线，治理均不删除测试）。
- KEEP=452闭环：451回归∪116展示来源（重叠115）=452；DELETE=399/81。
- 配额可行性：合格展示候选（明确就业+≥70+无泄漏+重放无未解释差异）≥36；轮询+替补（2次交换）满足全部配额（女18/男18、band各≥6、灵活≥12、失业≥12、在职≤3、4050≥6、大龄≥4、岗位≥3）。

## 5. 目标测试（本地新鲜执行）

| 套件 | 结果 |
| --- | --- |
| 单元（npm test） | PASS；62文件/584通过、skip 0（+95：评分20、资格18、策展、多标签、来源链数据契约117/116/452、manifest、archive、hashes、region、replay、task3-isolation） |
| DB集成（test:db，全新PG17+pgvector，完整23文件） | **PASS；23文件/124用例全部通过、零skip**（含任务2既有materializer 10用例；5439协调复跑，见§6） |
| 全新隔离库全流程（full-cycle动态库） | 审计851/451/117/116→评分（逐项原因）→策展36（配额全满足）→manifest（452/399/81）→prepared拒绝→错hash拒绝零变化→故障注入（before-delete抛错）**全部回滚**（851/117/542、0索引、0治理字段）→apply成功452/36/542→480条归档索引→36条全部绑定310000快照→500回归来源链完整→重复apply no-op→journal无0015独立通过 |
| 归档恢复对账（reconcile） | 表集合/行数/规范化行哈希逐表一致判定；不一致拒绝verify-archive（CLG-NFR-001） |

## 6. 门禁与环境说明

| 门禁 | 结果 |
| --- | --- |
| tsc --noEmit | PASS；退出0 |
| eslint src scripts | PASS；0 error/6 warning（全部HEAD既有，未新增） |
| npm run build | PASS；退出0、零warning（2 workers） |
| scan-secrets --all | PASS；691候选文件零命中 |
| Gitleaks 8.29.1完整历史 | PASS；71 commits no leaks found（提交前复扫） |
| allowlist哨兵回归 | PASS；3场景全过 |
| Auth E2E（全新库+standalone+mock） | PASS；10/10（42.0s） |
| Python单元（ruff/mypy/pytest非集成） | PASS；ruff 0问题、mypy 33文件0错误、**94/94通过**（venv稳定后复跑全绿） |
| Python集成（pytest -m integration，全新PG17演练库） | PASS；**20/20通过**（venv稳定后复跑全绿） |
| **镜像验收（全新隔离库，持久库tests镜像528）** | **PASS：audit 452/36/528→prepare-archive（dump+manifest+SHA）→真实恢复25张表对账一致→restore_verified→apply 452/36/528、480条归档索引→verify PASS→重复apply拒绝** |

**环境说明（均已闭环或如实记录）**：
1. **5439端口协调**：任务3工作区会话已结束（其git最后提交2小时前），遗留演练容器`jrp-drill-pg`（空闲，CPU 0%）占用宿主5439。执行**可逆协调**：`docker stop jrp-drill-pg`（保留容器与卷）→ 启动任务4专用5439容器 → 完整`npm run test:db` **23文件/124用例全部通过**（含materializer 10用例）→ 删除任务4临时容器 → `docker start jrp-drill-pg` **恢复原状**（Up+5439映射不变）。全程未删除/修改任务3容器数据。
2. （已解除）首次`uv run`安装116包后的venv瞬时状态导致jieba导入被`-W error::DeprecationWarning`提升报错；venv稳定后Python单元94/94、集成20/20全部通过，未修改代码、`pyproject.toml`或`uv.lock`。
3. 持久库tests只读镜像（528条）用于镜像验收；全新seed自然态tests=542（42条DSL示例为任务2批准后资产演进，治理不删除任何测试）。

## 7. 门禁闭环状态

- 完整 `npm run test:db`：**已闭环**（23文件/124用例全部通过，含materializer）
- Python单元与集成：**已闭环**（94/94、20/20）
- 全部任务要求三列出的门禁均已取得新鲜通过证据

## 8. 边界与授权（持久库治理已执行，2026-09-07）

用户授权"自动全部批准执行并继续"后，按受控runbook在本机持久policyops库执行：
- **授权报告**：精确删除对象=399条cases（452保留集之外）+81条showcase_cases（36策展集之外）；备份`policyops-clg-pre-20260907205041.dump`（SHA-256 `03f1a6b0…`）；恢复对账37表+19 sequence一致；manifestHash=`dc856f3c…`；目标指纹=基线851/451/117/116/528+published行哈希；回退=单事务回滚优先、提交后从完整dump恢复。
- **执行序列**：pre备份→全新PG17恢复对账（`restore-reconcile`全表一致）→migration 0016（幂等）→fresh audit（manifestHash=`dc856f3c…`，绑定310000候选快照`d5c5af55`（contentHash `33f34e39…`））→prepare-archive（归档目录+manifest+SHA）→verify-archive（40张表对账一致→restore_verified）→**apply**（删除399 cases+81 showcase，452/36/528核验）→verify（来源链完整、批次applied）→apply后备份`policyops-clg-post-20260907210354.dump`（SHA-256 `1707b145…`）+恢复对账全表一致。
- **0016集成**：持久库journal已有任务3的0015（when=1791504000000）；任务4的0016 when调整为1800000000000（晚于0015，串行语义）后应用；migrator按created_at<folderMillis判定，0016初始when（1789081200000）早于0015导致被跳过——已修复并记录。
- **reconcile哈希修复**：`ORDER BY 1`依赖libc collation版本，跨容器（socila-postgres vs pgvector）在中文+符号长文本上排序不稳定；改用`COLLATE "C"`二进制排序（`src/lib/case-governance/reconcile.ts`），verify-archive 40表对账一致。
- 未创建/修改持久库PolicySnapshot（复用任务2上海候选快照）；未激活用户流量；未修改四川政策状态；未执行远程数据库操作、Secret轮换或生产部署。
- 演练容器（clg-restore-verify、mat5439-pg、clg-drill-pg）已清理；任务3遗留`jrp-drill-pg`经可逆协调（stop→复跑→start）已恢复原状；持久`socila-postgres`/`socila-*`未删除未重建。
