import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'

import AiChatMessage from '#models/ai_chat_message'
import { getMineruToken } from '#services/mineru_configuration_service'
import { submitMineruPdf, waitForMineruPdf } from '#services/mineru_pdf_service'

type PdfAttachment = {
  message_id: number
  pdf_data: Buffer | null
  batch_id: string | null
  batch_token: string | null
  markdown: string | null
  failed: boolean
}

const pdfTable = 'ai_chat_pdf_attachments'

export async function createAiChatPdfMessage(
  conversationId: number,
  content: string,
  name: string,
  pdf: Buffer
) {
  return db.transaction(async (trx) => {
    const message = await AiChatMessage.create(
      { conversationId, role: 'user', content, pdfName: name },
      { client: trx }
    )
    await trx.table(pdfTable).insert({ message_id: message.id, pdf_data: pdf })
    return message
  })
}

export function listAiChatPdfAttachments(conversationId: number, userId: number) {
  return db
    .from('ai_chat_messages as m')
    .innerJoin('ai_chat_conversations as c', 'c.id', 'm.conversation_id')
    .where('c.id', conversationId)
    .where('c.user_id', userId)
    .whereNotNull('m.pdf_name')
    .orderBy('m.id', 'desc')
    .limit(10)
    .select('m.id as attachmentId', 'm.pdf_name as name')
}

function ownedPdf(conversationId: number, userId: number, attachmentId: number) {
  return db
    .from(pdfTable)
    .where('message_id', attachmentId)
    .whereExists(
      db
        .from('ai_chat_messages as m')
        .innerJoin('ai_chat_conversations as c', 'c.id', 'm.conversation_id')
        .where('m.id', attachmentId)
        .where('c.id', conversationId)
        .where('c.user_id', userId)
    )
}

export async function readAiChatPdf(
  input: { conversationId: number; userId: number; signal?: AbortSignal },
  attachmentId: number,
  offset: number
) {
  const signal = input.signal ?? new AbortController().signal
  const query = () => ownedPdf(input.conversationId, input.userId, attachmentId)
  const attachment = await db.transaction(async (trx) => {
    const row: PdfAttachment | undefined = await query().useTransaction(trx).forUpdate().first()
    if (!row) throw new Error('当前会话中没有此 PDF 附件')
    if (row.markdown || row.failed || row.batch_id) return row
    const token = await getMineruToken()
    if (!token) throw new Error('PDF 解析服务未配置')
    if (!row.pdf_data) throw new Error('PDF 附件无法读取')
    row.batch_id = await submitMineruPdf(token, attachmentId, row.pdf_data, signal)
    row.batch_token = encryption.encrypt(token)
    await query()
      .useTransaction(trx)
      .update({ batch_id: row.batch_id, batch_token: row.batch_token, pdf_data: null })
    return row
  })
  signal.throwIfAborted()
  let markdown = attachment.markdown
  if (attachment.failed) return { state: 'failed' as const }
  if (markdown === null && attachment.batch_id) {
    const token = attachment.batch_token
      ? encryption.decrypt<string>(attachment.batch_token)
      : await getMineruToken()
    if (!token) throw new Error('PDF 解析服务未配置')
    const result = await waitForMineruPdf(token, attachmentId, attachment.batch_id, signal)
    if (result.state === 'pending') return result
    if (result.state === 'failed') {
      await query().update({ failed: true, batch_token: null })
      return result
    }
    markdown = result.markdown
    await query().update({ markdown, batch_token: null })
  }
  if (!markdown) throw new Error('PDF 解析结果无法读取')
  const end = Math.min(markdown.length, offset + 6000)
  return {
    state: 'ready' as const,
    markdown: markdown.slice(offset, end),
    nextOffset: end < markdown.length ? end : null,
  }
}
