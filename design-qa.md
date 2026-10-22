# Login page visual QA

**Reference:** QRun branded login page, including the shared `CardPageShell` layout from commit `1e18c96` (`feat(auth): add branded login experience`, 2026-10-22).

**Desktop layout:** Keeps the 1024 px maximum width and 5:3 columns. The branded panel minimum height is now 480 px (down from 560 px), and the form panel has 24 px vertical padding to reduce the top and bottom whitespace.

**Mobile:** Previewed at 390 × 844 CSS px. The brand panel stacks above the form and content fits without horizontal overflow.

**Desktop client default:** The Tauri login is constrained to `max-w-md` (448 px) and keeps the compact single-column brand panel at any window width. The ordinary web login retains the 1024 px layout.

**UI details:** Uses `assistant-logo.svg`, the repository's primary and neutral tokens, a centered 20 px login title, and 15 px input prompts and buttons. Email and password prompts are inside the inputs and retain `aria-label`; the duplicate default login instruction is removed.

**Interaction scope:** The login form was not submitted and no credentials were entered.

**Verification:** Frontend typecheck, lint, and production builds for frontend, assistant-web, and assistant-extension passed. The login selectors are present in emitted extension CSS. The desktop screenshot was not recaptured after reducing the spacing. Builds may show the existing VueUse pure-annotation and chunk-size warnings. The extension build also reports an existing development session sharing its output directory.
