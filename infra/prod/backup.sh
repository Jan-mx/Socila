#!/usr/bin/env bash
# 每日备份（REL-FR-007/008）：pg_dump + MinIO mirror，离机保存 14 天。
# 用法：BACKUP_TARGET=/mnt/nas/policyops-backup ./infra/prod/backup.sh
# 演练覆盖（可选）：COMPOSE_FILE=infra/dev/docker-compose.dev.yml NETWORK=dev_default
set -euo pipefail

BACKUP_TARGET="${BACKUP_TARGET:?需要 BACKUP_TARGET（离机目录或挂载点）}"
DATE="$(date +%F)"
KEEP_DAYS=14
COMPOSE_FILE="${COMPOSE_FILE:-infra/prod/docker-compose.yml}"
COMPOSE="docker compose -f $COMPOSE_FILE"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
MINIO_SERVICE="${MINIO_SERVICE:-minio}"
# 默认取 compose 项目内网（prod 部署为 prod_internal）；演练显式传 NETWORK
NETWORK="${NETWORK:-$(docker network ls --format '{{.Name}}' | grep -E '(^|_)internal$' | head -1)}"
# 凭据来自部署环境或 compose 同目录 .env（均不入库不入镜像）
ENV_FILE="${ENV_FILE:-$(dirname "$COMPOSE_FILE")/.env}"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
: "${MINIO_ROOT_USER:?需要 MINIO_ROOT_USER}"
: "${MINIO_ROOT_PASSWORD:?需要 MINIO_ROOT_PASSWORD}"

echo "[backup] $DATE → $BACKUP_TARGET/$DATE"
mkdir -p "$BACKUP_TARGET/$DATE"
STARTED=$(date +%s)

# 1) PostgreSQL 逻辑备份（含 Agent/LangGraph Checkpoint 表）
$COMPOSE exec -T "$POSTGRES_SERVICE" pg_dump -U "${POSTGRES_USER:-postgres}" -Fc "${POSTGRES_DB:-policyops}" \
  > "$BACKUP_TARGET/$DATE/postgres.dump"

# 2) MinIO 对象备份（临时 mc 容器在内网 mirror 到离机挂载；MC_HOST_* 免 shell）
mkdir -p "$BACKUP_TARGET/$DATE/minio"
docker run --rm --network "$NETWORK" \
  -v "$BACKUP_TARGET/$DATE/minio:/backup" \
  -e "MC_HOST_src=http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@${MINIO_SERVICE}:9000" \
  minio/mc mirror --overwrite --quiet src/ /backup

# 3) 校验
test -s "$BACKUP_TARGET/$DATE/postgres.dump" || { echo "[backup] pg_dump 为空，失败"; exit 1; }
OBJ_COUNT=$(find "$BACKUP_TARGET/$DATE/minio" -type f 2>/dev/null | wc -l)
test "$OBJ_COUNT" -gt 0 || { echo "[backup] MinIO 备份为空，失败"; exit 1; }
DURATION=$(( $(date +%s) - STARTED ))
echo "[backup] postgres.dump size: $(du -h "$BACKUP_TARGET/$DATE/postgres.dump" | cut -f1)"
echo "[backup] minio objects: $OBJ_COUNT"
echo "[backup] 耗时 ${DURATION}s"

# 4) 清理 14 天前的备份（不可逆操作仅作用于备份目录）
find "$BACKUP_TARGET" -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" -exec rm -rf {} \;
echo "[backup] 完成（保留 $KEEP_DAYS 天，实际恢复点=$DATE）"
