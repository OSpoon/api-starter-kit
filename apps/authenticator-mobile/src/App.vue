<script setup lang="ts">
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isNative = Capacitor.isNativePlatform()
const activeCheck = ref('')
const statusKey = ref('ready')
const statusTone = ref('')

function setStatus(key: string, tone = ''): void {
  statusKey.value = key
  statusTone.value = tone
}

async function scanSetupCode(): Promise<void> {
  activeCheck.value = 'scan'
  try {
    const { ScanResult } = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: t('scanInstructions'),
      cancelButtonAccessibilityLabel: t('scanCancel'),
    })
    if (ScanResult.startsWith('otpauth://totp/')) setStatus('scanSuccess', 'success')
    else setStatus('scanUnsupported', 'error')
  } catch {
    setStatus('scanFailed', 'error')
  } finally {
    activeCheck.value = ''
  }
}

async function checkBiometrics(): Promise<void> {
  if (!isNative) {
    setStatus('nativeOnly', 'error')
    return
  }

  activeCheck.value = 'biometric'
  try {
    const availability = await BiometricAuth.checkBiometry()
    if (!availability.isAvailable && !availability.deviceIsSecure) {
      setStatus('biometricUnavailable')
      return
    }

    await BiometricAuth.authenticate({ reason: t('biometricReason'), allowDeviceCredential: true })
    setStatus('biometricSuccess', 'success')
  } catch {
    setStatus('biometricFailed', 'error')
  } finally {
    activeCheck.value = ''
  }
}

async function checkSecureStorage(): Promise<void> {
  if (!isNative) {
    setStatus('nativeOnly', 'error')
    return
  }

  activeCheck.value = 'storage'
  const key = `authenticator-spike-${crypto.randomUUID()}`
  const value = crypto.randomUUID()
  let matched = false
  let removed = false

  try {
    await SecureStorage.set(key, value)
    matched = (await SecureStorage.get(key)) === value
  } catch {
    setStatus('storageFailed', 'error')
  } finally {
    try {
      removed = await SecureStorage.remove(key)
    } catch {
      removed = false
    }
    activeCheck.value = ''
  }

  if (matched && removed) setStatus('storageSuccess', 'success')
  else setStatus('storageFailed', 'error')
}
</script>

<template>
  <main class="screen">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3 19 6v5c0 4.8-2.9 8.3-7 10-4.1-1.7-7-5.2-7-10V6l7-3Z" />
            <path d="M9.5 12.2 11.2 14l3.6-4" />
          </svg>
        </div>
        <div>
          <p class="eyebrow">{{ t('eyebrow') }}</p>
          <h1>{{ t('title') }}</h1>
        </div>
      </div>
      <span class="platform-badge">
        <span class="platform-dot" />
        {{ isNative ? t('native') : t('preview') }}
      </span>
    </header>

    <section class="intro-panel">
      <div class="intro-icon" aria-hidden="true">2FA</div>
      <div>
        <p class="intro-kicker">{{ t('subtitle') }}</p>
        <h2>{{ t('introTitle') }}</h2>
        <p class="intro-copy">{{ t('intro') }}</p>
      </div>
      <span class="glow glow-one" />
      <span class="glow glow-two" />
    </section>

    <section class="checks" :aria-label="t('introTitle')">
      <article class="check-card">
        <div class="check-index">01</div>
        <div class="check-content">
          <h3>{{ t('scanTitle') }}</h3>
          <p>{{ t('scanDescription') }}</p>
        </div>
        <button class="action-button" :disabled="Boolean(activeCheck)" @click="scanSetupCode">
          {{ activeCheck === 'scan' ? t('working') : t('scanAction') }}
        </button>
      </article>

      <article class="check-card">
        <div class="check-index">02</div>
        <div class="check-content">
          <h3>{{ t('biometricTitle') }}</h3>
          <p>{{ t('biometricDescription') }}</p>
        </div>
        <button class="action-button" :disabled="Boolean(activeCheck)" @click="checkBiometrics">
          {{ activeCheck === 'biometric' ? t('working') : t('biometricAction') }}
        </button>
      </article>

      <article class="check-card">
        <div class="check-index">03</div>
        <div class="check-content">
          <h3>{{ t('storageTitle') }}</h3>
          <p>{{ t('storageDescription') }}</p>
        </div>
        <button class="action-button" :disabled="Boolean(activeCheck)" @click="checkSecureStorage">
          {{ activeCheck === 'storage' ? t('working') : t('storageAction') }}
        </button>
      </article>
    </section>

    <p class="status" :class="statusTone" role="status" aria-live="polite">
      <span class="status-mark" aria-hidden="true">{{ statusTone === 'success' ? '✓' : '·' }}</span>
      {{ t(statusKey) }}
    </p>
  </main>
</template>
