# Milestone 9 — Admin operations and useful analytics

Status: owner decisions recorded (L2); the first slice is the operational status view. Each later slice starts with
its own design entry in the Log. Source of scope: `ROADMAP.md` Milestone 9.

## Specs

- S1 — First slice, operational status: «Vistas de admin para buscar una invitación y ver su estado, pago y fotos, con
  filtros y sin datos personales innecesarios.» Admin-only, read-only, bounded and paginated. Owner decisions (L3,
  L4): owner data «Solo el correo»; invitation content «No»; search «Slug»; filters «Slug + filtro de estado»; the
  index «Sí, agrégalo».
- S2 — Analytics, later slice: «Vistas por invitación» («Conteo diario de aperturas del enlace público, sin IP ni datos
  del visitante»), «Embudo de compra» («Borradores creados, checkouts iniciados, pagos aprobados y publicaciones, como
  totales diarios»), and «Respuestas RSVP» («Totales de confirmaciones por invitación»).
- S3 — Analytics retention: «90 días» («Suficiente para ver tendencias de una temporada; luego se borran o se
  agregan.»).
- S4 — Support actions, later slice, each authorized on the API and recorded with who and why: «Despublicar una
  invitación» («Por abuso o a petición del dueño; queda registrado quién y por qué»), «Ver el detalle de un pago»
  («Estado, eventos recibidos de Mercado Pago y su historial, sin datos de la tarjeta»), «Desactivar una cuenta»
  («Bloquear el acceso de un usuario»), and «Reenviar el enlace de acceso» («Volver a mandar el código de inicio de
  sesión a un usuario»).
- S6 — Support action decisions (L8, L9): every state-changing support action writes one append-only `AdminAction`
  row in the same transaction as the change («Misma transacción (recomendado)»); the reason is a closed set plus an
  optional note of at most 500 characters, required when the reason is «Otro»; an account can be disabled and
  reactivated («Sí, reactivar (recomendado)»); disabling keeps the owner's invitations published; resending the code
  uses the existing limits; viewing a payment is not audited («No (recomendado)»).
- S5 — The configuration panel (owner-followups L2) is a later slice of this milestone.

## Design (S1)

- **API, owned by the invitations module** (it owns `Invitation`). Payments, media, and the owner's email arrive through
  narrow ports the invitations module declares and the payments, media, and users modules implement — the
  `INVITATION_GALLERY_READER` precedent; no module queries another module's tables.
  - `GET /admin/invitations?slug=<prefix>&status=DRAFT|PUBLISHED|ARCHIVED&limit=<1..50>&cursor=<opaque>` → 200
    `{ items: AdminInvitationSummary[], nextCursor: string | null }`, newest first by `(createdAt, id)`; key-set cursor
    (opaque base64url of `createdAt` + `id`); `slug` is a case-insensitive prefix of at most 60 characters; default limit
    20; any other or malformed query answers 400.
  - `GET /admin/invitations/:invitationId` → 200 `AdminInvitationDetail`, or 404 `INVITATION_NOT_FOUND`.
  - `AdminInvitationSummary` = `{ invitationId, slug, status, ownerEmail, createdAt, publishedAt, firstPublishedAt,
    archivedAt, refundRequestedAt, latestPayment: { status, amountMinor, currency, paidAt } | null, media: { mainPhoto:
    boolean, galleryCount: number } }`. `AdminInvitationDetail` adds `packageId`, `templateVersionId`, and `payments:
    { paymentId, status, amountMinor, currency, createdAt, paidAt }[]` (newest first, at most 20). Never `content`, the
    owner's display name, guests, RSVP answers, or a provider payload.
  - `@AdminOnly()` on the controller (401/403 before validation). Additive migration: index
    `Invitation(status, createdAt)`.
- **Web**: `/admin/invitaciones` («Operación → Invitaciones»): a GET form with «Slug» and «Estado», a table (slug, estado,
  correo del dueño, pago, fotos, creada), «Siguiente página» via the cursor, and `/admin/invitaciones/<id>` with the
  lifecycle dates, payments, and media counts plus the public link when published. Server-first; the query values are
  validated before they reach the API.

## Design (S4, S6 — support actions)

- **`admin` module** (`apps/api/src/admin/`) owns the `AdminAction` table. It exports one public infrastructure contract,
  `AdminActionRecorder.record(tx, entry)`, which writes the audit row with the caller's Prisma transaction client, so
  the owning module performs its change and the audit row in one transaction. No other code writes `AdminAction`.
- **`AdminAction`** (additive migration): `id uuid`, `adminUserId uuid NOT NULL` → `User` (RESTRICT), `action`
  (`INVITATION_UNPUBLISHED | ACCOUNT_DISABLED | ACCOUNT_REACTIVATED | SIGN_IN_CODE_RESENT`), `reason` (`ABUSE |
  OWNER_REQUEST | PAYMENT_ERROR | OTHER`), `note varchar(500) NULL` (CHECK: present when `reason = OTHER`),
  `targetUserId uuid NULL`, `invitationId uuid NULL`, `createdAt timestamptz`; CHECK exactly one target; indexes
  `(createdAt, id)`, `(targetUserId)`, `(invitationId)`; a `BEFORE UPDATE OR DELETE` trigger refuses any change
  (the `Invitation_pinned_fields_immutable` pattern). No email, IP, or payload column.
- **Routes** (all `@AdminOnly()`, actor from `@SessionUserId()`, body `{ reason, note? }` validated by DTO):
  - `POST /admin/invitations/:invitationId/unpublish` → 200; 404 `INVITATION_NOT_FOUND`; 409 `INVITATION_NOT_PUBLISHED`
    / `INVITATION_ALREADY_ARCHIVED`. Keeps `firstPublishedAt`; never creates a refund (the UI says so).
  - `POST /admin/users/:userId/disable` and `/reactivate` → 200 `{ status, revokedSessions? }`; 404 `USER_NOT_FOUND`;
    409 `ACCOUNT_ALREADY_DISABLED` / `ACCOUNT_ALREADY_ACTIVE`; an administrator account answers 409
    `ADMIN_ACCOUNT_PROTECTED`. Disable revokes sessions in the same transaction.
  - `POST /admin/users/:userId/sign-in-code` → 202 `{ outcome: "requested" }`; 404 `USER_NOT_FOUND`; 409
    `USER_CANNOT_SIGN_IN_BY_CODE` (disabled or administrator). It goes through Better Auth's own sign-in-code endpoint
    so the per-email quota, hashing, expiry, and attempt cap apply unchanged. The audit row records the request and is
    written before the request (delivery is asynchronous and never reported as done).
  - `GET /admin/payments/:paymentId` → 200 `{ paymentId, invitationId, invitationSlug, status, amountMinor, currency,
    provider, createdAt, paidAt, events: [{ type, outcome, receivedAt, processedAt }] }` (newest 50), 404
    `PAYMENT_NOT_FOUND`. Not audited; no payer datum, provider reference, idempotency key, or payload hash.
- **Admin invitation detail** gains the additive `ownerId` field so the web can address the owner's account.
- **Web**: an «Acciones de soporte» card on `/admin/invitaciones/<id>` (unpublish when published; disable or reactivate
  and resend the code for the owner), each a server-action form with the reason select and the note, `?notice=` /
  `?error=` redirects; `/admin/pagos/<id>` for the payment detail, linked from the payments table and the invitation
  detail.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Explore: current admin API/pages, invitation, payment, and media reads the status view can reuse | S1 | explore | see L5 |
| T2 | API: admin invitation search and status detail (state, payment, media counts), bounded, no personal data | S1 | worker | |
| T3 | Web: `/admin/invitaciones` search with filters and a status detail page | S1 | worker | |
| T4 | Docs, native review, PR, CI, merge for the S1 slice | S1 | inline | see L6 |
| T6 | `AdminAction` migration + admin module (recorder, domain, append-only trigger) + db-spec | S6 | worker | |
| T7 | Payment detail: `GET /admin/payments/:paymentId` + `/admin/pagos/<id>` | S4, S6 | worker | |
| T8 | Admin unpublish with audit, `ownerId` on the detail, support card on the invitation detail | S4, S6 | worker | |
| T9 | Disable, reactivate, and resend the sign-in code with audit + web actions | S4, S6 | worker | see L10 |
| T10 | Support action review follow-ups: role guard, 409 under concurrent transitions, payment retry link, regression probes | S4, S6 | worker | |
| T5 | S1 review follow-ups: cursor instant range, an index for the unfiltered ordering, payment cap, concurrent index build | S1 | worker | see L7 |

## Log

- L1 — Owner: "luego activa de nuevo el rdd para este repo y continua con el siguiente modulo recomendado".
- L2 — Owner answers (2026-11-20): first part «Estado operativo (recomendado)»; analytics «Vistas por invitación»,
  «Embudo de compra», «Respuestas RSVP»; retention «90 días (recomendado)»; support actions «Despublicar una
  invitación», «Ver el detalle de un pago», «Desactivar una cuenta», «Reenviar el enlace de acceso».
- L3 — Owner answers (status view): owner data «Solo el correo (recomendado)»; content «No (recomendado)»; search
  «Slug (recomendado)»; index «Sí, agrégalo (recomendado)».
- L4 — Owner clarification: «Slug + filtro de estado (recomendado)».
- L5 — T1 (explorer): only admin routes today are `/admin/payments`; all invitation reads are owner-scoped; no title
  column (it lives in personal `content`); no pagination convention exists (cursor is new); `Invitation` has only
  `@@index([ownerId])`; media has no count port. Design above follows the gallery-reader port precedent.
- L6 — S1 delivered as chained PRs #94 (reads, ports, index) → #93 (routes) → #91 (web client) → #92 (web pages), CI
  green on each, merged; master `0ba297f`. Native review of slice 1 `review-7ef7a9e905741614` approved; slices 2-4 not
  due (medium, under budget). One unidentified intermittent db-spec failure (1 of 6 local runs, under load) did not
  reproduce. Advisories kept for T5: «The cursor decoder accepts canonical ISO instants that are outside PostgreSQL's
  timestamptz range»; «the added (status, createdAt) index cannot satisfy that global createdAt ordering»; «The
  payment adapter passes an arbitrary limit to Prisma even though the port says the detail list is capped at twenty»;
  «CREATE INDEX without CONCURRENTLY takes a SHARE lock on Invitation». The parent decided T5 adds a second additive
  index `Invitation(createdAt, id)` (same kind as the authorized one, L3) and never edits the merged migration.
- L7 — T5 (worker + parent): the cursor refuses instants outside 1970..9999 (400 `INVALID_CURSOR` instead of a 500);
  additive migration `20261126120000_add_invitation_created_at_id_index` builds `Invitation(createdAt, id)` with
  `CREATE INDEX CONCURRENTLY` (accepted by `prisma migrate deploy`); the detail payment read is clamped to 1..20; a
  non-UUID detail id answers null without a query. The parent rewrote the key-set predicate as the row comparison
  `("createdAt", "id") < (…)`, an `Index Cond` (21 heap fetches) instead of a `Filter` (7 040 rows removed) on 20 000
  rows. Evidence: API 1786 unit and 418 db-specs, typecheck, lint, format, docs:check pass.
- L8 — Owner chose the next slice: «Acciones de soporte (recomendado)». Answers: audit «Tabla de auditoría
  (recomendado)»; reason «Lista cerrada + nota (recomendado)»; disabling an account «Siguen publicadas (recomendado)»;
  resending the code «Mismos límites actuales (recomendado)».

- L9 — Owner answers (support actions): reactivate «Sí, reactivar (recomendado)»; audit «Misma transacción
  (recomendado)»; payment views «No (recomendado)»; note «Sí, con «Otro» (recomendado)». Explorer findings: disabling
  exists only as a CLI (`disable-user.command.ts`, keyed by email, revokes sessions); nothing reactivates; sign-in codes
  go through Better Auth's emailOTP with a per-email 5/hour quota and asynchronous delivery; admin reads are read-only;
  no audit table exists. Parent decisions: the `admin` module with `AdminActionRecorder` satisfies «Misma transacción»;
  the resend audit row records the request; `ownerId` is added to the admin detail (additive).
- L10 — T6-T9 delivered as chained PRs #96 (audit), #97 (payment detail), #98 (unpublish), #99 (account core), #100
  (account routes), #101 (account web), CI green on each and merged; master `6b527ac`. Native reviews: #97
  `review-8ec17fe9778e9c90` and #99 `review-e2ce9ee8cb14e003` approved; #96, #98, #100, #101 not due; #98-#100 also
  passed an independent security verifier (escalated item 2). Better Auth's per-IP limit does not apply to the
  in-process resend; the per-email 5/hour quota does (accepted: an admin can exhaust it, each resend is audited).
  Advisories for T10: «Include role CUSTOMER in the guarded WHERE and treat a zero count as a protected-account
  refusal»; «returning an unexpected 500 instead of the intended 409 conflict» under concurrent opposite transitions;
  «Pressing the advertised retry button therefore navigates away from the payment detail»; the verifier's two
  regression probes (per-IP bypass, admin-route reflection).
