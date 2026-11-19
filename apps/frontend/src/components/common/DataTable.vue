<script setup lang="ts" generic="TData, TValue">
import { Check, Minus, Plus, RotateCcw, Search, SlidersHorizontal, X } from '@lucide/vue'
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

import { listPageHeaderKey } from '@/components/common/list-page-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    showView?: boolean
    viewPlacement?: 'toolbar' | 'after-filters'
    showListPageTitle?: boolean
    emptyMessage?: string
    storageKey?: string
    serverPagination?: ServerPagination
    filtersLayout?: 'wrap' | 'inline' | 'stacked'
    selectable?: boolean
    getRowId?: (row: TData) => string
    isRowSelectable?: (row: TData) => boolean
    selectionDisabled?: boolean
  }>(),
  {
    showView: true,
    viewPlacement: 'after-filters',
    showListPageTitle: true,
    filtersLayout: 'stacked',
    selectable: false,
    selectionDisabled: false,
  }
)

const emit = defineEmits<{
  pageChange: [page: number]
  search: []
  reset: []
  selectionChange: [rows: TData[]]
}>()

const { t } = useI18n()
const slots = useSlots()
const listPageHeader = inject(listPageHeaderKey, undefined)
const listPageTitle = computed(() =>
  props.showListPageTitle ? (listPageHeader?.title.value ?? '') : ''
)
const useListPageQueryLayout = computed(() => Boolean(listPageHeader && props.showListPageTitle))
const displayFilterActions = computed(() => Boolean(listPageHeader && props.showListPageTitle))
const showListPageActions = computed(
  () => props.showListPageTitle && Boolean(listPageHeader?.showAction.value)
)
const hasToolbarHeading = computed(
  () => Boolean(slots['toolbar-leading']) || Boolean(listPageTitle.value)
)

const sorting = ref<SortingState>([])
const columnFilters = ref<ColumnFiltersState>([])
const rowSelection = ref<RowSelectionState>({})
const persistedPreferences = props.storageKey ? useTablePreferences(props.storageKey) : null
const columnVisibility = persistedPreferences?.columnVisibility ?? ref<VisibilityState>({})
const pagination =
  persistedPreferences?.pagination ?? ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

function hasFullFilterRow() {
  const filterCount = slots.filters?.().length ?? 0
  return filterCount > 0 && filterCount % 4 === 0
}

const showView = computed(() => props.showView)
const pageCount = computed(() => props.serverPagination?.pageCount ?? table.getPageCount())
const currentPage = computed(() => props.serverPagination?.page ?? pagination.value.pageIndex + 1)

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
  onSortingChange: (updaterOrValue) => valueUpdater(updaterOrValue, sorting),
  onColumnFiltersChange: (updaterOrValue) => valueUpdater(updaterOrValue, columnFilters),
  onColumnVisibilityChange: (updaterOrValue) => valueUpdater(updaterOrValue, columnVisibility),
  onRowSelectionChange: (updaterOrValue) => valueUpdater(updaterOrValue, rowSelection),
  onPaginationChange: (updaterOrValue) => valueUpdater(updaterOrValue, pagination),
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
    sorting,
    columnFilters,
  ],
  clearSelection,
  { flush: 'sync' }
)

defineExpose({ clearSelection })

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

function applyFilters() {
  emit('search')
}

function resetFilters() {
  emit('reset')
}
</script>

<template>
  <div ref="dataTable" class="data-table flex min-h-0 min-w-0 flex-1 flex-col gap-4">
    <component
      :is="useListPageQueryLayout ? 'fieldset' : 'div'"
      :class="
        useListPageQueryLayout
          ? 'min-w-0 shrink-0 rounded-md border bg-muted/20 px-3 pb-3'
          : filtersLayout === 'stacked' && viewPlacement === 'after-filters'
            ? 'flex min-w-0 shrink-0 flex-col gap-3'
            : filtersLayout === 'stacked'
              ? 'grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3'
              : 'flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between'
      "
    >
      <legend
        v-if="useListPageQueryLayout"
        class="px-2 font-display text-xl font-semibold tracking-tight"
      >
        {{ listPageTitle }}
      </legend>
      <div :class="useListPageQueryLayout ? 'flex flex-col gap-3 pt-4' : 'contents'">
        <div v-if="slots.operations" class="min-w-0">
          <slot name="operations" />
        </div>
        <component
          :is="displayFilterActions ? 'form' : 'div'"
          v-if="slots.filters || displayFilterActions"
          :class="
            useListPageQueryLayout
              ? 'grid w-full min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4'
              : filtersLayout === 'inline'
                ? 'flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-x-auto'
                : filtersLayout === 'stacked' && viewPlacement === 'after-filters'
                  ? 'grid w-full min-w-0 grid-cols-1 items-end gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-4'
                  : filtersLayout === 'stacked'
                    ? 'contents'
                    : 'flex flex-wrap items-center gap-3'
          "
          @submit.prevent="applyFilters"
        >
          <template v-if="slots.filters">
            <div
              v-if="filtersLayout === 'stacked'"
              :class="
                viewPlacement === 'after-filters'
                  ? 'contents'
                  : 'col-span-2 row-start-2 min-w-0 rounded-md border bg-muted/20 p-3'
              "
            >
              <slot name="filters" />
            </div>
            <slot v-else name="filters" />
          </template>
          <div
            v-if="displayFilterActions"
            :class="
              filtersLayout === 'stacked' && viewPlacement === 'after-filters'
                ? hasFullFilterRow()
                  ? 'col-span-full flex justify-end gap-2'
                  : 'flex justify-end gap-2 sm:col-start-2 xl:col-start-4'
                : filtersLayout === 'inline'
                  ? 'flex w-full justify-end gap-2 sm:col-start-2 xl:col-start-4'
                  : 'flex w-full justify-end gap-2'
            "
          >
            <Button type="button" variant="outline" @click="resetFilters">
              <RotateCcw class="size-4" />
              {{ t('common.reset') }}
            </Button>
            <Button type="submit" :disabled="listPageHeader?.loading.value">
              <Search class="size-4" />
              {{ t('common.search') }}
            </Button>
          </div>
        </component>
      </div>
    </component>
    <div
      v-if="
        showView || (viewPlacement === 'after-filters' && hasToolbarHeading) || showListPageActions
      "
      :class="
        useListPageQueryLayout
          ? 'flex w-full min-w-0 items-center justify-between gap-3'
          : filtersLayout === 'stacked' && viewPlacement === 'after-filters'
            ? hasToolbarHeading
              ? 'flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3'
              : 'flex min-w-0 shrink-0 justify-end'
            : filtersLayout === 'stacked'
              ? 'col-start-2 row-start-1 ml-auto shrink-0'
              : 'ml-auto'
      "
    >
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <slot v-if="slots['toolbar-leading']" name="toolbar-leading" />
        <Button
          v-if="showListPageActions && listPageHeader?.showAction.value"
          type="button"
          size="sm"
          @click="listPageHeader.onAction()"
        >
          <Plus class="size-4" />
          {{ listPageHeader.actionLabel.value }}
        </Button>
        <h1
          v-if="!useListPageQueryLayout && listPageTitle"
          class="text-xl font-semibold tracking-tight"
        >
          {{ listPageTitle }}
        </h1>
      </div>
      <DropdownMenu v-if="showView">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="shrink-0">
            <SlidersHorizontal class="size-4" />
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
    <Table container-class="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border">
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
