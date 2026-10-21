import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import App from './App.vue'
import './style.css'

const messages = {
  'zh-CN': {
    title: '身份验证器',
    eyebrow: 'PROJECT AUTHENTICATOR',
    subtitle: '为项目配套的 2FA 客户端',
    introTitle: 'Capacitor 原生能力验证',
    intro: '扫描项目的设置二维码，并检查 iOS 与 Android 的设备能力。',
    native: '原生运行',
    preview: '网页预览',
    scanTitle: '扫描 2FA 二维码',
    scanDescription: '识别 TOTP 设置二维码，不显示或保存二维码内容。',
    scanAction: '开始扫描',
    scanCancel: '取消扫描',
    biometricTitle: '生物识别',
    biometricDescription: '检查设备支持情况，并调用系统认证弹窗。',
    biometricAction: '验证设备',
    storageTitle: '安全存储',
    storageDescription: '临时写入并读取随机值，完成后立即删除。',
    storageAction: '检查存储',
    ready: '选择一项能力开始验证。',
    scanInstructions: '将项目的 2FA 二维码放入取景框',
    scanSuccess: '已识别 TOTP 格式二维码。',
    scanUnsupported: '二维码格式不受支持。',
    scanFailed: '扫描未完成，请检查相机权限后重试。',
    biometricUnavailable: '此设备暂未提供可用的生物识别或设备凭据。',
    biometricReason: '验证设备身份以继续',
    biometricSuccess: '系统认证弹窗验证成功。',
    biometricFailed: '设备认证未完成。',
    storageSuccess: '安全存储读写和清理均已完成。',
    storageFailed: '安全存储检查未通过。',
    nativeOnly: '请在 iOS 或 Android 原生应用中运行此检查。',
    working: '正在检查…',
  },
  en: {
    title: 'Authenticator',
    eyebrow: 'PROJECT AUTHENTICATOR',
    subtitle: 'The companion 2FA client for this project',
    introTitle: 'Capacitor capability check',
    intro: 'Scan a project setup QR code and check device capabilities on iOS and Android.',
    native: 'Native app',
    preview: 'Web preview',
    scanTitle: 'Scan a 2FA QR code',
    scanDescription: 'Recognize TOTP setup QR codes without displaying or saving their contents.',
    scanAction: 'Start scan',
    scanCancel: 'Cancel scan',
    biometricTitle: 'Biometrics',
    biometricDescription: 'Check device support and open the system authentication prompt.',
    biometricAction: 'Authenticate',
    storageTitle: 'Secure storage',
    storageDescription: 'Write and read a temporary random value, then remove it.',
    storageAction: 'Check storage',
    ready: 'Choose a capability to check.',
    scanInstructions: 'Place the project 2FA QR code in the frame',
    scanSuccess: 'Recognized a TOTP setup QR code.',
    scanUnsupported: 'This QR code format is not supported.',
    scanFailed: 'Scan did not complete. Check camera access and try again.',
    biometricUnavailable: 'No usable biometric or device credential is available.',
    biometricReason: 'Authenticate to continue',
    biometricSuccess: 'System authentication succeeded.',
    biometricFailed: 'Device authentication did not complete.',
    storageSuccess: 'Secure storage read, write, and cleanup succeeded.',
    storageFailed: 'Secure storage check failed.',
    nativeOnly: 'Run this check in the native iOS or Android app.',
    working: 'Checking…',
  },
} as const

const locale: 'en' | 'zh-CN' = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh-CN'
document.documentElement.lang = locale
document.title = messages[locale].title

createApp(App)
  .use(createI18n({ legacy: false, locale, fallbackLocale: 'en', messages }))
  .mount('#app')
