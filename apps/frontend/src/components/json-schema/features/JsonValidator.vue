<script setup lang="ts">
import { AlertCircleIcon, CheckCircleIcon } from '@lucide/vue'

import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { validateJson } from '@/components/json-schema/utils/jsonValidator.ts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

withDefaults(defineProps<{ open?: boolean }>(), { open: false })
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useSchemaStore()
const t = useTranslation()
const jsonInput = ref('')
const result = computed(() => {
  if (!jsonInput.value.trim()) return null
  return validateJson(jsonInput.value, store.schema.value)
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center"
    @click.self="emit('update:open', false)"
  >
    <div class="fixed inset-0 bg-black/50" />
    <div
      class="relative max-h-[85vh] w-[95vw] max-w-175 overflow-y-auto rounded-xl bg-popover p-6 text-popover-foreground shadow-lg"
    >
      <h2 class="mb-2 text-lg font-medium">{{ t.validatorTitle }}</h2>
      <p class="mb-4 text-sm text-muted-foreground">{{ t.validatorDescription }}</p>
      <div class="space-y-4">
        <Textarea
          v-model="jsonInput"
          :placeholder="t.validatorContent"
          class="h-48 w-full resize-none rounded-md border border-input bg-transparent p-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          spellcheck="false"
        />
        <div v-if="result">
          <div
            v-if="result.valid"
            class="flex items-center gap-2 text-sm font-medium text-green-600"
          >
            <CheckCircleIcon class="size-4" /> {{ t.validatorValid }}
          </div>
          <div v-else class="space-y-2">
            <p class="flex items-center gap-2 text-sm font-medium text-red-500">
              <AlertCircleIcon class="size-4" /> {{ t.validatorErrorInvalidSyntax }} ({{
                result.errors?.length ?? 0
              }}
              {{
                (t.validatorErrorCount ?? '{count} validation errors detected').replace(
                  '{count}',
                  String(result.errors?.length ?? 0)
                )
              }})
            </p>
            <ul class="max-h-40 space-y-1 overflow-y-auto">
              <li v-for="(err, i) in result.errors" :key="i" class="text-xs text-muted-foreground">
                [{{ err.line ?? '?' }}:{{ err.column ?? '?' }}] {{ err.message }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          type="button"
          @click="emit('update:open', false)"
          class="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium whitespace-nowrap shadow-xs transition-all hover:bg-accent hover:text-accent-foreground"
        >
          {{ t.fieldAddNewCancel }}
        </Button>
      </div>
    </div>
  </div>
</template>
