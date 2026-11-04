# Database model

The first migration (`20260913000000_initial_catalog`) creates the catalog and template-version foundation. The
second (`20261104030448_add_better_auth_identity`) adds the identity persistence that Better Auth needs
([ADR 0004](../adr/0004-authentication-with-better-auth.md), decision 2). Future invitation, payment, media, guest,
RSVP, and analytics design is documented separately in [`future-model.md`](future-model.md); that document does
not add tables.

| Model | Role |
| --- | --- |
| `User` | Account identity and Better Auth `user` model; carries `status`, the server-side `role`, `emailVerified`, and `twoFactorEnabled` |
| `Session` | Better Auth database session, unique by `token`, owned by a `User` |
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

Current status: the identity tables exist in the schema, but no runtime wiring uses them yet. The API does not mount
Better Auth on this database, and there is no sign-in, session, or role enforcement until the Milestone 2 tasks that
configure them land. Only the database integration test (`pnpm --filter @invitame/api test:db`) exercises them.

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

## JSONB boundary

Prisma `Json` maps only `TemplateVersion.schema` and `TemplateVersion.configuration` to PostgreSQL JSONB. The
schema is a validated form contract and configuration is a validated presentation contract. Renderer identity,
relationships, catalog keys, lifecycle statuses, and fields used for querying remain normalized columns.

## Deliberately absent

There are no invitation, payment, RSVP, guest, analytics, or media tables in the current schema.
