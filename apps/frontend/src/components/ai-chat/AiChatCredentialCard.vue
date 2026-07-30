<script setup lang="ts">
import { Copy } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import type { AiChatCredentialDisclosure } from '@/lib/ai-chat-api'

defineProps<{
  credential: AiChatCredentialDisclosure
}>()

const emit = defineEmits<{
  copy: [credential: AiChatCredentialDisclosure]
  dismiss: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mb-2 rounded-md border bg-muted/60 px-2.5 py-2 text-xs">
    <p class="font-medium">{{ credential.label }}</p>
    <code class="mt-1 block break-all">{{ credential.value }}</code>
    <div class="mt-1 flex gap-1">
      <Button size="sm" variant="ghost" class="h-7 px-2" @click="emit('copy', credential)">
        <Copy class="size-3.5" />
        {{ t('ai_chat.credential.copy') }}
      </Button>
      <Button size="sm" variant="ghost" class="h-7 px-2" @click="emit('dismiss')">
        {{ t('common.close') }}
      </Button>
    </div>
  </div>
</template>
