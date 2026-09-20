# 产品扩展指南

这份指南面向使用 API Starter Kit 构建具体产品的开发者。模板提供认证、权限、审计、API 契约、知识库和受控 AI 等系统能力；业务实体、页面和工作流应从你的产品需求开始设计。

日常工程命令、代码入口和提交前检查见[工程开发指南](development.md)。

## 四种客户端交付面的修改边界

- 管理端页面、路由、导航和管理功能放在 `apps/frontend`。
- 独立助手的聊天 UI、会话历史、语音输入和助手交互优先修改 `apps/frontend/src/components/ai-chat/`
  或对应 AI feature；`apps/assistant-web` 只负责独立客户端路由、页面壳和入口配置，不复制一套聊天实现。
- 桌面端只在 `apps/assistant-desktop/src-tauri/` 修改窗口、Rust 命令、原生权限和打包配置；不要在桌面壳中
  重新实现 Web UI、认证或 AI 编排。
- Chrome 扩展只在 `apps/assistant-extension/` 修改 MV3 manifest、side panel 生命周期、连接配置和扩展构建；复用 `assistant-web` 的客户端实现，不注入页面脚本或读取活动标签页内容。
- 后端 API、认证、授权、会话持久化和敏感操作统一放在 `apps/backend`，四种客户端交付面都复用同一套契约。

如果业务能力需要同时出现在管理端和独立助手中，先扩展后端 service/API 或共享 AI registry，再接入对应客户端；
只有桌面特有的操作系统能力才进入 Tauri 层，只有 Chrome 集成能力才进入扩展层。

## 开始前

先完成[快速开始](getting-started.md)，确认可以登录管理台。然后阅读[系统架构](architecture.md)，了解哪些能力属于模板基础设施，哪些内容应该放进业务 feature。

开发新产品时，不要把 starter 中的 Dashboard、Templates、Examples 等示例体验当作业务需求。应在同一次改造中替换默认落地页、导航、路由名称和对应权限；不用的示例路由从产品 shell 中移除。

## 新增一个业务 feature

推荐按下面的顺序实现：

1. 明确实体、所有权、角色可见范围、可执行操作和冲突行为。
2. 在后端添加迁移、模型、validator、service、transformer 和 controller。
3. 在 `apps/backend/start/routes.ts` 注册 `/api/v1` 路由、认证 middleware 和最小权限 middleware。
4. 在 `apps/backend/app/services/permission_catalog.ts` 声明新的 `resource:action` 权限。
5. 在前端 `features/<feature>/` 放 API 客户端、类型和领域组件，在 `views/` 放页面级编排。
6. 在 `router/modules/` 添加路由，并设置 `meta.permission`、`meta.pageKind`、标题和导航信息。
7. 为允许和拒绝路径、校验、响应契约及主要交互补充测试。

后端是唯一的授权和数据边界。前端的路由保护和按钮显隐只改善体验，不能代替后端重新鉴权。

## 选择页面结构

根据页面意图选择唯一的根页面 primitive：

| 页面     | `meta.pageKind` | 根组件                                 |
| -------- | --------------- | -------------------------------------- |
| 管理列表 | `list`          | `ListPage` + `DataTable`               |
| 资源详情 | `detail`        | `DetailPageTemplate`                   |
| 设置     | `settings`      | `SettingsPageTemplate`                 |
| 概览     | `dashboard`     | `DashboardPageTemplate` 或 `PageShell` |
| 多步流程 | `wizard`        | `WizardPageTemplate`                   |
| 流程操作 | `workflow`      | `WorkflowPageTemplate`                 |
| 分析     | `analytics`     | `AnalyticsPageTemplate`                |
| 领域工具 | `utility`       | `PageShell`                            |

管理列表复用 `apps/frontend/src/views/ApiKeysView.vue` 的结构；角色和权限相关页面参考 `AccessControlView.vue`。不要在 view 中重新实现表头、搜索、分页、空状态、弹窗宿主或确认逻辑。

## API 与权限契约

- 请求使用 Vine validator；不要在 controller 中重复校验。
- 业务逻辑放 service，持久化关系放 Lucid model，输出使用 `serialize()`、transformer 或明确 DTO。
- 成功响应使用现有 `{ data: ... }` envelope；分页数据放在 `data.items` 和 `data.meta`。
- 受保护路由使用 `middleware.auth()` 与最小权限 middleware，并通过 Bouncer `access` ability 授权。
- API 变更必须同步 OpenAPI 装饰器、前端 API 类型和相关测试。
- 通过 `@/lib/api` 发起前端请求，复用现有 `ApiError` 和 Bearer token 约定。

## 表单与交互

标准表单使用 `vee-validate`、Zod、`toTypedSchema`、`FormField`、`FormControl` 和 `FormMessage`。表单弹窗参考 `apps/frontend/src/features/wecom-message-templates/components/WecomMessageTemplateForm.vue`；破坏性操作使用 `ConfirmDialog.vue`。

所有可见文本使用 locale key；每个控件都有独立可见标签；加载、空数据、错误、禁用和无权限状态都要有明确反馈。敏感值遵循既有的一次性展示规则，不进入浏览器持久化、日志或普通读取接口。

## 可复用模板能力

- 认证、2FA、用户和角色：复用现有 account/access-control 模块。
- 审计：在服务层记录管理操作和安全敏感副作用。
- 知识库：参考 `features/knowledge` 的 feature 组织方式，并阅读[知识库实现说明](knowledge-base.md)了解通用字段、LLM 元数据预览、两阶段检索和权限审计边界。
- AI 查询和操作：只能扩展现有 registry 与确认流程，先阅读 [AI 助手架构](ai-assistant-architecture.md)。
- 外部渠道：先阅读 [渠道 Bot 参考](reference/ai-channel-bots.md)，不要在业务模块中复制 provider client。

## 完成前检查

至少确认：

- 默认首页和导航已经体现真实产品，而不是 starter 示例。
- 新页面的路由权限、后端权限、权限目录和测试保持一致。
- 管理列表和表单使用共享 primitive，没有出现平行实现。
- 已覆盖后端允许/拒绝路径及前端类型检查、lint 和构建。
- 若修改 API、迁移或环境变量，已同步更新 API 文档、部署文档或 README。

具体命令和验证矩阵见[工程开发指南](development.md)。
