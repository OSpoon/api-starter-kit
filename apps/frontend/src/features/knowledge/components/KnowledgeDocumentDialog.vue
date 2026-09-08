<script setup lang="ts">
import { FileText, Upload } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SystemRoleOption } from '@/features/access-control/api'
import type {
  KnowledgeDocument,
  KnowledgeDocumentInput,
  KnowledgeMetadataSuggestion,
} from '@/features/knowledge/api'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{
  document: KnowledgeDocument | null
  roles: SystemRoleOption[]
  saving: boolean
  metadataLoading: boolean
  metadataSuggestion: KnowledgeMetadataSuggestion | null
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [input: KnowledgeDocumentInput]
  preview: [file: File]
}>()
const { t } = useI18n()
const file = ref<File | null>(null)
const roleIds = ref<number[]>([])
const formSchema = computed(() =>
  toTypedSchema(
    z.object({
      summary: z.string().trim().max(2_000).optional(),
      topics: z.string().trim().max(1_000).optional(),
    })
  )
)
const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    summary: '',
    topics: '',
  },
})

watch(
  () => [open.value, props.document] as const,
  ([isOpen, document]) => {
    if (!isOpen) return
    file.value = null
    roleIds.value = document?.roles.map((role) => role.id) ?? []
    form.resetForm({
      values: {
        summary: document?.summary ?? '',
        topics: document?.topics.join(', ') ?? '',
      },
    })
  },
  { immediate: true }
)

watch(
  () => props.metadataSuggestion,
  (suggestion) => {
    if (!suggestion) return
    form.setValues({
      summary: suggestion.summary ?? '',
      topics: suggestion.topics.join(', '),
    })
  }
)

function submit(values: typeof form.values) {
  if (!props.document && !file.value) return
  emit('save', {
    file: file.value,
    roleIds: roleIds.value,
    summary: values.summary || null,
    topics: values.topics
      ? values.topics
          .split(',')
          .map((topic) => topic.trim())
          .filter(Boolean)
      : [],
  })
}

function selectFile(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  file.value = files[0] ?? null
  if (file.value) emit('preview', file.value)
}

function toggleRole(roleId: number, checked: boolean | 'indeterminate') {
  roleIds.value =
    checked === true
      ? [...new Set([...roleIds.value, roleId])]
      : roleIds.value.filter((id) => id !== roleId)
}

function invalidSubmit({ errors }: { errors: Parameters<typeof firstFormError>[0] }) {
  toast.error(firstFormError(errors, t('knowledge.validation_failed')))
}

const onSubmit = form.handleSubmit(submit, invalidSubmit)
</script>

<template>
  <FormDialogContent
    :title="document ? t('knowledge.edit') : t('knowledge.create')"
    :description="t('knowledge.form_desc')"
    class="sm:max-w-150"
  >
    <form
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      novalidate
      @submit.prevent="onSubmit"
    >
      <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div class="grid gap-4 px-6 pb-6">
          <div class="grid gap-2">
            <Label for="knowledge-file" class="sr-only">{{ t('knowledge.file') }}</Label>
            <label
              for="knowledge-file"
              class="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <input
                id="knowledge-file"
                class="sr-only"
                type="file"
                accept=".txt,.md,.markdown,.rst,text/plain,text/markdown,text/x-rst"
                :multiple="false"
                @change="selectFile"
              />
              <template v-if="file">
                <FileText class="mb-2 size-7 text-primary" />
                <span class="font-medium">
                  {{
                    t('knowledge.selected_files', {
                      count: 1,
                      size: Math.ceil(file.size / 1024),
                    })
                  }}
                </span>
                <span
                  class="mt-2 max-h-24 w-full max-w-lg overflow-y-auto rounded-md border border-border/70 bg-background/60 p-1.5 text-left"
                >
                  <span
                    :key="file.name"
                    class="flex items-center gap-2 rounded px-2 py-1 text-sm text-muted-foreground"
                  >
                    <FileText class="size-3.5 shrink-0" />
                    <span class="truncate">{{ file.name }}</span>
                  </span>
                </span>
              </template>
              <template v-else>
                <span class="mb-3 rounded-full bg-primary/10 p-3 text-primary"
                  ><Upload class="size-5"
                /></span>
                <span class="font-medium">{{ t('knowledge.upload_prompt') }}</span>
                <span class="mt-1 text-sm text-muted-foreground">{{
                  t('knowledge.upload_hint')
                }}</span>
              </template>
            </label>
            <div
              v-if="document && !file"
              class="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <FileText class="size-4" /> {{ document.title }}
            </div>
            <p v-if="document" class="text-sm text-muted-foreground">
              {{ t('knowledge.replace_file_hint') }}
            </p>
          </div>
          <div class="grid gap-4">
            <div class="md:col-span-2">
              <FormField v-slot="{ componentField }" name="topics" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('knowledge.topics') }}</FormLabel>
                  <FormControl><Input v-bind="componentField" /></FormControl>
                  <FormDescription>{{ t('knowledge.topics_hint') }}</FormDescription>
                  <FormMessage />
                </FormItem>
              </FormField>
            </div>
            <div class="md:col-span-2">
              <FormField v-slot="{ componentField }" name="summary" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('knowledge.summary') }}</FormLabel>
                  <FormControl><Textarea v-bind="componentField" rows="4" /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
            </div>
          </div>
          <div class="grid gap-2">
            <Label>{{ t('knowledge.roles') }}</Label>
            <p class="text-sm text-muted-foreground">{{ t('knowledge.roles_hint') }}</p>
            <label v-for="role in roles" :key="role.id" class="flex items-center gap-2 text-sm">
              <Checkbox
                :model-value="roleIds.includes(role.id)"
                @update:model-value="(checked) => toggleRole(role.id, checked)"
              />
              {{ role.name }} <code>{{ role.code }}</code>
            </label>
          </div>
        </div>
      </div>
      <FormDialogFooter class="justify-end">
        <Button type="button" variant="outline" @click="open = false">{{
          t('common.cancel')
        }}</Button>
        <Button type="submit" :disabled="saving || metadataLoading || (!document && !file)">
          {{
            metadataLoading
              ? t('knowledge.extracting')
              : saving
                ? t('common.saving')
                : t('common.save')
          }}
        </Button>
      </FormDialogFooter>
    </form>
  </FormDialogContent>
</template>
