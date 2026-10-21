import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { createEncryptedBackup, openEncryptedBackup } from '../services/backup'
import type { TotpAccount } from '../services/totp'

type TransferStep = 'home' | 'export' | 'restore' | 'preview'
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
  const backupContents = ref('')
  const previewAccounts = ref<TotpAccount[]>([])
  const previewDuplicates = ref(0)

  const transferDialogOpen = computed({
    get: () => showTransferDialog.value,
    set: (open: boolean) => {
      showTransferDialog.value = open
      if (!open) resetTransferState()
    },
  })

  function notifyTransfer(
    key: string,
    tone: 'error' | 'info' | 'success',
    values?: Record<string, number>
  ): void {
    const message = t(key, values ?? {})
    if (tone === 'error') toast.error(message)
    else if (tone === 'success') toast.success(message)
    else toast.info(message)
  }

  function resetTransferState(): void {
    transferStep.value = 'home'
    backupContents.value = ''
    previewAccounts.value = []
    previewDuplicates.value = 0
  }

  function openTransfer(): void {
    transferStep.value = 'home'
    showTransferDialog.value = true
  }

  function openBackupExport(): void {
    transferStep.value = 'export'
  }

  function returnToTransferHome(): void {
    transferStep.value = 'home'
  }

  function cancelBackupRestore(): void {
    returnToTransferHome()
    backupContents.value = ''
  }

  function cancelRestorePreview(): void {
    returnToTransferHome()
    previewAccounts.value = []
  }

  function accountFingerprint(account: TotpAccount): string {
    return JSON.stringify([
      account.issuer.trim().toLocaleLowerCase(locale.value),
      account.name.trim().toLocaleLowerCase(locale.value),
      account.secret,
      account.algorithm,
      account.digits,
      account.period,
    ])
  }

  function showRestorePreview(imported: TotpAccount[]): void {
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
    try {
      const encrypted = await createEncryptedBackup(accounts.value, password)
      await deliverEncryptedBackup(encrypted)
      notifyTransfer('backupCreated', 'success')
    } catch {
      notifyTransfer('backupExportFailed', 'error')
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
      notifyTransfer('backupFileInvalid', 'error')
      return
    }

    void file
      .text()
      .then((contents) => {
        backupContents.value = contents
        transferStep.value = 'restore'
      })
      .catch(() => notifyTransfer('backupFileInvalid', 'error'))
  }

  async function restoreBackup(password: string): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
      const restored = await openEncryptedBackup(backupContents.value, password)
      showRestorePreview(restored)
    } catch {
      notifyTransfer('backupWrongPassword', 'error')
    } finally {
      busy.value = false
    }
  }

  async function restorePreviewAccounts(): Promise<void> {
    if (!previewAccounts.value.length || busy.value) return
    if (await persist([...previewAccounts.value, ...accounts.value], 'accountsRestored')) {
      transferDialogOpen.value = false
    }
  }

  return {
    backupContents,
    cancelBackupRestore,
    cancelRestorePreview,
    exportBackup,
    onBackupFileSelected,
    openBackupExport,
    openTransfer,
    previewAccounts,
    previewDuplicates,
    restoreBackup,
    restorePreviewAccounts,
    returnToTransferHome,
    showTransferDialog,
    transferDialogOpen,
    transferStep,
  }
}

export type AccountTransferController = ReturnType<typeof useAccountTransfer>
