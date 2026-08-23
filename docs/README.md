# 文档总览

文档按阅读目的组织。项目定位和能力概览见根目录 [README.md](../README.md)；本目录集中保存安装、开发、接口、部署、维护和产品能力说明。

## 开始使用

- [快速开始](getting-started.md)：环境要求、依赖安装、环境变量、本地服务和 AI 提供方配置。
- [部署指南](deployment.md)：生产 Docker Compose、环境配置、健康检查和运维检查。

## 开发与接口

- [开发指南](development.md)：monorepo 结构、常用命令、实现约定和验证矩阵。
- [API 指南](api.md)：OpenAPI 文档地址、鉴权、响应格式和接口开发约定。
- [安全与治理](security.md)：安全模型、凭据保护、授权审计和部署加固。
- [WeCom 消息模板 feature](wecom-message-templates.md)：feature 结构、宿主集成和支持的消息类型。

## AI 能力与维护

- [AI 助手能力](ai-assistant-capabilities.md)：用户可用能力、流程和安全边界。
- [AI 助手架构](ai-assistant-architecture.md)：运行时分层、工具边界、持久化和 SSE。
- [AI 助手提示词](ai-assistant-prompts.md)：提示词、工具契约、确认文案和评估用例。
- [企业微信、钉钉与飞书机器人](ai-channel-bots.md)：外部渠道配置、开发启动、生产运行和排障；能力横向对比见 AI 助手能力文档。
