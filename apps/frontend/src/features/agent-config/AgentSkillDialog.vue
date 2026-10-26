<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { placeholder } from '@codemirror/view'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import CodeEditor from '@/components/common/CodeEditor.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { AgentSkill, AgentSkillInput } from '@/features/agent-config/api'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{
  open: boolean
  skill: AgentSkill | null
  saving: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [value: AgentSkillInput]
}>()
const { t } = useI18n()
const markdownEditorExtensions = computed(() => [
  markdown(),
  placeholder(t('agent_config.skill_content_placeholder')),
])
const formSchema = computed(() =>
  toTypedSchema(
    z.object({
      code: z
        .string()
        .trim()
        .min(1, t('agent_config.skill_code_required'))
        .max(64)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t('agent_config.skill_code_invalid')),
      name: z.string().trim().min(1, t('agent_config.skill_name_required')).max(128),
      instructions: z.string().trim().min(1, t('agent_config.skill_content_required')).max(50000),
    })
  )
)
const form = useForm<AgentSkillInput>({
  validationSchema: formSchema,
  initialValues: {
    code: '',
    name: '',
    instructions: '',
  },
})

watch(
  () => [props.open, props.skill] as const,
  ([open, skill]) => {
    if (!open) return
    form.resetForm({
      values: skill
        ? {
            code: skill.code,
            name: skill.name,
            instructions: skill.instructions,
          }
        : { code: '', name: '', instructions: '' },
    })
  }
)

const submit = form.handleSubmit(
  (values) => emit('save', values),
  ({ errors }) => toast.error(firstFormError(errors, t('common.form_check_errors')))
)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <FormDialogContent
      :title="skill ? t('agent_config.edit_skill') : t('agent_config.create_skill')"
      :description="t('agent_config.skill_dialog_description')"
      class="sm:max-w-160"
    >
      <form class="flex min-h-0 flex-1 flex-col overflow-hidden" @submit.prevent="submit">
        <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-4">
          <div class="grid items-start gap-4">
            <FormField v-slot="{ componentField }" name="code" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('agent_config.skill_code') }}</FormLabel>
                <FormControl
                  ><Input
                    v-bind="componentField"
                    autocomplete="off"
                    :placeholder="t('agent_config.skill_code_placeholder')"
                /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('agent_config.skill_name') }}</FormLabel>
                <FormControl
                  ><Input
                    v-bind="componentField"
                    :placeholder="t('agent_config.skill_name_placeholder')"
                /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="instructions" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('agent_config.skill_content') }}</FormLabel>
                <FormControl
                  ><CodeEditor
                    v-bind="componentField"
                    :model-value="String(componentField.modelValue ?? '')"
                    class="h-80 rounded-md border bg-background"
                    :extensions="markdownEditorExtensions"
                    :aria-label="t('agent_config.skill_content')"
                /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
          </div>
        </div>
        <FormDialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="saving"
            @click="emit('update:open', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="saving">
            {{ saving ? t('common.saving') : t('common.save') }}
          </Button>
        </FormDialogFooter>
      </form>
    </FormDialogContent>
  </Dialog>
</template>
