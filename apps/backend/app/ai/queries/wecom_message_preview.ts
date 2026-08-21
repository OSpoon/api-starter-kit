import { z } from 'zod'

import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import WecomMessageTemplate from '#models/wecom_message_template'
import {
  applyWecomRuntimeMentions,
  renderWecomPayload,
  validateTemplateParameters,
  validateWecomTemplatePayload,
} from '#services/wecom_message_template_service'

export const wecomMessagePreviewQuery: AiQueryTemplate = {
  code: 'wecom_message_preview',
  version: 1,
  description:
    'Render one enabled WeCom message template using structured parameters and optional runtime mention lists. This is side-effect free and never sends a message or returns a Webhook address.',
  permission: 'wecom-templates:read',
  persistParameters: false,
  parameters: {
    templateId: {
      description: 'Required positive WeCom message template ID.',
      required: true,
      schema: z.coerce.number().int().positive(),
    },
    params: {
      description: 'Template business parameters keyed by placeholder name.',
      schema: z.record(z.unknown()).default({}),
    },
    mentionedList: {
      description: 'Optional WeCom user IDs to mention for text messages.',
      schema: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    },
    mentionedMobileList: {
      description: 'Optional mobile numbers to mention for text messages.',
      schema: z.array(z.string().trim().min(1).max(32)).max(100).optional(),
    },
  },
  async execute(params) {
    const template = await WecomMessageTemplate.query()
      .where('id', params.templateId as number)
      .where('enabled', true)
      .first()
    if (!template)
      return { rows: [], message: 'No enabled WeCom message template matched that ID.' }
    const values = (params.params ?? {}) as Record<string, unknown>
    validateTemplateParameters(template.payload, template.parameters ?? [], values)
    const rendered = renderWecomPayload(template.payload, values) as Record<string, unknown>
    const payload = applyWecomRuntimeMentions(template.msgtype, rendered, {
      mentionedList: params.mentionedList as string[] | undefined,
      mentionedMobileList: params.mentionedMobileList as string[] | undefined,
    })
    validateWecomTemplatePayload(template.msgtype, payload)
    return {
      rows: [{ templateId: template.id, name: template.name, msgtype: template.msgtype, payload }],
    }
  },
}
