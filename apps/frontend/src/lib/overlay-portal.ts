import { dialogContainerRefKey, insideDialogKey } from '@/lib/dialog-context'

export function useOverlayPortal() {
  const insideDialog = inject(insideDialogKey, false)
  const dialogContainer = inject(dialogContainerRefKey, null)

  const portalTarget = computed(() => {
    if (!insideDialog) {
      return undefined
    }

    return dialogContainer?.value ?? undefined
  })

  return {
    insideDialog,
    portalTarget,
    portalTo: computed(() => portalTarget.value ?? 'body'),
    disablePortal: computed(() => insideDialog && !portalTarget.value),
  }
}

export function resolveComponentElement(instance: unknown) {
  if (instance instanceof HTMLElement) {
    return instance
  }

  if (instance && typeof instance === 'object' && '$el' in instance) {
    const element = (instance as { $el?: unknown }).$el
    if (element instanceof HTMLElement) {
      return element
    }
  }

  return null
}
