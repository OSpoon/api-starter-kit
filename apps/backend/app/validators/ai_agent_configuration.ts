import '@adonisjs/core/providers/vinejs_provider'

import vine from '@vinejs/vine'

import { builtInAiAgentToolNames } from '#ai/core/ai_agent_tool_catalog'

export const updateAiAgentConfigurationValidator = vine.compile(
  vine.object({
    tools: vine
      .array(
        vine.object({
          code: vine.enum(builtInAiAgentToolNames),
          enabled: vine.boolean(),
          mode: vine.enum(['direct', 'confirm'] as const),
        })
      )
      .minLength(builtInAiAgentToolNames.length - 1)
      .maxLength(builtInAiAgentToolNames.length),
  })
)

const validMcpHttpUrl = vine.createRule((value: unknown, _options, field) => {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    const authority = url.href.slice(url.protocol.length + 2).split(/[/?#]/, 1)[0]
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash ||
      value.includes('#') ||
      authority.includes('@')
    ) {
      field.report('MCP HTTP URL 无效', 'invalidMcpHttpUrl', field)
    }
  } catch {
    field.report('MCP HTTP URL 无效', 'invalidMcpHttpUrl', field)
  }
})

const validMcpHeaders = vine.createRule((value: unknown, _options, field) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const headers = Object.entries(value)
  const seen = new Set<string>()
  if (
    JSON.stringify(value).length > 200_000 ||
    headers.some(([name]) => {
      const normalizedName = name.toLowerCase()
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || seen.has(normalizedName)) return true
      seen.add(normalizedName)
      return false
    })
  ) {
    field.report('MCP 请求头配置无效', 'invalidMcpHeaders', field)
  }
})

const validMcpEnvironment = vine.createRule((value: unknown, _options, field) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  if (JSON.stringify(value).length > 200_000) {
    field.report('MCP 环境变量配置过大', 'mcpEnvironmentTooLarge', field)
  }
})

const mcpHeaders = vine
  .record(
    vine
      .string()
      .maxLength(10_000)
      .regex(/^[^\0\r\n]*$/)
  )
  .maxLength(50)
  .use(validMcpHeaders())

const mcpMessageBytes = () =>
  vine
    .number()
    .withoutDecimals()
    .min(1)
    .max(64 * 1024 * 1024)
    .optional()
const mcpReconnectConfiguration = vine.object({
  initialDelayMs: vine.number().withoutDecimals().min(0).max(30_000).optional(),
  maxDelayMs: vine.number().withoutDecimals().min(0).max(120_000).optional(),
  maxRetries: vine.number().withoutDecimals().min(0).max(20).optional(),
})

const stdioMcpServerConfiguration = vine.object({
  type: vine.enum(['stdio'] as const).optional(),
  command: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(2000)
    .regex(/^(?:\/.+|[A-Za-z0-9][A-Za-z0-9._+-]*)$/),
  args: vine
    .array(
      vine
        .string()
        .maxLength(4000)
        .regex(/^[^\0]*$/)
    )
    .maxLength(100)
    .optional(),
  cwd: vine
    .string()
    .trim()
    .maxLength(2000)
    .regex(/^\/.*$/)
    .optional()
    .nullable(),
  env: vine
    .record(
      vine
        .string()
        .maxLength(4000)
        .regex(/^[^\0]*$/)
    )
    .maxLength(100)
    .validateKeys((keys, field) => {
      if (!keys.every((key) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key))) {
        field.report('MCP 环境变量名称无效', 'invalidEnvironmentKeys', field)
      }
    })
    .use(validMcpEnvironment())
    .optional(),
  inheritEnv: vine.boolean().optional(),
  stderr: vine.enum(['pipe', 'inherit'] as const).optional(),
  maxMessageBytes: mcpMessageBytes(),
  maxStderrBytes: vine
    .number()
    .withoutDecimals()
    .min(1)
    .max(1024 * 1024)
    .optional(),
  closeTimeoutMs: vine.number().withoutDecimals().min(0).max(60_000).optional(),
})

const httpMcpServerConfiguration = vine.object({
  type: vine.enum(['http'] as const),
  url: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(2048)
    .url({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
    .use(validMcpHttpUrl()),
  headers: mcpHeaders.optional(),
  openGetStream: vine.boolean().optional(),
  maxMessageBytes: mcpMessageBytes(),
  reconnect: mcpReconnectConfiguration.optional(),
})

const mcpServerConfiguration = vine.union([
  vine.union.if((value) => value.type === 'http', httpMcpServerConfiguration),
  vine.union.else(stdioMcpServerConfiguration),
])

export const updateAiAgentMcpConfigurationValidator = vine.compile(
  vine.object({
    mcpServers: vine
      .record(mcpServerConfiguration)
      .maxLength(100)
      .validateKeys((keys, field) => {
        if (
          !keys.every((key) => key.trim().length > 0 && key.length <= 128 && !/[\\/\0]/.test(key))
        ) {
          field.report('MCP 服务名称无效', 'invalidServerNames', field)
        }
      }),
  })
)

export const updateAiAgentMcpServerValidator = vine.compile(
  vine.object({ enabled: vine.boolean() })
)

export const aiAgentMcpServerIdValidator = vine.compile(
  vine.object({
    id: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(64)
      .regex(/^[^/\\\0]+$/),
  })
)

export const updateMineruTokenValidator = vine.compile(
  vine.object({
    token: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(1024)
      .regex(/^[!-~]+$/)
      .nullable()
      .optional(),
    enable: vine.boolean().optional(),
  })
)

export const installAiAgentSkillsValidator = vine.compile(
  vine.object({
    source: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(2048)
      .regex(
        /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:@[A-Za-z0-9._/-]+)?|git@[A-Za-z0-9.-]+:[^\s]+\.git|https:\/\/\S+|ssh:\/\/(?:git@)?\S+\.git)$/i
      ),
  })
)

export const installAiAgentSkillZipValidator = vine.compile(
  vine.object({ file: vine.file({ size: '10mb', extnames: ['zip'] }) })
)

export const updateAiAgentSkillValidator = vine.compile(vine.object({ enabled: vine.boolean() }))

export const aiAgentSkillCodeValidator = vine.compile(
  vine.object({
    code: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(128)
      .regex(/^(?!\.{1,2}$)[^/\\\0]+$/),
  })
)
