<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import DescriptionActionRow from '@/components/common/DescriptionActionRow.vue'
import SegmentedCodeInput from '@/components/common/SegmentedCodeInput.vue'
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
import { disable2fa, enable2fa, generate2fa } from '@/lib/account-api'
import { PASSWORD_EXPIRY_DAYS, passwordDaysRemaining } from '@/lib/password'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
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

const displayName = computed(() => auth.user?.fullName || auth.user?.email || 'System Admin')
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

onMounted(async () => {
  if (!auth.user) {
    await auth.fetchProfile()
  }
})
</script>

<template>
  <div class="container mx-auto flex w-full max-w-4xl flex-col gap-8 p-8">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">{{ t('profile.title') }}</h1>
      <p class="text-muted-foreground">{{ t('profile.desc') }}</p>
    </div>

    <Card class="rounded-xl">
      <CardHeader>
        <CardTitle>{{ t('profile.basic_info') }}</CardTitle>
        <CardDescription>{{ t('profile.basic_desc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid max-w-lg gap-4">
          <div class="grid gap-2">
            <Label>{{ t('profile.full_name') }}</Label>
            <Input :model-value="displayName" disabled />
          </div>
          <div class="grid gap-2">
            <Label>{{ t('profile.email') }}</Label>
            <Input :model-value="auth.user?.email" disabled />
          </div>
        </div>
      </CardContent>
    </Card>

    <Card class="rounded-xl">
      <CardHeader>
        <CardTitle>{{ t('profile.security_title') }}</CardTitle>
        <CardDescription>{{ t('profile.security_desc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
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

        <div class="rounded-lg border bg-muted/40 p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="font-medium">{{ t('profile.password_expiry_title') }}</div>
              <p class="text-sm text-muted-foreground">{{ t('profile.password_expiry_hint') }}</p>
            </div>
            <div
              :class="
                cn('text-xl font-bold', passwordDaysLeft < 14 ? 'text-destructive' : 'text-primary')
              "
            >
              {{ t('profile.password_days_left', { days: passwordDaysLeft }) }}
            </div>
          </div>
          <div class="mt-6 text-sm text-muted-foreground">
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

    <Dialog v-model:open="showDisableDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('profile.disable_2fa_title') }}</DialogTitle>
          <DialogDescription>{{ t('profile.two_factor_confirm_desc') }}</DialogDescription>
        </DialogHeader>
        <div class="space-y-2 py-4">
          <Label for="disable-password">{{ t('profile.current_password') }}</Label>
          <Input id="disable-password" v-model="disablePassword" type="password" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showDisableDialog = false">
            {{ t('common.cancel') }}
          </Button>
          <Button variant="destructive" :disabled="isLoading" @click="confirmDisable2FA">
            {{ t('profile.disable_2fa') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showEnableDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('profile.enable_2fa_title') }}</DialogTitle>
          <DialogDescription>{{ t('profile.dialog_enable_desc') }}</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col items-center space-y-4 py-4">
          <div v-if="qrCodeUrl" class="rounded bg-white p-2">
            <img :src="qrCodeUrl" alt="2FA QR Code" class="size-48" />
          </div>
          <div class="flex w-full max-w-xs flex-col items-center space-y-2">
            <Label for="enable-code">{{ t('auth.2fa_code') }}</Label>
            <SegmentedCodeInput id="enable-code" v-model="enableCode" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showEnableDialog = false">
            {{ t('common.cancel') }}
          </Button>
          <Button :disabled="isLoading" @click="confirmEnable2FA">
            {{ t('profile.verify_enable') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showRecoveryCodes">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('profile.recovery_codes') }}</DialogTitle>
          <DialogDescription class="font-semibold text-destructive">
            {{ t('profile.recovery_desc') }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid grid-cols-2 gap-4 py-4">
          <div
            v-for="code in recoveryCodes"
            :key="code"
            class="rounded bg-muted p-2 text-center font-mono text-sm"
          >
            {{ code }}
          </div>
        </div>
        <DialogFooter>
          <Button @click="showRecoveryCodes = false">{{ t('profile.saved_codes') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
