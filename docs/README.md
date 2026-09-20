# 文档总览

文档按任务和信息层级组织。项目定位与高层能力概览见根目录 [README.md](../README.md)；
实现细节和运维要求放在对应专题文档中。

## 入门与产品扩展

- [快速开始](getting-started.md)：环境要求、依赖安装、基础环境变量和本地服务。
- [产品扩展指南](customization.md)：如何替换 starter 示例、添加业务 feature、页面、API 和权限。
- [系统架构](architecture.md)：前后端分层、系统能力边界和 AI 扩展边界。

## 客户端

- 管理端 Web：`apps/frontend`，承载系统管理能力和内置浮动 AI 助手。
- 独立助手 Web：[`apps/assistant-web`](../apps/assistant-web/README.md)，承载全屏 AI 对话工作区，可单独部署。
- 独立助手桌面端：[`apps/assistant-desktop`](../apps/assistant-desktop/README.md)，使用 Tauri 包装独立助手 Web，不复制 Web UI 或 AI 编排。
- Chrome 扩展：[`apps/assistant-extension`](../apps/assistant-extension/README.md)，使用 Extension.js 和 Vue 3 承载现有助手侧边栏，并按用户配置连接 API 服务。
- 上述四种界面交付面均为正式支持入口；桌面端和 Chrome 扩展复用独立助手客户端，发布包和平台权限分别管理。
- 管理端、独立助手 Web、桌面端与 Chrome 扩展共用 `apps/backend` 的认证、权限、AI 会话、SSE、历史记录和语音转写 API。
- 桌面端开发与发布细节见[AI 助手架构](ai-assistant-architecture.md)和[部署指南](deployment.md)。

## 工程与运行

- [工程开发指南](development.md)：monorepo 结构、常用命令、实现入口和提交前检查。
- [开源技术栈与项目仓库](open-source-tech-stack.md)：本项目使用的主要开源框架、库和工程工具，以及对应 GitHub 仓库链接。
- [API 指南](api.md)：OpenAPI 文档地址、鉴权、响应格式和接口开发约定。
- [安全与治理](security.md)：安全模型、凭据保护、授权审计和部署加固。
- [部署指南](deployment.md)：生产 Docker Compose、环境配置、健康检查和运维检查。

## 能力说明

- [AI 助手能力](ai-assistant-capabilities.md)：用户可用能力、流程和安全边界。

## 实现与集成参考

- [AI 助手架构](ai-assistant-architecture.md)：运行时分层、工具边界、持久化和 SSE。
- [知识库实现说明](knowledge-base.md)：文档字段、LLM 元数据提取、两阶段检索、权限和审计。
- [AI 与集成参考](reference/README.md)：AI 能力、提示词、渠道 Bot 和 WeCom 消息模板。
