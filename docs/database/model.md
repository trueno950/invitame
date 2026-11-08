# Database model

The first migration (`20260913000000_initial_catalog`) creates the catalog and template-version foundation. The
second (`20261104030448_add_better_auth_identity`) adds the identity persistence that Better Auth needs
([ADR 0004](../adr/0004-authentication-with-better-auth.md), decision 2). Future invitation, payment, media, guest,
RSVP, and analytics design is documented separately in [`future-model.md`](future-model.md); that document does
not add tables.

| Model | Role |
| --- | --- |
| `User` | Account identity and Better Auth `user` model; carries `status`, the server-side `role`, `emailVerified`, and `twoFactorEnabled` |
| `Session` | Better Auth database session, unique by `token`, owned by a `User`; `secondFactorVerified` records whether it was opened with the second factor |
| `Account` | Better Auth credential or provider link (an administrator password hash lives here), owned by a `User` |
| `Verification` | Better Auth short-lived verification value, such as an email one-time code, looked up by `identifier` |
| `TwoFactor` | Better Auth two-factor plugin record: encrypted TOTP secret and backup codes, at most one per `User` |
| `RateLimit` | Better Auth persistent rate-limit counter, unique by `key` |
| `Category` | Event catalog grouping |
| `Feature` | Extensible catalog capability with a database-enforced unique string `key` |
| `Package` | Sellable catalog metadata, independent of behavior branches |
| `PackageFeature` | Normalized package-to-feature relation |
| `Template` | Mutable template master metadata and category relation |
| `TemplateVersion` | Immutable renderer identity, render, and form-data contract for one template version |

## Invariants

- `Feature.key` is a unique database string, not a PostgreSQL enum. New feature keys can be added as data
  without a code migration.
- `TemplateVersion` is unique by `(templateId, version)`. Its renderer `componentKey` (`component_key` in
  PostgreSQL), `schema`, `configuration`, template reference, version number, and creation timestamp are
  protected against updates by the initial migration trigger.
- A version status can evolve through its stable lifecycle, but its snapshot contract cannot be rewritten.
- Future `Invitation` records must reference `TemplateVersion`, never mutable `Template` fields.

## Identity tables

Current status: the API uses these tables at runtime. Better Auth, mounted at `/api/auth` with its Prisma adapter
(`apps/api/src/auth/auth.registration.ts`), stores sessions in `Session`, administrator password hashes in `Account`,
hashed email sign-in codes in `Verification`, authenticator secrets and backup codes in `TwoFactor`, and rate-limit
counters in `RateLimit`. The project guard reads `User.role` and `User.status` on every request, and the
`user:disable`, `admin:create`, and `admin:reset-second-factor` commands write these tables directly through
Prisma. The database suites (`pnpm --filter @invitame/api test:db`) exercise them on real PostgreSQL; see
[`architecture/overview.md`](../architecture/overview.md) for the behavior.

- Better Auth's `user` model is the existing `User`. Its required `name` field is mapped onto the nullable
  `displayName` column through `user.fields`, so no duplicate name column exists.
- Identifiers stay PostgreSQL UUIDs. Better Auth runs with `advanced.database.generateId: "uuid"`, which leaves id
  creation to Prisma's `@default(uuid())` on PostgreSQL.
- `role` is the `UserRole` enum (`CUSTOMER`, `ADMIN`), defaulting to `CUSTOMER`. The database rejects any other
  value. Better Auth declares it with `input: false`, so a client-supplied role is never stored.
- `Session`, `Account`, and `TwoFactor` reference `User` with `ON DELETE CASCADE`: they have no meaning without
  their user. Disabling an account is a `status` change, not a delete.
- Indexes: unique `Session.token`, `Session.userId`, `Account.userId`, unique `(Account.providerId, Account.accountId)`,
  `Verification.identifier`, unique `TwoFactor.userId`, and unique `RateLimit.key`.
- Every column added to `User` has a default or is nullable, so existing rows stay valid.
- `Session.secondFactorVerified` (`BOOLEAN NOT NULL DEFAULT false`, migration
  `20261108120000_add_session_second_factor_marker`, S52) is true only for a session created by a verified
  second-factor code: a TOTP or backup code at sign-in, or the first TOTP confirmation. The migration is additive
  and deletes nothing, so every session row that existed before it reads false, and the API ends such a session of
  an enrolled administrator on its next use (an administrator who signed in before the migration signs in again).
  Better Auth declares it as a session additional field with `input: false`; the session-create hook sets it from
  the endpoint path alone, and the session-update hook refuses any update that touches this column (and, as before, an
  expiry change outside a customer's session). Deploy order: apply the migration before, or together with, the API
  that reads the column; see the second-factor marker in `docs/architecture/overview.md`.

## JSONB boundary

Prisma `Json` maps only `TemplateVersion.schema` and `TemplateVersion.configuration` to PostgreSQL JSONB. The
schema is a validated form contract and configuration is a validated presentation contract. Renderer identity,
relationships, catalog keys, lifecycle statuses, and fields used for querying remain normalized columns.

## Deliberately absent

There are no invitation, payment, RSVP, guest, analytics, or media tables in the current schema.
