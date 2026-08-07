export type AiChatTimingOutcome = 'completed' | 'failed' | 'aborted'

type AiChatTimingStage =
  | 'firstAgentEvent'
  | 'firstToolStarted'
  | 'firstToolCompleted'
  | 'firstResponseToken'

export class AiChatTiming {
  private readonly startedAt: number
  private readonly stages: Partial<Record<AiChatTimingStage, number>> = {}

  constructor(private readonly now: () => number = () => performance.now()) {
    this.startedAt = now()
  }

  markFirstAgentEvent() {
    this.markOnce('firstAgentEvent')
  }

  markFirstToolStarted() {
    this.markOnce('firstToolStarted')
  }

  markFirstToolCompleted() {
    this.markOnce('firstToolCompleted')
  }

  markFirstResponseToken() {
    this.markOnce('firstResponseToken')
  }

  summary(outcome: AiChatTimingOutcome) {
    return {
      outcome,
      totalMs: this.elapsedSince(this.startedAt),
      firstAgentEventMs: this.stageElapsed('firstAgentEvent'),
      firstToolStartedMs: this.stageElapsed('firstToolStarted'),
      firstToolCompletedMs: this.stageElapsed('firstToolCompleted'),
      firstResponseTokenMs: this.stageElapsed('firstResponseToken'),
    }
  }

  private markOnce(stage: AiChatTimingStage) {
    this.stages[stage] ??= this.now()
  }

  private stageElapsed(stage: AiChatTimingStage) {
    const timestamp = this.stages[stage]
    return timestamp === undefined ? null : Math.max(0, Math.round(timestamp - this.startedAt))
  }

  private elapsedSince(timestamp: number) {
    return Math.max(0, Math.round(this.now() - timestamp))
  }
}
