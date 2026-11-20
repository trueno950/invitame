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
no row is rewritten and nothing is deleted. Future
analytics design is documented separately in
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
| `Package` | Sellable catalog metadata, independent of behavior branches |
| `PackageFeature` | Normalized package-to-feature relation |
| `PackagePrice` | Append-only price history of a package: integer `amountMinor` in the smallest currency unit plus an ISO `currency`; the row with no `retiredAt` is the current price |
| `Template` | Mutable template master metadata and category relation |
| `TemplateVersion` | Immutable renderer identity, render, and form-data contract for one template version |
| `Invitation` | Creator-owned invitation pinned to one `TemplateVersion`, one `Package`, and a unique public `slug`; carries its lifecycle `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), the publication marker `publishedAt`, the never-cleared first publication `firstPublishedAt`, the unused-nullable expiry `expiresAt`, JSONB `content`, the archive marker, the IANA `timeZone`, and the RSVP settings `rsvpDeadline` and `rsvpPartyLimit` |
| `RsvpResponse` | One guest's attendance answer to one invitation: the normalized `dedupeKey` (normalized name plus normalized phone) unique per invitation, the nullable `guestId` of a personal-link answer (unique, so one guest has one answer), the display `name`, `attending`, `partySize`, an optional E.164 `phone`, an optional `message`, and timestamps |
| `MediaAsset` | One uploaded photo of one invitation: `kind` (`main-photo` or `gallery`), the unique `storageKey` of its object, `mime` (`image/webp`), `byteSize`, `width`, `height`, the gallery `position`, the optional `alt` text, the `status` (`stored` or `deleted`), and timestamps |
| `Guest` | One person on an invitation's guest list: the invitation reference, `name` (1-80), `seats` (1-10), an optional E.164 `phone`, an optional `note` (up to 200), the unique SHA-256 `tokenHash` of the personal link and when it was issued, the first `checkedInAt`, and timestamps |
| `InvitationFeatureSettings` | Optional one-to-one feature data of one invitation, keyed by the invitation id: the E.164 `whatsappPhone` (or `NULL`), the `https` `playlistUrl` (or `NULL`), the playlist `playlistTitle` and `playlistCoverUrl` the provider's oEmbed answer named (or `NULL`), and timestamps |
| `Payment` | One checkout intent of one invitation: the `packageId` whose price it buys, the `amountMinor` and `currency` snapshot taken at checkout, the `status` (`pending`, `paid`, `failed`, `expired`, `refunded`), the provider adapter key, the provider's own `providerReference` (unique per provider, `NULL` until created), the unique server-generated `idempotencyKey`, `paidAt`, and timestamps |
| `InvitationPlace` | The point one invitation's address field refers to: the invitation reference, the content `field` name (`address`, `ceremonyAddress`), the geocoder `label` the owner chose, the `lat`/`lng` of the point, and `updatedAt`; the pair `(invitationId, field)` is the primary key, so one address field has at most one point |
| `PaymentEvent` | One received provider event: the nullable `paymentId` it was matched to, the `provider` and its unique `providerEventId`, the normalized `type` (`paid`, `failed`, `expired`, `refunded`), `receivedAt`, `processedAt`, the decision `outcome`, and the SHA-256 `payloadSha256` of the raw body |
| `AdminAction` | One append-only audit row of one state-changing support action: the `adminUserId` who acted, the `action` (`INVITATION_UNPUBLISHED`, `ACCOUNT_DISABLED`, `ACCOUNT_REACTIVATED`, `SIGN_IN_CODE_RESENT`), the `reason` (`ABUSE`, `OWNER_REQUEST`, `PAYMENT_ERROR`, `OTHER`), the optional `note` (up to 500 characters, required for `OTHER`), and exactly one target (`targetUserId` or `invitationId`), with `createdAt`. No email address, client address, or provider payload |

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
  `Template` fields. Milestone 4 created, edited, and archived invitations through the API, and Milestone 5 publishes
  and unpublishes them (`POST /invitations/:id/publish` and `/unpublish`), writing `status` and `publishedAt` together.
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
- `Invitation.expiresAt` is a nullable `TIMESTAMPTZ(6)` with no default and no constraint. The column exists and no
  code sets it in Milestone 5 (S8); the expiry rule is decided in a later milestone. Both new columns are nullable,
  so every row that existed before the migration stayed valid, and `publishedAt` has no default so an archived or
  draft row reads `NULL`.
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
- The columns the application may update are `status`, `content`, `publishedAt`, `archivedAt`, `timeZone`,
  `rsvpDeadline`, `rsvpPartyLimit`, and `updatedAt`; publish and unpublish write `publishedAt`, only the RSVP
  settings route writes the two RSVP columns, nothing writes `expiresAt`, and the pinned fields can never change.

## Invitation feature data

Current status: the `Invitation.timeZone` column and the `InvitationFeatureSettings` table exist and the API reads
and writes them (F1, F6, F7; S3, S4, S7). The conditional shape of the feature rules — the zone allow-list, the phone
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
- The feature data belongs to the invitation, not to its template: the template version stays pinned and changing the
  template never touches these rows. A stored phone or link is kept even when the pinned package does not include
  `WHATSAPP` or `MUSIC`; the gate, not the write, decides whether a guest sees those buttons, so an upgrade later does
  not require the value again. The gift registry is different: its text is an ordinary `Invitation.content` field, and
  only the gate (`GIFT_REGISTRY`) decides whether a layout renders it (F7).
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
- `RsvpResponse` carries bounded values only, never free-form JSONB: `name` is 1 to 80 characters
  (`RsvpResponse_name_length`), `partySize` is 0 to 10 (`RsvpResponse_partySize_range`), a declined response names
  no people and an attending one names at least one (`RsvpResponse_partySize_matches_attending`), `phone` is E.164 or
  `NULL` exactly like the WhatsApp contact (`RsvpResponse_phone_format`, `^\+[1-9][0-9]{7,14}$`), and `message` is 1
  to 280 characters or `NULL` (`RsvpResponse_message_length`). The per-invitation party limit is checked by the
  domain, because a CHECK cannot read another table.
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

- One row records one state-changing support action: who acted, what they did, why, and which single target they
  changed. `adminUserId` is the signed-in administrator and never client input; `action` is the
  `AdminActionType` enum (`INVITATION_UNPUBLISHED`, `ACCOUNT_DISABLED`, `ACCOUNT_REACTIVATED`,
  `SIGN_IN_CODE_RESENT`) and `reason` is the `AdminActionReason` enum (`ABUSE`, `OWNER_REQUEST`,
  `PAYMENT_ERROR`, `OTHER`), so no other value is storable. Viewing a payment is not an action and writes no row.
- `note` is `VARCHAR(500)` and nullable. `AdminAction_note_length` states the bound, and
  `AdminAction_note_required_for_other` requires a present, non-blank note while the reason is `OTHER`; every other
  reason may carry one or not. The domain trims the note before it is stored, so a note of spaces is not a note.
- `AdminAction_exactly_one_target` (`num_nonnulls("targetUserId", "invitationId") = 1`) keeps one target per row, and
  `AdminAction_target_matches_action` keeps that target the one the action means: `INVITATION_UNPUBLISHED` names
  `invitationId`, and the three account actions name `targetUserId`. A row with no target, with two, or with the
  other action's target is refused.
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

There is no analytics table in the current schema. The `Invitation` table stores authoring, publication, and RSVP
settings only — status, the publication marker, the not-yet-used expiry, the deadline, and the party limit — while
`RsvpResponse` stores the answers, `Guest` stores the guest list with its personal link digest and check-in state,
`MediaAsset` names an object in the storage adapter, and `Payment`/`PaymentEvent` hold the checkout intent and the
verified provider events. No card data, provider payload, accounting entry, or subscription is stored: those are
Milestone 7 non-goals.
