import SidebarHost from './SidebarHost.vue'
import { createAssistantApp } from '@assistant/create-app'
import { registerAssistantExtensionPermissionBridge } from '@assistant/lib/runtime'

function originPattern(origin: string) {
  return `${new URL(origin).origin}/*`
}

registerAssistantExtensionPermissionBridge({
  requestHostPermission: (origin) =>
    chrome.permissions.request({ origins: [originPattern(origin)] }),
  hasHostPermission: (origin) => chrome.permissions.contains({ origins: [originPattern(origin)] }),
  removeHostPermission: (origin) => chrome.permissions.remove({ origins: [originPattern(origin)] }),
})

const app = await createAssistantApp(SidebarHost)
app.mount('#app')
