# API module template

Use this structure only when a capability has real business behavior, persistence, or an external boundary. The
current `health`, bootstrap, database, and seed foundation stays simpler; empty layers are not a quality signal.

## Minimum structure

A module lives directly under `apps/api/src/<module>/`; there is no `modules/` folder. The current `users` and
`catalog` modules follow this shape. For a real capability such as the planned Invitations module:

```text
apps/api/src/invitations/
  invitations.module.ts
  domain/
    invitation.ts
    invitation.errors.ts
    invitation.repository.ts       # application-facing port owned by the module
  application/
    create-invitation.use-case.ts
    publish-invitation.use-case.ts
    invitation.application.types.ts
  infrastructure/
    prisma-invitation.repository.ts
    invitation.persistence.mapper.ts
  presentation/
    invitations.controller.ts
    dto/
      create-invitation.dto.ts
      publish-invitation.dto.ts
```

Names may change when the capability demands it, but the ownership must remain recognizable. Add a file because it
has a responsibility, not to satisfy a template mechanically.

## Layer responsibilities

| Layer | Responsibility | Examples for Invitations |
| --- | --- | --- |
| `domain` | Pure business invariants, value objects, state transitions, and domain errors. | A draft must reference an allowed `TemplateVersion`; an invitation cannot publish without required data. |
| `application` | Orchestrates a user-visible operation, coordinates ports, and translates authorization/business outcomes. | Create draft, update bounded render data, request publication, or load a public invitation. |
| `infrastructure` | Implements ports using Prisma, PostgreSQL, object storage, or providers; maps persistence records. | Prisma repository and transaction adapter. |
| `presentation` | Validates transport input, calls an application use case, and maps results/errors to REST responses. | Nest controller and DTOs with `class-validator` decorators. |

## Allowed imports

```text
presentation ──► application ──► domain
infrastructure ──implements application ports
infrastructure ──► domain/application contracts
```

| From | Allowed | Forbidden |
| --- | --- | --- |
| `domain` | Its own pure types and runtime primitives. | NestJS, Prisma, PostgreSQL, HTTP, React, application, infrastructure, presentation, and other module internals. |
| `application` | Its domain, its ports, and approved shared application contracts. | Prisma clients, provider SDKs, HTTP decorators, UI, and another module's internals. |
| `infrastructure` | Its application/domain ports, Prisma, and provider SDKs. | Presentation/UI and direct business policy that belongs in domain/application. |
| `presentation` | Its application use cases, DTOs, NestJS transport code, and response mappers. | Prisma queries, provider SDKs, and duplicated business rules. |

The module composition file is the wiring boundary. It binds concrete infrastructure adapters to application
ports and exposes only the controller or public provider needed by the API. Do not use a service locator to reach
another module.

## Ports and adapters

The application should depend on a narrow port that states what the use case needs, not on Prisma's generated
types or a provider response. The infrastructure adapter implements that port and translates between persistence,
provider, and domain representations.

For Invitations, a repository port may expose operations such as finding an invitation by owner and id, saving a
draft, or loading a published public view. It should not expose arbitrary query builders. A renderer registry is an
application-owned allow-list, not a database-provided module path; see [`overview.md`](overview.md).

Cross-module needs follow the same rule. If Invitations needs a user ownership check or package entitlement, it
consumes a deliberate public application contract from the owning capability. It does not import `Users` or
`Packages` repositories directly and does not query their tables to avoid their public API.

## DTO validation and transport mapping

DTOs belong at the presentation boundary. The controller accepts untrusted transport input, Nest's existing global
validation configuration rejects unknown or invalid fields, and the controller maps the validated input into an
application command. The application must validate domain invariants again when they cannot be expressed as a
transport constraint.

Responses should expose stable API contracts rather than Prisma records or provider payloads. Map domain errors to
intentional HTTP outcomes without returning stack traces, SQL details, tokens, or provider secrets.

## Transaction ownership

The application use case decides which business operation must be atomic. Infrastructure owns the actual Prisma
transaction lifecycle and supplies repositories or a unit-of-work adapter inside that boundary. Controllers never
open transactions, repositories do not start unrelated nested transactions, and a Prisma transaction client does
not cross into the domain as a domain type.

For example, creating an invitation may atomically persist the owner, selected `TemplateVersion`, normalized slug,
and validated render data if the product decision says those records must move together. A future payment flow may
use a separate idempotency boundary rather than pretending an external provider call can be part of a PostgreSQL
transaction. External side effects happen after the durable state transition or through an explicit retry/outbox
design approved for that milestone; do not invent an outbox for the MVP.

## Example Invitations slice

An initial vertical slice could be:

1. Define the invitation aggregate and its version-pinning invariant in `domain/`.
2. Define the smallest repository port and application command in `application/`.
3. Add DTO validation and a REST route in `presentation/`.
4. Implement the Prisma adapter and migration in `infrastructure`/`apps/api/prisma/` only after the data design is
   approved.
5. Test domain failure paths, application authorization, database constraints, and the API response at their real
   boundaries.
6. Document the public route and renderer behavior before calling the slice complete.

This does not imply that all future Invitation features belong in one use case. Split authoring, publication,
public rendering, and payment coordination into separate use cases as their invariants and trust boundaries differ.

## When a simpler folder is preferable

Keep a simpler shape when the code is infrastructure without business behavior, for example:

- `src/health/` for the current database-backed health contract and test;
- `src/config/` for startup environment parsing;
- `src/database/` for the Prisma module/service boundary; or
- `prisma/seed.ts` for deterministic catalog data.

When a folder gains a business invariant, persistence contract, authorization decision, or external provider, stop
growing the simple folder and convert the capability into a real feature module with a focused vertical slice.
