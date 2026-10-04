<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import type { TodoCard, TodoColumn } from '@/components/common/todo-board'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { firstFormError } from '@/lib/form-validation'
const props = defineProps<{ card?: TodoCard; columnId: string; columns: TodoColumn[] }>()
const emit = defineEmits<{
  save: [values: { title: string; description: string; columnId: string }]
  cancel: []
}>()
const { t } = useI18n()
const form = useForm({
  validationSchema: computed(() =>
    toTypedSchema(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('todo_board.required'))
          .max(120, t('todo_board.title_max')),
        description: z.string().trim().max(1000, t('todo_board.description_max')),
        columnId: z
          .string()
          .refine(
            (id) => props.columns.some((column) => column.id === id),
            t('todo_board.required')
          ),
      })
    )
  ),
  initialValues: {
    title: props.card?.title ?? '',
    description: props.card?.description ?? '',
    columnId: props.columnId,
  },
})
const submit = form.handleSubmit(
  (values) => emit('save', values),
  ({ errors }) => toast.error(firstFormError(errors, t('common.form_check_errors')))
)
</script>
<template>
  <form class="flex min-h-0 flex-1 flex-col overflow-hidden" novalidate @submit="submit">
    <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6">
      <div class="grid items-start gap-4">
        <FormField v-slot="{ componentField }" name="title" :validate-on-blur="false"
          ><FormItem
            ><FormLabel>{{ t('todo_board.task_title') }}</FormLabel
            ><FormControl><Input v-bind="componentField" /></FormControl><FormMessage /></FormItem
        ></FormField>
        <FormField v-slot="{ componentField }" name="description" :validate-on-blur="false"
          ><FormItem
            ><FormLabel>{{ t('todo_board.task_description') }}</FormLabel
            ><FormControl><Textarea v-bind="componentField" /></FormControl
            ><FormMessage /></FormItem
        ></FormField>
        <FormField v-slot="{ componentField }" name="columnId" :validate-on-blur="false"
          ><FormItem
            ><FormLabel>{{ t('todo_board.status') }}</FormLabel
            ><Select v-bind="componentField"
              ><FormControl
                ><SelectTrigger class="w-full"><SelectValue /></SelectTrigger></FormControl
              ><SelectContent
                ><SelectItem v-for="column in columns" :key="column.id" :value="column.id">{{
                  column.title
                }}</SelectItem></SelectContent
              ></Select
            ><FormMessage /></FormItem
        ></FormField>
      </div>
    </div>
    <FormDialogFooter
      ><Button type="button" variant="outline" @click="emit('cancel')">{{
        t('common.cancel')
      }}</Button
      ><Button type="submit">{{ t('common.save') }}</Button></FormDialogFooter
    >
  </form>
</template>
