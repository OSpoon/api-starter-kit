# 开发指南

这份文档用于日常开发和提交前检查。如何新增业务能力，阅读[开发指南](customization.md)；如何理解模块边界，阅读[系统架构](architecture.md)。

## 工作区

```text
apps/backend/   AdonisJS API、模型、迁移、服务和测试
apps/frontend/  Vue 应用、路由、页面、feature、状态和共享 UI
docs/           项目使用、开发、部署和能力参考
docker/         Compose、镜像和 Nginx 配置
```

根工作区使用 pnpm 与 Turborepo。修改代码前阅读根目录 [AGENTS.md](../AGENTS.md) 以及目标目录最近的 `AGENTS.md`。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

验证单个应用时：

```bash
pnpm --dir apps/backend typecheck
pnpm --dir apps/backend lint:check
pnpm --dir apps/backend test
pnpm --dir apps/backend exec node ace migration:status

pnpm --dir apps/frontend typecheck
pnpm --dir apps/frontend lint:check
pnpm --dir apps/frontend test
pnpm --dir apps/frontend build
```

`lint` 和 `format` 会修改文件；只检查现有改动时使用 `lint:check`。

## 实现入口

后端路由集中在 `apps/backend/start/routes.ts`。controller 负责 HTTP 协调，validator 负责输入，service 负责领域逻辑和外部副作用，model 负责持久化关系，transformer 或 serializer 负责输出字段。

前端路由集中在 `apps/frontend/src/router/modules/`。页面编排放在 `views/`，领域 API 和组件放在 `features/<feature>/`，共享 UI 放在 `components/common/` 或 `components/ui/`，可复用状态和副作用放在 `composables/`。

新增页面时，同时确定 `meta.permission`、`meta.pageKind`、locale key 和对应的后端权限。管理列表使用 `ListPage` + `DataTable`，表单和破坏性操作复用现有共享组件。

## 提交前检查

- 页面、API、权限目录、导航和测试是否同步更新。
- 后端是否重新执行授权、校验、脱敏和资源归属检查。
- 是否覆盖加载、空数据、错误、禁用、无权限和校验失败状态。
- 是否避免把密钥、密码、恢复码或其他敏感值写入日志和浏览器状态。
- 是否运行与改动范围匹配的类型检查、lint、测试和构建。

完整规则和验证矩阵见 [AGENTS.md](../AGENTS.md)。
