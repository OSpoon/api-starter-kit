import { BaseCommand } from '@adonisjs/core/ace'

import { createFeishuAiRuntime } from '#channels/feishu/feishu_ai_runtime'
import { runAiChannelWorker } from '#channels/run_ai_channel_worker'

export default class FeishuBot extends BaseCommand {
  static commandName = 'feishu:bot'
  static description = 'Run the Feishu bot WebSocket AI channel worker'
  static options = { startApp: true }

  async run() {
    const completed = await runAiChannelWorker({
      name: 'Feishu',
      createRuntime: createFeishuAiRuntime,
      logger: this.logger,
    })
    if (!completed) this.exitCode = 1
  }
}
