import vine from '@vinejs/vine'

const auditLogSource = vine
  .string()
  .trim()
  .maxLength(200)
  .regex(
    /^(?:http|api_key|ai_agent|channel|wecom|feishu|dingtalk|test|system|legacy)(?:,(?:http|api_key|ai_agent|channel|wecom|feishu|dingtalk|test|system|legacy))*$/
  )
  .optional()

const auditLogOutcome = vine
  .string()
  .trim()
  .maxLength(200)
  .regex(
    /^(?:success|unknown|denied|failure|attempted|expired|cancelled)(?:,(?:success|unknown|denied|failure|attempted|expired|cancelled))*$/
  )
  .optional()

const auditLogActorType = vine
  .string()
  .trim()
  .maxLength(120)
  .regex(
    /^(?:user|api_key|system|anonymous|unknown)(?:,(?:user|api_key|system|anonymous|unknown))*$/
  )
  .optional()

export const auditLogsQueryValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    limit: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    search: vine.string().trim().maxLength(200).optional(),
    source: auditLogSource,
    outcome: auditLogOutcome,
    actorType: auditLogActorType,
  })
)
