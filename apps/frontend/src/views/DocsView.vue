<script setup lang="ts">
import { BookOpenText, Terminal } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const { t } = useI18n()

const authDescription = computed(() =>
  t('api_keys.auth_desc', {
    header: 'Authorization: Bearer <token>',
  })
)

const apiBaseUrl = computed(() => {
  const configured = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
  if (configured.trim()) return configured.trim().replace(/\/+$/, '')
  return window.location.origin
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-8">
    <div class="flex flex-col gap-3">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">{{ t('nav.documentation') }}</h1>
        <p class="text-muted-foreground">{{ t('api_keys.doc_title') }}</p>
      </div>
    </div>

    <section class="space-y-4">
      <Alert>
        <Terminal class="size-4" />
        <AlertTitle>{{ t('api_keys.auth_title') }}</AlertTitle>
        <AlertDescription>
          {{ authDescription }}
          <pre class="mt-2 rounded-md bg-muted p-2 text-xs">
Authorization: Bearer &lt;YOUR_API_KEY&gt;</pre
          >
        </AlertDescription>
      </Alert>

      <Card class="rounded-xl">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <BookOpenText class="size-5" />
            {{ t('nav.api_docs') }}
          </CardTitle>
          <CardDescription>
            {{ t('api_keys.doc_title') }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground">
            Full API documentation is available at the
            <a
              :href="`${apiBaseUrl}/api-docs`"
              target="_blank"
              class="text-primary hover:underline"
            >
              OpenAPI docs
            </a>
            endpoint.
          </p>
        </CardContent>
      </Card>
    </section>
  </div>
</template>
