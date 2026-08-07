export type AiChatMarkdownMessage = {
  role: 'user' | 'assistant'
  content: string
}

export function formatAiChatMessagesAsMarkdown(
  messages: AiChatMarkdownMessage[],
  labels: { conversation: string; user: string; assistant: string }
) {
  return [
    `# ${labels.conversation}`,
    ...messages.flatMap((message) => [
      `## ${message.role === 'user' ? labels.user : labels.assistant}`,
      message.content.trim(),
    ]),
  ].join('\n\n')
}
