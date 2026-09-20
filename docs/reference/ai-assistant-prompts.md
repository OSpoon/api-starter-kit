# AI 助手提示词维护索引

提示词、工具说明和界面文案直接维护在实现源文件中。本页只说明各类内容的归属，避免复制一份会随源码过期的英文 prompt 和中文翻译。

| 内容                                         | 权威来源                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 稳定的系统行为规则、压缩摘要和页面上下文策略 | `apps/backend/app/ai/policy/ai_agent_prompt_policy.ts`                                                                 |
| Agent 工具定义、模型可见的工具描述与工具注册 | `apps/backend/app/ai/registry/ai_agent_tool_registry.ts` 和 `apps/backend/app/ai/tools/`                               |
| 注册查询的模板、参数和权限契约               | `apps/backend/app/ai/registry/ai_agent_query_registry.ts`                                                              |
| 受控操作提议、执行器和错误边界               | `apps/backend/app/ai/core/ai_agent_action_registry.ts`                                                                 |
| 助手界面、确认卡片和工具状态文案             | `apps/frontend/src/locales/zh-CN.json`、`apps/frontend/src/locales/en.json` 及 `apps/frontend/src/components/ai-chat/` |
| 行为评估用例                                 | `apps/backend/tests/` 与 `pnpm --dir apps/backend exec node ace ai:evaluate`                                           |

新增或修改内容时，先遵守根目录 `AGENTS.md` 中的 AI 工具、查询、动作和确认契约。系统策略只放稳定边界；工具参数、目标解析、权限、脱敏和错误行为由对应注册项、schema 和服务端逻辑负责，不要在多个 prompt 中重复同一份契约。

行为规则或工具协议发生变化时，更新相应的 backend 测试与评估用例；若改变用户可见文案，更新 locale 源文件。实现分层和验证入口见[AI 助手架构](../ai-assistant-architecture.md)与[工程开发指南](../development.md)。
