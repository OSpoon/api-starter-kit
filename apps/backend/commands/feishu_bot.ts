import { BaseCommand } from '@adonisjs/core/ace'

import { runChannelBot } from '#channels/channel_bot_runner'
import { createFeishuAiRuntime } from '#channels/feishu/feishu_ai_runtime'

export default class FeishuBot extends BaseCommand {
  static commandName = 'feishu:bot'
  static description = 'Run the Feishu bot WebSocket AI channel worker'
  static options = { startApp: true }

  async run() {
    const completed = await runChannelBot({
      name: 'Feishu',
      createRuntime: createFeishuAiRuntime,
      logger: this.logger,
    })
    if (!completed) this.exitCode = 1
  }
}
