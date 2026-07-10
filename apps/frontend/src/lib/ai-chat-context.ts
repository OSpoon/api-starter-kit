import type { RouteLocationNormalizedLoaded } from 'vue-router'

export interface AiChatContextItem {
  label: string
  value: string
}

export type AiChatContextProvider = (
  route: RouteLocationNormalizedLoaded
) => AiChatContextItem[] | undefined

const providers = new Set<AiChatContextProvider>()

export function registerAiChatContextProvider(provider: AiChatContextProvider) {
  providers.add(provider)
  return () => providers.delete(provider)
}

export function getAiChatContextItems(route: RouteLocationNormalizedLoaded) {
  return [...providers]
    .flatMap((provider) => provider(route) ?? [])
    .filter((item) => item.label.trim() && item.value.trim())
    .slice(0, 20)
    .map((item) => ({ label: item.label.trim().slice(0, 80), value: item.value.trim().slice(0, 500) }))
}
