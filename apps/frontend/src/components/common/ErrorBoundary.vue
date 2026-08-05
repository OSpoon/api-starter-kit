<script setup lang="ts">
import { AlertTriangle, RefreshCw } from '@lucide/vue'
import { onErrorCaptured, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

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
  // Lazily access the router so setup does not fail if the component
  // renders before the router is fully installed (e.g. during initial
  // navigation errors or bfcache restoration).
  useRouter()
    .push('/')
    .catch(() => window.location.assign('/'))
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

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.5rem;
  background: hsl(var(--background));
}

.error-boundary-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-width: 28rem;
  padding: 2rem;
  text-align: center;
  border: 1px solid hsl(var(--border));
  border-radius: 0.75rem;
  background: hsl(var(--card));
}

.error-boundary-icon {
  width: 2.5rem;
  height: 2.5rem;
  color: hsl(var(--destructive));
}

.error-boundary-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.error-boundary-message {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
  word-break: break-word;
}

.error-boundary-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.error-boundary-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: background 0.15s;
}

.error-boundary-btn:hover {
  background: hsl(var(--muted));
}

.error-boundary-btn-primary {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.error-boundary-btn-primary:hover {
  background: hsl(var(--primary) / 0.9);
}

.error-boundary-btn-icon {
  width: 0.875rem;
  height: 0.875rem;
}
</style>
