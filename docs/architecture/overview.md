# Architecture overview

InvitaMe is a modular monolith with two independently runnable applications. The repository currently contains
only the foundation: catalog/version data, API configuration and health, Prisma ownership, and a small public
landing page. The module map and flows below describe the target product and are explicitly planned unless marked
implemented.

## Current versus target status

| Area | Current foundation | Target direction |
| --- | --- | --- |
| Web | `apps/web` is a Next.js 16 App Router landing page with Spanish product copy. | Dashboard, authoring flows, and public invitation routes. **Planned.** |
| API | `apps/api` has configuration, a global Prisma service, and `GET /health`. | Feature modules exposing stable REST contracts. **Planned.** |
| Database | PostgreSQL and Prisma own a minimal `User` foundation plus the catalog, packages, features, templates, and immutable template versions; authentication behavior is not implemented. | Invitation, guest, RSVP, payment, media, and analytics models. **Planned.** |
| Renderer | `TemplateVersion.componentKey` is persisted and protected as snapshot data. | An application-owned allow-listed renderer registry. **Planned.** |
| Operations | Local Docker Compose database and workspace scripts only. | CI/CD, deployment, observability, and provider operations. **Planned.** |

## Context and runtime map

```text
Browser
  ├── creator/dashboard traffic ──► apps/web (Next.js 16 App Router)
  └── public invitation traffic ──► apps/web

apps/web ── REST/JSON ──► apps/api (NestJS)
                              ├── Prisma ──► PostgreSQL
                              └── provider adapters ──► payment/media/email providers (planned)
```

`apps/web` never imports Prisma or connects to PostgreSQL. The API is the persistence boundary. Turborepo
orchestrates workspace tasks and caching; it does not create a shared domain package or a distributed runtime.

The current API tree is intentionally small:

```text
apps/api/src/
  config/       startup environment validation
  database/     Prisma module and service
  health/       database-backed health endpoint and tests
  app.module.ts Nest composition root
  main.ts       HTTP bootstrap, Helmet, CORS, validation, shutdown hooks
```

Do not add empty feature layers to this foundation. A real capability earns a feature module when it has business
behavior, persistence, or an external boundary.

## Target feature module map (planned)

These are product boundaries, not a claim that the folders already exist:

| Module | Responsibility |
| --- | --- |
| Auth | Sessions, identity verification, and authentication policy. |
| Users | Account profile, ownership, and account lifecycle. |
| Categories | Event-category catalog management. |
| Templates | Mutable catalog metadata, versions, schemas, and renderer identity. |
| Invitations | Invitation lifecycle, authoring, publication reference, and ownership. |
| Packages | Sellable package catalog, prices, and included feature relationships. |
| Features | Allow-listed capability contracts represented by catalog data. |
| Payments | Checkout, payment state, provider references, and webhook intake. |
| Media | Upload policy, asset ownership, and object-storage adapters. |
| Guests | Invitation guest records and guest access tokens. |
| RSVP | Responses and invitation-specific attendance state. |
| Analytics | Privacy-bounded event capture and invitation metrics. |
| Admin | Catalog operations, support actions, and operational controls. |

Cross-module collaboration must use a deliberate public application port or contract. A module must not import
another module's domain, repositories, controllers, or infrastructure internals.

## Module layout and dependency direction

The minimum target shape for a real API module is documented in
[`module-template.md`](module-template.md). The conceptual direction is:

```text
presentation ──► application ──► domain
       infrastructure ───────────► domain
       infrastructure ──implements application ports
```

| Layer | Owns | May import | Must not import |
| --- | --- | --- | --- |
| `domain` | Pure invariants, value objects, domain errors, and contracts. | Language/runtime primitives and its own files. | NestJS, Prisma, HTTP, React, presentation, or infrastructure. |
| `application` | Use-case orchestration, authorization decisions, transaction intent, and ports. | Domain contracts and approved shared application primitives. | Prisma clients, HTTP decorators, React, or another module's internals. |
| `infrastructure` | Prisma repositories, provider clients, mappers, and technical adapters. | Domain/application ports and infrastructure libraries. | Presentation/UI. |
| `presentation` | DTO validation, transport mapping, controllers, and response policy. | Application contracts/use cases and NestJS transport code. | Prisma queries or business rules. |

The dependency arrow points inward. The application identifies the business operation that must be atomic; the
infrastructure adapter owns the actual Prisma transaction lifecycle. Controllers and UI do not open transactions.

## Request flow

For the current foundation, a health request follows this path:

```text
HTTP GET /health
  → HealthController
  → HealthService
  → PrismaService.$queryRaw(SELECT 1)
  → typed health response or 503
```

For a future protected operation:

```text
HTTP request
  → presentation DTO + global validation
  → authentication and authorization boundary
  → application use case
  → domain invariant checks
  → infrastructure port adapter and transaction
  → response mapper
```

Authorization is enforced by the API even when the web UI hides an action. A hidden button is not a security
boundary.

## Public invitation flow (planned)

```text
Public URL /<slug>
  → apps/web resolves the public route
  → apps/api loads the published Invitation by unique slug
  → API returns its referenced TemplateVersion snapshot and validated render data
  → web selects a component from the local renderer registry by componentKey
  → registry renders the invitation with data, never with executable database content
```

An invitation points to `TemplateVersion`, not to mutable `Template` metadata. Publishing changes which invitation
state is publicly visible; it does not rewrite the version snapshot. Public rendering must fetch the required data
without an N+1 query pattern and must fail closed for unpublished, missing, or unauthorized resources.

## Renderer registry and `componentKey`

`componentKey` is an identifier, not a module path, JavaScript expression, template string, or code blob. The
application owns a registry similar in concept to:

```text
"birthday-adventure-01" → BirthdayAdventureRenderer
"wedding-editorial-01" → WeddingEditorialRenderer
```

The registry is an explicit allow-list compiled into the application. The database stores the selected key plus
validated schema/configuration data. A missing or unknown key is an operational error, not permission to evaluate
dynamic code. New renderer behavior is shipped as reviewed application code and then referenced by a new
`TemplateVersion`.

## Publication and payment trust boundaries

Publication is a backend state transition. The browser can request it, but the API verifies ownership,
authorization, completeness, and any required payment state before changing the public state.

Payment status is provider input until the API verifies the provider signature, maps the event to an internal
payment state, and applies an idempotent transition. The frontend may display status, but it cannot grant access,
mark an invitation paid, or publish an invitation. Provider payloads remain adapter input and are not the domain
model. See [`future-model.md`](../database/future-model.md) for design-only data decisions.

## When a service extraction is justified

Keep the modular monolith until there is measured evidence that an extraction solves a real problem. A service
boundary requires a human-approved decision based on one or more of:

- independent scaling or availability needs that cannot be met inside the monolith;
- a provider or workload with materially different security or operational ownership;
- a stable contract with clear data ownership and an acceptable consistency model;
- measured deployment, performance, or fault-isolation pressure; and
- an operational plan for observability, retries, local development, data migration, and on-call ownership.

Extraction is not justified by folder size, fashion, or an AI-generated architecture diagram.

## Explicit MVP non-goals

The MVP does not introduce microservices, CQRS, event sourcing, GraphQL, Kafka, Kubernetes, or a general-purpose
workflow engine. It also does not include an arbitrary Canva-style editor, custom domains, OAuth, multiple payment
providers, sophisticated analytics, queues, or native mobile applications. These are roadmap decisions, not hidden
commitments in the current runtime.
