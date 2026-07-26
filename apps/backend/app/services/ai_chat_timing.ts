export type AiChatTimingOutcome = 'completed' | 'failed' | 'aborted'

type AiChatTimingStage =
  | 'firstAgentEvent'
  | 'firstToolStarted'
  | 'firstToolCompleted'
  | 'firstResponseToken'

type AiChatToolTiming = {
  name: string
  startedAt: number
  durationMs?: number
}

export class AiChatTiming {
  private readonly startedAt: number
  private readonly stages: Partial<Record<AiChatTimingStage, number>> = {}
  private readonly tools: AiChatToolTiming[] = []

  constructor(private readonly now: () => number = () => performance.now()) {
    this.startedAt = now()
  }

  markFirstAgentEvent() {
    this.markOnce('firstAgentEvent')
  }

  startTool(name: string) {
    this.markOnce('firstToolStarted')
    this.tools.push({ name, startedAt: this.now() })
  }

  finishTool(name: string) {
    this.markOnce('firstToolCompleted')
    const tool = [...this.tools].reverse().find((candidate) => candidate.name === name)
    if (tool && tool.durationMs === undefined) {
      tool.durationMs = this.elapsedSince(tool.startedAt)
    }
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
      tools: this.tools.map((tool) => ({ name: tool.name, durationMs: tool.durationMs ?? null })),
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
