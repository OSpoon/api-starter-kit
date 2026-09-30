import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

/** Use the shared notification surface for the build plugin's update events. */
export function useWebUpdateNotification() {
  const { t } = useI18n()
  const toastId = 'web-update'
  const dismissedVersions = new Set<string>()

  useEventListener(document.body, 'plugin_web_update_notice', (event) => {
    const version = (event as CustomEvent<{ version: string }>).detail.version
    if (dismissedVersions.has(version)) return
    toast(t('web_update.title'), {
      id: toastId,
      description: t('web_update.description'),
      duration: Infinity,
      action: {
        label: t('web_update.refresh'),
        onClick: () => window.location.reload(),
      },
      cancel: {
        label: t('web_update.dismiss'),
        onClick: () => {
          dismissedVersions.add(version)
        },
      },
    })
  })

  onUnmounted(() => toast.dismiss(toastId))
}
