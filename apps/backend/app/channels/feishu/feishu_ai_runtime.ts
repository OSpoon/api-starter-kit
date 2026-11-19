import { AiChannelBridge } from '#channels/ai_channel_bridge'
import { FeishuBotAdapter } from '#channels/feishu/feishu_bot_adapter'
import { createMultiBotRuntime } from '#channels/multi_bot_runtime'
import { listRuntimeImBots } from '#services/im_configuration_service'

export async function createFeishuAiRuntime() {
  const bots = await listRuntimeImBots('feishu')
  return createMultiBotRuntime('feishu', bots, (config) => {
    let bridge: AiChannelBridge
    const adapter = new FeishuBotAdapter({
      appId: config.identifier,
      secret: config.secret,
      domain: config.endpoint,
      onMessage: (message) => bridge.handleMessage(message),
      onMessageStream: (message, emit) => bridge.handleMessageStream(message, emit),
      onTemplateCardEvent: (event) => bridge.handleTemplateCardEvent(event),
    })
    bridge = new AiChannelBridge(adapter, undefined, config.id, config.legacyIdentity)
    return bridge
  })
}
