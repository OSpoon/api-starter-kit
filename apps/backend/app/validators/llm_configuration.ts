import vine from '@vinejs/vine'

const validChatModelLimits = vine.createRule((value: unknown, _options, field) => {
  if (!value || typeof value !== 'object') return
  const limits = value as { chatContextWindow?: unknown; chatMaxTokens?: unknown }
  if (
    typeof limits.chatContextWindow === 'number' &&
    typeof limits.chatMaxTokens === 'number' &&
    limits.chatMaxTokens >= limits.chatContextWindow
  ) {
    field.report('最大输出必须小于上下文上限', 'llm_configuration.invalid_chat_limits', field)
  }
})

export const updateLlmConfigurationValidator = vine.compile(
  vine
    .object({
      chatApiKey: vine.string().trim().maxLength(500).optional().nullable(),
      chatBaseUrl: vine
        .string()
        .trim()
        .url({ require_tld: false })
        .maxLength(500)
        .optional()
        .nullable(),
      chatModel: vine.string().trim().minLength(1).maxLength(160),
      chatContextWindow: vine.number().decimal(0).min(1024).max(2_000_000),
      chatMaxTokens: vine.number().decimal(0).min(1).max(1_000_000),
      asrApiKey: vine.string().trim().maxLength(500).optional().nullable(),
      asrBaseUrl: vine
        .string()
        .trim()
        .url({ require_tld: false })
        .maxLength(500)
        .optional()
        .nullable(),
      asrModel: vine.string().trim().minLength(1).maxLength(160),
      embeddingApiKey: vine.string().trim().maxLength(500).optional().nullable(),
      embeddingBaseUrl: vine
        .string()
        .trim()
        .url({ require_tld: false })
        .maxLength(500)
        .optional()
        .nullable(),
      embeddingModel: vine.string().trim().maxLength(160).optional().nullable(),
      embeddingDimensions: vine.number().positive().max(8192),
      requestTimeoutMs: vine.number().min(5000).max(300000),
    })
    .use(validChatModelLimits())
)
