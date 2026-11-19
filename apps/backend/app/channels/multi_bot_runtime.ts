import { createHash } from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

export type ChannelBotRuntime = { start(): Promise<void>; stop(): Promise<void> }

type BotConfig = { id: string; name: string }
type ActiveBot<T extends BotConfig> = {
  fingerprint: string
  config: T
  runtime: ChannelBotRuntime
}
type PlatformRuntime<T extends BotConfig> = {
  generation: number
  active: Map<string, ActiveBot<T>>
}

const platforms = new Map<string, PlatformRuntime<BotConfig>>()

export function createMultiBotRuntime<T extends BotConfig>(
  platform: string,
  bots: T[],
  createRuntime: (bot: T) => ChannelBotRuntime
) {
  if (!bots.length) return null
  let state = platforms.get(platform) as PlatformRuntime<T> | undefined
  if (!state) {
    state = { generation: 0, active: new Map() }
    platforms.set(platform, state as PlatformRuntime<BotConfig>)
  }
  const currentState = state
  const configurationKey = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const fingerprint = (bot: T) => {
    const { name, ...runtimeConfig } = bot
    return configurationKey(runtimeConfig)
  }
  const desiredKey = configurationKey(bots)
  let generation: number | null = null
  let started = false
  let appliedKey = desiredKey

  return {
    get configurationKey() {
      return started ? appliedKey : desiredKey
    },
    async start() {
      if (started) return
      started = true
      generation = ++currentState.generation
      const desired = new Set(bots.map((bot) => bot.id))
      await Promise.all(
        bots.map(async (bot) => {
          const botFingerprint = fingerprint(bot)
          const existing = currentState.active.get(bot.id)
          if (existing?.fingerprint === botFingerprint) {
            existing.config = bot
            return
          }

          let runtime: ChannelBotRuntime | null = null
          try {
            runtime = createRuntime(bot)
            await runtime.start()
            currentState.active.set(bot.id, { fingerprint: botFingerprint, config: bot, runtime })
            if (existing) await stopBot(platform, existing)
            logger.info({ botId: bot.id }, `${platform} bot ${bot.name} is running`)
          } catch (error) {
            await runtime?.stop().catch(() => undefined)
            logger.error(
              { err: error, botId: bot.id },
              `${platform} bot ${bot.name} failed to start`
            )
          }
        })
      )

      for (const [botId, active] of currentState.active) {
        if (!desired.has(botId)) {
          currentState.active.delete(botId)
          await stopBot(platform, active)
        }
      }
      appliedKey = configurationKey(
        bots.filter((bot) => currentState.active.get(bot.id)?.fingerprint === fingerprint(bot))
      )
    },
    async stop() {
      if (!started || generation === null || currentState.generation !== generation) return
      started = false
      const active = [...currentState.active.values()]
      currentState.active.clear()
      await Promise.all(active.map((bot) => stopBot(platform, bot)))
    },
  }
}

async function stopBot<T extends BotConfig>(platform: string, bot: ActiveBot<T>) {
  try {
    await bot.runtime.stop()
  } catch (error) {
    logger.warn(
      { err: error, botId: bot.config.id },
      `${platform} bot ${bot.config.name} failed to stop`
    )
  }
}
