import { BaseCommand } from '@adonisjs/core/ace'

import { runChannelBot } from '#channels/channel_bot_runner'
import { createDingTalkAiRuntime } from '#channels/dingtalk/dingtalk_ai_runtime'

export default class DingTalkBot extends BaseCommand {
  static commandName = 'dingtalk:bot'
  static description = 'Run the DingTalk AI bot Stream worker'
  static options = { startApp: true }

  async run() {
    const completed = await runChannelBot({
      name: 'DingTalk',
      createRuntime: createDingTalkAiRuntime,
      logger: this.logger,
    })
    if (!completed) this.exitCode = 1
  }
}
