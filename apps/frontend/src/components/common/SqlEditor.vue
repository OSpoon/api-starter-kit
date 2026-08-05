<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import { Braces, CheckCircle2, CircleAlert, Eraser } from '@lucide/vue'
import { format, type FormatOptionsWithLanguage } from 'sql-formatter'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import CodeEditor from './CodeEditor.vue'
import {
  extractSqlStructureIssues,
  extractSqlTemplateVariables,
  type SqlDialect,
  sqlDialects,
  type SqlEditorDiagnostic,
  sqlEditorExtensions,
  type SqlTable,
  type SqlTemplateIssue,
  type SqlTemplateVariable,
} from './sql-editor'

const props = withDefaults(
  defineProps<{
    modelValue: string
    variableDescriptions?: Record<string, string | undefined>
    dbType?: SqlDialect
    schema?: SqlTable[]
    readonly?: boolean
    hideToolbar?: boolean
    schemaSynced?: boolean
    dialectSelectable?: boolean
  }>(),
  {
    variableDescriptions: () => ({}),
    dbType: 'mysql',
    schema: () => [],
    readonly: false,
    hideToolbar: false,
    schemaSynced: false,
    dialectSelectable: true,
  }
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:dbType': [value: SqlDialect]
  'variables-change': [variables: SqlTemplateVariable[]]
  'validation-change': [valid: boolean]
}>()
const { t } = useI18n()
const editorRef = ref<InstanceType<typeof CodeEditor> | null>(null)
const syntaxError = ref<string | null>(null)
const fullWidthChars = /[；，。“”（）]/
const templateVariablePattern = /\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/g
const parsedTemplate = computed(() => extractSqlTemplateVariables(props.modelValue))
const diagnostics = computed<SqlEditorDiagnostic[]>(() => [
  ...parsedTemplate.value.issues.map((issue) => ({ ...issue, message: issueMessage(issue) })),
  ...extractSqlStructureIssues(props.modelValue).map((issue) => ({
    ...issue,
    message: t(`sql_editor.validation.${issue.code}`),
  })),
])
const variables = computed(() =>
  parsedTemplate.value.variables.map((variable) => ({
    ...variable,
    description: props.variableDescriptions[variable.name],
  }))
)

function sqlFormatOptions(): FormatOptionsWithLanguage {
  return {
    language: props.dbType === 'standard' ? 'sql' : props.dbType,
    keywordCase: 'upper' as const,
    linesBetweenQueries: 2,
  }
}
function maskTemplateVariables(sql: string) {
  const variables: string[] = []
  const masked = sql.replace(templateVariablePattern, (match) => {
    variables.push(match)
    return `__TPL_VAR_${variables.length - 1}__`
  })
  return { masked, variables }
}
function remapPosition(position: number, original: string, formatted: string) {
  const originalMatches = [...original.matchAll(templateVariablePattern)]
  const containingMatch = originalMatches.find((match) => {
    const from = match.index ?? 0
    return position >= from && position <= from + match[0].length
  })
  if (containingMatch) {
    const matchingOccurrences = originalMatches.filter((match) => match[0] === containingMatch[0])
    const occurrenceIndex = matchingOccurrences.indexOf(containingMatch)
    const formattedMatch = [...formatted.matchAll(templateVariablePattern)].filter(
      (match) => match[0] === containingMatch[0]
    )[occurrenceIndex]
    if (formattedMatch?.index !== undefined)
      return (
        formattedMatch.index +
        Math.min(position - (containingMatch.index ?? 0), containingMatch[0].length)
      )
  }
  return Math.min(
    formatted.length,
    Math.round((position / Math.max(original.length, 1)) * formatted.length)
  )
}
function formatSql() {
  try {
    const { masked, variables } = maskTemplateVariables(props.modelValue)
    const formatted = format(masked, sqlFormatOptions()).replace(
      /__TPL_VAR_(\d+)__/g,
      (_, index) => variables[Number(index)] ?? `__TPL_VAR_${index}__`
    )
    const selection = editorRef.value?.getView()?.state.selection.main
    const nextSelection = selection && {
      anchor: remapPosition(selection.anchor, props.modelValue, formatted),
      head: remapPosition(selection.head, props.modelValue, formatted),
    }
    if (!editorRef.value?.replaceDocument(formatted, nextSelection))
      emit('update:modelValue', formatted)
    syntaxError.value = null
  } catch {
    syntaxError.value = t('sql_editor.validation.format_failed')
  }
}

const extensions = computed(() =>
  sqlEditorExtensions(props.dbType, props.schema, variables.value, diagnostics.value, formatSql)
)

function validateSql() {
  const issue = diagnostics.value[0]
  if (fullWidthChars.test(stripQuotedStrings(props.modelValue))) {
    syntaxError.value = t('sql_editor.validation.full_width')
  } else if (issue) {
    syntaxError.value = issue.message
  } else {
    try {
      format(
        maskTemplateVariables(props.modelValue).masked.replace(/__TPL_VAR_\d+__/g, '?'),
        sqlFormatOptions()
      )
      syntaxError.value = null
    } catch {
      syntaxError.value = t('sql_editor.validation.invalid_sql')
    }
  }
  return syntaxError.value === null
}
function stripQuotedStrings(sql: string) {
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, '')
}
function clearSql() {
  emit('update:modelValue', '')
}
function selectDialect(value: string) {
  if (sqlDialects.includes(value as SqlDialect)) emit('update:dbType', value as SqlDialect)
}
function insertVariable(variableName: string) {
  const view = editorRef.value?.getView()
  if (!view) return
  const selection = view.state.selection.main
  const value = `{{${variableName}}}`
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: value },
    selection: { anchor: selection.from + value.length },
    userEvent: 'input.type',
  })
  view.focus()
}
function issueMessage(issue: SqlTemplateIssue) {
  return t(`sql_editor.validation.${issue.code}`)
}
function focusVariable(variable: SqlTemplateVariable) {
  const occurrence = variable.occurrences[0]
  const view = editorRef.value?.getView()
  if (!occurrence || !view) return
  view.dispatch({
    selection: { anchor: occurrence.from, head: occurrence.to },
    scrollIntoView: true,
  })
  view.focus()
}
function onEditorMount(_view: EditorView) {
  validateSql()
}

watch(
  parsedTemplate,
  () => {
    emit('variables-change', variables.value)
    emit('validation-change', validateSql())
  },
  { immediate: true }
)
defineExpose({ formatSql, validateSql, insertVariable, focusVariable, validate: validateSql })
</script>

<template>
  <div
    class="group flex h-full min-h-[380px] flex-col overflow-hidden rounded-md border border-border bg-card font-mono text-sm text-card-foreground shadow-inner transition-colors duration-200"
    :class="{ 'min-h-[150px]': hideToolbar }"
  >
    <div
      v-if="!hideToolbar"
      class="flex h-10 items-center justify-between border-b border-border bg-muted/50 px-3 py-1"
    >
      <div class="flex items-center gap-2">
        <template v-if="dialectSelectable">
          <Label
            for="sql-editor-dialect"
            class="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 font-mono text-[10px] font-bold tracking-wider text-muted-foreground"
            ><span class="size-1.5 animate-pulse rounded-full bg-chart-3" />SQL</Label
          >
          <Select
            :model-value="dbType"
            :disabled="readonly"
            @update:model-value="selectDialect(String($event))"
          >
            <SelectTrigger
              id="sql-editor-dialect"
              :aria-label="t('sql_editor.dialect_label')"
              class="h-6 min-w-0 border-0 bg-transparent px-1 font-sans text-[11px] font-medium tracking-wide text-muted-foreground uppercase shadow-none transition-none focus-visible:border-0 focus-visible:ring-0"
              ><SelectValue
            /></SelectTrigger>
            <SelectContent class="min-w-36 font-sans">
              <SelectItem
                v-for="dialect in sqlDialects"
                :key="dialect"
                :value="dialect"
                class="text-xs focus:bg-muted focus:text-foreground data-[state=checked]:bg-muted data-[state=checked]:text-foreground"
                >{{ t(`sql_editor.dialects.${dialect}`) }}</SelectItem
              >
            </SelectContent>
          </Select>
        </template>
        <template v-else>
          <div
            class="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[10px] font-bold tracking-wider text-muted-foreground"
          >
            <span class="size-1.5 animate-pulse rounded-full bg-chart-3" />SQL
          </div>
          <span
            class="font-sans text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            >{{ dbType }}</span
          >
        </template>
      </div>
      <div
        class="flex items-center gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          :aria-label="t('sql_editor.actions.format')"
          :title="t('sql_editor.actions.format')"
          @click="formatSql"
          ><Braces class="size-3.5"
        /></Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          :aria-label="t('sql_editor.actions.clear')"
          :title="t('sql_editor.actions.clear')"
          @click="clearSql"
          ><Eraser class="size-3.5"
        /></Button>
      </div>
    </div>
    <div
      v-if="variables.length && !hideToolbar"
      class="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/30 px-3 py-1.5"
    >
      <span class="text-[10px] font-bold whitespace-nowrap text-muted-foreground uppercase">{{
        t('sql_editor.variables')
      }}</span>
      <div class="flex gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          v-for="variable in variables"
          :key="variable.name"
          type="button"
          class="inline-flex h-5 items-center rounded border border-border bg-background px-2 text-[10px] font-medium text-foreground shadow-sm hover:bg-muted"
          :title="variable.description ?? variable.name"
          @click="focusVariable(variable)"
        >
          {{ variable.name }}
        </Button>
      </div>
    </div>
    <div class="relative min-h-[120px] flex-1 overflow-hidden">
      <CodeEditor
        ref="editorRef"
        :model-value="modelValue"
        :readonly="readonly"
        :extensions="extensions"
        @update:model-value="emit('update:modelValue', $event)"
        @mount="onEditorMount"
      />
      <div
        v-if="!modelValue && !readonly"
        class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20"
      >
        <div class="flex flex-col items-center gap-3">
          <Braces class="size-10 text-muted-foreground" />
          <p class="text-[11px] font-medium text-muted-foreground">{{ t('sql_editor.empty') }}</p>
        </div>
      </div>
    </div>
    <div
      v-if="!hideToolbar"
      class="flex min-h-6 items-center justify-between border-t border-border bg-muted/50 px-2 text-[10px] text-muted-foreground"
      :class="{ 'border-destructive/30 bg-destructive/5': syntaxError }"
    >
      <div class="flex min-w-0 items-center gap-3">
        <span v-if="syntaxError" class="flex min-w-0 items-center gap-1 text-destructive"
          ><CircleAlert class="size-3 shrink-0" /><span class="truncate">{{
            syntaxError
          }}</span></span
        >
        <span v-if="schemaSynced && schema.length" class="flex items-center gap-1"
          ><CheckCircle2 class="size-3 text-chart-3" />{{ t('sql_editor.schema_sync') }}</span
        ><span v-if="variables.length" class="flex items-center gap-1"
          ><Braces class="size-3 text-chart-4" />{{
            t('sql_editor.var_count', { count: variables.length })
          }}</span
        >
      </div>
      <span class="italic opacity-60">{{ t('sql_editor.powered_by') }}</span>
    </div>
  </div>
</template>
