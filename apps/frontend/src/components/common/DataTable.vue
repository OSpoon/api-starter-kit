<script setup lang="ts" generic="TData, TValue">
import { SlidersHorizontal } from '@lucide/vue'
import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
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

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTablePreferences } from '@/lib/browser-preferences'

type ServerPagination = {
  page: number
  pageCount: number
}

const props = defineProps<{
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKeys?: string[]
  searchPlaceholder?: string
  getSearchableText?: (row: TData) => string
  emptyMessage?: string
  storageKey?: string
  searchId?: string
  serverPagination?: ServerPagination
  filtersLayout?: 'wrap' | 'inline'
}>()

const search = defineModel<string>('search', { default: '' })

const emit = defineEmits<{
  rowClick: [row: TData]
  pageChange: [page: number]
}>()

const { t } = useI18n()

const sorting = ref<SortingState>([])
const columnFilters = ref<ColumnFiltersState>([])
const rowSelection = ref({})
const persistedPreferences = props.storageKey ? useTablePreferences(props.storageKey) : null
const columnVisibility = persistedPreferences?.columnVisibility ?? ref<VisibilityState>({})
const pagination =
  persistedPreferences?.pagination ?? ref<PaginationState>({ pageIndex: 0, pageSize: 10 })

const showSearch = computed(() => Boolean(props.searchKeys?.length || props.getSearchableText))

const resolvedSearchKeys = computed(() => props.searchKeys ?? [])

const table = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  autoResetPageIndex: false,
  manualPagination: Boolean(props.serverPagination),
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

function previousPage() {
  if (props.serverPagination) {
    emit('pageChange', props.serverPagination.page - 1)
    return
  }
  table.previousPage()
}

function nextPage() {
  if (props.serverPagination) {
    emit('pageChange', props.serverPagination.page + 1)
    return
  }
  table.nextPage()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div
        :class="
          filtersLayout === 'inline'
            ? 'flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-x-auto'
            : 'flex flex-wrap items-center gap-3'
        "
      >
        <slot name="filters" />
        <Label v-if="showSearch" :for="searchId ?? 'data-table-search'">{{
          t('common.search')
        }}</Label>
        <Input
          v-if="showSearch"
          :id="searchId ?? 'data-table-search'"
          :class="filtersLayout === 'inline' ? 'shrink-0' : 'max-w-sm min-w-55'"
          :style="filtersLayout === 'inline' ? { width: '14rem' } : undefined"
          :placeholder="searchPlaceholderText()"
          :model-value="search"
          @update:model-value="table.setGlobalFilter($event)"
        />
      </div>
      <DropdownMenu>
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
    <div class="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
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
              class="cursor-pointer hover:bg-muted/50"
              @click="emit('rowClick', row.original)"
            >
              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow>
              <TableCell
                :colspan="table.getVisibleLeafColumns().length || columns.length"
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
    </div>
    <div class="flex items-center justify-end space-x-2 py-4">
      <div class="space-x-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="serverPagination ? serverPagination.page <= 1 : !table.getCanPreviousPage()"
          @click="previousPage"
        >
          {{ t('common.previous') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="
            serverPagination
              ? serverPagination.page >= serverPagination.pageCount
              : !table.getCanNextPage()
          "
          @click="nextPage"
        >
          {{ t('common.next') }}
        </Button>
      </div>
    </div>
  </div>
</template>
