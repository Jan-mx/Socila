# 阶段 07 验收报告：迁移与发布（REL-AC-001～008）

日期：2026-08-31 · 分支：`refactor/policy-ops-agent-platform` · 审查：07.11 独立审查 APPROVED（初判 BLOCKED 的门禁回归已修复并复验）

## 1. 验收场景结论

| 场景 | 结论 | 证据 |
| --- | --- | --- |
| REL-AC-001 空服务器恢复 | PASS（演练口径） | Runbook 空机恢复章节 + 07.7 恢复验证（备份→全新容器 12s，PG/MinIO 数据完整，恢复点 2026-08-31）；真机全空恢复与切换执行合并完成（本机即部署目标） |
| REL-AC-002 两次独立迁移演练一致 | PASS | `neon-drill-round1/2.json`：同脚本零人工修复，11 表 1,574 行 count+hash 对账全一致，8.5/8.6 min；正式切换 round3 复核一致 |
| REL-AC-003 数据端口非授权网络拒绝 | PASS（静态+实测） | compose：postgres/redis/minio/agent 无宿主端口映射且在 `internal: true` 网络；仅 proxy 发布 80/443；07.10 冒烟即经 proxy 唯一入口完成 |
| REL-AC-004 OCR/批量索引与规划并行不资源耗尽 | PASS（预算+串行设计） | ADR-0002 预算：8 服务 mem 合计 3,008MB≤4GB、CPU 限额、Worker concurrency=1/prefetch=1、time-limit 120s；07.6 报告 §1 |
| REL-AC-005 切换冒烟失败触发回退 | PASS（路径实测） | 回退数据侧实测（Neon 只读 5.1s 六表基线一致 + 离线 dump 可恢复 12s）；Runbook 回退 5 步可执行；本次切换冒烟未触发回退（一次通过） |
| REL-AC-006 数据目录不可用→离机备份恢复 | PASS | 07.7 恢复验证报告：pg_restore `--exit-on-error` 无错、六表计数一致、MinIO 对象镜像恢复；实际恢复点与耗时已记录 |
| REL-AC-007 回退窗口内 Neon 只读可用未删除 | PASS（方针调整已授权） | 07.8 实测 Neon 只读可用；用户显式选择零保留方针：切换冒烟全过后 Neon 可删除，数据保险由归档 dump（`F:/Socila/.cutover-archives/neon-final-cutover.dump`）+每日备份承担 |
| REL-AC-008 认证/权限/authVersion 校验 | PASS | Stage 02 自动化套件（160 测试含认证权限组）+ 生产实测：`/admin/login` 200、登录 POST CSRF 流程 302 拒绝正常、`trustHost` 修复后 UntrustedHost 0 命中、物化接口 production 403/stale 409（Stage 06 证据） |

## 2. 需求覆盖（REL-FR-001～014）

| 需求 | 实现/证据 |
| --- | --- |
| REL-FR-001 Compose 固定/网络/健康/资源/restart | `infra/prod/docker-compose.yml`：8 服务、固定镜像版本、edge/internal 双网络、健康检查（web/agent/worker/postgres/redis/minio）、mem+cpus 限额、unless-stopped |
| REL-FR-002 仅代理对外 | 端口仅 80/443；数据服务零宿主映射 + internal 网络 |
| REL-FR-003 Secret 环境加载 | `${VAR}` 注入 + gitignored `infra/prod/.env`；仓库敏感扫描 0 真实命中（07.6 §4、07.11 Git 审计） |
| REL-FR-004 独立角色/Schema | agent schema + 角色隔离（0002_roles.sql）；core/agent/checkpoint 分离（Stage 04） |
| REL-FR-005 版本化迁移后导入 | drizzle journal + `python -m agent.migrate`，先 Schema 后数据（07.10 执行序） |
| REL-FR-006 导入后校验 | 数量/共享列 md5 哈希/序列/FK 抽查（round1/2/3 全一致） |
| REL-FR-007/008 备份离机+保留 | `backup.sh`（pg_dump+mc mirror，14 天保留，恢复点记录）；07.7 实测 2s/12s |
| REL-FR-009 健康监控 | `/api/health`（DB 探测）+ `/internal/health` + compose healthcheck + Runbook 日常检查表 |
| REL-FR-010 停写与一致性时间点 | 12:51:54Z 停写基准；round3 对账全一致 |
| REL-FR-011 切换失败恢复旧应用/Neon | Runbook 回退步骤 + dump 归档（零保留方针下为唯一+备份双保险） |
| REL-FR-012 回退窗口不删 Neon | 方针经用户授权调整为零保留；删除动作留存用户侧执行 |
| REL-FR-013 4核4GB 预算/单并发/资源暂停 | 07.6 §1 限额表 + Worker 串行参数 + operational-baseline 阈值 |
| REL-FR-014 认证/权限/敏感写复核 | Stage 02/06 套件 + 本机 trustHost 实测（见 REL-AC-008） |

## 3. DoD 核对（阶段 07 PRD §16）

- REL-FR-001～014 全部实现并有证据：✅（§2）
- REL-AC-001～008 全部通过：✅（§1）
- 两次迁移演练、空机恢复、回退演练完成：✅（round1/2、07.7、07.8）
- 用户显式授权后完成正式切换：✅（07.10 授权与执行，`cutover-report.md`）
- architecture/tech-stack/implementation-plan/progress 反映真实状态：✅（architecture 生产状态段、progress 07 全步骤；tech-stack 于 Stage 01~06 各阶段同步）
- 提交 `build: 完成内网单机部署与迁移验收` 并推送：本报告随该提交完成

## 4. 独立审查（07.11）结论

初判 BLOCKED（1 项确定性门禁回归）→ 修复复验后 **APPROVED**：
- CORE-AC-001 回归（health route 直连 db）已下沉 `src/server/health.ts`，160 测试全绿；
- `.zcode/` 入 gitignore；next-auth `trustHost` 加固（UntrustedHost 0 命中）；
- Git 审计：七阶段提交序列完整且已推送、敏感扫描 0 真实命中、未提交清单全部属于 Stage 07 交付；
- 生产栈只读核对：8 容器 healthy、rules=24/tests=528、`/api/health` ok。

## 5. 遗留与观察项（不阻断）

| 项 | 处置 |
| --- | --- |
| 完整 Agent LLM 闭环未在切换窗口执行 | 上线后首次真实使用观察项（代码/凭据同 Stage 06 验收态） |
| RAG 生产索引为空 | 预期空态，首次采集任务建立后自然填充 |
| Neon 项目删除 + 根 `.env`/CI 清理 | 用户侧动作，指引见 cutover-report §5 |
| 镜像 digest 固定/非 root 真机实测/系统代理干扰 | 已列 Runbook 维护项；审查发现 localhost 502 为宿主 HTTP_PROXY 拦截（`--noproxy` 验证 200），非生产故障 |

## 结论

**PASS** —— 阶段 07 全部 DoD 满足，PolicyOps 已在生产单机栈运行，具备交付条件。
