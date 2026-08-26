<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { SystemPermissionOption, SystemRole } from '@/features/access-control/api'

defineProps<{
  role: SystemRole
  permissions: SystemPermissionOption[]
}>()
const { t } = useI18n()
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Badge
        as="button"
        type="button"
        variant="outline"
        class="cursor-pointer"
        :title="t('rbac.roles.view_permissions')"
      >
        {{ t('rbac.roles.permission_count', { count: role.permissionIds.length }) }}
      </Badge>
    </PopoverTrigger>
    <PopoverContent class="w-80">
      <PopoverHeader>
        <PopoverTitle>{{ t('rbac.roles.permissions_title') }}</PopoverTitle>
        <PopoverDescription>
          {{ role.name }} · <code>{{ role.code }}</code>
        </PopoverDescription>
      </PopoverHeader>
      <div class="mt-3 max-h-64 overflow-y-auto rounded-md border">
        <div
          v-for="permission in permissions"
          :key="permission.id"
          class="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
        >
          <ShieldCheck class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ permission.name }}</span>
            <code class="block text-xs text-muted-foreground">{{ permission.code }}</code>
          </span>
        </div>
        <p v-if="permissions.length === 0" class="p-4 text-center text-sm text-muted-foreground">
          {{ t('rbac.roles.no_assigned_permissions') }}
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
