<script setup lang="ts">
import 'vue-sonner/style.css'

import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  ListOrdered,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  X,
} from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Toaster } from '@/components/ui/sonner'
import { firstFormError } from '@/lib/form-validation'
import { toast } from 'vue-sonner'
import { moveAccount as moveAccountInList, orderAccounts } from './account-order'
import type { AccountSortMode } from './account-order'
import { createEncryptedBackup, openEncryptedBackup } from './backup'
import { collectMigrationParts, parseTransferQr } from './migration'
import type { MigrationAccount, MigrationPart } from './migration'
import { generateTotpCode, isValidSecret, normalizeSecret, parseOtpAuthUri } from './totp'
import type { TotpAccount } from './totp'
import { loadAccounts, loadSortMode, saveAccounts, saveSortMode } from './vault'

const { t, locale } = useI18n()
const isNative = Capacitor.isNativePlatform()
const accounts = ref<TotpAccount[]>([])
const sortMode = ref<AccountSortMode>('manual')
const codes = ref<Record<string, string>>({})
const now = ref(Date.now())
const search = ref('')
const notice = ref<{ key: string; tone: 'success' | 'error' | 'info' } | null>(null)
const loading = ref(true)
const vaultReady = ref(false)
const busy = ref(false)
const showAddMenu = ref(false)
const showSortMenu = ref(false)
const showTransferDialog = ref(false)
const transferStep = ref<'home' | 'export' | 'restore' | 'preview'>('home')
const transferNotice = ref<{
  key: string
  values?: Record<string, number>
  tone: 'error' | 'info'
} | null>(null)
const backupContents = ref('')
const migrationParts = ref<MigrationPart[]>([])
const previewAccounts = ref<TotpAccount[]>([])
const previewDuplicates = ref(0)
const previewSkipped = ref(0)
const previewSource = ref<'backup' | 'migration'>('backup')
const showAccountForm = ref(false)
const advancedOpen = ref(false)
const editingId = ref('')
const deletingId = ref('')
const showDeleteDialog = computed({
  get: () => Boolean(deletingId.value),
  set: (open: boolean) => {
    if (!open) deletingId.value = ''
  },
})
const transferDialogOpen = computed({
  get: () => showTransferDialog.value,
  set: (open: boolean) => {
    showTransferDialog.value = open
    if (!open) resetTransferState()
  },
})
const revealSecret = ref(false)
const codeBuckets = new Map<string, number>()
let clock: ReturnType<typeof setInterval> | undefined
let codeRefreshSequence = 0

type AccountFormValues = {
  issuer: string
  name: string
  secret: string
  algorithm: TotpAccount['algorithm']
  digits: '6' | '8'
  period: string
}

type BackupExportValues = {
  password: string
  confirmation: string
}

type BackupRestoreValues = {
  password: string
}

const validationSchema = computed(() =>
  toTypedSchema(
    z
      .object({
        issuer: z.string().trim().min(1, t('issuerRequired')).max(80),
        name: z.string().trim().min(1, t('accountRequired')).max(120),
        secret: z.string().trim(),
        algorithm: z.enum(['SHA1', 'SHA256', 'SHA512']),
        digits: z.enum(['6', '8']),
        period: z
          .string()
          .trim()
          .refine((value) => {
            const period = Number(value)
            return Number.isInteger(period) && period >= 1 && period <= 86400
          }, t('periodInvalid')),
      })
      .superRefine((values, context) => {
        if (!values.secret && !editingId.value) {
          context.addIssue({ code: 'custom', path: ['secret'], message: t('secretRequired') })
        } else if (values.secret && !isValidSecret(values.secret)) {
          context.addIssue({ code: 'custom', path: ['secret'], message: t('secretInvalid') })
        }
      })
  )
)

const form = useForm<AccountFormValues>({
  validationSchema,
  initialValues: { issuer: '', name: '', secret: '', algorithm: 'SHA1', digits: '6', period: '30' },
})

const backupExportSchema = computed(() =>
  toTypedSchema(
    z
      .object({
        password: z.string().min(6, t('backupPasswordShort')).max(256),
        confirmation: z.string().min(1, t('backupPasswordRequired')),
      })
      .refine((values) => values.password === values.confirmation, {
        path: ['confirmation'],
        message: t('backupPasswordMismatch'),
      })
  )
)

const backupExportForm = useForm<BackupExportValues>({
  validationSchema: backupExportSchema,
  initialValues: { password: '', confirmation: '' },
})

const backupRestoreSchema = computed(() =>
  toTypedSchema(z.object({ password: z.string().min(1, t('backupPasswordRequired')).max(256) }))
)

const backupRestoreForm = useForm<BackupRestoreValues>({
  validationSchema: backupRestoreSchema,
  initialValues: { password: '' },
})

const orderedAccounts = computed(() => orderAccounts(accounts.value, sortMode.value, locale.value))

const filteredAccounts = computed(() => {
  const query = search.value.trim().toLocaleLowerCase(locale.value)
  if (!query) return orderedAccounts.value
  return orderedAccounts.value.filter((account) =>
    `${account.issuer} ${account.name}`.toLocaleLowerCase(locale.value).includes(query)
  )
})

const accountToDelete = computed(() =>
  accounts.value.find((account) => account.id === deletingId.value)
)

function setNotice(key: string, tone: 'success' | 'error' | 'info' = 'info'): void {
  notice.value = { key, tone }
}

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
  backupExportForm.resetForm({ values: { password: '', confirmation: '' } })
  backupRestoreForm.resetForm({ values: { password: '' } })
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

function openTransfer(): void {
  notice.value = null
  transferNotice.value = null
  transferStep.value = 'home'
  showTransferDialog.value = true
}

function openBackupExport(): void {
  transferNotice.value = null
  backupExportForm.resetForm({ values: { password: '', confirmation: '' } })
  transferStep.value = 'export'
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

const submitBackupExport = backupExportForm.handleSubmit(
  async (values) => {
    if (!accounts.value.length || busy.value) return
    busy.value = true
    transferNotice.value = null
    try {
      const encrypted = await createEncryptedBackup(accounts.value, values.password)
      await deliverEncryptedBackup(encrypted)
      backupExportForm.resetForm({ values: { password: '', confirmation: '' } })
      setTransferNotice('backupCreated')
    } catch {
      setTransferNotice('backupExportFailed', 'error')
    } finally {
      busy.value = false
    }
  },
  ({ errors }) => setTransferNotice(firstFormError(errors, t('formInvalid')), 'error')
)

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
      backupRestoreForm.resetForm({ values: { password: '' } })
      transferNotice.value = null
      transferStep.value = 'restore'
    })
    .catch(() => setTransferNotice('backupFileInvalid', 'error'))
}

const submitBackupRestore = backupRestoreForm.handleSubmit(
  async (values) => {
    if (busy.value) return
    busy.value = true
    try {
      const restored = await openEncryptedBackup(backupContents.value, values.password)
      showImportPreview(restored, 'backup', 0)
    } catch {
      setTransferNotice('backupWrongPassword', 'error')
    } finally {
      busy.value = false
    }
  },
  ({ errors }) => setTransferNotice(firstFormError(errors, t('formInvalid')), 'error')
)

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
        // Ignore images without a supported QR; keep processing the rest of the selection.
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

async function refreshCodes(force = false): Promise<void> {
  const sequence = ++codeRefreshSequence
  const timestamp = now.value
  const liveIds = new Set(accounts.value.map((account) => account.id))
  const nextCodes = { ...codes.value }
  for (const id of Object.keys(nextCodes)) {
    if (!liveIds.has(id)) {
      delete nextCodes[id]
      codeBuckets.delete(id)
    }
  }

  try {
    const updates = await Promise.all(
      accounts.value
        .filter((account) => {
          const bucket = Math.floor(timestamp / 1000 / account.period)
          return force || codeBuckets.get(account.id) !== bucket
        })
        .map(async (account) => ({
          id: account.id,
          bucket: Math.floor(timestamp / 1000 / account.period),
          code: await generateTotpCode(account, timestamp),
        }))
    )
    if (sequence !== codeRefreshSequence) return
    for (const update of updates) {
      nextCodes[update.id] = update.code
      codeBuckets.set(update.id, update.bucket)
    }
    codes.value = nextCodes
  } catch {
    if (sequence === codeRefreshSequence) setNotice('codeFailed', 'error')
  }
}

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

function openAddMenu(): void {
  notice.value = null
  showAddMenu.value = true
}

function openSortMenu(): void {
  showSortMenu.value = true
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

function accountPosition(account: TotpAccount): number {
  return accounts.value.findIndex((item) => item.id === account.id)
}

async function moveAccount(account: TotpAccount, direction: -1 | 1): Promise<void> {
  if (busy.value || sortMode.value !== 'manual') return
  const nextAccounts = moveAccountInList(accounts.value, account.id, direction)
  if (nextAccounts !== accounts.value) await persist(nextAccounts, 'orderUpdated')
}

async function openManualForm(): Promise<void> {
  showAddMenu.value = false
  await nextTick()
  editingId.value = ''
  revealSecret.value = false
  form.resetForm({
    values: { issuer: '', name: '', secret: '', algorithm: 'SHA1', digits: '6', period: '30' },
  })
  showAccountForm.value = true
}

function openEditForm(account: TotpAccount): void {
  editingId.value = account.id
  revealSecret.value = false
  form.resetForm({
    values: {
      issuer: account.issuer || account.name,
      name: account.name,
      secret: '',
      algorithm: account.algorithm,
      digits: String(account.digits) as '6' | '8',
      period: String(account.period),
    },
  })
  showAccountForm.value = true
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
      migrationParts.value.push(parseTransferQr(scanResult))
      busy.value = false
      showTransferDialog.value = true
      showCollectedMigration()
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

const submitForm = form.handleSubmit(
  async (values) => {
    const existing = accounts.value.find((account) => account.id === editingId.value)
    const secret = normalizeSecret(values.secret || existing?.secret || '')
    const account: TotpAccount = {
      id: existing?.id || crypto.randomUUID(),
      issuer: values.issuer.trim(),
      name: values.name.trim(),
      secret,
      algorithm: values.algorithm,
      digits: Number(values.digits) as TotpAccount['digits'],
      period: Number(values.period),
    }
    const nextAccounts = existing
      ? accounts.value.map((current) => (current.id === existing.id ? account : current))
      : [account, ...accounts.value]

    if (await persist(nextAccounts, existing ? 'updated' : 'saved')) showAccountForm.value = false
  },
  ({ errors }) => setNotice(firstFormError(errors, t('formInvalid')), 'error')
)

function requestDelete(account: TotpAccount): void {
  deletingId.value = account.id
  notice.value = null
}

async function deleteAccount(): Promise<void> {
  if (!deletingId.value) return
  const nextAccounts = accounts.value.filter((account) => account.id !== deletingId.value)
  if (await persist(nextAccounts, 'deleted')) deletingId.value = ''
}

function remainingSeconds(account: TotpAccount): number {
  return account.period - (Math.floor(now.value / 1000) % account.period)
}

function progressPercent(account: TotpAccount): number {
  return (remainingSeconds(account) / account.period) * 100
}

function formatCode(code: string): string {
  const split = code.length === 6 ? 3 : 4
  return `${code.slice(0, split)} ${code.slice(split)}`
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

function updateClock(): void {
  now.value = Date.now()
  void refreshCodes()
}

function syncClock(): void {
  if (document.visibilityState === 'hidden') {
    if (clock) clearInterval(clock)
    clock = undefined
    return
  }

  updateClock()
  if (!clock) clock = setInterval(updateClock, 1000)
}

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

onMounted(() => {
  void initialize()
  syncClock()
  document.addEventListener('visibilitychange', syncClock)
  window.addEventListener('focus', syncClock)
})

onUnmounted(() => {
  if (clock) clearInterval(clock)
  document.removeEventListener('visibilitychange', syncClock)
  window.removeEventListener('focus', syncClock)
})
</script>

<template>
  <main
    class="mx-auto flex h-dvh min-h-0 w-full max-w-[620px] flex-col gap-5 overflow-hidden px-6 py-[max(1.625rem,env(safe-area-inset-top))] pb-[max(2.25rem,env(safe-area-inset-bottom))]"
  >
    <header class="flex shrink-0 items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <Avatar class="size-11 shrink-0 rounded-2xl border bg-card">
          <AvatarFallback><ShieldCheck :size="21" :stroke-width="1.8" /></AvatarFallback>
        </Avatar>
        <div class="min-w-0">
          <p
            class="mb-0.5 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
          >
            {{ t('appName') }}
          </p>
          <h1 class="m-0 text-[21px] font-medium tracking-tight">{{ t('pageTitle') }}</h1>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          v-if="accounts.length > 0"
          variant="outline"
          size="icon-lg"
          :aria-label="t('sortTitle')"
          :title="t('sortTitle')"
          :disabled="!vaultReady || busy"
          @click="openSortMenu"
        >
          <ListOrdered :size="19" />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          :aria-label="t('transferTitle')"
          :title="t('transferTitle')"
          :disabled="!vaultReady || busy"
          @click="openTransfer"
        >
          <ArrowLeftRight :size="19" />
        </Button>
        <Button
          variant="default"
          size="icon-lg"
          :aria-label="t('add')"
          :title="t('add')"
          :disabled="!vaultReady || busy"
          @click="openAddMenu"
        >
          <Plus :size="21" :stroke-width="2" />
        </Button>
      </div>
    </header>

    <p class="-mt-3 mb-0 ml-14 shrink-0 text-xs leading-relaxed text-muted-foreground">
      {{ t('pageHint') }}
    </p>

    <div class="shrink-0 space-y-2">
      <Label for="account-search">{{ t('searchLabel') }}</Label>
      <InputGroup>
        <InputGroupAddon align="inline-start" class="pl-3"
          ><Search :size="18" aria-hidden="true"
        /></InputGroupAddon>
        <InputGroupInput
          id="account-search"
          v-model="search"
          type="search"
          :placeholder="t('searchPlaceholder')"
        />
        <InputGroupAddon v-if="search" align="inline-end" class="pr-1">
          <InputGroupButton
            size="icon-sm"
            variant="ghost"
            :aria-label="t('clearSearch')"
            :title="t('clearSearch')"
            @click="search = ''"
            ><X :size="16"
          /></InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>

    <Alert
      v-if="notice"
      :variant="notice.tone === 'error' ? 'destructive' : 'default'"
      role="status"
      aria-live="polite"
      class="shrink-0 py-2.5"
    >
      <AlertDescription>{{ t(notice.key) }}</AlertDescription>
    </Alert>
    <section
      class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-20"
      :aria-label="t('pageTitle')"
    >
      <Card v-if="loading" role="status">
        <CardContent class="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
          <Spinner />
          <span>{{ t('loading') }}</span>
        </CardContent>
        <CardContent class="space-y-2 pt-0">
          <Skeleton class="h-8 w-2/3" />
          <Skeleton class="h-5 w-1/2" />
        </CardContent>
      </Card>
      <Alert v-else-if="!vaultReady" variant="destructive" role="status">
        <KeyRound :size="20" aria-hidden="true" />
        <AlertDescription>{{ t('loadFailed') }}</AlertDescription>
      </Alert>
      <Card v-else-if="accounts.length === 0">
        <CardContent class="flex flex-col items-center px-6 py-10 text-center">
          <Avatar class="mb-4 size-14 rounded-2xl border bg-secondary">
            <AvatarFallback><KeyRound :size="26" :stroke-width="1.6" /></AvatarFallback>
          </Avatar>
          <CardTitle class="mb-2">{{ t('emptyTitle') }}</CardTitle>
          <CardDescription class="mb-5 max-w-sm">{{ t('emptyDescription') }}</CardDescription>
          <Button @click="openAddMenu"><Plus :size="17" />{{ t('emptyAction') }}</Button>
        </CardContent>
      </Card>
      <Card v-else-if="filteredAccounts.length === 0">
        <CardContent class="py-6 text-center text-sm text-muted-foreground">{{
          t('noResults')
        }}</CardContent>
      </Card>

      <Card
        v-for="(account, index) in filteredAccounts"
        v-else
        :key="account.id"
        class="gap-2 py-3"
      >
        <CardHeader class="flex min-w-0 flex-row items-center gap-2.5 px-3 pb-0">
          <Avatar class="size-9 shrink-0 rounded-xl border bg-secondary">
            <AvatarFallback class="rounded-xl text-sm font-semibold">{{
              (account.issuer || account.name).slice(0, 1).toLocaleUpperCase(locale)
            }}</AvatarFallback>
          </Avatar>
          <div class="min-w-0 flex-1">
            <CardTitle class="truncate text-sm">{{ account.issuer || account.name }}</CardTitle>
            <CardDescription class="truncate text-xs">{{ account.name }}</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="t('accountActions', { account: account.issuer || account.name })"
                :title="t('accountActions', { account: account.issuer || account.name })"
              >
                <Ellipsis :size="20" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="openEditForm(account)">{{ t('edit') }}</DropdownMenuItem>
              <template v-if="sortMode === 'manual' && !search.trim()">
                <DropdownMenuItem
                  :disabled="busy || index === 0"
                  @select="moveAccount(account, -1)"
                  >{{ t('moveUp') }}</DropdownMenuItem
                >
                <DropdownMenuItem
                  :disabled="busy || index === accounts.length - 1"
                  @select="moveAccount(account, 1)"
                  >{{ t('moveDown') }}</DropdownMenuItem
                >
              </template>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" @select="requestDelete(account)">{{
                t('delete')
              }}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent class="px-4 pb-0">
          <Button
            variant="ghost"
            class="h-auto w-full justify-between rounded-lg px-2 py-2"
            :aria-label="`${t('copy')} ${account.issuer} ${account.name}`"
            :title="t('copy')"
            @click="copyCode(account)"
          >
            <span
              class="font-mono text-[clamp(1.375rem,7vw,1.75rem)] leading-none font-medium tracking-[0.1em] tabular-nums"
              >{{ codes[account.id] ? formatCode(codes[account.id]!) : '••• •••' }}</span
            >
            <Copy :size="15" class="shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </CardContent>
        <CardFooter class="flex items-center gap-2 px-3 pt-0">
          <Progress
            :model-value="progressPercent(account)"
            :aria-label="t('secondsLeft', { seconds: remainingSeconds(account) })"
            class="h-1.5 flex-1"
          />
          <Badge variant="secondary" class="shrink-0 text-xs font-normal">{{
            t('secondsLeft', { seconds: remainingSeconds(account) })
          }}</Badge>
        </CardFooter>
      </Card>
    </section>

    <Button
      v-if="accounts.length > 0"
      variant="default"
      size="icon-lg"
      class="fixed right-6 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 size-12 rounded-full shadow-lg sm:right-[calc((100vw-620px)/2+1.5rem)]"
      :aria-label="t('add')"
      :title="t('add')"
      :disabled="!vaultReady || busy"
      @click="openAddMenu"
    >
      <Plus :size="24" />
    </Button>

    <Dialog v-model:open="showAddMenu">
      <DialogContent
        :show-close-button="false"
        class="max-h-[85dvh] rounded-t-2xl p-5 sm:rounded-xl"
      >
        <DialogHeader class="flex-row items-start justify-between gap-4 space-y-0 text-left">
          <div>
            <p
              class="mb-1 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
            >
              {{ t('appName') }}
            </p>
            <DialogTitle>{{ t('addAccount') }}</DialogTitle>
          </div>
          <DialogClose as-child
            ><Button variant="ghost" size="icon-sm" :aria-label="t('close')" :title="t('close')"
              ><X :size="19" /></Button
          ></DialogClose>
        </DialogHeader>
        <DialogDescription class="sr-only">{{ t('addDialogDescription') }}</DialogDescription>
        <Button
          variant="outline"
          class="h-auto justify-between whitespace-normal p-4 text-left"
          :disabled="busy"
          @click="scanSetupCode"
        >
          <span class="flex min-w-0 items-center gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary"
              ><ScanLine :size="21"
            /></span>
            <span class="min-w-0"
              ><span class="block font-semibold">{{ t('scanTitle') }}</span
              ><span class="mt-1 block text-xs leading-relaxed text-muted-foreground">{{
                t('scanDescription')
              }}</span></span
            >
          </span>
          <span class="text-xl text-muted-foreground" aria-hidden="true">›</span>
        </Button>
        <Button
          variant="outline"
          class="h-auto justify-between whitespace-normal p-4 text-left"
          @click="openManualForm"
        >
          <span class="flex min-w-0 items-center gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary"
              ><KeyRound :size="21"
            /></span>
            <span class="min-w-0"
              ><span class="block font-semibold">{{ t('manualTitle') }}</span
              ><span class="mt-1 block text-xs leading-relaxed text-muted-foreground">{{
                t('manualDescription')
              }}</span></span
            >
          </span>
          <span class="text-xl text-muted-foreground" aria-hidden="true">›</span>
        </Button>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showSortMenu">
      <DialogContent :show-close-button="false" class="max-w-sm">
        <DialogHeader class="flex-row items-start justify-between gap-4 space-y-0 text-left">
          <div>
            <p
              class="mb-1 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
            >
              {{ t('appName') }}
            </p>
            <DialogTitle>{{ t('sortTitle') }}</DialogTitle>
          </div>
          <DialogClose as-child
            ><Button variant="ghost" size="icon-sm" :aria-label="t('close')" :title="t('close')"
              ><X :size="19" /></Button
          ></DialogClose>
        </DialogHeader>
        <DialogDescription>{{ t('sortDescription') }}</DialogDescription>
        <div class="grid gap-2">
          <Button
            variant="outline"
            class="justify-between"
            :aria-pressed="sortMode === 'manual'"
            :disabled="busy"
            @click="changeSortMode('manual')"
          >
            {{ t('sortManual') }}<Check v-if="sortMode === 'manual'" :size="17" />
          </Button>
          <Button
            variant="outline"
            class="justify-between"
            :aria-pressed="sortMode === 'ascending'"
            :disabled="busy"
            @click="changeSortMode('ascending')"
          >
            {{ t('sortAscending') }}<Check v-if="sortMode === 'ascending'" :size="17" />
          </Button>
          <Button
            variant="outline"
            class="justify-between"
            :aria-pressed="sortMode === 'descending'"
            :disabled="busy"
            @click="changeSortMode('descending')"
          >
            {{ t('sortDescending') }}<Check v-if="sortMode === 'descending'" :size="17" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>

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
            <DialogClose as-child
              ><Button variant="ghost" size="icon-sm" :aria-label="t('close')" :title="t('close')"
                ><X :size="19" /></Button
            ></DialogClose>
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
                @click="openBackupExport"
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
                ><ScanLine :size="17" />{{ t('scanMigrationCodes') }}</Button
              >
            </CardContent>
          </Card>
        </template>

        <form
          v-else-if="transferStep === 'export'"
          class="grid gap-4"
          autocomplete="off"
          novalidate
          @submit.prevent="submitBackupExport"
        >
          <FormField v-slot="{ componentField }" name="password" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('backupPassword') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="password"
                  autocomplete="new-password"
                  maxlength="256"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="confirmation" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('backupPasswordConfirm') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="password"
                  autocomplete="new-password"
                  maxlength="256"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <DialogFooter class="gap-2 sm:gap-2">
            <Button
              variant="outline"
              type="button"
              :disabled="busy"
              @click="returnToTransferHome"
              >{{ t('cancel') }}</Button
            >
            <Button type="submit" :disabled="busy || !accounts.length"
              ><Spinner v-if="busy" />{{ busy ? t('exporting') : t('createBackup') }}</Button
            >
          </DialogFooter>
        </form>

        <form
          v-else-if="transferStep === 'restore'"
          class="grid gap-4"
          autocomplete="off"
          novalidate
          @submit.prevent="submitBackupRestore"
        >
          <FormField v-slot="{ componentField }" name="password" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('backupPassword') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="password"
                  autocomplete="current-password"
                  maxlength="256"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <DialogFooter class="gap-2 sm:gap-2">
            <Button variant="outline" type="button" :disabled="busy" @click="cancelBackupRestore">{{
              t('cancel')
            }}</Button>
            <Button type="submit" :disabled="busy || !backupContents"
              ><Spinner v-if="busy" />{{ busy ? t('restoring') : t('continue') }}</Button
            >
          </DialogFooter>
        </form>

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
              ><Spinner v-if="busy" />{{
                t(previewSource === 'backup' ? 'restoreAccounts' : 'importAccounts')
              }}</Button
            >
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showAccountForm">
      <DialogContent :show-close-button="false" class="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader class="flex-row items-start justify-between gap-4 space-y-0 text-left">
          <div>
            <p
              class="mb-1 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
            >
              {{ t('appName') }}
            </p>
            <DialogTitle>{{ editingId ? t('edit') : t('manualTitle') }}</DialogTitle>
          </div>
          <DialogClose as-child
            ><Button variant="ghost" size="icon-sm" :aria-label="t('close')" :title="t('close')"
              ><X :size="19" /></Button
          ></DialogClose>
        </DialogHeader>
        <DialogDescription>{{ t('manualDescription') }}</DialogDescription>
        <form class="grid gap-4" autocomplete="off" novalidate @submit.prevent="submitForm">
          <FormField v-slot="{ componentField }" name="issuer" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('issuerLabel') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="text"
                  maxlength="80"
                  autocomplete="off"
                  :placeholder="t('issuerPlaceholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('accountLabel') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="text"
                  maxlength="120"
                  autocomplete="off"
                  :placeholder="t('accountPlaceholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="secret" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('secretLabel') }}</FormLabel>
              <div class="relative">
                <FormControl
                  ><Input
                    v-bind="componentField"
                    :type="revealSecret ? 'text' : 'password'"
                    class="pr-12"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    :placeholder="editingId ? t('secretEditHint') : t('secretPlaceholder')"
                /></FormControl>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="absolute top-1/2 right-1 -translate-y-1/2"
                  type="button"
                  :aria-label="t(revealSecret ? 'hideSecret' : 'showSecret')"
                  :title="t(revealSecret ? 'hideSecret' : 'showSecret')"
                  @click="revealSecret = !revealSecret"
                >
                  <EyeOff v-if="revealSecret" :size="18" /><Eye v-else :size="18" />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          </FormField>
          <Collapsible v-model:open="advancedOpen" class="rounded-lg border px-3">
            <CollapsibleTrigger as-child>
              <Button variant="ghost" class="w-full justify-between px-1 text-left">
                {{ t('advancedSettings')
                }}<ChevronDown
                  :size="17"
                  class="transition-transform"
                  :class="advancedOpen ? 'rotate-180' : ''"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent class="grid gap-4 pb-4 pt-2 sm:grid-cols-2">
              <FormField v-slot="{ componentField }" name="algorithm" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('algorithmLabel') }}</FormLabel>
                  <Select v-bind="componentField">
                    <FormControl
                      ><SelectTrigger class="w-full"><SelectValue /></SelectTrigger
                    ></FormControl>
                    <SelectContent>
                      <SelectItem value="SHA1">SHA1</SelectItem>
                      <SelectItem value="SHA256">SHA256</SelectItem>
                      <SelectItem value="SHA512">SHA512</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField v-slot="{ componentField }" name="digits" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('digitsLabel') }}</FormLabel>
                  <Select v-bind="componentField">
                    <FormControl
                      ><SelectTrigger class="w-full"><SelectValue /></SelectTrigger
                    ></FormControl>
                    <SelectContent>
                      <SelectItem value="6">6</SelectItem>
                      <SelectItem value="8">8</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField v-slot="{ componentField }" name="period" :validate-on-blur="false">
                <FormItem class="sm:col-span-2">
                  <FormLabel>{{ t('periodLabel') }}</FormLabel>
                  <div class="relative">
                    <FormControl
                      ><Input
                        v-bind="componentField"
                        type="number"
                        min="1"
                        max="86400"
                        step="1"
                        class="pr-16"
                    /></FormControl>
                    <span
                      class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                      >{{ t('secondsUnit') }}</span
                    >
                  </div>
                  <FormMessage />
                </FormItem>
              </FormField>
            </CollapsibleContent>
          </Collapsible>
          <Alert
            v-if="notice"
            :variant="notice.tone === 'error' ? 'destructive' : 'default'"
            role="status"
            aria-live="polite"
            class="py-2.5"
          >
            <AlertDescription>{{ t(notice.key) }}</AlertDescription>
          </Alert>
          <DialogFooter class="gap-2 sm:gap-2">
            <Button
              variant="outline"
              type="button"
              :disabled="busy"
              @click="showAccountForm = false"
              >{{ t('cancel') }}</Button
            >
            <Button type="submit" :disabled="busy || !vaultReady"
              ><Spinner v-if="busy" />{{ busy ? t('loading') : t('save') }}</Button
            >
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <Avatar class="mb-1 size-10 rounded-xl border bg-secondary"
            ><AvatarFallback><KeyRound :size="20" /></AvatarFallback
          ></Avatar>
          <AlertDialogTitle>{{ t('deleteTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ accountToDelete?.issuer }} · {{ accountToDelete?.name }}<br />{{
              t('deleteDescription')
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert
          v-if="notice?.tone === 'error'"
          variant="destructive"
          role="status"
          aria-live="polite"
          class="py-2.5"
        >
          <AlertDescription>{{ t(notice.key) }}</AlertDescription>
        </Alert>
        <Separator />
        <AlertDialogFooter>
          <AlertDialogCancel as-child
            ><Button variant="outline" type="button" :disabled="busy">{{
              t('cancel')
            }}</Button></AlertDialogCancel
          >
          <Button variant="destructive" type="button" :disabled="busy" @click="deleteAccount"
            ><Spinner v-if="busy" />{{ busy ? t('loading') : t('confirmDelete') }}</Button
          >
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
  <Toaster position="bottom-center" />
</template>
