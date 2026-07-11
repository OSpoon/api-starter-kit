# Backend Addendum

Follow the repository-level `AGENTS.md` first. This file adds AdonisJS-specific constraints.

## Request Lifecycle

- Routes declare URL shape, middleware, and controller target. Keep route registration declarative.
- Protected mutations require `middleware.auth()` and the named permission middleware. Apply the narrowest permission per operation.
- Controllers validate input before loading or mutating records, use a transformer/explicit DTO for output, and return domain-appropriate errors.
- Use services for credential generation, encryption, external providers, and behavior shared by multiple controllers.

## Persistence

- Define Lucid relations with explicit pivot tables, timestamps, and delete behavior when a pivot has required columns.
- Do not use a relation `sync`/`attach` path until its pivot schema requirements are represented in the relation configuration.
- Check reference counts before deleting roles, permissions, or other authorization records. Return `409` rather than silently removing active grants.
- Keep generated database schema files generated; do not hand-edit them.

## Authentication And Credentials

- Password generation uses the shared credential service. Password disclosure is one-time and never appears in logs or later read endpoints.
- Password reset, 2FA disablement, API key revocation, account deletion, and other security-sensitive mutations require deliberate server-side checks.
- A current user must not be able to remove the last protection that would lock all administrators out.

## Tests

- Test a successful authorization path and a denied authorization path for every new permission-protected capability.
- Test response DTOs for management endpoints when the frontend depends on nested roles, permissions, counts, or status fields.
