import type { AiChatClientAction } from '@/lib/ai-chat-api'

export interface RegisteredAiChatAction extends AiChatClientAction {
  execute: () => void | Promise<void>
}

const registeredActions = new Map<string, RegisteredAiChatAction>()

export function registerAiChatActions(actions: RegisteredAiChatAction[]) {
  for (const action of actions) {
    registeredActions.set(action.id, action)
  }
}

export function getAiChatActions() {
  return [...registeredActions.values()].map(({ execute: _execute, ...action }) => action)
}

export async function runAiChatAction(id: string) {
  const action = registeredActions.get(id)
  if (!action) {
    throw new Error('AI action is not registered')
  }

  await action.execute()
}
