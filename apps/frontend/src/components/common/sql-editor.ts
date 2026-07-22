import { type CompletionContext, type CompletionSource, startCompletion } from '@codemirror/autocomplete'
import { MariaSQL, MySQL, PostgreSQL, sql, SQLite, StandardSQL } from '@codemirror/lang-sql'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { Decoration, EditorView, keymap, MatchDecorator, ViewPlugin } from '@codemirror/view'
import { tags } from '@lezer/highlight'

export type SqlColumn = { name: string; type?: string; comment?: string }
export type SqlTable = { name: string; columns: SqlColumn[] }
export const sqlDialects = ['standard', 'mysql', 'mariadb', 'postgresql', 'sqlite'] as const
export type SqlDialect = typeof sqlDialects[number]
export type SqlTemplateVariable = {
  name: string
  description?: string
  occurrences: Array<{ from: number; to: number }>
}
export type SqlTemplateIssue = {
  code: 'invalid-variable' | 'unclosed-variable' | 'unexpected-variable-close'
  from: number
  to: number
}
export type SqlTemplateParseResult = { variables: SqlTemplateVariable[]; issues: SqlTemplateIssue[] }
export type SqlEditorDiagnostic = { from: number; to: number; message: string }

const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/
const dialectEditorConfig = {
  standard: {
    dialect: StandardSQL,
    conditionKeywords: ['AND', 'OR', 'GROUP BY', 'ORDER BY', 'FETCH FIRST', 'OFFSET'],
    functions: ['COALESCE', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'EXTRACT', 'NULLIF', 'POSITION', 'SUBSTRING'],
  },
  mysql: {
    dialect: MySQL,
    conditionKeywords: ['AND', 'OR', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'REGEXP'],
    functions: ['COALESCE', 'DATE_FORMAT', 'GROUP_CONCAT', 'IFNULL', 'JSON_EXTRACT', 'LAST_INSERT_ID', 'NULLIF'],
  },
  mariadb: {
    dialect: MariaSQL,
    conditionKeywords: ['AND', 'OR', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'REGEXP'],
    functions: ['COALESCE', 'DATE_FORMAT', 'GROUP_CONCAT', 'IFNULL', 'JSON_VALUE', 'LAST_INSERT_ID', 'NULLIF'],
  },
  postgresql: {
    dialect: PostgreSQL,
    conditionKeywords: ['AND', 'OR', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'ILIKE'],
    functions: ['ARRAY_AGG', 'COALESCE', 'DATE_TRUNC', 'JSONB_BUILD_OBJECT', 'NOW', 'NULLIF', 'STRING_AGG'],
  },
  sqlite: {
    dialect: SQLite,
    conditionKeywords: ['AND', 'OR', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'GLOB'],
    functions: ['COALESCE', 'GROUP_CONCAT', 'IFNULL', 'JULIANDAY', 'JSON_EXTRACT', 'NULLIF', 'STRFTIME'],
  },
} satisfies Record<SqlDialect, {
  dialect: typeof StandardSQL
  conditionKeywords: string[]
  functions: string[]
}>

export function extractSqlTemplateVariables(template: string): SqlTemplateParseResult {
  const variables = new Map<string, SqlTemplateVariable>()
  const issues: SqlTemplateIssue[] = []
  let cursor = 0

  while (cursor < template.length) {
    const from = template.indexOf('{{', cursor)
    const unexpectedClose = template.indexOf('}}', cursor)
    if (unexpectedClose !== -1 && (from === -1 || unexpectedClose < from)) {
      issues.push({ code: 'unexpected-variable-close', from: unexpectedClose, to: unexpectedClose + 2 })
      cursor = unexpectedClose + 2
      continue
    }
    if (from === -1) break
    const close = template.indexOf('}}', from + 2)
    if (close === -1) {
      issues.push({ code: 'unclosed-variable', from, to: template.length })
      break
    }
    const name = template.slice(from + 2, close)
    const to = close + 2
    if (!variableName.test(name)) {
      issues.push({ code: 'invalid-variable', from, to })
    } else {
      const variable = variables.get(name) ?? { name, occurrences: [] }
      variable.occurrences.push({ from, to })
      variables.set(name, variable)
    }
    cursor = to
  }

  return { variables: [...variables.values()], issues }
}

export function extractSqlStructureIssues(sql: string) {
  const issues: Array<{ code: 'unclosed-parenthesis' | 'unexpected-closing-parenthesis'; from: number; to: number }> = []
  const stack: number[] = []
  let quote = ''
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    if (quote) {
      if (character === quote && sql[index + 1] === quote) { index += 1; continue }
      if (character === quote) quote = ''
      continue
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue }
    if (character === '(') stack.push(index)
    if (character === ')') {
      const opening = stack.pop()
      if (opening === undefined) issues.push({ code: 'unexpected-closing-parenthesis', from: index, to: index + 1 })
    }
  }
  return [...issues, ...stack.map((from) => ({ code: 'unclosed-parenthesis' as const, from, to: from + 1 }))]
}

const variableMatcher = new MatchDecorator({
  regexp: /\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/g,
  decoration: () =>
    Decoration.mark({
      class: 'cm-template-variable',
      attributes: { style: 'color: var(--cm-variable); font-weight: bold; background: color-mix(in oklab, var(--cm-variable) 12%, transparent); border-radius: 2px; padding: 0 2px;' },
    }),
})

const variableHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = variableMatcher.createDeco(view) }
    update(update: ViewUpdate) { this.decorations = variableMatcher.updateDeco(update, this.decorations) }
  },
  { decorations: (instance) => instance.decorations }
)

function diagnosticHighlight(diagnostics: SqlEditorDiagnostic[]) {
  return ViewPlugin.fromClass(class {
    decorations = Decoration.set(diagnostics.map((diagnostic) => Decoration.mark({ class: 'cm-sql-diagnostic', attributes: { title: diagnostic.message } }).range(diagnostic.from, diagnostic.to)))
  }, { decorations: (instance) => instance.decorations })
}

const sqlHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--cm-keyword)' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--cm-string)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--cm-number)' },
    { tag: [tags.operatorKeyword, tags.operator], color: 'var(--cm-operator)' },
  ])
)

const templateCompletionActivation = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      const typedTemplateStart = update.docChanged
        && update.transactions.some((transaction) => transaction.isUserEvent('input.type'))
        && update.state.sliceDoc(Math.max(0, update.state.selection.main.head - 2), update.state.selection.main.head) === '{{'
      if (typedTemplateStart) queueMicrotask(() => startCompletion(update.view))
    }
  }
)

export function sqlEditorExtensions(
  dbType: SqlDialect,
  schema: SqlTable[],
  variables: SqlTemplateVariable[],
  diagnostics: SqlEditorDiagnostic[],
  onFormat: () => void
): Extension[] {
  const config = dialectEditorConfig[dbType]
  const variableCompletion: CompletionSource = (context: CompletionContext) => {
    const word = context.matchBefore(/\{\{(?:[A-Za-z_][A-Za-z0-9_]*)?/)
    if (!word) return null
    return {
      from: word.from,
      options: variables.map((variable) => ({ label: `{{${variable.name}}}`, type: 'variable', detail: variable.description ?? 'Variable' })),
      validFor: /\{\{(?:[A-Za-z_][A-Za-z0-9_]*)?/,
    }
  }
  const contextCompletion: CompletionSource = (context: CompletionContext) => {
    const textBefore = context.state.sliceDoc(0, context.pos)
    if (!/\s$/.test(textBefore)) return null
    const statement = textBefore.slice(textBefore.lastIndexOf(';') + 1)
    const clauses = [...statement.matchAll(/\b(WHERE|ON|HAVING|GROUP\s+BY|ORDER\s+BY|LIMIT)\b/gi)]
    const lastClause = clauses.at(-1)?.[1]?.toUpperCase()
    if (!lastClause || ['GROUP BY', 'ORDER BY', 'LIMIT', 'FETCH FIRST', 'OFFSET'].includes(lastClause)) return null
    return { from: context.pos, options: config.conditionKeywords.map((label, index) => ({ label, type: 'keyword', boost: 10 - index })) }
  }
  const functionCompletion: CompletionSource = (context: CompletionContext) => {
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/)
    if (!word && !context.explicit) return null
    return {
      from: word?.from ?? context.pos,
      options: config.functions.map((label) => ({ label, type: 'function' })),
      validFor: /[A-Za-z_][A-Za-z0-9_]*/,
    }
  }
  const sourceCompletion: CompletionSource = (context: CompletionContext) => {
    const text = context.state.doc.toString()
    const columns = new Map(schema.map((table) => [table.name, table.columns.map((column) => column.name)]))
    for (const match of text.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi)) {
      const table = match[1]
      const alias = match[2]
      if (table && alias && columns.has(table)) columns.set(alias, columns.get(table) ?? [])
    }
    for (const match of text.matchAll(/(?:\bWITH|,)\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?\s+AS\s*\(/gi)) {
      if (match[1]) columns.set(match[1], match[2]?.split(',').map((column) => column.trim()).filter(Boolean) ?? [])
    }
    const member = context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)?/)
    if (!member) return null
    const [, source] = member.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\./) ?? []
    if (!source || !columns.has(source)) return null
    return { from: member.from + source.length + 1, options: (columns.get(source) ?? []).map((label) => ({ label, type: 'property' })), validFor: /[A-Za-z0-9_]*/ }
  }

  return [
    sql({
      dialect: config.dialect,
      schema: Object.fromEntries(schema.map((table) => [table.name, table.columns.map((column) => column.name)])),
    }),
    sqlHighlighting,
    variableHighlight,
    diagnosticHighlight(diagnostics),
    templateCompletionActivation,
    EditorState.languageData.of(() => [{ autocomplete: (context: CompletionContext) => variableCompletion(context) ?? sourceCompletion(context) ?? contextCompletion(context) ?? functionCompletion(context) }]),
    keymap.of([{ key: 'Shift-Alt-f', run: () => { onFormat(); return true } }]),
  ]
}
