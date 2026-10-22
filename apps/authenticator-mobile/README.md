# Authenticator Mobile

A Capacitor companion app for the project's 2FA accounts. It supports project TOTP setup QR scanning and manual entry, live codes, search, copy, edit/delete, and manual or alphabetical ordering. It can create six-digit-password encrypted offline backups and restore this app's backups by merging accounts.

The H5 app reuses the shared shadcn-vue primitives from `apps/frontend/src/components/ui`, with authenticator-specific theme tokens.

On iOS and Android, account data is stored with `@aparajita/capacitor-secure-storage`; iCloud synchronization is disabled. Offline backup files use PBKDF2-SHA256 and AES-256-GCM. New backups use a six-digit password; restore also accepts passphrases from older backups. Browser preview keeps accounts in memory for the current page only. It does not write TOTP secrets to browser storage.

Native iOS and Android builds require system authentication before showing accounts at launch and whenever the app returns to the foreground. The system uses biometrics when available and allows the device passcode or screen lock as a fallback. The app does not collect or store that credential, and stays locked if authentication fails or the device has no screen lock configured. H5 preview does not provide this native authentication gate and is intended only for UI preview.

```sh
pnpm --dir apps/authenticator-mobile dev
pnpm --dir apps/authenticator-mobile check:totp
pnpm --dir apps/authenticator-mobile build
pnpm --dir apps/authenticator-mobile exec cap sync
pnpm --dir apps/authenticator-mobile exec cap open ios
pnpm --dir apps/authenticator-mobile exec cap open android
```

The native QR scanner requires the installed iOS or Android app.

## Cloud builds

The repository root `codemagic.yaml` defines a manually triggered Codemagic workflow named **Authenticator Mobile (Android + iOS Device)**. It builds an Android debug APK and a development-signed iOS IPA. iOS signing requires a matching Apple Development certificate and provisioning profile in Codemagic; the profile must include the iPhone's registered device identifier and remain valid for installation.
