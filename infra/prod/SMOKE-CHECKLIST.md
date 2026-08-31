# PolicyOps 冒烟检查单（07.9 ready-to-release / 07.10 切换共用）

## 部署后立即执行

| # | 检查 | 命令 | 期望 |
| --- | --- | --- | --- |
| 1 | 全部容器 healthy | `docker compose ps` | web/agent/worker/postgres/redis/minio/proxy 均 healthy |
| 2 | 仅代理对外 | `nmap -p 1-9000 <主机>` | 仅 80/443 可达；5432/6379/9000/8100 内网 |
| 3 | 健康与就绪 | `curl http://web/api/health; curl http://agent/internal/health` | 200 |
| 4 | 数据对账 | 迁移对账报告（07.4/07.5） | 数量/哈希一致 |
| 5 | 规划冒烟 | POST /api/plan/compute（示例输入） | 200 + plan |
| 6 | 检索冒烟 | POST /internal/v1/retrieval/search | 命中 + 引用 |
| 7 | 黄金回归 | `npm test` + `uv run pytest -q` | 全绿 |
| 8 | Secret 扫描 | `node scripts/scan-secrets.mjs --all` | 0 命中 |

## 切换（07.10）前置门禁

- [ ] 用户明确授权（生产迁移/入口切换）
- [ ] 两次迁移演练报告（07.4/07.5）PASS
- [ ] 空机恢复演练（07.7）完成且耗时记录
- [ ] 回退演练（07.8）完成，Neon 只读回退窗口开启
- [ ] 备份离机验证（restore-verify）通过
- [ ] BLOCKER-001 处置决定确认（含 transcript_text 数据保全）
