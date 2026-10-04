<script setup lang="ts">
import { GripVertical, Pencil, Plus, Trash2 } from '@lucide/vue'
import { useId } from 'vue'
import draggable from 'vuedraggable'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import type { TodoCard, TodoColumn } from './todo-board'

const props = defineProps<{
  modelValue: TodoColumn[]
  disabled?: boolean
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [columns: TodoColumn[]]
  create: [columnId: string]
  edit: [card: TodoCard, columnId: string]
  delete: [card: TodoCard, columnId: string]
  retry: []
}>()
const { t } = useI18n()
const group = useId()
// Sortable may update two columns in the same tick. Keep an isolated draft so
// both changes are emitted without mutating the caller's objects.
const columns = ref<TodoColumn[]>([])
watch(
  () => props.modelValue,
  (value) => {
    columns.value = value.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({ ...card })),
    }))
  },
  { immediate: true, deep: true }
)
function updateCards(columnId: string, cards: TodoCard[]) {
  columns.value = columns.value.map((column) =>
    column.id === columnId ? { ...column, cards } : column
  )
  emit(
    'update:modelValue',
    columns.value.map((column) => ({ ...column, cards: [...column.cards] }))
  )
}
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" :aria-busy="loading">
    <Alert v-if="error" variant="destructive">
      <AlertDescription class="flex flex-wrap items-center justify-between gap-3">
        {{ error
        }}<Button variant="outline" @click="emit('retry')">{{ t('todo_board.retry') }}</Button>
      </AlertDescription>
    </Alert>
    <div v-else-if="loading" class="grid min-h-0 flex-1 gap-4 md:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-full rounded-xl" />
    </div>
    <div
      v-else
      class="flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden pb-3"
      :aria-label="t('todo_board.title')"
    >
      <section
        v-for="column in columns"
        :key="column.id"
        class="flex min-h-0 w-72 min-w-72 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30 p-3"
        :aria-label="column.title"
      >
        <header class="mb-3 flex shrink-0 items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ column.title }}</h2>
          <Badge variant="secondary">{{ column.cards.length }}</Badge>
          <Button
            variant="ghost"
            size="icon"
            :disabled="disabled"
            :aria-label="t('todo_board.add_to', { column: column.title })"
            :title="t('todo_board.add_to', { column: column.title })"
            @click="emit('create', column.id)"
            ><Plus class="size-4"
          /></Button>
        </header>
        <draggable
          :model-value="column.cards"
          item-key="id"
          :group="group"
          handle=".todo-board-handle"
          :disabled="disabled"
          :animation="180"
          ghost-class="opacity-40"
          class="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-1 pb-1"
          @update:model-value="updateCards(column.id, $event)"
        >
          <template #item="{ element }: { element: TodoCard }">
            <article class="rounded-lg border bg-card p-3 shadow-sm">
              <div class="flex items-start gap-2">
                <span
                  class="todo-board-handle mt-0.5 shrink-0 cursor-grab text-muted-foreground"
                  :class="{ 'cursor-default': disabled }"
                  :title="t('todo_board.drag')"
                  ><GripVertical class="size-4"
                /></span>
                <div class="min-w-0 flex-1">
                  <slot name="card" :card="element" :column="column">
                    <h3 class="text-sm font-medium break-words">{{ element.title }}</h3>
                    <p
                      v-if="element.description"
                      class="mt-2 text-xs break-words whitespace-pre-wrap text-muted-foreground"
                    >
                      {{ element.description }}
                    </p>
                  </slot>
                </div>
              </div>
              <div class="mt-3 flex justify-end gap-1">
                <slot name="card-actions" :card="element" :column="column">
                  <Button
                    variant="ghost"
                    size="icon"
                    :disabled="disabled"
                    :aria-label="t('todo_board.edit')"
                    :title="t('todo_board.edit')"
                    @click="emit('edit', element, column.id)"
                    ><Pencil class="size-3.5"
                  /></Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    :disabled="disabled"
                    :aria-label="t('common.delete')"
                    :title="t('common.delete')"
                    @click="emit('delete', element, column.id)"
                    ><Trash2 class="size-3.5"
                  /></Button>
                </slot>
              </div>
            </article>
          </template>
          <template #footer
            ><p
              v-if="!column.cards.length"
              class="pointer-events-none py-6 text-center text-sm text-muted-foreground"
            >
              {{ t('todo_board.empty') }}
            </p></template
          >
        </draggable>
      </section>
    </div>
  </div>
</template>
