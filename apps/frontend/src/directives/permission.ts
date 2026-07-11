import type { Directive } from 'vue'

import { hasPermission, type PermissionRequirement } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

function applyPermission(el: HTMLElement, binding: { value: PermissionRequirement; arg?: string }) {
  const allowed = hasPermission(useAuthStore().user?.permissions, binding.value)
  if (allowed) {
    el.hidden = false
    el.removeAttribute('aria-disabled')
    if ('disabled' in el) {
      ;(el as HTMLButtonElement).disabled = false
    }
    return
  }

  if (binding.arg === 'disable') {
    el.setAttribute('aria-disabled', 'true')
    if ('disabled' in el) {
      ;(el as HTMLButtonElement).disabled = true
    }
    return
  }

  el.hidden = true
}

export const permissionDirective: Directive<HTMLElement, PermissionRequirement> = {
  mounted: applyPermission,
  updated: applyPermission,
}
