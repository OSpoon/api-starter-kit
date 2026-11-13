# 文档总览

根目录 [README](../README.md) 介绍项目定位。本文按常见任务列出其余项目文档；应用专属说明保留在各应用目录。

## 开始与开发

| 文档                             | 用途                                          |
| -------------------------------- | --------------------------------------------- |
| [快速开始](getting-started.md)   | 安装依赖、配置本地环境、启动 backend 和管理端 |
| [工程开发指南](development.md)   | 应用命令、检查和发布入口                      |
| [产品扩展指南](customization.md) | 从业务需求组织 feature、页面、API 和权限      |
| [系统架构](architecture.md)      | 应用边界和主要请求路径                        |

## 部署与治理

| 文档                                    | 用途                                       |
| --------------------------------------- | ------------------------------------------ |
| [部署指南](deployment.md)               | Docker Compose、环境配置、更新、备份和排障 |
| [安全与治理](security.md)               | 认证、授权、凭据、审计和 AI 安全边界       |
| [API 指南](api.md)                      | OpenAPI 入口、鉴权约定和接口变更流程       |
| [开源技术栈](open-source-tech-stack.md) | 主要框架、工具和上游仓库                   |

## 功能与实现参考

| 文档                                        | 用途                                      |
| ------------------------------------------- | ----------------------------------------- |
| [AI 助手能力](ai-assistant-capabilities.md) | 各客户端与渠道的能力和使用边界            |
| [AI 助手架构](ai-assistant-architecture.md) | Agent、工具、会话存储和流式接口的实现边界 |
| [知识库实现说明](knowledge-base.md)         | 文档管理、检索、权限和审计                |
| [AI 与集成参考](reference/README.md)        | 提示词、渠道 Bot 与专项验证               |

## 应用说明

- [独立助手 Web](../apps/assistant-web/README.md)
- [桌面端](../apps/assistant-desktop/README.md)
- [Chrome 扩展](../apps/assistant-extension/README.md)；商店材料见同目录的 `STORE.md`
- [移动端身份验证器](../apps/authenticator-mobile/README.md)

AI、知识库和渠道细节见上方专题文档；项目规则以根目录 [AGENTS.md](../AGENTS.md) 为准。
