# 部署指南

Compose 按用途拆分：基础文件只定义 PostgreSQL；应用、IM Bot 和监控分别使用独立 overlay 按需叠加。
本地开发默认只启动数据库，backend 与管理端仍由 `pnpm dev` 运行。桌面安装包和 Chrome 扩展
单独构建，不作为 Compose 服务运行。认证、授权、迁移和运行时配置仍由 backend 负责。

## 1. 部署前准备

生产主机需要：

- Docker Engine 或 Docker Desktop，以及 Docker Compose v2；
- 能够访问镜像仓库、npm registry 和所需外部 AI/渠道服务的网络；
- 至少能持久化 Docker volume 的磁盘空间；知识库和 AI 会话数据都存储在 PostgreSQL 中。

仓库要求的 Node.js `>= 24.12.0` 和 pnpm `11.9.0` 主要用于本地开发与运维命令；纯 Docker 生产启动由镜像中的 Node.js `24.15.0` 执行。

部署目录应为仓库根目录，因为 Compose 文件中的路径均相对于仓库根目录解析：

```text
docker/docker-compose.yml
docker/docker-compose.app.yml
docker/docker-compose.assistant-web.yml
docker/docker-compose.im.yml
docker/docker-compose.monitoring.yml
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

| 变量                                                 | 生产要求                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                           | 设置为 `production`；Compose 会再次覆盖为 `production`。                                                                                                         |
| `HOST` / `PORT`                                      | 容器内应为 `0.0.0.0` / `13333`；Compose 会覆盖 `HOST`，端口不要改成与 Dockerfile/Compose 不一致的值。                                                            |
| `APP_KEY`                                            | 必须填写高强度、稳定且只保存在服务端的密钥；更换会影响加密数据。                                                                                                 |
| `APP_URL`                                            | 填写对外可访问的 backend URL。                                                                                                                                   |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_FULL_NAME` | 用于自动创建配置的管理员；迁移生成的内部账号不会阻止创建。必须使用未在其他环境复用的高强度密码，至少 15 位并满足项目密码强度要求。已有同邮箱账号时不会重置密码。 |
| `DB_USER` / `DB_PASSWORD` / `DB_DATABASE`            | PostgreSQL 初始化凭据；必须使用未与管理员或其他服务复用的高强度密码。Compose 会把它们传给 PostgreSQL，并让 backend 连接内部主机名 `postgres`。                   |
| `CORS_ORIGIN`                                        | 填写允许跨域访问 API 的前端 origin，多个值用逗号分隔，例如 `https://app.example.com`。同源访问仍由 Nginx 代理。                                                  |
| `SESSION_DRIVER`                                     | 当前示例使用 `cookie`；按认证部署策略配置。                                                                                                                      |
| `OPENAPI_DOCS_ENABLED`                               | 生产默认建议为 `false`；仅在确实需要 `/api-docs` 时开启，并限制 backend 暴露范围。                                                                               |

可选能力的配置也来自 `apps/backend/.env.example`：GitHub OAuth 使用
`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` 和正确的
`GITHUB_OAUTH_FRONTEND_URL`；Turnstile 需要 backend 的
`TURNSTILE_ENABLED`、`TURNSTILE_SECRET_KEY` 与 frontend 的
`VITE_TURNSTILE_SITE_KEY` 同时匹配。

不要把 backend `.env` 提交到 Git，也不要把 `APP_KEY`、数据库密码、OAuth
secret、Bot secret 或 AI API key 写入 frontend 环境变量。LLM、Embedding、ASR
和 Bot 凭据通过系统管理的「Agent 配置」页面维护，敏感值由 backend 加密保存。

### 手动接入 MCP

项目不会把 MCP 安装进应用镜像，也不会通过 Compose 自动挂载或启动 MCP。backend 通过 stdio
启动 Agent 配置中登记的 MCP 程序，不会为 MCP 开放入站 HTTP 端点。

添加 MCP 时，先由运维将程序单独安装到 backend 运行环境可访问的位置，并确认 backend 运行用户有执行程序及访问所需文件的权限。Docker 部署需要运维自行提供容器内的程序路径和文件挂载；项目不会自动处理这些步骤。

然后在「Agent 配置 → MCP」中登记服务名称、程序绝对路径、启动参数、工作目录和环境变量。标准 MCP JSON 中的 `command`、`args`、`cwd`、`env` 对应这些字段，例如：

```json
{
  "mcpServers": {
    "logs": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/logs-mcp/dist/index.js", "--log-dir", "/absolute/path/to/logs"],
      "cwd": "/absolute/path/to/mcp"
    }
  }
}
```

保存后点击“启动并发现工具”，启用需要的工具，并选择直接读取或用户确认后执行。MCP 子进程以 backend 运行用户身份启动，因此只登记可信程序，并按最小需要提供文件和环境变量访问权限。stdio 不会暴露入站 MCP HTTP 服务，但不会限制子进程自身发起网络连接。

日志查询 MCP 的独立安装和工具说明见 [`packages/logs-mcp/README.md`](../packages/logs-mcp/README.md)。

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

独立助手 Web 在生产 Compose 中由 `docker-compose.assistant-web.yml` 单独构建和托管，默认对外端口为
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

### Chrome 扩展包

Chrome MV3 扩展通过 `pnpm --dir apps/assistant-extension build` 单独构建，产物位于
`apps/assistant-extension/dist/chrome`，不由 Docker Compose 托管。扩展只在用户连接时申请其配置的 API origin
的可选 host permission；远程 API 必须使用 HTTPS，开发环境仅允许 loopback 使用 HTTP。扩展不读取当前网页，
也不需要活动标签页权限。构建产物由 Chrome Web Store 或企业扩展策略等组织选定的渠道分发；当前仓库负责构建，
不包含商店上传或发布自动化。详细开发约束见[扩展 README](../apps/assistant-extension/README.md)。

## 3. 首次生产部署

先检查基础数据库与应用 overlay 的展开配置：

```bash
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml config
```

启动数据库、backend 和管理端 frontend：

```bash
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml up -d --build
```

也可以通过 `pnpm docker` 打开交互菜单，多选要启动的服务组。选择应用会自动启动 PostgreSQL；选择独立助手 Web 或 IM Bot 会自动启动 backend 和 PostgreSQL；监控可独立启动。选择独立助手 Web 不会启动管理端 frontend。菜单启动会构建所选应用镜像。需要在 CI 或自动化部署中启动时，继续使用下面的 Compose 命令：

```bash
# 单独添加 assistant-web
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml \
  -f docker/docker-compose.assistant-web.yml up -d --build assistant-web

# 添加三个 IM Bot
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml \
  -f docker/docker-compose.im.yml up -d

# 添加 Prometheus、Grafana 和 cAdvisor
docker compose --env-file apps/backend/.env \
  --env-file docker/monitoring/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml \
  -f docker/docker-compose.monitoring.yml up -d
```

backend 与三个 Bot 共用 `api-starter-kit-backend:latest` 运行镜像；frontend
和 assistant-web 分别使用 `api-starter-kit-frontend:latest` 与
`api-starter-kit-assistant-web:latest`。Bot 仍是独立容器和进程，但 Compose
不会为每个 Bot 重复构建一份镜像。可通过 `BACKEND_IMAGE`、`FRONTEND_IMAGE`
和 `ASSISTANT_WEB_IMAGE` 覆盖默认镜像标签。

独立助手 Web 不使用管理端镜像；Compose 会从同一个 Dockerfile 的 `assistant-web` 构建目标生成
独立镜像。独立助手桌面端不作为 Compose 服务运行，而是由发布流水线生成各平台安装包。

backend 容器启动时会执行 `apps/backend/docker-entrypoint.js`。应用 overlay 设置
`MIGRATE=true`，所以 backend 会先运行：

```bash
node ace migration:run --force
```

迁移成功后才启动 API。backend 依赖 PostgreSQL healthcheck；IM Bot 又依赖 backend
healthcheck，因此按需启动时 Compose 会等待依赖就绪。

包含知识库字段收敛的迁移完成后，已有文档正文仍然保留，但旧目录向量可能包含迁移前的元数据。
升级后应在知识库管理台对已有文档执行一次“重建索引”。

## 4. 服务、端口和网络

| Compose 文件                       | 服务                                      | 职责和端口                                                     |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| `docker-compose.yml`               | `postgres`                                | PostgreSQL；宿主机 `127.0.0.1:5432`，可用 `POSTGRES_PORT` 覆盖 |
| `docker-compose.app.yml`           | `backend`、`frontend`                     | API `13333`、管理端 `18080`                                    |
| `docker-compose.assistant-web.yml` | `assistant-web`                           | 独立助手 Web `17070`                                           |
| `docker-compose.im.yml`            | `wecom-bot`、`feishu-bot`、`dingtalk-bot` | 各渠道独立 worker，不映射宿主机端口                            |
| `docker-compose.monitoring.yml`    | `prometheus`、`grafana`、`cadvisor`       | Prometheus `9090`、Grafana `3000`；默认只绑定 loopback         |

管理端入口默认为 `http://localhost:18080`。Nginx 将 `/api/` 转发到
`http://backend:13333`。独立助手 Web 默认为 `http://localhost:17070`，也通过 Compose
网络访问 `backend:13333`。backend 健康检查地址为
`http://<backend-host>:<BACKEND_PORT>/api/v1/health/ready`。

PostgreSQL 始终将宿主机端口绑定到 loopback：默认 `127.0.0.1:5432`，可通过 `POSTGRES_PORT` 修改。宿主机开发服务可连接该地址，局域网无法直接访问；容器内应用继续使用 `postgres:5432`。

### Grafana 与 Prometheus 容器监控

监控服务单独定义在 `docker-compose.monitoring.yml`，只采集 Docker 容器指标，不采集宿主机进程或项目自有业务指标。cAdvisor 需要读取 Docker 容器和 cgroup 信息，因此使用特权及只读宿主机挂载，不映射宿主机端口。Grafana 仪表盘按 Compose project 和 service 标签筛选容器。

首次启动监控前创建本地配置并设置 Grafana 管理员密码：

```bash
cp docker/monitoring/.env.example docker/monitoring/.env
```

与 Docker 应用一起启动监控：

```bash
docker compose --env-file apps/backend/.env \
  --env-file docker/monitoring/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml \
  -f docker/docker-compose.monitoring.yml up -d
```

Grafana 和 Prometheus 默认只绑定宿主机 loopback；远程访问 Grafana 应通过 VPN、SSH 隧道或带认证的反向代理。不要将 Prometheus 或 cAdvisor 采集端口直接暴露到公网。Prometheus 默认保留 15 天数据，Grafana 和 Prometheus 数据分别保存在命名 volume 中。

帮助子菜单仅在开发模式显示；生产构建（包括 Docker frontend 镜像）会隐藏整个子菜单，包括 Grafana、API 文档和开发工具入口，账户、语言、主题和退出菜单保持可用。开发模式下 Grafana 入口默认打开 `http://localhost:3000`；`VITE_MONITORING_PROJECT` 必须与 Compose project 名称一致，默认为 `api-starter-kit`。

Compose project 名称为 `api-starter-kit`。PostgreSQL、Grafana 和 Prometheus 使用各自的命名 volume；`docker compose down` 保留数据，`down -v` 删除所选 Compose 文件声明的 volume。

## 5. 更新、停止和数据持久化

更新核心应用时只需构建和启动数据库、backend 与 frontend：

```bash
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml build

docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml up -d
```

更新独立助手 Web 时单独构建并启动它；Compose 会按依赖启动 backend 和 PostgreSQL，不会启动管理端 frontend：

```bash
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml \
  -f docker/docker-compose.assistant-web.yml up -d --build assistant-web
```

IM Bot 和监控按需叠加各自文件；启动命令见首次部署章节。查看核心服务：

```bash
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml ps
```

管理某个可选服务时，加入对应 overlay 和服务名。停止或删除服务时使用与启动时相同的文件组合；`down` 会保留 volume。`down -v` 会删除所选 Compose 文件声明的 volume 和其中数据，只能在明确要清空环境时使用。

`postgres-data` 是 PostgreSQL 持久化 volume。日常更新不要删除它。

正式更新前应备份 PostgreSQL，并在目标环境核对迁移状态：

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  sh -c 'pg_dump -U "$DB_USER" -d "$DB_DATABASE"' > backup.sql

docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml exec backend \
  node ace migration:status
```

备份命令会将 SQL 写入宿主机当前目录，务必按组织的备份保管和访问控制策略处理 `backup.sql`。恢复前先停止会写入数据库的应用服务，并验证目标数据库与备份文件。

## 6. AI 与渠道 Bot

三个 Bot 是独立进程，由 Compose 分别执行：

```text
node ace wecom:bot
node ace feishu:bot
node ace dingtalk:bot
```

Bot 未在「Agent 配置 → IM 渠道」中完成对应渠道配置时，worker 会保持运行并等待配置；保存配置后，
对应渠道会自动建立连接。生产 Compose 不会对这三个 worker 设置自动重启，因此 worker
进程异常退出时仍需要按运维流程恢复服务。

它们使用 backend 的数据库、权限、知识库和受控 AI 操作，不是独立的 API
服务。模型配置保存后，backend 的普通请求会读取新的运行时配置；IM 渠道配置保存后，
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
- PostgreSQL 只绑定宿主机 loopback，未暴露到局域网或公网；`postgres-data` 已纳入备份策略；
- `docker compose ... config`、容器状态和 `/api/v1/health/ready` 均正常；
- 首次管理员已登录并按需启用 2FA，管理员初始化密码不再继续作为共享凭据使用；
- 若启用 OAuth、Turnstile、LLM、ASR 或渠道 Bot，已从实际容器网络完成连通性验证；
- 已阅读[安全与治理](security.md)，并按其中的认证、凭据、AI 控制和部署加固要求配置。

## 8. 常见排障

| 现象                            | 检查方向                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` 不健康               | 检查 `DB_USER`、`DB_PASSWORD`、`DB_DATABASE` 是否一致；用 `docker compose -f docker/docker-compose.yml logs postgres` 查看日志。已有 volume 使用旧凭据时，不要直接删除 volume，应按 PostgreSQL 凭据轮换流程处理。 |
| backend 反复重启                | 用 `docker compose --env-file apps/backend/.env -f docker/docker-compose.yml -f docker/docker-compose.app.yml logs backend` 查看日志；重点检查 `APP_KEY`、数据库连接、环境变量格式和迁移失败信息。                |
| Web 客户端打开但 API 失败       | 确认 backend healthy、frontend/assistant-web 与 backend 在同一 Compose 网络，浏览器请求使用 `/api/`，并检查对应 Nginx/backend 日志。                                                                              |
| 直接访问 backend 出现 CORS 错误 | 将浏览器 origin 加入 `CORS_ORIGIN`，或使用 frontend 的同源入口；修改 backend `.env` 后重建/重启 backend。                                                                                                         |
| `/api-docs` 404                 | 只有 `OPENAPI_DOCS_ENABLED=true` 时才注册该路由；修改后需要重启 backend。                                                                                                                                         |
| Bot 已连接但配置未生效          | 检查对应 worker 日志中的配置通知、重载和连接错误；确认 PostgreSQL 可用且不要重复启动同一渠道的多个 worker。                                                                                                       |
| 迁移未执行                      | 检查 Compose backend 是否使用 `MIGRATE=true`（生产文件会设置），再查看 backend 日志和 `node ace migration:status`。                                                                                               |

开发环境运行 `pnpm docker` 并选择 PostgreSQL；其端口只绑定在宿主机 loopback，供本机 backend 连接。

# 网页版本更新提示

管理前端和独立助手网页使用 `@plugin-web-update-notification/vite`，仅在生产构建启用。每次构建生成时间戳版本，首次加载、每 10 分钟、窗口重新获得焦点及脚本加载失败时检查更新。提示复用 Sonner 和中英文语言包，用户选择刷新或稍后，不会自动刷新。刷新前应保存未完成内容。

完整发布 `dist`，包括 `pluginWebUpdateNotice` 目录。HTML 入口和 `/pluginWebUpdateNotice/web_version_by_plugin.json` 禁止缓存；仓库 Nginx 配置已包含规则，其他 CDN 或代理需设置相同策略。带内容哈希的脚本可长期缓存。桌面构建通过 Tauri 的 `TAURI_ENV_PLATFORM` 排除插件，Chrome 扩展不接入网页轮询。

验收：部署构建 A 并保持页面打开，再部署构建 B；回到旧标签页应出现提示。“稍后”忽略当前版本，“刷新”加载新版本。开发服务器不启用更新提示。
