import vine from '@vinejs/vine'

export const createConversationValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(160).optional(),
  })
)

export const sendAiChatMessageValidator = vine.compile(
  vine.object({
    content: vine.string().trim().minLength(1).maxLength(8000),
    context: vine
      .object({
        route: vine.string().trim().maxLength(200),
        title: vine.string().trim().maxLength(160),
        actions: vine
          .array(
            vine.object({
              id: vine.string().trim().maxLength(80),
              label: vine.string().trim().maxLength(80),
              description: vine.string().trim().maxLength(200),
            })
          )
          .maxLength(20)
          .optional(),
        items: vine
          .array(
            vine.object({
              label: vine.string().trim().maxLength(80),
              value: vine.string().trim().maxLength(500),
            })
          )
          .maxLength(20)
          .optional(),
      })
      .optional(),
  })
)
