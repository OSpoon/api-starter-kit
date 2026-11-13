# 系统架构

API Starter Kit 是 pnpm/Turborepo monorepo。Backend 提供统一的安全和数据边界；各 Web、桌面和扩展客户端通过 API 使用系统能力。业务功能由项目使用者按产品需求扩展。

## 应用边界

| 应用                        | 职责                                                  |
| --------------------------- | ----------------------------------------------------- |
| `apps/backend`              | API、认证授权、持久化、审计、AI runtime 和渠道 worker |
| `apps/frontend`             | 管理端、共享 AI 助手、共享 UI 和 feature              |
| `apps/assistant-web`        | 独立助手 Web 入口，复用 frontend 实现                 |
| `apps/assistant-desktop`    | Tauri 原生窗口，打包 assistant-web                    |
| `apps/assistant-extension`  | Chrome MV3 side panel，复用 assistant-web             |
| `apps/authenticator-mobile` | 独立 Capacitor TOTP 应用                              |

企业微信、飞书和钉钉 worker 通过渠道 adapter 调用 backend 的共享 AI runtime。桌面端只负责原生集成；扩展只负责 side panel 和按需申请 API host 权限。

## 请求路径

```text
客户端 → /api/v1 路由 → middleware → controller → validator → service → model/provider
                                                       ↓
                                               transformer/serialize
```

Backend route 声明 URL 和 middleware；controller 协调 HTTP，validator 校验输入，service 承担领域逻辑和外部副作用，model 管理持久化关系，transformer/serializer 限定输出。

```text
前端 route meta → view → feature API/composable → @/lib/api → backend
```

前端路由提供页面标题、导航、面包屑、权限和页面类型。页面编排位于 `views/`，领域代码位于 `features/<feature>/`，跨领域 UI 和状态逻辑复用共享组件与 composable。

## 系统能力与业务能力

认证、RBAC、API Key、审计、知识库和 AI runtime 属于系统能力。新增业务功能应拥有清晰的 feature、数据模型、API、权限和测试；不要把业务能力附加到 starter 的示例导航或演示页面。

一个受保护页面/操作应在后端路由、权限目录、前端 `route.meta.permission`、操作级权限检查和 allow/deny 测试中保持同一权限契约。前端不是安全边界。

## AI 扩展边界

AI 查询、工具和操作复用 backend 中的 registry。查询使用固定模板；有副作用的操作先创建 proposal，再由确认 API 复核并执行。详细运行时、数据持久化和 SSE 说明见[AI 助手架构](ai-assistant-architecture.md)；知识检索见[知识库实现说明](knowledge-base.md)。

## 数据与部署

PostgreSQL 保存应用、知识库、会话和图片数据；schema 变更通过新增 migration 完成。Docker Compose 可按需组合 PostgreSQL、backend、管理端、独立助手 Web 和渠道 Bot。桌面安装包与 Chrome 扩展单独构建。端口、环境变量、备份和升级方式见[部署指南](deployment.md)。
