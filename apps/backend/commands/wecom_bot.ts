import { BaseCommand } from '@adonisjs/core/ace'

import { runChannelBot } from '#channels/channel_bot_runner'
import { createWecomAiRuntime } from '#channels/wecom/wecom_ai_runtime'

export default class WecomBot extends BaseCommand {
  static commandName = 'wecom:bot'
  static description = 'Run the WeCom intelligent-bot WebSocket AI channel worker'
  static options = { startApp: true }

  async run() {
    const completed = await runChannelBot({
      name: 'WeCom',
      createRuntime: createWecomAiRuntime,
      logger: this.logger,
    })
    if (!completed) this.exitCode = 1
  }
}
