# API Starter Kit

![HERO](./docs/api-starter-kit-hero.png)

> 面向 AI 管理应用的全栈模板，内置安全、治理、可观测性与受控 AI 能力。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.12.0-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.9.0-orange.svg)](package.json)

API Starter Kit 为团队构建可运营业务系统提供统一的治理基础。认证、细粒度权限、审计记录、API 契约、知识检索与 AI 辅助管理共享同一安全模型，而不是彼此割裂的产品能力。

## 产品亮点

### 内建安全与治理

模板提供认证、密码策略与锁定、TOTP 双因素认证、RBAC、API Key 生命周期管理、凭据一次性展示、后端权限复核和审计日志，为业务模块提供一致的安全底座。

### 受服务端控制的 AI 助手

助手可检索有权限的知识、读取已批准的非敏感系统信息、执行注册查询模板，并创建待确认的管理操作提议。它不能执行自由 SQL，不能将聊天文本视为批准，也无法绕过后端校验、鉴权、脱敏与审计策略。

AI 助手基于 Pi Agent 运行。工具参数和调用契约由 Pi 的工具 schema、工具描述及服务端注册表维护；系统提示词只负责身份、安全边界、授权和事实可信度，不承载具体工具参数。管理类工具只创建持久化提议，必须经过结构化确认后才能执行。

### 可持续扩展的全栈基础

仓库集成 AdonisJS API、Vue 3 工作台、OpenAPI、Docker、pnpm/Turborepo Monorepo、共享 UI 原语、页面模板、类型检查与格式化约定，适合在既有架构中持续扩展。

## 项目能力

| 领域             | 能力                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| 账号与安全       | 管理员初始化、登录/登出、密码策略与过期、账号锁定、TOTP 2FA、恢复码和 GitHub OAuth |
| 用户、角色与权限 | 用户与角色管理、权限目录、Bouncer 鉴权、路由驱动导航和前端权限显隐                 |
| API Key          | 创建、更新、吊销、删除、过期管理、哈希校验和仅一次明文展示                         |
| 审计日志         | 关键管理操作与已确认 AI 操作的可检索记录                                           |
| 知识库           | 审查后的文档管理、角色访问控制、向量检索和结构化检索元数据                         |
| AI 工作台        | Pi Agent 流式对话、历史持久化、知识问答、注册查询和需确认的管理操作提议            |
| 外部 AI 渠道     | 企业微信、飞书智能机器人 WebSocket 长连接、外部身份绑定和复用系统权限的 AI 对话     |
| UI 模板          | 管理列表、详情、设置、流程、分析、向导与操作模式示例                               |
| 交付基础         | OpenAPI/Scalar、Docker、pgvector PostgreSQL、国际化与自动化检查                    |

## 文档

| 面向对象       | 文档                                             | 用途                               |
| -------------- | ------------------------------------------------ | ---------------------------------- |
| 产品与评估人员 | [AI 助手能力](docs/ai-assistant-capabilities.md) | 了解助手能做什么及其安全边界       |
| 开发人员       | [快速开始](docs/getting-started.md)              | 安装、配置环境、迁移和本地运行     |
| 开发人员       | [开发指南](docs/development.md)                  | 工作区结构、脚本、UI 约定与验证    |
| 开发人员       | [AI 渠道机器人对接](docs/ai-channel-bots.md)     | 企业微信与飞书机器人的开发、配置与排障 |
| API 使用者     | [API 指南](docs/api.md)                          | OpenAPI、鉴权、接口组与响应约定    |
| 运维人员       | [部署指南](docs/deployment.md)                   | Docker Compose、运行行为与运维检查 |
| 安全审查人员   | [安全与治理](docs/security.md)                   | 认证、RBAC、凭据、AI 控制与加固    |
| 维护人员       | [AI 助手架构](docs/ai-assistant-architecture.md) | 模块、状态、数据流和测试覆盖       |

## 快速开始

完整说明见[快速开始](docs/getting-started.md)。概览步骤如下：

```bash
pnpm install
pnpm docker:up
pnpm --dir apps/backend exec node ace migration:run
pnpm dev
```

AI 助手运行时支持人工通过 `steer`/`followUp` 队列介入，使用 `abort` 停止生成；长会话通过 Pi compaction 生成并持久化摘要，工具进度通过 `tool_execution_update` 转为 SSE 状态事件，脱敏后的运行详情随助手消息持久化并在历史会话中恢复。涉及工具、Pi runtime、提示词或确认流程时，至少运行：

```bash
pnpm --dir apps/backend typecheck
pnpm --dir apps/backend exec node ace test
```

LLM 配置在系统管理中的「LLM 配置」页面维护，支持运行时修改对话模型、Embedding
模型和 OpenAI-compatible 网关，无需重启服务。API Key 会在后端加密保存。

### 企业微信智能机器人

企业微信 Webhook 继续用于出站通知；双向 AI 对话使用智能机器人 API 的 WebSocket 长连接。
企业微信智能机器人参数在系统管理中的「LLM 配置」页面维护，Bot Secret 会在后端加密保存。开发环境运行 `pnpm dev` 时，企业微信和飞书分别由两个 Nodemon bot worker 监控 `apps/backend/app` 和 `apps/backend/commands`，代码变更后会分别优雅重启并重新建立 WebSocket 连接；配置保存后仍需重启对应 bot worker 以重新加载运行时配置：

```bash
pnpm dev
```

机器人用户首次发消息时会收到一次性绑定码；登录管理后台后调用账号绑定入口完成绑定。绑定后会沿用现有 AI 助手的角色、权限、知识库访问和受控操作确认机制。Docker Compose 会分别启动 `wecom-bot` 和 `feishu-bot` 两个独立容器，避免连接、日志和故障相互影响。

### 飞书机器人

飞书接入使用官方 `@larksuiteoapi/node-sdk` 的 WebSocket 长连接模式，仅支持飞书自建应用。请在飞书开发者后台开启机器人能力，订阅 `im.message.receive_v1` 事件，并开启交互卡片回调；将 App ID 和 App Secret 填入「系统管理 → LLM 配置 → 飞书机器人」。飞书域名通常留空使用国内默认域名，国际版或 Lark 环境按官方 SDK 要求填写。

飞书与企业微信使用相同的 AI 渠道适配层，但分别运行 `bot:wecom` 和 `bot:feishu` 进程。执行 `pnpm dev` 会同时启动两个进程；也可以单独执行 `turbo bot:wecom` 或 `turbo bot:feishu`。飞书消息首次进入时同样返回一次性绑定码；绑定后复用现有 AI 助手的用户权限、角色、知识库和受控操作确认链路。飞书长连接事件回调必须快速返回，因此 AI 处理在后台继续，文本或交互确认卡通过飞书消息 API 回传。

## 许可证

[MIT](LICENSE)
