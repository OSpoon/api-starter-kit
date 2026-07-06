import type { InjectionKey, Ref } from 'vue'

/** Descendants can adjust overlay behavior (e.g. portal target). */
export const insideDialogKey: InjectionKey<boolean> = Symbol('insideDialog')

/** Teleport target for nested overlays so they stay inside the dialog layer. */
export const dialogContainerRefKey: InjectionKey<Ref<HTMLElement | null>> =
  Symbol('dialogContainer')
