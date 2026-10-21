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

export function useAuthenticator() {
  const { t, locale } = useI18n()
  const isNative = Capacitor.isNativePlatform()
  const accounts = ref<TotpAccount[]>([])
  const sortMode = ref<AccountSortMode>('manual')
  const search = ref('')
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

  function notify(key: string, tone: 'success' | 'error' | 'info' = 'info'): void {
    const message = t(key)
    if (tone === 'success') toast.success(message)
    else if (tone === 'error') toast.error(message)
    else toast.info(message)
  }

  const { codes, now, refreshCodes } = useTotpCodes(accounts, () => notify('codeFailed', 'error'))

  async function persist(nextAccounts: TotpAccount[], successKey: string): Promise<boolean> {
    if (!vaultReady.value || busy.value) return false
    busy.value = true
    try {
      await saveAccounts(nextAccounts)
      accounts.value = nextAccounts
      await refreshCodes(true)
      notify(successKey, 'success')
      return true
    } catch {
      notify('storageError', 'error')
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
      notify('loadFailed', 'error')
    } finally {
      loading.value = false
    }
  }

  function openAddMenu(): void {
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
      notify('sortSaved', 'success')
    } catch {
      notify('storageError', 'error')
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
    if (!isNative) {
      notify('scanNativeOnly', 'info')
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
        notify('scanFailed', 'error')
      }
      busy.value = false
      return
    }

    if (!scanResult) {
      busy.value = false
      return
    }

    try {
      const parsed = parseOtpAuthUri(scanResult)
      const account: TotpAccount = {
        ...parsed,
        id: crypto.randomUUID(),
        issuer: parsed.issuer || parsed.name,
      }
      busy.value = false
      await persist([account, ...accounts.value], 'saved')
    } catch {
      notify('scanInvalid', 'error')
    } finally {
      busy.value = false
    }
  }

  function requestDelete(account: TotpAccount): void {
    deletingId.value = account.id
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
        notify('copyFailed', 'error')
        return
      }
    }
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
    loading,
    moveAccount,
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
