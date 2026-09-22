export interface LatestContentStreamOptions {
  intervalMs?: number
  now?: () => number
  sleep?: (delayMs: number) => Promise<void>
}

/**
 * Coalesces model deltas and serializes the channel updates for one stream.
 * The producer never waits for the external channel request.
 */
export class LatestContentStream {
  private readonly intervalMs: number
  private readonly now: () => number
  private readonly sleep: (delayMs: number) => Promise<void>
  private latestContent: string
  private pendingContent: string | null = null
  private lastUpdatedAt: number
  private updateLoop: Promise<void> | null = null
  private stopped = false
  private updateError: unknown = null

  constructor(
    initialContent: string,
    private readonly update: (content: string) => Promise<void>,
    options: LatestContentStreamOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 250
    this.now = options.now ?? Date.now
    this.sleep =
      options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)))
    this.latestContent = initialContent
    this.lastUpdatedAt = this.now()
  }

  get latest() {
    return this.latestContent
  }

  get error() {
    return this.updateError
  }

  publish(content: string) {
    if (this.stopped || this.updateError) return
    this.latestContent = content || this.latestContent
    this.pendingContent = this.latestContent
    if (!this.updateLoop) this.updateLoop = this.runLoop()
  }

  async finish() {
    this.pendingContent = null
    this.stopped = true
    await this.updateLoop
    return this.updateError
  }

  private async runLoop() {
    while (!this.stopped && !this.updateError) {
      const content = this.pendingContent
      if (content === null) return

      const elapsed = this.now() - this.lastUpdatedAt
      if (elapsed < this.intervalMs) await this.sleep(this.intervalMs - elapsed)
      if (this.stopped || this.updateError) return

      if (this.pendingContent === null) continue
      const nextContent = this.pendingContent
      this.pendingContent = null
      this.lastUpdatedAt = this.now()
      try {
        await this.update(nextContent)
      } catch (error) {
        this.updateError = error
        this.pendingContent = null
        return
      }
    }
  }
}
