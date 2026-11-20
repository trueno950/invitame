# InvitaMe roadmap

This roadmap separates the implemented foundation from the planned invitation product. A milestone description is
not evidence that its runtime behavior exists. Executable code, tests, Prisma schema, migrations, seed data, and
package scripts remain the source of truth for the current repository.

## Product direction

**Status:** Planned direction; implemented through Milestone 5 (foundation, identity, catalog, invitation drafts,
and publication).

InvitaMe is planned as a self-service invitation service with no manual operator step between an order and its
publication: a customer chooses a catalog design, completes the invitation, pays, and the backend publishes it after
verifying the payment (Milestones 4, 5, and 7). The owner curates the catalog and adds, edits, or improves designs
over time; each change is a new `TemplateVersion`, so existing invitations keep the version they pinned. Customer
support, refunds, and moderation of customer-uploaded content remain operational work (Milestone 9).

The first designs target children's birthdays, baby showers, baptisms, XV años (quinceañera), and weddings, in two
styles: themed (children's birthdays, baby showers, themed baptisms) and elegant (XV años, weddings, formal
baptisms). The catalog design track below plans that first set. Every catalog design follows the theme guardrail at
the end of this roadmap.

## Milestone 1 — Foundation and operating model

**Status:** Implemented foundation; process documentation is maintained alongside it.

### Outcome

Create a small, honest base that future invitation workflows can build on without pretending to be a finished
product.

### Key scope

- pnpm workspace with independently runnable `apps/web` and `apps/api` applications;
- Next.js 16 App Router landing page with neutral professional Spanish product copy;
- NestJS API bootstrap with startup environment validation, Helmet, configured CORS, graceful shutdown, and
  database-backed `GET /health`;
- PostgreSQL catalog for categories, features, packages, templates, and immutable `TemplateVersion` snapshots;
- Prisma ownership and local Docker Compose database orchestration;
- repeatable catalog seed data and strict TypeScript/format/lint/typecheck/test/build scripts; and
- concise authority, architecture, AI workflow, anti-pattern, quality, Git, and roadmap documentation.

### Exit criteria

- The current source and migration behavior remain accurately documented.
- Template versions protect renderer identity, schema, and configuration from in-place rewrites.
- Local verification commands are recorded and pass when their prerequisites are available.
- No invitation, payment, authentication, media, guest, RSVP, analytics, CD, required-check governance, or hosted
  deployment behavior is claimed; the limited quality-gate CI workflow is intentionally scoped and documented.

### Deliberate non-goals

No product account flow, invitation editor, public invitation runtime, payment provider, object storage, or hosted
deployment is added to the foundation.

## Milestone 2 — Identity, ownership, and authorization

**Status:** Implemented. The owner signed off the security evidence in
[`docs/development/m2-security-evidence.md`](docs/development/m2-security-evidence.md); its open risks, such as the
production domain, remain listed there.

### Outcome

Give creators a verified account and a backend-enforced ownership model for their catalog and invitations.

### Key scope

- authentication and session lifecycle with Better Auth, as decided in
  [ADR 0004](docs/adr/0004-authentication-with-better-auth.md);
- user profile and account status behavior;
- API authorization policy for creator-owned resources and administrative actions;
- secure session boundaries between `apps/web` and `apps/api`; and
- unit/integration tests for denied access, ownership, and session failure paths.

### Exit criteria

- Protected API actions deny unauthenticated and unauthorized requests regardless of UI state.
- User ownership is represented by normalized relations and database constraints.
- Secret handling, session expiry, and error mapping have human-approved security evidence.

### Deliberate non-goals

No OAuth, social login, custom domains, multi-organization billing, or invitation authoring is included.

## Milestone 3 — Catalog and renderer contracts

**Status:** Implemented (`odd/tasks/m3-catalog.md`): administrator catalog API and pages, MXN package prices,
version publication rules, and the allow-listed renderer registry with `birthday-adventure-01`. That first single
design was later retired: the catalog design track replaced it with the themed birthday layouts. Public catalog
reads for creators belong to Milestone 4.

### Outcome

Turn catalog records into a safe, reviewable set of invitation capabilities and renderer contracts.

### Key scope

- category, package, and feature administration;
- package prices and currencies with normalized query fields;
- version creation and publication rules for templates;
- an application-owned renderer registry keyed by an explicit allow-list;
- validated schema/configuration contracts for each renderer; and
- admin/catalog behavior tests and version compatibility checks.

### Exit criteria

- Catalog names and feature keys remain data and never select arbitrary code paths.
- Every published renderer key resolves to reviewed application code.
- New renderer behavior is introduced through a new immutable `TemplateVersion`.

### Deliberate non-goals

No arbitrary code in the database, dynamic module imports, or general-purpose visual editor is included.

## Milestone 4 — Invitation authoring and snapshotting

**Status:** Implemented (`odd/tasks/m4-invitations.md`): `Invitation` drafts pinned to a published template version
and a package, generated unique slugs, partial content validated against the pinned schema, archive instead of
delete, the `/invitations` API, signed-in creator catalog reads, and «Mis invitaciones» under `/cuenta`.

### Outcome

Let an authenticated creator create and edit a bounded invitation draft pinned to a chosen template version.

### Key scope

- Invitation aggregate and lifecycle;
- draft creation, bounded form data, validation, and ownership;
- normalized public slug generation and collision handling;
- package entitlement checks against explicit capability contracts; and
- persistence and application tests proving `Invitation -> TemplateVersion`.

### Exit criteria

- Invalid data and unauthorized edits are rejected by the API.
- The invitation continues to use its pinned version after the template catalog changes.
- Slug uniqueness is enforced by PostgreSQL, not only by a preflight query.

### Deliberate non-goals

No public publication, payment confirmation, guest management, media uploads, or Canva-style freeform editing.

## Milestone 5 — Publication and public invitation runtime

**Status:** Implemented (`odd/tasks/m5-publication.md`): publish and unpublish with ownership, completeness,
package-fit, and pinned-version checks behind a payment gate that requires no payment until Milestone 7; the public,
uncacheable read by slug; and the `/i/<slug>` guest page rendered through the renderer registry, noindex, with a
friendly 404. Expiration is carried in the database but has no rule yet.

### Outcome

Publish a completed invitation through a predictable public URL and render it safely for guests.

### Key scope

- backend publication transition with ownership/completeness checks;
- public route resolution by unique slug;
- public rendering through the renderer registry that Milestone 3 implemented (lookup by allow-listed
  `componentKey`);
- missing, unpublished, expired, and unknown-renderer behavior;
- query-efficient public reads and cache/revalidation decisions; and
- browser/API tests for the public journey.

### Exit criteria

- The frontend cannot publish or mark an invitation paid by changing client state.
- Public output contains only data authorized for public rendering.
- Public rendering has bounded queries and does not evaluate database content as code.

### Deliberate non-goals

No custom domains, arbitrary page builders, search indexing program, or multi-region rendering architecture.

## Catalog design track

**Status:** In progress. It runs in parallel with Milestones 6 to 9 and must be complete before the first release
(Milestone 10). The catalog currently holds the three themed children's birthday layouts (`birthday-map-01`,
`birthday-poster-01`, `birthday-story-01`) in eight themes each. The first single design, `birthday-adventure-01`,
was deleted once those layouts replaced it.

### Outcome

Grow the catalog from one design to several templates per occasion, with each layout and theme chosen visually by the
owner before it is implemented.

### Key scope

- a template is a **layout** plus a **theme**: the layout is an allow-listed renderer (page structure, coded once);
  the theme is an allow-listed set of palette, licensed fonts, and original illustrations that the layout applies;
  each combination is its own catalog template and `TemplateVersion`;
- themed layouts and themes for children's birthdays first, starting from the directions in
  `design/birthday-adventure-v2/`, then baby showers and themed baptisms;
- elegant layouts and themes for XV años, weddings, and formal baptisms;
- for each layout and theme: visual directions under `design/<slug>/`, the owner's choice, then the renderer or theme
  code, its validated schema/configuration contract, catalog seed data, and tests; and
- mobile-first, accessible guest rendering, because invitations are mostly opened from shared links on phones.

### Exit criteria

- Children's birthdays, baby showers, baptisms, XV años, and weddings each have at least one published template.
- Every layout and theme was chosen by the owner from visual directions before code was written.
- Invitations pinned to an earlier version render unchanged after a layout or theme is improved; whether an
  improvement ships as a new `componentKey` or as a versioned renderer is decided in its slice.
- Every theme follows the theme guardrail and passes contrast and mobile layout checks.

### Deliberate non-goals

No customer-side visual editor, per-customer custom designs, character artwork, logos, brand names, or design that
depends on media uploads before Milestone 8.

## Milestone 6 — Guests and RSVP

**Status:** Implemented (`odd/tasks/m6-guests-rsvp.md`, PR #66): open RSVP for packages with `RSVP`, a guest list with
personal links for `GUEST_LIST`, a QR pass with owner check-in for `QR_PASS`, owner responses with CSV export, and an
independent verification of ownership, tokens, rate limits, and privacy. No notifications are sent.

### Outcome

Allow invitation owners to manage a guest list and receive trustworthy attendance responses.

### Key scope

- guest records and ownership boundaries;
- guest access tokens or another approved public access mechanism;
- RSVP state, party size where approved, and bounded answer fields;
- duplicate submission and expiry behavior; and
- notification hooks only when their provider and privacy boundaries are approved.

### Exit criteria

- Guest data cannot cross invitation ownership boundaries.
- RSVP uniqueness and retry behavior are database-backed and tested.
- Public responses do not expose administrative guest data.

### Deliberate non-goals

No broad CRM, open guest directory, marketing automation, or guaranteed WhatsApp/email delivery is included.

## Milestone 7 — Checkout and one payment provider

**Status:** Implemented (`odd/tasks/m7-payments.md`, `odd/tasks/mercadopago-payments.md`): the provider-neutral
payment core, price snapshots, the verified webhook intake, the publication gate, a development-only simulated
provider, and the Mercado Pago Checkout Pro adapter (MXN, `PAYMENTS_MODE=mercadopago`) with signed, re-read
notifications. Refunds follow «Sin reembolso tras publicar»: an administrator may request a full refund only for a
paid invitation that was never published. Production keeps `PAYMENTS_MODE=free` until the owner configures Mercado
Pago credentials and completes one sandbox pass (`docs/development/payments.md`).

### Outcome

Let a creator purchase an approved package through one reviewed provider without trusting the browser for payment
state.

### Key scope

- checkout intent and normalized payment state;
- package price/currency snapshot at checkout;
- provider adapter and verified webhook intake;
- unique idempotency keys and retry-safe state transitions;
- publication entitlement rules based on verified internal payment state; and
- provider sandbox tests plus failure/replay coverage.

### Exit criteria

- Forged, unsigned, duplicate, out-of-order, and failed provider events are handled deliberately.
- Payment amount and currency cannot change when the catalog changes later.
- Publication access is granted only from a verified backend state transition.

### Deliberate non-goals

No multiple payment providers, subscriptions, tax invoicing, stored card data, or accounting system is included.

## Milestone 8 — Media and invitation content delivery

**Status:** Implemented (`odd/tasks/m8-media.md`, PR #67): provider-neutral media storage (local for development, S3-compatible
for production once the owner configures a bucket), validated and re-encoded photo uploads, the main photo and a
gallery for `GALLERY`, owner/published serving rules, and an idempotent cleanup command. Owner decision
(`odd/tasks/owner-followups.md`, L2): production photos live in Cloudflare R2 through the existing S3-compatible
driver (`docs/development/media-storage.md`).

### Outcome

Support bounded invitation media without putting binaries in PostgreSQL or trusting an ephemeral filesystem.

### Key scope

- approved object-storage adapter;
- `MediaAsset` ownership, storage key, MIME, size, dimensions, lifecycle, and retention metadata;
- upload validation and safe public/private access modes;
- cleanup/retry policy for failed uploads and deleted invitations; and
- integration tests for ownership, limits, and storage failure.

### Exit criteria

- Size, type, dimensions, ownership, and retention are enforced before acceptance.
- Public URLs do not expose private media or provider credentials.
- Database truth and storage side effects have an explicit retry/recovery policy.

### Deliberate non-goals

No video pipeline, advanced image editing, shared file drive, or unbounded user uploads.

## Milestone 9 — Admin operations and useful analytics

**Status:** Planned.

### Outcome

Provide the minimum operational tools and privacy-bounded product signals needed to support the first real users.

### Key scope

- admin catalog and support actions with explicit authorization;
- an admin configuration panel for everything the owner may tune without a deploy (package prices are already
  editable under `/admin/catalogo/paquetes`; the panel gathers them with the other configurable catalog and
  operational settings), requested by the owner in `odd/tasks/owner-followups.md` L2;
- invitation/payment/media operational status views;
- bounded analytics events or aggregates with retention rules;
- structured operational logging without secrets or unnecessary personal data; and
- support runbooks for common failure and replay cases.

### Exit criteria

- Administrative actions are authorized, observable, and tested.
- Analytics fields are allow-listed, privacy-reviewed, and bounded in retention/volume.
- Operational facts are distinguishable from an audit trail and do not replace one.

### Deliberate non-goals

No sophisticated analytics warehouse, real-time data platform, generalized workflow engine, or cross-product BI.

## Milestone 10 — Production readiness and first release

**Status:** Planned.

### Outcome

Make the approved MVP operable, recoverable, and releasable with explicit ownership.

### Key scope

- Production CI/CD commands and branch protection after human approval;
- deployment environment configuration and secret management;
- migration/recovery and backup restoration exercises;
- observability, alert ownership, rate limits, retention, and support runbooks;
- performance checks for public rendering and critical API paths; and
- release checklist, rollback plan, and post-release verification.

### Exit criteria

- Critical workflows have human-approved operational owners and tested recovery paths.
- CI/CD runs the documented quality gates without silently skipping material checks.
- The first release can be rolled back without rewriting migration history or losing invitation/payment truth.

### Deliberate non-goals

No Kubernetes, microservices extraction, native applications, or global multi-region platform is required for the
MVP release.

## Post-MVP candidates

After the first stable product proves demand, revisit advanced visual editing, custom domains, OAuth, multiple
payment providers, sophisticated analytics, queues/background processing, microservices, native iOS/Android apps,
and other scale features. Each requires a new product and architecture decision; none is implied to be implemented
by this roadmap.

## Guardrails

- Catalog names, package names, and feature keys are data, not behavior switches.
- Future invitations reference immutable `TemplateVersion` snapshots.
- Theme guardrail (owner decision, 2026-11-12): a themed design may take its color palette from a popular character or
  brand, and its fonts may be the official ones only when their license allows commercial use; otherwise a similar
  font with a commercial license is used. A design never includes character artwork, logos, or a protected name, in
  the template, its catalog name, or its marketing. Illustrations are original work.
- Schema changes belong to `apps/api` and require the database quality gates.
- A milestone is not complete because its folders or documentation exist; observable behavior and exit evidence are
  required.
