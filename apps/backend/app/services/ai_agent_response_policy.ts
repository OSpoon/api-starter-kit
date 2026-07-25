const unsupportedAssistantScopeMessage =
  '我仅支持基于已发布知识文档的产品与流程问答、当前系统信息查询，以及受控系统操作。请提供与本系统相关的问题。'

export function resolveGroundedAssistantResponse(input: {
  content: string
  completedToolNames: ReadonlySet<string>
}) {
  if (input.completedToolNames.size > 0) return input.content
  return unsupportedAssistantScopeMessage
}
