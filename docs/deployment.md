# 部署指南

## Docker Compose

构建并启动生产栈：

```bash
docker compose --env-file apps/backend/.env build
docker compose --env-file apps/backend/.env up -d
```

生产部署使用上述命令；不要使用开发命令 `pnpm docker:up`，因为开发模式会映射 PostgreSQL 的 `5432` 端口。

Compose 会启动支持 pgvector 的 PostgreSQL、AdonisJS 后端与 Nginx 托管的前端。PostgreSQL 只加入 Compose 内部网络，不映射宿主机端口；后端等待 PostgreSQL 就绪，在 `MIGRATE=true` 时运行迁移，并通过 `/api/v1/health/ready` 暴露就绪检查。

| 服务 | 默认地址                 |
| ---- | ------------------------ |
| 前端 | `http://localhost:18080` |
| 后端 | `http://localhost:13333` |

按需通过 `FRONTEND_PORT` 和 `BACKEND_PORT` 覆盖端口。生产环境的 PostgreSQL 仅加入 Compose 内部网络，不映射宿主机端口；开发环境通过 `docker-compose.dev.yml` 单独映射 `5432`，供宿主机后端连接。

## 环境配置

维护 `apps/backend/.env` 与 `apps/frontend/.env` 中的部署值；`.env.example` 是可用变量与默认值的完整来源。

至少配置安全的 `APP_KEY`、管理员初始化值、PostgreSQL 凭据、正确的 `CORS_ORIGIN`，以及启用助手时的 AI 提供方配置。仅在需要暴露文档端点的环境设置 `OPENAPI_DOCS_ENABLED=true`。

`.env` 是敏感文件，不得提交，也不得将生产凭据复制到前端环境变量。

## AI 与可观测性

OpenAI-compatible provider 和知识检索配置在系统管理中的「LLM 配置」页面维护。部署后确认 provider 地址可从 backend 容器或宿主机访问。

AI 助手通过系统管理中的「LLM 配置」页面接入配置的 provider。配置保存后无需重启服务即可生效。

## 运维检查

- 使用 `docker compose ps` 检查容器健康状态。
- 访问部署地址的 `/api/v1/health/ready` 检查后端就绪状态。
- 使用 `pnpm --dir apps/backend exec node ace migration:status` 对目标数据库核对迁移。
- 根据网络策略限制前端和后端端口的暴露范围；不要重新为 PostgreSQL 添加宿主机端口映射。

生产上线前阅读[安全与治理](security.md)。
