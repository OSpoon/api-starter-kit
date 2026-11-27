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

function isMcpInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function parseMcpConfiguration(value: string): AgentMcpConfigurationDocument | null {
  try {
    const document: unknown = JSON.parse(value)
    if (!isRecord(document) || !isRecord(document.mcpServers)) return null
    if (Object.keys(document).some((key) => key !== 'mcpServers')) return null
    const entries = Object.entries(document.mcpServers)
    if (entries.length > 100) return null

    const mcpServers = Object.create(null) as AgentMcpConfigurationDocument['mcpServers']
    for (const [name, value] of entries) {
      if (!name.trim() || name.length > 128 || /[\\/\0]/.test(name) || !isRecord(value)) return null
      if (value.type === 'http') {
        if (
          Object.keys(value).some(
            (key) =>
              !['type', 'url', 'headers', 'openGetStream', 'maxMessageBytes', 'reconnect'].includes(
                key
              )
          )
        )
          return null
        if (typeof value.url !== 'string' || !value.url.trim() || value.url.length > 2048)
          return null
        if (value.openGetStream !== undefined && typeof value.openGetStream !== 'boolean')
          return null
        if (
          value.maxMessageBytes !== undefined &&
          !isMcpInteger(value.maxMessageBytes, 1, 64 * 1024 * 1024)
        ) {
          return null
        }
        let url: URL
        try {
          url = new URL(value.url)
        } catch {
          return null
        }
        const authority = url.href.slice(url.protocol.length + 2).split(/[/?#]/, 1)[0] ?? ''
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          !url.hostname ||
          url.username ||
          url.password ||
          url.hash ||
          value.url.includes('#') ||
          authority.includes('@')
        ) {
          return null
        }
        const headers = value.headers
        if (headers !== undefined) {
          if (!isRecord(headers) || Object.keys(headers).length > 50) return null
          const seenHeaders = new Set<string>()
          if (
            JSON.stringify(headers).length > 200_000 ||
            Object.entries(headers).some(([key, item]) => {
              const normalizedKey = key.toLowerCase()
              if (
                !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) ||
                seenHeaders.has(normalizedKey) ||
                typeof item !== 'string' ||
                item.length > 10_000 ||
                /[\r\n\0]/.test(item)
              ) {
                return true
              }
              seenHeaders.add(normalizedKey)
              return false
            })
          ) {
            return null
          }
        }
        const reconnect = value.reconnect
        if (reconnect !== undefined) {
          if (
            !isRecord(reconnect) ||
            Object.keys(reconnect).some(
              (key) => !['initialDelayMs', 'maxDelayMs', 'maxRetries'].includes(key)
            ) ||
            (reconnect.initialDelayMs !== undefined &&
              !isMcpInteger(reconnect.initialDelayMs, 0, 30_000)) ||
            (reconnect.maxDelayMs !== undefined &&
              !isMcpInteger(reconnect.maxDelayMs, 0, 120_000)) ||
            (reconnect.maxRetries !== undefined && !isMcpInteger(reconnect.maxRetries, 0, 20))
          ) {
            return null
          }
        }
        mcpServers[name] = {
          type: 'http',
          url: value.url.trim(),
          ...(headers === undefined ? {} : { headers: headers as Record<string, string> }),
          ...(value.openGetStream === undefined ? {} : { openGetStream: value.openGetStream }),
          ...(value.maxMessageBytes === undefined
            ? {}
            : { maxMessageBytes: value.maxMessageBytes }),
          ...(reconnect === undefined
            ? {}
            : {
                reconnect: reconnect as {
                  initialDelayMs?: number
                  maxDelayMs?: number
                  maxRetries?: number
                },
              }),
        }
        continue
      }
      if (value.type !== undefined && value.type !== 'stdio') return null
      if (
        Object.keys(value).some(
          (key) =>
            ![
              'type',
              'command',
              'args',
              'cwd',
              'env',
              'inheritEnv',
              'stderr',
              'maxMessageBytes',
              'maxStderrBytes',
              'closeTimeoutMs',
            ].includes(key)
        )
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
        (value.inheritEnv !== undefined && typeof value.inheritEnv !== 'boolean') ||
        (value.stderr !== undefined && value.stderr !== 'pipe' && value.stderr !== 'inherit') ||
        (value.maxMessageBytes !== undefined &&
          !isMcpInteger(value.maxMessageBytes, 1, 64 * 1024 * 1024)) ||
        (value.maxStderrBytes !== undefined &&
          !isMcpInteger(value.maxStderrBytes, 1, 1024 * 1024)) ||
        (value.closeTimeoutMs !== undefined && !isMcpInteger(value.closeTimeoutMs, 0, 60_000)) ||
        (env !== undefined &&
          (!isRecord(env) ||
            Object.keys(env).length > 100 ||
            JSON.stringify(env).length > 200_000 ||
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
        type: 'stdio',
        command: command.trim(),
        args: args as string[],
        ...(typeof cwd === 'string' && cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(env === undefined ? {} : { env: env as Record<string, string> }),
        ...(value.inheritEnv === undefined ? {} : { inheritEnv: value.inheritEnv }),
        ...(value.stderr === undefined ? {} : { stderr: value.stderr }),
        ...(value.maxMessageBytes === undefined ? {} : { maxMessageBytes: value.maxMessageBytes }),
        ...(value.maxStderrBytes === undefined ? {} : { maxStderrBytes: value.maxStderrBytes }),
        ...(value.closeTimeoutMs === undefined ? {} : { closeTimeoutMs: value.closeTimeoutMs }),
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
    form.resetForm({
      values: { configurationText: open ? JSON.stringify(configuration, null, 2) : '' },
    })
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
