# ADR-0005：Docker内网隔离与短期服务JWT

- 状态：Accepted
- 日期：2026-08-30
- 影响阶段：Stage 04、06、07

## 背景

Next Core需要调用FastAPI控制面。当前为单机Docker网络，引入mTLS证书生命周期会显著增加个人项目运维成本，但仅依赖网络隔离无法证明调用方身份。

## 决策

- Docker内部网络为第一层隔离。
- Next签发HS256服务JWT，FastAPI验证。
- TTL 5分钟，允许30秒时钟偏差。
- 必填issuer、audience、subject、jti、iat、exp。
- 审核和draft物化使用jti进行短期重放保护。
- current/previous两个Secret支持无中断轮换。

## 后果

- 不引入证书服务，适合单机Demo。
- 共享Secret必须只存在部署Secret/local env。
- 多机部署或更高安全等级时复审mTLS。
