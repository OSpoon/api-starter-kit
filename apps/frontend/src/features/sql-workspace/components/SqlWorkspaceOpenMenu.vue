<script setup lang="ts">
import { ChevronDown, FileCode2, FolderOpen, Link, Upload } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const props = withDefaults(
  defineProps<{ compact?: boolean; loading?: boolean; prominent?: boolean }>(),
  {
    compact: false,
    loading: false,
    prominent: false,
  }
)
const emit = defineEmits<{ openPicker: [id: string]; openUrl: [] }>()
const { t } = useI18n()

function openPicker(id: string) {
  if (!props.loading) emit('openPicker', id)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        v-if="compact"
        type="button"
        :disabled="loading"
        :title="t('sql_workspace.open')"
        :aria-label="t('sql_workspace.open')"
        ><Upload class="size-4"
      /></Button>
      <Button v-else-if="prominent" size="sm" :disabled="loading"
        ><Upload />{{ t('sql_workspace.open') }}<ChevronDown
      /></Button>
      <Button
        variant="outline"
        size="sm"
        v-else
        type="button"
        class="sql-workspace-open-button"
        :disabled="loading"
        ><Upload class="size-3.5" />{{ t('sql_workspace.open') }}<ChevronDown class="size-3.5"
      /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem :disabled="loading" @select="openPicker('sql-workspace-script')">
        <FileCode2 />{{ t('sql_workspace.open_sql') }}
      </DropdownMenuItem>
      <DropdownMenuItem :disabled="loading" @select="openPicker('sql-workspace-archive')">
        <Upload />{{ t('sql_workspace.open_zip') }}
      </DropdownMenuItem>
      <DropdownMenuItem :disabled="loading" @select="openPicker('sql-workspace-directory')">
        <FolderOpen />{{ t('sql_workspace.open_directory') }}
      </DropdownMenuItem>
      <DropdownMenuItem :disabled="loading" @select="emit('openUrl')">
        <Link />{{ t('sql_workspace.open_url') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
