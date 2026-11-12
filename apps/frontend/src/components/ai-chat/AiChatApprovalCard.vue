<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import type { AiChatConfirmation } from '@/features/ai/api'
import { formatDateTime } from '@/lib/format'

defineProps<{
  approval: AiChatConfirmation
  loading?: boolean
  cancelling?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  approve: []
  dismiss: []
}>()

const { t } = useI18n()
</script>

<template>
  <Item variant="outline" size="sm" class="mb-2 items-start">
    <ItemMedia variant="icon" class="mt-0.5 shrink-0">
      <ShieldCheck class="size-4 text-muted-foreground" aria-hidden="true" />
    </ItemMedia>
    <ItemContent class="min-w-0 gap-1">
      <ItemTitle class="line-clamp-none w-full whitespace-normal">
        {{ approval.presentation.title }}
      </ItemTitle>
      <p class="wrap-break-word text-muted-foreground">
        {{ approval.presentation.summary }} {{ approval.presentation.targetLabel }}
      </p>
      <dl
        v-if="approval.presentation.changes.length"
        class="space-y-1 text-sm text-muted-foreground"
      >
        <div v-for="change in approval.presentation.changes" :key="change.label" class="flex gap-1">
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
      <ItemActions
        class="mt-2 w-full flex-col items-stretch sm:flex-row sm:items-center sm:justify-end"
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="sm:min-w-24"
          :disabled="loading || cancelling || disabled"
          @click="emit('dismiss')"
        >
          {{ cancelling ? t('common.loading') : approval.presentation.cancelLabel }}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="default"
          class="sm:min-w-28"
          :disabled="loading || cancelling || disabled"
          @click="emit('approve')"
        >
          {{ loading ? t('common.loading') : approval.presentation.approveLabel }}
        </Button>
      </ItemActions>
    </ItemContent>
  </Item>
</template>
