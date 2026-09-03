import vine from '@vinejs/vine'

export const updateImConfigurationValidator = vine.compile(
  vine.object({
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
