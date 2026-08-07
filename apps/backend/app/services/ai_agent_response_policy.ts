import { AIMessage, createMiddleware, HumanMessage, ToolMessage } from 'langchain'

const unsupportedAssistantScopeMessage =
  '我仅支持基于已建立索引知识文档的产品与流程问答、当前系统信息查询，以及受控系统操作。请提供与本系统相关的问题。'

export function resolveGroundedAssistantResponse(input: {
  content: string
  completedToolNames: ReadonlySet<string>
}) {
  if (input.completedToolNames.size > 0) return input.content
  return unsupportedAssistantScopeMessage
}

export const aiAgentGroundingMiddleware = createMiddleware({
  name: 'AiAgentGrounding',
  afterAgent: (state) => {
    const messages = state.messages
    const lastHumanMessageIndex = messages.findLastIndex((message) =>
      HumanMessage.isInstance(message)
    )
    const completedToolCall = messages
      .slice(lastHumanMessageIndex + 1)
      .some((message) => ToolMessage.isInstance(message))
    const lastMessage = messages.at(-1)
    if (!lastMessage || !AIMessage.isInstance(lastMessage)) return
    const content = typeof lastMessage.content === 'string' ? lastMessage.content : ''
    const groundedContent = resolveGroundedAssistantResponse({
      content,
      completedToolNames: completedToolCall ? new Set(['agent-tool']) : new Set(),
    })
    if (groundedContent === content) return
    return {
      messages: [new AIMessage({ content: groundedContent })],
    }
  },
})
