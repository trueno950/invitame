# Milestone 4 — Invitation authoring and snapshotting

Branch `feat/m4-invitations` from `master` at `547cbef`. A signed-in customer creates and edits a bounded invitation
draft pinned to a published `TemplateVersion`. Planning map: explore task `mwck66je-1-8flp` (2026-11-11).

## Specs

- S1 — ROADMAP outcome: "Let an authenticated creator create and edit a bounded invitation draft pinned to a chosen
  template version."
- S2 — ROADMAP key scope: "Invitation aggregate and lifecycle; draft creation, bounded form data, validation, and
  ownership; normalized public slug generation and collision handling; package entitlement checks against explicit
  capability contracts; and persistence and application tests proving `Invitation -> TemplateVersion`."
- S3 — ROADMAP exit criteria: "Invalid data and unauthorized edits are rejected by the API." "The invitation continues
  to use its pinned version after the template catalog changes." "Slug uniqueness is enforced by PostgreSQL, not only
  by a preflight query."
- S4 — ROADMAP non-goals: "No public publication, payment confirmation, guest management, media uploads, or
  Canva-style freeform editing."
- S5 — Slug (owner, L2): "Generada, no editable en M4" — "El sistema la crea (ej. cumple-k7m2qx), en minúsculas y
  única en la base de datos, con una lista de palabras reservadas (admin, api, cuenta…). Cambiarla queda para M5."
- S6 — Who creates (owner, L2): "Cualquier cliente activo, gratis" — "Crear y editar borradores no cuesta. El paquete
  elegido solo se valida: la plantilla tiene que caber en sus funciones. El cobro se exige al publicar (M5/M7)."
- S7 — Draft content (owner, L2): "Parcial y archivable" — "Se crea solo con la plantilla y cada campo se valida contra
  la versión fijada; puede quedar incompleto hasta publicar. No se borra: se archiva. Sin límite de borradores."
- S8 — Creator catalog (ROADMAP Milestone 3 status): "Public catalog reads for creators belong to Milestone 4."
- S9 — Ownership (`apps/api/src/auth/access-control/session-user-id.ts`): "Routes that own a resource read the user
  from here, never from the path, query, or body."
- S11 — Owner feedback after trying the pages (L10): "ya las probe mismo problema mucho scroll y creo que hay inputs que
  podemos mejorar mas ux/ui por ejemplo hora fecha, edad acepta numeros negativos"
- S12 — Layout precedent (admin redesign, same owner complaint): the narrow centered card made pages scroll too much;
  keep the customer «Rosa y vino» theme but use the width.
- S10 — Data model (`docs/database/future-model.md`): "Core ownership, publication, schedule, status, and lookup
  fields must not be hidden in that payload." "Slugs should not contain secrets or encode authorization."

Working assumptions (owner may overturn; recorded in L3): A1 each renderer contract declares the feature keys it
needs (`birthday-adventure-01` needs none), and a package fits a template version when it is `ACTIVE` and includes
every required key; A2 the pinned `templateVersionId` never changes in M4; A3 statuses written in M4 are `DRAFT` and
`ARCHIVED`; an archived draft is read-only; A4 another customer's invitation answers 404, not 403; A5 the creator
catalog read requires a signed-in customer (not `@Public()`).

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Additive migration: `InvitationStatus` enum and `Invitation` table (owner, pinned version, package, unique lower-case slug with CHECK, status, JSONB `content`, timestamps, `Restrict` FKs, owner index); database tests | S2, S3, S5, S10 | worker (high risk: own commit) | `2582059` |
| T2 | Domain: slug generator and reserved words, lifecycle (DRAFT → ARCHIVED, edits only in DRAFT), partial content validation against the pinned version schema, renderer `requiredFeatureKeys` and the package-fit rule; unit tests | S2, S5, S6, S7 | worker | `45b3f9d` |
| T3 | Application and Prisma adapter: create draft (published version only, package fit, slug retry on unique violation), list own, get own, update content, archive; database tests | S1, S3, S6, S7, S9 | worker | `95bc89f` |
| T4 | API presentation: `/invitations` routes with `@SessionUserId()`, DTOs, 400/401/404 tests; creator catalog read (published templates with their published version, active packages with price and feature keys) | S3, S8, S9 | worker | `6f579f9` |
| T5 | Web: «Mis invitaciones» under `/cuenta`, create (template + package), edit the draft from the pinned schema, archive; server actions | S1, S6, S7 | worker | `5f05be3` |
| T6 | Docs: `docs/database/model.md`, `CONTEXT.md`, `docs/architecture/overview.md`, ROADMAP status | S1–S10 | inline | this commit |
| T7 | API: when a draft field is provided, enforce the pinned schema's own field rules (`minimum`/`maximum`, `pattern`, `format: date`, `format: uri`, `minLength`) while `required` stays unenforced | S7, S11 | worker | |
| T8 | Web: a wider «Mis invitaciones» workspace with less scroll, grouped fields, and native inputs from the schema (date, time, bounded number, URL, multi-line message, length limits) | S11, S12 | worker | |

## Log

- L1 (2026-11-11, owner): "corrige luego sigue con el milestone 4"
- L2 (2026-11-11, owner answers): slug — "Generada, no editable en M4 (Recomendado)"; who creates — "Cualquier
  cliente activo, gratis (Recomendado)"; draft — "Parcial y archivable (Recomendado)".
- L3 (2026-11-11): assumptions A1–A5 adopted from the planning map defaults; open for the owner to overturn.
- L4 (2026-11-11): T1 independently verified (verify task `mwcnm58d-3-sm9t`): additive (`prisma migrate diff` shows
  only the new enum, table, indexes, and FKs), every CHECK and the trigger probed, down path proven (drop trigger,
  function, table, enum). Advisories applied: the 60/61-character slug boundary and the content-update check are
  now tested, and `docs/database/model.md` no longer claims `id`/`createdAt` are blocked by the database.
- L5 (2026-11-11): delivery strategy — one PR per slice, like Milestone 3. Slice 1 = T1 + T2 (`45b3f9d`,
  `2582059`); slice 2 = T3 + T4 (API); slice 3 = T5 + T6 (web and docs). Push and PRs stay the owner's decision.
- L6 (2026-11-11): slice 1 PR #56 — CI passed (quality gates, database tests, browser tests). Native review
  `review-025692d79831605d` (risk + reliability) ended `correction_required`: a candidate-caused severe finding was
  confirmed by the refuter, but the finding text was not yet shown because the review's untracked-selection step
  failed (`candidate_context_unavailable`, not retry-safe) while T3 files were uncommitted in the same worktree.
  Owner: "si haz el merge igual". Merged as `fb5dde7`. Open follow-up: read the finding once T3 is committed and
  fix it in slice 2; a fix to the migration must be a new additive migration, never an edit of `20261111214752`.
- L7 (2026-11-11): after the T3 commit the owner ran the provider-offered `gentle-ai review recover`
  (`scope_changed`, successor `review-1baa8d786280eb88`, base `547cbef`, committed only: slice 1 + T3). Its risk and
  reliability reviewers ran on the frozen trees and the review closed `approved` with no blocking or advisory
  findings; the approval was acknowledged. The text of the earlier finding was never shown, and the new review did
  not reproduce it.
- L8 (2026-11-11): T4 routes — `POST/GET /invitations`, `GET /invitations/:id`, `PUT /invitations/:id/content`,
  `POST /invitations/:id/archive`, `GET /catalog/templates`, `GET /catalog/packages`. Package that does not fit
  answers 400 `INVITATION_PACKAGE_DOES_NOT_FIT` (the API uses no 422); slug exhaustion 503. Known gap: CORS allows
  only GET/HEAD/POST/OPTIONS, so the web must call `PUT` from server actions (no browser preflight), as in Milestone 3.
  `/invitations/:id` refuses a non-UUID id with 400 (`ParseUUIDPipe`), unlike the admin catalog's 404.
- L9 (2026-11-11): T5 web pages `/cuenta/invitaciones`, `/cuenta/invitaciones/nueva`, `/cuenta/invitaciones/[id]`;
  every write is a server action; a draft whose pinned version was retired shows its content read-only. The worker
  ran web tests (504), typecheck, lint, and `next build`; the Playwright spec `apps/web/e2e/invitations.spec.ts`
  was written but not run locally (needs the disposable e2e PostgreSQL and Mailpit and a seeded published
  template). Owner merged slice 2 as `0d30f2c`. Slice 3 = T5 + T6.
- L10 (2026-11-12, owner, after trying the pages before merging PR #58): "ya las probe mismo problema mucho scroll y
  creo que hay inputs que podemos mejorar mas ux/ui por ejemplo hora fecha, edad acepta numeros negativos". Evidence:
  the pinned `birthday-adventure-01` schema declares `age` minimum 1 / maximum 120, `date` format date, `time` a
  HH:MM pattern, and `mainPhoto` format uri, but T2 deferred those rules to publication, so a negative age was
  stored; S7 says each field is validated against the pinned version, so T7 enforces them on save. T7 and T8 are
  added to slice 3 (PR #58) before its merge.
