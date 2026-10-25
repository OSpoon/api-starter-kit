import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import KnowledgeDocument from '#models/knowledge_document'
import { recordAuditEvent } from '#services/audit_log'
import { suggestKnowledgeMetadata } from '#services/knowledge_metadata_service'
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  indexKnowledgeDocument,
} from '#services/knowledge_service'
import { clampLimit } from '#support/pagination'
import { serializeKnowledgeDocument } from '#transformers/knowledge_document_transformer'
import {
  knowledgeDocumentValidator,
  knowledgeMetadataPreviewValidator,
} from '#validators/knowledge_document'
import { paginationSearchQueryValidator } from '#validators/pagination'

function parseEnabled(value: unknown, defaultValue: boolean) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw new Error('启用状态无效')
}

async function readTextFile(ctx: HttpContext, required: boolean) {
  const file = ctx.request.file('file', {
    size: '5mb',
    extnames: ['txt', 'md', 'markdown', 'rst'],
  })
  if (!file && !required) return null
  if (!file || !file.isValid || !file.tmpPath) {
    throw new Error('请上传不超过 5MB 的 UTF-8 纯文本文件')
  }
  const rawContent = await readFile(file.tmpPath, 'utf8')
  const content = rawContent.replace(/^\uFEFF/, '').trim()
  if (!content || content.includes('\0')) throw new Error('文本文件内容无效')
  return { title: path.parse(file.clientName).name.slice(0, 200), content }
}

function parseTopics(value: unknown) {
  if (value === undefined || value === null || value === '') return []
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) throw new Error('可检索主题格式无效')
  return parsed
}

async function readTextFiles(ctx: HttpContext) {
  const files = ctx.request.files('files', {
    size: '5mb',
    extnames: ['txt', 'md', 'markdown', 'rst'],
  })
  if (!files.length) throw new Error('请至少上传一份纯文本文件')
  if (files.length > 20) throw new Error('一次最多上传 20 份纯文本文件')

  return Promise.all(
    files.map(async (file) => {
      if (!file.isValid || !file.tmpPath) {
        throw new Error(`文件「${file.clientName}」无效，请上传不超过 5MB 的 UTF-8 纯文本文件`)
      }
      const rawContent = await readFile(file.tmpPath, 'utf8')
      const content = rawContent.replace(/^\uFEFF/, '').trim()
      if (!content || content.includes('\0')) {
        throw new Error(`文件「${file.clientName}」内容无效`)
      }
      return { title: path.parse(file.clientName).name.slice(0, 200), content }
    })
  )
}

@ApiSecurity('bearerAuth')
export default class KnowledgeDocumentsController {
  @ApiOperation({
    summary: '获取知识文档列表',
    description: '返回知识文档分页列表，支持按标题、摘要或正文搜索。',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码，从 1 开始',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页数量，默认 20，最大 100',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: '搜索文档标题、摘要或正文；去除首尾空格，空值不过滤，最多 200 个字符',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiResponse({ status: 200, description: '知识文档分页列表' })
  async index({ request, serialize }: HttpContext) {
    const payload = await paginationSearchQueryValidator.validate(request.qs())
    const search = payload.search ?? ''
    const query = KnowledgeDocument.query().withCount('chunks').orderBy('updated_at', 'desc')
    if (search) {
      query.where((builder) => {
        builder
          .whereILike('title', `%${search}%`)
          .orWhereILike('summary', `%${search}%`)
          .orWhereILike('content', `%${search}%`)
      })
    }
    const paginator = await query.paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))
    return serialize({
      items: paginator.all().map(serializeKnowledgeDocument),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({ summary: '生成知识文档目录元数据建议' })
  @ApiResponse({ status: 200, description: 'LLM 提取的待确认元数据建议' })
  async metadataPreview(ctx: HttpContext) {
    const { response, serialize } = ctx
    const textFile = await readTextFile(ctx, true)
    const payload = await knowledgeMetadataPreviewValidator.validate({
      title: textFile!.title,
      content: textFile!.content,
    })
    try {
      return serialize(await suggestKnowledgeMetadata(payload))
    } catch (error) {
      return response.unprocessableEntity({
        message: error instanceof Error ? error.message : '知识文档元数据提取失败',
      })
    }
  }

  @ApiOperation({ summary: '创建并索引知识文档' })
  @ApiResponse({ status: 200, description: '已创建的知识文档' })
  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const textFile = await readTextFile(ctx, true)
    try {
      const payload = await knowledgeDocumentValidator.validate({
        title: textFile!.title,
        content: textFile!.content,
        summary: request.input('summary') || null,
        topics: parseTopics(request.input('topics', '[]')),
        enabled: parseEnabled(request.input('enabled'), true),
      })
      const document = await createKnowledgeDocument(payload)
      await recordAuditEvent(ctx, {
        actorUserId: auth.getUserOrFail().id,
        action: 'knowledge_document.created',
        targetType: 'knowledge_document',
        targetId: document.id,
        metadata: {
          title: document.title,
          enabled: document.enabled,
        },
      })
      return serialize(serializeKnowledgeDocument(document))
    } catch (error) {
      if (error instanceof Error && /启用状态|上传|文本文件|主题|元数据/.test(error.message)) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '批量创建并索引知识文档' })
  @ApiResponse({ status: 200, description: '批量创建结果，包含成功和失败文件' })
  async storeBatch(ctx: HttpContext) {
    const { request, response, serialize } = ctx
    try {
      const textFiles = await readTextFiles(ctx)
      const actorUserId = ctx.auth.getUserOrFail().id
      const enabled = parseEnabled(request.input('enabled'), true)
      const created: KnowledgeDocument[] = []
      const failed: Array<{ fileName: string; message: string }> = []

      for (const textFile of textFiles) {
        try {
          created.push(
            await createKnowledgeDocument({
              title: textFile.title,
              content: textFile.content,
              enabled,
            })
          )
        } catch (error) {
          failed.push({
            fileName: `${textFile.title}`,
            message: error instanceof Error ? error.message : '文件处理失败',
          })
        }
      }

      if (!created.length) {
        return response.unprocessableEntity({
          message: failed.map((item) => `${item.fileName}: ${item.message}`).join('；'),
        })
      }

      for (const document of created) {
        await recordAuditEvent(ctx, {
          actorUserId,
          action: 'knowledge_document.created',
          targetType: 'knowledge_document',
          targetId: document.id,
          metadata: {
            title: document.title,
            enabled: document.enabled,
            batch: true,
          },
        })
      }

      const documents = await KnowledgeDocument.query()
        .whereIn(
          'id',
          created.map((document) => document.id)
        )
        .withCount('chunks')
        .orderBy('created_at', 'asc')

      return serialize({
        items: documents.map(serializeKnowledgeDocument),
        failed,
      })
    } catch (error) {
      if (error instanceof Error && /启用状态|上传|文件|纯文本/.test(error.message)) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '更新并重新索引知识文档' })
  @ApiResponse({ status: 200, description: '已更新的知识文档' })
  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const document = await KnowledgeDocument.findOrFail(params.id)
    const textFile = await readTextFile(ctx, false)
    try {
      const payload = await knowledgeDocumentValidator.validate({
        title: textFile?.title ?? document.title,
        content: textFile?.content ?? document.content,
        summary: request.input('summary') || null,
        topics: parseTopics(request.input('topics', JSON.stringify(document.topics ?? []))),
        enabled: parseEnabled(request.input('enabled'), document.enabled),
      })
      const shouldReindex =
        document.title !== payload.title ||
        document.content !== payload.content ||
        document.summary !== (payload.summary ?? null) ||
        JSON.stringify(document.topics ?? []) !== JSON.stringify(payload.topics ?? [])
      const changedFields = [
        document.title !== payload.title ? 'title' : null,
        document.content !== payload.content ? 'content' : null,
        document.summary !== (payload.summary ?? null) ? 'summary' : null,
        JSON.stringify(document.topics ?? []) !== JSON.stringify(payload.topics ?? [])
          ? 'topics'
          : null,
        document.enabled !== (payload.enabled ?? document.enabled) ? 'enabled' : null,
      ].filter((field): field is string => field !== null)
      document.merge({
        title: payload.title,
        content: payload.content,
        summary: payload.summary ?? null,
        topics: payload.topics ?? [],
        enabled: payload.enabled ?? document.enabled,
      })
      if (shouldReindex) {
        await indexKnowledgeDocument(document)
      } else {
        await document.save()
      }
      await recordAuditEvent(ctx, {
        actorUserId: auth.getUserOrFail().id,
        action: 'knowledge_document.updated',
        targetType: 'knowledge_document',
        targetId: document.id,
        metadata: {
          title: document.title,
          changedFields,
          reindexed: shouldReindex,
          enabled: document.enabled,
        },
      })
      return serialize(serializeKnowledgeDocument(document))
    } catch (error) {
      if (error instanceof Error && /启用状态|上传|文本文件/.test(error.message)) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '使用当前内容重建知识文档向量索引' })
  @ApiResponse({ status: 200, description: '已重新索引的知识文档' })
  async reindex(ctx: HttpContext) {
    const { auth, params, serialize } = ctx
    const document = await KnowledgeDocument.findOrFail(params.id)
    await indexKnowledgeDocument(document)
    const indexedDocument = await KnowledgeDocument.query()
      .where('id', document.id)
      .withCount('chunks')
      .firstOrFail()
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'knowledge_document.reindexed',
      targetType: 'knowledge_document',
      targetId: document.id,
      metadata: { title: document.title },
    })
    return serialize(serializeKnowledgeDocument(indexedDocument))
  }

  @ApiOperation({ summary: '删除知识文档' })
  @ApiResponse({ status: 200, description: '已删除的知识文档 ID' })
  async destroy(ctx: HttpContext) {
    const { auth, params, serialize } = ctx
    const document = await KnowledgeDocument.findOrFail(params.id)
    const title = document.title
    await deleteKnowledgeDocument(document)
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'knowledge_document.deleted',
      targetType: 'knowledge_document',
      targetId: document.id,
      metadata: { title },
    })
    return serialize({ id: document.id, deleted: true })
  }
}
