# 部署指南

生产栈由支持 pgvector 的 PostgreSQL、AdonisJS API、三个独立的 AI 渠道 Bot
worker、Nginx 管理端和独立助手 Web 静态站点组成。桌面端按 macOS、Windows
或 Linux 目标构建安装包。认证、授权、迁移和运行时配置仍由 backend 负责。

## 1. 部署前准备

生产主机需要：

- Docker Engine 或 Docker Desktop，以及 Docker Compose v2；
- 能够访问镜像仓库、npm registry 和所需外部 AI/渠道服务的网络；
- 至少能持久化 Docker volume 的磁盘空间；知识库和 AI 会话数据都存储在 PostgreSQL 中。

仓库要求的 Node.js `>= 24.12.0` 和 pnpm `11.9.0` 主要用于本地开发与运维命令；纯 Docker 生产启动由镜像中的 Node.js `24.15.0` 执行。

部署目录应为仓库根目录，因为 Compose 文件中的路径均相对于仓库根目录解析：

```text
docker/docker-compose.yml
docker/docker-compose.dev.yml
docker/Dockerfile
apps/backend/.env
apps/frontend/.env
```

## 2. 配置环境变量

复制示例文件并分别填写 backend 和 frontend 配置：

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

安全提示：`apps/backend/.env.example` 中的 `ADMIN_PASSWORD=Change-Me-1234-5678-9012`
和 `DB_PASSWORD=app_password` 都是公开的占位值。生产部署前必须将两者替换为密码管理器
生成的、彼此不同的高强度随机密码；不要复用管理员密码、提交 `.env`，或把密码写入
frontend 环境变量。管理员密码至少 15 位，并满足项目密码强度要求。

生产环境至少检查以下 backend 变量：

| 变量                                                 | 生产要求                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                           | 设置为 `production`；Compose 会再次覆盖为 `production`。                                                                                       |
| `HOST` / `PORT`                                      | 容器内应为 `0.0.0.0` / `13333`；Compose 会覆盖 `HOST`，端口不要改成与 Dockerfile/Compose 不一致的值。                                          |
| `APP_KEY`                                            | 必须填写高强度、稳定且只保存在服务端的密钥；更换会影响加密数据。                                                                               |
| `APP_URL`                                            | 填写对外可访问的 backend URL。                                                                                                                 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_FULL_NAME` | 首次启动时用于自动创建首个管理员；必须使用未在其他环境复用的高强度密码，至少 15 位并满足项目密码强度要求。                                     |
| `DB_USER` / `DB_PASSWORD` / `DB_DATABASE`            | PostgreSQL 初始化凭据；必须使用未与管理员或其他服务复用的高强度密码。Compose 会把它们传给 PostgreSQL，并让 backend 连接内部主机名 `postgres`。 |
| `CORS_ORIGIN`                                        | 填写允许跨域访问 API 的前端 origin，多个值用逗号分隔，例如 `https://app.example.com`。同源访问仍由 Nginx 代理。                                |
| `SESSION_DRIVER`                                     | 当前示例使用 `cookie`；按认证部署策略配置。                                                                                                    |
| `OPENAPI_DOCS_ENABLED`                               | 生产默认建议为 `false`；仅在确实需要 `/api-docs` 时开启，并限制 backend 暴露范围。                                                             |

可选能力的配置也来自 `apps/backend/.env.example`：GitHub OAuth 使用
`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` 和正确的
`GITHUB_OAUTH_FRONTEND_URL`；Turnstile 需要 backend 的
`TURNSTILE_ENABLED`、`TURNSTILE_SECRET_KEY` 与 frontend 的
`VITE_TURNSTILE_SITE_KEY` 同时匹配。

不要把 backend `.env` 提交到 Git，也不要把 `APP_KEY`、数据库密码、OAuth
secret、Bot secret 或 AI API key 写入 frontend 环境变量。LLM、Embedding 和
ASR 凭据在首次迁移后通过系统管理的「LLM 配置」页面维护，Bot 凭据通过「IM
配置」页面维护，敏感值由 backend 加密保存。

如果 PostgreSQL 已经使用现有 volume 初始化，之后仅修改 `.env` 中的
`DB_PASSWORD` 不会修改数据库内部密码；请按既有数据库凭据轮换流程先同步更新
PostgreSQL 用户密码，再更新应用配置，避免直接删除 volume。

### 前端环境变量的 Docker 边界

frontend 是在镜像构建阶段生成的静态文件，Nginx 不会在容器启动时读取
`apps/frontend/.env`。当前生产 Compose 不向 frontend build 传入
`VITE_*` build arg，而是依靠 Nginx 将 `/api/` 反代到 `backend:13333`；
因此默认部署时 frontend 使用同源 API，不需要把 backend 地址写入浏览器。

如果通过其他构建流水线使用 `VITE_API_URL`、
`VITE_TURNSTILE_SITE_KEY`、`VITE_PLATFORM_NAME` 或
`VITE_PLATFORM_TAGLINE`，必须在构建 frontend 静态产物前注入这些变量，
并重新构建镜像。不要把运行时 `env_file` 当作静态 frontend 配置注入方式。

### 独立助手 Web 与桌面端的配置边界

独立助手 Web 在生产 Compose 中由单独的 `assistant-web` 服务构建和托管，默认对外端口为
`17070`。该服务使用自己的静态产物镜像，并复用管理端 Nginx 配置中的安全响应头、静态资源缓存
和 `/api/` 到 backend 的同源反向代理。可用 `ASSISTANT_WEB_PORT` 修改宿主机端口；如果启用
Turnstile，可通过构建时变量 `VITE_TURNSTILE_SITE_KEY` 注入公开站点密钥。

若选择将助手 Web 部署到独立域名、CDN 或其他静态站点，则需在构建时设置 `VITE_API_URL`；当
Web 与 API 不同源时，必须把 Web origin 加入 backend 的 `CORS_ORIGIN`，并使用 HTTPS。

```bash
VITE_API_URL=https://api.example.com pnpm --dir apps/assistant-web build
```

桌面端构建会先执行 `apps/assistant-web` 的构建，再将 `apps/assistant-web/dist` 打包进 Tauri
安装包。桌面端运行时可在首次启动时配置服务端 origin，并通过
`/api/v1/health/ready` 检查连接；地址保存在本机 WebView 的 localStorage 中，更换服务端会清除
当前登录 token。客户端要求服务端实现本仓库的 `/api/v1` API 契约，地址只填写 origin（协议、主机和
可选端口），不能包含路径、查询参数或凭据。远程地址必须使用 HTTPS；仅 localhost/loopback 可用 HTTP。

`VITE_API_URL` 对桌面端构建变为可选项：如果注入则作为首次连接的默认地址，否则首次启动会显示连接配置。
`17070` 仍只属于本地开发服务。桌面端使用 WebView `fetch` 访问远端 API，因此每个后端部署都必须在
`CORS_ORIGIN` 中允许对应平台的 Tauri origin，并保持 credentials/Authorization 请求头可用；macOS/Linux
默认 custom-protocol origin 与 Windows 默认 `http://tauri.localhost` 不同，请以目标构建平台实际发送的
`Origin` 为准。生产 Tauri CSP 允许 HTTPS API 连接，但不允许远程脚本；不要为接入服务端而放宽脚本策略。

桌面端登录使用邮箱/密码和 2FA。GitHub OAuth 仍可用于独立 Web；桌面版在实现 OAuth callback/deep-link
回跳前隐藏该入口，避免授权后无法回到原生客户端。

```bash
pnpm --dir apps/assistant-desktop build
```

桌面端安装包必须在对应操作系统或受支持的构建 runner 上生成，并按平台完成代码签名和公证/发布配置。
当前 updater 自动更新未启用；在配置发布 endpoint、签名密钥和 updater 公钥前，不应把未签名安装包当作正式自动更新渠道。

## 3. 首次生产部署

先检查 Compose 展开的配置，确认没有把 secret、端口或路径展开错误：

```bash
docker compose --env-file apps/backend/.env -f docker/docker-compose.yml config
```

构建并启动生产栈：

```bash
docker compose --env-file apps/backend/.env -f docker/docker-compose.yml build
docker compose --env-file apps/backend/.env -f docker/docker-compose.yml up -d
```

backend 和三个 Bot 共用 `api-starter-kit-backend:latest` 运行镜像；frontend
和 assistant-web 分别使用 `api-starter-kit-frontend:latest` 与
`api-starter-kit-assistant-web:latest`。Bot 仍然是独立容器和独立进程，但
Compose 不会为每个 Bot 重复构建一份镜像。可通过 `BACKEND_IMAGE`、`FRONTEND_IMAGE`
和 `ASSISTANT_WEB_IMAGE` 覆盖默认镜像标签，例如在多套环境中使用不同的仓库或版本标签。

独立助手 Web 不使用管理端镜像；Compose 会从同一个 Dockerfile 的 `assistant-web` 构建目标生成
独立镜像。独立助手桌面端不作为 Compose 服务运行，而是由发布流水线生成各平台安装包。

backend 容器启动时会执行 `apps/backend/docker-entrypoint.js`。在生产
Compose 中 `MIGRATE=true`，所以它会先运行：

```bash
node ace migration:run --force
```

迁移成功后才启动 API。backend 依赖 PostgreSQL healthcheck；三个 Bot 又
依赖 backend healthcheck，因此首次启动时应等待服务进入 healthy 状态。

包含知识库字段收敛的迁移完成后，已有文档的正文仍然保留，但旧目录向量可能
包含迁移前的元数据。升级后应在知识库管理台对已有文档执行一次“重建索引”，
让目录向量按当前的标题、知识源说明和可检索主题重新生成。

## 4. 服务、端口和网络

下表列出生产 Compose 服务和桌面客户端交付物；桌面端不由 Compose 启动。

| 服务/交付物         | 职责                                     | 默认对外端口/状态                              |
| ------------------- | ---------------------------------------- | ---------------------------------------------- |
| `postgres`          | `pgvector/pgvector:pg15`，持久化应用数据 | 仅 Compose 内部网络，无宿主机端口              |
| `backend`           | AdonisJS API、迁移、健康检查             | 宿主机 `13333`，可由 `BACKEND_PORT` 覆盖       |
| `wecom-bot`         | 企业微信 WebSocket AI worker             | 不暴露宿主机端口                               |
| `feishu-bot`        | 飞书长连接 AI worker                     | 不暴露宿主机端口                               |
| `dingtalk-bot`      | 钉钉 Stream AI worker                    | 不暴露宿主机端口                               |
| `frontend`          | Nginx 静态文件和 `/api/` 反向代理        | 宿主机 `18080`，可由 `FRONTEND_PORT` 覆盖      |
| `assistant-web`     | 独立助手 Web 静态文件和 `/api/` 反向代理 | 宿主机 `17070`，可由 `ASSISTANT_WEB_PORT` 覆盖 |
| `assistant-desktop` | Tauri 桌面安装包                         | 无服务端口，按操作系统发布                     |

访问入口默认为 `http://localhost:18080`。frontend 的 Nginx 配置将
`/api/` 转发到 `http://backend:13333`，并设置了 10 MB 请求体上限和
安全响应头。

独立助手 Web 入口默认为 `http://localhost:17070`，也通过同一 Compose 网络中的
`backend:13333` 访问 API，因此默认无需额外配置 CORS。

backend 就绪检查地址为：

```text
http://<backend-host>:<BACKEND_PORT>/api/v1/health/ready
```

该检查会执行 `SELECT 1` 验证数据库连接；成功响应包含
`{"status":"ok","checks":{"database":"ok",...}}`，数据库不可用时返回
HTTP `503`。生产环境不应为 PostgreSQL 增加宿主机端口映射。

## 5. 更新、停止和数据持久化

更新代码或镜像后重新构建并重建服务：

```bash
docker compose --env-file apps/backend/.env -f docker/docker-compose.yml build
docker compose --env-file apps/backend/.env -f docker/docker-compose.yml up -d
```

查看状态、日志和单个服务：

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs --tail=200 backend
docker compose -f docker/docker-compose.yml logs -f assistant-web
docker compose -f docker/docker-compose.yml logs -f wecom-bot
docker compose -f docker/docker-compose.yml logs -f feishu-bot
docker compose -f docker/docker-compose.yml logs -f dingtalk-bot
```

停止容器但保留数据库 volume：

```bash
docker compose -f docker/docker-compose.yml stop
```

删除 Compose 创建的容器和网络但保留数据库数据：

```bash
docker compose -f docker/docker-compose.yml down
```

`postgres-data` 是 PostgreSQL 的持久化 volume。`docker compose down -v`
会删除该 volume 及其中的应用数据，只能在已确认完成备份且明确需要清空
环境时使用；生产环境不要把它作为普通更新命令。

正式更新前应备份 PostgreSQL，并在目标环境核对迁移状态：

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  sh -c 'pg_dump -U "$DB_USER" -d "$DB_DATABASE"' > backup.sql

docker compose -f docker/docker-compose.yml exec backend \
  node ace migration:status
```

备份命令会将 SQL 写入宿主机当前目录，务必按组织的备份保管和访问控制
策略处理 `backup.sql`。恢复前先停止会写入数据库的应用服务，并验证目标
数据库与备份文件，不要在未确认目标的情况下覆盖生产数据。

## 6. AI 与渠道 Bot

三个 Bot 是独立进程，由 Compose 分别执行：

```text
node ace wecom:bot
node ace feishu:bot
node ace dingtalk:bot
```

Bot 未在「IM 配置」中完成对应渠道配置时，worker 会保持运行并等待配置；保存配置后，
对应渠道会自动建立连接。生产 Compose 不会对这三个 worker 设置自动重启，因此 worker
进程异常退出时仍需要按运维流程恢复服务。

它们使用 backend 的数据库、权限、知识库和受控 AI 操作，不是独立的 API
服务。LLM 配置保存后，backend 的普通请求会读取新的运行时配置；IM 配置保存后，
对应 Bot worker 会通过 PostgreSQL 配置变更通知重新读取数据库配置，先建立新长连接，
再停止旧连接。通知连接短暂断开时，worker 重连成功会主动重新对账配置。

语音输入使用系统管理中的 ASR 配置。ASR 服务需要提供 OpenAI-compatible
`/audio/transcriptions` multipart 接口，并能处理 WebM、OGG、WAV、MP3 或
M4A；默认模型为 `Qwen3-ASR-0.6B-4bit`。确认 backend 容器可以访问配置的
ASR/LLM 地址。渠道平台的应用发布、长连接、权限、绑定和卡片配置详见
[企业微信、飞书与钉钉机器人](reference/ai-channel-bots.md)。

## 7. 生产上线检查

上线前至少完成：

- `APP_KEY`、管理员密码、数据库密码和外部 secret 已替换示例值；
- `CORS_ORIGIN` 与真实前端 origin 一致，未使用不必要的通配配置；
- 如果发布独立助手 Web，`CORS_ORIGIN` 同时包含其正式 origin，且 Web 构建使用正确的 `VITE_API_URL`；
- 如果发布桌面端，已在每个后端部署的 `CORS_ORIGIN` 中按平台配置 Tauri origin，运行时只连接正式 HTTPS API，Tauri CSP 与代码签名/公证策略已确认；
- `OPENAPI_DOCS_ENABLED` 按需设置，未将不必要的 backend 管理端口暴露到公网；
- PostgreSQL 未映射宿主机端口，`postgres-data` 已纳入备份策略；
- `docker compose ... config`、容器状态和 `/api/v1/health/ready` 均正常；
- 首次管理员已登录并按需启用 2FA，管理员初始化密码不再继续作为共享凭据使用；
- 若启用 OAuth、Turnstile、LLM、ASR 或渠道 Bot，已从实际容器网络完成连通性验证；
- 已阅读[安全与治理](security.md)，并按其中的认证、凭据、AI 控制和部署加固要求配置。

## 8. 常见排障

| 现象                            | 检查方向                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` 不健康               | 检查 `DB_USER`、`DB_PASSWORD`、`DB_DATABASE` 是否一致；查看 `docker compose logs postgres`。已有 volume 使用旧凭据时，不要直接删除 volume，应按 PostgreSQL 凭据轮换流程处理。 |
| backend 反复重启                | 查看 `docker compose logs backend`；重点检查 `APP_KEY`、数据库连接、环境变量格式和迁移失败信息。                                                                              |
| Web 客户端打开但 API 失败       | 确认 backend healthy、frontend/assistant-web 与 backend 在同一 Compose 网络，浏览器请求使用 `/api/`，并检查对应 Nginx/backend 日志。                                          |
| 直接访问 backend 出现 CORS 错误 | 将浏览器 origin 加入 `CORS_ORIGIN`，或使用 frontend 的同源入口；修改 backend `.env` 后重建/重启 backend。                                                                     |
| `/api-docs` 404                 | 只有 `OPENAPI_DOCS_ENABLED=true` 时才注册该路由；修改后需要重启 backend。                                                                                                     |
| Bot 已连接但配置未生效          | 检查对应 worker 日志中的配置通知、重载和连接错误；确认 PostgreSQL 可用且不要重复启动同一渠道的多个 worker。                                                                   |
| 迁移未执行                      | 检查 Compose backend 是否使用 `MIGRATE=true`（生产文件会设置），再查看 backend 日志和 `node ace migration:status`。                                                           |

开发环境使用 `pnpm docker:up` 或 `docker/docker-compose.dev.yml`，会额外
映射 PostgreSQL `5432` 供宿主机 backend 使用；不要把该开发 override 文件
用于生产部署。
