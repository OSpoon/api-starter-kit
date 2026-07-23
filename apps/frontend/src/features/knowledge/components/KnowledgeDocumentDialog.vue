<script setup lang="ts">
import { FileText, Upload } from '@lucide/vue'

import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { KnowledgeDocument, KnowledgeDocumentInput } from '@/features/knowledge/api'
import type { SystemRoleOption } from '@/lib/rbac-api'

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
  roleIds: [],
  status: 'draft',
})

watch(
  () => [open.value, props.document] as const,
  ([isOpen, document]) => {
    if (!isOpen) return
    form.value = {
      file: null,
      roleIds: document?.roles.map((role) => role.id) ?? [],
      status: document?.status ?? 'draft',
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
  form.value.file = (event.target as HTMLInputElement).files?.[0] ?? null
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
              @change="selectFile"
            />
            <template v-if="form.file">
              <FileText class="mb-3 size-8 text-primary" />
              <span class="max-w-full truncate font-medium">{{ form.file.name }}</span>
              <span class="mt-1 text-sm text-muted-foreground"
                >{{ Math.ceil(form.file.size / 1024) }} KB</span
              >
              <span class="mt-3 text-sm text-primary">{{ t('knowledge.replace_file') }}</span>
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
        <div v-if="document" class="grid gap-2">
          <div class="grid gap-2">
            <Label for="knowledge-status">{{ t('knowledge.status') }}</Label>
            <Select v-model="form.status">
              <SelectTrigger id="knowledge-status" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{{ t('knowledge.draft') }}</SelectItem>
                <SelectItem value="published">{{ t('knowledge.published') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
        <Button type="submit" :disabled="saving || (!document && !form.file)">
          {{ saving ? t('common.saving') : t('common.save') }}
        </Button>
      </FormDialogFooter>
    </form>
  </FormDialogContent>
</template>
