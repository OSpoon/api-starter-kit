import { AiChannelBridge } from '#channels/ai_channel_bridge'
import { createMultiBotRuntime } from '#channels/multi_bot_runtime'
import { WecomBotAdapter } from '#channels/wecom/wecom_bot_adapter'
import { listRuntimeImBots } from '#services/im_configuration_service'

export async function createWecomAiRuntime() {
  const bots = await listRuntimeImBots('wecom')
  return createMultiBotRuntime('wecom', bots, (config) => {
    let bridge: AiChannelBridge
    const adapter = new WecomBotAdapter({
      botId: config.identifier,
      secret: config.secret,
      tenantId: config.tenantId!,
      wsUrl: config.endpoint,
      onMessage: (message) => bridge.handleMessage(message),
      onMessageStream: (message, emit) => bridge.handleMessageStream(message, emit),
      onTemplateCardEvent: (event) => bridge.handleTemplateCardEvent(event),
    })
    bridge = new AiChannelBridge(adapter, undefined, config.id, config.legacyIdentity)
    return bridge
  })
}
