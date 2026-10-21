import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useAccountTransfer } from './useAccountTransfer'
import { useTotpCodes } from './useTotpCodes'
import { moveAccount as moveAccountInList, orderAccounts } from '../services/account-order'
import type { AccountSortMode } from '../services/account-order'
import { parseOtpAuthUri } from '../services/totp'
import type { TotpAccount } from '../services/totp'
import { loadAccounts, loadSortMode, saveAccounts, saveSortMode } from '../services/vault'

export type AccountNotice = { key: string; tone: 'success' | 'error' | 'info' } | null

export function useAuthenticator() {
  const { t, locale } = useI18n()
  const isNative = Capacitor.isNativePlatform()
  const accounts = ref<TotpAccount[]>([])
  const sortMode = ref<AccountSortMode>('manual')
  const search = ref('')
  const notice = ref<AccountNotice>(null)
  const loading = ref(true)
  const vaultReady = ref(false)
  const busy = ref(false)
  const showAddMenu = ref(false)
  const showSortMenu = ref(false)
  const showAccountForm = ref(false)
  const editingId = ref('')
  const deletingId = ref('')
  const showDeleteDialog = computed({
    get: () => Boolean(deletingId.value),
    set: (open: boolean) => {
      if (!open) deletingId.value = ''
    },
  })
  const accountToDelete = computed(() =>
    accounts.value.find((account) => account.id === deletingId.value)
  )
  const accountBeingEdited = computed(
    () => accounts.value.find((account) => account.id === editingId.value) ?? null
  )
  const orderedAccounts = computed(() =>
    orderAccounts(accounts.value, sortMode.value, locale.value)
  )
  const filteredAccounts = computed(() => {
    const query = search.value.trim().toLocaleLowerCase(locale.value)
    if (!query) return orderedAccounts.value
    return orderedAccounts.value.filter((account) =>
      `${account.issuer} ${account.name}`.toLocaleLowerCase(locale.value).includes(query)
    )
  })

  function setNotice(key: string, tone: 'success' | 'error' | 'info' = 'info'): void {
    notice.value = { key, tone }
  }

  const { codes, now, refreshCodes } = useTotpCodes(accounts, () =>
    setNotice('codeFailed', 'error')
  )

  async function persist(nextAccounts: TotpAccount[], successKey: string): Promise<boolean> {
    if (!vaultReady.value || busy.value) return false
    busy.value = true
    try {
      await saveAccounts(nextAccounts)
      accounts.value = nextAccounts
      await refreshCodes(true)
      setNotice(successKey, 'success')
      return true
    } catch {
      setNotice('storageError', 'error')
      return false
    } finally {
      busy.value = false
    }
  }

  const transfer = useAccountTransfer({ accounts, busy, isNative, persist })

  async function initialize(): Promise<void> {
    try {
      accounts.value = await loadAccounts()
      sortMode.value = await loadSortMode()
      vaultReady.value = true
      await refreshCodes(true)
    } catch {
      setNotice('loadFailed', 'error')
    } finally {
      loading.value = false
    }
  }

  function openAddMenu(): void {
    notice.value = null
    showAddMenu.value = true
  }

  function openSortMenu(): void {
    showSortMenu.value = true
  }

  async function openManualForm(): Promise<void> {
    showAddMenu.value = false
    await nextTick()
    editingId.value = ''
    showAccountForm.value = true
  }

  function openEditForm(account: TotpAccount): void {
    editingId.value = account.id
    showAccountForm.value = true
  }

  async function saveAccount(account: TotpAccount): Promise<void> {
    const existing = accounts.value.some((item) => item.id === editingId.value)
    const nextAccounts = existing
      ? accounts.value.map((item) => (item.id === editingId.value ? account : item))
      : [account, ...accounts.value]
    if (await persist(nextAccounts, existing ? 'updated' : 'saved')) showAccountForm.value = false
  }

  async function changeSortMode(mode: AccountSortMode): Promise<void> {
    if (busy.value) return
    if (mode === sortMode.value) {
      showSortMenu.value = false
      return
    }
    busy.value = true
    try {
      await saveSortMode(mode)
      sortMode.value = mode
      showSortMenu.value = false
      setNotice('sortSaved', 'success')
    } catch {
      setNotice('storageError', 'error')
    } finally {
      busy.value = false
    }
  }

  async function moveAccount(account: TotpAccount, direction: -1 | 1): Promise<void> {
    if (busy.value || sortMode.value !== 'manual') return
    const nextAccounts = moveAccountInList(accounts.value, account.id, direction)
    if (nextAccounts !== accounts.value) await persist(nextAccounts, 'orderUpdated')
  }

  async function scanSetupCode(): Promise<void> {
    showAddMenu.value = false
    notice.value = null
    if (!isNative) {
      setNotice('scanNativeOnly', 'info')
      return
    }
    busy.value = true
    let scanResult = ''
    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: t('scanInstructions'),
        cancelButtonAccessibilityLabel: t('scanCancel'),
      })
      scanResult = result.ScanResult
    } catch (error) {
      if (!(error instanceof Error && error.message.toLowerCase().includes('cancel'))) {
        setNotice('scanFailed', 'error')
      }
      busy.value = false
      return
    }

    if (!scanResult) {
      busy.value = false
      return
    }

    try {
      if (scanResult.toLowerCase().startsWith('otpauth-migration:')) {
        busy.value = false
        transfer.showMigrationQr(scanResult)
        return
      }
      const parsed = parseOtpAuthUri(scanResult)
      const account: TotpAccount = {
        ...parsed,
        id: crypto.randomUUID(),
        issuer: parsed.issuer || parsed.name,
      }
      busy.value = false
      await persist([account, ...accounts.value], 'saved')
    } catch {
      setNotice('scanInvalid', 'error')
    } finally {
      busy.value = false
    }
  }

  function requestDelete(account: TotpAccount): void {
    deletingId.value = account.id
    notice.value = null
  }

  async function deleteAccount(): Promise<void> {
    if (!deletingId.value) return
    const nextAccounts = accounts.value.filter((account) => account.id !== deletingId.value)
    if (await persist(nextAccounts, 'deleted')) deletingId.value = ''
  }

  async function copyCode(account: TotpAccount): Promise<void> {
    const code = codes.value[account.id]
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const field = document.createElement('textarea')
      field.value = code
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.append(field)
      field.select()
      const copied = document.execCommand('copy')
      field.remove()
      if (!copied) {
        setNotice('copyFailed', 'error')
        return
      }
    }
    notice.value = null
    toast.success(t('copied'))
  }

  onMounted(() => void initialize())

  return {
    accountBeingEdited,
    accountToDelete,
    accounts,
    busy,
    changeSortMode,
    codes,
    copyCode,
    deleteAccount,
    filteredAccounts,
    isNative,
    loading,
    moveAccount,
    notice,
    now,
    openAddMenu,
    openEditForm,
    openManualForm,
    openSortMenu,
    requestDelete,
    saveAccount,
    scanSetupCode,
    search,
    showAccountForm,
    showAddMenu,
    showDeleteDialog,
    showSortMenu,
    sortMode,
    transfer,
    vaultReady,
  }
}
