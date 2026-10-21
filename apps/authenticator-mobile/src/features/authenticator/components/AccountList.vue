<script setup lang="ts">
import {
  ArrowLeftRight,
  Copy,
  Ellipsis,
  KeyRound,
  ListOrdered,
  Plus,
  Search,
  ShieldCheck,
  X,
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { AccountSortMode } from '../services/account-order'
import type { TotpAccount } from '../services/totp'

type Notice = { key: string; tone: 'success' | 'error' | 'info' } | null

const props = defineProps<{
  accounts: TotpAccount[]
  filteredAccounts: TotpAccount[]
  sortMode: AccountSortMode
  codes: Record<string, string>
  notice: Notice
  loading: boolean
  vaultReady: boolean
  busy: boolean
  now: number
}>()

const search = defineModel<string>('search', { required: true })
const emit = defineEmits<{
  openSort: []
  openTransfer: []
  openAdd: []
  edit: [account: TotpAccount]
  move: [account: TotpAccount, direction: -1 | 1]
  delete: [account: TotpAccount]
  copy: [account: TotpAccount]
}>()

const { t, locale } = useI18n()

function remainingSeconds(account: TotpAccount): number {
  return account.period - (Math.floor(props.now / 1000) % account.period)
}

function progressPercent(account: TotpAccount): number {
  return (remainingSeconds(account) / account.period) * 100
}

function formatCode(code: string): string {
  const split = code.length === 6 ? 3 : 4
  return `${code.slice(0, split)} ${code.slice(split)}`
}
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
          v-if="accounts.length"
          variant="outline"
          size="icon-lg"
          :aria-label="t('sortTitle')"
          :title="t('sortTitle')"
          :disabled="!vaultReady || busy"
          @click="emit('openSort')"
        >
          <ListOrdered :size="19" />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          :aria-label="t('transferTitle')"
          :title="t('transferTitle')"
          :disabled="!vaultReady || busy"
          @click="emit('openTransfer')"
        >
          <ArrowLeftRight :size="19" />
        </Button>
        <Button
          variant="default"
          size="icon-lg"
          :aria-label="t('add')"
          :title="t('add')"
          :disabled="!vaultReady || busy"
          @click="emit('openAdd')"
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
          >
            <X :size="16" />
          </InputGroupButton>
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
          <Spinner /><span>{{ t('loading') }}</span>
        </CardContent>
        <CardContent class="space-y-2 pt-0"
          ><Skeleton class="h-8 w-2/3" /><Skeleton class="h-5 w-1/2"
        /></CardContent>
      </Card>
      <Alert v-else-if="!vaultReady" variant="destructive" role="status">
        <KeyRound :size="20" aria-hidden="true" /><AlertDescription>{{
          t('loadFailed')
        }}</AlertDescription>
      </Alert>
      <Card v-else-if="accounts.length === 0">
        <CardContent class="flex flex-col items-center px-6 py-10 text-center">
          <Avatar class="mb-4 size-14 rounded-2xl border bg-secondary"
            ><AvatarFallback><KeyRound :size="26" :stroke-width="1.6" /></AvatarFallback
          ></Avatar>
          <CardTitle class="mb-2">{{ t('emptyTitle') }}</CardTitle>
          <CardDescription class="mb-5 max-w-sm">{{ t('emptyDescription') }}</CardDescription>
          <Button @click="emit('openAdd')"><Plus :size="17" />{{ t('emptyAction') }}</Button>
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
                ><Ellipsis :size="20"
              /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="emit('edit', account)">{{ t('edit') }}</DropdownMenuItem>
              <template v-if="sortMode === 'manual' && !search.trim()">
                <DropdownMenuItem
                  :disabled="busy || index === 0"
                  @select="emit('move', account, -1)"
                  >{{ t('moveUp') }}</DropdownMenuItem
                >
                <DropdownMenuItem
                  :disabled="busy || index === accounts.length - 1"
                  @select="emit('move', account, 1)"
                  >{{ t('moveDown') }}</DropdownMenuItem
                >
              </template>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" @select="emit('delete', account)">{{
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
            @click="emit('copy', account)"
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
      v-if="accounts.length"
      variant="default"
      size="icon-lg"
      class="fixed right-6 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 size-12 rounded-full shadow-lg sm:right-[calc((100vw-620px)/2+1.5rem)]"
      :aria-label="t('add')"
      :title="t('add')"
      :disabled="!vaultReady || busy"
      @click="emit('openAdd')"
    >
      <Plus :size="24" />
    </Button>
  </main>
</template>
