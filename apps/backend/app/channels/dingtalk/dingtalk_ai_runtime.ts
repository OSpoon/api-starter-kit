import { AiChannelBridge } from '#channels/ai_channel_bridge'
import { DingTalkBotAdapter } from '#channels/dingtalk/dingtalk_bot_adapter'
import { createMultiBotRuntime } from '#channels/multi_bot_runtime'
import { listRuntimeImBots } from '#services/im_configuration_service'

export async function createDingTalkAiRuntime() {
  const bots = await listRuntimeImBots('dingtalk')
  return createMultiBotRuntime('dingtalk', bots, (config) => {
    let bridge: AiChannelBridge
    const adapter = new DingTalkBotAdapter({
      clientId: config.identifier,
      clientSecret: config.secret,
      cardTemplateId: config.cardTemplateId,
      streamingCardTemplateId: config.streamingCardTemplateId,
      onMessage: (message) => bridge.handleMessage(message),
      onMessageStream: (message, emit) => bridge.handleMessageStream(message, emit),
      onTemplateCardEvent: (event) => bridge.handleTemplateCardEvent(event),
    })
    bridge = new AiChannelBridge(adapter, undefined, config.id, config.legacyIdentity)
    return bridge
  })
}
