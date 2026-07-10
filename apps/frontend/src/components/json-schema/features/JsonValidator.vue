<script setup lang="ts">
import { AlertCircleIcon, CheckCircleIcon } from '@lucide/vue'

import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { validateJson } from '@/components/json-schema/utils/jsonValidator.ts'

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
      class="relative bg-popover text-popover-foreground rounded-xl p-6 shadow-lg w-[95vw] max-w-[700px] max-h-[85vh] overflow-y-auto"
    >
      <h2 class="text-lg font-medium mb-2">{{ t.validatorTitle }}</h2>
      <p class="text-sm text-muted-foreground mb-4">{{ t.validatorDescription }}</p>
      <div class="space-y-4">
        <textarea
          v-model="jsonInput"
          :placeholder="t.validatorContent"
          class="w-full h-48 resize-none font-mono text-sm p-3 rounded-md border border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 outline-none"
          spellcheck="false"
        />
        <div v-if="result">
          <div
            v-if="result.valid"
            class="flex items-center gap-2 text-green-600 text-sm font-medium"
          >
            <CheckCircleIcon class="size-4" /> {{ t.validatorValid }}
          </div>
          <div v-else class="space-y-2">
            <p class="flex items-center gap-2 text-red-500 text-sm font-medium">
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
            <ul class="space-y-1 max-h-40 overflow-y-auto">
              <li v-for="(err, i) in result.errors" :key="i" class="text-xs text-muted-foreground">
                [{{ err.line ?? '?' }}:{{ err.column ?? '?' }}] {{ err.message }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="flex justify-end mt-4">
        <button
          type="button"
          @click="emit('update:open', false)"
          class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-9 px-4 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground"
        >
          {{ t.fieldAddNewCancel }}
        </button>
      </div>
    </div>
  </div>
</template>
