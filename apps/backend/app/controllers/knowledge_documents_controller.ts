import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import KnowledgeDocument from '#models/knowledge_document'
import Role from '#models/role'
import { createKnowledgeDocument, indexKnowledgeDocument } from '#services/knowledge_service'
import { clampLimit } from '#services/pagination'
import { serializeKnowledgeDocument } from '#transformers/knowledge_document_transformer'

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
    size: '2mb',
    extnames: ['txt', 'md', 'markdown', 'rst'],
  })
  if (!file && !required) return null
  if (!file || !file.isValid || !file.tmpPath) {
    throw new Error('请上传不超过 2MB 的 UTF-8 纯文本文件')
  }
  const rawContent = await readFile(file.tmpPath, 'utf8')
  const content = rawContent.replace(/^\uFEFF/, '').trim()
  if (!content || content.includes('\0')) throw new Error('文本文件内容无效')
  return { title: path.parse(file.clientName).name.slice(0, 200), content }
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

  @ApiOperation({ summary: '创建并索引知识文档' })
  @ApiResponse({ status: 200, description: '已创建的知识文档' })
  async store(ctx: HttpContext) {
    const { request, response, serialize } = ctx
    const textFile = await readTextFile(ctx, true)
    try {
      const document = await createKnowledgeDocument({
        title: textFile!.title,
        content: textFile!.content,
        roleIds: await validateRoleIds(parseRoleIds(request.input('roleIds', '[]'))),
      })
      return serialize(serializeKnowledgeDocument(document))
    } catch (error) {
      if (error instanceof Error && /角色选择|不存在的角色|上传|文本文件/.test(error.message)) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '更新并重新索引知识文档' })
  @ApiResponse({ status: 200, description: '已更新的知识文档' })
  async update(ctx: HttpContext) {
    const { params, request, response, serialize } = ctx
    const document = await KnowledgeDocument.findOrFail(params.id)
    const textFile = await readTextFile(ctx, false)
    try {
      const roleIds = await validateRoleIds(parseRoleIds(request.input('roleIds', '[]')))
      if (textFile) {
        document.title = textFile.title
        document.content = textFile.content
        await indexKnowledgeDocument(document)
      } else {
        await document.save()
      }
      await document.related('roles').sync(roleIds)
      await document.load('roles')
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
  async reindex({ params, serialize }: HttpContext) {
    const document = await KnowledgeDocument.findOrFail(params.id)
    await indexKnowledgeDocument(document)
    const indexedDocument = await KnowledgeDocument.query()
      .where('id', document.id)
      .preload('roles')
      .withCount('chunks')
      .firstOrFail()
    return serialize(serializeKnowledgeDocument(indexedDocument))
  }

  @ApiOperation({ summary: '删除知识文档' })
  @ApiResponse({ status: 200, description: '已删除的知识文档 ID' })
  async destroy({ params, serialize }: HttpContext) {
    const document = await KnowledgeDocument.findOrFail(params.id)
    await document.delete()
    return serialize({ id: document.id, deleted: true })
  }
}
