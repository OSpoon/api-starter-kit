export const MAX_AI_CHAT_IMAGE_BYTES = 2 * 1024 * 1024

export class AiChatImageValidationError extends Error {
  constructor(readonly code: 'too_large' | 'invalid_format') {
    super(
      code === 'too_large' ? 'AI chat image exceeds the size limit' : 'Unsupported AI chat image'
    )
    this.name = 'AiChatImageValidationError'
  }
}

export function getAiChatImageMimeType(data: Buffer) {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return undefined
}

export function validateAiChatImage(data: Buffer) {
  if (data.length > MAX_AI_CHAT_IMAGE_BYTES) {
    throw new AiChatImageValidationError('too_large')
  }
  const mimeType = getAiChatImageMimeType(data)
  if (!mimeType) throw new AiChatImageValidationError('invalid_format')
  return mimeType
}

export async function readAiChatImageStream(stream: AsyncIterable<Uint8Array> | null) {
  if (!stream) throw new Error('Image download returned no body')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.byteLength
    if (size > MAX_AI_CHAT_IMAGE_BYTES) {
      throw new AiChatImageValidationError('too_large')
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks, size)
}

export function getAiChatImageValidationMessage(error: unknown) {
  if (!(error instanceof AiChatImageValidationError)) return null
  return error.code === 'too_large'
    ? '图片不能超过 2 MB，请压缩后重试。'
    : '图片格式无效，请使用 JPEG、PNG 或 WebP 图片。'
}
