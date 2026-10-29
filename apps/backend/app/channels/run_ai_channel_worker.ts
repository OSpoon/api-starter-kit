import {
  ReloadableAiChannelRuntime,
  type ReloadableBotRuntime,
} from '#channels/reloadable_ai_channel_runtime'
import {
  type ImBotChannel,
  startImBotWorkerStatusReporter,
} from '#services/im_bot_worker_status_service'

interface RunAiChannelWorkerOptions {
  name: ImBotChannel
  createRuntime: () => Promise<ReloadableBotRuntime | null>
}

export async function runAiChannelWorker({ name, createRuntime }: RunAiChannelWorkerOptions) {
  const runtime = new ReloadableAiChannelRuntime({ name, createRuntime })
  const stopReportingStatus = await startImBotWorkerStatusReporter(name)
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
    await stopReportingStatus()
  }
}
