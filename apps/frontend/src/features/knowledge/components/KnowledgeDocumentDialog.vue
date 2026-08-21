<script setup lang="ts">
import { FileText, Upload } from '@lucide/vue'

import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { SystemRoleOption } from '@/features/access-control/api'
import type { KnowledgeDocument, KnowledgeDocumentInput } from '@/features/knowledge/api'

const props = defineProps<{
  document: KnowledgeDocument | null
  roles: SystemRoleOption[]
  saving: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ save: [input: KnowledgeDocumentInput] }>()
const { t } = useI18n()
const form = ref<KnowledgeDocumentInput>({
  file: null,
  files: [],
  roleIds: [],
})

watch(
  () => [open.value, props.document] as const,
  ([isOpen, document]) => {
    if (!isOpen) return
    form.value = {
      file: null,
      files: [],
      roleIds: document?.roles.map((role) => role.id) ?? [],
    }
  },
  { immediate: true }
)

function submit() {
  emit('save', {
    ...form.value,
    file: form.value.file,
  })
}

function selectFile(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  form.value.files = files
  form.value.file = files[0] ?? null
}
</script>

<template>
  <FormDialogContent
    :title="document ? t('knowledge.edit') : t('knowledge.create')"
    :description="t('knowledge.form_desc')"
    class="sm:max-w-150"
  >
    <form @submit.prevent="submit">
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
              :multiple="!document"
              @change="selectFile"
            />
            <template v-if="!document && form.files?.length">
              <FileText class="mb-2 size-7 text-primary" />
              <span class="font-medium">
                {{
                  t('knowledge.selected_files', {
                    count: form.files.length,
                    size: Math.ceil(form.files.reduce((sum, file) => sum + file.size, 0) / 1024),
                  })
                }}
              </span>
              <span
                class="mt-2 max-h-24 w-full max-w-lg overflow-y-auto rounded-md border border-border/70 bg-background/60 p-1.5 text-left"
              >
                <span
                  v-for="file in form.files"
                  :key="file.name"
                  class="flex items-center gap-2 rounded px-2 py-1 text-sm text-muted-foreground"
                >
                  <FileText class="size-3.5 shrink-0" />
                  <span class="truncate">{{ file.name }}</span>
                </span>
              </span>
            </template>
            <template v-else-if="form.file">
              <FileText class="mb-3 size-8 text-primary" />
              <span class="max-w-full truncate font-medium">{{ form.file.name }}</span>
              <span class="mt-1 text-sm text-muted-foreground"
                >{{ Math.ceil(form.file.size / 1024) }} KB</span
              >
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
            v-if="document && !form.file"
            class="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <FileText class="size-4" /> {{ document.title }}
          </div>
          <p v-if="document" class="text-sm text-muted-foreground">
            {{ t('knowledge.replace_file_hint') }}
          </p>
        </div>
        <div class="grid gap-2">
          <Label>{{ t('knowledge.roles') }}</Label>
          <p class="text-sm text-muted-foreground">{{ t('knowledge.roles_hint') }}</p>
          <label v-for="role in roles" :key="role.id" class="flex items-center gap-2 text-sm">
            <Checkbox
              :model-value="form.roleIds.includes(role.id)"
              @update:model-value="
                (checked) =>
                  (form.roleIds = checked
                    ? [...new Set([...form.roleIds, role.id])]
                    : form.roleIds.filter((id) => id !== role.id))
              "
            />
            {{ role.name }} <code>{{ role.code }}</code>
          </label>
        </div>
      </div>
      <FormDialogFooter class="justify-end">
        <Button type="button" variant="outline" @click="open = false">{{
          t('common.cancel')
        }}</Button>
        <Button type="submit" :disabled="saving || (!document && !form.files?.length)">
          {{ saving ? t('common.saving') : t('common.save') }}
        </Button>
      </FormDialogFooter>
    </form>
  </FormDialogContent>
</template>
