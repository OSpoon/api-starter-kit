export type AiChatTimingOutcome = 'completed' | 'failed' | 'aborted'

type AiChatTimingStage =
  | 'firstAgentEvent'
  | 'firstToolStarted'
  | 'firstToolCompleted'
  | 'firstResponseToken'

type AiChatOperationTiming = {
  name: string
  startedAt: number
  durationMs?: number
}

export class AiChatTiming {
  private readonly startedAt: number
  private readonly stages: Partial<Record<AiChatTimingStage, number>> = {}
  private readonly tools: AiChatOperationTiming[] = []
  private readonly nodes: AiChatOperationTiming[] = []

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

  startNode(name: string) {
    this.nodes.push({ name, startedAt: this.now() })
  }

  finishNode(name: string) {
    const node = [...this.nodes].reverse().find((candidate) => candidate.name === name)
    if (node && node.durationMs === undefined) {
      node.durationMs = this.elapsedSince(node.startedAt)
    }
  }

  finishOpenNodes() {
    for (const node of this.nodes) {
      if (node.durationMs === undefined) node.durationMs = this.elapsedSince(node.startedAt)
    }
  }

  summary(outcome: AiChatTimingOutcome) {
    return {
      outcome,
      totalMs: this.elapsedSince(this.startedAt),
      firstAgentEventMs: this.stageElapsed('firstAgentEvent'),
      firstToolStartedMs: this.stageElapsed('firstToolStarted'),
      firstToolCompletedMs: this.stageElapsed('firstToolCompleted'),
      firstResponseTokenMs: this.stageElapsed('firstResponseToken'),
      tools: this.serializeOperations(this.tools),
      nodes: this.serializeOperations(this.nodes),
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

  private serializeOperations(operations: AiChatOperationTiming[]) {
    return operations.map((operation) => ({
      name: operation.name,
      durationMs: operation.durationMs ?? null,
    }))
  }
}
