# API Starter Kit 项目约束（中文）

本文是本仓库 `AGENTS.md` 的中文参考版本，供中文使用者阅读。英文版是规范原文；本文件应与英文版保持同步，不单独增加、删除或弱化任何约束。

本仓库是 pnpm workspace 和 Turborepo monorepo：

- `apps/backend`：AdonisJS 7、Lucid、Bouncer、Vine 和 OpenAPI。
- `apps/frontend`：Vue 3、Vite、Pinia、Vue Router、Tailwind CSS 和 Reka UI。
- 核心能力：认证与 2FA、RBAC、API Key、审计日志、知识库，以及受控的 AI 对话、查询和操作。

## 1. 规则优先级与执行

1. 系统指令和用户的明确要求优先于本文。
2. `AGENTS.md` 是项目规范的唯一来源。`CLAUDE.md` 等入口文件只能指向它，不得重复或冲突。
3. `must`、`never` 和 `only` 表示强制要求。任何例外都必须在最终总结中说明技术理由、影响和移除路径。
4. 编辑前必须阅读根目录及最近的 `AGENTS.md`，检查相邻模块、共享原语、测试和 API 契约。不得复制已有的不一致做法。
5. 每项改动都必须复用现有架构、共享原语和契约。不得为同一页面或端点创建并行实现。

## 2. 不可妥协的安全与数据规则

### 2.1 后端权威与 API 契约

- `apps/backend` 是认证、授权、校验、持久化和 API 契约的唯一权威；`apps/frontend` 绝不能成为安全边界。
- 在 `apps/backend/start/routes.ts` 中以声明方式定义 URL、中间件和控制器目标。业务 API 位于 `/api/v1` 下。
- 每个请求都必须先通过 Vine 校验，才能读取或修改数据。
- 使用 `serialize()`、transformer 或显式 DTO 只返回必需字段。默认绝不暴露模型内部字段、哈希、令牌、加密值或 pivot 数据。
- 成功端点使用现有 `serialize()` 产生的 `{ data: ... }` 包装。分页列表在 `data` 中返回 `items` 和 `meta`。
- 公共 API 变化必须同步更新 OpenAPI 装饰器、前端客户端类型和测试。每次响应结构变化都必须同步更新前端 API 客户端、类型和测试。
- 状态码语义固定为：`401` 未认证、`403` 无权限、`409` 被引用记录或冲突、`422` 校验失败。
- 可能无界的列表必须由服务端提供分页和上限。
- 实现每个 mutation 前必须定义所有权、授权、冲突行为和审计敏感副作用。凭据生成、加密和外部提供商调用属于 service。

### 2.2 认证、授权与敏感数据

- 浏览器传入的角色、权限、ID 和状态均不可信。所有受保护 API 操作都必须使用 `middleware.auth()` 和最窄的具名 `middleware.permission([...])`。
- 通过 Bouncer 的 `access` ability 授权。不得使用控制器内的局部检查绕过共享授权。
- 权限代码使用稳定的 `resource:action` 格式，使用前必须先在 `apps/backend/app/services/permission_catalog.ts` 声明。角色组合权限，用户通过角色获得权限。
- 每个新的可导航页面或菜单都必须拥有独立的最小读取权限，例如 `system-status:read`，并在 `permission_catalog.ts` 中声明。同一代码必须绑定到前端路由 `meta.permission` 和对应的后端路由中间件；同时在同一改动中添加或更新系统权限 migration 及允许/拒绝授权测试。不同产品能力不得复用 `dashboard:view` 或其他更宽泛权限。
- `super-admin` 是受保护的 bootstrap 角色。管理 UI 或 API 不得分配它或修改其成员关系。改变相关行为或最后管理员保护时，必须复用 `super_admin_access` service 并覆盖防止锁定的风险。
- 路由 `meta.permission` 是导航、路由保护和可见性的共享来源。操作级前端入口使用 `@/lib/permission` 的 `usePermission()`；前端可见性绝不能替代后端授权。
- API Key、密码和恢复码只能通过既定安全 service 一次性披露。绝不能记录日志、持久化到浏览器状态，或从普通读取/后续更新端点返回。
- 安全敏感和不可逆操作必须确认。

### 2.3 数据库与 migration

- 绝不编辑已经应用的 migration。每次 schema 或数据变化都必须新增 migration。
- 有意识地定义外键、唯一性、索引和删除行为。
- 仅针对预期的本地环境，使用 `pnpm --dir apps/backend exec node ace migration:status` 验证。

## 3. 标准开发流程

### 3.0 Greenfield 项目边界

除非用户明确说明是已有产品，否则将基于本仓库构建的每个新项目视为 greenfield 产品。本仓库提供认证、授权、审计、API 契约、知识库、可观测性和受控 AI 等系统能力，不预设业务领域。

- 从用户的产品想法、领域实体、工作流和成功标准开始。不要假设已有仪表盘、模板页面、演示页面或可选集成属于新产品。
- 除非用户明确要求，不要围绕通用仪表盘、分析、工作流、向导或模板能力规划迭代。
- 业务实现放在用户定义的 feature 模块中。现有示例视图和可复用页面原语只是可调整或移除的参考，不是必须保留的需求。
- 要求 AI Agent 扩展新项目时，在提出文件、路由、权限或数据模型前，先说明请求属于系统能力还是用户定义的业务能力。

### 3.1 编辑前

编辑前必须：

1. 说明适用的页面、API、安全或数据契约。
2. 找到可比较的现有实现。
3. 确定涉及的文件、模块以及跨应用影响。
4. 列出适用的验证命令。
5. 检查现有工作区改动，保留用户改动，绝不回退无关变更。

保持改动聚焦。不得把无关重构、格式清理或依赖升级混入任务。

### 3.2 实现期间

- 优先复用已有组件、service、composable、client、registry 和测试模式。
- 较大任务应在有意义的检查点报告进度、已完成内容和下一步。
- 在用户请求范围内的小型、可逆改动可以连续执行，无需每个小步骤都暂停等待批准。
- 在跨越应用契约、路由、权限、数据库、共享组件、AI registry 或外部系统扩大范围前，先说明影响。

### 3.3 需要暂停确认的情况

以下情况必须暂停并等待用户确认：

- 需要新增权限、外部账户/系统授权或外部协调。
- 工作会扩大原始请求范围或实质改变产品行为。
- 需要不可逆或高风险操作，例如删除/覆盖重要数据、修改已应用 migration、重置用户改动或发送外部消息。
- 存在无法安全推断、且会实质改变实现的未决产品选择。
- 验证需要修复原始请求范围之外的问题。

用户请求范围内的普通代码编辑、本地验证和直接相关修复无需逐步审批。

## 4. 前端工程标准

### 4.1 页面、路由与布局

- 路由定义是标题、导航、面包屑、权限和 `meta.pageKind` 的唯一来源。
- 每个产品页面必须恰好拥有一个根页面原语：

  | 意图            | `meta.pageKind` | 根原语                                 |
  | --------------- | --------------- | -------------------------------------- |
  | CRUD 或管理列表 | `list`          | `ListPage` + `DataTable`               |
  | 资源详情        | `detail`        | `DetailPageTemplate`                   |
  | 设置            | `settings`      | `SettingsPageTemplate`                 |
  | 总览            | `dashboard`     | `DashboardPageTemplate` 或 `PageShell` |
  | 多步流程        | `wizard`        | `WizardPageTemplate`                   |
  | 过程流          | `workflow`      | `WorkflowPageTemplate`                 |
  | 分析            | `analytics`     | `AnalyticsPageTemplate`                |
  | 认证            | `auth`          | `CardPageShell`                        |
  | 领域工具        | `utility`       | `PageShell`                            |

- CRUD 和管理列表必须使用 `components/common/ListPage.vue` 与 `DataTable.vue`。`PageShell.vue` 只用于非列表页面。不得在视图中重新实现页面头部、工具栏、表格、分页、空状态或 dialog host。
- 破坏性或安全敏感确认使用 `ConfirmDialog.vue`，角色权限分配使用 `PermissionTransfer.vue`，标准表单 dialog 使用 `FormDialogContent.vue` 和 `FormDialogFooter.vue`。应扩展共享组件实现可复用行为，不得新增单页 props 或并行组件。
- 路由级工作流放在 `views`；跨领域 UI 放在 `components/common`；页面模板放在 `components/templates`；可复用领域 UI 放在 `features/<feature>/components`；领域 API 放在 `features/<feature>/api.ts`。

### 4.2 表单、交互与 API 调用

- 所有前端表单必须使用共享的 `vee-validate` + `Zod` 模式：带类型的 `toTypedSchema`、`useForm`、`FormField`/`FormControl`、`FormMessage` 和 `firstFormError`。
- 不得使用原生 `required`、临时 `if` 校验或页面级校验库。后端 Vine 校验仍是安全与持久化的权威。
- 标准创建和编辑 dialog 必须匹配 `apps/frontend/src/features/wecom-message-templates/components/WecomMessageTemplateForm.vue` 中已经验证的表单行为和布局，并满足以下要求：
  - 使用 `FormDialogContent`，表单采用 `flex min-h-0 flex-1 flex-col overflow-hidden`，包含独立的 `min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto` 滚动 body 和可安全收缩的 `FormDialogFooter`。滚动 body 与字段 grid 必须是独立元素。
  - 使用普通的 `FormMessage`，不得设置固定高度、最小高度、占位内容或预留空间。字段没有错误时，校验消息不得占据可见布局空间；提交错误应自然撑高当前 grid 行，使后续行作为整体向下移动。
  - 每个多列字段 grid 必须使用 `items-start`。需要显式列跨度的字段必须使用 wrapper；`FormItem` 必须保持顶部对齐，绝不能被包含更长校验消息的兄弟字段拉伸。
  - 使用响应式列布局。紧凑控件可以在桌面端共用一行；描述、凭据字段、编辑器、JSON payload 和其他长内容控件必须占据完整行。窄屏时多列布局必须折叠为单列。
  - 每个 `FormField` 都必须设置 `:validate-on-blur="false"`。提交必须使用 `form.handleSubmit` 创建的处理器；无效提交回调必须展示 `firstFormError`。保留标准的 change 和 model-update 校验，使提交失败后修改字段能够立即刷新错误。不得引入预留消息变体，也不得关闭所有 change 或 model-update 校验。
  - 使用共享的 `Select`、`SelectTrigger` 和 `SelectContent`，不得使用页面级定位或 portal 覆盖。居中或经过 transform 的 dialog 中的 Select overlay 必须留在共享的页面级 portal 坐标系统中，绝不能挂载到经过 transform 的 dialog 容器内。
- 所有用户可见文案使用 locale key。每个 input、textarea、select 和 combobox 都必须有独立的可见 label。
- 图标控件使用 Lucide，并必须有可访问名称及 tooltip 或 title。
- 新增或修改的交互必须覆盖 loading、empty、error、disabled 和 permission 状态，并且在桌面和移动端不能溢出或重叠。
- 只持久化能明显改善重复使用体验的非敏感偏好，并使用共享的、带版本和命名空间的浏览器偏好机制。
- 使用 `@/lib/api` 发起前端 API 调用，遵循现有 `ApiError` 和 Bearer token 约定。Feature 不得绕过通用错误处理，也不得引入并行 HTTP client。

### 4.3 前端参考实现

开始实现时，先找到可比较页面并复用共享原语，不要复制整页：

| 需求                             | 参考实现                                                          |
| -------------------------------- | ----------------------------------------------------------------- |
| 管理列表、表格、创建/吊销 dialog | `apps/frontend/src/views/ApiKeysView.vue`                         |
| RBAC 和角色权限分配              | `apps/frontend/src/views/AccessControlView.vue`                   |
| 设置与安全状态                   | `apps/frontend/src/views/ProfileView.vue`                         |
| 知识库 feature 组织方式          | `apps/frontend/src/features/knowledge/KnowledgeDocumentsPage.vue` |
| 分析、工作流和向导模板           | 对应的 `*TemplateView.vue`                                        |

### 4.4 基于参考实现的 UI 一致性契约

前端参考页面和共享原语共同构成产品 UI 契约。新项目在已有能力板块中新增页面时，必须先对齐最接近的参考实现的可观察结构和交互行为，再添加领域特有内容。不得通过复制整页解决不一致，必须复用负责该行为的共享原语，只保留新的领域内容。

#### 页面规划与职责归属

- 写页面 markup 前，必须确定路由的 `meta.pageKind`、唯一根页面原语、路由权限和最接近的参考页面，并在实现总结中记录。
- 路由级编排放在 view 中；共享布局、列表、表格、表单 dialog、确认、空状态、loading 和 error 行为放在已有共享原语或可复用 feature 组件中。
- 如果新页面需要第二个页面头部、工具栏、列表容器、dialog host 或分页实现，必须停止添加页面级 markup，改为扩展负责该行为的共享组件。

#### 管理列表结构

管理列表必须使用 `ListPage` 和 `DataTable`，职责如下：

- `ListPage` 负责页面标题和描述、右上角刷新操作、受权限控制的主要创建操作、带边框的内容区域以及 dialog 挂载位置。
- `DataTable` 负责搜索输入、可选筛选控件、列可见性控制、表格容器、空状态和分页。不得在 view 中新增第二个搜索框、筛选工具栏、表格容器或分页区块。
- 使用 `DataTable` 的 `filters` slot 放置收窄当前表格行的筛选条件；只有不属于表格筛选行的页面级查询区域才使用 `ListPage` 的 `query` slot；作用于当前列表的次要或批量操作使用 `ListPage` 的 `operations` slot。全局页面操作仍放在 `ListPage` 头部。
- 页面支持时，紧凑筛选控件和搜索控件应使用单行响应式布局（`filters-layout="inline"`）；否则允许共享筛选行换行。不得添加页面级定位或 portal 覆盖。
- 行操作放在表格最右侧的 actions 列。图标按钮只能使用 Lucide 图标，并且必须有可访问名称和 tooltip 或 title。每个操作都必须通过 `usePermission()` 控制；破坏性或安全敏感操作必须使用 `ConfirmDialog` 确认。
- 当某个菜单需要导入、导出等额外领域操作时，必须将它们放在页面操作区域，并置于刷新操作和主要创建/主操作之后。所有页面都必须保持这一顺序，不得将这些操作移动到搜索区或表格区域。
- 当页面操作区域超过 3 个操作按钮时，必须使用共享的 `ButtonGroup` 搭配 `DropdownMenu` 承载溢出操作，遵循既定的分组按钮/溢出菜单模式。最常用或主要操作保持直接可见，其余操作放入下拉菜单，并提供 locale 文案、权限校验、disabled/loading 状态和可访问名称。必要时应扩展共享页面操作 slot，不得创建页面级的溢出菜单实现。
- 可能无界的管理数据必须使用服务端分页。刷新、创建、筛选、行操作、分页和无权限状态都必须保持共享布局，并提供 loading、empty、error 和 disabled 反馈，且不能发生内容重叠。

标准管理列表示例：

- `apps/frontend/src/views/ApiKeysView.vue`：简单列表、创建、吊销、安全的一次性披露和分页；
- `apps/frontend/src/views/AccessControlView.vue`：列表变体、筛选、权限控制操作和多个管理 dialog。

#### 表单 dialog 结构与校验

标准创建和编辑 dialog 必须遵循以下实现的结构和行为：

- `apps/frontend/src/components/workbench/ApiKeyForm.vue`
- `apps/frontend/src/features/wecom-message-templates/components/WecomMessageTemplateForm.vue`

具体要求：

- `FormDialogContent` 负责 dialog 外壳。表单使用可安全收缩的 flex 列布局，拥有独立的滚动 body 和 `FormDialogFooter`。body 与字段 grid 必须分离，以便校验错误自然撑高所在行。
- 每个控件都必须有独立的可见 label 和 locale 文案。placeholder 不能替代 label。长描述、编辑器、凭据和 JSON payload 必须占据完整响应式行；紧凑控件只有在每个字段保持顶部对齐时才可共用一行。
- 使用带类型的 `vee-validate` 与 Zod schema、`useForm`、`FormField`、`FormControl`、`FormMessage` 和 `firstFormError`。不得使用原生 `required`、页面级校验、预留错误信息空间或第二套表单库。
- 每个 `FormField` 都必须设置 `:validate-on-blur="false"`。必须通过 `form.handleSubmit` 提交；无效提交回调必须展示 `firstFormError`。提交失败后保留 change 和 model-update 校验，使用户修正字段后错误立即更新。
- 使用共享 Select 原语和页面级 portal 行为。绝不能把 Select 内容挂载到经过 transform 或居中的 dialog 容器内部。
- 表单提交必须覆盖保存中、控件 disabled、后端校验错误、取消和成功反馈。敏感值遵循既有的一次性披露规则，不得进入浏览器状态或日志。

#### 必须进行的对齐检查

新页面完成前，必须在桌面端和窄屏端与选定参考实现进行对照，并确认：

1. 页面类型、根页面原语、头部操作和权限可见性符合路由契约；
2. 搜索、筛选、表格操作、分页、dialog 和确认入口出现在共享区域，而不是自定义区域；
3. loading、empty、error、disabled、unauthorized 和校验错误状态保持与参考实现一致的布局行为；
4. 所有可见文案、label、图标、tooltip 和错误信息遵循共享的 locale 与无障碍模式；
5. 按下方验证矩阵运行适用的前端 typecheck、lint check、build 和针对性测试。

## 5. 后端模块与命名

- 文件按可复用职责命名，不要按临时组织方式或页面上下文命名。除非本地 package 已形成该习惯，否则避免 barrel file。
- 后端 controller 只协调 HTTP。Vine validator 负责输入，service 负责可复用领域逻辑，Lucid model 负责持久化关系，transformer 或显式 serializer 负责输出。
- 不得从一个 controller 导入另一个 controller。
- 稳定、可复用的状态机和副作用——请求、loading、分页、过滤、表单编排和生命周期处理——放在 composable 中。不要为一次性的展示逻辑抽取 composable。
- 遵循现有后端 alias，包括 `#controllers/*`、`#services/*`、`#validators/*` 和 `#transformers/*`。

## 6. AI 对话、查询与操作

- 持久化完整的对话消息。上下文压缩只影响模型请求，不得截断存储历史或历史 API。
- 使用带覆盖消息边界的持久化滚动摘要，保留 system prompt 和最近消息；通过校验过的环境变量默认启用压缩；摘要失败时回退到有界的最近消息窗口。
- 在 `ai_agent_prompt_policy` 中集中管理 AI prompt。system policy 只保留稳定的行为和安全边界，domain policy 只保留领域级工作流约束。工具描述、schema 和服务端 service 负责工具参数、目标解析、校验、授权、脱敏和错误行为；不要在 system 或 domain prompt 中重复这些契约。
- 只能通过 `ai_agent_tool_registry`、`ai_agent_query_registry`、`ai_agent_action_registry` 和共享确认流程扩展 AI 能力。不得创建并行的 AI provider client、controller、route、编排循环或 tool registry。领域 service 是唯一执行边界，HTTP API 和 AI tool 都必须调用它。
- 不得通过关键词、子串或正则匹配实现 AI 意图识别。必须通过模型和已注册的工具契约解析意图，再在服务端校验和授权结构化操作。只有基于显式且已校验结构化字段的确定性路由才允许使用。
- 模型绝不能生成或执行自由 SQL。数据读取只能使用 `ai_agent_query_registry` 中的注册模板；每个模板都必须有稳定 code 和 version、参数 schema、具名权限、服务端派生的 scope、字段脱敏和结果上限。
- 每次模板查询前都要重新校验参数、对话/用户所有权和授权。模型、聊天历史、日志或可观测性服务收到结果前必须脱敏并限制范围。缺少参数时创建持久化 pending query，并在继续执行时重新校验所有权、过期时间、模板有效性、授权和目标状态。
- 每次执行查询都要审计请求人、模板 code/version、非敏感参数摘要、授权结果、结果数量和耗时。绝不存储原始结果或敏感参数。
- 新模板必须测试允许/拒绝授权、参数校验、脱敏、边界、多轮参数补全，并添加租户范围测试。
- AI 不得直接执行破坏性或安全敏感 mutation，只能通过 `ai_agent_action_registry` 创建持久化提案。确认时必须重新校验对话所有权、授权、提案状态/过期时间和当前目标状态，然后才能调用注册的 executor。
- 每个新 action 都必须有稳定 action code、具名权限、安全目标摘要、`prepare` 逻辑和 executor。使用现有通用确认 API 及 assistant 输入框上方的 approval strip。模型文本或 Markdown 绝不是授权渠道。
- 对 WeCom 消息模板，AI tool 只能提供有权限的模板发现、参数校验/渲染预览和已确认的发送提案。复用 `wecom_message_template_service`；绝不能向模型暴露 Webhook URL、加密凭据、API Key 或内部模型字段。发送必须走内部 service 路径，接受模板 ID、结构化参数和运行时 mention 列表，强制 `wecom-templates:read`/`wecom-templates:send`，并在外部请求前要求持久化确认。模板创建、编辑、删除、Webhook 变更、媒体操作和直接测试发送仍属于管理 UI 操作，除非另行批准并满足同样的 action 与审计要求。
- 每项向 AI 暴露的领域能力，在注册前都必须定义结构化输入/输出 schema、缺少参数时的行为、脱敏规则、权限代码、审计元数据和允许/拒绝回归测试。预览/查询 tool 必须无副作用；外部发送和其他 mutation 必须表示为 action，而不是普通 tool。

## 7. 工具与验证命令

### 7.1 环境与命令

- 使用 Node.js `>= 24.12.0` 和 pnpm `11.9.0`；不得在工作区混用 npm 或 yarn。
- 遵循仓库 RTK 约定：shell 命令必须以 `rtk` 为前缀。
- 根脚本：`pnpm dev`、`pnpm build`、`pnpm test`、`pnpm lint`、`pnpm format` 和 `pnpm typecheck`。
- 后端脚本：`pnpm --dir apps/backend typecheck`、`lint:check`、`test` 和 `exec node ace migration:status`。
- 前端脚本：`pnpm --dir apps/frontend typecheck`、`lint:check`、`test` 和 `build`。
- `lint` 和 `format` 默认会写文件。验证时使用 `lint:check`，并确认格式化或自动修复范围属于当前任务。

### 7.2 最低验证矩阵

| 改动类型                                                 | 最低验证                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| 前端视图、组件、路由或 locale                            | 前端 `typecheck`、`lint:check`；模板、路由或组件组合变化还需 `build` |
| 后端 controller、validator、model、service 或 middleware | 后端 `typecheck`、`lint:check` 以及针对性或完整 `test`               |
| migration 或 schema                                      | migration status、后端 `typecheck`，以及行为变化对应的持久化测试     |
| 认证、授权、凭据或 secret 流程                           | 后端允许和拒绝测试                                                   |
| 共享组件或跨应用契约                                     | 每个受影响应用的验证，以及 `git diff --check`                        |

- 为 bug 和高风险行为添加针对性回归测试。
- 验证必须匹配受影响层级和风险。绝不能把未运行、失败或被阻塞的命令描述为通过。

## 8. 交付与报告

最终总结必须说明：

1. 实现的行为和关键文件。
2. 实际运行的验证命令及结果。
3. 每项未运行、失败或被阻塞的验证及原因。
4. 任何例外、技术理由、影响和移除路径。
5. 当改动影响文档化的 setup、环境变量、Docker、migration、API 行为或模板能力时，更新 `README.md`。
