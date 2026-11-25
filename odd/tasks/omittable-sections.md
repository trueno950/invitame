# Omittable content sections

Let a customer turn off a section of their invitation they do not have (for example godparents), so the section is not
required to publish and the design does not draw it. Design first, then implement in slices.

## Specs

- S1 — Owner, verbatim: "quiero trabajar en algo que estoy viendo de las plantillas veo muchas opciones requeridas,
  pero que pasaria si el cliente no tiene padrinos por ejemplo como manejamos eso"
- S2 — Owner, verbatim: "Mas bien agregar una opcion que pueda desactivar el cliente yo no puedo saber cuales para que
  tambien sea un poco mas visual, o que propones?"
- S3 — Approved design (owner chose «Sí, avanza»): every content section carries a switch «Mostrar en la invitación»,
  on by default. Off: the card folds with «Esta sección no aparecerá en tu invitación», its fields stop counting as
  missing, and the renderer does not draw it. Turning it on again shows the values typed before (nothing typed is
  lost). Only the essentials cannot be turned off: who celebrates, the date, and at least one place (ceremony or
  reception); trying to turn off the last place explains why it cannot.
- S4 — Persistence: the omitted sections are stored in the invitation content as a bounded list of section keys. Every
  affected template (XV, wedding, baptism, baby shower, birthday, every theme) gets a new published `TemplateVersion`
  whose schema accepts that list and whose renderer hides an omitted section; versions stay append-only.
- S5 — Owner, verbatim: "Pasarlos a la versión nueva" — existing drafts move to the new version of their template;
  published invitations do not change.
- S7 — Owner chose `design/omittable-sections/01-interruptor-en-tarjeta.html` («Interruptor en cada tarjeta»): each
  omittable card carries a switch «Mostrar» / «Oculta» in its header; an off card is muted and reads «No se mostrará
  en tu invitación»; the essentials card reads «Siempre se muestra» with no switch.
- S8 — Parent technical decisions (binding for every task):
  1. The omittable groups travel inside each new `TemplateVersion.schema` as data, not code: a top-level extension
     `x-omittable` = list of `{ key, fields }` (group key and the content property names it covers) and
     `x-require-one` = list of group-key lists of which at least one must stay shown (e.g. `["ceremony",
     "reception"]`). A version without `x-omittable` behaves exactly as today.
  2. The content stores `omittedSections`: an array of unique group keys, each one of the version's `x-omittable`
     keys; the new schemas declare it as an optional property (`type: array`, `items.enum` = the keys,
     `uniqueItems: true`). Values typed in an omitted group stay stored and are not deleted.
  3. Readiness: a required field whose group is omitted is not missing; omitting every group of one `x-require-one`
     set refuses publication with its own issue. The API and the web compute this from the same schema data.
  4. Groups per line (essentials never omittable: celebrant/couple names, date, and a line's only place):
     birthday `age`, `mainPhoto`, `message`; baby shower `message`, `rsvpContact`; baptism `parents`,
     `godparents`, `ceremony` (place, address, time), `reception` (place, address, time), `message`, `rsvpContact`
     with require-one `[ceremony, reception]`; XV `parents`, `honorSponsors`, `ceremony`, `reception`, `dressCode`,
     `message`, `rsvpContact` with require-one `[ceremony, reception]`; wedding `ceremony`, `reception`, `dressCode`,
     `message`, `rsvpContact` with require-one `[ceremony, reception]`. Group keys are stable English identifiers.
  5. New versions: one new published version per affected template with the same `componentKey`, configuration,
     and properties plus the extension; created by a dedicated, idempotent API script (the seed never updates an
     existing template); publishing retires the previous version as today.
  6. Re-pin (S5): a new migration lets `Invitation.templateVersionId` change only while the invitation is DRAFT and
     only to the PUBLISHED version of the same template; every other change stays refused by the trigger. A
     separate idempotent script re-pins drafts. High risk (stored data): own commit and an independent verification.
- S6 — Keep what works: autosave, the live preview, the first-steps progress, the missing-field action, server-first
  pages; every state readable without relying on color alone.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Design directions for the section switch under `design/omittable-sections/`; owner picks one | S3, S6 | inline | |
| T2 | Contract and API: omitted-sections list in the schemas, renderer contract (essentials vs omittable), readiness that skips omitted sections and enforces at least one place, new versions script | S3, S4 | worker | |
| T3 | Web renderers hide omitted sections (elegant arch, ornamental, baptism classic, baby shower, birthday) | S3, S4 | worker | |
| T4 | Editor: the switch on each content card, missing counts that skip omitted sections, essentials locked | S3, S6 | worker | |
| T5 | Move existing drafts to the new versions (S5), with an independent verification | S5 | worker + verify | |
| T6 | Browser walkthrough, gates, docs, commit, push, CI | S1-S6 | inline | |

## Log

- L1 — Owner request, verbatim: see S1.
- L2 — Exploration: required fields are declared in `apps/api/prisma/catalog-seed.ts` schemas (baptism `:294`, XV
  `:406`, wedding `:530`, birthday `:156`, baby shower `:218`) and in each renderer's field list
  (`renderer-contract.ts:33-100`, `presence: "optional"`). Publication readiness checks presence
  (`publication-readiness.ts:36`); renderers throw `RendererPropsError` on a blank required field
  (`lib/renderers/invitation-fields.ts:82-101`), so the guest page answers 404. Optional fields already hide their
  block (gift registry, chambelanes, families). The seed never updates an existing template (`catalog-seed.ts:1095`),
  so new versions need their own script or the admin API. No «no aplica» concept exists.
- L3 — Owner answers: S2 (the customer decides with a switch), S5 (move drafts), S3 approved.
- L4 — T1 directions in `design/omittable-sections/`: `01-interruptor-en-tarjeta.html`,
  `02-panel-de-secciones.html`, `03-quitar-y-agregar.html`; awaiting the owner's pick.
- L5 — Owner picked `01-interruptor-en-tarjeta.html` (handoff in progress); the other two are alternatives. Findings:
  sections exist only in the web (`FIELD_SECTIONS`, `lib/customer/invitations.ts` ~:304), and the
  `templateVersionId` change is refused by the trigger of `20261111214752_add_invitations/migration.sql:61`; hence
  S8.1 and S8.6.
