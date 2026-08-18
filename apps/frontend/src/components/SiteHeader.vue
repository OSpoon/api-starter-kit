<script setup lang="ts">
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

defineProps<{
  breadcrumbs: Array<{ label: string; to?: string }>
}>()
</script>

<template>
  <header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
    <div class="flex items-center gap-2">
      <SidebarTrigger class="-ml-1" />
      <Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <template v-for="(crumb, index) in breadcrumbs" :key="index">
            <BreadcrumbItem class="hidden md:block">
              <BreadcrumbLink v-if="crumb.to && index < breadcrumbs.length - 1" as-child>
                <RouterLink :to="crumb.to">{{ crumb.label }}</RouterLink>
              </BreadcrumbLink>
              <span v-else-if="index < breadcrumbs.length - 1" class="text-muted-foreground">
                {{ crumb.label }}
              </span>
              <BreadcrumbPage v-else>
                {{ crumb.label }}
              </BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator v-if="index < breadcrumbs.length - 1" class="hidden md:block" />
          </template>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  </header>
</template>
