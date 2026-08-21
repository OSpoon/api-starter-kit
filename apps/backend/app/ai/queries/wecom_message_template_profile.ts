import { z } from 'zod'

import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import WecomMessageTemplate from '#models/wecom_message_template'

export const wecomMessageTemplateProfileQuery: AiQueryTemplate = {
  code: 'wecom_message_template_profile',
  version: 1,
  description:
    'Look up one enabled WeCom message template by ID, including its safe payload template and required parameters, but never its Webhook address.',
  permission: 'wecom-templates:read',
  parameters: {
    templateId: {
      description: 'Required positive WeCom message template ID.',
      required: true,
      schema: z.coerce.number().int().positive(),
    },
  },
  async execute(params) {
    const template = await WecomMessageTemplate.query()
      .where('id', params.templateId as number)
      .where('enabled', true)
      .first()
    if (!template)
      return { rows: [], message: 'No enabled WeCom message template matched that ID.' }
    return {
      rows: [
        {
          id: template.id,
          name: template.name,
          description: template.description,
          msgtype: template.msgtype,
          payload: template.payload,
          parameters: template.parameters ?? [],
        },
      ],
    }
  },
}
