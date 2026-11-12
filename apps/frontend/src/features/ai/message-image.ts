import { getAiChatMessageImage } from './api'
import type { DisplayAiChatMessage } from './types'

export async function getAiChatMessageImageDataUrl(
  message: Pick<DisplayAiChatMessage, 'id' | 'conversationId' | 'image' | 'localImageFile'>,
  token: string | null
) {
  let image: Blob | undefined = message.localImageFile

  if (!image && message.image) {
    const conversationId = Number(message.conversationId)
    const messageId = Number(message.id)
    if (
      !Number.isSafeInteger(conversationId) ||
      conversationId < 1 ||
      !Number.isSafeInteger(messageId) ||
      messageId < 1
    ) {
      throw new Error('Image attachment is unavailable')
    }
    image = await getAiChatMessageImage(token, conversationId, messageId)
  }

  if (!image) return undefined

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Image attachment could not be read'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Image attachment could not be read'))
    reader.readAsDataURL(image)
  })
}
