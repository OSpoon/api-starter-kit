import vine from '@vinejs/vine'

export const updateLlmConfigurationValidator = vine.compile(
  vine.object({
    chatApiKey: vine.string().trim().maxLength(500).optional().nullable(),
    chatBaseUrl: vine
      .string()
      .trim()
      .url({ require_tld: false })
      .maxLength(500)
      .optional()
      .nullable(),
    chatModel: vine.string().trim().minLength(1).maxLength(160),
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
    wecomBotId: vine.string().trim().maxLength(160).optional().nullable(),
    wecomBotSecret: vine.string().trim().maxLength(500).optional().nullable(),
    wecomBotTenantId: vine.string().trim().maxLength(160).optional().nullable(),
    wecomBotWsUrl: vine
      .string()
      .trim()
      .url({ require_tld: false })
      .maxLength(500)
      .optional()
      .nullable(),
  })
)
