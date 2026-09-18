# Desktop Addendum

Follow the repository-level `AGENTS.md` first. The web UI and AI behavior are
owned by `../assistant-web` and must follow its `AGENTS.md`; do not duplicate
the assistant UI or AI orchestration in this Tauri shell.

This package owns only the Tauri window, Rust commands, native permissions,
desktop integrations, and release packaging. Keep Tauri capabilities minimal,
never put credentials or API secrets in the desktop bundle, and keep the API
and authorization boundary in `apps/backend`.

Required checks for desktop changes are `cargo fmt --check`, `cargo check`,
`cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test`.
Changes that affect the Web client must also run the checks documented by
`apps/assistant-web/AGENTS.md`.
