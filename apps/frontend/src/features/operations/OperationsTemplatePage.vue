<script setup lang="ts">
import {
  Bell,
  Check,
  Command,
  Download,
  FileUp,
  LoaderCircle,
  Search,
  Settings2,
} from '@lucide/vue'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import PageShell from '@/components/common/PageShell.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxViewport,
} from '@/components/ui/combobox'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { operationServiceKeys } from './service-options'

const { t } = useI18n()
const commandOpen = ref(false)
const deleteDialogOpen = ref(false)
const notificationsOpen = ref(false)
const selectedService = ref('')
const form = reactive({ name: '', description: '', enabled: true })
const dirty = ref(false)
const saving = ref(false)
const importProgress = ref(0)
const importFile = ref('')
const loading = ref(false)
const failed = ref(false)
const services = computed(() => operationServiceKeys.map((key) => t(key)))

watch(
  form,
  () => {
    dirty.value = true
  },
  { deep: true }
)
async function save() {
  saving.value = true
  await new Promise((resolve) => setTimeout(resolve, 400))
  saving.value = false
  dirty.value = false
  toast.success(t('operations_template.changes_saved'))
}
function selectFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  importFile.value = file.name
  importProgress.value = 0
  const timer = setInterval(() => {
    importProgress.value += 20
    if (importProgress.value >= 100) {
      clearInterval(timer)
      toast.success(t('operations_template.import_finished'))
    }
  }, 120)
}
async function reload() {
  loading.value = true
  failed.value = false
  await new Promise((resolve) => setTimeout(resolve, 450))
  loading.value = false
}
function removeResource() {
  form.name = ''
  form.description = ''
  dirty.value = false
  deleteDialogOpen.value = false
  toast.success(t('operations_template.delete_success'))
}
function selectCommand(messageKey: 'create_opened' | 'settings_opened' | 'search_focused') {
  toast.success(t(`operations_template.${messageKey}`))
  commandOpen.value = false
}
</script>

<template>
  <PageShell
    :title="t('operations_template.title')"
    :description="t('operations_template.description')"
  >
    <template #actions
      ><Button variant="outline" size="sm" @click="commandOpen = true"
        ><Command class="size-4" />{{ t('operations_template.command_palette') }}</Button
      ><Popover v-model:open="notificationsOpen"
        ><PopoverTrigger as-child
          ><Button
            variant="outline"
            size="icon"
            :aria-label="t('operations_template.notifications')"
            :title="t('operations_template.notifications')"
            ><Bell class="size-4" /></Button></PopoverTrigger
        ><PopoverContent class="w-80"
          ><p class="font-medium">{{ t('operations_template.notifications') }}</p>
          <div class="mt-3 space-y-3 text-sm">
            <p>{{ t('operations_template.gateway_recovered') }}</p>
            <p>{{ t('operations_template.import_completed') }}</p>
          </div></PopoverContent
        ></Popover
      ></template
    >
    <div class="grid gap-6 xl:grid-cols-2">
      <section class="space-y-6">
        <div class="rounded-lg border bg-card p-6">
          <div class="flex items-center justify-between">
            <div>
              <h2>{{ t('operations_template.advanced_form') }}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ t('operations_template.advanced_form_description') }}
              </p>
            </div>
            <span class="text-xs text-muted-foreground">{{
              saving
                ? t('common.saving')
                : dirty
                  ? t('operations_template.unsaved')
                  : t('operations_template.saved')
            }}</span>
          </div>
          <div class="mt-5 space-y-4">
            <div class="grid gap-2">
              <Label for="operation-resource-name">{{
                t('operations_template.resource_name')
              }}</Label
              ><Input
                id="operation-resource-name"
                v-model="form.name"
                :placeholder="t('operations_template.resource_name')"
              />
            </div>
            <div class="grid gap-2">
              <Label for="operation-resource-description">{{
                t('operations_template.resource_description')
              }}</Label
              ><Textarea
                id="operation-resource-description"
                v-model="form.description"
                :placeholder="t('operations_template.resource_description')"
              />
            </div>
            <Label
              for="operation-service-enabled"
              class="flex items-center justify-between rounded-md border p-3 text-sm"
              ><span
                ><span class="block font-medium">{{ t('operations_template.enable_service') }}</span
                ><span class="text-muted-foreground">{{
                  t('operations_template.enable_service_hint')
                }}</span></span
              ><Switch id="operation-service-enabled" v-model="form.enabled"
            /></Label>
            <div class="flex justify-between border-t pt-4">
              <Button variant="destructive" size="sm" @click="deleteDialogOpen = true">{{
                t('operations_template.delete_resource')
              }}</Button
              ><Button size="sm" :disabled="!dirty || saving" @click="save">{{
                t('common.save')
              }}</Button>
            </div>
          </div>
        </div>
        <div class="rounded-lg border bg-card p-6">
          <h2>{{ t('operations_template.remote_search') }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ t('operations_template.remote_search_description') }}
          </p>
          <div class="mt-4 grid gap-2">
            <Label for="operation-service-search">{{
              t('operations_template.search_service')
            }}</Label
            ><Combobox v-model="selectedService"
              ><ComboboxAnchor
                ><ComboboxInput
                  id="operation-service-search"
                  :placeholder="t('operations_template.search_service')" /></ComboboxAnchor
              ><ComboboxList
                ><ComboboxViewport
                  ><ComboboxItem v-for="service in services" :key="service" :value="service">{{
                    service
                  }}</ComboboxItem
                  ><ComboboxEmpty>{{
                    t('operations_template.no_matching_service')
                  }}</ComboboxEmpty></ComboboxViewport
                ></ComboboxList
              ></Combobox
            >
          </div>
          <p v-if="selectedService" class="mt-3 text-sm text-muted-foreground">
            {{ t('operations_template.selected_service', { service: selectedService }) }}
          </p>
        </div>
      </section>
      <section class="space-y-6">
        <div class="rounded-lg border bg-card p-6">
          <div class="flex items-start justify-between">
            <div>
              <h2>{{ t('operations_template.import_export') }}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ t('operations_template.import_export_description') }}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              @click="toast.success(t('operations_template.exported'))"
              ><Download class="size-4" />{{ t('analytics.export') }}</Button
            >
          </div>
          <div class="mt-5 grid gap-2 rounded-md border border-dashed p-4">
            <Label for="operation-import-file">{{ t('operations_template.import_file') }}</Label
            ><Input
              id="operation-import-file"
              type="file"
              accept=".csv,.xlsx"
              @change="selectFile"
            />
            <div v-if="importFile" class="mt-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span>{{ importFile }}</span
                ><span>{{ importProgress }}%</span>
              </div>
              <Progress :model-value="importProgress" />
            </div>
          </div>
        </div>
        <div class="rounded-lg border bg-card p-6">
          <div class="flex items-center justify-between">
            <div>
              <h2>{{ t('operations_template.feedback') }}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ t('operations_template.feedback_description') }}
              </p>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="failed = true">{{
                t('operations_template.simulate_failure')
              }}</Button
              ><Button variant="outline" size="sm" @click="reload"
                ><LoaderCircle class="size-4" :class="loading ? 'animate-spin' : ''" />{{
                  t('operations_template.retry')
                }}</Button
              >
            </div>
          </div>
          <div class="mt-5 space-y-3">
            <template v-if="loading"
              ><Skeleton class="h-5 w-3/5" /><Skeleton class="h-5 w-full" /><Skeleton
                class="h-5 w-4/5" /></template
            ><Alert v-else-if="failed" variant="destructive"
              ><AlertTitle>{{ t('operations_template.load_failed') }}</AlertTitle
              ><AlertDescription>{{
                t('operations_template.load_failed_description')
              }}</AlertDescription></Alert
            ><Alert v-else
              ><Check class="size-4" /><AlertTitle>{{
                t('operations_template.data_ready')
              }}</AlertTitle
              ><AlertDescription>{{
                t('operations_template.data_ready_description')
              }}</AlertDescription></Alert
            >
          </div>
        </div>
      </section>
    </div>
    <ConfirmDialog
      v-model:open="deleteDialogOpen"
      :title="t('operations_template.delete_title')"
      :description="t('operations_template.delete_description')"
      :confirm-label="t('operations_template.delete_resource')"
      @confirm="removeResource"
    />
    <CommandDialog v-model:open="commandOpen"
      ><Label for="operation-command-search" class="px-3 pt-3">{{
        t('operations_template.search_commands_label')
      }}</Label
      ><CommandInput
        id="operation-command-search"
        :placeholder="t('operations_template.search_commands')"
      /><CommandList
        ><CommandEmpty>{{ t('operations_template.no_matching_command') }}</CommandEmpty
        ><CommandGroup :heading="t('operations_template.quick_actions')"
          ><CommandItem value="create" @select="selectCommand('create_opened')"
            ><FileUp />{{ t('operations_template.create_resource') }}</CommandItem
          ><CommandItem value="settings" @select="selectCommand('settings_opened')"
            ><Settings2 />{{ t('operations_template.open_settings') }}</CommandItem
          ><CommandItem value="search" @select="selectCommand('search_focused')"
            ><Search />{{ t('operations_template.search_members') }}</CommandItem
          ></CommandGroup
        ></CommandList
      ></CommandDialog
    >
  </PageShell>
</template>
