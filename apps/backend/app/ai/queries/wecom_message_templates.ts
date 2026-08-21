import { queryResultLimit } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import WecomMessageTemplate from '#models/wecom_message_template'

export const wecomMessageTemplatesQuery: AiQueryTemplate = {
  code: 'wecom_message_templates',
  version: 1,
  description: 'List available WeCom message templates without Webhook addresses.',
  permission: 'wecom-templates:read',
  parameters: {},
  async execute() {
    const templates = await WecomMessageTemplate.query()
      .where('enabled', true)
      .orderBy('name')
      .limit(queryResultLimit)
    return {
      rows: templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        msgtype: template.msgtype,
        parameters: template.parameters ?? [],
      })),
    }
  },
}
