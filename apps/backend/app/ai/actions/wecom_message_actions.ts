import encryption from '@adonisjs/core/services/encryption'

import type { AiAgentActionImplementation } from '#ai/core/ai_agent_action_contracts'
import {
  defineAiAgentAction,
  ensurePermission,
  integer,
  string,
  summaryValue,
} from '#ai/core/ai_agent_action_helpers'
import WecomMessageTemplate from '#models/wecom_message_template'
import {
  applyWecomRuntimeMentions,
  auditWecomMessageSend,
  renderWecomPayload,
  sendWecomMessageTemplate,
  validateTemplateParameters,
  validateWecomTemplatePayload,
} from '#services/wecom_message_template_service'

function record(input: Record<string, unknown>, name: string) {
  const value = input[name]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} 无效`)
  }
  return value as Record<string, unknown>
}

function stringList(input: Record<string, unknown>, name: string) {
  const value = input[name]
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 120)
  ) {
    throw new Error(`${name} 无效`)
  }
  return value.map((item) => item.trim())
}

const sendWecomMessageAction: AiAgentActionImplementation = {
  permission: 'wecom-templates:send',
  async prepare(input) {
    const templateId = integer(input, 'templateId', ['id'])
    const template = await WecomMessageTemplate.find(templateId)
    if (!template) throw new Error('消息模板不存在')
    if (!template.enabled) throw new Error('消息模板已停用')

    const params = record(input, 'params')
    const mentionedList = stringList(input, 'mentionedList')
    const mentionedMobileList = stringList(input, 'mentionedMobileList')
    validateTemplateParameters(template.payload, template.parameters ?? [], params)
    const rendered = renderWecomPayload(template.payload, params) as Record<string, unknown>
    const payload = applyWecomRuntimeMentions(template.msgtype, rendered, {
      mentionedList,
      mentionedMobileList,
    })
    validateWecomTemplatePayload(template.msgtype, payload)

    return {
      targetType: 'wecom_message_template',
      targetId: String(template.id),
      targetSummary: {
        name: template.name,
        msgtype: template.msgtype,
        parameterNames: Object.keys(params),
        mentionedCount: mentionedList?.length ?? 0,
        mentionedMobileCount: mentionedMobileList?.length ?? 0,
      },
      payload: {
        templateId: template.id,
        parameterNames: Object.keys(params),
        encryptedInput: encryption.encrypt(
          JSON.stringify({ params, mentionedList, mentionedMobileList })
        ),
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'wecom-templates:send')
    const template = await WecomMessageTemplate.find(integer(confirmation.payload, 'templateId'))
    if (!template || !template.enabled) throw new Error('消息模板不存在或已停用')
    const encryptedInput = string(confirmation.payload, 'encryptedInput', 100_000)
    let input: {
      params: Record<string, unknown>
      mentionedList?: string[]
      mentionedMobileList?: string[]
    }
    try {
      const decrypted = encryption.decrypt<string>(encryptedInput)
      if (!decrypted) throw new Error('empty encrypted input')
      input = JSON.parse(decrypted)
    } catch {
      throw new Error('消息参数已失效，请重新发起发送')
    }
    await sendWecomMessageTemplate(template, input.params, {
      mentionedList: input.mentionedList,
      mentionedMobileList: input.mentionedMobileList,
    })
    await auditWecomMessageSend(ctx, {
      actorUserId: actor.id,
      source: 'ai_agent',
      template,
      params: input.params,
      mentionedList: input.mentionedList,
      mentionedMobileList: input.mentionedMobileList,
    })
    return { sent: true, templateId: template.id }
  },
}

export const wecomMessageActions = {
  send_wecom_message: defineAiAgentAction(sendWecomMessageAction, {
    impact: 'standard',
    summarize: (payload) => [
      { field: 'result', value: 'send_wecom_message' },
      { field: 'parameter_names', value: summaryValue(payload, 'parameterNames') },
    ],
  }),
}
