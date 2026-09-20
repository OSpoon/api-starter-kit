# 快速开始

## 环境要求

- Node.js `>= 24.12.0`；仓库建议版本见 `.nvmrc`（当前为 `24.15.0`）
- pnpm `11.9.0`
- Docker Desktop（Compose 内的 PostgreSQL），或可访问的 PostgreSQL 15+ 实例
- 如果启动桌面端：Rust stable、Tauri 所需的 macOS/Windows/Linux 原生构建依赖

## 安装与配置

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
pnpm --dir apps/backend exec node ace generate:key --show
```

将生成的值写入 `apps/backend/.env` 的 `APP_KEY`。启动任何服务前，必须将其中的
`ADMIN_PASSWORD` 和 `DB_PASSWORD` 替换为密码管理器生成的、彼此不同的高强度密码；
示例文件中的 `Change-Me-1234-5678-9012` 和 `app_password` 只是占位值，不能用于共享或生产环境。
管理员密码至少 15 位，并满足项目密码强度要求。不要将 `apps/backend/.env` 提交到 Git。

`ADMIN_EMAIL`、`ADMIN_PASSWORD` 和 `ADMIN_FULL_NAME` 用于初始化首个管理员；仅当用户表为空时创建。

生产环境可启用 Cloudflare Turnstile 登录保护：在 Cloudflare 创建 Widget，将 Site Key 写入 `apps/frontend/.env` 的 `VITE_TURNSTILE_SITE_KEY`，将 Secret Key 写入 `apps/backend/.env` 的 `TURNSTILE_SECRET_KEY`，并设置 `TURNSTILE_ENABLED=true`。后端会在登录时通过 Cloudflare 服务端校验临时 token；本地开发默认关闭。

## 启动本地服务

启动 PostgreSQL，执行迁移并运行开发服务器：

```bash
pnpm docker:up
pnpm --dir apps/backend exec node ace migration:run
pnpm dev
```

开发命令 `pnpm docker:up` 会启动 PostgreSQL，并映射 PostgreSQL `5432`，以便宿主机运行的后端连接。根目录
`pnpm dev` 会通过 Turbo 同时启动 backend、管理端 frontend、三个 Bot、独立助手 Web、Tauri 桌面端和 Chrome 扩展；
它们共用一套后端服务。独立助手 Web 使用 `17070`，管理端使用 `18080`，桌面端连接已经运行的
`17070`，不会再启动第二个 Vite 服务。

| 服务         | 默认地址                                         |
| ------------ | ------------------------------------------------ |
| 管理端 Web   | `http://localhost:18080`                         |
| 独立助手 Web | `http://localhost:17070`                         |
| 后端 API     | `http://localhost:13333`                         |
| OpenAPI UI   | `http://localhost:13333/api-docs`                |
| 桌面端       | 原生窗口，无独立 HTTP 端口                       |
| Chrome 扩展  | Extension.js 启动的 Chrome 配置文件和 side panel |

如果只调试某个客户端或 Bot，可按[工程开发指南](development.md)中的应用命令单独启动；独立助手 Web 使用 `pnpm --dir apps/assistant-web dev`，如果只启动桌面端，
必须先让 `17070` 上的助手 Web 可访问，再执行 `pnpm --dir apps/assistant-desktop dev`。推荐日常开发使用根目录
`pnpm dev`，避免遗漏桌面端依赖的 Web 服务。

独立助手 Web 的开发代理默认将 `/api/v1` 转发到 `http://localhost:13333`，也可以通过
`VITE_DEV_API_PROXY_TARGET` 覆盖。生产构建使用 `VITE_API_URL` 指向 API 服务；桌面端生产构建必须配置
可被桌面 WebView 访问的 HTTPS API 地址。

OpenAPI UI 需要后端环境变量 `OPENAPI_DOCS_ENABLED=true`。

## 下一步

完成登录后，阅读[产品扩展指南](customization.md)开始替换 starter 示例并添加业务 feature。需要了解模块边界时，阅读[系统架构](architecture.md)；需要配置 AI、ASR 或渠道 Bot 时，再查阅对应的参考文档。
