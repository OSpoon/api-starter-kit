# 部署指南

Compose 文件按服务拆分：基础文件定义 PostgreSQL，应用、助手 Web 和 IM Bot 通过 overlay 按需启动。桌面端和 Chrome 扩展单独构建。

## 配置

需要 Docker Engine 和 Docker Compose v2.17+（支持重复 `--env-file`）、外网访问，以及足够的持久化磁盘空间。所有 Compose 命令从仓库根目录运行。

复制并填写环境变量文件：

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

生产部署前，替换 backend 示例中的管理员和数据库密码，使用彼此不同的随机密码；管理员密码至少 15 位。不要提交 `.env`，或将服务端密钥放进 frontend 配置。

Backend 主要配置：

| 变量                                               | 要求                                                           |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `APP_KEY`                                          | 使用稳定的高强度密钥；更换会影响加密数据。                     |
| `APP_URL`                                          | Backend 对外 URL。                                             |
| `ADMIN_EMAIL`、`ADMIN_PASSWORD`、`ADMIN_FULL_NAME` | 首次初始化管理员；已有同邮箱账号不会重置密码。                 |
| `DB_USER`、`DB_PASSWORD`、`DB_DATABASE`            | PostgreSQL 凭据；不得与其他密码复用。                          |
| `CORS_ORIGIN`                                      | 跨域客户端的 origin，多个值以逗号分隔；同源访问由 Nginx 代理。 |
| `SESSION_DRIVER`、`OPENAPI_DOCS_ENABLED`           | 按部署策略设置；生产环境通常关闭 API 文档。                    |

`NODE_ENV`、`HOST` 和 `PORT` 由生产 Compose 设置。OAuth 和 Turnstile 等可选配置见 `.env.example`。LLM、Embedding、ASR 与 Bot 凭据在系统「Agent 配置」中维护。

### 前端构建

Vite 和 Docker 构建都使用 `apps/frontend/.env`；CI 从示例文件生成该文件。Compose 将 frontend 配置传给构建目标，frontend 容器不读取运行时 `.env`；backend 和 PostgreSQL 从服务级 `env_file` 读取 `apps/backend/.env`。

`VITE_PUBLIC_URL` 必须是带末尾斜线的前端公开 URL；正式部署时改为正式域名。`VITE_API_URL` 留空表示同源 API。其他 `VITE_` 值均会公开给浏览器，修改后需重新构建。Turnstile 需设置 `TURNSTILE_ENABLED`、`TURNSTILE_SECRET_KEY` 和 `VITE_TURNSTILE_SITE_KEY`。

助手 Web 默认端口为 `17070`，使用同源 `/api/` 代理；跨域部署需设置 `VITE_API_URL`、将 Web origin 加入 backend 的 `CORS_ORIGIN`，并使用 HTTPS。嵌入网站时，其 CSP 需允许助手 Web 的 `script-src` 和 `frame-src`，backend CORS 也需允许该 origin。桌面端连接远程 API 需 HTTPS，并将目标平台的 Tauri origin 加入 `CORS_ORIGIN`。客户端详情见[助手 Web](../apps/assistant-web/README.md)、[桌面端](../apps/assistant-desktop/README.md)和[扩展](../apps/assistant-extension/README.md)。

MCP 仅支持 stdio 服务。服务命令必须存在于 backend 主机或容器中，并以 backend OS 用户身份运行，不经过技能 sandbox；只配置可信命令。MCP 环境变量加密保存在数据库中。

## 首次启动与更新

检查 Compose 配置并启动 PostgreSQL、backend 和管理端：

```bash
docker compose --env-file apps/backend/.env --env-file apps/frontend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml config

docker compose --env-file apps/backend/.env --env-file apps/frontend/.env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.app.yml up -d --build
```

更新核心服务重复执行 `up -d --build`。按需启动独立助手 Web 或 IM Bot：

```bash
# 助手 Web
docker compose --env-file apps/backend/.env --env-file apps/frontend/.env \
  -f docker/docker-compose.yml -f docker/docker-compose.app.yml \
  -f docker/docker-compose.assistant-web.yml up -d --build assistant-web ai-automation-worker

# IM Bot
docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml -f docker/docker-compose.app.yml \
  -f docker/docker-compose.im.yml up -d
```

`pnpm docker` 也可交互启动服务组。应用 overlay 会在 backend 启动前运行数据库迁移；backend 和 Bot 会等待依赖健康检查通过。

变更现有 PostgreSQL volume 的 `DB_PASSWORD` 不会更新数据库内部密码；先轮换数据库用户密码，再更新配置。更新前备份数据库并检查迁移状态：

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  sh -c 'pg_dump -U "$DB_USER" -d "$DB_DATABASE"' > backup.sql

docker compose --env-file apps/backend/.env \
  -f docker/docker-compose.yml -f docker/docker-compose.app.yml \
  exec backend node ace migration:status
```

## 服务与数据

| Overlay                            | 服务                           | 端口                                     |
| ---------------------------------- | ------------------------------ | ---------------------------------------- |
| `docker-compose.yml`               | PostgreSQL                     | `127.0.0.1:5432`（`POSTGRES_PORT` 可改） |
| `docker-compose.app.yml`           | backend、自动化 worker、管理端 | `13333`、`18080`                         |
| `docker-compose.assistant-web.yml` | 助手 Web                       | `17070`                                  |
| `docker-compose.im.yml`            | 企业微信、飞书、钉钉 Bot       | 不映射宿主机端口                         |

PostgreSQL volume `postgres-data` 保存应用数据；backend volume `media-images` 保存本地上传的图片。`docker compose down` 保留 volume；`down -v` 会删除所选配置声明的 volume 和数据。

Agent 技能脚本使用 bubblewrap 隔离，宿主机需支持 user namespace 和所需 capability。Ubuntu 26 默认 AppArmor 配置可能阻止运行；不要用 `privileged` 或 `seccomp=unconfined` 绕过。目标环境不支持时，禁用技能脚本或使用独立 Docker daemon/VM。

IM Bot 是独立 worker，未配置渠道时会等待配置；异常退出后需由运维流程恢复。渠道配置和排障见[机器人对接指南](reference/ai-channel-bots.md)。

自动化 worker 与 backend 共用镜像和数据库，负责排队执行服务器侧计划任务并投递 webhook；Compose 会随应用服务启动它。

## 上线检查与排障

- 密码、`APP_KEY` 和外部 secret 已替换示例值；数据库已备份。
- `CORS_ORIGIN` 与已部署客户端 origin 一致；桌面端按平台配置 Tauri origin。
- PostgreSQL 仅绑定 loopback，backend 未暴露不必要的管理端口。
- Compose 配置、容器健康检查和 `/api/v1/health/ready` 均正常。
- 启用的 OAuth、Turnstile、AI、ASR 和 Bot 已从容器网络验证连通。
- 按[安全与治理](security.md)完成凭据、网络和备份配置。

| 问题              | 检查                                             |
| ----------------- | ------------------------------------------------ |
| PostgreSQL 不健康 | 检查数据库变量和日志；已有 volume 不要直接删除。 |
| Backend 重启      | 检查 `APP_KEY`、数据库连接、环境变量和迁移日志。 |
| Web API 请求失败  | 检查 backend 健康状态、同源代理和 CORS 配置。    |
| Bot 配置未生效    | 检查 worker 日志、PostgreSQL 连接和渠道配置。    |

发布管理端或助手 Web 时上传完整 `dist/`；HTML 和版本检查 JSON 不应缓存，带哈希资源可长期缓存。仓库 Nginx 已配置该策略。

### MinerU PDF 附件

在「助手配置 → 内置工具」开启「读取 PDF 附件」时，通过弹窗配置 MinerU API Token。
凭据通过 Web 配置并加密存储。清除后须重新配置才能提交新解析任务。
任务提交成功后保留该批次对应的加密凭据，以便凭据更换后仍可查询原批次。任务结束后清理批次凭据。
服务端需要访问
`mineru.net`、`mineru.oss-cn-shanghai.aliyuncs.com` 和 `cdn-mineru.openxlab.org.cn`。
只有用户同意将当前附件传给 MinerU 且助手需要读取时，后端才上传该 PDF。
原文件在确认上传后从本地附件记录移除，解析文本随会话保存，删除会话会级联清理本地附件。
第三方的保留和删除按 MinerU 的服务条款执行。
