interface BotRuntime {
  start(): Promise<void>
  stop(): Promise<void>
}

interface BotLogger {
  error(message: string): void
  info(message: string): void
}

interface RunChannelBotOptions {
  name: string
  createRuntime: () => Promise<BotRuntime | null>
  logger: BotLogger
}

const RETRY_DELAY_MS = 2_000

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Own the lifecycle of a channel worker so development restarts can recover
 * from transient configuration, database, and WebSocket startup failures.
 */
export async function runChannelBot({ name, createRuntime, logger }: RunChannelBotOptions) {
  const developmentMode = process.env.NODE_ENV !== 'production'
  let runtime: BotRuntime | null = null
  let stopPromise: Promise<void> | null = null
  const retryState: { resolve: (() => void) | null } = { resolve: null }
  let shutdownResolver: (() => void) | null = null
  let shuttingDown = false

  const stopRuntime = async () => {
    const activeRuntime = runtime
    if (!activeRuntime) return
    if (stopPromise) return stopPromise

    stopPromise = activeRuntime
      .stop()
      .catch((error) => {
        logger.error(`${name} bot shutdown failed: ${describeError(error)}`)
      })
      .finally(() => {
        if (runtime === activeRuntime) runtime = null
        stopPromise = null
      })

    await stopPromise
  }

  const waitBeforeRetry = async () => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        retryState.resolve = null
        resolve()
      }, RETRY_DELAY_MS)
      retryState.resolve = () => {
        clearTimeout(timer)
        retryState.resolve = null
        resolve()
      }
    })
  }

  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    const resolveRetry = retryState.resolve
    retryState.resolve = null
    if (resolveRetry) resolveRetry()
    await stopRuntime()
    shutdownResolver?.()
  }
  const onSigint = () => void shutdown()
  const onSigterm = () => void shutdown()

  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  try {
    while (!shuttingDown) {
      try {
        runtime = await createRuntime()
        if (shuttingDown) {
          await stopRuntime()
          break
        }

        if (!runtime) {
          throw new Error('IM configuration is incomplete')
        }

        await runtime.start()
        if (shuttingDown) {
          await stopRuntime()
          break
        }

        logger.info(`${name} AI bot WebSocket worker started`)
        await new Promise<void>((resolve) => {
          shutdownResolver = resolve
        })
        break
      } catch (error) {
        await stopRuntime()
        if (shuttingDown) break

        if (!developmentMode) {
          logger.error(`${name} bot failed to start: ${describeError(error)}`)
          return false
        }

        logger.error(
          `${name} bot failed to start: ${describeError(error)}; retrying in ${RETRY_DELAY_MS}ms`
        )
        await waitBeforeRetry()
      }
    }
    return true
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    const resolveRetry = retryState.resolve
    retryState.resolve = null
    if (resolveRetry) resolveRetry()
    await stopRuntime()
  }
}
