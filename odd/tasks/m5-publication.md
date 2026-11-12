# Milestone 5 — Publication and public invitation runtime

Branch `feat/m5-publication` from `master` at `6937cc3`. A customer publishes a complete invitation draft and guests
see it at a public URL rendered by the allow-listed renderer. Planning map: explore task `mwd0mefj-b-yzsn` (2026-11-12).

## Specs

- S1 — ROADMAP outcome: "Publish a completed invitation through a predictable public URL and render it safely for
  guests."
- S2 — ROADMAP key scope: "backend publication transition with ownership/completeness checks; public route resolution
  by unique slug; public rendering through the renderer registry that Milestone 3 implemented (lookup by allow-listed
  `componentKey`); missing, unpublished, expired, and unknown-renderer behavior; query-efficient public reads and
  cache/revalidation decisions; and browser/API tests for the public journey."
- S3 — ROADMAP exit criteria: "The frontend cannot publish or mark an invitation paid by changing client state."
  "Public output contains only data authorized for public rendering." "Public rendering has bounded queries and does
  not evaluate database content as code."
- S4 — ROADMAP non-goals: "No custom domains, arbitrary page builders, search indexing program, or multi-region
  rendering architecture."
- S5 — Public URL (owner, L2): "/i/<slug> (Recomendado)" — "Ej. invitame.mx/i/invitacion-k7m2qx. No choca con páginas
  futuras del sitio. Hay que corregir una línea de la arquitectura, que planeaba /<slug>."
- S6 — Payment before Milestone 7 (owner, L2): "Gratis por ahora (Recomendado)" — "Cualquier cliente publica su
  invitación completa. La publicación ya consulta un «puerto de pago» que hoy responde «no requiere pago»; en el M7
  solo se cambia esa pieza."
- S7 — After publication (owner, L2): "Editable en vivo y despublicable (Recomendado)" — "Los cambios que guardes se
  ven de inmediato en la página pública. Puedes despublicarla (vuelve a borrador) y volver a publicarla. Archivar
  sigue siendo definitivo."
- S8 — Expiration (owner, L2): "No caduca en el M5 (Recomendado)" — "Agrego el campo de caducidad en la base de datos,
  vacío por ahora. La regla (por ejemplo, fecha del evento + N días) se decide después."
- S9 — Quality gate (`docs/development/quality-gates.md`): publication needs application authorization tests,
  integration tests for state and `TemplateVersion`, and public-route E2E for unpublished and published states.
- S10 — Session cookie scope (ADR 0004): the session cookie is host-only on the web host; the public route stays on the
  same origin and never needs it.

Working assumptions (owner may overturn; L3): A1 publishing requires every required field of the pinned schema, a full
re-validation of the content, a package that still fits, and a pinned version that is still PUBLISHED; an already
published invitation keeps rendering its pinned version even if the catalog later retires it. A2 statuses become
`DRAFT`, `PUBLISHED`, `ARCHIVED`; unpublish returns to `DRAFT`; archive is allowed from DRAFT or PUBLISHED and is
terminal. A3 an unknown, draft, archived, or expired slug answers 404 with a friendly Spanish page; an unknown renderer
is an operational error (logged, 404 to the guest). A4 slug regeneration stays out of M5. A5 invitation pages are
`noindex, nofollow`. A6 the public page is rendered per request (no ISR). A7 the public read returns only the pinned
schema's declared content properties plus the render configuration and `componentKey` — never owner, package, price,
status history, or ids; `address` is public because the renderer shows the venue. A8 share preview uses static
metadata (title from `celebrantName`, description from `message`), no generated image.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Additive migration: `PUBLISHED` in `InvitationStatus`, nullable `publishedAt` and `expiresAt`, rewrite the archive CHECK for three statuses, `publishedAt` set exactly while `PUBLISHED`; database tests | S2, S7, S8 | worker (high risk: own commit) | `3f2dc2e` |
| T2 | Domain: lifecycle (publish, unpublish, archive from DRAFT or PUBLISHED, edit while DRAFT or PUBLISHED), completeness rule, payment port contract with a "no payment required" adapter; unit tests | S2, S3, S6, S7 | worker | `32ca239` |
| T3 | Application and Prisma: publish and unpublish use cases (owner-scoped), public read by slug with the allow-listed projection, catalog public contract for the pinned version's render data; database tests | S1, S2, S3, S7 | worker | `9b1b21c` |
| T4 | API: `POST /invitations/:id/publish`, `POST /invitations/:id/unpublish`, `@Public()` `GET /public/invitations/:slug`; controller tests (401, 404, 409, public 404 cases) | S2, S3, S9 | worker | `b4bd2b4` |
| T5 | Web: `/i/[slug]` public page (renderer, friendly 404, noindex, metadata), publish/unpublish controls and the public link in `/cuenta/invitaciones/[id]`; unit tests and a Playwright public-journey spec | S1, S5, S7, S9 | worker | `68be4a8` |
| T6 | Docs: overview public flow (`/i/<slug>`), `CONTEXT.md` Publication, `docs/database/model.md`, ROADMAP status | S1–S10 | inline | this commit |

## Log

- L1 (2026-11-12, owner): "listo que sigue?" → chose "Milestone 5: publicación (Recomendado)".
- L2 (2026-11-12, owner answers): URL — "/i/<slug> (Recomendado)"; payment — "Gratis por ahora (Recomendado)"; after
  publication — "Editable en vivo y despublicable (Recomendado)"; expiration — "No caduca en el M5 (Recomendado)".
- L3 (2026-11-12): assumptions A1–A8 adopted from the planning map's recommended defaults (D3, D6–D11).
- L4 (2026-11-12): T1 migration `3f2dc2e` (`20261112040547_add_invitation_publication`). One M4 database assertion
  (`prisma-invitation.repository.db-spec.ts`, "stores a DRAFT pinned to …") fails until T3 adds `publishedAt` and
  `expiresAt` to `InvitationRecord`; slice 1 of M5 is therefore T1 + T2 + T3 so no pushed commit range fails.
- L5 (2026-11-12): owner merged slice 1 (PR #59) as `fb271b6`. T4 routes (`b4bd2b4`): `POST /invitations/:id/publish` →
  200 with `publishedAt`, 404, 409 `INVITATION_ALREADY_PUBLISHED` / `INVITATION_ALREADY_ARCHIVED` /
  `INVITATION_NOT_PUBLISHABLE` (+ `issues`), 402 `INVITATION_PAYMENT_REQUIRED` (+ `reason`, unreachable until M7);
  `POST /invitations/:id/unpublish` → 200, 404, 409 `INVITATION_NOT_PUBLISHED`; `@Public()`
  `GET /public/invitations/:slug` → 200 `{ slug, componentKey, configuration, content, publishedAt }` or 404
  `PUBLIC_INVITATION_NOT_FOUND`, both `Cache-Control: no-store`.
- L6 (2026-11-12): T5 web (`68be4a8`): `/i/[slug]` guest page and the owner publish/unpublish controls. The public 404
  page was proven against the local servers; the 200 guest render and `e2e/public-invitation.spec.ts` were not run
  locally (the journey needs the disposable e2e database, Mailpit, and a seeded published template). T6 docs: overview
  public flow is now `/i/<slug>` and current, `CONTEXT.md` Invitation and Publication, `docs/database/model.md`,
  ROADMAP marks Milestone 5 implemented. Slice 2 = T4 + T5 + T6.
