import { z } from 'zod'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createWecomMessageSendTool(
  _input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async ({ templateId, params, mentionedList, mentionedMobileList }) =>
      support.executeManagedChange('send_wecom_message', 'send_wecom_message', {
        templateId,
        params,
        mentionedList,
        mentionedMobileList,
      }),
    {
      name: 'send_wecom_message',
      description:
        'Send an enabled WeCom message template. The configured execution policy determines whether this runs directly or waits for the confirmation card. Use the template ID and required business parameters returned by run_registered_query; params values must be strings. mentionedList and mentionedMobileList are optional for text messages. Never use a Webhook URL or API Key.',
      schema: z.object({
        templateId: z.coerce.number().int().positive(),
        params: z.record(z.unknown()).default({}),
        mentionedList: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
        mentionedMobileList: z.array(z.string().trim().min(1).max(32)).max(100).optional(),
      }),
      parameters: piToolParameters.wecomMessageSend,
      prepareConfirmation: ({ templateId, params, mentionedList, mentionedMobileList }) =>
        support.prepareManagedChange('send_wecom_message', 'send_wecom_message', {
          templateId,
          params,
          mentionedList,
          mentionedMobileList,
        }),
    }
  )
}
