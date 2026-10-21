# Authenticator Mobile

A Capacitor companion app for the project's 2FA accounts. It supports TOTP QR scanning and manual entry, live codes, search, copy, edit/delete, manual and alphabetical ordering, and advanced algorithm, digit, and period settings. It can create password-encrypted offline backups, restore by merging accounts, and import Google Authenticator migration QR codes from camera scans or selected images.

The H5 app reuses the shared shadcn-vue primitives from `apps/frontend/src/components/ui`, with authenticator-specific theme tokens.

On iOS and Android, account data is stored with `@aparajita/capacitor-secure-storage`; iCloud synchronization is disabled. Offline backup files use PBKDF2-SHA256 and AES-256-GCM and require the export passphrase to restore. Browser preview keeps accounts in memory for the current page only. It does not write TOTP secrets to browser storage.

```sh
pnpm --dir apps/authenticator-mobile dev
pnpm --dir apps/authenticator-mobile check:totp
pnpm --dir apps/authenticator-mobile build
pnpm --dir apps/authenticator-mobile exec cap sync
pnpm --dir apps/authenticator-mobile exec cap open ios
pnpm --dir apps/authenticator-mobile exec cap open android
```

The native QR scanner requires the installed iOS or Android app. GitHub Actions builds an Android debug APK and an iOS Simulator app; the iOS simulator artifact is not a device-installable IPA.
