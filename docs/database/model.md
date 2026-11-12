# Database model

The first migration (`20260913000000_initial_catalog`) creates the catalog and template-version foundation. The
second (`20261104030448_add_better_auth_identity`) adds the identity persistence that Better Auth needs
([ADR 0004](../adr/0004-authentication-with-better-auth.md), decision 2). Milestone 3 adds two additive catalog
migrations: `20261109120000_add_template_version_publication_rules` and `20261109130000_add_package_prices`.
Milestone 4 adds the additive `20261111214752_add_invitations` migration, which creates the `Invitation` table.
Milestone 5 adds the additive `20261112040547_add_invitation_publication` migration, which appends `PUBLISHED` to
`InvitationStatus`, adds the nullable `publishedAt` and `expiresAt` columns, and adds the publication check; it
rewrites no row and deletes nothing. Future payment, media, guest, RSVP, and analytics design is documented
separately in [`future-model.md`](future-model.md); that document does not add tables.

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
| `PackagePrice` | Append-only price history of a package: integer `amountMinor` in the smallest currency unit plus an ISO `currency`; the row with no `retiredAt` is the current price |
| `Template` | Mutable template master metadata and category relation |
| `TemplateVersion` | Immutable renderer identity, render, and form-data contract for one template version |
| `Invitation` | Creator-owned invitation pinned to one `TemplateVersion`, one `Package`, and a unique public `slug`; carries its lifecycle `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), the publication marker `publishedAt`, the unused-nullable expiry `expiresAt`, JSONB `content`, and the archive marker |

## Invariants

- `Feature.key` is a unique database string, not a PostgreSQL enum. New feature keys can be added as data
  without a code migration.
- `TemplateVersion` is unique by `(templateId, version)`. Its renderer `componentKey` (`component_key` in
  PostgreSQL), `schema`, `configuration`, template reference, version number, and creation timestamp are
  protected against updates by the initial migration trigger.
- A version status can evolve through its stable lifecycle, but its snapshot contract cannot be rewritten.
- Version lifecycle: the only legal status changes are `DRAFT → PUBLISHED` and `PUBLISHED → RETIRED`, enforced by
  the `TemplateVersion_status_transition` trigger. The partial unique index `TemplateVersion_templateId_published_key`
  allows at most one `PUBLISHED` version per template. The API creates a version as `DRAFT` with `version = max + 1`,
  and publishing retires the previous `PUBLISHED` version in the same transaction. A `RETIRED` version stays
  readable, so an existing invitation keeps its pinned version.
- The API lets a `Template` be `PUBLISHED` only while it has a `PUBLISHED` version; this rule lives in the API, not
  in a database constraint.
- `PackagePrice`: `amountMinor` is an `INT` checked `>= 0`, `currency` is `CHAR(3)` checked against `^[A-Z]{3}$`, and
  the partial unique index on `(packageId, currency) WHERE retiredAt IS NULL` keeps one current price per currency.
  A trigger refuses updates to `packageId`, `currency`, `amountMinor`, and `createdAt`, and refuses clearing
  `retiredAt`. Changing a price retires the current row and inserts a new one in one transaction. The domain allows
  only `MXN` today. The database does not forbid deleting a price row; no API route deletes one, and deleting a
  `Package` is restricted while rows reference it.
- Current status: the `Invitation` table exists and an invitation references a `TemplateVersion`, never mutable
  `Template` fields. Milestone 4 created, edited, and archived invitations through the API; the publish and unpublish
  use cases are the following Milestone 5 tasks, so today the database accepts the publication state and no API route
  writes it yet.
- `Invitation` is pinned at creation: `ownerId`, `templateVersionId`, `packageId`, and `slug` are protected against
  updates by the `Invitation_pinned_fields_immutable` trigger, so an invitation keeps rendering its pinned version
  after the template catalog publishes a newer one. The three references are `ON DELETE RESTRICT`, so a referenced
  `TemplateVersion`, `User`, or `Package` cannot be deleted while an invitation uses it. The trigger is unchanged by
  the Milestone 5 migration and applies to a `PUBLISHED` row too, while `content` stays editable in place.
- `Invitation.slug` is unique through the `Invitation_slug_key` index, so uniqueness is PostgreSQL's, not a preflight
  query. `Invitation_slug_format` requires `^[a-z0-9]+(-[a-z0-9]+)*$`, and `Invitation_slug_length` requires three to
  sixty characters (`VARCHAR(60)` caps the column as well).
- `Invitation.content` is JSONB checked to be a JSON object by `Invitation_content_object`. Ownership, the pinned
  version, the package, the slug, the status, and the archive marker stay normalized columns (S10).
- Invitation statuses are `DRAFT`, `PUBLISHED`, and `ARCHIVED` (A2). Milestone 4 wrote `DRAFT` and `ARCHIVED`;
  `20261112040547_add_invitation_publication` appends `PUBLISHED`, so PostgreSQL's physical enum order is `DRAFT`,
  `ARCHIVED`, `PUBLISHED`. No query compares invitation statuses ordinally, so that order carries no meaning.
- `Invitation_publishedAt_matches_status` makes `publishedAt` non-null exactly when the status is `PUBLISHED`: setting
  it is publishing, and unpublishing back to `DRAFT` or archiving clears it (S7, A2). The check compares
  `status::text` rather than an enum literal because a value appended to the enum in the same transaction cannot be
  used in that transaction; invitation status labels are never renamed, so the comparison stays exact.
- `Invitation_archivedAt_matches_status` from `20261111214752` is unchanged and still correct for three statuses:
  `("status" = 'ARCHIVED') = ("archivedAt" IS NOT NULL)` holds for a `DRAFT` (both false), a `PUBLISHED` (both
  false), and an `ARCHIVED` row (both true), so `archivedAt` still marks exactly the archived state.
- `Invitation.expiresAt` is a nullable `TIMESTAMPTZ(6)` with no default and no constraint. The column exists and no
  code sets it in Milestone 5 (S8); the expiry rule is decided in a later milestone. Both new columns are nullable,
  so every row that existed before the migration stayed valid, and `publishedAt` has no default so an archived or
  draft row reads `NULL`.
- The public read by slug needs no extra index: `Invitation_slug_key` is already unique, so `WHERE slug = $1` reads at
  most one row through it and the status is filtered on that row. No partial index on published rows is added.
- The columns the application may update are `status`, `content`, `publishedAt`, `archivedAt`, and `updatedAt`;
  today no route writes `publishedAt` yet, nothing writes `expiresAt`, and the pinned fields can never change.

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

Prisma `Json` maps `TemplateVersion.schema`, `TemplateVersion.configuration`, and `Invitation.content` to PostgreSQL
JSONB. The template schema is a validated form contract and configuration is a validated presentation contract; an
invitation's content is the bounded form data validated against its pinned version. Renderer identity, relationships,
catalog keys, lifecycle statuses, and fields used for querying remain normalized columns.

## Deliberately absent

There are no payment, RSVP, guest, analytics, or media tables in the current schema. The `Invitation` table stores
authoring and publication state only — status, the publication marker, and the not-yet-used expiry. Publication
through the API, guests, and payments are later milestones.
