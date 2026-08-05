<script setup lang="ts">
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  ShieldCheck,
} from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

type PermissionOption = {
  id: number
  code: string
  name: string
  groupName: string
}

type PermissionTree = [string, Map<string, PermissionOption[]>][]

const props = defineProps<{
  permissions: PermissionOption[]
  disabled?: boolean
}>()

const assignedIds = defineModel<number[]>({ default: () => [] })
const { t } = useI18n()
const availableQuery = ref('')
const assignedQuery = ref('')
const pendingAddIds = ref<number[]>([])
const pendingRemoveIds = ref<number[]>([])
const expandedGroups = ref(new Set<string>())
const expandedResources = ref(new Set<string>())

const assignedIdSet = computed(() => new Set(assignedIds.value))
const availablePermissions = computed(() =>
  props.permissions.filter((permission) => !assignedIdSet.value.has(permission.id))
)
const assignedPermissions = computed(() =>
  props.permissions.filter((permission) => assignedIdSet.value.has(permission.id))
)

const visibleAvailableTree = computed<PermissionTree>(() =>
  buildTree(filterPermissions(availablePermissions.value, availableQuery.value))
)
const visibleAssignedPermissions = computed(() =>
  filterPermissions(assignedPermissions.value, assignedQuery.value)
)
const visibleAvailableIds = computed(() =>
  visibleAvailableTree.value.flatMap(([, resources]) =>
    [...resources.values()].flatMap((permissions) => permissions.map((permission) => permission.id))
  )
)

watch(
  visibleAvailableTree,
  (groups) => {
    expandedGroups.value = new Set(groups.map(([group]) => group))
    expandedResources.value = new Set(
      groups.flatMap(([group, resources]) =>
        [...resources.keys()].map((resource) => `${group}:${resource}`)
      )
    )
  },
  { immediate: true }
)

watch(assignedIds, () => {
  const availableIds = new Set(availablePermissions.value.map((permission) => permission.id))
  const assigned = new Set(assignedIds.value)
  pendingAddIds.value = pendingAddIds.value.filter((id) => availableIds.has(id))
  pendingRemoveIds.value = pendingRemoveIds.value.filter((id) => assigned.has(id))
})

function buildTree(permissions: PermissionOption[]): PermissionTree {
  const groups = new Map<string, Map<string, PermissionOption[]>>()
  for (const permission of permissions) {
    const resources = groups.get(permission.groupName) ?? new Map<string, PermissionOption[]>()
    const resource = permission.code.split(':')[0] ?? permission.code
    resources.set(resource, [...(resources.get(resource) ?? []), permission])
    groups.set(permission.groupName, resources)
  }
  return [...groups.entries()]
}

function filterPermissions(permissions: PermissionOption[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return permissions
  return permissions.filter((permission) =>
    `${permission.name} ${permission.code} ${permission.groupName}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  )
}

function selectionState(ids: number[], selected: number[]) {
  const selectedCount = ids.filter((id) => selected.includes(id)).length
  if (selectedCount === 0) return false
  if (selectedCount === ids.length) return true
  return 'indeterminate' as const
}

function toggleSelection(current: number[], ids: number[], checked: boolean) {
  return checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id))
}

function toggleGroup(group: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(group)) {
    next.delete(group)
  } else {
    next.add(group)
  }
  expandedGroups.value = next
}

function toggleResource(key: string) {
  const next = new Set(expandedResources.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedResources.value = next
}

function moveToAssigned(ids: number[]) {
  assignedIds.value = [...new Set([...assignedIds.value, ...ids])]
  pendingAddIds.value = pendingAddIds.value.filter((id) => !ids.includes(id))
}

function moveToAvailable(ids: number[]) {
  assignedIds.value = assignedIds.value.filter((id) => !ids.includes(id))
  pendingRemoveIds.value = pendingRemoveIds.value.filter((id) => !ids.includes(id))
}
</script>

<template>
  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
    <section
      class="min-w-0 overflow-hidden rounded-md border"
      :aria-label="t('rbac.roles.available_permissions')"
    >
      <div class="border-b bg-muted/30 p-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">{{ t('rbac.roles.available_permissions') }}</p>
          <span class="text-xs text-muted-foreground">{{ availablePermissions.length }}</span>
        </div>
        <div class="relative mt-2">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="availableQuery"
            class="pl-9"
            :placeholder="t('rbac.roles.search_available_permissions')"
          />
        </div>
      </div>

      <div class="h-72 overflow-auto">
        <div v-if="visibleAvailableTree.length">
          <div
            v-for="[group, resources] in visibleAvailableTree"
            :key="group"
            class="border-b last:border-b-0"
          >
            <div class="flex items-center gap-2 bg-muted/20 px-3 py-2">
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                class="size-5"
                :aria-expanded="expandedGroups.has(group)"
                @click="toggleGroup(group)"
              >
                <ChevronDown v-if="expandedGroups.has(group)" class="size-4" />
                <ChevronRight v-else class="size-4" />
              </Button>
              <Checkbox
                :model-value="
                  selectionState(
                    [...resources.values()].flatMap((items) => items.map((item) => item.id)),
                    pendingAddIds
                  )
                "
                :disabled="disabled"
                @update:model-value="
                  pendingAddIds = toggleSelection(
                    pendingAddIds,
                    [...resources.values()].flatMap((items) => items.map((item) => item.id)),
                    $event === true
                  )
                "
              />
              <span class="text-sm font-medium">{{ group }}</span>
            </div>

            <div v-if="expandedGroups.has(group)">
              <div v-for="[resource, items] in resources" :key="resource" class="border-t">
                <div class="flex items-center gap-2 px-3 py-2 pl-9">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    class="size-5"
                    :aria-expanded="expandedResources.has(`${group}:${resource}`)"
                    @click="toggleResource(`${group}:${resource}`)"
                  >
                    <ChevronDown
                      v-if="expandedResources.has(`${group}:${resource}`)"
                      class="size-4"
                    />
                    <ChevronRight v-else class="size-4" />
                  </Button>
                  <Checkbox
                    :model-value="
                      selectionState(
                        items.map((item) => item.id),
                        pendingAddIds
                      )
                    "
                    :disabled="disabled"
                    @update:model-value="
                      pendingAddIds = toggleSelection(
                        pendingAddIds,
                        items.map((item) => item.id),
                        $event === true
                      )
                    "
                  />
                  <code class="text-xs text-muted-foreground">{{ resource }}</code>
                </div>

                <div v-if="expandedResources.has(`${group}:${resource}`)" class="divide-y border-t">
                  <label
                    v-for="permission in items"
                    :key="permission.id"
                    class="flex items-center gap-3 px-3 py-2 pl-16"
                    :class="{ 'cursor-pointer': !disabled }"
                  >
                    <Checkbox
                      :model-value="pendingAddIds.includes(permission.id)"
                      :disabled="disabled"
                      @update:model-value="
                        pendingAddIds = toggleSelection(
                          pendingAddIds,
                          [permission.id],
                          $event === true
                        )
                      "
                    />
                    <ShieldCheck class="size-4 text-muted-foreground" />
                    <span class="min-w-0 flex-1 text-sm">{{ permission.name }}</span>
                    <code class="text-xs text-muted-foreground">{{ permission.code }}</code>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="p-4 text-center text-sm text-muted-foreground">
          {{ t('rbac.roles.no_available_permissions') }}
        </p>
      </div>
    </section>

    <div class="flex items-center justify-center gap-1 md:flex-col">
      <Button
        variant="outline"
        size="icon"
        :disabled="disabled || pendingAddIds.length === 0"
        :aria-label="t('rbac.roles.add_selected_permissions')"
        :title="t('rbac.roles.add_selected_permissions')"
        @click="moveToAssigned(pendingAddIds)"
      >
        <ChevronRight class="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        :disabled="disabled || visibleAvailableIds.length === 0"
        :aria-label="t('rbac.roles.add_all_visible_permissions')"
        :title="t('rbac.roles.add_all_visible_permissions')"
        @click="moveToAssigned(visibleAvailableIds)"
      >
        <ChevronsRight class="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        :disabled="disabled || pendingRemoveIds.length === 0"
        :aria-label="t('rbac.roles.remove_selected_permissions')"
        :title="t('rbac.roles.remove_selected_permissions')"
        @click="moveToAvailable(pendingRemoveIds)"
      >
        <ChevronLeft class="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        :disabled="disabled || assignedPermissions.length === 0"
        :aria-label="t('rbac.roles.remove_all_permissions')"
        :title="t('rbac.roles.remove_all_permissions')"
        @click="moveToAvailable(assignedPermissions.map((permission) => permission.id))"
      >
        <ChevronsLeft class="size-4" />
      </Button>
    </div>

    <section
      class="min-w-0 overflow-hidden rounded-md border"
      :aria-label="t('rbac.roles.assigned_permissions')"
    >
      <div class="border-b bg-muted/30 p-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">{{ t('rbac.roles.assigned_permissions') }}</p>
          <span class="text-xs text-muted-foreground">{{ assignedPermissions.length }}</span>
        </div>
        <div class="relative mt-2">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="assignedQuery"
            class="pl-9"
            :placeholder="t('rbac.roles.search_assigned_permissions')"
          />
        </div>
      </div>

      <div class="h-72 divide-y overflow-auto">
        <label
          v-for="permission in visibleAssignedPermissions"
          :key="permission.id"
          class="flex items-center gap-3 px-3 py-2"
          :class="{ 'cursor-pointer': !disabled }"
        >
          <Checkbox
            :model-value="pendingRemoveIds.includes(permission.id)"
            :disabled="disabled"
            @update:model-value="
              pendingRemoveIds = toggleSelection(pendingRemoveIds, [permission.id], $event === true)
            "
          />
          <ShieldCheck class="size-4 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm">{{ permission.name }}</span>
            <code class="block text-xs text-muted-foreground">{{ permission.code }}</code>
          </span>
        </label>
        <p
          v-if="visibleAssignedPermissions.length === 0"
          class="p-4 text-center text-sm text-muted-foreground"
        >
          {{ t('rbac.roles.no_assigned_permissions') }}
        </p>
      </div>
    </section>
  </div>
</template>
