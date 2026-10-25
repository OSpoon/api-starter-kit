import {
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import WecomMessageTemplate from '#models/wecom_message_template'

export const wecomMessageTemplatesQuery: AiQueryTemplate = {
  code: 'wecom_message_templates',
  permission: 'wecom-templates:read',
  version: 2,
  description:
    'List enabled WeCom message templates without Webhook addresses; results can be paginated with params.page.',
  parameters: { page: queryPageParameter },
  async execute(params) {
    const templates = await WecomMessageTemplate.query()
      .where('enabled', true)
      .orderBy('name')
      .orderBy('id')
      .paginate(params.page as number, queryPageSize)
    return {
      rows: templates.all().map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        msgtype: template.msgtype,
        parameters: template.parameters ?? [],
      })),
      message: queryPageMessage(templates.getMeta()),
    }
  },
}
