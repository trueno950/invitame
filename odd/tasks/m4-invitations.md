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
| T3 | Application and Prisma adapter: create draft (published version only, package fit, slug retry on unique violation), list own, get own, update content, archive; database tests | S1, S3, S6, S7, S9 | worker | |
| T4 | API presentation: `/invitations` routes with `@SessionUserId()`, DTOs, 400/401/404 tests; creator catalog read (published templates with their published version, active packages with price and feature keys) | S3, S8, S9 | worker | |
| T5 | Web: «Mis invitaciones» under `/cuenta`, create (template + package), edit the draft from the pinned schema, archive; server actions | S1, S6, S7 | worker | |
| T6 | Docs: `docs/database/model.md`, `CONTEXT.md`, `docs/architecture/overview.md`, ROADMAP status | S1–S10 | inline | |

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
