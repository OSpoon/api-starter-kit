# API Starter Kit

![HERO](./docs/api-starter-kit-hero.png)

> 面向 AI 管理应用的全栈模板，内置安全、治理、可观测性与受控 AI 能力。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.12.0-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.9.0-orange.svg)](package.json)

API Starter Kit 为团队构建可运营业务系统提供统一的治理基础。认证、细粒度权限、审计记录、API 契约、知识检索与 AI 辅助管理共享同一安全模型，业务功能可以在此基础上持续扩展。

## 项目定位

这是一个 pnpm/Turborepo 全栈 monorepo：后端使用 AdonisJS 7、Lucid、Bouncer、Vine 和 OpenAPI；前端使用 Vue 3、Vite、Pinia、Vue Router、Tailwind CSS 和 Reka UI。仓库提供系统级能力，不预设具体业务领域，适合从产品需求出发构建新的管理应用。

## 核心能力

| 领域             | 能力                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| 账号与安全       | 管理员初始化、登录、密码策略、账号锁定、TOTP 2FA、恢复码和 GitHub OAuth |
| 用户、角色与权限 | RBAC、权限目录、Bouncer 鉴权、路由驱动导航和前端权限显隐                |
| API Key          | 创建、更新、吊销、删除、过期管理、哈希校验和仅一次明文展示              |
| 审计与可观测性   | 关键管理操作与已确认 AI 操作的可检索审计记录                            |
| 知识库           | 审查后的文档管理、角色访问控制、向量检索和结构化检索元数据              |
| AI 工作台        | Pi Agent 流式对话、完整历史、知识问答、注册查询和需确认的管理操作提议   |
| 外部 AI 渠道     | 企业微信、飞书、钉钉智能机器人长连接、外部身份绑定和系统权限复用        |
| 交付基础         | OpenAPI/Scalar、Docker、pgvector PostgreSQL、国际化与自动化检查         |

AI 助手只能访问授权的知识和注册查询模板；管理类操作只创建持久化提议，必须经过结构化确认后执行。后端负责校验、授权、脱敏、持久化和审计，前端不是安全边界。

## 文档

按使用场景选择文档：

- [文档总览](docs/README.md)：文档分类与阅读路径。
- [快速开始](docs/getting-started.md)：环境准备、安装、配置和本地启动。
- [开发指南](docs/development.md)：工作区结构、命令、实现约定和验证矩阵。
- [API 指南](docs/api.md)：OpenAPI、鉴权、接口组和响应约定。
- [部署指南](docs/deployment.md)：Docker Compose、环境变量和上线检查。
- [安全与治理](docs/security.md)：认证、RBAC、凭据、AI 控制和部署加固。
- [AI 助手能力](docs/ai-assistant-capabilities.md)：面向产品与评估人员的能力边界。
- [AI 助手架构](docs/ai-assistant-architecture.md)：模块、状态、数据流和测试入口。
- [AI 助手提示词](docs/ai-assistant-prompts.md)：系统提示、工具描述和界面文案契约。
- [企业微信、飞书与钉钉机器人](docs/ai-channel-bots.md)：配置、绑定、运行和排障。
- [WeCom 消息模板 feature](docs/wecom-message-templates.md)：feature 边界、宿主集成和接口说明。

## 许可证

[MIT](LICENSE)
