<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import type { AiChatConfirmation } from '@/lib/ai-chat-api'
import { formatDateTime } from '@/lib/format'

defineProps<{
  approval: AiChatConfirmation
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  approve: []
  dismiss: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mb-2 rounded-md border bg-muted/60 px-2.5 py-2 text-xs">
    <div class="flex items-start gap-2">
      <ShieldCheck class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div class="min-w-0 flex-1 space-y-1">
        <p class="font-medium text-foreground">
          {{ approval.presentation.title }}
        </p>
        <p class="wrap-break-word text-muted-foreground">
          {{ approval.presentation.summary }} {{ approval.presentation.targetLabel }}
        </p>
        <dl v-if="approval.presentation.changes.length" class="space-y-1 text-muted-foreground">
          <div
            v-for="change in approval.presentation.changes"
            :key="change.label"
            class="flex gap-1"
          >
            <dt class="shrink-0">{{ change.label }}:</dt>
            <dd class="break-all">{{ change.value }}</dd>
          </div>
        </dl>
        <p class="text-muted-foreground">
          {{ approval.presentation.impactLabel }}
        </p>
        <p v-if="approval.expiresAt" class="text-muted-foreground">
          {{
            t('ai_chat.approval.expires_at', {
              time: formatDateTime(approval.expiresAt),
            })
          }}
        </p>
      </div>
    </div>
    <div class="mt-2 flex justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        :disabled="loading || disabled"
        @click="emit('dismiss')"
      >
        {{ approval.presentation.cancelLabel }}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        :disabled="loading || disabled"
        @click="emit('approve')"
      >
        {{ loading ? t('common.loading') : approval.presentation.approveLabel }}
      </Button>
    </div>
  </div>
</template>
