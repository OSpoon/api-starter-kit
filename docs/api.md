# API 指南

## OpenAPI 文档

后端从路由与装饰器生成 OpenAPI。设置 `OPENAPI_DOCS_ENABLED=true` 后提供：

| 资源         | 路径             |
| ------------ | ---------------- |
| Scalar UI    | `/api-docs`      |
| OpenAPI JSON | `/api-docs.json` |
| OpenAPI YAML | `/api-docs.yaml` |

业务 API 基础路径为 `/api/v1`。已启用的 OpenAPI 文档是请求和响应 schema 的权威来源。

## 鉴权与响应

除明确挂载 API Key middleware 的路由外，业务接口使用管理员 Bearer Token。账户、登录、2FA、API Key 管理和 AI 会话接口不接受 API Key。

除健康检查和 SSE 流外，成功响应为：

```json
{ "data": {} }
```

分页响应在 `data` 中返回 `items` 与 `meta`。`401` 表示未认证，`403` 表示未授权，`409` 表示冲突，`422` 表示校验失败。

## 接口组

| 接口组   | 相对路径                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| 健康检查 | `GET /health`、`GET /health/ready`                                                                           |
| 认证     | `/auth/login`、`/auth/github`、`/auth/github/callback`、`/auth/github/exchange`、`/auth/2fa/verify`          |
| 账户     | `/account/profile`、`/account/password`、2FA 操作、`/account/logout`                                         |
| API Key  | `/api-keys`、`/api-keys/:id`                                                                                 |
| 系统管理 | `/system/users`、`/system/roles`、`/system/permissions`、`/system/audit-logs`、`/system/knowledge-documents` |
| AI 会话  | `/ai-chat/conversations` 及嵌套消息、确认操作、`POST /ai-chat/transcribe` 语音转写               |

表内路径均相对 `/api/v1`。系统管理与 API Key 操作需要对应的命名权限，详见[安全与治理](security.md)。

知识文档支持通过 `POST /system/knowledge-documents/batch` 使用 multipart 字段 `files` 批量上传 TXT、Markdown 或 reStructuredText 文件；单次最多 20 份、每份最大 2 MB。响应中的 `data.items` 为成功创建的文档，`data.failed` 为未成功处理的文件及原因。

### AI 语音转写

`POST /api/v1/ai-chat/transcribe` 使用 Bearer Token 鉴权，接收 `multipart/form-data` 字段 `audio`。支持 WebM、OGG、WAV、MP3、M4A、MP4、MPEG 和 MPGA，单个文件最大 10 MB。响应为 `{ data: { text } }`；接口只返回转写文本，不创建聊天消息，前端随后复用普通 AI 消息接口提交文本。

ASR 服务地址、模型和密钥通过系统管理的「LLM 配置」页面维护。密钥只在服务端使用并加密存储，不会返回给前端。

## 接口开发约定

在 `apps/backend/start/routes.ts` 声明路由和最窄 middleware；用 Vine 校验输入，返回显式序列化 DTO，添加 OpenAPI 装饰器，并更新前端 API client 与类型。普通读取或列表响应不得包含密钥。
