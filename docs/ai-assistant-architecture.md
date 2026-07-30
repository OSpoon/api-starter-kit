# AI 助手架构

本文档面向维护人员，说明 AI 子系统的职责划分；面向产品的功能说明见 [AI 助手能力](ai-assistant-capabilities.md)。

## 主流程

`ai_chat_controller.ts` 负责 HTTP 和 SSE：持久化消息、发送工具与确认事件、将完成的 proposal 关联到助手消息，并委托 service 执行 AI 工作。`ai_agent_service.ts` 负责 Agent、系统提示词、模型请求、流式过程和上下文压缩。

会话状态有两类持久化数据：

- `AiChatConversation` 与 `AiChatMessage` 保留完整的用户可见历史和引用。
- LangGraph checkpoint 保存 Agent 运行状态，`AiAgentPendingQuery` 保存多轮查询的安全参数。`ai_conversation_state.ts` 统一重置两者，避免状态机漂移。

## 工具边界

`ai_agent_registry.ts` 向模型提供四类工具：

| 工具     | 注册表或服务职责                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 权限诊断 | 构建当前用户的角色与权限摘要                                                                          |
| 注册查询 | `ai_agent_query_registry.ts` 校验参数、检查权限、限量与脱敏输出、持久化 pending query 并审计执行      |
| 知识检索 | `knowledge_service.ts` 在已索引文档中执行权限过滤的混合检索                                           |
| 变更提议 | `ai_agent_action_registry.ts` 准备安全的目标和 payload；`ai_agent_confirmation.ts` 持久化并在后续确认 |

注册查询具有稳定的 code 和 version。action 明确区分 `prepare` 和 `execute`：前者在持久化前校验输入、目标状态和冲突，后者在确认后重复校验权限与目标状态。

## 数据与安全控制

相关 model 包括 `AiChatConversation`、`AiChatMessage`、`AiAgentConfirmation`、`AiAgentPendingQuery`、`KnowledgeDocument` 和 `KnowledgeChunk`；迁移还会创建 LangGraph checkpoint schema。

`ai_agent_response_policy.ts` 在本轮没有工具提供必要事实时阻止无依据的回答。`ai_chat_timing.ts` 记录请求耗时，`audit_log.ts` 记录查询和 action 事件；可选的 `langfuse.ts` 仅通过环境变量启用。

## 前端职责

`apps/frontend/src/lib/ai-chat-api.ts` 管理 API 调用和 SSE 解析。`AiChatAssistant.vue` 提供浮动工作台、会话历史、工具状态、引用、proposal 控制、回复重新生成、取消和凭据一次性展示。`AiMessageContent.vue` 渲染流式 Markdown，并转义 raw HTML。

知识库管理是独立 feature，位于 `apps/frontend/src/features/knowledge`，包含页面、dialog 组件和 API 模块。

## 测试与评估

单元测试覆盖响应接地、耗时、重新生成、transformer、权限诊断、checkpoint、评估断言和知识处理；功能测试覆盖 checkpoint 持久化、确认、pending query、消息引用和会话状态重置。

修改模型、量化或提示词后运行：

```bash
pnpm --dir apps/backend exec node ace ai:evaluate
```

命令使用 mock 工具验证预期工具选择与有依据的输出，不会访问业务数据库。
