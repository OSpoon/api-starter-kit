# API Starter Kit

![HERO](./docs/api-starter-kit-hero.png)

> 面向 AI 管理应用的全栈模板，内置安全、治理、可观测性与受控 AI 能力。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-24.15.0-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.9.0-orange.svg)](package.json)

API Starter Kit 为团队构建可运营业务系统提供统一的治理基础。认证、细粒度权限、审计记录、API 契约、知识检索与 AI 辅助管理共享同一安全模型，业务功能可以在此基础上持续扩展。

## 项目定位

这是一个 pnpm/Turborepo 全栈 monorepo：后端使用 AdonisJS 7，前端使用 Vue 3。仓库提供系统级能力，不预设具体业务领域，适合从产品需求出发构建新的管理应用。

## 核心能力

| 领域             | 能力                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| 账号与安全       | 管理员初始化、登录、密码策略、账号锁定、2FA、恢复码和 OAuth                      |
| 用户与权限       | 用户、角色、RBAC、细粒度权限、路由驱动导航和权限审计                           |
| API 与审计       | API Key 生命周期管理、一次性凭据展示、审计日志和运行状态观测                    |
| 知识库           | 通用文档管理、角色访问控制、语义检索和基于授权内容的 AI 问答                    |
| AI 工作台        | 管理台对话、语音输入、权限诊断、系统查询和需确认的管理操作                     |
| 外部 AI 渠道     | 企业微信、飞书、钉钉机器人，身份绑定、群聊公开知识问答和受控操作确认             |
| 工程与交付       | OpenAPI、Docker Compose、PostgreSQL、国际化、自动化检查和可选渠道 worker         |

## 从这里开始

1. [快速开始](docs/getting-started.md)：安装依赖并启动本地环境。
2. [产品扩展指南](docs/customization.md)：基于 starter 新增业务 feature、页面、API 和权限。
3. [系统架构](docs/architecture.md)：理解前后端边界和扩展位置。
4. [文档总览](docs/README.md)：按场景查找 API、安全、部署和 AI 参考。

安全提示：启动前必须将 `apps/backend/.env.example` 中的
`ADMIN_PASSWORD` 和 `DB_PASSWORD` 替换为彼此不同的高强度密码；示例值仅为占位符，
不能用于共享或生产环境。

## 许可证

[MIT](LICENSE)
