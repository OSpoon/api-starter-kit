import { z } from 'zod'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createProposeWecomMessageSendTool(
  _input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async ({ templateId, params, mentionedList, mentionedMobileList }) =>
      support.proposeManagedChange('send_wecom_message', {
        templateId,
        params,
        mentionedList,
        mentionedMobileList,
      }),
    {
      name: 'propose_wecom_message_send',
      description:
        'Prepare a proposal to send an enabled WeCom message template. Call this tool before claiming a send proposal exists. Use the template ID and every required business parameter exactly as returned by run_registered_query with wecom_message_templates or wecom_message_template_profile; every params value must be a string, including numeric-looking values such as temperature or counts. Runtime mentionedList and mentionedMobileList are optional and apply only to text messages. Never send directly: a structured confirmation card is required. Never ask for or use a Webhook URL or API Key.',
      schema: z.object({
        templateId: z.coerce.number().int().positive(),
        params: z.record(z.unknown()).default({}),
        mentionedList: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
        mentionedMobileList: z.array(z.string().trim().min(1).max(32)).max(100).optional(),
      }),
      parameters: piToolParameters.wecomMessageSend,
    }
  )
}
