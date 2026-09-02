# 快速开始

## 环境要求

- Node.js `>= 24.12.0`
- pnpm `11.9.0`
- Docker Desktop（Compose 内的 PostgreSQL），或可访问的 PostgreSQL 15+ 实例

## 安装与配置

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
pnpm --dir apps/backend exec node ace generate:key --show
```

将生成的值写入 `apps/backend/.env` 的 `APP_KEY`。`ADMIN_EMAIL`、`ADMIN_PASSWORD` 和 `ADMIN_FULL_NAME` 用于初始化首个管理员；仅当用户表为空时创建。

生产环境可启用 Cloudflare Turnstile 登录保护：在 Cloudflare 创建 Widget，将 Site Key 写入 `apps/frontend/.env` 的 `VITE_TURNSTILE_SITE_KEY`，将 Secret Key 写入 `apps/backend/.env` 的 `TURNSTILE_SECRET_KEY`，并设置 `TURNSTILE_ENABLED=true`。后端会在登录时通过 Cloudflare 服务端校验临时 token；本地开发默认关闭。

## 启动本地服务

启动 PostgreSQL，执行迁移并运行开发服务器：

```bash
pnpm docker:up
pnpm --dir apps/backend exec node ace migration:run
pnpm dev
```

开发命令 `pnpm docker:up` 会启动 PostgreSQL，并映射 PostgreSQL `5432`，以便宿主机运行的后端连接。

| 服务       | 默认地址                          |
| ---------- | --------------------------------- |
| 前端       | `http://localhost:18080`          |
| 后端 API   | `http://localhost:13333`          |
| OpenAPI UI | `http://localhost:13333/api-docs` |

OpenAPI UI 需要后端环境变量 `OPENAPI_DOCS_ENABLED=true`。

## 下一步

完成登录后，阅读[开发指南](customization.md)开始替换 starter 示例并添加业务 feature。需要了解模块边界时，阅读[系统架构](architecture.md)；需要配置 AI、ASR 或渠道 Bot 时，再查阅对应的参考文档。
