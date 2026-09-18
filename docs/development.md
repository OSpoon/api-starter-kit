# 工程开发指南

这份文档用于日常工程开发和提交前检查。如何新增业务能力，阅读[产品扩展指南](customization.md)；如何理解模块边界，阅读[系统架构](architecture.md)。

## 工作区

```text
apps/backend/   AdonisJS API、模型、迁移、服务和测试
apps/frontend/  Vue 应用、路由、页面、feature、状态和共享 UI
apps/assistant/  独立 AI 助手 Web 客户端，复用 frontend 的 AI 实现
docs/           项目使用、开发、部署和能力参考
docker/         Compose、镜像和 Nginx 配置
```

根工作区使用 pnpm 与 Turborepo。修改代码前阅读根目录 [AGENTS.md](../AGENTS.md) 以及目标目录最近的 `AGENTS.md`；独立助手的 [AGENTS.md](../apps/assistant/AGENTS.md) 与管理端前端约束保持同步。

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

pnpm --dir apps/assistant typecheck
pnpm --dir apps/assistant lint
pnpm --dir apps/assistant format
pnpm --dir apps/assistant lint:check
pnpm --dir apps/assistant test
pnpm --dir apps/assistant build
```

`lint` 和 `format` 会修改文件；只检查现有改动时使用 `lint:check`。
首次安装依赖时，根项目的 `prepare` 会安装 `simple-git-hooks`；提交包含前端代码时，
`pre-commit` 会通过 `lint-staged` 自动格式化并运行对应应用的 Lint 和 typecheck，包含
`apps/assistant`。

## 发布版本

根工作区使用 `bumpp` 统一管理版本发布。执行发布前，确认工作区干净、版本号符合
SemVer，并且本地 Git 已配置提交、创建 tag 和推送权限：

```bash
pnpm release
```

`bumpp` 会递归更新根工作区、后端和前端的 `package.json` 版本，随后触发 `version`
生命周期脚本，由 `changelogen` 根据上一个 Git tag 到当前提交之间的 Conventional
Commits 更新根目录 `CHANGELOG.md`。最后创建 `chore: release v<version>` 提交、带 `v`
前缀的 annotated tag，并推送提交和 tag。

发布配置位于根目录的 [`bump.config.ts`](../bump.config.ts) 和
[`changelog.config.ts`](../changelog.config.ts)。发布流程会自动执行一次 `pnpm install`，
以便在版本或 workspace 清单变化时同步锁文件；`CHANGELOG.md` 的发布条目由工具生成，
不要手动维护。

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

## 仓库维护

GitHub Dependabot 每周检查 pnpm workspace 和 GitHub Actions 的版本，并按生产依赖、开发依赖和 Actions 分组创建升级 PR。升级 PR 需要经过仓库现有 CI 验证后再合并；Dependabot 不会直接修改默认分支。

完整规则和验证矩阵见 [AGENTS.md](../AGENTS.md)。
