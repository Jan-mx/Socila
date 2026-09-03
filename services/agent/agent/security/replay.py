"""JTI重放事务消费（SJWT-FR-008、PRD §6.4/§7.3）。

接收方顺序：解析Bearer→验证签名/Header/claims→开始数据库事务→删除过期重放记录
→插入JTI（主键唯一，冲突即重放）→业务写入→提交。插入冲突时整体回滚，路由统一401。

- 业务写与JTI消费处于同一事务：业务回滚时JTI也回滚，调用方可用新令牌+相同业务
  幂等键安全重试（AC-013）。
- 过期记录机会式批量删除；删除失败不得绕过当前JTI唯一插入（§7.3）。
- 重放存储不可用属于基础设施失败：失败关闭，503 SERVICE_AUTH_STORE_UNAVAILABLE
  （AC-014），绝不退回内网Header信任（NFR-004）。
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol

# 业务写入端口：接收方事务句柄（InMemory为None，Postgres为psycopg连接）。
TxHandle = Any


class JtiReplayConflict(Exception):
    """同一JTI重复消费：视为重放，回滚整个事务并统一401（FR-008/AC-012）。"""

    def __init__(self, jti: str) -> None:
        # 仅携带JTI（UUID元数据，§7.3）；不携带令牌、签名或Header。
        super().__init__("jti-replay")
        self.jti = jti


class ServiceAuthStoreUnavailable(Exception):
    """重放存储不可用：失败关闭，503 SERVICE_AUTH_STORE_UNAVAILABLE（§8.3/AC-014）。"""

    public_code = "SERVICE_AUTH_STORE_UNAVAILABLE"

    def __init__(self, category: str) -> None:
        super().__init__(self.public_code)
        self.category = category


class ReplayGuard(Protocol):
    """接收方事务端口：JTI消费与业务写入同事务（§6.3）。"""

    def with_jti(self, claims: Any, work_fn: Callable[[TxHandle], Any]) -> Any: ...


class InMemoryReplayGuard:
    """单元测试实现：模拟JTI唯一消费（无真实数据库事务）。"""

    def __init__(self) -> None:
        self._consumed: set[str] = set()

    def with_jti(self, claims: Any, work_fn: Callable[[TxHandle], Any]) -> Any:
        jti = claims.jti
        if jti in self._consumed:
            raise JtiReplayConflict(jti)
        self._consumed.add(jti)
        return work_fn(None)


class PostgresReplayGuard:
    """生产实现：agent.service_jwt_replays与业务写入同事务（psycopg3）。

    业务写入必须通过work_fn(conn)在传入连接上执行，才能与JTI插入同事务提交/回滚。
    agent_app角色仅持有本表最小读写权限（0007迁移GRANT）。
    """

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def with_jti(self, claims: Any, work_fn: Callable[[TxHandle], Any]) -> Any:
        import psycopg

        try:
            conn = psycopg.connect(self._database_url)
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            # 连接失败：存储不可用，失败关闭（NFR-004），绝不回退Header信任。
            raise ServiceAuthStoreUnavailable("connect-failed") from exc

        # replay_phase标记重放SQL阶段（连接/事务初始化/删过期/JTI插入）：
        # 该阶段的连接中断类错误统一映射存储不可用（AC-014）；
        # work_fn业务阶段的异常一律原样传播，不得包装为存储不可用（AC-013）。
        replay_phase = True
        try:
            with conn.transaction():
                self._consume_jti(conn, claims)
                replay_phase = False
                return work_fn(conn)
        except JtiReplayConflict:
            # 重复JTI单独传播（路由映射统一401，FR-008/AC-012），绝不归入存储不可用。
            raise
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            if not replay_phase:
                raise
            # 重放阶段的连接中断/事务初始化失败：统一存储不可用（AC-014）。
            raise ServiceAuthStoreUnavailable("store-unavailable") from exc
        finally:
            conn.close()

    @staticmethod
    def _consume_jti(conn: Any, claims: Any) -> None:
        """重放存储SQL阶段：失败统一映射存储不可用（503，FR-009/AC-014）。

        覆盖删除过期记录失败、JTI插入失败、重放表缺失（42P01）、权限不足（42501）
        等全部重放存储SQL错误；JtiReplayConflict非psycopg异常，单独传播。
        work_fn业务异常不属于本阶段，不在本方法的映射范围内。
        """
        import psycopg

        try:
            # 机会式删除过期记录（§7.3）：失败会回滚本事务并按存储不可用处理，
            # 绝不绕过下方当前JTI的唯一插入。JTI插入与业务写入同事务提交/回滚。
            conn.execute("DELETE FROM agent.service_jwt_replays WHERE expires_at < now()")
            cur = conn.execute(
                "INSERT INTO agent.service_jwt_replays (jti, issuer, subject, audience, expires_at) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (jti) DO NOTHING",
                (
                    claims.jti,
                    claims.iss,
                    claims.sub,
                    claims.aud,
                    datetime.fromtimestamp(claims.exp, tz=UTC),
                ),
            )
            if cur.rowcount != 1:
                raise JtiReplayConflict(claims.jti)
        except psycopg.Error as exc:
            raise ServiceAuthStoreUnavailable("replay-sql-failed") from exc
