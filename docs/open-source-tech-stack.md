# 开源技术栈与项目仓库

本文整理本项目直接集成、并用于主要运行时或工程流程的开源框架和库。项目名称链接到上游 GitHub 仓库，方便查看源码、文档、发布记录和贡献指南。

依赖版本以各 workspace 的 `package.json` 与根目录 `pnpm-lock.yaml` 为准；本清单不重复记录版本，也不枚举传递依赖。它是技术栈导航，不替代软件物料清单或许可证审查。

## 后端与 AI

| 项目                      | 本项目用途                                                | 使用位置                                       | GitHub                                                                                                            |
| ------------------------- | --------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| AdonisJS                  | TypeScript 后端 Web/API 框架                              | [`apps/backend`](../apps/backend/package.json) | [adonisjs/core](https://github.com/adonisjs/core)                                                                 |
| Lucid ORM                 | SQL 查询、模型、迁移和数据库访问                          | `apps/backend`                                 | [adonisjs/lucid](https://github.com/adonisjs/lucid)                                                               |
| Bouncer                   | 后端授权与能力策略                                        | `apps/backend`                                 | [adonisjs/bouncer](https://github.com/adonisjs/bouncer)                                                           |
| VineJS                    | 后端请求与数据验证                                        | `apps/backend`                                 | [vinejs/vine](https://github.com/vinejs/vine)                                                                     |
| Friends of Adonis OpenAPI | OpenAPI 描述与 API 文档生成                               | `apps/backend`                                 | [FriendsOfAdonis/packages/openapi](https://github.com/FriendsOfAdonis/FriendsOfAdonis/tree/main/packages/openapi) |
| Tuyau                     | AdonisJS 路由注册与类型信息生成，为类型安全客户端提供基础 | `apps/backend`                                 | [Julien-R44/tuyau](https://github.com/Julien-R44/tuyau)                                                           |
| Pi Agent Core / Pi AI     | AI Agent 运行时、工具调用与多模型 API 适配                | `apps/backend`                                 | [earendil-works/pi](https://github.com/earendil-works/pi)                                                         |
| OpenAI Node SDK           | OpenAI 兼容服务调用，例如语音和知识元数据处理             | `apps/backend`                                 | [openai/openai-node](https://github.com/openai/openai-node)                                                       |
| node-postgres (`pg`)      | PostgreSQL Node.js 驱动                                   | `apps/backend`                                 | [brianc/node-postgres](https://github.com/brianc/node-postgres)                                                   |
| Japa                      | 后端单元与集成测试运行器                                  | `apps/backend`                                 | [japa/runner](https://github.com/japa/runner)                                                                     |

## Web 客户端与 UI

| 项目               | 本项目用途                                                              | 使用位置                                                                                           | GitHub                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Vue 3              | 管理端、独立助手和扩展侧边栏的 UI 框架                                  | [`apps/frontend`](../apps/frontend/package.json)、`apps/assistant-web`、`apps/assistant-extension` | [vuejs/core](https://github.com/vuejs/core)                                                                                          |
| Vite               | Web 客户端开发服务器与生产构建                                          | `apps/frontend`、`apps/assistant-web`                                                              | [vitejs/vite](https://github.com/vitejs/vite)                                                                                        |
| Pinia              | Vue 应用状态管理                                                        | Web 客户端                                                                                         | [vuejs/pinia](https://github.com/vuejs/pinia)                                                                                        |
| Vue Router         | Web 客户端路由与导航                                                    | Web 客户端                                                                                         | [vuejs/router](https://github.com/vuejs/router)                                                                                      |
| Tailwind CSS       | 实用类 CSS 与设计令牌样式系统                                           | Web 客户端                                                                                         | [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss)                                                              |
| Reka UI            | 可访问的 headless Vue 交互组件                                          | Web 客户端                                                                                         | [unovue/reka-ui](https://github.com/unovue/reka-ui)                                                                                  |
| shadcn-vue         | 共享 UI primitives 的组件设计与生成来源；组件源码由本项目维护           | [`apps/frontend/src/components/ui`](../apps/frontend/src/components/ui)                            | [unovue/shadcn-vue](https://github.com/unovue/shadcn-vue)                                                                            |
| Lucide             | Vue 图标组件                                                            | Web 客户端                                                                                         | [lucide-icons/lucide](https://github.com/lucide-icons/lucide)                                                                        |
| VueUse             | Vue Composition API 工具集                                              | Web 客户端                                                                                         | [vueuse/vueuse](https://github.com/vueuse/vueuse)                                                                                    |
| Vue I18n           | 界面多语言与本地化                                                      | Web 客户端                                                                                         | [intlify/vue-i18n](https://github.com/intlify/vue-i18n)                                                                              |
| vee-validate       | Vue 表单状态与表单验证集成                                              | Web 客户端                                                                                         | [logaretm/vee-validate](https://github.com/logaretm/vee-validate)                                                                    |
| Zod                | 前端表单 schema 与静态类型推导                                          | Web 客户端                                                                                         | [colinhacks/zod](https://github.com/colinhacks/zod)                                                                                  |
| Vue Sonner         | Toast 通知                                                              | Web 客户端                                                                                         | [xiaoluoboding/vue-sonner](https://github.com/xiaoluoboding/vue-sonner)                                                              |
| Markstream Vue     | AI 助手 Markdown 与流式消息渲染                                         | Web 客户端                                                                                         | [Simon-He95/markstream-vue](https://github.com/Simon-He95/markstream-vue)                                                            |
| TanStack Vue Table | 管理端数据表格状态与逻辑                                                | `apps/frontend`                                                                                    | [TanStack/table](https://github.com/TanStack/table)                                                                                  |
| Monaco Editor      | SQL、JSON 等编辑器内核；Vue wrapper 由 `@guolao/vue-monaco-editor` 提供 | `apps/frontend`                                                                                    | [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor)、[imguolao/monaco-vue](https://github.com/imguolao/monaco-vue) |
| CodeMirror 6       | 轻量代码与 SQL 编辑器                                                   | `apps/frontend`                                                                                    | [codemirror/basic-setup](https://github.com/codemirror/basic-setup)                                                                  |

## 桌面端与浏览器扩展

| 项目         | 本项目用途                                | 使用位置                                                               | GitHub                                                                    |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tauri 2      | 将独立助手 Web 客户端封装为桌面应用       | [`apps/assistant-desktop`](../apps/assistant-desktop/package.json)     | [tauri-apps/tauri](https://github.com/tauri-apps/tauri)                   |
| Extension.js | Chrome Manifest V3 扩展开发、热更新与构建 | [`apps/assistant-extension`](../apps/assistant-extension/package.json) | [extension-js/extension.js](https://github.com/extension-js/extension.js) |

## Monorepo 与工程工具

| 项目       | 本项目用途                             | 使用位置          | GitHub                                                          |
| ---------- | -------------------------------------- | ----------------- | --------------------------------------------------------------- |
| pnpm       | workspace 包管理与依赖安装             | 仓库根目录        | [pnpm/pnpm](https://github.com/pnpm/pnpm)                       |
| Turborepo  | monorepo 任务编排、缓存与并行构建      | 仓库根目录        | [vercel/turborepo](https://github.com/vercel/turborepo)         |
| TypeScript | Web 客户端和后端代码的静态类型         | 后端与 Web 客户端 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| ESLint     | JavaScript、TypeScript 与 Vue 代码检查 | 后端与 Web 客户端 | [eslint/eslint](https://github.com/eslint/eslint)               |
| Prettier   | 代码与配置文件格式化                   | 全 workspace      | [prettier/prettier](https://github.com/prettier/prettier)       |

## 清单维护

- 新增或移除主要框架、构建工具或核心运行时库时，同步更新本页。
- 依赖版本和精确安装状态以 workspace manifest 与 `pnpm-lock.yaml` 为准，不在本页维护第二份版本表。
- 当依赖迁移到新的上游仓库时，更新对应 GitHub 链接和使用说明。
