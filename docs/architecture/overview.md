# Architecture overview

InvitaMe is a modular monolith with two independently runnable applications. The repository currently contains
only the foundation: catalog/version data, API configuration and health, Prisma ownership, and a small public
landing page. The module map and flows below describe the target product and are explicitly planned unless marked
implemented.

## Current versus target status

| Area | Current foundation | Target direction |
| --- | --- | --- |
| Web | `apps/web` is a Next.js 16 App Router landing page with Spanish product copy. | Dashboard, authoring flows, and public invitation routes. **Planned.** |
| API | `apps/api` has configuration, a global Prisma service, `GET /health`, and Better Auth mounted at `/api/auth` with customer sign-in by emailed code. | Feature modules exposing stable REST contracts; administrator sign-in, roles, and account status. **Planned.** |
| Database | PostgreSQL and Prisma own a minimal `User` foundation plus the catalog, packages, features, templates, and immutable template versions; authentication behavior is not implemented. | Invitation, guest, RSVP, payment, media, and analytics models. **Planned.** |
| Renderer | `TemplateVersion.componentKey` is persisted and protected as snapshot data. | An application-owned allow-listed renderer registry. **Planned.** |
| Operations | Local Docker Compose database and Mailpit mail catcher, workspace scripts, and limited GitHub Actions quality-gate CI; issue/PR governance is unmanaged. | CD, hosted deployment, observability, provider operations, and issue/PR enforcement. **Planned.** |

## Context and runtime map

```text
Browser
  ├── creator/dashboard traffic ──► apps/web (Next.js 16 App Router)
  └── public invitation traffic ──► apps/web

apps/web ── REST/JSON ──► apps/api (NestJS)
                              ├── Prisma ──► PostgreSQL
                              ├── email port ──► Resend (production) / Mailpit (local) / in-memory (test)
                              └── provider adapters ──► payment/media providers (planned)
```

`apps/web` never imports Prisma or connects to PostgreSQL. The API is the persistence boundary. Turborepo
orchestrates workspace tasks and caching; it does not create a shared domain package or a distributed runtime.

The current API tree is intentionally small:

```text
apps/api/src/
  auth/         Better Auth instance factory, integration registration, and sign-in code delivery
  config/       startup environment validation and the configuration module
  database/     Prisma module and service
  email/        email delivery port, retry/alert policy, and Resend, Mailpit, and in-memory adapters
  health/       database-backed health endpoint and tests
  app.module.ts Nest composition root
  app.setup.ts  shared app creation: body parser off, Helmet, CORS, validation, shutdown hooks
  main.ts       HTTP bootstrap through the shared app creation
```

### Authentication boundary (current)

This is the implemented state; administrator sign-in and role and account status enforcement are planned (ADR
0004). The abuse limits of ADR 0004 decision 7 for customer sign-in codes are current; see "Abuse limits" below.

- Better Auth runs inside the API through `@thallesp/nestjs-better-auth` and is mounted at `/api/auth`. It is
  built from validated configuration (`BETTER_AUTH_SECRET`, `AUTH_BASE_URL`, `CORS_ORIGIN`) and the shared Prisma
  client; the API refuses to start when any of them is missing or invalid.
- The integration's global guard denies every route by default. Public routes are marked explicitly with
  `@AllowAnonymous()`; today only `GET /health` is public. The guard resolves the session before it checks the
  marker, on every request.
- `CORS_ORIGIN` is the single trusted-origins list. The project owns CORS (`credentials: true`; methods `GET`,
  `HEAD`, `POST`, `OPTIONS`; headers `Accept`, `Content-Type`) for those origins only, and the same list feeds
  Better Auth's origin checks. The integration's own CORS is disabled, and origin checks stay on in every
  `NODE_ENV`.
- `createApp` in `app.setup.ts` is the single app-creation boundary for the runtime and integration tests; it
  disables NestJS's body parser, as Better Auth requires.

### Customer sign-in code (current)

This is the implemented state of ADR 0004 decisions 3 and 8 (as amended) for customers.

1. `POST /api/auth/email-otp/send-verification-otp` with `type: "sign-in"` stores a new 6-digit code that
   expires after 300 seconds, as a SHA-256 hash with an attempt counter, then calls the `SignInCodeSender` hook.
2. The hook returns at once for every address, so the response is always `200 {"success":true}`, whether the
   address is unknown, a customer, or an administrator, and whatever happens to the email.
3. In the background, `SignInCodeSender` first counts the request against the per-email cap; over the cap the
   issued code is removed unsent. It then looks up the role. An administrator receives no code and the issued
   code is removed. A customer's code goes through `EmailDeliveryService` in Spanish, with a random idempotency
   key per send, so retries reuse the same code and message.
4. When delivery still fails after the retries, exactly that code is removed, matched by its stored hash, so a
   newer code for the same address stays valid; the failure is not a wrong attempt.
5. `POST /api/auth/sign-in/email-otp` accepts the code; 3 wrong codes lock it (`403 TOO_MANY_ATTEMPTS`) and an
   expired code returns `400 OTP_EXPIRED`. The first sign-in creates a verified `CUSTOMER` and ignores a
   client-supplied `name`, `image`, and `role`.

The other OTP types (`email-verification`, `forget-password`) never send a message: their codes are deleted at
once for every address. Background tasks (`auth/sign-in-code/background-tasks.ts`) catch every failure and log
only a `background_task_failed` event with the task name, the failed stage (`quota`, `lookup`, `delivery`, or
`invalidation`), and the error class. When the cap check or the role lookup fails, the code is invalidated
before delivery. At most 100 deliveries wait per process; beyond that the code is discarded at once and a
`background_task_rejected` warning is logged. On shutdown, pending tasks drain in the sign-in module's
`onModuleDestroy`, which Nest runs before the global Prisma module disconnects. Nest closes the HTTP server only
after those hooks, so a request can still arrive during the drain: from the moment the drain starts, every new
task is refused with a `background_task_rejected_after_shutdown` warning, and the sender removes that code at
once, as it does at capacity, while pending tasks still complete. No log carries the code or the address.

### Abuse limits (current)

This is the implemented state of ADR 0004 decision 7 and S10, S19, and S25 for the code endpoints. Password
sign-in limits for administrators come with that sign-in and are planned.

- Better Auth's rate limiter runs in every `NODE_ENV` and stores its counters in the `RateLimit` table through
  the Prisma adapter (`auth/auth.factory.ts`); tests use the in-memory database adapter on the same path.
- `/email-otp/send-verification-otp` and `/sign-in/email-otp` allow 3 requests per 60 seconds per client IP;
  the 4th gets Better Auth's `429`. Other paths keep the defaults of Better Auth and its email OTP plugin, such
  as 100 requests per 10 seconds per client IP.
- Each address gets at most 5 codes per fixed hour (`auth/abuse-limits.ts`): the hour starts at the first counted
  code, later codes never move it, and the first request after it ends opens a new hour. Every `sign-in` request
  counts, whatever
  its delivery outcome, in the background task, so the response timing does not depend on the address. Over the
  cap the response is the same `200 {"success":true}`, no email is sent, and the issued code is removed. The
  count is a `RateLimit` row keyed by `sign-in-code-email|` plus the SHA-256 of the lower-cased address; the
  plain address is never stored. The row's `lastRequest` holds the hour's start, and a rule that matches no path
  sets Better Auth's pruning cutoff to one hour, so pruning never deletes these rows before the hour ends. A
  storage error while counting, other than a concurrent create of the same row, removes the code and is logged
  with the `quota` stage.
- The client IP comes from one configured header, `AUTH_CLIENT_IP_HEADER` (default `x-forwarded-for` outside
  production; required in production). Without `AUTH_TRUSTED_PROXIES`, only a single-address value is accepted;
  with it, trusted proxy hops are stripped from the right.
- In production, a request whose client IP cannot be resolved gets the generic `503` below and a
  `client_ip_unresolved` warning; it never shares one rate-limit bucket. Startup also fails when Better Auth's
  own environment would map unknown clients to `127.0.0.1`.
- When the rate-limit store fails, Better Auth throws before the endpoint runs. The wrapper in
  `auth/auth-request-guard.ts` returns `503 {"code":"SERVICE_UNAVAILABLE",...}` with no internal detail and
  logs an `auth_request_unavailable` warning with the path and error class only: no code row, no email.
- Limits are per database, shared by every API instance; the background-task cap is per process.

### Email delivery (current)

This is the implemented state; customer sign-in codes are its only caller (ADR 0004 decision 8).

- `email/application` owns the `EmailSender` port (DI token `EMAIL_SENDER`) and `EmailDeliveryService`, the only
  entry point for callers. `EmailModule` binds the port to the adapter selected by `EMAIL_TRANSPORT` and exports
  only the service.
- Transport: `resend` in production (required; any other value fails closed at startup, and `EMAIL_FROM` and
  `RESEND_API_KEY` are required), `mailpit` by default in development, and `memory` by default in test.
- Retries: only transient failures (network errors, 4 s timeouts, 429, 5xx, and Resend's in-progress idempotency
  conflict) are retried, 3 attempts in total with 250 ms and 500 ms backoff. Every attempt sends the same message
  and the same `Idempotency-Key`, so Resend delivers it at most once within its 24-hour key window. Other 4xx
  responses are permanent and not retried.
- Failures: callers receive only `EmailDeliveryUnavailableError`; the sign-in code sender invalidates the code
  and never surfaces the error in a response. A structured
  `email_delivery_failed` warning records attempts, reason, and the transient flag, never the recipient, subject,
  body, code, or key. Five failed deliveries within five minutes emit one error-level `email_delivery_degraded`
  event, the hook for an operational alert; it re-arms after a failure-free window. The counter is per process.

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
