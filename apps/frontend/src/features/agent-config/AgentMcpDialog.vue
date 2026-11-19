<script setup lang="ts">
import { json } from '@codemirror/lang-json'
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
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import type { AgentMcpConfigurationDocument } from '@/features/agent-config/api'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{
  open: boolean
  configuration: AgentMcpConfigurationDocument
  saving: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [configuration: AgentMcpConfigurationDocument]
}>()
const { t } = useI18n()

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseMcpConfiguration(value: string): AgentMcpConfigurationDocument | null {
  try {
    const document: unknown = JSON.parse(value)
    if (!isRecord(document) || !isRecord(document.mcpServers)) return null
    if (Object.keys(document).some((key) => key !== 'mcpServers')) return null
    const entries = Object.entries(document.mcpServers)
    if (entries.length > 100) return null

    const mcpServers: AgentMcpConfigurationDocument['mcpServers'] = {}
    for (const [name, value] of entries) {
      if (!name.trim() || name.length > 128 || /[\\/\0]/.test(name) || !isRecord(value)) return null
      if (value.type !== undefined && value.type !== 'stdio') return null
      if (
        Object.keys(value).some((key) => !['type', 'command', 'args', 'cwd', 'env'].includes(key))
      )
        return null
      const { command, args = [], cwd, env } = value
      if (
        typeof command !== 'string' ||
        !command.trim() ||
        command.length > 2000 ||
        !Array.isArray(args) ||
        args.length > 100 ||
        args.some((argument) => typeof argument !== 'string' || argument.length > 4000) ||
        (cwd !== undefined && cwd !== null && typeof cwd !== 'string') ||
        (env !== undefined &&
          (!isRecord(env) ||
            Object.keys(env).length > 20 ||
            Object.entries(env).some(
              ([key, item]) =>
                !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) ||
                typeof item !== 'string' ||
                item.length > 4000
            )))
      ) {
        return null
      }
      mcpServers[name] = {
        command: command.trim(),
        args: args as string[],
        ...(typeof cwd === 'string' && cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(env === undefined ? {} : { env: env as Record<string, string> }),
      }
    }
    return { mcpServers }
  } catch {
    return null
  }
}

const configurationPlaceholder = computed(() => JSON.stringify({ mcpServers: {} }, null, 2))
const configurationEditorExtensions = computed(() => [
  json(),
  placeholder(configurationPlaceholder.value),
])
const formSchema = computed(() =>
  toTypedSchema(
    z.object({
      configurationText: z
        .string()
        .max(200_000)
        .refine(
          (value) => parseMcpConfiguration(value) !== null,
          t('agent_config.mcp_configuration_invalid')
        ),
    })
  )
)
const form = useForm<{ configurationText: string }>({
  validationSchema: formSchema,
  initialValues: { configurationText: '' },
})

watch(
  () => [props.open, props.configuration] as const,
  ([open, configuration]) => {
    if (open)
      form.resetForm({ values: { configurationText: JSON.stringify(configuration, null, 2) } })
  }
)

const submit = form.handleSubmit(
  (values) => {
    const configuration = parseMcpConfiguration(values.configurationText)
    if (!configuration) {
      toast.error(t('agent_config.mcp_configuration_invalid'))
      return
    }
    emit('save', configuration)
  },
  ({ errors }) => toast.error(firstFormError(errors, t('common.form_check_errors')))
)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <FormDialogContent
      :title="t('agent_config.mcp_configuration_title')"
      :description="t('agent_config.mcp_dialog_description')"
      class="sm:max-w-4xl"
    >
      <form class="flex min-h-0 flex-1 flex-col overflow-hidden" @submit.prevent="submit">
        <div class="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-6 py-4">
          <FormField v-slot="{ componentField }" name="configurationText" :validate-on-blur="false">
            <FormItem>
              <FormControl>
                <CodeEditor
                  v-bind="componentField"
                  :model-value="String(componentField.modelValue ?? '')"
                  class="h-96 rounded-md border bg-background"
                  :extensions="configurationEditorExtensions"
                  :aria-label="t('agent_config.mcp_configuration_title')"
                />
              </FormControl>
              <p class="text-xs text-muted-foreground">
                {{ t('agent_config.mcp_shared_configuration_hint') }}
              </p>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
        <FormDialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="saving"
            @click="emit('update:open', false)"
            >{{ t('common.cancel') }}</Button
          >
          <Button type="submit" :disabled="saving">{{
            saving ? t('common.saving') : t('common.save')
          }}</Button>
        </FormDialogFooter>
      </form>
    </FormDialogContent>
  </Dialog>
</template>
