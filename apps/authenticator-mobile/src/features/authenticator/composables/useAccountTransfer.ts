import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { createEncryptedBackup, openEncryptedBackup } from '../services/backup'
import { collectMigrationParts, parseTransferQr } from '../services/migration'
import type { MigrationAccount, MigrationPart } from '../services/migration'
import type { TotpAccount } from '../services/totp'

type TransferStep = 'home' | 'export' | 'restore' | 'preview'
type TransferNotice = { key: string; values?: Record<string, number>; tone: 'error' | 'info' }

type TransferOptions = {
  accounts: { value: TotpAccount[] }
  busy: { value: boolean }
  isNative: boolean
  persist: (accounts: TotpAccount[], successKey: string) => Promise<boolean>
}

export function useAccountTransfer({ accounts, busy, isNative, persist }: TransferOptions) {
  const { t, locale } = useI18n()
  const showTransferDialog = ref(false)
  const transferStep = ref<TransferStep>('home')
  const transferNotice = ref<TransferNotice | null>(null)
  const backupContents = ref('')
  const migrationParts = ref<MigrationPart[]>([])
  const previewAccounts = ref<TotpAccount[]>([])
  const previewDuplicates = ref(0)
  const previewSkipped = ref(0)
  const previewSource = ref<'backup' | 'migration'>('backup')

  const transferDialogOpen = computed({
    get: () => showTransferDialog.value,
    set: (open: boolean) => {
      showTransferDialog.value = open
      if (!open) resetTransferState()
    },
  })

  function setTransferNotice(
    key: string,
    tone: 'error' | 'info' = 'info',
    values?: Record<string, number>
  ): void {
    transferNotice.value = { key, tone, values }
  }

  function resetTransferState(): void {
    transferStep.value = 'home'
    transferNotice.value = null
    backupContents.value = ''
    migrationParts.value = []
    previewAccounts.value = []
    previewDuplicates.value = 0
    previewSkipped.value = 0
  }

  function openTransfer(): void {
    transferNotice.value = null
    transferStep.value = 'home'
    showTransferDialog.value = true
  }

  function openBackupExport(): void {
    transferNotice.value = null
    transferStep.value = 'export'
  }

  function returnToTransferHome(): void {
    transferStep.value = 'home'
    transferNotice.value = null
  }

  function cancelBackupRestore(): void {
    returnToTransferHome()
    backupContents.value = ''
  }

  function cancelImportPreview(): void {
    returnToTransferHome()
    previewAccounts.value = []
  }

  function accountFingerprint(account: MigrationAccount): string {
    return JSON.stringify([
      account.issuer.trim().toLocaleLowerCase(locale.value),
      account.name.trim().toLocaleLowerCase(locale.value),
      account.secret,
      account.algorithm,
      account.digits,
      account.period,
    ])
  }

  function showImportPreview(
    imported: MigrationAccount[],
    source: 'backup' | 'migration',
    skippedCount: number
  ): void {
    const known = new Set(accounts.value.map(accountFingerprint))
    const additions: TotpAccount[] = []
    let duplicateCount = 0
    for (const account of imported) {
      const fingerprint = accountFingerprint(account)
      if (known.has(fingerprint)) {
        duplicateCount += 1
        continue
      }
      known.add(fingerprint)
      additions.push({ ...account, id: crypto.randomUUID() })
    }
    previewAccounts.value = additions
    previewDuplicates.value = duplicateCount
    previewSkipped.value = skippedCount
    previewSource.value = source
    transferNotice.value = null
    transferStep.value = 'preview'
  }

  async function deliverEncryptedBackup(contents: string): Promise<void> {
    const fileName = `project-authenticator-${new Date().toISOString().slice(0, 10)}.json`
    if (!isNative) {
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }

    const path = `${crypto.randomUUID()}-${fileName}`
    let uri = ''
    try {
      const file = await Filesystem.writeFile({
        path,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      uri = file.uri
      await Share.share({
        title: t('backupTitle'),
        text: t('backupShareDescription'),
        url: uri,
        dialogTitle: t('backupTitle'),
      })
    } finally {
      if (uri)
        await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined)
    }
  }

  async function exportBackup(password: string): Promise<void> {
    if (!accounts.value.length || busy.value) return
    busy.value = true
    transferNotice.value = null
    try {
      const encrypted = await createEncryptedBackup(accounts.value, password)
      await deliverEncryptedBackup(encrypted)
      setTransferNotice('backupCreated')
    } catch {
      setTransferNotice('backupExportFailed', 'error')
    } finally {
      busy.value = false
    }
  }

  function onBackupFileSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setTransferNotice('backupFileInvalid', 'error')
      return
    }

    void file
      .text()
      .then((contents) => {
        backupContents.value = contents
        transferNotice.value = null
        transferStep.value = 'restore'
      })
      .catch(() => setTransferNotice('backupFileInvalid', 'error'))
  }

  async function restoreBackup(password: string): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
      const restored = await openEncryptedBackup(backupContents.value, password)
      showImportPreview(restored, 'backup', 0)
    } catch {
      setTransferNotice('backupWrongPassword', 'error')
    } finally {
      busy.value = false
    }
  }

  function showCollectedMigration(): void {
    const collection = collectMigrationParts(migrationParts.value)
    if (collection.incomplete) {
      setTransferNotice('migrationQrIncomplete', 'info', collection.incomplete)
      transferStep.value = 'home'
      return
    }
    if (!collection.accounts.length) {
      setTransferNotice('migrationNoSupportedAccounts', 'error')
      return
    }
    showImportPreview(collection.accounts, 'migration', collection.skippedCount)
    migrationParts.value = []
  }

  function showMigrationQr(value: string): void {
    openTransfer()
    migrationParts.value.push(parseTransferQr(value))
    showCollectedMigration()
  }

  async function onMigrationImagesSelected(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? []).slice(0, 30)
    input.value = ''
    if (!files.length) return

    busy.value = true
    transferNotice.value = null
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const reader = new BrowserQRCodeReader()
      let decoded = 0
      for (const file of files) {
        if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) continue
        const url = URL.createObjectURL(file)
        try {
          const result = await reader.decodeFromImageUrl(url)
          migrationParts.value.push(parseTransferQr(result.getText()))
          decoded += 1
        } catch {
          // Ignore unsupported QR images while processing the rest of the selection.
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      if (!decoded) {
        setTransferNotice('migrationImagesInvalid', 'error')
        return
      }
      showCollectedMigration()
    } catch {
      setTransferNotice('migrationImagesFailed', 'error')
    } finally {
      busy.value = false
    }
  }

  async function scanMigrationCodes(): Promise<void> {
    if (!isNative || busy.value) return
    busy.value = true
    transferNotice.value = null
    try {
      while (true) {
        const result = await CapacitorBarcodeScanner.scanBarcode({
          hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
          scanInstructions: t('scanInstructions'),
          cancelButtonAccessibilityLabel: t('scanCancel'),
        })
        if (!result.ScanResult) break
        migrationParts.value.push(parseTransferQr(result.ScanResult))
        const collection = collectMigrationParts(migrationParts.value)
        if (!collection.incomplete) {
          if (collection.accounts.length) {
            showImportPreview(collection.accounts, 'migration', collection.skippedCount)
            migrationParts.value = []
          } else setTransferNotice('migrationNoSupportedAccounts', 'error')
          break
        }
        setTransferNotice('migrationQrIncomplete', 'info', collection.incomplete)
      }
    } catch (error) {
      if (!(error instanceof Error && error.message.toLowerCase().includes('cancel'))) {
        setTransferNotice('migrationQrInvalid', 'error')
      }
    } finally {
      busy.value = false
    }
  }

  async function importPreviewAccounts(): Promise<void> {
    if (!previewAccounts.value.length || busy.value) return
    if (await persist([...previewAccounts.value, ...accounts.value], 'importedAccounts')) {
      transferDialogOpen.value = false
    }
  }

  return {
    backupContents,
    cancelBackupRestore,
    cancelImportPreview,
    exportBackup,
    importPreviewAccounts,
    onBackupFileSelected,
    onMigrationImagesSelected,
    openBackupExport,
    openTransfer,
    previewAccounts,
    previewDuplicates,
    previewSkipped,
    previewSource,
    restoreBackup,
    returnToTransferHome,
    scanMigrationCodes,
    setTransferNotice,
    showMigrationQr,
    showTransferDialog,
    transferDialogOpen,
    transferNotice,
    transferStep,
  }
}

export type AccountTransferController = ReturnType<typeof useAccountTransfer>
