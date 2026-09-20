<script setup lang="ts">
import CardPageShell from '@/components/common/CardPageShell.vue'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { firstFormError } from '@/lib/form-validation'
import { useAuthStore } from '@/stores/auth'

import {
  getAssistantApiBaseUrl,
  hasConfiguredAssistantServer,
  isExtensionRuntime,
  removeAssistantServerPermission,
  requestAssistantServerPermission,
  saveAssistantServerUrl,
} from '@assistant/lib/runtime'
import { normalizeServerOrigin } from '@assistant/lib/server-url'
import { Server } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { z } from 'zod'

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const isTesting = ref(false)
const hasActiveConnection = ref(false)

const validationSchema = computed(() =>
  toTypedSchema(
    z.object({
      serverUrl: z
        .string()
        .trim()
        .min(1, t('assistant_connection.url_required'))
        .refine((value) => {
          try {
            normalizeServerOrigin(value)
            return true
          } catch {
            return false
          }
        }, t('assistant_connection.url_invalid')),
    })
  )
)

const form = useForm({
  validationSchema,
  initialValues: { serverUrl: getAssistantApiBaseUrl() ?? '' },
})

const submitValidated = form.handleSubmit(
  async ({ serverUrl }) => {
    isTesting.value = true
    try {
      const normalizedUrl = normalizeServerOrigin(serverUrl)
      const previousServerUrl = getAssistantApiBaseUrl()
      const response = await fetch(`${normalizedUrl}/api/v1/health/ready`, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000),
      })
      const payload: unknown = await response.json().catch(() => null)
      const status =
        payload && typeof payload === 'object' && 'status' in payload ? payload.status : undefined

      if (!response.ok || status !== 'ok') {
        toast.error(t('assistant_connection.server_unavailable'))
        return
      }

      const serverChanged = previousServerUrl !== normalizedUrl
      if (serverChanged) {
        auth.clearSession()
      }
      saveAssistantServerUrl(normalizedUrl)
      hasActiveConnection.value = true
      if (serverChanged && previousServerUrl && isExtensionRuntime()) {
        void removeAssistantServerPermission(previousServerUrl).catch(() => undefined)
      }
      toast.success(t('assistant_connection.connected'))

      await router.replace({ name: serverChanged || !auth.isAuthenticated ? 'login' : 'dashboard' })
    } catch {
      toast.error(t('assistant_connection.test_failed'))
    } finally {
      isTesting.value = false
    }
  },
  ({ errors }) => {
    toast.error(firstFormError(errors, t('common.form_check_errors')))
  }
)

function handleSubmit(event: SubmitEvent) {
  event.preventDefault()

  let serverOrigin: string
  try {
    serverOrigin = normalizeServerOrigin(form.values.serverUrl ?? '')
  } catch {
    void submitValidated(event)
    return
  }

  if (!isExtensionRuntime()) {
    void submitValidated(event)
    return
  }

  // Start the permission request synchronously from the form gesture.
  isTesting.value = true
  void requestAssistantServerPermission(serverOrigin)
    .then((granted) => {
      if (!granted) {
        toast.error(t('assistant_connection.permission_denied'))
        return
      }

      return submitValidated(event)
    })
    .catch(() => toast.error(t('assistant_connection.permission_failed')))
    .finally(() => {
      isTesting.value = false
    })
}

onMounted(async () => {
  hasActiveConnection.value = await hasConfiguredAssistantServer().catch(() => false)
})

function returnToApp() {
  void router.replace({ name: auth.isAuthenticated ? 'dashboard' : 'login' })
}
</script>

<template>
  <CardPageShell
    :title="t('assistant_connection.title')"
    :description="t('assistant_connection.description')"
  >
    <form class="space-y-5" @submit="handleSubmit">
      <FormField v-slot="{ componentField }" name="serverUrl" :validate-on-blur="false">
        <FormItem>
          <FormLabel>{{ t('assistant_connection.server_url') }}</FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              type="text"
              inputmode="url"
              autocomplete="url"
              autocapitalize="none"
              spellcheck="false"
              :placeholder="t('assistant_connection.url_placeholder')"
              :disabled="isTesting"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <p class="text-sm text-muted-foreground">{{ t('assistant_connection.url_hint') }}</p>
      <p class="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
        {{ t('assistant_connection.security_notice') }}
      </p>

      <Button type="submit" class="w-full" :disabled="isTesting">
        <Server v-if="!isTesting" class="size-4" aria-hidden="true" />
        {{
          isTesting ? t('assistant_connection.testing') : t('assistant_connection.test_and_connect')
        }}
      </Button>

      <div v-if="hasActiveConnection" class="text-center">
        <Button type="button" variant="link" size="sm" :disabled="isTesting" @click="returnToApp">
          {{ t('assistant_connection.return_to_app') }}
        </Button>
      </div>
    </form>
  </CardPageShell>
</template>
