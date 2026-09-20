# API Starter Kit

![HERO](./docs/api-starter-kit-hero.png)

> 面向 AI 管理应用的全栈模板，内置安全、治理、可观测性与受控 AI 能力。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-24.15.0-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.9.0-orange.svg)](package.json)

API Starter Kit 为团队构建可运营业务系统提供统一的治理基础。认证、细粒度权限、审计记录、API 契约、知识检索与 AI 辅助管理共享同一安全模型，业务功能可以在此基础上持续扩展。

## 项目定位

这是一个 pnpm/Turborepo 全栈 monorepo：后端使用 AdonisJS 7，管理端和独立助手客户端使用 Vue 3，桌面端使用 Tauri，Chrome 扩展使用 Extension.js。仓库提供系统级能力，不预设具体业务领域，适合从产品需求出发构建新的管理应用和独立 AI 助手产品。

## 应用入口

| 应用           | 目录                       | 定位                                                              |
| -------------- | -------------------------- | ----------------------------------------------------------------- |
| 管理端 Web     | `apps/frontend`            | 系统管理、知识库、模型配置、权限和内置浮动 AI 助手                |
| 独立助手 Web   | `apps/assistant-web`       | 全屏、独立部署的 AI 助手客户端，复用管理端的 AI 会话实现          |
| 独立助手桌面端 | `apps/assistant-desktop`   | Tauri 原生窗口和安装包，内置独立助手 Web 产物，不复制 AI 业务逻辑 |
| Chrome 扩展    | `apps/assistant-extension` | 使用 Extension.js 和 Vue 3 承载现有 AI 助手的 Chrome MV3 侧边栏   |
| API 与运行时   | `apps/backend`             | 认证、授权、数据、AI 编排、SSE 和外部渠道能力的唯一服务端边界     |

上述四种 UI 交付面和企业微信、飞书、钉钉三个 Bot 均为正式支持入口。管理端、独立助手 Web、桌面端和 Chrome 扩展共用同一套后端 API、认证、权限、会话历史与工具确认；桌面端和 Chrome 扩展分别作为 Tauri 原生承载层和 MV3 side panel 复用独立助手客户端。三个 Bot 则通过各自渠道 adapter 接入共享 AI runtime。

## 核心能力

| 领域         | 能力                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| 账号与安全   | 管理员初始化、登录、密码策略、账号锁定、2FA、恢复码和 OAuth                                  |
| 用户与权限   | 用户、角色、RBAC、细粒度权限、路由驱动导航和权限审计                                         |
| API 与审计   | API Key 生命周期管理、一次性凭据展示、审计日志、运行状态和服务级 AI 用量概览                 |
| 知识库       | 通用文档管理、角色访问控制、语义检索和基于授权内容的 AI 问答                                 |
| AI 工作台    | 管理端、独立 Web、桌面端和 Chrome 扩展共用对话与需确认操作；三个 Bot 复用同一受控 AI runtime |
| 外部 AI 渠道 | 企业微信、飞书、钉钉机器人，身份绑定、群聊公开知识问答和受控操作确认                         |
| 工程与交付   | OpenAPI、Docker Compose、PostgreSQL、国际化、自动化检查和三个正式支持的 IM Bot worker        |

## 从这里开始

1. [快速开始](docs/getting-started.md)：安装依赖并启动本地环境。
2. [工程开发指南](docs/development.md)：了解各应用的开发、验证和启动命令。
3. [产品扩展指南](docs/customization.md)：基于 starter 新增业务 feature、页面、API 和权限。
4. [系统架构](docs/architecture.md)：理解管理端、独立助手客户端和后端边界。
5. [文档总览](docs/README.md)：按场景查找 API、安全、部署和 AI 参考。

## 许可证

[MIT](LICENSE)
