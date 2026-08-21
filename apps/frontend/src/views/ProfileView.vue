<script setup lang="ts">
import { Copy } from '@lucide/vue'
import { toast } from 'vue-sonner'

import DescriptionActionRow from '@/components/common/DescriptionActionRow.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import SegmentedCodeInput from '@/components/common/SegmentedCodeInput.vue'
import SettingsPageTemplate from '@/components/templates/SettingsPageTemplate.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  beginGithubLink,
  disable2fa,
  enable2fa,
  generate2fa,
  unlinkGithub,
} from '@/features/account/api'
import { copyText } from '@/lib/clipboard'
import { PASSWORD_EXPIRY_DAYS, passwordDaysRemaining } from '@/lib/password'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const isLoading = ref(false)
const disablePassword = ref('')
const showEnableDialog = ref(false)
const showDisableDialog = ref(false)
const qrCodeUrl = ref('')
const secret = ref('')
const enableCode = ref('')
const recoveryCodes = ref<string[]>([])
const showRecoveryCodes = ref(false)
const isLinkingGithub = ref(false)
const isGithubLinked = ref(false)
const showUnlinkGithubDialog = ref(false)
const unlinkGithubPassword = ref('')

const displayName = computed(() => auth.user?.fullName || auth.user?.email || t('profile.no_name'))
const passwordBaseDate = computed(() => auth.user?.passwordChangedAt || auth.user?.createdAt)
const passwordExpiresAt = computed(() =>
  passwordBaseDate.value
    ? new Date(
        new Date(passwordBaseDate.value).getTime() + PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      )
    : null
)
const passwordDaysLeft = computed(() =>
  passwordDaysRemaining(auth.user?.passwordChangedAt, auth.user?.createdAt)
)

function formatDate(value?: string | Date | null) {
  if (!value) {
    return '-'
  }
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function copyEmail() {
  if (!auth.user?.email) {
    return
  }

  try {
    await copyText(auth.user.email)
    toast.success(t('profile.toast.email_copied'))
  } catch {
    toast.error(t('profile.toast.email_copy_failed'))
  }
}

async function startEnable2FA() {
  isLoading.value = true
  try {
    const payload = await generate2fa(auth.token)
    qrCodeUrl.value = payload.qrCode
    secret.value = payload.secret
    enableCode.value = ''
    showEnableDialog.value = true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.toast.gen_secret_failed'))
  } finally {
    isLoading.value = false
  }
}

async function confirmEnable2FA() {
  if (!enableCode.value) {
    toast.error(t('profile.toast.enter_code'))
    return
  }

  isLoading.value = true
  try {
    const payload = await enable2fa(auth.token, secret.value, enableCode.value)
    auth.user = payload.user
    recoveryCodes.value = payload.recoveryCodes
    showEnableDialog.value = false
    showRecoveryCodes.value = true
    toast.success(t('profile.toast.2fa_enabled'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.toast.invalid_code'))
  } finally {
    isLoading.value = false
  }
}

function handleDisableClick() {
  showDisableDialog.value = true
}

async function confirmDisable2FA() {
  if (!disablePassword.value) {
    toast.error(t('profile.toast.enter_password'))
    return
  }

  isLoading.value = true
  try {
    auth.user = await disable2fa(auth.token, disablePassword.value)
    showDisableDialog.value = false
    disablePassword.value = ''
    toast.success(t('profile.toast.2fa_disabled'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.toast.incorrect_password'))
  } finally {
    isLoading.value = false
  }
}

async function linkGithub() {
  isLinkingGithub.value = true
  try {
    window.location.assign(await beginGithubLink(auth.token))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.github_link_failed'))
    isLinkingGithub.value = false
  }
}

function handleUnlinkGithubClick() {
  unlinkGithubPassword.value = ''
  showUnlinkGithubDialog.value = true
}

async function confirmUnlinkGithub() {
  if (!unlinkGithubPassword.value) {
    toast.error(t('profile.toast.enter_password'))
    return
  }

  isLoading.value = true
  try {
    const profile = await unlinkGithub(auth.token, unlinkGithubPassword.value)
    auth.user = profile
    isGithubLinked.value = false
    unlinkGithubPassword.value = ''
    showUnlinkGithubDialog.value = false
    toast.success(t('profile.github_unlinked'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('profile.github_unlink_failed'))
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  const profile = await auth.fetchProfile()
  isGithubLinked.value = Boolean(profile?.githubLinked)
  if (route.query.github_linked === '1') {
    toast.success(t('profile.github_linked'))
    await router.replace({ query: {} })
  }
})
</script>

<template>
  <SettingsPageTemplate :title="t('profile.title')" :description="t('profile.desc')">
    <Card class="rounded-xl">
      <CardHeader>
        <CardTitle>{{ t('profile.basic_info') }}</CardTitle>
        <CardDescription>{{ t('profile.basic_desc') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border bg-muted/20 p-4">
            <dt class="text-sm font-medium text-muted-foreground">{{ t('profile.full_name') }}</dt>
            <dd class="mt-1.5 font-medium break-words">{{ displayName }}</dd>
          </div>
          <div class="rounded-lg border bg-muted/20 p-4">
            <dt class="text-sm font-medium text-muted-foreground">{{ t('profile.email') }}</dt>
            <dd class="mt-1.5 flex min-w-0 items-center justify-between gap-3">
              <span class="truncate font-medium">{{ auth.user?.email || '-' }}</span>
              <Button
                v-if="auth.user?.email"
                variant="ghost"
                size="icon"
                :aria-label="t('profile.copy_email')"
                :title="t('profile.copy_email')"
                @click="copyEmail"
              >
                <Copy class="size-4" />
              </Button>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <Card class="rounded-xl">
      <CardHeader>
        <CardTitle>{{ t('profile.security_title') }}</CardTitle>
        <CardDescription>{{ t('profile.security_desc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-5">
        <DescriptionActionRow
          :title="t('profile.password_title')"
          :description="t('profile.password_hint')"
        >
          <template #action>
            <Button variant="outline" @click="router.push('/change-password')">
              {{ t('profile.change_password') }}
            </Button>
          </template>
        </DescriptionActionRow>

        <DescriptionActionRow
          :title="t('profile.github_title')"
          :description="t('profile.github_hint')"
        >
          <template #action>
            <Button v-if="!isGithubLinked" :disabled="isLinkingGithub" @click="linkGithub">
              {{ isLinkingGithub ? t('profile.github_linking') : t('profile.github_link') }}
            </Button>
            <Button
              v-else
              variant="destructive"
              :disabled="isLoading"
              @click="handleUnlinkGithubClick"
            >
              {{ t('profile.github_unlink') }}
            </Button>
          </template>
        </DescriptionActionRow>

        <div class="rounded-lg border bg-muted/40 p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="font-medium">{{ t('profile.password_expiry_title') }}</div>
              <p class="text-sm text-muted-foreground">{{ t('profile.password_expiry_hint') }}</p>
            </div>
            <div
              :class="
                cn(
                  'text-xl font-semibold',
                  passwordDaysLeft < 14
                    ? `
                  text-destructive
                `
                    : `text-primary`
                )
              "
            >
              {{ t('profile.password_days_left', { days: passwordDaysLeft }) }}
            </div>
          </div>
          <div class="mt-4 text-sm text-muted-foreground">
            {{ t('profile.password_last_changed', { date: formatDate(passwordBaseDate) }) }}<br />
            {{ t('profile.password_expires_at', { date: formatDate(passwordExpiresAt) }) }}
          </div>
        </div>

        <Separator />

        <DescriptionActionRow
          :title="t('profile.two_factor_title')"
          :description="t('profile.two_factor_hint')"
        >
          <template #action>
            <Button
              v-if="!auth.user?.twoFactorEnabled"
              :disabled="isLoading"
              @click="startEnable2FA"
            >
              {{ t('profile.two_factor_enable') }}
            </Button>
            <Button v-else variant="destructive" :disabled="isLoading" @click="handleDisableClick">
              {{ t('profile.disable_2fa') }}
            </Button>
          </template>
        </DescriptionActionRow>
      </CardContent>
    </Card>

    <Dialog v-model:open="showUnlinkGithubDialog">
      <FormDialogContent
        :title="t('profile.github_unlink_title')"
        :description="t('profile.github_unlink_desc')"
        class="sm:max-w-106.25"
      >
        <div class="grid gap-2 p-6 pt-4">
          <Label for="unlink-github-password">{{ t('profile.current_password') }}</Label>
          <Input id="unlink-github-password" v-model="unlinkGithubPassword" type="password" />
        </div>
        <FormDialogFooter class="justify-end">
          <Button variant="outline" @click="showUnlinkGithubDialog = false">
            {{ t('common.cancel') }}
          </Button>
          <Button variant="destructive" :disabled="isLoading" @click="confirmUnlinkGithub">
            {{ t('profile.github_unlink') }}
          </Button>
        </FormDialogFooter>
      </FormDialogContent>
    </Dialog>

    <Dialog v-model:open="showDisableDialog">
      <FormDialogContent
        :title="t('profile.disable_2fa_title')"
        :description="t('profile.two_factor_confirm_desc')"
        class="sm:max-w-106.25"
      >
        <div class="grid gap-2 p-6 pt-4">
          <Label for="disable-password">{{ t('profile.current_password') }}</Label>
          <Input id="disable-password" v-model="disablePassword" type="password" />
        </div>
        <FormDialogFooter class="justify-end">
          <Button variant="outline" @click="showDisableDialog = false">
            {{ t('common.cancel') }}
          </Button>
          <Button variant="destructive" :disabled="isLoading" @click="confirmDisable2FA">
            {{ t('profile.disable_2fa') }}
          </Button>
        </FormDialogFooter>
      </FormDialogContent>
    </Dialog>

    <Dialog v-model:open="showEnableDialog">
      <FormDialogContent
        :title="t('profile.enable_2fa_title')"
        :description="t('profile.dialog_enable_desc')"
        class="sm:max-w-106.25"
      >
        <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="confirmEnable2FA">
          <div
            class="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-6 pt-4 pb-6"
          >
            <div v-if="qrCodeUrl" class="rounded-sm bg-white p-2">
              <img :src="qrCodeUrl" alt="2FA QR Code" class="size-48" />
            </div>
            <div class="flex w-full max-w-xs flex-col items-center gap-2">
              <Label for="enable-code">{{ t('auth.2fa_code') }}</Label>
              <SegmentedCodeInput id="enable-code" v-model="enableCode" />
            </div>
          </div>
          <FormDialogFooter class="shrink-0 justify-end">
            <Button type="button" variant="outline" @click="showEnableDialog = false">
              {{ t('common.cancel') }}
            </Button>
            <Button type="submit" :disabled="isLoading">
              {{ t('profile.verify_enable') }}
            </Button>
          </FormDialogFooter>
        </form>
      </FormDialogContent>
    </Dialog>

    <Dialog v-model:open="showRecoveryCodes">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('profile.recovery_codes') }}</DialogTitle>
          <DialogDescription class="text-destructive">
            {{ t('profile.recovery_desc') }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid grid-cols-2 gap-4 py-4">
          <div
            v-for="code in recoveryCodes"
            :key="code"
            class="rounded-sm bg-muted p-2 text-center font-mono text-sm"
          >
            {{ code }}
          </div>
        </div>
        <DialogFooter>
          <Button @click="showRecoveryCodes = false">{{ t('profile.saved_codes') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SettingsPageTemplate>
</template>
