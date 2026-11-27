# Database model

The first migration (`20260913000000_initial_catalog`) creates the catalog and template-version foundation. The
second (`20261104030448_add_better_auth_identity`) adds the identity persistence that Better Auth needs
([ADR 0004](../adr/0004-authentication-with-better-auth.md), decision 2). Milestone 3 adds two additive catalog
migrations: `20261109120000_add_template_version_publication_rules` and `20261109130000_add_package_prices`.
Milestone 4 adds the additive `20261111214752_add_invitations` migration, which creates the `Invitation` table.
Milestone 5 adds the additive `20261112040547_add_invitation_publication` migration, which appends `PUBLISHED` to
`InvitationStatus`, adds the nullable `publishedAt` and `expiresAt` columns, and adds the publication check; it
rewrites no row and deletes nothing. The invitation-features batch (F1) adds the additive
`20261113164740_add_invitation_features` migration: the `Invitation.timeZone` column and the one-to-one
`InvitationFeatureSettings` table. Its second batch (F6) adds the additive
`20261116170553_add_invitation_feature_playlist_url` migration: one nullable `InvitationFeatureSettings.playlistUrl`
column, so no row is rewritten and no default is needed. Milestone 6 adds the additive
`20261117120000_add_rsvp_responses` migration: the nullable `Invitation.rsvpDeadline` and the
`Invitation.rsvpPartyLimit` (default 4) columns, and the `RsvpResponse` table that holds one guest's attendance
answer. Every column added is nullable or has a default, so no row is rewritten and nothing is deleted. Its second
batch (G2) adds the additive `20261118120000_add_guests` migration: the `Guest` table with its unique token digest
and the nullable `RsvpResponse.guestId` reference. Every object is new or nullable, so no row is rewritten and
nothing is deleted. Milestone 8 adds the additive `20261120120000_add_media_assets` migration: two enum types and
the `MediaAsset` table with its checks, its unique storage key, its one-current-main-photo index, and its gallery
index. Every object is new, so no row is rewritten and nothing is deleted; no binary is stored in PostgreSQL.
Milestone 7 adds the additive `20261121120000_add_payments` migration: the `PaymentStatus` enum type, the `Payment`
table (the checkout intent, the price snapshot, and the verified state), and the `PaymentEvent` table (one received
provider event, its decision, and the digest of its payload — never the payload). Every object is new, so no row is
rewritten and nothing is deleted. The playlist metadata batch adds the additive
`20261122120000_add_invitation_feature_music_metadata` migration: the nullable
`InvitationFeatureSettings.playlistTitle` and `.playlistCoverUrl` columns and the
`InvitationFeatureSettings_playlistCoverUrl_https` check. Both are nullable, so no row is rewritten and nothing is
deleted. The precise-locations batch adds the additive `20261123120000_add_invitation_places` migration: the
`InvitationPlace` table, keyed by `(invitationId, field)`, with the `InvitationPlace_lat_range` and
`InvitationPlace_lng_range` checks. Every object is new, so no row is rewritten and nothing is deleted. The refund
batch (T2) adds the additive `20261124120000_add_invitation_first_published_at` migration: one nullable
`Invitation.firstPublishedAt` column, a one-time backfill from `publishedAt`, and the
`Invitation_firstPublishedAt_when_published` check. It appends a nullable column, so every existing row stays valid;
the backfill of already-published rows rewrites only that new column, and nothing is deleted. The support-action
slice adds the additive `20261127120000_add_admin_actions` migration: two enum types and the `AdminAction` table with
its checks, its three indexes, its three `RESTRICT` references, and its append-only trigger. Every object is new, so
no row is rewritten and nothing is deleted. The analytics slice adds two additive migrations:
`20261128120000_add_invitation_views` creates the `InvitationViewSource` enum and the `InvitationView` table (one counted
opening per invitation, calendar day, and link) with its composite primary key, its day index, its `RESTRICT`
reference, and its non-negative-count check, and `20261128130000_add_analytics_indexes` adds the three funnel indexes
`Payment(createdAt)`, `Payment(paidAt)`, and `Invitation(firstPublishedAt)`. Every object is new, so no row is rewritten
and nothing is deleted. The configuration-panel slice adds three additive migrations:
`20261129120000_add_operational_settings` creates the single-row `OperationalSettings` table with its per-column bound
checks, its two cross-field checks, and the one seeded row (the limits the code used up to that slice, so nothing
changes on deploy); `20261129120050_add_settings_admin_action_type` appends the `SETTINGS_UPDATED` label to the
`AdminActionType` enum (a migration of its own because PostgreSQL cannot use a new enum value in the transaction that
adds it); and `20261129120100_add_settings_admin_action` replaces the two `AdminAction` target checks so that the one
platform-wide action names no target while every other action keeps exactly the target it names. No existing row is
rewritten by any of them and nothing is deleted. The expiration slice adds the additive
`20261130120000_add_package_duration_days` migration: the `Package.durationDays` column, `INTEGER NOT NULL DEFAULT 30`,
with the `Package_durationDays_positive` check. The default keeps every existing package valid, and the migration
backfills the three seeded catalog keys to their known lifetimes (basic 30, premium 90, deluxe 180) before an
administrator can customize them; no row is invalidated and nothing is deleted. The guest-features slice (F1) adds the
additive `20261202120000_add_invitation_itinerary` migration: the nullable `InvitationFeatureSettings.itinerary` JSONB
column, and — in the same file, because the seed never updates an existing package — the `ITINERARY` catalog feature row
and its links to the `basic`, `premium`, and `deluxe` packages, both inserted with `ON CONFLICT DO NOTHING` so a second
run stores nothing. The column is nullable, so no row is rewritten; the catalog rows are new, so no existing package or
feature is changed and nothing is deleted. F2 adds the additive `20261203120000_add_invitation_gift_registry`
migration: the nullable `InvitationFeatureSettings.giftRegistry` JSONB column, and nothing else. It inserts no catalog
row, because `GIFT_REGISTRY` already exists and Deluxe already grants it; no existing row is rewritten, no package link
changes, and nothing is deleted. The legacy `Invitation.content.giftRegistry` text field is left untouched. F3 adds the
additive `20261204120000_add_rsvp_companions` migration: the nullable `RsvpResponse.companions` JSONB column and the
nullable `RsvpResponse.dietaryNotes` column (up to 300 characters). Both RSVP paths — the open form and the guest list's
personal answer — are rows of that one table, so one migration serves both; it inserts no catalog row, because the
existing `RSVP` and `GUEST_LIST` keys gate the feature. Every answer stored before it reads `NULL` in both columns and
renders exactly as it did, so no row is rewritten and nothing is deleted. F4 adds the additive
`20261205120000_add_invitation_lodging` migration: the nullable `InvitationFeatureSettings.lodging` JSONB column, and —
in the same file, because the seed never updates an existing package — the `LODGING` catalog feature row and its links
to the `premium` and `deluxe` packages, both inserted with `ON CONFLICT DO NOTHING` so a second run stores nothing. The
column is nullable, so no row is rewritten; the catalog rows are new, so no existing package or feature is changed and
nothing is deleted. F5 adds the additive `20261206120000_add_guest_table_label` migration: the nullable
`Guest.tableLabel` column (`VARCHAR(12)`) and its `Guest_tableLabel_length` check, and nothing else. It inserts no
catalog row, because the existing `GUEST_LIST` and `QR_PASS` keys gate the feature; a guest stored before it reads
`NULL` and renders exactly as it did, so no row is rewritten and nothing is deleted. F6 adds the additive
`20261207120000_add_whatsapp_reminders` migration: the nullable `InvitationFeatureSettings.reminders` JSONB column, the
new `ReminderDelivery` table with its unique attempt key, and — in the same file, because the seed never updates an
existing package — the `WHATSAPP_REMINDERS` catalog feature row and its link to the `deluxe` package, all inserted with
`ON CONFLICT DO NOTHING` so a second run stores nothing. The column and the table are new, so no row is rewritten, and
nothing is deleted. Future analytics design is documented separately in
[`future-model.md`](future-model.md); that document does not add tables.

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
| `Package` | Sellable catalog metadata, independent of behavior branches: the unique `key`, the display metadata, the `status`, and `durationDays`, the whole days a published invitation of the package stays live |
| `PackageFeature` | Normalized package-to-feature relation |
| `PackagePrice` | Append-only price history of a package: integer `amountMinor` in the smallest currency unit plus an ISO `currency`; the row with no `retiredAt` is the current price |
| `Template` | Mutable template master metadata and category relation |
| `TemplateVersion` | Immutable renderer identity, render, and form-data contract for one template version |
| `Invitation` | Creator-owned invitation pinned to one `TemplateVersion`, one `Package`, and a unique public `slug`; carries its lifecycle `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), the publication marker `publishedAt`, the publication-derived expiry `expiresAt`, the never-cleared first publication `firstPublishedAt`, JSONB `content`, the archive marker, the IANA `timeZone`, and the RSVP settings `rsvpDeadline` and `rsvpPartyLimit` |
| `RsvpResponse` | One guest's attendance answer to one invitation: the normalized `dedupeKey` (normalized name plus normalized phone) unique per invitation, the nullable `guestId` of a personal-link answer (unique, so one guest has one answer), the display `name`, `attending`, `partySize`, the bounded companions `[{ name, child }]` of the party (one per extra person while attending, or `NULL` for an older answer), optional `dietaryNotes` (up to 300 characters), an optional E.164 `phone`, an optional `message`, and timestamps |
| `MediaAsset` | One uploaded photo of one invitation: `kind` (`main-photo` or `gallery`), the unique `storageKey` of its object, `mime` (`image/webp`), `byteSize`, `width`, `height`, the gallery `position`, the optional `alt` text, the `status` (`stored` or `deleted`), and timestamps |
| `Guest` | One person on an invitation's guest list: the invitation reference, `name` (1-80), `seats` (1-10), the optional `tableLabel` the owner assigned (1-12 characters, printed on that guest's access pass), an optional E.164 `phone`, an optional `note` (up to 200), the unique SHA-256 `tokenHash` of the personal link and when it was issued, the first `checkedInAt`, and timestamps |
| `InvitationFeatureSettings` | Optional one-to-one feature data of one invitation, keyed by the invitation id: the E.164 `whatsappPhone` (or `NULL`), the `https` `playlistUrl` (or `NULL`), the playlist `playlistTitle` and `playlistCoverUrl` the provider's oEmbed answer named (or `NULL`), the bounded presentation payloads `itinerary`, `giftRegistry`, and `lodging` (or `NULL`), the WhatsApp reminder switches `reminders` (or `NULL`), and timestamps |
| `ReminderDelivery` | One attempt to deliver one WhatsApp reminder: the invitation and guest references, the `kind` (`PENDING_RSVP_7D`, `PENDING_RSVP_2D`, `EVENT_EVE`), the calendar `dueDate` of the invitation's own zone, the `status` (`pending`, `sent`, `skipped`, `failed`), a stable `reason` (up to 40 characters, `not_configured` while no provider exists), `attemptedAt`, and timestamps. The unique key `(invitationId, guestId, kind, dueDate)` is what makes a second run of the same day send nothing twice. No phone, name, or message body is stored |
| `Payment` | One checkout intent of one invitation: the `packageId` whose price it buys, the `amountMinor` and `currency` snapshot taken at checkout, the `status` (`pending`, `paid`, `failed`, `expired`, `refunded`), the provider adapter key, the provider's own `providerReference` (unique per provider, `NULL` until created), the unique server-generated `idempotencyKey`, `paidAt`, and timestamps |
| `InvitationPlace` | The point one invitation's address field refers to: the invitation reference, the content `field` name (`address`, `ceremonyAddress`), the geocoder `label` the owner chose, the `lat`/`lng` of the point, and `updatedAt`; the pair `(invitationId, field)` is the primary key, so one address field has at most one point |
| `PaymentEvent` | One received provider event: the nullable `paymentId` it was matched to, the `provider` and its unique `providerEventId`, the normalized `type` (`paid`, `failed`, `expired`, `refunded`), `receivedAt`, `processedAt`, the decision `outcome`, and the SHA-256 `payloadSha256` of the raw body |
| `InvitationView` | One counted opening of one invitation's link: the invitation reference, the calendar `day` in `America/Mexico_City`, the `source` (`PUBLIC` or `GUEST`), and the `count` of openings that pair counted; the composite primary key is `(invitationId, day, source)`. No IP address, user agent, referrer, cookie, session, token, or slug |
| `OperationalSettings` | The administrator's configuration panel as one row, whose `id` is the literal `default`: `rsvpDefaultPartyLimit`, `rsvpMaxPartyLimit`, `galleryPhotoLimit`, `storedAssetLimit`, `maxUploadMegabytes`, `placeSearchResultLimit`, `analyticsDefaultWindowDays`, and `updatedAt`. No email, name, secret, or other personal datum |
| `AdminAction` | One append-only audit row of one state-changing action: the `adminUserId` who acted, the `action` (`INVITATION_UNPUBLISHED`, `ACCOUNT_DISABLED`, `ACCOUNT_REACTIVATED`, `SIGN_IN_CODE_RESENT`, `SETTINGS_UPDATED`), the `reason` (`ABUSE`, `OWNER_REQUEST`, `PAYMENT_ERROR`, `OTHER`), the optional `note` (up to 500 characters, required for `OTHER`), and the target the action names — exactly one `targetUserId` or `invitationId` for every action except `SETTINGS_UPDATED`, which names none — with `createdAt`. No email address, client address, or provider payload |

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
- `Package.durationDays` is `INTEGER NOT NULL DEFAULT 30`, checked `> 0` by `Package_durationDays_positive`
  (migration `20261130120000_add_package_duration_days`). It is how many days a published invitation of that package
  stays live, counted from the publication instant (S1). The default is the basic month and is what every package
  stored before the column existed reads, so the migration needs no backfill and rewrites nothing; the seed gives each
  catalog package its own value (`basic` 30, `premium` 90, `deluxe` 180). The API validates every write against the
  domain bounds, 1 to 3650 days, and states the lower one again in the check because a duration of zero would publish
  an invitation that is already expired.
- `PackagePrice`: `amountMinor` is an `INT` checked `>= 0`, `currency` is `CHAR(3)` checked against `^[A-Z]{3}$`, and
  the partial unique index on `(packageId, currency) WHERE retiredAt IS NULL` keeps one current price per currency.
  A trigger refuses updates to `packageId`, `currency`, `amountMinor`, and `createdAt`, and refuses clearing
  `retiredAt`. Changing a price retires the current row and inserts a new one in one transaction. The domain allows
  only `MXN` today. The database does not forbid deleting a price row; no API route deletes one, and deleting a
  `Package` is restricted while rows reference it.
- Current status: the `Invitation` table exists and an invitation references a `TemplateVersion`, never mutable
  `Template` fields. Milestone 4 created, edited, and archived invitations through the API, and Milestone 5 publishes
  and unpublishes them (`POST /invitations/:id/publish` and `/unpublish`), writing `status` and `publishedAt` together.
- `Invitation` is pinned at creation: `ownerId`, `packageId`, and `slug` are protected against updates by the
  `Invitation_pinned_fields_immutable` trigger, so an invitation keeps rendering the version it was created with after
  the template catalog publishes a newer one. The one exception is the draft re-pin (S5, S8.6, section below): a
  `DRAFT` may follow its template to the version that template publishes now. The three references are
  `ON DELETE RESTRICT`, so a referenced `TemplateVersion`, `User`, or `Package` cannot be deleted while an invitation
  uses it. The trigger still applies to a `PUBLISHED` and an `ARCHIVED` row, while `content` stays editable in place.
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
- `Invitation.firstPublishedAt` is a nullable `TIMESTAMPTZ(6)` that the first publication writes and nothing clears,
  unlike `publishedAt`: unpublishing and archiving clear `publishedAt` and keep `firstPublishedAt`, so an invitation
  that returned to `DRAFT` or was archived still says it was once public. That history is what the refund rule
  «Sin reembolso tras publicar» reads (T2, S3). `Invitation_firstPublishedAt_when_published` makes a stored row
  unable to have `publishedAt` without a `firstPublishedAt` (`publishedAt IS NULL OR firstPublishedAt IS NOT NULL`),
  and a `DRAFT` that was published before may carry one. The migration backfilled `firstPublishedAt = publishedAt`
  for the rows published at that moment, the only publication history the schema kept before this column.
- `Invitation.refundRequestedAt` is a nullable `TIMESTAMPTZ(6)` that the refund claim writes before the provider is
  called and nothing else writes, and publishing requires it `NULL`, so a publish that races a refund is refused
  instead of overtaking it (T2, S3).
- `Invitation_archivedAt_matches_status` from `20261111214752` is unchanged and still correct for three statuses:
  `("status" = 'ARCHIVED') = ("archivedAt" IS NOT NULL)` holds for a `DRAFT` (both false), a `PUBLISHED` (both
  false), and an `ARCHIVED` row (both true), so `archivedAt` still marks exactly the archived state.
- `Invitation.expiresAt` is a nullable `TIMESTAMPTZ(6)` with no default and no constraint of its own. The publication
  writes it as the publication instant plus the pinned package's `durationDays` (S1), and unpublishing and archiving
  clear it in the same statement that clears `publishedAt`, so it is set exactly while the invitation is published.
  A row stored before the rule existed reads `NULL` and never expires. Both columns are nullable, so every row that
  existed before the migration stayed valid, and `publishedAt` has no default so an archived or draft row reads
  `NULL`. An elapsed `expiresAt` is not a deletion and not a 404: the public read still answers the invitation, and
  what closes is its RSVP (S2). Nothing extends an expiry (S3); a publication after an unpublish counts its lifetime
  from the new publication instant.
- The public read by slug needs no extra index: `Invitation_slug_key` is already unique, so `WHERE slug = $1` reads at
  most one row through it and the status is filtered on that row. No partial index on published rows is added.
- `Invitation_status_createdAt_idx` on `(status, createdAt)` is the administrator's status view index for its
  **status-filtered** page (M9 T2; S1), added additively by `20261125120000_add_invitation_status_created_at_index`
  with no rewrite, default, or data change.
- `Invitation_createdAt_id_idx` on `(createdAt, id)` is the same view's **unfiltered** page index (M9 T5), added
  additively by `20261126120000_add_invitation_created_at_id_index`. `GET /admin/invitations` reads the whole table
  newest first whenever no status is sent, and `(status, createdAt)` cannot answer that order because its leading
  column is not the sort key; `(createdAt, id)` is the sort's own order, and its second key is also the key-set
  cursor's tie-break. The migration builds it with `CREATE INDEX CONCURRENTLY`, which was verified through
  `prisma migrate deploy` on PostgreSQL 17 (it applies the file outside a transaction block and left a valid index),
  so the build takes no `SHARE` lock on `Invitation`; on a large live table the same statement can be run by hand
  first, which is the safe order if a deployment ever wraps migrations in a transaction.
- Verified on 20 000 seeded rows with `EXPLAIN`: the unfiltered page (`ORDER BY "createdAt" DESC, "id" DESC
  LIMIT 21`) is `Index Scan Backward using "Invitation_createdAt_id_idx"`, and the page with a cursor reads the same
  index backwards. The key-set predicate is the row comparison `("createdAt", "id") < (…, …)`, which PostgreSQL
  answers as an `Index Cond` on that backward scan (21 heap fetches, 0 rows filtered in the sample). The earlier `OR`
  form of the same predicate was a `Filter` that walked every row before the cursor (7 040 rows removed for a
  7 040-row offset).
- The columns the application may update are `status`, `content`, `publishedAt`, `expiresAt`, `archivedAt`,
  `timeZone`, `rsvpDeadline`, `rsvpPartyLimit`, and `updatedAt`; publish writes `publishedAt` and `expiresAt` together,
  unpublish and archive clear both, only the RSVP settings route writes the two RSVP columns, and the pinned fields
  change only through the draft re-pin described below.

## Draft re-pin (S5, S8.6)

Current status: `20261201120000_allow_draft_invitation_repin` replaces the body of the function the existing
`Invitation_pinned_fields_immutable` trigger runs, so one narrow change of `Invitation.templateVersionId` is allowed:
the owner approved moving the invitations that already exist to the version their template publishes now, and the
operator runs `pnpm --filter @invitame/api invitations:repin-drafts` (with `--dry-run` first) to do it. The trigger,
its name, and its message (`Invitation pinned fields are immutable`) are unchanged, and this migration rewrites no row.

- A change of `templateVersionId` is accepted only while all three conditions hold, and refused otherwise with the same
  error every other pinned-field change gets: the stored row is `DRAFT` and the update leaves it `DRAFT`; the old and
  the new version belong to the same `Template`; and the new version is `PUBLISHED` (the version a new draft of that
  template would pin). A move can therefore never be combined with a publication in one statement, and a `PUBLISHED`
  or `ARCHIVED` invitation keeps the version it has forever.
- `ownerId`, `packageId`, and `slug` stay immutable for every row in every status, and `content` stays editable as
  before. The rule reads `TemplateVersion`, never mutable `Template` metadata, and the `ON DELETE RESTRICT` references
  are untouched.
- The operation is API-owned, not a bare SQL edit: `apps/api/src/invitations/domain/invitation-repin.ts` decides which
  invitation moves and to which version (only a draft, only the same template, only a version that is `PUBLISHED`), and
  skips it with a reason when the stored content does not validate against the new schema, so the move never stores
  content the new snapshot would refuse (S8.2 — the new versions only add the `x-omittable`/`x-require-one` extensions
  and the optional `omittedSections` property, so every content a draft already has validates).
  `apps/api/src/invitations/infrastructure/prisma-invitation-repin.repository.ts` performs the move as one `UPDATE`
  whose `WHERE` names the invitation, the `DRAFT` status, and the version that was read, and whose `data` names only
  `templateVersionId`; each move is its own transaction and a second run finds every moved draft already current, so
  nothing moves twice.
- Rollback / recovery of `20261201120000_allow_draft_invitation_repin`: restore the previous function body with
  `CREATE OR REPLACE FUNCTION "prevent_invitation_pinned_field_mutation"()` exactly as
  `20261111214752_add_invitations` declares it (the body is also quoted in the migration's header comment), which
  returns the strict rule byte for byte and needs no data change: the trigger guards updates, so the drafts the script
  already re-pinned keep their new version, and their content stays valid because the new versions only add the
  extension. Restoring the versions of already re-pinned drafts is a deliberate data change — each moved draft is
  named in the operator's report — and it only ever touches drafts: no `PUBLISHED` or `ARCHIVED` invitation moves, so
  nothing public changes. Never edit the applied migration file.

## Invitation feature data

Current status: the `Invitation.timeZone` column, the `InvitationFeatureSettings` table, and the guestbook's own
`GuestbookEntry` table exist and the API reads and writes them (F1, F6, F7; S3, S4, S7). The conditional shape of the feature rules — the zone allow-list, the phone
normalization, the playlist link allow-list, and the gating — lives in
`apps/api/src/invitations/domain/invitation-features.ts`.

- `Invitation.timeZone` is `VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City'`. Every row that existed before the
  migration reads the default, so the migration needs no backfill and rewrites nothing. The allow-list (the eleven
  Mexico zones S4 names) is the API's, exactly as the allowed currencies are; the database checks only that the value
  is zone-shaped, through `Invitation_timeZone_format` (`^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)+$`).
- `InvitationFeatureSettings.invitationId` is both the primary key and the foreign key, so an invitation has at most
  one settings row. The reference is `ON DELETE RESTRICT`, like the invitation's own three references, because an
  invitation is never hard-deleted here — archiving is its only terminal lifecycle write. Deleting an invitation that
  still carries feature settings is refused; recovery and test cleanup remove the settings row first.
- `InvitationFeatureSettings.whatsappPhone` is `VARCHAR(16)` and nullable: `NULL` means no phone stored, and
  `InvitationFeatureSettings_whatsappPhone_format` (`^\+[1-9][0-9]{7,14}$`) accepts only E.164. The domain normalizes
  a Mexican ten-digit number to `+52` and an international `+` number as typed, so a stored value always satisfies
  the check. The phone is never logged.
- `InvitationFeatureSettings.playlistUrl` is `VARCHAR(500)` and nullable: `NULL` means no playlist link stored, and
  `InvitationFeatureSettings_playlistUrl_https` (`"playlistUrl" IS NULL OR starts_with("playlistUrl", 'https://')`)
  accepts only an `https` link. The domain accepts only an allow-listed music host (`open.spotify.com`,
  `music.apple.com`, `music.youtube.com`, `www.youtube.com`, `youtube.com`, `youtu.be`, `www.deezer.com`,
  `deezer.com`, `soundcloud.com`), trims the surrounding spaces, and stores the `URL` parser's normalization. Like the
  phone, the database checks the shape and the domain owns the allow-list.
- `InvitationFeatureSettings.playlistTitle` is `VARCHAR(200)` and nullable, and `.playlistCoverUrl` is `VARCHAR(500)` and
  nullable: `NULL` means no metadata stored, which is what an invitation whose lookup never ran, or failed, reads. The
  title arrives trimmed and bounded by the API domain, and `InvitationFeatureSettings_playlistCoverUrl_https`
  (`"playlistCoverUrl" IS NULL OR starts_with("playlistCoverUrl", 'https://')`) accepts only an `https` cover. The
  image-host allow-list (`i.scdn.co`, `image-cdn-*.spotifycdn.com`, `i.ytimg.com`) is the API's, like the music-host
  allow-list; the database checks only the scheme the column can state. Both columns belong to the link: a changed or
  cleared `playlistUrl` writes its metadata with it, so no stale cover describes a link the invitation no longer has.
- `InvitationFeatureSettings.itinerary` is JSONB and nullable, and holds one bounded, versioned presentation payload
  (F1; L3.1): `{ "version": 1, "items": [{ "time": "HH:MM", "title", "place"?, "address"? }] }`. `items` carries 1 to 15
  moments in the owner's order, `time` is a wall clock from `00:00` to `23:59`, `title` is 1 to 60 trimmed characters,
  and `place` and `address` are at most 160 trimmed characters each, a blank optional value being absent. `NULL` is "no
  itinerary", and so is an empty list, which the API normalizes to `NULL` before writing. It is presentation data only:
  no image, no link, no provider payload, no query-critical field, and no rule that a column could enforce, so the API
  domain (`apps/api/src/invitations/domain/invitation-itinerary.ts`) is the only authority on the shape and a value
  written around it reads as no itinerary instead of reaching a guest. It belongs to the invitation, so changing the
  template version never loses it, and the gate — the pinned package's `ITINERARY` key — decides whether a guest sees it.
- `InvitationFeatureSettings.giftRegistry` is JSONB and nullable, and holds one bounded, versioned presentation payload
  (F2; L4.1): `{ "version": 1, "stores": [{ "name", "reference"?, "url" }], "transfer"?: { "bank", "holder", "clabe" },
  "envelopes": boolean, "note"?: string }`. `stores` carries 0 to 8 stores in the owner's order, `name` is 1 to 40
  trimmed characters, `reference` at most 60, and `url` an `https` link of at most 500 characters; the optional
  `transfer` needs a bank and a holder of 1 to 60 trimmed characters and an eighteen-digit CLABE whose control digit is
  right; `envelopes` is required; `note` is at most 200 trimmed characters, and a blank optional value is absent. `NULL`
  is "no registry", and so is a payload that would show nothing — no store, no transfer, and no envelopes line, a note
  alone included — which the API normalizes to `NULL` before writing. It is presentation data only: no image, no
  provider payload, no query-critical field, and no rule that a column could enforce, so the API domain
  (`apps/api/src/invitations/domain/invitation-gift-registry.ts`) is the only authority on the shape and a value written
  around it reads as no registry instead of reaching a guest. The gate is the existing `GIFT_REGISTRY` key (L4.2).
- `InvitationFeatureSettings.lodging` is JSONB and nullable, and holds one bounded, versioned presentation payload
  (F4; L7.1): `{ "version": 1, "hotels": [{ "name", "distance"?, "price"?, "groupCode"?, "bookingUrl"?, "address"? }],
  "transport"?: string }`. `hotels` carries 0 to 6 hotels in the owner's order, `name` is 1 to 60 trimmed characters,
  `distance` at most 40, `price` at most 60, `groupCode` at most 40, `bookingUrl` an `https` link of at most 500, and
  `address` at most 160; the optional `transport` is at most 400 trimmed characters, and a blank optional value is
  absent. `NULL` is "no lodging", and so is a payload with no hotel and no transport line, which the API normalizes to
  `NULL` before writing. It is presentation data only: no image, no provider payload, no query-critical field, and no
  rule that a column could enforce, so the API domain (`apps/api/src/invitations/domain/invitation-lodging.ts`) is the
  only authority on the shape and a value written around it reads as no lodging instead of reaching a guest. The gate is
  the new `LODGING` key, granted to Premium and Deluxe (L7.2).
- `InvitationFeatureSettings.reminders` is JSONB and nullable, and holds the two WhatsApp reminder switches as one
  versioned payload (F6; L9.1): `{ "version": 1, "pendingRsvp": boolean, "eventEve": boolean }`. `NULL` is "no reminder
  settings", and so is a pair with nothing switched on, which the API normalizes to `NULL` before writing. It is
  presentation data that decides *whether* a reminder is sent and nothing else: no phone, no provider, no credential, and
  no delivery state. The API domain (`apps/api/src/invitations/domain/invitation-reminders.ts`) is the only authority on
  the shape, and the commands that read it (`apps/api/src/reminders/domain/reminder-schedule.ts`) refuse any stored value
  that is not one. The gate is the new `WHATSAPP_REMINDERS` key, granted to Deluxe (L9.2).
- `ReminderDelivery` records one attempt per `(invitationId, guestId, kind, dueDate)` (F6; L9.4). `dueDate` is a `DATE`
  of the invitation's own calendar zone rather than an instant, so two runs on the same day agree whatever hour they
  start at. A run claims the row as `pending` before the message leaves and then records the outcome — `sent`,
  `skipped` with a stable reason (`not_configured` while no provider exists, S6), or `failed` — so a repeated run finds
  the attempt and sends nothing twice, and a run interrupted after the claim leaves one attempt recorded instead of a
  duplicate. The row carries no phone, name, or message body: the guest's own data stays in `Guest`. The invitation
  reference is `ON DELETE RESTRICT`; the guest reference is `ON DELETE CASCADE` (migration
  `20261208120000_cascade_reminder_delivery_guest`, review R3-001), so removing a guest removes its recorded attempts and
  a reminder run never keeps the owner from removing a guest.
- The legacy `Invitation.content.giftRegistry` text field stays for existing invitations (F2; L4.3): the public read
  withholds it — and names it in `hiddenFields` — while the structured registry has a store, a transfer, or the
  envelopes line, so a guest never sees the old text and the new card at the same time. An invitation with only the old
  text keeps rendering it, gated by the same `GIFT_REGISTRY` key, exactly as before.
- The feature data belongs to the invitation, not to its template: the template version stays pinned and changing the
  template never touches these rows. A stored phone or link is kept even when the pinned package does not include
  `WHATSAPP` or `MUSIC`; the gate, not the write, decides whether a guest sees those buttons, so an upgrade later does
  not require the value again. The gift registry keeps both shapes for the same reason: its structured payload is
  feature data gated by `GIFT_REGISTRY` (F2), and an older invitation's text lives in the ordinary
  `Invitation.content.giftRegistry` field, which the same gate decides whether a layout renders (F7) and the public read
  withholds while the structured registry shows.
- Rollback / recovery of `20261113164740_add_invitation_features`: the change is additive, so recovery is either
  redeploying the previous migration set or dropping the two objects by hand —
  `DROP TABLE "InvitationFeatureSettings";` then `ALTER TABLE "Invitation" DROP COLUMN "timeZone";`. Either way only
  feature data is lost; invitations, their content, and their lifecycle state are untouched. Never edit the applied
  migration file.
- Rollback / recovery of `20261116170553_add_invitation_feature_playlist_url`: additive, so recovery is redeploying the
  previous migration set or dropping the column by hand with
  `ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "playlistUrl";`. Only the playlist links are lost; invitations,
  their content, their phone, and their lifecycle state are untouched. Never edit the applied migration file.
- Rollback / recovery of `20261122120000_add_invitation_feature_music_metadata`: additive, so recovery is redeploying
  the previous migration set or dropping both columns by hand with
  `ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "playlistCoverUrl", DROP COLUMN "playlistTitle";`. Only the
  stored titles and covers are lost; the playlist links and everything else stay. Never edit the applied migration
  file.
- Rollback / recovery of `20261202120000_add_invitation_itinerary`: additive, so recovery is redeploying the previous
  migration set, or by hand deleting the three `PackageFeature` links and the `ITINERARY` `Feature` row by key and then
  `ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "itinerary";`. Only the stored itineraries and the catalog key are
  lost; invitations, their content, and every other feature setting stay. Never edit the applied migration file.
- Rollback / recovery of `20261203120000_add_invitation_gift_registry`: additive, so recovery is redeploying the previous
  migration set, or by hand `ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "giftRegistry";`. Only the stored
  registries are lost; invitations, their content (the legacy text included), and every other feature setting stay. It
  changes no catalog row. Never edit the applied migration file.
- Rollback / recovery of `20261205120000_add_invitation_lodging`: additive, so recovery is redeploying the previous
  migration set, or by hand deleting the two `PackageFeature` links and the `LODGING` `Feature` row by key and then
  `ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "lodging";`. Only the stored lodgings and the catalog key are
  lost; invitations, their content, and every other feature setting stay. Never edit the applied migration file.
- Rollback / recovery of `20261207120000_add_whatsapp_reminders`: additive, so recovery is redeploying the previous
  migration set, or by hand `DELETE FROM "ReminderDelivery";`, then deleting the `WHATSAPP_REMINDERS` `PackageFeature`
  links and the `WHATSAPP_REMINDERS` `Feature` row by key, then
  `ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "reminders";`, and finally `DROP TABLE "ReminderDelivery";` with
  its two enum types. Only the stored switches, the attempts, and the catalog key are lost; invitations, their content,
  the guests, and every other feature setting stay. Never edit the applied migration file.

## Guestbook data

Current status: the `GuestbookEntry` table exists and the API reads and writes it (F7; S2.7, L10.1, L10.3, L10.4,
L10.6). The rules — the signature's and the message's bounds, the visible-only projection, and the bound of the wall —
live in `apps/api/src/invitations/domain/invitation-guestbook.ts`.

- `GuestbookEntry` stores one message a guest signed: `invitationId`, `authorName` (`VARCHAR(60)`), `message`
  (`VARCHAR(500)`), `hidden` (`BOOLEAN NOT NULL DEFAULT false`), and `createdAt` (`TIMESTAMPTZ(6)`). Both texts are
  plain text, trimmed and bounded by the API domain, and the two CHECK constraints `GuestbookEntry_authorName_length`
  and `GuestbookEntry_message_length` repeat the bounds for a reader that does not go through the API: 1 to 60 and 1
  to 500 characters, so a stored blank is impossible. The domain also refuses U+0000 — PostgreSQL rejects it in a text
  column, so the write would otherwise fail as a server fault — and every other control character (`Cc`, C1
  included) of a signature, keeping the line feed and the tab of a message; that rule is not repeatable as a constraint without changing the
  columns, so it lives in `apps/api/src/invitations/domain/invitation-guestbook.ts` alone. Nothing else is stored — no IP address, session, token, or guest
  id — because an entry is the guest's public words and the rate limit keeps its own hashed key in `RateLimit`.
- The pages never render a stored value as markup: the guest wall draws each signature and message as React's own text
  node, so a `<script>` a guest typed stays visible characters and a URL in a message is never made clickable (L10.3).
  That is a rule of the renderer, not of a column: the database cannot state it, and the text is kept exactly as the
  guest wrote it (after trimming).
- `GuestbookEntry.invitationId` references `Invitation` with `ON DELETE RESTRICT`, the convention every reference to an
  invitation follows here: an invitation is archived, never hard-deleted, so the reference never keeps the owner from
  an operation they have (L24). There is no reference to `Guest`, so the guestbook can never keep the owner from
  removing a guest either.
- `hidden` is the owner's only moderation (L10.6): `false` publishes the entry at once, `true` takes it off the wall and
  keeps it stored. The owner's write only changes that column, and it is idempotent, so hiding a hidden entry or showing
  a visible one changes nothing. Nothing a guest signed is ever deleted — by the guest or by the owner — so a hidden
  message can always be shown again.
- The wall reads one invitation's entries where `hidden = false`, newest first (`createdAt DESC, id DESC`) and at most
  50 (L10.4), through the index `GuestbookEntry_invitationId_hidden_createdAt_idx`; the owner's moderation read answers
  the newest 500 entries of the invitation (`GUESTBOOK_OWNER_ENTRIES_MAX`) in the same order through the same index, so
  one screen never answers an unbounded list and the two counts it carries describe that page. The public projection
  drops the entry id and the hidden flag, so nothing about the moderation reaches a guest.
- The public submission is one statement: `INSERT … SELECT` from the invitation guarded by `status = 'PUBLISHED'` and
  `expiresAt IS NULL OR expiresAt >= now()`, so a signature that races an unpublish or an expiry is refused by the
  database rather than by an earlier read, and the expiry is judged by the database's clock at the statement instead of
  an instant the use case captured before reading and validating the signature (which a slow request could make stale).
  The route itself refuses an unpublished, archived, not-granted, or expired invitation before the rate limit, and a
  filled honeypot answers success while storing nothing — after the rate limit, so a dropped signature still spends a
  slot.
- The per-address rate limit uses the existing `RateLimit` table under the key
  `guestbook|<invitationId>|<sha256(client address)>` — 10 signatures per hour per address per invitation, the same
  window semantics as the open RSVP form and a prefix of its own, so the two forms never share a budget. The client
  address itself is never stored.
- The capability is the new `GUESTBOOK` key, granted to Premium and Deluxe by the migration (`ON CONFLICT DO NOTHING`)
  and declared in the seed (`apps/api/prisma/catalog-seed.ts`), so the panel may grant or withdraw it without a
  deployment. The key is the wall itself: a granted invitation shows an empty wall — and its form — before the first
  message, and a package without the key answers `features.guestbook: null`.
- Rollback / recovery of `20261209120000_add_guestbook`: additive, so recovery is redeploying the previous migration
  set, or by hand deleting the `GUESTBOOK` `PackageFeature` links and the `GUESTBOOK` `Feature` row by key and then
  `DROP TABLE "GuestbookEntry";`. Only the signed messages and the catalog key are lost; invitations, their content, and
  every other feature setting stay. Never edit the applied migration file.

## Guests' photo album

Current status: the `GuestPhoto` table exists and the API uploads, reads, and moderates it (F8; S2.8, L11.1, L11.3,
L11.4, L11.6). The rules — the three states, the per-invitation cap, the uploader name's bounds, and the retention of a
photo the owner never published — live in `apps/api/src/media/domain/guest-photo.ts`; the bytes go through the existing
media pipeline (`apps/api/src/media/domain/media-asset.ts`, `infrastructure/sharp-image-processor.ts`).

- `GuestPhoto` stores one photo a guest uploaded: `invitationId`, `storageKey` (`VARCHAR(200)`, unique),
  `status` (`GuestPhotoStatus`: `PENDING` | `PUBLISHED` | `HIDDEN`, default `PENDING`), `uploaderName` (`VARCHAR(60)`,
  nullable), `createdAt` and `reviewedAt` (`TIMESTAMPTZ(6)`, the second nullable). The binary never lives in PostgreSQL:
  the row names its object under the same `invitations/<invitationId>/<photoId>.webp` key space as the owner's own
  media, so one storage adapter, one serving route (`GET /media/<id>`), and one cleanup scan serve both.
- The three CHECK constraints repeat the API's rules for a reader that does not go through it:
  `GuestPhoto_storageKey_format` (the object is this API's own key), `GuestPhoto_uploaderName_length` (NULL or 1 to 60
  characters), and `GuestPhoto_reviewedAt_matches_status` (a photo is `PENDING` if and only if `reviewedAt` is NULL), so
  a row written around the API cannot claim a review instant it never had.
- `GuestPhoto.invitationId` references `Invitation` with `ON DELETE RESTRICT`, the convention every invitation reference
  follows here: an invitation is archived, never hard-deleted, so the reference never keeps the owner from an operation
  they have (L24). The album has no reference to `Guest`, `User`, or `MediaAsset`, so it also cannot keep the owner from
  removing a guest.
- `status` is the moderation state: every upload is `PENDING` and invisible to guests; the owner publishing it makes it
  `PUBLISHED`, and hiding a published photo makes it `HIDDEN`, which may be published again. A photo never returns to
  `PENDING`, and the owner's write is the only one that changes the state; nothing is deleted in the request.
- The public read answers the invitation's `PUBLISHED` photos, newest first (`createdAt DESC, id DESC`) and at most 60
  (`GUEST_PHOTO_PUBLIC_MAX`), with the total published count, through `GuestPhoto_invitationId_status_createdAt_idx`. The
  owner's moderation read answers the newest 500 photos of the invitation, every state, with one count per state. The
  public projection carries only the photo's URL and its optional uploader name: no row id, no state, no key.
- The insert is one transaction: it locks the invitation row (`SELECT … FOR UPDATE`), re-states `status = 'PUBLISHED'`
  and `expiresAt IS NULL OR expiresAt >= now()` against the database's own clock, and refuses the invitation that
  already stores `GUEST_PHOTO_MAX_STORED` (300) photos, pending and hidden included. Two concurrent uploads therefore
  cannot both take the last slot, and an upload that races an unpublish or an expiry is refused by the database.
- The per-address limit uses the existing `RateLimit` table under the key
  `guest-album|<invitationId>|<sha256(client address)>` — 30 photos per hour per address per invitation, the same window
  semantics as the open RSVP and the guestbook, with a prefix of its own. The client address itself is never stored.
- The media retention cleanup (`pnpm media:cleanup`) retires the photos the owner never published or took down again
  once they have been in that state for 30 days (`GUEST_PHOTO_RETENTION_DAYS`): it deletes the object and then the row,
  and the objects of the rows that stay are never treated as orphans. A published photo is never retired.
- The capability is the new `GUEST_ALBUM` key, granted to Deluxe by the migration (`ON CONFLICT DO NOTHING`) and
  declared in the seed (`apps/api/prisma/catalog-seed.ts`), so the panel may grant or withdraw it without a deployment.
  A granted invitation shows an empty album — and its upload form — before the first photo, and a package without the
  key answers `features.guestAlbum: null`.
- Rollback / recovery of `20261210120000_add_guest_album`: additive, so recovery is redeploying the previous migration
  set, or by hand deleting the `GUEST_ALBUM` `PackageFeature` links and the `GUEST_ALBUM` `Feature` row by key, then
  `DROP TABLE "GuestPhoto";` and `DROP TYPE "GuestPhotoStatus";`. The album's objects become orphans that the next
  `pnpm media:cleanup` removes once they are older than its grace period. Only the uploaded photos and the catalog key
  are lost; invitations, their content, and every other feature setting stay. Never edit the applied migration file.

## Invitation places

Current status: the `InvitationPlace` table exists, the API writes and clears a point through
`PUT`/`DELETE /invitations/:id/places/:field`, and both the owner read and the public read answer the stored points
(`apps/api/src/invitations/domain/invitation-place.ts`, S2). The web editor and the guest map are a separate,
still-pending slice.

- `InvitationPlace.invitationId` and `.field` are the primary key together, so one address field of one invitation has
  at most one point: choosing another suggestion replaces the previous label and coordinates instead of adding a row.
- `InvitationPlace.field` is `VARCHAR(64)` and names a content property of the pinned `TemplateVersion` schema whose
  name ends with `Address` or is exactly `address`. The API derives the allowed names from that schema; no template
  name, package name, or feature key selects them, and a field outside them is refused with 400.
- `InvitationPlace.label` is `VARCHAR(300)`: the label the geocoder answered when the owner chose the point, trimmed
  and bounded by the API. It is the text written into the content field at that moment, which is what makes the
  staleness rule below possible.
- `InvitationPlace.lat` and `.lng` are `DOUBLE PRECISION NOT NULL`, bounded by `InvitationPlace_lat_range`
  (`"lat" >= -90 AND "lat" <= 90`) and `InvitationPlace_lng_range` (`"lng" >= -180 AND "lng" <= 180`). The domain
  refuses the same ranges with its own message before the write, so a refused request stores nothing.
- The reference is `ON DELETE RESTRICT`, like every other invitation reference, because an invitation is never
  hard-deleted here; test cleanup and any future deletion remove the place rows first.
- The public read answers a stored point only while the pinned package grants `MAP` and the stored `label` still equals
  the current content value of that field. Rewriting the address text therefore silently stops using the old
  coordinates instead of sending a guest to the place the owner no longer means. The owner read answers every stored
  point, so the editor can say whether each location is still confirmed.
- Rollback / recovery of `20261123120000_add_invitation_places`: additive, so recovery is redeploying the previous
  migration set or `DROP TABLE "InvitationPlace";` by hand. Only the stored points are lost; invitations, their
  content, and their address text are untouched. Never edit the applied migration file.

## RSVP data

Current status: the `Invitation.rsvpDeadline` and `Invitation.rsvpPartyLimit` columns and the `RsvpResponse` table
exist and the API reads and writes them (M6 G1; S1, S3, S4). The rules — the name normalization and the dedupe key,
the settings bounds, the response bounds against the invitation's party limit, and the gating mode — live in
`apps/api/src/invitations/domain/invitation-rsvp.ts` and `domain/invitation-features.ts`.

- `Invitation.rsvpDeadline` is a nullable `TIMESTAMPTZ(6)` with no default: `NULL` means RSVP never closes, so every
  row that existed before the migration keeps accepting answers. `Invitation.rsvpPartyLimit` is `INTEGER NOT NULL
  DEFAULT 4`, and `Invitation_rsvpPartyLimit_range` checks `1 <= rsvpPartyLimit <= 10`.
- `RsvpResponse.invitationId` references `Invitation` with `ON DELETE RESTRICT`, like the invitation's own three
  references and its feature settings: an invitation is never hard-deleted here — archiving is its only terminal
  lifecycle write — so deleting an invitation that still carries responses is refused. Recovery and test cleanup
  remove the responses first.
- `RsvpResponse_dedupeKey`: `dedupeKey` is `VARCHAR(200)` and holds the dedupe-normalized name (whitespace collapsed,
  accents stripped, case folded) and the normalized phone, separated by `|`; the widest possible value is 97
  characters. The unique index `RsvpResponse_invitationId_dedupeKey_key` on `(invitationId, dedupeKey)` is what makes
  a retry update that response instead of duplicating it, and what makes two concurrent identical submissions end in
  one row. The displayed `name` keeps the guest's spelling of the latest submission; the key never stores it.
- `RsvpResponse` carries bounded values only: `name` is 1 to 80 characters
  (`RsvpResponse_name_length`), `partySize` is 0 to 10 (`RsvpResponse_partySize_range`), a declined response names
  no people and an attending one names at least one (`RsvpResponse_partySize_matches_attending`), `phone` is E.164 or
  `NULL` exactly like the WhatsApp contact (`RsvpResponse_phone_format`, `^\+[1-9][0-9]{7,14}$`), and `message` is 1
  to 280 characters or `NULL` (`RsvpResponse_message_length`). The per-invitation party limit is checked by the
  domain, because a CHECK cannot read another table.
- `RsvpResponse.companions` is the one bounded JSONB payload of an answer (F3; L6.1): the versioned-free list
  `[{ "name": string, "child": boolean }]`, from 0 to 9 entries, with a name of at most 60 characters (blank allowed,
  so a guest may confirm a count without every name) and a boolean child mark. `partySize` stays the source of the
  count: a stored answer names exactly `partySize - 1` companions while attending and none when it declines, and the
  domain (`domain/invitation-rsvp.ts`) refuses any other length before the write, so no CHECK is added — a CHECK
  cannot state the pairing either. `dietaryNotes` is `VARCHAR(300)` or `NULL`, trimmed by the domain. Both columns are
  additive and nullable: an answer stored before them reads `NULL`, which the read renders as no names, no dietary
  notes and a whole party of adults, so `attendingAdults + attendingChildren = attendingPeople` on every read. The
  companion columns are bounded presentation data only: no image, link, or provider payload.
- The owner's read and both CSV exports carry the new columns (F3; L6.4): the companion names, how many of them are
  children, and the dietary notes of each answer, escaped by the same spreadsheet-safe rules as every other cell, and
  the totals of the page name the adults and the children apart. A refused answer stores nothing, so a refused
  companion list leaves the stored answer and every total unchanged.
- The public submission is one statement: `INSERT … SELECT` from the invitation guarded by `status = 'PUBLISHED'`
  and the deadline, with `ON CONFLICT (invitationId, dedupeKey) DO UPDATE`. A response that races an unpublish or a
  deadline that just passed is refused by the database, not by an earlier read.
- The per-address rate limit uses the existing `RateLimit` table (Better Auth's persistent store) under the key
  `rsvp|<invitationId>|<sha256(client address)>` — 10 submissions per hour per address per invitation. The client
  address itself is never stored, and the prefix cannot collide with Better Auth's `<ip>|<path>` keys. Better Auth's
  pruning reads `lastRequest` as the window start, so an RSVP row survives until its hour has ended.
- No `guestId` exists yet: the guest table arrives with the guest list (M6 G2), which adds a nullable reference then.
- Rollback / recovery of `20261117120000_add_rsvp_responses`: the change is additive, so recovery is redeploying the
  previous migration set or dropping the objects by hand —
  `DROP TABLE "RsvpResponse";` then `ALTER TABLE "Invitation" DROP COLUMN "rsvpPartyLimit";` and
  `ALTER TABLE "Invitation" DROP COLUMN "rsvpDeadline";`. Only RSVP data is lost; invitations, their content, their
  feature data, and their lifecycle state are untouched. Never edit the applied migration file.

## Guest list data

Current status: the `Guest` table and the nullable `RsvpResponse.guestId` reference exist and the API reads and
writes them (M6 G2; S1, S3, S4). The rules — the guest's bounded fields, the personal token's shape, and the totals
of a list — live in `apps/api/src/invitations/domain/invitation-guest.ts`; the token is minted and hashed in
`application/guest-token.ts`, because that needs the platform's crypto module while the domain imports none.

- `Guest.invitationId` references `Invitation` with `ON DELETE RESTRICT`, like every other reference here: an
  invitation is never hard-deleted, so deleting one that still carries guests is refused. Recovery and test cleanup
  remove the guests first. There is no owner column: the owner is reached through the invitation, and every creator
  statement joins it and names `ownerId` and the editable statuses in its own `WHERE`, so ownership and the archived
  refusal are decided in the same write that changes the row (A2, A4).
- The personal token is never stored. `Guest.tokenHash` is `VARCHAR(64)` holding the lower-case SHA-256 hex digest of
  a 128-bit token drawn by `crypto.randomBytes(16)` and encoded as 22 base64url characters, and
  `Guest_tokenHash_key` is its unique index, so a personal link resolves through one index probe and no secret is
  compared in application code. The plain token is answered once, by `POST /invitations/:id/guests` and
  `POST /invitations/:id/guests/:guestId/token`; rotating replaces the digest and the issued-at instant, so the
  previous link stops resolving at that instant. `Guest_tokenHash_format` (`^[0-9a-f]{64}$`) keeps a write around the
  API from storing a plaintext or truncated token.
- `Guest` carries bounded values only: `name` is 1 to 80 characters (`Guest_name_length`), `seats` is 1 to 10
  (`Guest_seats_range`, the same range an RSVP party uses), `phone` is E.164 or `NULL` (`Guest_phone_format`,
  `^\+[1-9][0-9]{7,14}$`), and `note` is 1 to 200 characters or `NULL` (`Guest_note_length`, with the domain storing
  `NULL` for a blank note). The phone is normalized by the same rule the WhatsApp contact and the response use, and
  it is never logged.
- `Guest.tableLabel` is the table the owner assigned for that guest's access pass (F5; L8.1, L8.4), or `NULL` when
  there is none. It is 1 to 12 characters after trimming (`Guest_tableLabel_length`, which also refuses a stored empty
  string, so the domain stores `NULL` instead), it is plain text — a short number like «7» or a short name like
  «Principal», never a color, an image, or a provider payload — and the migration leaves every existing guest at
  `NULL`. The guest create and edit routes accept it as an optional field: an omitted `tableLabel` keeps the stored
  one, so a client written before the column existed never clears it, while `null` or a blank value clears it. The
  owner's read answers it, the guest-list CSV adds it as a spreadsheet-safe «Mesa» column next to the seats, and the
  personal guest read adds it to that guest's block only, where the access pass prints it.
- `checkedInAt` is the first check-in instant or `NULL`. The owner's check-in is one statement that requires the
  owned, non-archived invitation, the guest's own digest, and an attending response, and it keeps the first instant
  through `COALESCE`, so showing the same QR twice is idempotent.
- `RsvpResponse.guestId` is nullable because it arrives after the open form did, so every answer that existed before
  the migration keeps its `(invitationId, dedupeKey)` identity and no row is rewritten. `RsvpResponse_guestId_key`
  is unique, so one guest has at most one answer and a personal submission upserts on it; `ON DELETE RESTRICT` means
  a guest who still has an answer cannot be removed by a bare `DELETE`. The guest's own removal deletes the answer in
  the same statement, which is the documented decision: a response never outlives the person it answers for, and
  nothing is left behind for a guest the owner no longer lists.
- A personal-link answer stores `dedupeKey` as `guest|<guestId>` — unique per invitation without storing the name —
  the guest's `name` as a snapshot, and `phone` as `NULL`, because the guest row owns the phone and duplicating it in
  the answer would only let it go stale. The answer's `partySize` is checked against the guest's `seats` by the
  domain, never against the invitation's open-form limit.
- The answer's `SELECT` repeats `status = 'PUBLISHED'` and the deadline, so a retry is idempotent and a submission
  that races an unpublish, an archive, or an elapsed deadline is refused by the database. The per-guest rate limit
  uses the existing `RateLimit` table under `rsvp|<invitationId>|<sha256(guestId)>`: 10 submissions per hour per
  guest, and a submission with an unknown or revoked token is refused before any counter is touched.
- Rollback / recovery of `20261118120000_add_guests`: the change is additive, so recovery is redeploying the previous
  migration set or dropping the objects by hand —
  `ALTER TABLE "RsvpResponse" DROP CONSTRAINT "RsvpResponse_guestId_fkey", DROP COLUMN "guestId";` then
  `DROP TABLE "Guest";`. Only guest lists and personal-link answers are lost; invitations, their content, their
  feature data, their lifecycle state, and the open form's answers are untouched. Never edit the applied migration
  file.
- Rollback / recovery of `20261206120000_add_guest_table_label`: the change is additive, so recovery is redeploying the
  previous migration set or dropping the column by hand —
  `ALTER TABLE "Guest" DROP COLUMN "tableLabel";`. Only the assigned tables are lost; every guest, their answer,
  their personal token digest, their check-in instant, and every other column are untouched. Never edit the applied
  migration file.

## Invitation media

Current status: the `MediaAsset` table exists and the API reads and writes it (M8 S1, S3, S4). The bytes live in the
storage adapter, never in PostgreSQL and never on an ephemeral filesystem in production; the table is the database
truth about an object that exists, its bounds, its lifecycle, and its owner through the invitation. The upload rules
and the storage key format live in `apps/api/src/media/domain/media-asset.ts`; the order of the side effects belongs
to the use cases in `apps/api/src/media/application/media.use-cases.ts`; the SQL is
`apps/api/src/media/infrastructure/prisma-media.repository.ts`. The environment, the serving headers, and the
cleanup command are documented in [`../development/media-storage.md`](../development/media-storage.md).

- `MediaAsset.invitationId` references `Invitation` with `ON DELETE RESTRICT`, like every other reference here: an
  invitation is never hard-deleted, so deleting one that still carries media is refused. There is no owner column:
  every creator statement joins the invitation and names `ownerId` and the editable statuses in its own `WHERE`, so
  ownership and the archived refusal are decided in the same statement that reads or writes the row (A2, A4).
- `kind` is the enum `MediaAssetKind` with the stored labels `main-photo` and `gallery`; `status` is the enum
  `MediaAssetStatus` with `stored` and `deleted`. Label names are contract data: no code branches on a catalog or
  package name, and the stored labels match the REST contract.
- `storageKey` is `VARCHAR(200)`, unique, and always `invitations/<invitationId>/<assetId>.webp` with lower-case
  UUIDs. `MediaAsset_storageKey_format` refuses any other shape, so a stored value can never name another prefix,
  another extension, or a traversing path; the local adapter additionally resolves every key inside its root and
  refuses one that escapes it. The key embeds ids the API generated, never a user-supplied filename.
- `mime` is `image/webp` (`MediaAsset_mime_webp`): every stored object is the API's own re-encoded WebP, so no client
  MIME and no original format is ever database truth. `byteSize` is checked `0 < byteSize <= 10485760`
  (`MediaAsset_byteSize_range`), and `width` and `height` are checked `0 < side <= 2000`
  (`MediaAsset_dimensions_range`), the output bound of S4.
- `position` orders the gallery: `MediaAsset_position_matches_kind` requires a non-negative position exactly for
  `gallery` and none for `main-photo`. The adapter assigns the next position inside the transaction that writes a
  row, and a reorder rewrites `0..n-1` in one transaction; there is no unique index on `position`, because a reorder
  swaps values and the order is the ordered set, not a slot identity.
- `alt` is `VARCHAR(120)` and nullable; `MediaAsset_alt_length` bounds it. The domain trims it and stores `NULL` for
  a blank value.
- `MediaAsset_one_stored_main_photo` is a partial unique index on `("invitationId")` where
  `"kind" = 'main-photo' AND "status" = 'stored'`: one current main photo per invitation is database truth (S4).
  Replacing it marks the previous row `deleted` in the same transaction, so the index can never be violated by a
  legal write, and two concurrent replacements serialize on the invitation row.
- `MediaAsset_invitationId_kind_status_position_idx` serves the gallery order and the owner list. The two limits of
  S4 — at most 12 stored gallery photos and at most 40 stored assets per invitation — are enforced by the adapter
  inside the transaction that inserts the row, serialized on the invitation with `SELECT ... FOR UPDATE`, so two
  simultaneous uploads cannot both take the last slot.
- Retention: nothing deletes an invitation (archiving is terminal, A2), so an archived invitation's media stays
  readable and is kept until a later retention decision. A removed asset is marked `deleted` and its object is
  deleted after the row; a failed object delete leaves the `deleted` row for `pnpm media:cleanup`, which removes the
  objects of `deleted` rows, the objects under `invitations/` that no row names, and then the rows whose object is
  gone. The command is idempotent and supports `--dry-run`. No row is deleted automatically by any other path.
- The orphan scan has a **one-hour grace period** (`MEDIA_ORPHAN_GRACE_MS` in
  `apps/api/src/media/domain/media-asset.ts`). An upload writes its object before it inserts the row, so an object
  that no row names yet may be an upload in flight; the scan deletes an unmatched object only when its
  last-modified time — the file's mtime locally, the provider's `LastModified` on S3 — is older than the grace
  period, and treats an object it cannot date as recent. The run reports such objects as `skippedRecentObjects`
  instead of `orphanObjects`. The objects of rows already marked `deleted` are deleted without waiting, because the
  row itself records that the object is abandoned. The grace period is documented in
  [`../development/media-storage.md`](../development/media-storage.md).
- Retry and recovery order (S4): an upload processes the image, writes the object, and only then inserts the row; if
  the insert fails the object is deleted best effort and the failure is logged by event name only. A deletion marks
  the row first and deletes the object second, so the database never loses track of an object that still exists.
- Rollback / recovery of `20261120120000_add_media_assets`: the change is additive, so recovery is redeploying the
  previous migration set or dropping the objects by hand — `DROP TABLE "MediaAsset";` then
  `DROP TYPE "MediaAssetStatus"; DROP TYPE "MediaAssetKind";`. Only media rows are lost; invitations, content,
  feature data, guests, and RSVP answers are untouched. Stored objects then become orphans, and the deployment must
  empty the bucket or directory with its own tooling. Never edit the applied migration file.

## Checkout and payments

Current status: the `Payment` and `PaymentEvent` tables exist and the API reads and writes them (M7 S1, S3, S4). The
state machine, the entitlement rule, and the event decision live in `apps/api/src/payments/domain/`; the side effects
belong to the use cases in `apps/api/src/payments/application/`; the SQL is
`apps/api/src/payments/infrastructure/prisma-payment.repository.ts`. The modes, the environment, and the signature
scheme are documented in [`../development/payments.md`](../development/payments.md).

- `Payment.invitationId` references `Invitation` and `Payment.packageId` references `Package`, both with
  `ON DELETE RESTRICT`: an invitation is never hard-deleted and a payment outlives a retired catalog price, so
  deleting either while a payment names it is refused. There is no owner column: the adapter reaches the owner
  through the invitation and names `ownerId` in its own `WHERE`, so a foreign invitation answers exactly like an
  unknown one (A4).
- `Payment.amountMinor` and `Payment.currency` are the snapshot of the package's price at checkout, not a live read of
  the catalog: `Payment_amountMinor_non_negative` checks `>= 0` and `Payment_currency_format` checks `^[A-Z]{3}$`,
  the same rules `PackagePrice` carries. Retiring the catalog price and publishing another leaves every stored
  payment's amount and currency untouched (S1 exit criterion).
- `Payment.status` is the `PaymentStatus` enum with the stored labels `pending`, `paid`, `failed`, `expired`, and
  `refunded`. The domain state machine allows only `pending -> paid | failed | expired` and `paid -> refunded`; every
  other pair is ignored and recorded, so an out-of-order or replayed event can never move a payment backwards
  (S1, S4). The transition statement is guarded by the status it was decided from, so two concurrent deliveries
  cannot both apply theirs.
- `Payment_paidAt_matches_status` keeps `paidAt` set exactly while the payment is `paid` or `refunded`: it is the
  API's own receipt instant of the verified `paid` event, never a provider-supplied time in a money-relevant column.
  A refund keeps it, because the payment was paid.
- `Payment_idempotencyKey_key` is unique: the key is generated by the server for each checkout intent and passed to
  the provider, so a retried request asks for the same session. `Payment_one_pending_key` is a partial unique index on
  `("invitationId")` where `"status" = 'pending'`: at most one pending payment per invitation, which is what makes
  two simultaneous checkouts converge on one row instead of two. `Payment_provider_providerReference_key` keeps one
  provider reference per provider and leaves `NULL`s unconstrained, so a payment keeps no reference until its
  adapter created one. `Payment_invitationId_status_idx` serves the gate and the owner read.
- `PaymentEvent.paymentId` is nullable because a signed event about a provider reference this API does not know is
  recorded and ignored rather than dropped. The reference is `ON DELETE RESTRICT`: a payment with recorded events
  cannot be removed while they exist. `PaymentEvent_provider_providerEventId_key` is unique, so a retried or
  duplicated delivery inserts nothing (`ON CONFLICT DO NOTHING`) and is answered as a no-op (S4).
- `PaymentEvent.outcome` is one of `applied`, `ignored_transition`, `ignored_unknown_payment`, `refused_amount`, and
  `refused_currency` (`PaymentEvent_outcome_allowed`), the domain's own vocabulary: every event that reached the
  intake is recorded with its decision, whether it changed a payment or not. `PaymentEvent.type` is one of the four
  normalized types (`PaymentEvent_type_allowed`); no provider vocabulary reaches the column.
- The raw provider payload is never stored. `payloadSha256` is the lower-case SHA-256 hex digest of the raw body
  (`PaymentEvent_payloadSha256_format`, `^[0-9a-f]{64}$`), which is what a replay investigation needs without keeping
  a payer's name, e-mail address, or card metadata in the database.
- The event row and the transition are one transaction: the intake inserts the event, applies the guarded
  transition, and writes the decision, so a failure leaves nothing half-recorded and a retry is safe (S4).
- Rollback / recovery of `20261121120000_add_payments`: the change is additive, so recovery is redeploying the
  previous migration set or dropping the objects by hand — `DROP TABLE "PaymentEvent";` then `DROP TABLE "Payment";`
  then `DROP TYPE "PaymentStatus";`. Only payment intents and the provider events they recorded are lost; invitations,
  their content, feature data, guests, RSVP answers, and media rows are untouched. Paid invitations lose the verified
  state publication was granted from, so a rollback must also restore `PAYMENTS_MODE=free` or stop publishing.
  Never edit the applied migration file.

## Support-action audit

Current status: the `AdminAction` table exists and `apps/api/src/admin` owns it (M9 T6; S4, S6, L9). The additive
`20261127120000_add_admin_actions` migration creates both enum types, the table, the checks, the indexes, the
references, and the trigger; the row is written by `AdminActionRecorder.record(tx, entry)`, nothing else writes the
table, and the administrator routes that call it arrive in later tasks.

- One row records one state-changing action: who acted, what they did, why, and which target they changed.
  `adminUserId` is the signed-in administrator and never client input; `action` is the `AdminActionType` enum
  (`INVITATION_UNPUBLISHED`, `ACCOUNT_DISABLED`, `ACCOUNT_REACTIVATED`, `SIGN_IN_CODE_RESENT`, `SETTINGS_UPDATED`)
  and `reason` is the `AdminActionReason` enum (`ABUSE`, `OWNER_REQUEST`, `PAYMENT_ERROR`, `OTHER`), so no other value
  is storable. Viewing a payment is not an action and writes no row.
- `note` is `VARCHAR(500)` and nullable. `AdminAction_note_length` states the bound, and
  `AdminAction_note_required_for_other` requires a present, non-blank note while the reason is `OTHER`; every other
  reason may carry one or not. The domain trims the note before it is stored, so a note of spaces is not a note.
- `AdminAction_exactly_one_target` (`num_nonnulls("targetUserId", "invitationId") = 1`) keeps one target per row, and
  `AdminAction_target_matches_action` keeps that target the one the action means: `INVITATION_UNPUBLISHED` names
  `invitationId`, and the three account actions name `targetUserId`. A row with no target, with two, or with the
  other action's target is refused. `20261129120100_add_settings_admin_action` relaxes both checks for exactly one
  value: `SETTINGS_UPDATED` changes platform-wide configuration, so it names no target at all, and a
  `SETTINGS_UPDATED` row that names one is refused. Every other action keeps the rule above, and a target-less row of
  any other type is still refused by `AdminAction_exactly_one_target`.
- All three references are `ON DELETE RESTRICT`. An actor's history outlives an attempt to remove the account that
  wrote it, and an audited target cannot be removed while the row that names it exists. No production path deletes a
  `User` or an `Invitation` today (disabling and archiving are their terminal writes), so the new references refuse
  nothing that already runs; a database suite's cleanup must delete any such fixture only while no audit row names
  it.
- The audit is append-only: the `AdminAction_append_only` trigger, on `BEFORE UPDATE OR DELETE`, raises on every row,
  so a stored row is final and no later statement can rewrite why an administrator acted or remove the record that
  they did. It follows the `Invitation_pinned_fields_immutable` pattern: refuse the write, never filter it. The table
  therefore grows and is never corrected in place; a mistake is answered with a new row, not an edit.
- `AdminActionRecorder.record(tx, entry)` takes the caller's own Prisma transaction client, so the module that owns
  the change writes its change and the audit row in one transaction (L9 «Misma transacción»): a refused change leaves
  no audit row and a refused audit entry leaves no change. The entry is validated by the domain before any statement
  runs, and the checks above stay the guards behind it.
- Indexes: `(createdAt, id)` for the audit read newest first and its key-set pages, `(targetUserId)` and
  `(invitationId)` for one target's history.
- Rollback / recovery of `20261127120000_add_admin_actions`: additive, so recovery is redeploying the previous
  migration set or dropping the objects by hand — `DROP TABLE "AdminAction";` then `DROP TYPE "AdminActionReason";`
  and `DROP TYPE "AdminActionType";`, plus `DROP FUNCTION "prevent_admin_action_mutation"();` after the table. Only
  audit history is lost; accounts, invitations, payments, and media are untouched. Never edit the applied migration
  file.

## Operational settings

Current status: the single-row `OperationalSettings` table exists and `apps/api/src/settings` owns it (M9 T13; S5, S8,
L15). `20261129120000_add_operational_settings` creates the table, its checks, and the one seeded row.

- One row, and only one: `OperationalSettings_single_row` pins `id` to the literal `default`, so a read needs no
  ordering or limit and a save is one `UPDATE` of one row. The row carries the administrator's configuration panel
  as seven integers and `updatedAt`; it has no email, name, secret, or personal column, and deploy-only configuration
  (payments, abuse limits, refunds, retention, credentials) never becomes a column here.
- Each column states its own bound in a CHECK — `rsvpDefaultPartyLimit` 1..10, `rsvpMaxPartyLimit` 1..10,
  `galleryPhotoLimit` 1..24, `storedAssetLimit` 1..80, `maxUploadMegabytes` 1..15, `placeSearchResultLimit` 1..10,
  and `analyticsDefaultWindowDays` 7..90 — and two cross-field checks state what a single bound cannot:
  `OperationalSettings_rsvp_default_within_max` keeps `rsvpDefaultPartyLimit` at or below `rsvpMaxPartyLimit`, and
  `OperationalSettings_stored_assets_above_gallery` keeps `storedAssetLimit` at least one above `galleryPhotoLimit`,
  so a full gallery can never leave the main photo no slot. The domain (`domain/operational-settings.ts`) states the
  same bounds and the same two rules, so a value it accepts is a value the row can store.
- The migration seeds the row with the limits the code used before this slice — 4, 10, 12, 40, 10, 5, 30 — so the
  deploy changes no behavior (L15). A save that stores the values already present writes nothing, neither the row nor
  an audit row.
- Every consumer reads the row through `OPERATIONAL_SETTINGS_READER.current()` at the moment it checks a limit: the
  invitations module for the RSVP default and maximum party limit, the place-search result limit, and the analytics
  default window; the media module for the upload size, the gallery cap, and the stored-asset cap. There is no cache
  in this slice, so a save takes effect on the next check, and a lowered limit only stops what is added afterwards:
  nothing stored is deleted, hidden, or rewritten. A new draft starts at the seeded or saved default party limit, an
  invitation whose stored party limit exceeds a lowered maximum keeps it while the next larger response is refused,
  and a gallery above a lowered cap keeps its photos and refuses the next one. The fixed product bounds — the 90-day
  analytics maximum and the 90-day retention — are not settings and stay in the domain.
- Every save is audited. `PUT /admin/settings` writes the row and one `AdminAction` row in one transaction, through
  the admin module's `AdminActionRecorder`: action `SETTINGS_UPDATED`, reason `OTHER`, no target, and a note of the
  form `field: old → new; …` followed by the administrator's optional note (at most 500 characters in total, which is
  the column's width). A save that changes nothing writes no audit row, and an audit entry the domain refuses rolls
  the update back with it.
- Rollback / recovery of `20261129120000_add_operational_settings`: additive, so recovery is redeploying the previous
  migration set or `DROP TABLE "OperationalSettings";`. Only the panel's saved values are lost, and every consumer
  falls back to the values the code had before the panel (its documented initial values). Rollback of
  `20261129120100_add_settings_admin_action` restores the two previous target checks, so no `SETTINGS_UPDATED` row may
  be written until the migration is applied again; `20261129120050_add_settings_admin_action_type` cannot be undone in
  place (PostgreSQL cannot remove an enum label), so a rollback of the panel leaves the unused label stored. Never
  edit an applied migration file.

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

Prisma `Json` maps `TemplateVersion.schema`, `TemplateVersion.configuration`, `Invitation.content`,
`InvitationFeatureSettings.itinerary`, `InvitationFeatureSettings.giftRegistry`, and
`InvitationFeatureSettings.lodging` to PostgreSQL JSONB. The template
schema is a validated form contract and configuration is a validated presentation contract; an invitation's content is
the bounded form data validated against its pinned version; the itinerary is a versioned, bounded presentation payload
(1 to 15 moments of four short texts); the gift registry is a versioned, bounded presentation payload (0 to 8 stores, an
optional transfer of three short texts, a flag, and a note); the lodging is a versioned, bounded presentation payload
(0 to 6 hotels of a name and five optional short texts, one of them an `https` booking link, plus one transport note). Renderer identity, relationships,
catalog keys, lifecycle statuses, and fields used for querying remain normalized columns.

## Analytics data

Current status: the `InvitationView` table exists and `apps/api/src/invitations` owns it (M9 T11; S2, S3, S7, L12). It
is the only analytics table: the purchase funnel and the RSVP totals are computed on read from columns the existing rows
already carry, so there is no second writer that could drift from the truth and no stored aggregate to correct.

- One row is one counted pair: an invitation, one calendar day in `America/Mexico_City`, and one of the two links a
  guest can open (`PUBLIC` for the plain public page, `GUEST` for a personal guest link). `count` is how many openings
  that pair counted, so a day of one link is one row that grows, not one row per opening.
- `InvitationView_pkey` is `(invitationId, day, source)` and is the upsert's conflict target: one opening is
  `INSERT … ON CONFLICT ("invitationId", "day", "source") DO UPDATE SET "count" = "count" + 1`, so a retry and two
  concurrent requests both increment instead of duplicating. `InvitationView_count_non_negative` keeps the counter at
  zero or above, because the API only ever increments it.
- No visitor column exists: no IP address, user agent, referrer, cookie, session, token, or slug. A count cannot be
  traced back to a person, which is what lets it be kept at all (S2, S7).
- `InvitationView.invitationId` references `Invitation` with `ON DELETE RESTRICT`, like every other invitation
  reference, so a counted invitation cannot be removed while its counts exist; a database suite deletes its view rows
  before its invitation fixtures.
- `InvitationView_day_idx` serves both reads and the retention delete: the analytics reads scan one window of days and
  the command deletes `day < cutoff`, which the primary key — leading with the invitation — cannot serve.
- Retention: rows whose day is older than ninety days are deleted by `pnpm analytics:retention` (S3), idempotently and
  with a `--dry-run` that counts without deleting. The cutoff is the last kept day, so a row of exactly ninety days
  stays. See [`../development/analytics-retention.md`](../development/analytics-retention.md).
- The funnel needs no table. Drafts created are `Invitation.createdAt`, checkouts started `Payment.createdAt`,
  approved payments `Payment.paidAt` where the status is `paid`, and first publications
  `Invitation.firstPublishedAt`, each aggregated per day in `America/Mexico_City`. Migration
  `20261128130000_add_analytics_indexes` adds `Payment(createdAt)`, `Payment(paidAt)`, and
  `Invitation(firstPublishedAt)` so each read is a range scan. The migration builds them without `CONCURRENTLY`: Prisma
  sends a migration file as one simple query, so a file with several statements runs inside an implicit transaction and
  PostgreSQL refuses a concurrent build there (the single-statement `20261126120000_add_invitation_created_at_id_index`
  is the one shape that can run concurrently). The build is therefore atomic and briefly takes a `SHARE` lock on
  `Payment` and `Invitation`; when either table grows, an index can be rebuilt concurrently from its own
  single-statement migration.
- The RSVP totals of one invitation are a bounded aggregate over `RsvpResponse`: the sum of the attending party sizes,
  the number of declining responses, and the number of rows — the same semantics the owner read's `rsvpTotalsOf`
  applies, answered from SQL instead of from the response list.
- Rollback / recovery of `20261128120000_add_invitation_views`: additive, so recovery is redeploying the previous
  migration set or dropping the objects by hand — `DROP TABLE "InvitationView";` then
  `DROP TYPE "InvitationViewSource";`. Only the counted openings are lost; invitations, content, guests, RSVP answers,
  payments, and media are untouched. Rollback of `20261128130000_add_analytics_indexes` drops
  `"Payment_createdAt_idx"`, `"Payment_paidAt_idx"`, and `"Invitation_firstPublishedAt_idx"`, which costs the funnel its
  range scans and nothing else. Never edit an applied migration file.

## Deliberately absent

There is no stored aggregate, event stream, or per-visitor analytics table. The `Invitation` table stores authoring,
publication, and RSVP settings only — status, the publication marker, the not-yet-used expiry, the deadline, and the
party limit — while `RsvpResponse` stores the answers, `Guest` stores the guest list with its personal link digest and
check-in state, `MediaAsset` names an object in the storage adapter, `Payment`/`PaymentEvent` hold the checkout intent
and the verified provider events, and `InvitationView` holds the counted openings of one link per day. No card data,
provider payload, accounting entry, or subscription is stored: those are Milestone 7 non-goals.
