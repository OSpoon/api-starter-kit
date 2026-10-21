<script setup lang="ts">
import { ChevronDown, Download, ImagePlus, ScanLine, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import BackupExportForm from './BackupExportForm.vue'
import BackupRestoreForm from './BackupRestoreForm.vue'
import type { AccountTransferController } from '../composables/useAccountTransfer'
import type { TotpAccount } from '../services/totp'

const props = defineProps<{
  controller: AccountTransferController
  accounts: TotpAccount[]
  busy: boolean
  isNative: boolean
}>()
const controller = props.controller

const {
  backupContents,
  cancelBackupRestore,
  cancelImportPreview,
  exportBackup,
  importPreviewAccounts,
  onBackupFileSelected,
  onMigrationImagesSelected,
  previewAccounts,
  previewDuplicates,
  previewSkipped,
  previewSource,
  restoreBackup,
  returnToTransferHome,
  scanMigrationCodes,
  transferDialogOpen,
  transferNotice,
  transferStep,
} = props.controller
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="transferDialogOpen">
    <DialogContent :show-close-button="false" class="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogHeader class="flex-row items-start justify-between gap-4 space-y-0 text-left">
        <div>
          <p
            class="mb-1 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
          >
            {{ t('appName') }}
          </p>
          <DialogTitle>{{
            t(
              transferStep === 'preview'
                ? 'importPreviewTitle'
                : transferStep === 'restore'
                  ? 'restoreTitle'
                  : transferStep === 'export'
                    ? 'backupTitle'
                    : 'transferTitle'
            )
          }}</DialogTitle>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Button
            v-if="transferStep !== 'home'"
            variant="ghost"
            size="icon-sm"
            :aria-label="t('back')"
            :title="t('back')"
            @click="returnToTransferHome"
          >
            <ChevronDown :size="18" class="rotate-90" />
          </Button>
          <DialogClose as-child>
            <Button variant="ghost" size="icon-sm" :aria-label="t('close')" :title="t('close')"
              ><X :size="19"
            /></Button>
          </DialogClose>
        </div>
      </DialogHeader>
      <DialogDescription>{{
        t(
          transferStep === 'preview'
            ? 'importPreviewDescription'
            : transferStep === 'restore'
              ? 'restoreDescription'
              : transferStep === 'export'
                ? 'backupDescription'
                : 'transferDescription'
        )
      }}</DialogDescription>

      <Alert
        v-if="transferNotice"
        :variant="transferNotice.tone === 'error' ? 'destructive' : 'default'"
        role="status"
        aria-live="polite"
        class="py-2.5"
      >
        <AlertDescription>{{
          t(transferNotice.key, transferNotice.values ?? {})
        }}</AlertDescription>
      </Alert>

      <template v-if="transferStep === 'home'">
        <Card>
          <CardHeader class="px-4 pb-0">
            <CardTitle class="flex items-center gap-2 text-base"
              ><Download :size="17" />{{ t('backupSection') }}</CardTitle
            >
            <CardDescription>{{ t('backupSectionDescription') }}</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-3 px-4 pt-4 sm:grid-cols-2">
            <Button
              variant="outline"
              class="justify-start"
              :disabled="!accounts.length || busy"
              @click="controller.openBackupExport"
            >
              <Download :size="17" />{{ t('createBackup') }}
            </Button>
            <div class="space-y-1.5">
              <Label for="authenticator-backup-file">{{ t('selectBackupFile') }}</Label>
              <Input
                id="authenticator-backup-file"
                type="file"
                accept=".json,application/json"
                :disabled="busy"
                @change="onBackupFileSelected"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="px-4 pb-0">
            <CardTitle class="flex items-center gap-2 text-base"
              ><ImagePlus :size="17" />{{ t('migrationSection') }}</CardTitle
            >
            <CardDescription>{{ t('migrationSectionDescription') }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-2 px-4 pt-4">
            <Label for="authenticator-migration-images">{{ t('selectMigrationImages') }}</Label>
            <Input
              id="authenticator-migration-images"
              type="file"
              accept="image/*"
              multiple
              :disabled="busy"
              @change="onMigrationImagesSelected"
            />
            <p class="m-0 text-xs leading-relaxed text-muted-foreground">
              {{ t('migrationImageHint') }}
            </p>
            <div v-if="busy" class="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />{{ t('migrationReading') }}
            </div>
            <Button
              v-if="isNative"
              variant="outline"
              class="w-full justify-start"
              :disabled="busy"
              @click="scanMigrationCodes"
            >
              <ScanLine :size="17" />{{ t('scanMigrationCodes') }}
            </Button>
          </CardContent>
        </Card>
      </template>

      <BackupExportForm
        v-else-if="transferStep === 'export'"
        :busy="busy"
        :can-export="accounts.length > 0"
        @submit="exportBackup"
        @cancel="returnToTransferHome"
      />
      <BackupRestoreForm
        v-else-if="transferStep === 'restore'"
        :busy="busy"
        :has-backup="Boolean(backupContents)"
        @submit="restoreBackup"
        @cancel="cancelBackupRestore"
      />
      <template v-else>
        <div class="grid gap-2 rounded-lg border p-3 text-sm">
          <p class="m-0">{{ t('previewImportCount', { count: previewAccounts.length }) }}</p>
          <p v-if="previewDuplicates" class="m-0 text-muted-foreground">
            {{ t('previewDuplicates', { count: previewDuplicates }) }}
          </p>
          <p v-if="previewSkipped" class="m-0 text-muted-foreground">
            {{ t('previewSkipped', { count: previewSkipped }) }}
          </p>
          <Separator v-if="previewAccounts.length" />
          <ul v-if="previewAccounts.length" class="m-0 grid gap-1 pl-5 text-muted-foreground">
            <li v-for="account in previewAccounts.slice(0, 8)" :key="account.id" class="truncate">
              {{ account.issuer }} · {{ account.name }}
            </li>
            <li v-if="previewAccounts.length > 8">
              {{ t('previewMore', { count: previewAccounts.length - 8 }) }}
            </li>
          </ul>
        </div>
        <DialogFooter class="gap-2 sm:gap-2">
          <Button variant="outline" type="button" :disabled="busy" @click="cancelImportPreview">{{
            t('cancel')
          }}</Button>
          <Button
            type="button"
            :disabled="busy || !previewAccounts.length"
            @click="importPreviewAccounts"
          >
            <Spinner v-if="busy" />{{
              t(previewSource === 'backup' ? 'restoreAccounts' : 'importAccounts')
            }}
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
