<script setup lang="ts" generic="TData, TValue">
import { Check, Minus, SlidersHorizontal, X } from '@lucide/vue'
import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Updater,
  VisibilityState,
} from '@tanstack/vue-table'
import {
  FlexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import type { Ref } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTablePreferences } from '@/lib/browser-preferences'

type ServerPagination = {
  page: number
  pageCount: number
}

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    searchKeys?: string[]
    searchPlaceholder?: string
    showSearch?: boolean
    showView?: boolean
    getSearchableText?: (row: TData) => string
    emptyMessage?: string
    storageKey?: string
    searchId?: string
    serverPagination?: ServerPagination
    searchMode?: 'local' | 'remote'
    filtersLayout?: 'wrap' | 'inline'
    selectable?: boolean
    getRowId?: (row: TData) => string
    isRowSelectable?: (row: TData) => boolean
    selectionDisabled?: boolean
  }>(),
  {
    showSearch: true,
    showView: true,
    filtersLayout: 'inline',
    selectable: false,
    selectionDisabled: false,
  }
)

const search = defineModel<string>('search', { default: '' })

const emit = defineEmits<{
  pageChange: [page: number]
  selectionChange: [rows: TData[]]
}>()

const { t } = useI18n()

const sorting = ref<SortingState>([])
const columnFilters = ref<ColumnFiltersState>([])
const rowSelection = ref<RowSelectionState>({})
const persistedPreferences = props.storageKey ? useTablePreferences(props.storageKey) : null
const columnVisibility = persistedPreferences?.columnVisibility ?? ref<VisibilityState>({})
const pagination =
  persistedPreferences?.pagination ?? ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

const hasSearch = computed(
  () => props.showSearch && Boolean(props.searchKeys?.length || props.getSearchableText)
)
const showView = computed(() => props.showView)
const pageCount = computed(() => props.serverPagination?.pageCount ?? table.getPageCount())
const currentPage = computed(() => props.serverPagination?.page ?? pagination.value.pageIndex + 1)

const resolvedSearchKeys = computed(() => props.searchKeys ?? [])

const table = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  getRowId: (row, index) => props.getRowId?.(row) ?? String(index),
  enableRowSelection: (row) => props.selectable && (props.isRowSelectable?.(row.original) ?? true),
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  autoResetPageIndex: false,
  manualPagination: Boolean(props.serverPagination),
  manualFiltering: props.searchMode === 'remote',
  globalFilterFn: (row, _columnId, filterValue) => {
    const keyword = String(filterValue ?? '')
      .trim()
      .toLowerCase()
    if (!keyword) {
      return true
    }

    if (props.getSearchableText) {
      return props.getSearchableText(row.original).toLowerCase().includes(keyword)
    }

    return resolvedSearchKeys.value.some((key) => {
      const value = (row.original as Record<string, unknown>)[key]
      return String(value ?? '')
        .toLowerCase()
        .includes(keyword)
    })
  },
  onSortingChange: (updaterOrValue) => valueUpdater(updaterOrValue, sorting),
  onColumnFiltersChange: (updaterOrValue) => valueUpdater(updaterOrValue, columnFilters),
  onColumnVisibilityChange: (updaterOrValue) => valueUpdater(updaterOrValue, columnVisibility),
  onRowSelectionChange: (updaterOrValue) => valueUpdater(updaterOrValue, rowSelection),
  onPaginationChange: (updaterOrValue) => valueUpdater(updaterOrValue, pagination),
  onGlobalFilterChange: (updaterOrValue) => {
    const next =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(search.value)
        : String(updaterOrValue ?? '')
    search.value = next
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get columnFilters() {
      return columnFilters.value
    },
    get columnVisibility() {
      return columnVisibility.value
    },
    get rowSelection() {
      return rowSelection.value
    },
    get globalFilter() {
      return search.value
    },
    get pagination() {
      return pagination.value
    },
  },
})

const selectedRows = computed(() => table.getSelectedRowModel().rows.map((row) => row.original))
const dataTable = useTemplateRef<HTMLDivElement>('dataTable')
const preferredMotion = usePreferredReducedMotion()
const selectionToolbarVisible = ref(false)
const displayedSelectionCount = ref(0)
const selectionFooter = useTemplateRef<HTMLDivElement>('selectionFooter')
const selectionActions = useTemplateRef<HTMLDivElement>('selectionActions')
const paginationContainer = useTemplateRef<HTMLDivElement>('paginationContainer')
const measurementOptions = { updateTiming: 'next-frame' as const }
const { width: footerWidth } = useElementBounding(selectionFooter, measurementOptions)
const { width: actionsWidth } = useElementBounding(selectionActions, measurementOptions)
const { width: paginationWidth } = useElementBounding(paginationContainer, measurementOptions)
const selectionSharesFooterRow = computed(
  () =>
    props.selectable &&
    selectionToolbarVisible.value &&
    footerWidth.value >= actionsWidth.value * 1.05 + paginationWidth.value * 2 + 24
)
const pageSelectableRows = computed(() =>
  table.getRowModel().rows.filter((row) => row.getCanSelect())
)
const pageSelectionState = computed(() => {
  const rows = pageSelectableRows.value
  const selectedCount = rows.filter((row) => row.getIsSelected()).length
  if (selectedCount === 0) return false
  return selectedCount === rows.length ? true : 'indeterminate'
})

function clearSelection() {
  if (selectionActions.value?.contains(document.activeElement)) {
    dataTable.value?.querySelector<HTMLButtonElement>('[data-table-select-page]')?.focus()
  }
  table.resetRowSelection()
}

function finishSelectionLeave() {
  if (!selectedRows.value.length) selectionToolbarVisible.value = false
}

function enableSelectionInteraction(element: Element) {
  ;(element as HTMLElement).inert = false
}

function disableSelectionInteraction(element: Element) {
  ;(element as HTMLElement).inert = true
}

function handleSelectionKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || props.selectionDisabled || !selectedRows.value.length) return
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select, [role="combobox"]')) return

  if (event.key === 'Escape') {
    if (target.closest('[data-slot="dropdown-menu-trigger"], [data-slot="dropdown-menu-content"]'))
      return
    event.preventDefault()
    clearSelection()
    return
  }

  const buttons = Array.from(
    selectionActions.value?.querySelectorAll<HTMLButtonElement>(
      'button:not(:disabled):not([aria-disabled="true"])'
    ) ?? []
  ).filter((button) => button.getClientRects().length > 0)
  if (!buttons.length) return
  const index = buttons.findIndex((button) => button === document.activeElement)
  let nextIndex: number
  switch (event.key) {
    case 'ArrowRight':
      nextIndex = (index + 1) % buttons.length
      break
    case 'ArrowLeft':
      nextIndex = (index - 1 + buttons.length) % buttons.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = buttons.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  buttons[nextIndex]?.focus()
}

watch(selectedRows, (rows) => {
  if (rows.length) {
    displayedSelectionCount.value = rows.length
    selectionToolbarVisible.value = true
  }
})
watch(selectedRows, (rows) => emit('selectionChange', rows))
watch(() => props.data, clearSelection, { flush: 'sync', deep: true })

// Selection belongs to the current page and dataset, never to stale row indices.
watch(
  [
    () => props.selectable,
    () => pageSelectableRows.value.map((row) => row.id).join('\0'),
    currentPage,
    () => pagination.value.pageSize,
    search,
    sorting,
    columnFilters,
  ],
  clearSelection,
  { flush: 'sync' }
)

defineExpose({ clearSelection })

watch(search, () => {
  pagination.value = { ...pagination.value, pageIndex: 0 }
})

watchEffect(() => {
  const pageCount = table.getPageCount()
  if (pageCount > 0 && pagination.value.pageIndex >= pageCount) {
    pagination.value = { ...pagination.value, pageIndex: pageCount - 1 }
  }
})

function valueUpdater<T extends Updater<unknown>>(updaterOrValue: T, target: Ref<unknown>) {
  target.value =
    typeof updaterOrValue === 'function'
      ? (updaterOrValue as (old: unknown) => unknown)(target.value)
      : updaterOrValue
}

function searchPlaceholderText() {
  if (props.searchPlaceholder) {
    return props.searchPlaceholder
  }

  const keys = resolvedSearchKeys.value
  if (keys.length === 1) {
    return t('common.filter_placeholder', {
      key: keys[0]!.charAt(0).toUpperCase() + keys[0]!.slice(1),
    })
  }

  return t('common.search_placeholder')
}

function columnLabel(column: Column<TData, unknown>) {
  const meta = column.columnDef.meta as { label?: string } | undefined
  return meta?.label ?? column.id
}

function handlePageChange(page: number) {
  clearSelection()
  if (props.serverPagination) {
    emit('pageChange', page)
    return
  }
  table.setPageIndex(page - 1)
}
</script>

<template>
  <div ref="dataTable" class="data-table flex min-h-0 min-w-0 flex-1 flex-col gap-4">
    <div class="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div
        :class="
          filtersLayout === 'inline'
            ? 'flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-x-auto'
            : 'flex flex-wrap items-center gap-3'
        "
      >
        <slot name="filters" />
        <Label v-if="hasSearch" :for="searchId ?? 'data-table-search'">{{
          t('common.search')
        }}</Label>
        <Input
          v-if="hasSearch"
          :id="searchId ?? 'data-table-search'"
          :class="filtersLayout === 'inline' ? 'shrink-0' : 'max-w-sm min-w-55'"
          :style="filtersLayout === 'inline' ? { width: '14rem' } : undefined"
          :placeholder="searchPlaceholderText()"
          :model-value="search"
          @update:model-value="table.setGlobalFilter($event)"
        />
      </div>
      <DropdownMenu v-if="showView">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="ml-auto">
            <SlidersHorizontal class="mr-2 size-4" />
            {{ t('common.view') }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            v-for="column in table.getAllColumns().filter((column) => column.getCanHide())"
            :key="column.id"
            :checked="column.getIsVisible()"
            @select.prevent="column.toggleVisibility(!column.getIsVisible())"
          >
            {{ columnLabel(column) }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <Table container-class="min-h-0 min-w-0 flex-1 overflow-auto border-y">
      <TableHeader class="sticky top-0 z-10 bg-card">
        <TableRow
          v-for="(headerGroup, groupIndex) in table.getHeaderGroups()"
          :key="headerGroup.id"
        >
          <TableHead
            v-if="selectable && groupIndex === 0"
            class="w-12"
            :rowspan="table.getHeaderGroups().length"
          >
            <Checkbox
              data-table-select-page
              class="data-table-selection-checkbox size-4 rounded-full data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
              :model-value="pageSelectionState"
              :disabled="selectionDisabled || !pageSelectableRows.length"
              :aria-label="t('common.select_page')"
              :title="t('common.select_page')"
              @update:model-value="table.toggleAllPageRowsSelected($event === true)"
            >
              <Minus v-if="pageSelectionState === 'indeterminate'" class="size-3" />
              <Check v-else class="size-3" />
            </Checkbox>
          </TableHead>
          <TableHead v-for="header in headerGroup.headers" :key="header.id">
            <FlexRender
              v-if="!header.isPlaceholder"
              :render="header.column.columnDef.header"
              :props="header.getContext()"
            />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-if="table.getRowModel().rows?.length">
          <TableRow
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :data-state="row.getIsSelected() ? 'selected' : undefined"
            :aria-selected="selectable ? row.getIsSelected() : undefined"
          >
            <TableCell v-if="selectable" class="w-12">
              <Checkbox
                class="data-table-selection-checkbox size-4 rounded-full"
                :model-value="row.getIsSelected()"
                :disabled="selectionDisabled || !row.getCanSelect()"
                :aria-label="t('common.select_row', { row: row.id })"
                :title="t('common.select_row', { row: row.id })"
                @update:model-value="row.toggleSelected($event === true)"
              />
            </TableCell>
            <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </TableCell>
          </TableRow>
        </template>
        <template v-else>
          <TableRow>
            <TableCell
              :colspan="
                (table.getVisibleLeafColumns().length || columns.length) + (selectable ? 1 : 0)
              "
              class="h-24 p-0 whitespace-normal"
            >
              <div
                class="flex h-24 w-full items-center justify-center text-center text-muted-foreground"
              >
                {{ emptyMessage || t('common.no_data') }}
              </div>
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>
    <div
      ref="selectionFooter"
      class="grid shrink-0 items-center gap-3"
      :class="
        selectionSharesFooterRow ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'grid-cols-1'
      "
    >
      <div
        v-show="selectionToolbarVisible"
        ref="selectionActions"
        class="max-w-full min-w-0 justify-self-center"
        :class="selectionSharesFooterRow ? 'col-start-2' : undefined"
      >
        <Transition
          name="data-table-selection"
          :css="preferredMotion !== 'reduce'"
          @before-enter="enableSelectionInteraction"
          @before-leave="disableSelectionInteraction"
          @leave-cancelled="enableSelectionInteraction"
          @after-leave="finishSelectionLeave"
        >
          <div
            v-if="selectable && selectedRows.length"
            role="toolbar"
            tabindex="-1"
            :aria-label="t('common.selection_actions')"
            :inert="!selectedRows.length"
            class="data-table-selection-panel flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-2 shadow-xl backdrop-blur-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 supports-backdrop-filter:bg-background/60"
            @keydown="handleSelectionKeydown"
          >
            <TooltipProvider :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="icon"
                    class="size-7 shrink-0 rounded-full"
                    :disabled="selectionDisabled"
                    :aria-label="t('common.clear_selection')"
                    :title="t('common.clear_selection')"
                    @click="clearSelection"
                  >
                    <X class="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{{ t('common.clear_selection') }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Separator orientation="vertical" class="h-5" />
            <span class="flex items-center gap-2 text-sm whitespace-nowrap">
              <Badge class="min-w-7 justify-center rounded-lg">
                <Transition
                  name="data-table-selection-count"
                  mode="out-in"
                  :css="preferredMotion !== 'reduce'"
                >
                  <span :key="displayedSelectionCount" class="block">{{
                    displayedSelectionCount
                  }}</span>
                </Transition>
              </Badge>
              {{ t('common.rows_selected') }}
            </span>
            <template v-if="$slots['selection-actions']">
              <Separator orientation="vertical" class="h-5" />
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <slot
                  name="selection-actions"
                  :rows="selectedRows"
                  :clear-selection="clearSelection"
                  :disabled="selectionDisabled || !selectedRows.length"
                />
              </div>
            </template>
          </div>
        </Transition>
      </div>
      <div
        ref="paginationContainer"
        class="w-max justify-self-end"
        :class="selectionSharesFooterRow ? 'col-start-3' : undefined"
      >
        <Pagination
          class="mx-0 w-auto justify-end"
          :page="currentPage"
          :items-per-page="pagination.pageSize"
          :total="pageCount * pagination.pageSize"
          :disabled="pageCount <= 1"
          @update:page="handlePageChange"
        >
          <PaginationContent v-slot="{ items }">
            <PaginationPrevious />
            <template v-for="(item, index) in items" :key="index">
              <PaginationItem
                v-if="item.type === 'page'"
                :value="item.value"
                :is-active="item.value === currentPage"
              >
                {{ item.value }}
              </PaginationItem>
              <PaginationEllipsis v-else :index="index" />
            </template>
            <PaginationNext />
          </PaginationContent>
        </Pagination>
      </div>
    </div>
    <p v-if="selectable" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ t('common.selection_count', { count: selectedRows.length }) }}
    </p>
  </div>
</template>
