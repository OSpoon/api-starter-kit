import type { ConfirmationOutboundMessage } from '#channels/channel_types'

function escapeMarkdown(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
    .replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1')
}

export function formatConfirmationDetails(confirmation: ConfirmationOutboundMessage) {
  const sections = [escapeMarkdown(confirmation.description)]
  if (confirmation.targetLabel) {
    sections.push(`**操作对象：** ${escapeMarkdown(confirmation.targetLabel)}`)
  }
  if (confirmation.changes?.length) {
    const visibleChanges = confirmation.changes.slice(0, 8)
    const lines = visibleChanges.map(
      ({ label, value }) => `- **${escapeMarkdown(label)}：** ${escapeMarkdown(value)}`
    )
    if (confirmation.changes.length > visibleChanges.length) {
      lines.push(`- 另有 ${confirmation.changes.length - visibleChanges.length} 项未显示`)
    }
    sections.push(`**操作摘要：**\n${lines.join('\n')}`)
  }
  if (confirmation.impactLabel) {
    sections.push(`> ${escapeMarkdown(confirmation.impactLabel)}`)
  }
  return sections.join('\n\n')
}

export function formatDingTalkConfirmationDescription(confirmation: ConfirmationOutboundMessage) {
  return `## ${escapeMarkdown(confirmation.title)}\n\n${formatConfirmationDetails(confirmation)}`
}
