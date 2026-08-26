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
import type { SystemPermission } from '@/features/access-control/api'

defineProps<{ permission: SystemPermission }>()
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
        :title="t('rbac.permissions.view_roles')"
      >
        {{ t('rbac.permissions.in_use', { count: permission.roles?.length ?? permission.roleCount }) }}
      </Badge>
    </PopoverTrigger>
    <PopoverContent class="w-80">
      <PopoverHeader>
        <PopoverTitle>{{ t('rbac.permissions.roles_title') }}</PopoverTitle>
        <PopoverDescription>
          {{ permission.name }} · <code>{{ permission.code }}</code>
        </PopoverDescription>
      </PopoverHeader>
      <div class="mt-3 max-h-64 overflow-y-auto rounded-md border">
        <div
          v-for="role in permission.roles ?? []"
          :key="role.id"
          class="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
        >
          <ShieldCheck class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ role.name }}</span>
            <code class="block text-xs text-muted-foreground">{{ role.code }}</code>
          </span>
        </div>
        <p v-if="!(permission.roles?.length ?? 0)" class="p-4 text-center text-sm text-muted-foreground">
          {{ t('rbac.permissions.no_roles') }}
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
