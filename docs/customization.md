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

### 表格行选择与批量操作

`DataTable` 可通过 `selectable` 启用圆形复选框、当前页全选/半选、选中行高亮和底部选择操作栏。默认不启用，业务列表按需接入，并通过 `get-row-id` 提供稳定的记录 ID：

```vue
<DataTable
  :columns="columns"
  :data="records"
  selectable
  :get-row-id="(record) => String(record.id)"
  :is-row-selectable="(record) => canSelect(record)"
  :selection-disabled="loading || saving"
  @selection-change="selectedRecords = $event"
>
  <template #selection-actions="{ rows, clearSelection, disabled }">
    <!-- 使用共享 Button 和 locale 文本；动作按权限显隐并处理 disabled。 -->
    <!-- 成功后调用 clearSelection()；破坏性操作先通过 ConfirmDialog 确认。 -->
  </template>
</DataTable>
```

选择列由 `DataTable` 统一管理，不参与排序或列显隐。`is-row-selectable` 可排除不可操作的行；全选只作用于当前页的可选记录。翻页、修改每页数量、搜索、排序、列筛选、数据刷新或关闭选择能力时会清空选择；选择状态不持久化，也不表示选中了服务端的所有查询结果。底部操作栏始终相对表格区域水平居中；可用宽度足够时分页在同一行右侧，否则移到下一行，避免重叠。尺寸测量复用 VueUse `useElementBounding` 并在下一帧更新，随容器和业务操作按钮的宽度变化自动调整。

`selection-change` 返回已选记录数组；`selection-actions` 插槽提供 `rows`、`clearSelection` 和 `disabled`，组件实例也暴露 `clearSelection()`。批量动作的权限、确认、API 调用、成功/失败反馈由业务模块负责，后端必须重新验证每条记录的授权与当前状态。仅启用选择不会增加任何业务写入接口。

选择操作栏借鉴 [shadcn-admin 的批量操作交互](https://github.com/satnaing/shadcn-admin/blob/main/src/components/data-table/bulk-actions.tsx)：半透明背景、模糊和阴影，悬停时以 300ms 缓出、100ms 延迟放大到 1.05 倍。Vue `Transition` 补充 300ms 进入和 150ms 退出；数量变化、复选框和行高亮使用短过渡。动效放在内层面板，外层保持原始布局尺寸，避免影响居中测量；同排判断会为放大效果预留空间。样式集中在 `src/assets/data-table.css`，只作用于 `.data-table` 命名空间。

操作栏支持左右方向键、Home/End 移动焦点，跳过禁用按钮；Esc 清除选择并把焦点返回当前页全选控件。菜单触发器的 Esc 保留给菜单关闭行为。退出过程禁用面板交互，快速取消并重新选择可中断退出。系统启用“减少动态效果”时，取消移动、缩放、数量和勾选动画，保留颜色及状态反馈。

## API 与权限契约

- 请求使用 Vine validator；不要在 controller 中重复校验。
- 业务逻辑放 service，持久化关系放 Lucid model，输出使用 `serialize()`、transformer 或明确 DTO。
- 成功响应使用现有 `{ data: ... }` envelope；分页数据放在 `data.items` 和 `data.meta`。
- 受保护路由使用 `middleware.auth()` 与最小权限 middleware，并通过 Bouncer `access` ability 授权。
- API 变更必须同步 OpenAPI 装饰器、前端 API 类型和相关测试。
- 通过 `@/lib/api` 发起前端请求，复用现有 `ApiError` 和 Bearer token 约定。

## 表单与交互

### 全局动效

共享 UI 使用 shadcn-admin 的淡入、轻缩放、按弹层方向滑入和侧栏展开模式，通过 Reka UI 的 `data-state="open|closed"` 触发。不要使用只匹配 `data-open` 属性的条件。动效节奏集中在 `src/assets/assistant-components.css`，管理端、独立助手、桌面 Web 客户端和 Chrome 扩展都使用同一入口：

| 场景                              | 时长  | 行为                           |
| --------------------------------- | ----- | ------------------------------ |
| 按钮、输入框、选择控件、菜单项    | 150ms | 颜色、边框、焦点和按压反馈     |
| 菜单、Select、Popover、Tooltip    | 150ms | 淡入、轻缩放和方向滑入         |
| 对话框、遮罩、Accordion、侧栏宽度 | 200ms | 淡入缩放或展开收起             |
| Sheet、Drawer                     | 300ms | 面板滑入；手势拖动保持即时响应 |
| 弹层关闭                          | 150ms | 快速淡出或滑出                 |

时长通过 `--ui-motion-fast`、`--ui-motion-normal`、`--ui-motion-slow` 调整；进入和状态反馈使用 `--ui-motion-ease-out`，退出使用 `--ui-motion-ease-in`。按钮、复选框和 Toggle 的按压缩放为 0.97，禁用状态不响应。减少动态效果时，共享控件取消装饰性动画和过渡，保留开关位置、选中颜色、焦点和加载指示。不要逐页添加平行动效实现，也不要改变弹层 portal、焦点管理或权限契约。

### 表单契约

标准表单使用 `vee-validate`、Zod、`toTypedSchema`、`FormField`、`FormControl` 和 `FormMessage`。表单弹窗参考 `apps/frontend/src/features/wecom-message-templates/components/WecomMessageTemplateForm.vue`；破坏性操作使用 `ConfirmDialog.vue`。

`ConfirmDialog` 的确认按钮只触发 `confirm`，不会自动关闭弹窗。业务处理器在操作完成后更新 `open`，异步执行时传入 `loading` 禁用确认和取消；失败时可以保留弹窗供重试，批量操作可通过描述展示处理进度。

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
