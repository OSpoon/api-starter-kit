<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import { placeholder } from '@codemirror/view'
import type { ColumnDef } from '@tanstack/vue-table'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { h, toRaw } from 'vue'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import CodeEditor from '@/components/common/CodeEditor.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type AgentMcpServer,
  type AgentMcpTool,
  testAgentMcpConnection,
} from '@/features/agent-config/api'
import { firstFormError } from '@/lib/form-validation'
import { useAuthStore } from '@/stores/auth'

type ToolConfiguration = AgentMcpServer['enabledTools'][string]
type McpServerInput = {
  configurationText: string
  enabledTools: Record<string, ToolConfiguration>
}
type McpServerSaveInput = {
  name: string
  command: string
  args: string[]
  cwd?: string | null
  environment?: Record<string, string>
  enabledTools: McpServerInput['enabledTools']
}

const props = defineProps<{
  open: boolean
  server: AgentMcpServer | null
  saving: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [value: McpServerSaveInput]
}>()
const { t } = useI18n()
const auth = useAuthStore()
const discovering = ref(false)
const discoveredTools = ref<AgentMcpTool[]>([])
const configurationPlaceholder = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        logs: {
          command: 'npx',
          args: ['--no-install', 'logs-mcp', '--log-dir', '/absolute/path/to/logs'],
        },
      },
    },
    null,
    2
  )
)
const configurationEditorExtensions = computed(() => [
  json(),
  placeholder(configurationPlaceholder.value),
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseMcpConfiguration(value: string) {
  try {
    const document: unknown = JSON.parse(value)
    if (!isRecord(document) || !isRecord(document.mcpServers)) return null
    const servers = Object.entries(document.mcpServers)
    if (servers.length !== 1) return null
    const [name, server] = servers[0]!
    if (!name.trim() || !isRecord(server)) return null
    if (server.type !== undefined && server.type !== 'stdio') return null
    if (Object.keys(server).some((key) => !['type', 'command', 'args', 'cwd', 'env'].includes(key)))
      return null

    const { command, args = [], cwd, env } = server
    if (
      typeof command !== 'string' ||
      !command.trim() ||
      !Array.isArray(args) ||
      args.length > 100 ||
      args.some((argument) => typeof argument !== 'string') ||
      (cwd !== undefined && typeof cwd !== 'string') ||
      (env !== undefined &&
        (!isRecord(env) || Object.values(env).some((value) => typeof value !== 'string')))
    ) {
      return null
    }
    return {
      name: name.trim(),
      command: command.trim(),
      args: args as string[],
      cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : null,
      ...(env === undefined ? {} : { environment: env as Record<string, string> }),
    }
  } catch {
    return null
  }
}

function serializeMcpConfiguration(server: AgentMcpServer) {
  return JSON.stringify(
    {
      mcpServers: {
        [server.name]: {
          command: server.command,
          args: server.args,
          ...(server.cwd ? { cwd: server.cwd } : {}),
        },
      },
    },
    null,
    2
  )
}

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
      enabledTools: z.record(z.string(), z.object({ mode: z.enum(['read', 'confirm']) })),
    })
  )
)
const emptyValues = (): McpServerInput => ({
  configurationText: '',
  enabledTools: {},
})
const form = useForm<McpServerInput>({ validationSchema: formSchema, initialValues: emptyValues() })

watch(
  () => [props.open, props.server] as const,
  ([open, server]) => {
    if (!open) {
      form.setFieldValue('configurationText', '')
      return
    }
    form.resetForm({
      values: server
        ? {
            configurationText: serializeMcpConfiguration(server),
            enabledTools: structuredClone(toRaw(server.enabledTools)),
          }
        : emptyValues(),
    })
    discoveredTools.value = []
  }
)

function isToolEnabled(name: string) {
  return Boolean(form.values.enabledTools[name])
}

function toggleTool(name: string, value: boolean | 'indeterminate') {
  const enabledTools = { ...form.values.enabledTools }
  if (value === true) {
    const tool = discoveredTools.value.find((item) => item.name === name)
    enabledTools[name] = enabledTools[name] ?? {
      mode: tool?.readOnlyHint ? 'read' : 'confirm',
    }
  } else delete enabledTools[name]
  form.setFieldValue('enabledTools', enabledTools)
}

function setToolMode(name: string, mode: ToolConfiguration['mode']) {
  const current = form.values.enabledTools[name]
  if (!current) return
  form.setFieldValue('enabledTools', {
    ...form.values.enabledTools,
    [name]: { ...current, mode },
  })
}

const toolColumns = computed<ColumnDef<AgentMcpTool>[]>(() => [
  {
    id: 'enabled',
    meta: { label: t('agent_config.enabled') },
    header: () => t('agent_config.enabled'),
    cell: ({ row }) =>
      h(Checkbox, {
        modelValue: isToolEnabled(row.original.name),
        disabled: props.saving || discovering.value,
        'aria-label': t('agent_config.mcp_enable_tool', { name: row.original.name }),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          toggleTool(row.original.name, value),
      }),
  },
  {
    accessorKey: 'name',
    meta: { label: t('agent_config.tool_name') },
    header: () => t('agent_config.tool_name'),
    cell: ({ row }) =>
      h('div', { class: 'min-w-0 space-y-1' }, [
        h('div', { class: 'font-medium break-all' }, row.original.name),
        h(
          'p',
          {
            class: 'line-clamp-2 whitespace-normal text-xs text-muted-foreground',
            title: row.original.description,
          },
          row.original.description
        ),
        ...(row.original.readOnlyHint
          ? [
              h(
                'p',
                { class: 'text-xs text-muted-foreground' },
                t('agent_config.mcp_readonly_hint')
              ),
            ]
          : []),
      ]),
  },
  {
    id: 'mode',
    meta: { label: t('agent_config.mcp_execution_policy') },
    header: () => t('agent_config.mcp_execution_policy'),
    cell: ({ row }) => {
      const name = row.original.name
      if (!isToolEnabled(name)) return h('span', { class: 'text-muted-foreground' }, '—')
      return h(
        Select,
        {
          modelValue: form.values.enabledTools[name]?.mode ?? 'confirm',
          disabled: props.saving || discovering.value,
          'aria-label': t('agent_config.mcp_execution_policy'),
          'onUpdate:modelValue': (mode: unknown) =>
            setToolMode(name, mode as ToolConfiguration['mode']),
        },
        () => [
          h(SelectTrigger, { class: 'w-48' }, () => h(SelectValue)),
          h(SelectContent, {}, () => [
            h(SelectItem, { value: 'read', disabled: !row.original.readOnlyHint }, () =>
              t('agent_config.mcp_mode_read')
            ),
            h(SelectItem, { value: 'confirm' }, () => t('agent_config.mcp_mode_confirm')),
          ]),
        ]
      )
    },
  },
])

async function discover() {
  const validation = await form.validate()
  if (!validation.valid) {
    toast.error(firstFormError(validation.errors, t('common.form_check_errors')))
    return
  }
  const configuration = parseMcpConfiguration(form.values.configurationText)
  if (!configuration) {
    toast.error(t('agent_config.mcp_configuration_invalid'))
    return
  }
  discovering.value = true
  try {
    const toolsResult = await testAgentMcpConnection(auth.token, {
      ...configuration,
      ...(props.server ? { serverId: props.server.id } : {}),
    })
    const discovered = toolsResult.tools
    discoveredTools.value = discovered
    const discoveredNames = new Set(discovered.map((tool) => tool.name))
    const readOnlyTools = new Set(
      discovered.filter((tool) => tool.readOnlyHint).map((tool) => tool.name)
    )
    const enabledTools = Object.fromEntries(
      Object.entries(form.values.enabledTools).filter(([name]) => discoveredNames.has(name))
    )
    for (const [name, configuration] of Object.entries(enabledTools)) {
      if (configuration.mode === 'read' && !readOnlyTools.has(name)) {
        enabledTools[name] = { ...configuration, mode: 'confirm' }
      }
    }
    form.setFieldValue('enabledTools', enabledTools)
    toast.success(t('agent_config.mcp_discovered', { count: discoveredTools.value.length }))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_discover_failed'))
  } finally {
    discovering.value = false
  }
}

const submit = form.handleSubmit(
  (values) => {
    const configuration = parseMcpConfiguration(values.configurationText)
    if (!configuration) {
      toast.error(t('agent_config.mcp_configuration_invalid'))
      return
    }
    emit('save', {
      ...configuration,
      enabledTools: values.enabledTools,
    })
  },
  ({ errors }) => toast.error(firstFormError(errors, t('common.form_check_errors')))
)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <FormDialogContent
      :title="server ? t('agent_config.edit_mcp') : t('agent_config.create_mcp')"
      :description="t('agent_config.mcp_dialog_description')"
      class="sm:max-w-3xl"
    >
      <form class="flex min-h-0 flex-1 flex-col overflow-hidden" @submit.prevent="submit">
        <div class="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-6 py-4">
          <FormField v-slot="{ componentField }" name="configurationText" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('agent_config.mcp_configuration') }}</FormLabel>
              <FormControl>
                <CodeEditor
                  v-bind="componentField"
                  :model-value="String(componentField.modelValue ?? '')"
                  class="h-64 rounded-md border bg-background"
                  :extensions="configurationEditorExtensions"
                  :aria-label="t('agent_config.mcp_configuration')"
                />
              </FormControl>
              <p class="text-xs text-muted-foreground">
                {{ t('agent_config.mcp_configuration_hint') }}
              </p>
              <FormMessage />
            </FormItem>
          </FormField>

          <section class="space-y-3 rounded-lg border p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="text-sm font-medium">{{ t('agent_config.mcp_tools') }}</h3>
                <p class="text-xs text-muted-foreground">
                  {{ t('agent_config.mcp_tools_description') }}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="discovering"
                @click="discover"
              >
                {{ discovering ? t('common.loading') : t('agent_config.mcp_discover') }}
              </Button>
            </div>
            <p v-if="!discoveredTools.length" class="text-sm text-muted-foreground">
              {{ t('agent_config.mcp_tools_empty') }}
            </p>
            <DataTable
              v-else
              class="min-h-64"
              :columns="toolColumns"
              :data="discoveredTools"
              :show-search="false"
              :show-view="false"
              :empty-message="t('agent_config.mcp_tools_empty')"
            />
          </section>
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
