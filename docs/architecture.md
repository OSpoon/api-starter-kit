# 系统架构

API Starter Kit 是一个 pnpm/Turborepo monorepo。模板的边界是提供可复用的系统能力，业务 feature 由使用者按产品需求添加。

## 应用边界

```text
apps/backend/     AdonisJS API、认证、授权、数据、AI 与渠道 worker
apps/frontend/    Vue 应用、路由、页面、feature、状态和共享 UI
docs/             使用、开发、部署和能力参考
docker/           本地与生产 Compose、镜像和 Nginx 配置
```

后端负责认证、授权、校验、持久化、脱敏、审计和 API 契约。前端不构成安全边界，也不应直接访问数据库或自行决定用户是否有权限。

## 后端请求路径

```text
route
  → middleware.auth / middleware.permission
  → controller
  → validator
  → service
  → model / external provider
  → transformer / serialize
```

路由集中在 `apps/backend/start/routes.ts`。controller 只协调 HTTP；validator 负责输入；service 承担领域逻辑和外部副作用；model 负责数据关系；transformer 或 serializer 控制输出字段。

## 前端请求路径

```text
route meta
  → view
  → feature API / composable
  → @/lib/api
  → backend API
```

路由是标题、导航、面包屑、权限和页面类型的来源。页面级编排放在 `views/`，领域 API 和组件放在 `features/<feature>/`，跨领域 UI 放在 `components/common/`，共享状态和副作用放在 `composables/`。

## 系统能力与业务能力

系统能力包括认证、RBAC、API Key、审计、知识库、AI 运行时和外部渠道适配。业务能力应拥有自己的 feature、路由、权限、数据模型和测试，不要挂在 `Templates`、`Examples` 或通用 Dashboard 下。

新增业务能力时，保持以下关系：

```text
业务操作
  ├─ 后端路由与 permission middleware
  ├─ permission_catalog 中的 resource:action
  ├─ 前端 route.meta.permission
  ├─ 前端 usePermission() 操作级显隐
  └─ allow / deny / contract tests
```

## AI 扩展边界

AI 查询、工具和操作必须使用现有 registry。查询只能使用注册模板，服务端负责参数校验、授权、范围推导、结果限量和脱敏；有副作用的操作只能先创建 proposal，经过确认后重新校验再执行。

AI 的详细运行时分层、持久化和 SSE 说明见[AI 助手架构](ai-assistant-architecture.md)；提示词和文案清单见[AI 助手提示词参考](reference/ai-assistant-prompts.md)。

## 数据与部署

PostgreSQL 是应用数据和知识库/AI 会话数据的持久化边界。数据库变更只能通过新增 migration 完成。生产部署由 Docker Compose 运行 PostgreSQL、backend、frontend 和可选渠道 worker，详见[部署指南](deployment.md)。
