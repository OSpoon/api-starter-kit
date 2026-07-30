# 部署指南

## Docker Compose

构建并启动生产栈：

```bash
docker compose build
docker compose up -d
```

Compose 会启动支持 pgvector 的 PostgreSQL、AdonisJS 后端与 Nginx 托管的前端。后端等待 PostgreSQL 就绪，在 `MIGRATE=true` 时运行迁移，并通过 `/api/v1/health/ready` 暴露就绪检查。

| 服务       | 默认地址                 |
| ---------- | ------------------------ |
| 前端       | `http://localhost:18080` |
| 后端       | `http://localhost:13333` |
| PostgreSQL | `localhost:5432`         |

按需通过 `FRONTEND_PORT`、`BACKEND_PORT` 和 `OLLAMA_PORT` 覆盖端口。

## 环境配置

维护 `apps/backend/.env` 与 `apps/frontend/.env` 中的部署值；`.env.example` 是可用变量与默认值的完整来源。

至少配置安全的 `APP_KEY`、管理员初始化值、PostgreSQL 凭据、正确的 `CORS_ORIGIN`，以及启用助手时的 AI 提供方配置。仅在需要暴露文档端点的环境设置 `OPENAPI_DOCS_ENABLED=true`。

`.env` 是敏感文件，不得提交，也不得将生产凭据复制到前端环境变量。

## AI 与可观测性

Ollama 是可选服务：

```bash
docker compose --profile ollama up -d ollama
```

Compose 后端访问该服务时设置 `AI_OPENAI_BASE_URL=http://ollama:11434/v1`。其他 OpenAI 兼容提供方使用 `AI_OPENAI_*`，知识检索使用 `AI_EMBEDDING_*` 配置。

Langfuse 默认关闭。仅在配置 `LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY` 与 `LANGFUSE_BASE_URL` 后启用；关闭时应用不会调用 Langfuse 网络服务。

## 运维检查

- 使用 `docker compose ps` 检查容器健康状态。
- 访问部署地址的 `/api/v1/health/ready` 检查后端就绪状态。
- 使用 `pnpm --dir apps/backend exec node ace migration:status` 对目标数据库核对迁移。
- 根据网络策略限制后端和 OpenAPI 端口的暴露范围。

生产上线前阅读[安全与治理](security.md)。
