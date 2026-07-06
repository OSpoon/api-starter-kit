# API Starter Kit

> 基于 AdonisJS 7 + Vue 3 + shadcn-vue 的全栈应用模板，内置认证、API Key 管理和 Docker 部署能力。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.12.0-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.9.0-orange.svg)](package.json)

开箱即用的全栈开发起点，你可以在此基础上快速构建业务功能，无需重复搭建基础设施。

## 已包含的能力

- **用户认证** — 登录/登出、密码强度与过期策略、登录锁定
- **双因素认证** — TOTP 2FA (基于 otplib + QR 码)
- **API Key 管理** — 创建/吊销/删除，支持过期时间配置
- **API 文档** — OpenAPI / Scalar UI，自动由路由和装饰器生成
- **国际化** — 中文和英文文案
- **Docker 部署** — 多阶段构建，Nginx + PostgreSQL
- **Monorepo 工程** — pnpm workspace + Turborepo + ESLint + Prettier

## 目录

- [快速开始](#快速开始)
- [开发命令](#开发命令)
- [API 概览](#api-概览)
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

### 3. 启动 PostgreSQL

```bash
docker compose up -d postgres
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

| 服务       | 地址                     |
| ---------- | ------------------------ |
| 前端       | `http://localhost:18080` |
| 后端 API   | `http://localhost:13333` |
| PostgreSQL | `localhost:5432`         |

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

所有接口返回结构：

```json
{
  "data": {}
}
```

## 部署

构建并启动生产 Docker 服务：

```bash
docker compose build
docker compose up -d
```

生产 Compose 行为：

- 启动 PostgreSQL
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
- API Key 使用 hash 鉴权，加密保存原始 key
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

工程：

- pnpm workspace
- Turborepo
- Docker
- ESLint + Prettier

## License

[MIT](LICENSE)
