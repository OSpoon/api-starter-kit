import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import KnowledgeDocument from '#models/knowledge_document'
import Role from '#models/role'
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

function parseRoleIds(value: unknown) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed) || parsed.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('角色选择无效')
  }
  return parsed as number[]
}

async function validateRoleIds(roleIds: number[]) {
  const roles = await Role.query().whereIn('id', roleIds)
  if (roles.length !== roleIds.length) throw new Error('包含不存在的角色')
  return roleIds
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
  @ApiOperation({ summary: '获取知识文档列表' })
  @ApiResponse({ status: 200, description: '知识文档分页列表' })
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(Number(request.input('page', 1)) || 1, 1)
    const paginator = await KnowledgeDocument.query()
      .preload('roles')
      .withCount('chunks')
      .orderBy('updated_at', 'desc')
      .paginate(page, clampLimit(request.input('limit'), 20, 100))
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
        roleIds: await validateRoleIds(parseRoleIds(request.input('roleIds', '[]'))),
      })
      const document = await createKnowledgeDocument(payload)
      await recordAuditEvent(ctx, {
        actorUserId: auth.getUserOrFail().id,
        action: 'knowledge_document.created',
        targetType: 'knowledge_document',
        targetId: document.id,
        metadata: {
          title: document.title,
          roleIds: payload.roleIds ?? [],
        },
      })
      return serialize(serializeKnowledgeDocument(document))
    } catch (error) {
      if (
        error instanceof Error &&
        /角色选择|不存在的角色|上传|文本文件|主题|元数据/.test(error.message)
      ) {
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
      const roleIds = await validateRoleIds(parseRoleIds(request.input('roleIds', '[]')))
      const created: KnowledgeDocument[] = []
      const failed: Array<{ fileName: string; message: string }> = []

      for (const textFile of textFiles) {
        try {
          created.push(
            await createKnowledgeDocument({
              title: textFile.title,
              content: textFile.content,
              roleIds,
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
            roleIds,
            batch: true,
          },
        })
      }

      const documents = await KnowledgeDocument.query()
        .whereIn(
          'id',
          created.map((document) => document.id)
        )
        .preload('roles')
        .withCount('chunks')
        .orderBy('created_at', 'asc')

      return serialize({
        items: documents.map(serializeKnowledgeDocument),
        failed,
      })
    } catch (error) {
      if (error instanceof Error && /角色选择|不存在的角色|上传|文件|纯文本/.test(error.message)) {
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
    await document.load('roles')
    const textFile = await readTextFile(ctx, false)
    try {
      const previousRoleIds = document.roles.map((role) => role.id).sort((a, b) => a - b)
      const payload = await knowledgeDocumentValidator.validate({
        title: textFile?.title ?? document.title,
        content: textFile?.content ?? document.content,
        summary: request.input('summary') || null,
        topics: parseTopics(request.input('topics', '[]')),
        roleIds: await validateRoleIds(parseRoleIds(request.input('roleIds', '[]'))),
      })
      const shouldReindex =
        document.title !== payload.title ||
        document.content !== payload.content ||
        document.summary !== (payload.summary ?? null) ||
        JSON.stringify(document.topics ?? []) !== JSON.stringify(payload.topics ?? [])
      const nextRoleIds = [...(payload.roleIds ?? [])].sort((a, b) => a - b)
      const changedFields = [
        document.title !== payload.title ? 'title' : null,
        document.content !== payload.content ? 'content' : null,
        document.summary !== (payload.summary ?? null) ? 'summary' : null,
        JSON.stringify(document.topics ?? []) !== JSON.stringify(payload.topics ?? [])
          ? 'topics'
          : null,
        JSON.stringify(previousRoleIds) !== JSON.stringify(nextRoleIds) ? 'roles' : null,
      ].filter((field): field is string => field !== null)
      document.merge({
        title: payload.title,
        content: payload.content,
        summary: payload.summary ?? null,
        topics: payload.topics ?? [],
      })
      if (shouldReindex) {
        await indexKnowledgeDocument(document)
      } else {
        await document.save()
      }
      await document.related('roles').sync(payload.roleIds ?? [])
      await document.load('roles')
      await recordAuditEvent(ctx, {
        actorUserId: auth.getUserOrFail().id,
        action: 'knowledge_document.updated',
        targetType: 'knowledge_document',
        targetId: document.id,
        metadata: {
          title: document.title,
          changedFields,
          reindexed: shouldReindex,
          roleIds: nextRoleIds,
        },
      })
      return serialize(serializeKnowledgeDocument(document))
    } catch (error) {
      if (error instanceof Error && /角色选择|不存在的角色|上传|文本文件/.test(error.message)) {
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
      .preload('roles')
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
