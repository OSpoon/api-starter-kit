<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

defineProps<{
  open: boolean
  title: string
  description: string
  loading?: boolean
  confirmLabel?: string
  contained?: boolean
}>()

defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="contained && open"
    role="alertdialog"
    aria-modal="true"
    :aria-label="title"
    class="absolute inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
  >
    <div class="w-full max-w-sm rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p class="mt-2 text-sm text-muted-foreground">{{ description }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <Button variant="outline" :disabled="loading" @click="$emit('update:open', false)">
          {{ t('common.cancel') }}
        </Button>
        <Button :disabled="loading" @click="$emit('confirm')">
          {{ loading ? t('common.loading') : (confirmLabel ?? t('common.delete')) }}
        </Button>
      </div>
    </div>
  </div>
  <AlertDialog v-else-if="!contained" :open="open" @update:open="$emit('update:open', $event)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="loading">{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="loading" @click.prevent="$emit('confirm')">
          {{ loading ? t('common.loading') : (confirmLabel ?? t('common.delete')) }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
