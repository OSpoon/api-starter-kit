# 工程开发指南

常用命令与检查入口。工程规范见根目录 [AGENTS.md](../AGENTS.md)，业务功能组织见[产品扩展指南](customization.md)。

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

`pnpm dev` 启动 backend 和管理端 frontend；数据库可用 `pnpm docker` 菜单启动。其他应用按需运行：

```bash
pnpm --dir apps/assistant-web dev
pnpm --dir apps/assistant-desktop dev # 先启动 assistant-web
pnpm --dir apps/assistant-extension dev
pnpm bot:wecom
pnpm bot:feishu
pnpm bot:dingtalk
```

assistant-web 默认端口为 `17070`，管理端为 `18080`。桌面端开发连接 assistant-web；生产构建会将其打包。

本机运行 backend/Bot 技能脚本需安装 `ripgrep` 和 `python3`（macOS），或 Linux 依赖 `bash`、`bubblewrap`、`python3`、`ripgrep`、`socat`。Ubuntu 26 默认 AppArmor 配置可能阻止 sandbox；缺少隔离能力时脚本会失败关闭。Docker 镜像已包含依赖，见[部署指南](deployment.md)。

## 检查

按改动运行对应应用的检查；各应用可用脚本见其 `package.json`。`lint` 和 `format` 会写文件，检查时使用 `lint:check` 和 `format:check`。

数据库 schema 改动后检查迁移状态：

```bash
pnpm --dir apps/backend exec node ace migration:status
```

AI Agent 工具、查询或确认流程可运行：

```bash
pnpm test:agent-workflows
pnpm --dir apps/backend exec node ace ai:evaluate
```

`pnpm test:agent-workflows` 当前运行完整 backend 测试套件，并非 Agent 专项过滤器。

桌面端和扩展的专项说明见[桌面端 README](../apps/assistant-desktop/README.md)和[扩展 README](../apps/assistant-extension/README.md)。

## 发布与提交

`pnpm release` 更新 workspace 版本并生成 `CHANGELOG.md`；该文件为生成文件，不手动维护。

提交信息使用 Conventional Commits：`<type>(<scope>): <subject>`，scope 可省略；每个提交聚焦一个连贯改动。
