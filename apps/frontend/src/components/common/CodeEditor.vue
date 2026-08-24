<script setup lang="ts">
import { indentWithTab } from '@codemirror/commands'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState } from '@codemirror/state'
import type { ViewUpdate } from '@codemirror/view'
import { EditorView, keymap, tooltips } from '@codemirror/view'
import { basicSetup } from 'codemirror'

const props = withDefaults(
  defineProps<{
    modelValue: string
    readonly?: boolean
    extensions?: Extension[]
  }>(),
  { readonly: false, extensions: () => [] }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  mount: [view: EditorView]
}>()

const editorElement = ref<HTMLElement | null>(null)
let view: EditorView | null = null
const readonlyCompartment = new Compartment()
const extensionsCompartment = new Compartment()
const themeCompartment = new Compartment()
let themeObserver: MutationObserver | null = null

function readonlyExtensions(readonly: boolean) {
  return [readonly ? EditorState.readOnly.of(true) : [], EditorView.editable.of(!readonly)]
}

function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': { color: 'var(--foreground)', backgroundColor: 'var(--card)' },
      '.cm-gutters': {
        color: 'var(--muted-foreground)',
        backgroundColor: 'var(--muted)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLineGutter': {
        color: 'var(--destructive-foreground)',
        backgroundColor: 'var(--destructive)',
      },
      '.cm-activeLine': { backgroundColor: 'var(--muted)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--destructive)',
      },
      '.cm-content ::selection, &.cm-focused .cm-content ::selection': {
        color: 'var(--destructive-foreground) !important',
        backgroundColor: 'var(--destructive) !important',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
      '.cm-tooltip': {
        color: 'var(--popover-foreground)',
        backgroundColor: 'var(--popover)',
        border: '1px solid var(--border)',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        color: 'var(--accent-foreground)',
        backgroundColor: 'var(--accent)',
      },
      '.cm-matchingBracket': {
        color: 'var(--cm-variable) !important',
        backgroundColor: 'transparent',
      },
    },
    { dark }
  )
}

function syncTheme() {
  view?.dispatch({
    effects: themeCompartment.reconfigure(
      editorTheme(document.documentElement.classList.contains('dark'))
    ),
  })
}

function createEditor() {
  if (!editorElement.value) return
  const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
  })
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        themeCompartment.of(editorTheme(document.documentElement.classList.contains('dark'))),
        updateListener,
        readonlyCompartment.of(readonlyExtensions(props.readonly)),
        extensionsCompartment.of(props.extensions),
        tooltips({ parent: document.body }),
      ],
    }),
    parent: editorElement.value,
  })
  emit('mount', view)
}

function replaceDocument(value: string, selection?: { anchor: number; head: number }) {
  if (!view) return false
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection,
    scrollIntoView: true,
    userEvent: 'input.format',
  })
  return true
}

onMounted(() => {
  createEditor()
  themeObserver = new MutationObserver(syncTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})
onUnmounted(() => {
  themeObserver?.disconnect()
  view?.destroy()
})

watch(
  () => props.modelValue,
  (value) => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }
)
watch(
  () => props.extensions,
  (extensions) => {
    view?.dispatch({ effects: extensionsCompartment.reconfigure(extensions) })
  }
)
watch(
  () => props.readonly,
  (readonly) => {
    view?.dispatch({ effects: readonlyCompartment.reconfigure(readonlyExtensions(readonly)) })
  }
)

defineExpose({
  getView: () => view,
  getDoc: () => view?.state.doc.toString() ?? '',
  replaceDocument,
})
</script>

<template>
  <div ref="editorElement" class="code-editor size-full overflow-hidden" />
</template>

<style>
.code-editor {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 13px;
}
.code-editor .cm-editor {
  height: 100%;
}
.code-editor .cm-scroller {
  overflow: auto;
}
.code-editor {
  --cm-keyword: oklch(0.5 0.18 25);
  --cm-string: oklch(0.48 0.08 120);
  --cm-number: oklch(0.5 0.1 55);
  --cm-variable: oklch(0.5 0.1 55);
  --cm-operator: oklch(0.42 0.08 250);
}
.dark .code-editor {
  --cm-keyword: oklch(0.74 0.14 30);
  --cm-string: oklch(0.72 0.08 125);
  --cm-number: oklch(0.8 0.1 65);
  --cm-variable: oklch(0.8 0.1 65);
  --cm-operator: oklch(0.72 0.08 250);
}
.code-editor .cm-sql-diagnostic {
  text-decoration: underline wavy var(--destructive);
  text-underline-offset: 3px;
  background: color-mix(in oklab, var(--destructive) 9%, transparent);
}
</style>
