# 开发指南

## 工作区结构

```text
apps/
├── backend/   # AdonisJS API、Lucid 模型、迁移、服务和测试
└── frontend/  # Vue 应用、路由、Pinia、UI 与 locale
docs/          # 产品、开发、运维和维护文档
```

根工作区使用 pnpm 与 Turborepo。修改代码前阅读 [AGENTS.md](../AGENTS.md) 和目标目录最近的 `AGENTS.md`。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint

pnpm --dir apps/backend typecheck
pnpm --dir apps/backend lint:check
pnpm --dir apps/backend test
pnpm --dir apps/backend exec node ace migration:status

pnpm --dir apps/frontend typecheck
pnpm --dir apps/frontend lint:check
pnpm --dir apps/frontend test
pnpm --dir apps/frontend build
```

`lint` 和 `format` 会修改文件；验证既有改动时使用 `lint:check`。

## 实现约定

- `apps/backend/start/routes.ts` 管理路由和 middleware；controller 协调 HTTP，validator、service、model 和 serializer 各自承担职责。
- 公开后端接口变更同步更新 OpenAPI、前端 API 类型和相关响应契约测试。
- Vue 路由管理标题、导航、权限和 `meta.pageKind`；管理列表使用 `ListPage` 与 `DataTable`，其他页面选择对应模板或 `PageShell`。
- 共享 UI 位于 `components/common`；领域 UI 与 API 位于 `features/<feature>/`；可复用客户端状态和副作用位于 `composables`。
- 所有用户可见文本使用 locale key；`usePermission()` 仅用于前端体验，后端权限 middleware 才是安全边界。

## 验证

- 前端页面、组件或路由：类型检查、lint 检查和构建。
- 后端 controller、validator、service、model 或 middleware：类型检查、lint 检查和聚焦或完整测试。
- 迁移：migration status、后端类型检查和行为变化的持久化测试。
- 认证、RBAC、凭据和密钥：后端允许与拒绝路径测试。
- 共享或跨应用契约：每个受影响应用的验证加 `git diff --check`。

完整流程和验证矩阵见 [AGENTS.md](../AGENTS.md)。
