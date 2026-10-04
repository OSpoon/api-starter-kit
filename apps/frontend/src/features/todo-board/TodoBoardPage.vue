<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { useRoute } from 'vue-router'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import PageShell from '@/components/common/PageShell.vue'
import type { TodoCard, TodoColumn } from '@/components/common/todo-board'
import TodoBoard from '@/components/common/TodoBoard.vue'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

import TodoCardForm from './components/TodoCardForm.vue'
const { t } = useI18n()
const route = useRoute()
function exampleCard(id: string, withDescription = true): TodoCard {
  return {
    id: `example-${id}`,
    title: t(`todo_board.examples.${id}.title`),
    ...(withDescription ? { description: t(`todo_board.examples.${id}.description`) } : {}),
  }
}
const cards = ref<TodoColumn[]>([
  {
    id: 'todo',
    title: '',
    cards: [exampleCard('requirements'), exampleCard('mobile'), exampleCard('meeting', false)],
  },
  {
    id: 'doing',
    title: '',
    cards: [exampleCard('drag'), exampleCard('validation'), exampleCard('accessibility')],
  },
  { id: 'done', title: '', cards: [exampleCard('layout'), exampleCard('locales')] },
])
const columns = computed({
  get: () =>
    cards.value.map((column) => ({ ...column, title: t(`todo_board.columns.${column.id}`) })),
  set: (value: TodoColumn[]) => {
    cards.value = value
  },
})
const open = ref(false)
const editing = ref<TodoCard>()
const selectedColumn = ref('todo')
const deleting = ref<TodoCard>()
const deleteOpen = ref(false)
function requestDelete(card: TodoCard) {
  deleting.value = card
  deleteOpen.value = true
}
function edit(card: TodoCard | undefined, columnId: string) {
  editing.value = card
  selectedColumn.value = columnId
  open.value = true
}
function save(values: { title: string; description: string; columnId: string }) {
  const card = {
    id: editing.value?.id ?? crypto.randomUUID(),
    title: values.title,
    description: values.description,
  }
  cards.value = cards.value.map((column) => {
    const index = column.cards.findIndex((item) => item.id === card.id)
    const remaining = column.cards.filter((item) => item.id !== card.id)
    if (column.id === values.columnId)
      remaining.splice(index < 0 ? remaining.length : index, 0, card)
    return { ...column, cards: remaining }
  })
  open.value = false
}
function remove() {
  cards.value = cards.value.map((column) => ({
    ...column,
    cards: column.cards.filter((card) => card.id !== deleting.value?.id),
  }))
  deleteOpen.value = false
}
</script>
<template>
  <PageShell
    :title="t(String(route.meta.title))"
    :description="t('todo_board.description')"
    class="min-h-0 min-w-0 overflow-hidden p-4 sm:p-8"
    header-class="shrink-0"
  >
    <template #actions
      ><Button @click="edit(undefined, 'todo')"
        ><Plus class="size-4" />{{ t('todo_board.add') }}</Button
      ></template
    >
    <TodoBoard
      v-model="columns"
      @create="edit(undefined, $event)"
      @edit="edit"
      @delete="requestDelete"
    />
    <Dialog v-model:open="open"
      ><FormDialogContent
        :description="t('todo_board.form_hint')"
        :title="t(editing ? 'todo_board.edit' : 'todo_board.add')"
        ><TodoCardForm
          v-if="open"
          :card="editing"
          :column-id="selectedColumn"
          :columns="columns"
          @save="save"
          @cancel="open = false" /></FormDialogContent
    ></Dialog>
    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="t('todo_board.delete_title')"
      :description="t('todo_board.delete_description', { title: deleting?.title })"
      @confirm="remove"
    />
  </PageShell>
</template>
