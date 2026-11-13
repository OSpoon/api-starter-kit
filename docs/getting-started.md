# 快速开始

本指南启动 PostgreSQL、backend 和管理端 Web。其他客户端和 Bot 按需启动，见[工程开发指南](development.md)。

## 环境要求

- Node.js `24.15.0`（仓库版本见 `.nvmrc`）
- pnpm `11.9.0`
- Docker Compose v2，或可访问的 PostgreSQL 15+ 实例

## 安装与配置

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
pnpm --dir apps/backend exec node ace generate:key --show
```

将生成的密钥填入 `apps/backend/.env` 的 `APP_KEY`。启动服务前，替换示例中的
`ADMIN_PASSWORD` 和 `DB_PASSWORD`，使用彼此不同的高强度密码；管理员密码至少 15 位。
不要提交 `.env` 文件或复用示例密码。

`ADMIN_EMAIL`、`ADMIN_PASSWORD` 和 `ADMIN_FULL_NAME` 用于初始化管理员。同邮箱账号已存在时，初始化不会重置密码，也不会自动启用已停用账号。

## 启动本地环境

使用内置菜单启动 PostgreSQL，执行迁移，再启动 backend 和管理端：

```bash
pnpm docker
pnpm --dir apps/backend exec node ace migration:run
pnpm dev
```

| 服务                 | 默认地址                          |
| -------------------- | --------------------------------- |
| 管理端 Web           | `http://localhost:18080`          |
| Backend API          | `http://localhost:13333`          |
| OpenAPI UI（启用后） | `http://localhost:13333/api-docs` |

`pnpm dev` 只启动 backend 和管理端。OpenAPI UI 需要在 backend 环境中设置
`OPENAPI_DOCS_ENABLED=true`。本地开发通常无需启用 Turnstile、OAuth、LLM 或 Bot 配置；生产设置见[部署指南](deployment.md)。

登录后，可阅读[产品扩展指南](customization.md)开始构建业务功能；完整文档入口见[文档总览](README.md)。
