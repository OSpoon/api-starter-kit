import 'vue-router'

declare module 'vue-router' {
  type PageKind =
    | 'analytics'
    | 'auth'
    | 'dashboard'
    | 'detail'
    | 'list'
    | 'settings'
    | 'utility'
    | 'wizard'
    | 'workflow'

  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    title?: string
    permission?: string | string[]
    pageKind?: PageKind
  }
}
