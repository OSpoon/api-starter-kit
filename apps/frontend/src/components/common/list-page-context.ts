import type { ComputedRef, InjectionKey } from 'vue'

export type ListPageHeader = {
  title: ComputedRef<string>
  loading: ComputedRef<boolean>
  actionLabel: ComputedRef<string>
  showAction: ComputedRef<boolean>
  onAction: () => void
}

export const listPageHeaderKey: InjectionKey<ListPageHeader> = Symbol('list-page-header')
