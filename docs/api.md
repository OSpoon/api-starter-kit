# API 指南

Backend API 的基础路径为 `/api/v1`。具体 URL、参数、响应 schema 和认证要求以 backend 的 OpenAPI 定义为准；本文只记录通用约定和入口。

## 查看契约

设置 `OPENAPI_DOCS_ENABLED=true` 后，可在 backend 查看：

| 资源         | 路径             |
| ------------ | ---------------- |
| Scalar UI    | `/api-docs`      |
| OpenAPI JSON | `/api-docs.json` |
| OpenAPI YAML | `/api-docs.yaml` |

## 鉴权与响应

普通业务接口使用管理员 Bearer Token。助手集成接口使用 `X-API-Key`；API Key 仅在创建时展示一次，权限和数据范围仍由 backend 决定。

普通成功响应使用 `{ "data": ... }` envelope；分页结果在 `data.items` 和 `data.meta` 中。一般错误状态为 `401` 未认证、`403` 无权限、`409` 冲突、`422` 校验失败。健康检查和 SSE 使用各自定义的响应格式。

## 接口分组

| 能力        | 路径前缀                  |
| ----------- | ------------------------- |
| 健康检查    | `/health`                 |
| 认证与账户  | `/auth/*`、`/account/*`   |
| API Key     | `/api-keys/*`             |
| 系统管理    | `/system/*`               |
| AI 会话     | `/ai-chat/*`              |
| AI Key 集成 | `/integrations/ai-chat/*` |
| 管理台概览  | `/dashboard/*`            |

知识库接口和限制见[知识库实现说明](knowledge-base.md)。AI 图片、语音、渠道和确认接口的详细契约以 OpenAPI 和对应 feature/service 为准。

## 列表搜索

支持服务端 `search` 的列表会先过滤再分页，避免只搜索当前页。参数限制、搜索字段和具体接口以该 endpoint 的 OpenAPI schema 为准。目前涉及 API Key、审计日志和知识文档列表。

## 新增或修改接口

1. 在 `apps/backend/start/routes.ts` 声明路由、middleware 和 controller。
2. 使用 Vine validator 校验输入；领域逻辑放 service。
3. 通过 `serialize()`、transformer 或明确 DTO 只返回所需字段。
4. 更新 OpenAPI 定义、相关前端 API client 和类型。
5. 覆盖认证、允许/拒绝、校验、资源归属、冲突和分页边界。

前端统一通过 `@/lib/api` 请求 backend。不要新增平行 HTTP client；普通读取接口不得返回密钥、密码哈希、加密值或不必要的模型字段。AI 扩展需遵循[系统架构中的 AI 扩展边界](architecture.md#ai-扩展边界)。
