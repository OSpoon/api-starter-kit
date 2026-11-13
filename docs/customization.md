# 产品扩展指南

本项目提供认证、授权、审计、API 契约、知识库和受控 AI 等系统能力，不预设业务领域。新增业务功能应从产品实体、用户任务和成功条件出发，而不是延续 starter 示例。

本指南说明功能落点；工程强制要求以根目录 [AGENTS.md](../AGENTS.md) 为准，工作区命令见[工程开发指南](development.md)。

## 确定功能边界

| 能力                         | 所属位置                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| API、认证授权、数据和审计    | `apps/backend`                                                        |
| 管理页面、路由和导航         | `apps/frontend`                                                       |
| AI 会话客户端                | 共享实现位于 `apps/frontend`；`apps/assistant-web` 负责独立客户端入口 |
| 桌面窗口与原生集成           | `apps/assistant-desktop/src-tauri/`                                   |
| Chrome side panel 与扩展配置 | `apps/assistant-extension/`                                           |
| 移动端 TOTP 应用             | `apps/authenticator-mobile/`                                          |

桌面端和 Chrome 扩展复用 assistant-web，不另建认证、API 或聊天实现。跨客户端业务能力应先进入后端或共享 feature；只有平台特有的系统集成才进入桌面壳或扩展。

## 新增业务 feature

按下面的顺序明确实现边界：

1. 定义实体、所有权、可见范围、操作、冲突和审计要求。
2. 在 backend 实现迁移、模型、validator、service、controller 和输出 DTO。
3. 在 `apps/backend/start/routes.ts` 注册 `/api/v1` 路由、认证 middleware 和最小权限 middleware。
4. 在 `permission_catalog.ts` 声明权限；前端路由使用同一权限码。
5. 在 `apps/frontend/src/features/<feature>/` 放 API、类型和领域组件，在 `views/` 编排页面。
6. 补齐允许与拒绝、输入校验、响应契约和主要交互的回归覆盖。

后端是授权、验证和数据的唯一边界。前端显隐只影响体验，不能替代后端鉴权。API 变更同步更新 OpenAPI、前端 API 类型和受影响客户端。

## 选择页面与复用组件

根据路由 `meta.pageKind` 选择根页面组件，并复用管理列表、表单、确认和状态展示的共享 primitive。页面类型和组件要求见 [`apps/frontend/AGENTS.md`](../apps/frontend/AGENTS.md)；跨应用权限要求见根目录 `AGENTS.md`。管理列表和 RBAC 的参考实现分别是 [`ApiKeysView.vue`](../apps/frontend/src/views/ApiKeysView.vue) 与 [`AccessControlView.vue`](../apps/frontend/src/views/AccessControlView.vue)。

页面文案使用 locale，交互需覆盖加载、空数据、错误、禁用和无权限状态。详细表单、无障碍、移动布局和组件目录规则以 `apps/frontend/AGENTS.md` 为准，避免在功能文档中维护第二份实现规范。

## 扩展现有系统能力

- **账户和访问控制：** 复用现有 account/access-control 模块。
- **知识库：** 先读[知识库实现说明](knowledge-base.md)，复用已有数据模型和检索流程。
- **AI 查询和受控操作：** 扩展现有 registry 与确认流程，见[AI 助手架构](ai-assistant-architecture.md)。
- **企业微信、飞书和钉钉：** 先读[渠道 Bot 参考](reference/ai-channel-bots.md)，渠道通过共享 backend runtime 接入。

## 完成前检查

- 默认路由、导航和页面体现实际产品任务；不需要的 starter 示例不进入产品 shell。
- 页面权限、后端 middleware、权限目录和允许/拒绝测试一致。
- 接口文档、OpenAPI、前端类型和受影响客户端同步。
- 检查命令与应用范围匹配；schema 变更检查迁移状态。

命令和验证矩阵见[工程开发指南](development.md)。
