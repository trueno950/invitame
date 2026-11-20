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

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Explore: current admin API/pages, invitation, payment, and media reads the status view can reuse | S1 | explore | see L5 |
| T2 | API: admin invitation search and status detail (state, payment, media counts), bounded, no personal data | S1 | worker | |
| T3 | Web: `/admin/invitaciones` search with filters and a status detail page | S1 | worker | |
| T4 | Docs, native review, PR, CI, merge for the S1 slice | S1 | inline | |

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
