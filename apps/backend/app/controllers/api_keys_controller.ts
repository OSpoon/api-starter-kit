import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'
import { DateTime } from 'luxon'

import ApiKey from '#models/api_key'
import { createApiKey, resolveExpiresAt, serializeApiKey } from '#services/api_key_service'
import { clampLimit } from '#services/pagination'
import { apiKeyValidator } from '#validators/api_key'

@ApiSecurity('bearerAuth')
export default class ApiKeysController {
  @ApiOperation({
    summary: '获取 API Key 列表',
    description: '返回外部系统接入密钥列表。仅返回 prefix 和元数据，不暴露原始密钥。',
  })
  @ApiResponse({ status: 200, description: 'API Key 列表' })
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(Number(request.input('page', 1)) || 1, 1)
    const paginator = await ApiKey.query()
      .orderBy('created_at', 'desc')
      .paginate(page, clampLimit(request.input('limit'), 20, 100))
    return serialize({
      items: paginator.all().map((key) => serializeApiKey(key)),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({
    summary: '创建 API Key',
    description: '创建外部系统接入密钥。原始密钥只在创建响应中完整返回一次。',
  })
  @ApiResponse({ status: 200, description: '已创建的 API Key 和原始密钥' })
  async store({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(apiKeyValidator)
    const { apiKey, secret } = await createApiKey(payload)

    return serialize({
      ...serializeApiKey(apiKey),
      key: secret,
    })
  }

  @ApiOperation({
    summary: '更新 API Key',
    description: '更新 API Key 的名称和有效期，不会重新生成密钥。',
  })
  @ApiResponse({ status: 200, description: '已更新的 API Key' })
  async update({ params, request, serialize }: HttpContext) {
    const apiKey = await ApiKey.findOrFail(params.id)
    const payload = await request.validateUsing(apiKeyValidator)
    apiKey.name = payload.name
    apiKey.expiresAt = payload.expiresAt
      ? DateTime.fromISO(payload.expiresAt)
      : resolveExpiresAt(payload)
    await apiKey.save()

    return serialize(serializeApiKey(apiKey))
  }

  @ApiOperation({
    summary: '吊销或删除 API Key',
    description: '首次删除会吊销 API Key；对已吊销的 API Key 再次删除会物理删除记录。',
  })
  @ApiResponse({ status: 200, description: '吊销或删除结果' })
  async destroy({ params, serialize }: HttpContext) {
    const apiKey = await ApiKey.findOrFail(params.id)

    if (apiKey.revokedAt) {
      await apiKey.delete()
      return serialize({ id: Number(params.id), deleted: true })
    }

    apiKey.revokedAt = DateTime.now()
    await apiKey.save()

    return serialize(serializeApiKey(apiKey))
  }
}
