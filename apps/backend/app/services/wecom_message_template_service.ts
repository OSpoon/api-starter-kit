import encryption from '@adonisjs/core/services/encryption'

import type WecomMessageTemplate from '#models/wecom_message_template'
import { type WecomMessageType } from '#models/wecom_message_template'
import env from '#start/env'

export class WecomTemplateValidationError extends Error {
  code = 'E_WECOM_TEMPLATE_VALIDATION'

  constructor(message: string) {
    super(message)
    this.name = 'WecomTemplateValidationError'
  }
}

export class WecomTemplateRateLimitError extends Error {
  code = 'E_WECOM_TEMPLATE_RATE_LIMIT'
  retryAfter: number

  constructor(retryAfter: number) {
    super('WeCom message rate limit exceeded')
    this.name = 'WecomTemplateRateLimitError'
    this.retryAfter = retryAfter
  }
}

const byteLength = (value: unknown) => Buffer.byteLength(String(value ?? ''), 'utf8')
const sendBuckets = new Map<string, number[]>()

function validateMarkdownSubset(msgtype: 'markdown' | 'markdown_v2', content: string) {
  if (msgtype === 'markdown') {
    const unsupportedPatterns: Array<[RegExp, string]> = [
      [/!\[[^\]]*\]\([^\)]*\)/, 'markdown images'],
      [/^\s*(?:[-+*]|\d+\.)\s+/m, 'markdown lists'],
      [/^\s*\|.*\|\s*$/m, 'markdown tables'],
      [/```/, 'markdown fenced code blocks'],
    ]
    const unsupported = unsupportedPatterns.find(([pattern]) => pattern.test(content))
    if (unsupported) throw new WecomTemplateValidationError(`${unsupported[1]} are not supported`)

    for (const match of content.matchAll(/<font\b([^>]*)>/gi)) {
      const color = match[1]?.match(/\bcolor\s*=\s*["'](info|comment|warning)["']/i)
      if (!color || match[1]?.replace(color[0], '').trim()) {
        throw new WecomTemplateValidationError(
          'markdown font tags only support info, comment, and warning colors'
        )
      }
    }
    return
  }

  if (/<font\b/i.test(content))
    throw new WecomTemplateValidationError('markdown_v2 does not support font colors')
  if (/<@[\w.-]+>/.test(content))
    throw new WecomTemplateValidationError('markdown_v2 does not support member mentions')
}

function requiredString(value: unknown, field: string, maxBytes?: number) {
  if (typeof value !== 'string' || !value.trim())
    throw new WecomTemplateValidationError(`${field} is required`)
  if (maxBytes && byteLength(value) > maxBytes)
    throw new WecomTemplateValidationError(`${field} exceeds ${maxBytes} bytes`)
}

function validatePayload(msgtype: WecomMessageType, payload: Record<string, any>) {
  if (payload.msgtype !== msgtype)
    throw new WecomTemplateValidationError('payload.msgtype must match msgtype')
  const body = payload[msgtype]
  if (!body || typeof body !== 'object')
    throw new WecomTemplateValidationError(`${msgtype} payload is required`)

  if (msgtype === 'text') {
    requiredString(body.content, 'text.content', 2048)
    for (const field of ['mentioned_list', 'mentioned_mobile_list']) {
      if (body[field] !== undefined && (!Array.isArray(body[field]) || body[field].length > 100)) {
        throw new WecomTemplateValidationError(`${field} must be an array with at most 100 items`)
      }
    }
  } else if (msgtype === 'markdown' || msgtype === 'markdown_v2') {
    requiredString(body.content, `${msgtype}.content`, 4096)
    validateMarkdownSubset(msgtype, body.content)
  } else {
    throw new WecomTemplateValidationError(`Unsupported message type: ${msgtype}`)
  }
}

export function validateWecomTemplatePayload(
  msgtype: WecomMessageType,
  payload: Record<string, unknown>
) {
  validatePayload(msgtype, payload)
}

export function validateWebhookUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new WecomTemplateValidationError('Webhook URL is invalid')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'qyapi.weixin.qq.com') {
    throw new WecomTemplateValidationError('Webhook URL must be the official WeCom HTTPS endpoint')
  }
  if (url.pathname !== '/cgi-bin/webhook/send' || !url.searchParams.get('key')) {
    throw new WecomTemplateValidationError('Webhook URL must contain a valid key')
  }
}

function parameterNames(value: unknown, result = new Set<string>()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) result.add(match[1]!)
  } else if (Array.isArray(value)) value.forEach((item) => parameterNames(item, result))
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => parameterNames(item, result))
  return result
}

export function inferTemplateParameters(payload: Record<string, unknown>) {
  return [...parameterNames(payload)].map((name) => ({
    name,
    type: 'string' as const,
    required: true,
    description: null,
    maxBytes: null,
  }))
}

export function validateTemplateParameters(
  payload: Record<string, unknown>,
  definitions: WecomMessageTemplate['parameters'],
  params: Record<string, unknown> = {}
) {
  validateTemplateDefinition(payload, definitions)
  validateTemplateValues(definitions, params)
}

export function validateTemplateDefinition(
  payload: Record<string, unknown>,
  definitions: WecomMessageTemplate['parameters']
) {
  const defined = new Map(definitions.map((item) => [item.name, item]))
  if (defined.size !== definitions.length)
    throw new WecomTemplateValidationError('Template parameters must be unique')
  for (const name of parameterNames(payload)) {
    if (!defined.has(name))
      throw new WecomTemplateValidationError(`Parameter ${name} is not defined`)
  }
}

export function validateTemplateStoragePayload(payload: Record<string, unknown>) {
  const text = payload.msgtype === 'text' ? payload.text : undefined
  if (text && typeof text === 'object' && !Array.isArray(text)) {
    if (Object.hasOwn(text, 'mentioned_list') || Object.hasOwn(text, 'mentioned_mobile_list')) {
      throw new WecomTemplateValidationError(
        'mentioned_list and mentioned_mobile_list must be provided at send time'
      )
    }
  }
}

function validateTemplateValues(
  definitions: WecomMessageTemplate['parameters'],
  params: Record<string, unknown>
) {
  for (const definition of definitions) {
    const value = params[definition.name]
    if (
      definition.required &&
      (value === undefined || value === null || (typeof value === 'string' && !value.trim()))
    ) {
      throw new WecomTemplateValidationError(`Parameter ${definition.name} is required`)
    }
    if (value === undefined || value === null) continue
    if (definition.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new WecomTemplateValidationError(`Parameter ${definition.name} must be a number`)
    }
    if (definition.type === 'boolean' && typeof value !== 'boolean') {
      throw new WecomTemplateValidationError(`Parameter ${definition.name} must be a boolean`)
    }
    if (definition.type === 'string' && typeof value !== 'string') {
      throw new WecomTemplateValidationError(`Parameter ${definition.name} must be a string`)
    }
    if (definition.maxBytes && Buffer.byteLength(String(value), 'utf8') > definition.maxBytes) {
      throw new WecomTemplateValidationError(`Parameter ${definition.name} exceeds its byte limit`)
    }
  }
}

export function serializeWecomMessageTemplate(template: WecomMessageTemplate) {
  const key = (() => {
    try {
      return new URL(template.webhookUrl).searchParams.get('key')
    } catch {
      return null
    }
  })()
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    msgtype: template.msgtype,
    webhookKeyHint: key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : null,
    payload: template.payload,
    parameters: template.parameters ?? [],
    enabled: template.enabled,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
}

export function renderWecomPayload(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{\s*([\w.-]+)\s*\}\}$/)
    if (exact && exact[1] && Object.hasOwn(params, exact[1])) return params[exact[1]]
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => String(params[key] ?? ''))
  }
  if (Array.isArray(value)) return value.map((item) => renderWecomPayload(item, params))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderWecomPayload(item, params)])
    )
  }
  return value
}

export function applyWecomRuntimeMentions(
  msgtype: WecomMessageType,
  payload: Record<string, unknown>,
  mentions: { mentionedList?: string[]; mentionedMobileList?: string[] } = {}
) {
  if (msgtype !== 'text' || !payload.text || typeof payload.text !== 'object') return payload
  const text = { ...(payload.text as Record<string, unknown>) }
  delete text.mentioned_list
  delete text.mentioned_mobile_list
  if (mentions.mentionedList !== undefined) text.mentioned_list = mentions.mentionedList
  if (mentions.mentionedMobileList !== undefined)
    text.mentioned_mobile_list = mentions.mentionedMobileList
  return { ...payload, text }
}

async function sendPayloadToWebhook(webhookUrl: string, payload: Record<string, unknown>) {
  const now = Date.now()
  const history = (sendBuckets.get(webhookUrl) ?? []).filter(
    (timestamp) => timestamp > now - 60_000
  )
  if (history.length >= 20) {
    const retryAfter = Math.max(1, Math.ceil((history[0]! + 60_000 - now) / 1000))
    throw new WecomTemplateRateLimitError(retryAfter)
  }
  history.push(now)
  sendBuckets.set(webhookUrl, history)
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
  const result = (await response.json().catch(() => null)) as {
    errcode?: number
    errmsg?: string
  } | null
  if (!response.ok || result?.errcode)
    throw new Error(result?.errmsg || `WeCom request failed (${response.status})`)
  return result
}

export function getWecomTestWebhookUrl() {
  const webhookUrl = env.get('WECOM_TEST_WEBHOOK_URL')?.trim()
  if (!webhookUrl) throw new WecomTemplateValidationError('WeCom test webhook is not configured')
  validateWebhookUrl(webhookUrl)
  return webhookUrl
}

export async function sendWecomMessagePayload(
  msgtype: WecomMessageType,
  payloadTemplate: Record<string, unknown>,
  definitions: WecomMessageTemplate['parameters'],
  params: Record<string, unknown>,
  webhookUrl: string,
  mentions: { mentionedList?: string[]; mentionedMobileList?: string[] } = {}
) {
  validateTemplateParameters(payloadTemplate, definitions, params)
  const rendered = renderWecomPayload(payloadTemplate, params) as Record<string, unknown>
  const payload = applyWecomRuntimeMentions(msgtype, rendered, mentions)
  validateWecomTemplatePayload(msgtype, payload)
  return sendPayloadToWebhook(webhookUrl, payload)
}

export async function sendWecomMessageTemplate(
  template: WecomMessageTemplate,
  params: Record<string, unknown> = {},
  options: { webhookUrl?: string; mentionedList?: string[]; mentionedMobileList?: string[] } = {}
) {
  if (!template.enabled) throw new Error('message template is disabled')
  const webhookUrl = options.webhookUrl ?? decryptWebhookUrl(template.webhookUrl)
  if (!webhookUrl) throw new Error('message template webhook is unavailable')
  return sendWecomMessagePayload(
    template.msgtype,
    template.payload,
    template.parameters ?? [],
    params,
    webhookUrl,
    options
  )
}

export function encryptWebhookUrl(value: string) {
  return encryption.encrypt(value)
}

export function decryptWebhookUrl(value: string) {
  return encryption.decrypt<string>(value)
}
