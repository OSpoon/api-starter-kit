<script setup lang="ts">
import { Check, X } from '@lucide/vue'
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
import type { AccountSortMode } from '../services/account-order'

defineProps<{ busy: boolean; sortMode: AccountSortMode }>()
const emit = defineEmits<{ select: [mode: AccountSortMode] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent :show-close-button="false" class="max-w-sm">
      <DialogHeader class="flex-row items-start justify-between gap-4 space-y-0 text-left">
        <div>
          <p
            class="mb-1 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
          >
            {{ t('appName') }}
          </p>
          <DialogTitle>{{ t('sortTitle') }}</DialogTitle>
        </div>
        <DialogClose as-child>
          <Button variant="ghost" size="icon-sm" :aria-label="t('close')" :title="t('close')"
            ><X :size="19"
          /></Button>
        </DialogClose>
      </DialogHeader>
      <DialogDescription>{{ t('sortDescription') }}</DialogDescription>
      <div class="grid gap-2">
        <Button
          variant="outline"
          class="justify-between"
          :aria-pressed="sortMode === 'manual'"
          :disabled="busy"
          @click="emit('select', 'manual')"
          >{{ t('sortManual') }}<Check v-if="sortMode === 'manual'" :size="17"
        /></Button>
        <Button
          variant="outline"
          class="justify-between"
          :aria-pressed="sortMode === 'ascending'"
          :disabled="busy"
          @click="emit('select', 'ascending')"
          >{{ t('sortAscending') }}<Check v-if="sortMode === 'ascending'" :size="17"
        /></Button>
        <Button
          variant="outline"
          class="justify-between"
          :aria-pressed="sortMode === 'descending'"
          :disabled="busy"
          @click="emit('select', 'descending')"
          >{{ t('sortDescending') }}<Check v-if="sortMode === 'descending'" :size="17"
        /></Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
