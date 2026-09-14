# InvitaMe roadmap

This roadmap separates the implemented foundation from the planned invitation product. A milestone description is
not evidence that its runtime behavior exists. Executable code, tests, Prisma schema, migrations, seed data, and
package scripts remain the source of truth for the current repository.

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

**Status:** Planned.

### Outcome

Give creators a verified account and a backend-enforced ownership model for their catalog and invitations.

### Key scope

- approved authentication library and session lifecycle;
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

**Status:** Planned extension of the implemented catalog foundation.

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

**Status:** Planned.

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

**Status:** Planned.

### Outcome

Publish a completed invitation through a predictable public URL and render it safely for guests.

### Key scope

- backend publication transition with ownership/completeness checks;
- public route resolution by unique slug;
- renderer registry lookup by allow-listed `componentKey`;
- missing, unpublished, expired, and unknown-renderer behavior;
- query-efficient public reads and cache/revalidation decisions; and
- browser/API tests for the public journey.

### Exit criteria

- The frontend cannot publish or mark an invitation paid by changing client state.
- Public output contains only data authorized for public rendering.
- Public rendering has bounded queries and does not evaluate database content as code.

### Deliberate non-goals

No custom domains, arbitrary page builders, search indexing program, or multi-region rendering architecture.

## Milestone 6 — Guests and RSVP

**Status:** Planned.

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

**Status:** Planned.

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

**Status:** Planned.

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
- Schema changes belong to `apps/api` and require the database quality gates.
- A milestone is not complete because its folders or documentation exist; observable behavior and exit evidence are
  required.
