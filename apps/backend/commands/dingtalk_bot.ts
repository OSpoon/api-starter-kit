import { BaseCommand } from '@adonisjs/core/ace'

import { createDingTalkAiRuntime } from '#channels/dingtalk/dingtalk_ai_runtime'
import { runAiChannelWorker } from '#channels/run_ai_channel_worker'

export default class DingTalkBot extends BaseCommand {
  static commandName = 'dingtalk:bot'
  static description = 'Run the DingTalk AI bot Stream worker'
  static options = { startApp: true }

  async run() {
    const completed = await runAiChannelWorker({
      name: 'DingTalk',
      createRuntime: createDingTalkAiRuntime,
      logger: this.logger,
    })
    if (!completed) this.exitCode = 1
  }
}
