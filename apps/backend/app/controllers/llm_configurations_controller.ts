import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'
import OpenAI from 'openai'

import { recordAuditEvent } from '#services/audit_log'
import {
  getLlmConfiguration,
  readRuntimeLlmConfiguration,
  serializeLlmConfiguration,
  updateLlmConfiguration,
} from '#services/llm_configuration_service'
import { updateLlmConfigurationValidator } from '#validators/llm_configuration'

@ApiSecurity('bearerAuth')
export default class LlmConfigurationsController {
  @ApiOperation({ summary: '获取 LLM 配置' })
  @ApiResponse({ status: 200, description: 'LLM 配置（密钥仅返回配置状态）' })
  async show({ serialize }: HttpContext) {
    return serialize(serializeLlmConfiguration(await getLlmConfiguration()))
  }

  @ApiOperation({ summary: '更新 LLM 配置' })
  async update(ctx: HttpContext) {
    const { auth, request, serialize } = ctx
    const payload = await request.validateUsing(updateLlmConfigurationValidator)
    const config = await updateLlmConfiguration(payload)
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'llm_config.updated',
      targetType: 'llm_configuration',
      targetId: 1,
      metadata: { chatModel: config.chatModel, embeddingModel: config.embeddingModel },
    })
    return serialize(serializeLlmConfiguration(config))
  }

  @ApiOperation({ summary: '测试 LLM 连接' })
  async test() {
    const config = await readRuntimeLlmConfiguration()
    const client = new OpenAI({
      apiKey: config.chat.apiKey,
      baseURL: config.chat.baseURL ?? undefined,
      timeout: config.requestTimeoutMs,
    })
    await client.models.list()
    return { data: { ok: true } }
  }
}
