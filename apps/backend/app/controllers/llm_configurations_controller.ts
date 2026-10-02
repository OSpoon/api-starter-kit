import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { recordAuditEvent } from '#services/audit_log'
import {
  getLlmConfiguration,
  serializeLlmConfiguration,
  updateLlmConfiguration,
} from '#services/llm_configuration_service'
import { testLlmConnections } from '#services/llm_connection_test_service'
import { updateLlmConfigurationValidator } from '#validators/llm_configuration'

@ApiSecurity('bearerAuth')
export default class LlmConfigurationsController {
  @ApiOperation({ summary: '获取 LLM 配置与模型限制' })
  @ApiResponse({
    status: 200,
    description: 'LLM 配置包含对话模型的上下文和最大输出限制；密钥仅返回配置状态',
  })
  async show({ serialize }: HttpContext) {
    return serialize(serializeLlmConfiguration(await getLlmConfiguration()))
  }

  @ApiOperation({ summary: '更新 LLM 配置与对话模型限制' })
  async update(ctx: HttpContext) {
    const { auth, request, serialize } = ctx
    const payload = await request.validateUsing(updateLlmConfigurationValidator)
    const config = await updateLlmConfiguration(payload)
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'llm_config.updated',
      targetType: 'llm_configuration',
      targetId: 1,
      metadata: {
        chatModel: config.chatModel,
        chatContextWindow: config.chatContextWindow,
        chatMaxTokens: config.chatMaxTokens,
        embeddingModel: config.embeddingModel,
      },
    })
    return serialize(serializeLlmConfiguration(config))
  }

  @ApiOperation({ summary: '测试 LLM 连接' })
  async test() {
    return { data: await testLlmConnections() }
  }
}
