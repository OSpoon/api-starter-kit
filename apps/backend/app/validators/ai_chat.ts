import vine from '@vinejs/vine'

export const createConversationValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(160).optional(),
  })
)

export const sendAiChatMessageValidator = vine.compile(
  vine.object({
    content: vine.string().trim().minLength(1).maxLength(8000),
    regenerateAssistantMessageId: vine.number().positive().optional(),
    context: vine
      .object({
        route: vine.string().trim().maxLength(200),
        title: vine.string().trim().maxLength(160),
      })
      .optional(),
  })
)

export const queueAiChatMessageValidator = vine.compile(
  vine.object({
    content: vine.string().trim().minLength(1).maxLength(8000),
  })
)
