<script setup lang="ts">
import { KeyRound, ScanLine, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ scan: []; manual: [] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent :show-close-button="false" class="max-h-[85dvh] rounded-t-2xl p-5 sm:rounded-xl">
      <DialogHeader class="flex-row items-start justify-between gap-4 space-y-0 text-left">
        <div>
          <p
            class="mb-1 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
          >
            {{ t('appName') }}
          </p>
          <DialogTitle>{{ t('addAccount') }}</DialogTitle>
        </div>
        <DialogClose as-child>
          <Button variant="ghost" size="icon-sm" :aria-label="t('close')" :title="t('close')"
            ><X :size="19"
          /></Button>
        </DialogClose>
      </DialogHeader>
      <DialogDescription class="sr-only">{{ t('addDialogDescription') }}</DialogDescription>
      <Button
        variant="outline"
        class="h-auto justify-between whitespace-normal p-4 text-left"
        :disabled="busy"
        @click="emit('scan')"
      >
        <span class="flex min-w-0 items-center gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary"
            ><ScanLine :size="21"
          /></span>
          <span class="min-w-0"
            ><span class="block font-semibold">{{ t('scanTitle') }}</span
            ><span class="mt-1 block text-xs leading-relaxed text-muted-foreground">{{
              t('scanDescription')
            }}</span></span
          >
        </span>
        <span class="text-xl text-muted-foreground" aria-hidden="true">›</span>
      </Button>
      <Button
        variant="outline"
        class="h-auto justify-between whitespace-normal p-4 text-left"
        @click="emit('manual')"
      >
        <span class="flex min-w-0 items-center gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary"
            ><KeyRound :size="21"
          /></span>
          <span class="min-w-0"
            ><span class="block font-semibold">{{ t('manualTitle') }}</span
            ><span class="mt-1 block text-xs leading-relaxed text-muted-foreground">{{
              t('manualDescription')
            }}</span></span
          >
        </span>
        <span class="text-xl text-muted-foreground" aria-hidden="true">›</span>
      </Button>
    </DialogContent>
  </Dialog>
</template>
