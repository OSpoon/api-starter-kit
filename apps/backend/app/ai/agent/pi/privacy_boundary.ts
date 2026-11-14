import { createHmac } from 'node:crypto'

import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
  type Model,
  type ProviderStreams,
} from '@earendil-works/pi-ai'

import env from '#start/env'

const placeholderPattern =
  /\{\{(?:EMAIL|PERSON|PHONE|ADDRESS|IP_ADDRESS|IDENTIFIER)_[a-f0-9]{16}\}\}/gi
const emailPattern =
  /(?<![\w.+-])[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi
const phonePattern = /(?<!\d)\+?\d[\d ().-]{8,}\d(?!\d)/g
const credentialPattern =
  /\b(password|passwd|pass|secret|token|authorization|api[\s_-]?key|client[\s_-]?secret|access[\s_-]?token|refresh[\s_-]?token|private[\s_-]?key|cookie|webhook)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const envCredentialPattern =
  /\b(?:[A-Z0-9]*_(?:PASSWORD|PASSWD|PASS|SECRET|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY)|PGPASSWORD|PASSWORD|PASSWD|PASS|SECRET|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY)(\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s#;,]+)/gi
const commonCredentialPattern =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g
const privateKeyPattern =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi
const urlCredentialPattern = /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi

type PrivacyKind = 'EMAIL' | 'PERSON' | 'PHONE' | 'ADDRESS' | 'IP_ADDRESS' | 'IDENTIFIER'
type ContextWithMessages = { messages: unknown[] }
const privacySessionTtlMs = 24 * 60 * 60 * 1000
const maxPrivacySessions = 256
const privacySessions = new Map<string, { session: AiPrivacySession; lastUsedAt: number }>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizedKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function isSensitiveKey(key: string) {
  const normalized = normalizedKey(key)
  return (
    /password|passwd|secret|token|authorization|cookie|credential|privatekey|recoverycode|encrypted/.test(
      normalized
    ) ||
    normalized.endsWith('pass') ||
    ['apikey', 'accesskey', 'clientkey', 'keyhash'].includes(normalized)
  )
}

function piiKindForKey(key: string): PrivacyKind | undefined {
  const normalized = normalizedKey(key)
  if (normalized === 'email' || normalized.endsWith('email') || normalized === 'emailaddress') {
    return 'EMAIL'
  }
  if (
    ['fullname', 'firstname', 'lastname', 'displayname', 'personname', 'username'].includes(
      normalized
    )
  ) {
    return 'PERSON'
  }
  if (['phone', 'mobile', 'telephone', 'phonenumber', 'mobilenumber'].includes(normalized)) {
    return 'PHONE'
  }
  if (
    ['address', 'streetaddress', 'postalcode', 'zipcode', 'dateofbirth', 'birthdate'].includes(
      normalized
    )
  ) {
    return 'ADDRESS'
  }
  if (['ip', 'ipaddress', 'ipv4', 'ipv6'].includes(normalized)) return 'IP_ADDRESS'
  if (['ssn', 'passport', 'nationalid', 'iban', 'accountnumber'].includes(normalized)) {
    return 'IDENTIFIER'
  }
  return undefined
}

function isValidIpv4(value: string) {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  )
}

function isCreditCardNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

function mapPiiValue(
  value: unknown,
  kind: PrivacyKind,
  mask: (value: string, kind: PrivacyKind) => string
): unknown {
  if (Array.isArray(value)) return value.map((item) => mapPiiValue(item, kind, mask))
  if (typeof value === 'string' || typeof value === 'number') {
    return value === '' ? value : mask(String(value), kind)
  }
  return '[REDACTED]'
}

export class AiPrivacySession {
  private readonly valuesByPlaceholder = new Map<string, string>()
  private readonly placeholdersByValue = new Map<string, string>()

  constructor(
    private readonly scope: string,
    private readonly key: string
  ) {}

  prepareContext<T extends ContextWithMessages>(context: T): T {
    const systemPrompt = (context as { systemPrompt?: unknown }).systemPrompt
    return {
      ...context,
      ...(typeof systemPrompt === 'string' ? { systemPrompt: this.prepareText(systemPrompt) } : {}),
      messages: context.messages.map((message) => this.prepareMessage(message)),
    } as T
  }

  restoreText(value: string) {
    let result = value
    for (const [placeholder, original] of this.valuesByPlaceholder) {
      result = result.split(placeholder).join(original)
    }
    return result
  }

  restoreValue(value: unknown): unknown {
    if (typeof value === 'string') return this.restoreText(value)
    if (Array.isArray(value)) return value.map((item) => this.restoreValue(item))
    if (!isRecord(value)) return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [this.restoreText(key), this.restoreValue(item)])
    )
  }

  restoreAssistantMessage(message: AssistantMessage): AssistantMessage {
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type === 'text') return { ...part, text: this.restoreText(part.text) }
        if (part.type === 'thinking') return { ...part, thinking: this.restoreText(part.thinking) }
        if (part.type === 'toolCall') {
          return { ...part, arguments: this.restoreValue(part.arguments) as typeof part.arguments }
        }
        return part
      }),
    }
  }

  restoreStream(
    source: AssistantMessageEventStream,
    model: Model<Api>
  ): AssistantMessageEventStream {
    const result = createAssistantMessageEventStream()
    const textBuffers = new Map<number, string>()
    const flushText = (contentIndex: number) => {
      const buffered = textBuffers.get(contentIndex) ?? ''
      textBuffers.delete(contentIndex)
      return this.restoreText(buffered)
    }

    void (async () => {
      try {
        for await (const event of source) {
          if (event.type === 'text_delta') {
            const buffer = (textBuffers.get(event.contentIndex) ?? '') + event.delta
            const lastOpen = buffer.lastIndexOf('{{')
            const tailLength = lastOpen >= 0 && buffer.length - lastOpen <= 64 ? lastOpen : -1
            const cut = tailLength >= 0 ? tailLength : Math.max(buffer.length - 64, 0)
            const delta = this.restoreText(buffer.slice(0, cut))
            textBuffers.set(event.contentIndex, buffer.slice(cut))
            result.push({ ...event, delta, partial: this.restoreAssistantMessage(event.partial) })
            continue
          }

          if (event.type === 'text_end') {
            const delta = flushText(event.contentIndex)
            if (delta) {
              result.push({
                type: 'text_delta',
                contentIndex: event.contentIndex,
                delta,
                partial: this.restoreAssistantMessage(event.partial),
              })
            }
            result.push({
              ...event,
              content: this.restoreText(event.content),
              partial: this.restoreAssistantMessage(event.partial),
            })
            continue
          }

          if (event.type === 'toolcall_end') {
            result.push({
              ...event,
              toolCall: {
                ...event.toolCall,
                arguments: this.restoreValue(
                  event.toolCall.arguments
                ) as typeof event.toolCall.arguments,
              },
              partial: this.restoreAssistantMessage(event.partial),
            })
            continue
          }

          if (event.type === 'done') {
            const safeMessage = this.restoreAssistantMessage(event.message)
            for (const contentIndex of textBuffers.keys()) {
              const delta = flushText(contentIndex)
              if (delta) {
                result.push({ type: 'text_delta', contentIndex, delta, partial: safeMessage })
              }
            }
            result.push({ ...event, message: safeMessage })
            continue
          }

          if (event.type === 'error') {
            result.push(event)
            continue
          }

          result.push({ ...event, partial: this.restoreAssistantMessage(event.partial) })
        }
        result.end()
      } catch {
        result.push({
          type: 'error',
          reason: 'error',
          error: {
            role: 'assistant',
            content: [],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'error',
            errorMessage: 'Privacy response processing failed',
            timestamp: Date.now(),
          },
        })
        result.end()
      }
    })()

    return result
  }

  private prepareMessage(value: unknown): unknown {
    return this.prepareValue(value)
  }

  private prepareText(value: string): string {
    const protectedPlaceholders: string[] = []
    let protectedText = value.replace(placeholderPattern, (placeholder) => {
      const index = protectedPlaceholders.push(placeholder) - 1
      return `\u0000${index}\u0000`
    })

    const knownValues = [...this.valuesByPlaceholder].sort(
      ([, left], [, right]) => right.length - left.length
    )
    for (const [placeholder, original] of knownValues) {
      if (!original || (placeholder.startsWith('{{PERSON_') && original.length === 1)) continue
      const tokenIndex = protectedPlaceholders.length
      const token = `\u0000${tokenIndex}\u0000`
      if (placeholder.startsWith('{{PERSON_') && !/\p{Script=Han}/u.test(original)) {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu')
        if (!pattern.test(protectedText)) continue
        pattern.lastIndex = 0
        protectedText = protectedText.replace(pattern, token)
      } else {
        if (!protectedText.includes(original)) continue
        protectedText = protectedText.split(original).join(token)
      }
      protectedPlaceholders.push(placeholder)
    }

    let result = protectedText
      .replace(privateKeyPattern, '[REDACTED]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(credentialPattern, '$1$2[REDACTED]')
      .replace(envCredentialPattern, '=[REDACTED]')
      .replace(commonCredentialPattern, '[REDACTED]')
      .replace(urlCredentialPattern, '$1[REDACTED]@')
      .replace(emailPattern, (email) => this.maskPii(email, 'EMAIL'))
      .replace(phonePattern, (phone) => {
        const digitCount = phone.replace(/\D/g, '').length
        return digitCount >= 10 && digitCount <= 15 ? this.maskPii(phone, 'PHONE') : phone
      })
      .replace(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g, (ip) =>
        isValidIpv4(ip) ? this.maskPii(ip, 'IP_ADDRESS') : ip
      )
      .replace(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, (number) =>
        isCreditCardNumber(number) ? '[REDACTED]' : number
      )

    protectedPlaceholders.forEach((placeholder, index) => {
      result = result.replace(`\u0000${index}\u0000`, placeholder)
    })
    return result
  }

  private prepareValue(value: unknown, key?: string): unknown {
    if (key && isSensitiveKey(key)) return '[REDACTED]'
    if (key) {
      const kind = piiKindForKey(key)
      if (kind) return mapPiiValue(value, kind, (item, itemKind) => this.maskPii(item, itemKind))
    }
    if (typeof value === 'string') {
      if (value.trimStart().startsWith('{') || value.trimStart().startsWith('[')) {
        try {
          const parsed: unknown = JSON.parse(value)
          if (Array.isArray(parsed) || isRecord(parsed))
            return JSON.stringify(this.prepareValue(parsed))
        } catch {
          // Plain text can still contain recognizable values.
        }
      }
      return this.prepareText(value)
    }
    if (Array.isArray(value)) return value.map((item) => this.prepareValue(item))
    if (!isRecord(value)) return value
    if (value.type === 'image') {
      // shortcut: image pixels and unknown prose names are not scanned; add local OCR/NER before claiming that coverage.
      return value
    }
    return Object.fromEntries(
      Object.entries(value).map(([childKey, item]) => [
        this.prepareText(childKey),
        this.prepareValue(item, childKey),
      ])
    )
  }

  private maskPii(value: string, kind: PrivacyKind) {
    const cacheKey = `${kind}\u0000${value}`
    const cached = this.placeholdersByValue.get(cacheKey)
    if (cached) return cached
    const suffix = createHmac('sha256', this.key)
      .update(`${this.scope}\u0000${cacheKey}`)
      .digest('hex')
      .slice(0, 16)
    const placeholder = `{{${kind}_${suffix}}}`
    this.placeholdersByValue.set(cacheKey, placeholder)
    this.valuesByPlaceholder.set(placeholder, value)
    return placeholder
  }
}

export function createAiPrivacySession(scope: string) {
  const now = Date.now()
  for (const [key, entry] of privacySessions) {
    if (now - entry.lastUsedAt > privacySessionTtlMs) privacySessions.delete(key)
  }
  const existing = privacySessions.get(scope)
  if (existing) {
    privacySessions.delete(scope)
    privacySessions.set(scope, { session: existing.session, lastUsedAt: now })
    return existing.session
  }
  if (privacySessions.size >= maxPrivacySessions) {
    const oldestScope = privacySessions.keys().next().value
    if (oldestScope !== undefined) privacySessions.delete(oldestScope)
  }
  const session = new AiPrivacySession(scope, env.get('APP_KEY').release())
  privacySessions.set(scope, { session, lastUsedAt: now })
  return session
}

export function withAiPrivacyBoundary(
  streams: ProviderStreams,
  privacy: AiPrivacySession
): ProviderStreams {
  return {
    stream(model, context, options) {
      return privacy.restoreStream(
        streams.stream(model, privacy.prepareContext(context), options),
        model
      )
    },
    streamSimple(model, context, options) {
      return privacy.restoreStream(
        streams.streamSimple(model, privacy.prepareContext(context), options),
        model
      )
    },
    ...(streams.fetchDeferred
      ? {
          fetchDeferred(model, handle, options) {
            return privacy.restoreStream(streams.fetchDeferred!(model, handle, options), model)
          },
        }
      : {}),
    ...(streams.cancelDeferred
      ? {
          cancelDeferred: (model, handle, options) =>
            streams.cancelDeferred!(model, handle, options),
        }
      : {}),
  }
}
