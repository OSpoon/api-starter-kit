import {
  ReloadableAiChannelRuntime,
  type ReloadableBotRuntime,
} from '#channels/reloadable_ai_channel_runtime'

interface WorkerLogger {
  error(message: string): void
  info(message: string): void
}

interface RunAiChannelWorkerOptions {
  name: string
  createRuntime: () => Promise<ReloadableBotRuntime | null>
  logger: WorkerLogger
}

export async function runAiChannelWorker({
  name,
  createRuntime,
  logger,
}: RunAiChannelWorkerOptions) {
  const runtime = new ReloadableAiChannelRuntime({ name, createRuntime, logger })
  let shuttingDown = false
  let shutdownResolver: (() => void) | null = null

  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    await runtime.stop()
    shutdownResolver?.()
  }
  const onSigint = () => void shutdown()
  const onSigterm = () => void shutdown()

  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  try {
    await runtime.start()
    if (!shuttingDown) {
      await new Promise<void>((resolve) => {
        shutdownResolver = resolve
      })
    }
    return true
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    await runtime.stop()
  }
}
