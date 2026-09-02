# API 指南

这份文档面向调用现有 API 或新增业务接口的开发者。后端 API 的基础路径为 `/api/v1`，OpenAPI schema 是请求和响应契约的权威来源。

## 查看契约

设置 `OPENAPI_DOCS_ENABLED=true` 后，后端提供：

| 资源 | 路径 |
| --- | --- |
| Scalar UI | `/api-docs` |
| OpenAPI JSON | `/api-docs.json` |
| OpenAPI YAML | `/api-docs.yaml` |

## 鉴权与响应

除明确挂载 API Key middleware 的路由外，业务接口使用管理员 Bearer Token。账户、登录、2FA、API Key 管理和 AI 会话接口不接受 API Key。

普通成功响应使用：

```json
{ "data": {} }
```

分页响应把 `items` 和 `meta` 放在 `data` 中。状态码约定为：`401` 未认证、`403` 无权限、`409` 冲突、`422` 校验失败。健康检查和 SSE 流遵循各自的响应格式。

## 现有接口组

| 接口组 | 相对路径 |
| --- | --- |
| 健康检查 | `GET /health`、`GET /health/ready` |
| 认证 | `/auth/*` |
| 账户与 2FA | `/account/*` |
| API Key | `/api-keys/*` |
| 系统管理 | `/system/*` |
| AI 会话 | `/ai-chat/*` |

具体请求参数和响应字段以 OpenAPI 为准。系统管理与 API Key 操作需要对应的命名权限，详见[安全与治理](security.md)。

## 新增或修改接口

1. 在 `apps/backend/start/routes.ts` 声明路径、middleware 和 controller。
2. 使用 Vine validator 校验所有输入。
3. 将领域逻辑放入 service，避免 controller 之间互相调用。
4. 用 `serialize()`、transformer 或明确 DTO 只返回所需字段。
5. 添加 OpenAPI 装饰器，并同步前端 API client、类型和响应契约测试。
6. 为认证、权限拒绝、校验失败、资源归属和分页边界补充测试。

前端请求统一使用 `@/lib/api`，不要引入平行 HTTP client。普通读取接口不得返回密钥、密码哈希、加密值或内部模型字段。

## 特殊接口

知识文档批量上传、AI 语音转写等接口包含 multipart 和文件大小限制；实施或调整这些能力前，以当前 OpenAPI schema 和对应 feature/service 为准。AI 查询与有副作用的操作还必须遵循[系统架构中的 AI 扩展边界](architecture.md#ai-扩展边界)。
