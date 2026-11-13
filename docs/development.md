# 工程开发指南

本文整理工作区入口和常用命令。项目工程规范见根目录 [AGENTS.md](../AGENTS.md)；业务功能的组织方式见[产品扩展指南](customization.md)。

## 应用边界

| 路径                        | 职责                                                   |
| --------------------------- | ------------------------------------------------------ |
| `apps/backend`              | API、认证授权、数据、AI runtime 和渠道 Bot worker      |
| `apps/frontend`             | 管理端 Web、共享 UI 和 AI 助手实现                     |
| `apps/assistant-web`        | 独立助手客户端，复用 `frontend` 的 AI、认证和 API 实现 |
| `apps/assistant-desktop`    | Tauri 原生窗口和安装包                                 |
| `apps/assistant-extension`  | Chrome MV3 side panel 和扩展构建                       |
| `apps/authenticator-mobile` | Capacitor TOTP 身份验证器                              |

修改代码前阅读根目录及目标目录最近的 `AGENTS.md`。API 契约以 backend OpenAPI 为准，前端路由和页面规范见 `apps/frontend/AGENTS.md`。

## 工作区命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm test
```

根目录 `pnpm dev` 只启动 backend 和管理端 frontend；数据库可通过 `pnpm docker` 菜单启动。其他应用按需运行：

```bash
pnpm --dir apps/assistant-web dev
pnpm --dir apps/assistant-desktop dev # 先启动 assistant-web
pnpm --dir apps/assistant-extension dev
pnpm bot:wecom
pnpm bot:feishu
pnpm bot:dingtalk
```

assistant-web 默认监听 `17070`，管理端默认监听 `18080`。桌面端开发连接已有的 assistant-web 服务；桌面生产构建会先构建并打包该 Web 客户端。扩展共享样式规则见 `apps/frontend/AGENTS.md`，Vue Router runtime 规则见 `apps/assistant-extension/AGENTS.md`。

本机运行 backend/Bot 技能脚本需提供 Anthropic Sandbox Runtime 的系统依赖和所需解释器：macOS 安装 `ripgrep`（`brew install ripgrep`）并确保 `python3` 可用；Linux 安装 `bash`、`bubblewrap`、`python3`、`ripgrep` 和 `socat`，并允许创建所需 namespace。条件不满足时脚本执行失败关闭。Docker backend 镜像已包含 Linux 依赖，部署限制见[部署指南](deployment.md)。

## 应用级检查

按改动范围运行对应的检查；各包的脚本定义是命令可用性的准据。

| 应用                 | 检查命令                                                   |
| -------------------- | ---------------------------------------------------------- |
| Backend              | `format:check`、`typecheck`、`lint:check`、`test`、`build` |
| Frontend             | `format:check`、`typecheck`、`lint:check`、`test`、`build` |
| Assistant Web        | `format:check`、`typecheck`、`lint:check`、`test`、`build` |
| Desktop              | `format:check`、`typecheck`、`lint:check`、`test`、`build` |
| Extension            | `format:check`、`typecheck`、`lint:check`、`build`         |
| Authenticator Mobile | `typecheck`、`check:totp`、`build`                         |

修改数据库 schema 时，在目标环境检查迁移状态：

```bash
pnpm --dir apps/backend exec node ace migration:status
```

修改 AI Agent 工具、查询或确认流程时，可运行专项验证：

```bash
pnpm test:agent-workflows
pnpm --dir apps/backend exec node ace ai:evaluate
```

`lint` 和 `format` 会写入文件；只做检查时使用 `lint:check` 和 `format:check`。桌面端和扩展的专项开发及发布说明分别见[桌面端 README](../apps/assistant-desktop/README.md)和[扩展 README](../apps/assistant-extension/README.md)。

## 发布

根目录 `pnpm release` 使用 `bumpp` 更新 workspace 版本并触发 `changelogen` 生成 `CHANGELOG.md`。发布流程会创建提交和 tag 并推送；详细配置见根目录 `bump.config.ts` 与 `changelog.config.ts`。`CHANGELOG.md` 为生成文件，不手动维护。

## 提交规范

提交信息使用 Conventional Commits：`<type>(<scope>): <subject>`。允许的 type 为 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore` 和 `revert`。scope 使用稳定的小写名称；跨仓库改动可以省略。

subject 使用简洁的祈使句，以小写开头，不加句号，优先控制在 72 个字符以内；需要说明行为、安全影响、迁移或验证细节时添加正文，正文与 subject 空一行并尽量按 72 字符换行。破坏性变更使用 `!` 并说明迁移方式。每个提交只包含一个连贯改动。

```text
feat(ai): add confirmed WeCom send action
fix(auth): prevent last administrator lockout
docs: document Node.js version requirement
chore(deps): update AdonisJS packages
```
