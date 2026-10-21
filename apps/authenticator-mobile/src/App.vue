<script setup lang="ts">
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { BiometricAuth, BiometryErrorType } from '@aparajita/capacitor-biometric-auth'
import { Fingerprint } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import AuthenticatorView from './views/AuthenticatorView.vue'

const isNative = Capacitor.isNativePlatform()
const isUnlocked = ref(!isNative)
const isAuthenticating = ref(false)
const isSettingUp = ref(false)
const authError = ref('')
const { t } = useI18n()

let appIsActive = true
let appStateListener: PluginListenerHandle | undefined

async function authenticate(): Promise<void> {
  if (!isNative || !appStateListener || !appIsActive || isAuthenticating.value) return

  isAuthenticating.value = true
  authError.value = ''

  try {
    await BiometricAuth.authenticate({
      reason: t('deviceAuthReason'),
      allowDeviceCredential: true,
      iosFallbackTitle: t('devicePasscodeFallback'),
      androidTitle: t('deviceAuthTitle'),
      androidSubtitle: t('deviceAuthDescription'),
    })
    if (appIsActive) isUnlocked.value = true
  } catch (error) {
    isUnlocked.value = false
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
    authError.value =
      code === BiometryErrorType.passcodeNotSet
        ? t('deviceAuthPasscodeRequired')
        : t('deviceAuthFailed')
  } finally {
    isAuthenticating.value = false
  }
}

async function requestUnlock(): Promise<void> {
  if (!isNative || isAuthenticating.value || isSettingUp.value) return

  isSettingUp.value = true
  try {
    appStateListener ??= await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      appIsActive = isActive
      if (!isActive) {
        isUnlocked.value = false
        authError.value = ''
        return
      }
      void authenticate()
    })
  } catch {
    authError.value = t('deviceAuthFailed')
    return
  } finally {
    isSettingUp.value = false
  }
  await authenticate()
}

onMounted(() => {
  void requestUnlock()
})

onBeforeUnmount(() => {
  void appStateListener?.remove()
})
</script>

<template>
  <AuthenticatorView v-if="isUnlocked" />
  <main v-else class="flex min-h-dvh items-center justify-center p-6">
    <Card class="w-full max-w-sm">
      <CardHeader class="items-center text-center">
        <div class="mb-1 flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Fingerprint :size="28" />
        </div>
        <CardTitle>{{ t('deviceAuthTitle') }}</CardTitle>
        <CardDescription>{{ t('deviceAuthDescription') }}</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <p v-if="authError" role="alert" class="m-0 text-center text-sm text-destructive">
          {{ authError }}
        </p>
        <Button class="w-full" :disabled="isAuthenticating || isSettingUp" @click="requestUnlock">
          <Spinner v-if="isAuthenticating || isSettingUp" />
          {{ isAuthenticating || isSettingUp ? t('deviceAuthVerifying') : t('deviceAuthRetry') }}
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
