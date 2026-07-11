# API Starter Kit

> 基于 AdonisJS 7 + Vue 3 + shadcn-vue 的全栈应用模板，内置认证、OpenAPI、API Key、页面模板与可配置 AI 助手。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.12.0-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.9.0-orange.svg)](package.json)

开箱即用的全栈开发起点，你可以在此基础上快速构建业务功能，无需重复搭建基础设施。

## 已包含的能力

- **用户认证** — 登录/登出、密码强度与过期策略、登录锁定
- **双因素认证** — TOTP 2FA (基于 otplib + QR 码)
- **API Key 管理** — 创建/吊销/删除，支持过期时间配置
- **OpenAPI 文档** — Scalar UI 与 JSON/YAML 规范，自动由路由和装饰器生成
- **路由驱动导航** — 侧栏菜单与面包屑均来自路由 `meta` 定义
- **Schema 构建器** — JSON Schema 的可视化编辑、校验与预览示例
- **模板中心** — 概览、详情、设置、列表管理、任务流转、数据分析、分步引导与操作模式示例
- **AI 助手** — OpenAI SDK 兼容、流式多轮对话、历史会话、可配置系统提示词与安全页面上下文
- **国际化** — 中文和英文文案
- **Docker 部署** — 多阶段构建，Nginx + PostgreSQL
- **Monorepo 工程** — pnpm workspace + Turborepo + ESLint + Prettier

## 目录

- [快速开始](#快速开始)
- [开发命令](#开发命令)
- [API 概览](#api-概览)
- [页面与模板](#页面与模板)
- [AI 助手](#ai-助手)
- [部署](#部署)
- [项目结构](#项目结构)
- [技术栈](#技术栈)

## 快速开始

### 环境要求

- Node.js `>= 24.12.0`
- pnpm `11.9.0`
- Docker / Docker Compose (可选)
- PostgreSQL 15

### 1. 安装依赖

```bash
pnpm install
```

### 2. 创建环境变量文件

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

生成后端 `APP_KEY`：

```bash
pnpm --dir apps/backend exec node ace generate:key --show
```

写入 `apps/backend/.env`：

```env
APP_KEY=<generated-app-key>
```

### 3. 启动 PostgreSQL（可选启动 Ollama）

```bash
docker compose up -d postgres
```

AI 助手默认配置指向本机 Ollama 的 OpenAI 兼容地址。Ollama 不会随默认 Compose 启动，也不会自动拉取模型。需要本地模型时，按需启动并手动拉取：

```bash
docker compose --profile ollama up -d ollama
docker compose exec ollama ollama pull llama3.2:1b
```

`llama3.2:1b` 适合基础对话和本地开发。也可以在 `apps/backend/.env` 按用户配置覆盖 `AI_OPENAI_*` 变量，接入宿主机 Ollama、独立 Ollama 服务或任意 OpenAI 兼容服务。

当后端也运行在 Docker Compose 中并使用该可选 Ollama 服务时，将 `apps/backend/.env` 中的地址改为 Docker 服务名：

```env
AI_OPENAI_BASE_URL=http://ollama:11434/v1
```

### 4. 执行数据库迁移

```bash
pnpm --dir apps/backend exec node ace migration:run
```

### 5. 启动开发服务

```bash
pnpm dev
```

默认访问地址：

| 服务       | 地址                                        |
| ---------- | ------------------------------------------- |
| 前端       | `http://localhost:18080`                    |
| 后端 API   | `http://localhost:13333`                    |
| PostgreSQL | `localhost:5432`                            |
| Ollama     | `http://localhost:11434`（启用 profile 后） |

开发环境不经过 Nginx。OpenAPI 文档由后端直接提供：`http://localhost:13333/api-docs`。

默认管理员来自 `apps/backend/.env`：

```env
ADMIN_EMAIL=admin@example.local
ADMIN_PASSWORD=Change-Me-1234-5678-9012
ADMIN_FULL_NAME=Admin
```

只有当用户表为空时，系统才会自动创建管理员。

## 开发命令

常用命令：

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动前后端开发服务
pnpm build            # 构建全部应用
pnpm typecheck        # 类型检查
pnpm test             # 测试
pnpm format           # 格式化
```

后端：

```bash
pnpm --dir apps/backend dev
pnpm --dir apps/backend typecheck
pnpm --dir apps/backend test
pnpm --dir apps/backend exec node ace migration:run
pnpm --dir apps/backend exec node ace migration:fresh --force
```

前端：

```bash
pnpm --dir apps/frontend dev
pnpm --dir apps/frontend typecheck
pnpm --dir apps/frontend test
pnpm --dir apps/frontend build
```

## API 概览

后端已接入 `@foadonis/openapi`，OpenAPI 文档由 AdonisJS 路由和装饰器生成。

| 入口      | 地址             | 说明               |
| --------- | ---------------- | ------------------ |
| 文档页面  | `/api-docs`      | Scalar UI 文档界面 |
| JSON 规范 | `/api-docs.json` | OpenAPI JSON       |
| YAML 规范 | `/api-docs.yaml` | OpenAPI YAML       |

开发环境请使用后端地址，例如 `http://localhost:13333/api-docs`；生产环境可通过 Nginx 的同路径访问。

基础路径：`/api/v1`

健康检查：

| 方法  | 路径      | 说明     |
| ----- | --------- | -------- |
| `GET` | `/health` | 健康检查 |

认证与账号：

| 方法   | 路径                    | 说明                         |
| ------ | ----------------------- | ---------------------------- |
| `POST` | `/auth/login`           | 登录                         |
| `POST` | `/auth/2fa/verify`      | 登录时验证 2FA               |
| `POST` | `/auth/signup`          | 已禁用，管理员由环境变量创建 |
| `GET`  | `/account/profile`      | 当前管理员信息               |
| `PUT`  | `/account/password`     | 修改密码                     |
| `POST` | `/account/2fa/generate` | 生成 2FA 配置                |
| `POST` | `/account/2fa/enable`   | 启用 2FA                     |
| `POST` | `/account/2fa/disable`  | 停用 2FA                     |
| `POST` | `/account/logout`       | 退出登录                     |

管理接口：

| 资源    | 路径                         |
| ------- | ---------------------------- |
| API Key | `/api-keys`、`/api-keys/:id` |

模板提供 API Key 的生成、校验与中间件能力，但当前没有内置业务接口启用 API Key 鉴权。接入新业务接口时，显式挂载 `middleware.apiKey()` 后才可使用 API Key；账户、登录、2FA、API Key 管理与 AI 会话接口使用管理员 Bearer Token，不接受 API Key。

所有接口返回结构：

```json
{
  "data": {}
}
```

## 页面与模板

前端导航、面包屑和模板入口由 `apps/frontend/src/router/modules/workbench.ts` 的路由元信息驱动。侧栏的“模板”分组包含以下可运行示例：

- 页面模板：概览、详情、设置、组合筛选、批量操作、侧栏详情和移动端列表
- 任务流转：审批状态、评论和活动时间线
- 数据分析：筛选、指标、骨架加载、表格与分页
- 分步引导：表单校验与 `Stepper` 进度
- 操作模式：高级表单、搜索选择、导入导出、命令面板、通知与反馈状态

这些页面使用当前项目的设计 token 和 shadcn-vue 组件，作为后续业务页面的实现参考，而非生产数据看板。

## AI 助手

AI 助手使用 OpenAI SDK，可接入 OpenAI、DeepSeek、Qwen 等 OpenAI 兼容服务。它默认提供纯聊天、流式输出、多轮上下文、停止生成、重试、复制和会话历史。

后端配置位于 `apps/backend/.env`：

| 变量                      | 说明                                           |
| ------------------------- | ---------------------------------------------- |
| `AI_OPENAI_API_KEY`       | 服务商 API Key，Ollama 默认值为 `ollama`       |
| `AI_OPENAI_BASE_URL`      | OpenAI 兼容 API 地址，默认本地 Ollama          |
| `AI_OPENAI_MODEL`         | 模型名称，默认 `llama3.2:1b`                   |
| `AI_SYSTEM_PROMPT`        | 可选的项目系统提示词                           |
| `AI_TEMPERATURE`          | 生成温度，服务端限制为 `0-2`                   |
| `AI_MAX_HISTORY_MESSAGES` | 每次请求携带的历史消息数，服务端限制为 `1-100` |

助手默认仅发送当前路由与页面标题。项目可以显式注册上下文 provider 或客户端动作；未注册时不会读取页面数据，也不会执行业务操作。相关扩展点位于：

- `apps/frontend/src/lib/ai-chat-context.ts`
- `apps/frontend/src/lib/ai-chat-actions.ts`

## 部署

构建并启动生产 Docker 服务：

```bash
docker compose build
docker compose up -d
```

生产 Compose 行为：

- 启动 PostgreSQL
- 不强制启动 Ollama；启用 `ollama` profile 后由用户自行拉取模型
- 后端启动前自动执行数据库迁移
- 前端由 Nginx 提供静态资源
- Nginx 将 `/api/*` 代理到后端
- 后端运行端口读取 `apps/backend/.env` 的 `PORT`

默认生产地址：

| 服务 | 地址                     |
| ---- | ------------------------ |
| 前端 | `http://localhost:18080` |
| 后端 | `http://localhost:13333` |

## 安全设计

- 系统只保留单管理员模型
- 注册接口禁用，管理员由环境变量初始化
- 用户表非空时不会重复创建管理员
- 密码由框架 Hash 能力存储
- 密码策略要求长度和字符混合，并拦截常见弱密码
- 连续登录失败会触发账号锁定
- 2FA secret 和 recovery code 加密存储
- API Key 使用 hash 鉴权，完整明文仅在创建时返回一次
- 生产错误响应脱敏，不暴露 SQL、堆栈和内部异常细节

## 项目结构

```text
.
├── apps/
│   ├── backend/
│   │   ├── app/controllers/          # HTTP 控制器
│   │   ├── app/middleware/           # 认证、API Key、JSON 响应中间件
│   │   ├── app/models/               # Lucid 模型
│   │   ├── app/services/             # 业务服务
│   │   ├── app/validators/           # VineJS 校验器
│   │   ├── database/migrations/      # 数据库迁移
│   │   └── start/                    # 路由与启动配置
│   └── frontend/
│       ├── src/components/           # 业务组件和 shadcn-vue 组件
│       ├── src/lib/                  # API、表单构建、工具函数
│       ├── src/locales/              # 中文和英文文案
│       ├── src/router/               # 路由模块
│       ├── src/stores/               # Pinia store
│       └── src/views/                # 页面
├── docker-compose.yml
├── Dockerfile
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 环境配置

### 后端

文件：`apps/backend/.env`

| 变量                                      | 说明                                          |
| ----------------------------------------- | --------------------------------------------- |
| `NODE_ENV`                                | 运行环境：`development`、`production`、`test` |
| `HOST` / `PORT`                           | 后端监听地址                                  |
| `LOG_LEVEL`                               | 日志级别                                      |
| `APP_KEY`                                 | AdonisJS 应用密钥                             |
| `APP_URL`                                 | 后端对外地址                                  |
| `ADMIN_EMAIL`                             | 默认管理员邮箱                                |
| `ADMIN_PASSWORD`                          | 默认管理员密码                                |
| `ADMIN_FULL_NAME`                         | 默认管理员名称                                |
| `SESSION_DRIVER`                          | Session 驱动                                  |
| `DB_HOST` / `DB_PORT`                     | PostgreSQL 地址                               |
| `DB_USER` / `DB_PASSWORD` / `DB_DATABASE` | PostgreSQL 凭据                               |
| `CORS_ORIGIN`                             | 允许访问 API 的前端源，逗号分隔               |
| `TZ`                                      | 运行时区，建议 `Asia/Shanghai`                |
| `AI_OPENAI_API_KEY`                       | OpenAI 兼容服务的 API Key，默认 `ollama`      |
| `AI_OPENAI_BASE_URL`                      | OpenAI 兼容服务地址，默认本地 Ollama          |
| `AI_OPENAI_MODEL`                         | 模型名称，默认 `llama3.2:1b`                  |
| `AI_SYSTEM_PROMPT`                        | 可选的 AI 系统提示词                          |
| `AI_TEMPERATURE`                          | AI 生成温度，范围 `0-2`                       |
| `AI_MAX_HISTORY_MESSAGES`                 | AI 多轮历史窗口，范围 `1-100`                 |

### 前端

文件：`apps/frontend/.env`

| 变量           | 说明                  |
| -------------- | --------------------- |
| `VITE_API_URL` | 开发环境后端 API 地址 |
| `TZ`           | 运行时区              |

## 技术栈

后端：

- AdonisJS 7
- Lucid ORM
- PostgreSQL
- VineJS
- OpenAPI / Scalar UI
- Japa (测试)
- Luxon
- otplib + qrcode (2FA)

前端：

- Vue 3 (Composition API + `<script setup>`)
- Vue Router 5
- Pinia 3
- shadcn-vue / Reka UI
- Tailwind CSS 4
- vee-validate + Zod
- TanStack Table
- vue-sonner
- vue-i18n
- markstream-vue

工程：

- pnpm workspace
- Turborepo
- Docker
- ESLint + Prettier

## License

[MIT](LICENSE)
