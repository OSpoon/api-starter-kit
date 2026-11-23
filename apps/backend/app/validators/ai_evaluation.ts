import vine from '@vinejs/vine'

export const aiEvaluationListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).decimal(0).optional(),
    limit: vine.number().min(1).max(100).decimal(0).optional(),
    name: vine.string().trim().maxLength(200).optional(),
    question: vine.string().trim().maxLength(200).optional(),
    source: vine.enum(['chat', 'manual'] as const).optional(),
  })
)

export const aiEvaluationCaseValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200),
    question: vine.string().trim().minLength(1).maxLength(5_000),
    referenceAnswer: vine.string().trim().minLength(1).maxLength(8_000),
    sourceConversationId: vine.number().withoutDecimals().positive().optional().nullable(),
    expectedTools: vine
      .array(vine.string().trim().minLength(1).maxLength(100))
      .maxLength(20)
      .optional(),
    expectedToolSequence: vine
      .array(vine.string().trim().minLength(1).maxLength(100))
      .maxLength(20)
      .optional(),
    requiredTerms: vine
      .array(vine.string().trim().minLength(1).maxLength(100))
      .maxLength(20)
      .optional(),
    forbiddenTerms: vine
      .array(vine.string().trim().minLength(1).maxLength(100))
      .maxLength(20)
      .optional(),
    mockToolOutputs: vine.record(vine.any()).maxLength(10).optional(),
  })
)

export const aiEvaluationRunListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).decimal(0).optional(),
    limit: vine.number().min(1).max(100).decimal(0).optional(),
  })
)

export const aiEvaluationConversationImportValidator = vine.compile(
  vine.object({
    conversationId: vine.number().withoutDecimals().positive(),
    messageIds: vine.array(vine.number().withoutDecimals().positive()).minLength(2).maxLength(100),
  })
)

export const aiEvaluationRunValidator = vine.compile(
  vine.object({
    caseIds: vine.array(vine.number().withoutDecimals().positive()).maxLength(100).optional(),
  })
)
