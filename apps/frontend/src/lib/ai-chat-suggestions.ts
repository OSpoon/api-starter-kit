import { hasPermission } from '@/lib/permission'

type AiChatSuggestionDefinition = {
  promptKey: string
  permission?: string
  routes?: string[]
}

const suggestionDefinitions: readonly AiChatSuggestionDefinition[] = [
  { promptKey: 'ai_chat.tasks.access.check' },
  {
    promptKey: 'ai_chat.tasks.api_keys.list',
    permission: 'api-keys:read',
    routes: ['api-keys'],
  },
  {
    promptKey: 'ai_chat.tasks.api_keys.create',
    permission: 'api-keys:create',
    routes: ['api-keys'],
  },
  { promptKey: 'ai_chat.tasks.users.list', permission: 'users:read', routes: ['users'] },
  {
    promptKey: 'ai_chat.tasks.users.reset_password',
    permission: 'users:update',
    routes: ['users'],
  },
  { promptKey: 'ai_chat.tasks.roles.list', permission: 'roles:read', routes: ['roles'] },
  { promptKey: 'ai_chat.tasks.roles.create', permission: 'roles:create', routes: ['roles'] },
  {
    promptKey: 'ai_chat.tasks.permissions.list',
    permission: 'permissions:read',
    routes: ['permissions'],
  },
  {
    promptKey: 'ai_chat.tasks.permissions.create',
    permission: 'permissions:create',
    routes: ['permissions'],
  },
  {
    promptKey: 'ai_chat.tasks.audit_logs.recent',
    permission: 'audit-logs:read',
    routes: ['audit-logs'],
  },
  {
    promptKey: 'ai_chat.tasks.knowledge.search',
    permission: 'knowledge:read',
    routes: ['knowledge-documents'],
  },
]

export function getAiChatSuggestions(input: {
  permissions: string[] | undefined
  routeName: string | symbol | null | undefined
  translate: (key: string) => string
}) {
  const routeName = typeof input.routeName === 'string' ? input.routeName : undefined

  return suggestionDefinitions
    .filter((suggestion) => hasPermission(input.permissions, suggestion.permission))
    .sort((left, right) => {
      const leftMatchesRoute = left.routes?.includes(routeName ?? '') ? 0 : 1
      const rightMatchesRoute = right.routes?.includes(routeName ?? '') ? 0 : 1
      return leftMatchesRoute - rightMatchesRoute
    })
    .map((suggestion) => input.translate(suggestion.promptKey))
}

function hasSameSuggestions(left: string[], right: string[]) {
  return left.length === right.length && left.every((suggestion) => right.includes(suggestion))
}

export function pickRandomAiChatSuggestions(
  suggestions: string[],
  current: string[] = [],
  random: () => number = Math.random
) {
  const count = Math.min(suggestions.length, 3)
  if (count === suggestions.length) return [...suggestions]

  let picked: string[] = []
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shuffled = [...suggestions]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1))
      ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!]
    }
    picked = shuffled.slice(0, count)
    if (!hasSameSuggestions(picked, current)) break
  }
  return picked
}
