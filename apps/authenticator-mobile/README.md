## Authenticator Mobile

The native app shell was generated with the official Capacitor Create App CLI and adapted to the workspace's Vue 3 and Vite stack.

```sh
pnpm --dir apps/authenticator-mobile dev
pnpm --dir apps/authenticator-mobile run cap:sync
pnpm --dir apps/authenticator-mobile exec cap open ios
pnpm --dir apps/authenticator-mobile exec cap open android
```

The prototype checks QR recognition, native biometric prompts, and secure storage. QR contents are never displayed or retained.

GitHub Actions builds an Android debug APK and an unsigned iOS Simulator app when mobile app files or the workspace lockfile change. Both are available as workflow artifacts; iOS device and store builds need signing credentials.
