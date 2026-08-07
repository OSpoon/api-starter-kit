# AI 助手能力

AI 助手是受后端治理的管理控制台助手。它可以回答产品问题、查询有限的实时信息并准备管理变更，但不会绕过权限、数据库和确认流程。

## 支持范围

| 能力           | 支持方式                                                                                                                           | 限制                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 产品与流程问答 | `search_knowledge` 检索已索引文档                                                                                                  | 只使用授权文档；文档摘录不是授权依据。                                                                                       |
| 权限诊断       | `diagnose_my_access`                                                                                                               | 只针对当前登录用户。                                                                                                         |
| 实时系统查询   | `run_registered_query`                                                                                                             | 只使用注册模板；固定最多 20 条；不支持自由 SQL、任意字段、分页或继续查询。更多数据请前往 API Key、用户、访问控制或审计模块。 |
| 管理变更       | `propose_system_management_change` + 确认 API；API Key 吊销/删除使用专用 `propose_api_key_revocation` / `propose_api_key_deletion` | AI 只能生成提案，不能直接执行；确认时再次校验权限和目标状态。吊销与删除为独立工具，互不混淆。                                |
| 多轮对话       | LangGraph checkpoint、完整消息历史和 pending query                                                                                 | 上下文压缩只影响模型请求，不截断持久化历史。                                                                                 |

## 请求流程

```mermaid
flowchart TB
  A["用户消息"] --> B["保存用户消息"]
  B --> C["LangGraph Agent"]
  C --> D["知识检索 / 注册查询 / 权限诊断"]
  D --> C
  C --> E["助手流式回复"]
  C --> F["变更提议"]
  F --> G["用户确认"]
  G --> H["后端复核并执行"]
```

查询结果达到 20 条后，助手不会继续请求下一批；应引导用户打开对应管理模块查看完整数据。业务模块自己的表格分页与 AI 助手查询协议相互独立。

## 安全边界

- 后端是认证、授权、参数校验、脱敏和审计的唯一权威。
- 模型永远不能生成或执行自由 SQL。
- 查询每次调用都重新校验模板、权限和参数，结果固定上限 20 条。
- 破坏性操作必须通过结构化确认卡，模型文本不是授权通道。
- API Key、密码、token 和密钥值不会进入普通查询结果、聊天历史或日志。

## 配置与观测

模型通过 `AI_OPENAI_*` 接入 OpenAI 兼容服务；知识检索使用 `AI_EMBEDDING_*`。上下文压缩由 `AI_CONTEXT_COMPRESSION_ENABLED` 控制（触发阈值 `AI_CONTEXT_COMPRESSION_THRESHOLD_TOKENS`，保留消息数 `AI_CONTEXT_COMPRESSION_RECENT_MESSAGES`），Agent 请求超时由 `AI_REQUEST_TIMEOUT_MS` 控制。

Langfuse 通过 `LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY`、`LANGFUSE_BASE_URL`（以及启用开关）提供模型运行观测。项目不再维护独立的 AI 请求计时指标。

评估命令：

```bash
pnpm --dir apps/backend exec node ace ai:evaluate
```

实现细节见 [AI 助手架构](ai-assistant-architecture.md)，安全边界见 [安全与治理](security.md)。
