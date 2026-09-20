<script setup lang="ts">
import { AlertTriangle, RefreshCw } from '@lucide/vue'
import { onErrorCaptured, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'

const { t } = useI18n()
const error = ref<Error | null>(null)

onErrorCaptured((err) => {
  error.value = err
  // Log to console for debugging without exposing internals to the user
  console.error('[ErrorBoundary]', err)
  // Prevent the error from propagating further up the component tree
  return false
})

function reload() {
  error.value = null
  window.location.reload()
}

function goHome() {
  error.value = null
  // Error boundaries can render outside a usable router context. A full
  // navigation remains reliable even when route initialization failed.
  window.location.assign('/')
}
</script>

<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary">
    <div class="error-boundary-card">
      <AlertTriangle class="error-boundary-icon" />
      <h2 class="error-boundary-title">{{ t('error_boundary.title') }}</h2>
      <p class="error-boundary-message">{{ t('error_boundary.message') }}</p>
      <div class="error-boundary-actions">
        <Button class="error-boundary-btn error-boundary-btn-primary" @click="reload">
          <RefreshCw class="error-boundary-btn-icon" />
          {{ t('error_boundary.reload') }}
        </Button>
        <Button variant="outline" class="error-boundary-btn" @click="goHome">
          {{ t('error_boundary.go_home') }}
        </Button>
      </div>
    </div>
  </div>
</template>
