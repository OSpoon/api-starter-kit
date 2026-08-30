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
    feishuAppId: vine.string().trim().maxLength(160).optional().nullable(),
    feishuAppSecret: vine.string().trim().maxLength(500).optional().nullable(),
    feishuDomain: vine.string().trim().maxLength(80).optional().nullable(),
    dingtalkClientId: vine.string().trim().maxLength(160).optional().nullable(),
    dingtalkClientSecret: vine.string().trim().maxLength(500).optional().nullable(),
    dingtalkCardTemplateId: vine.string().trim().maxLength(200).optional().nullable(),
    dingtalkStreamingCardTemplateId: vine.string().trim().maxLength(200).optional().nullable(),
  })
)
