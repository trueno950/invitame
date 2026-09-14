# InvitaMe operating policy

This is the canonical concise policy for contributors and AI agents. It governs the current greenfield
foundation and the future product described in `ROADMAP.md`; a planned rule is not evidence that the feature
already exists.

## Authority and change boundaries

Humans own product scope, milestone boundaries, architecture approval, security decisions, acceptance of
destructive migration impact, external services, and commit, push, pull request, merge, deploy, and release
actions. AI may inspect, map, propose, and implement approved bounded work. AI must show exact evidence,
surface uncertainty, and stop at the human boundary rather than silently widening scope.

## Source-of-truth hierarchy

Resolve conflicts in this order:

1. Executable repository evidence: package scripts, TypeScript, tests, Prisma schema, migrations, seed data,
   environment examples, and generated behavior that is reproducible from source.
2. This file for contributor policy and non-negotiable boundaries.
3. `CONTEXT.md` for canonical product vocabulary only; it is not runtime evidence.
4. Accepted ADRs for architectural decisions.
5. Detailed architecture, database, development, and workflow documentation.
6. `ROADMAP.md` for planned scope and sequence; task prompts and prior memory are context, not runtime truth.

When sources conflict, do not guess or update runtime code to make prose appear correct. Report the conflict,
preserve the executable truth, ask for a decision when architecture or security is affected, and update the
smallest stale document after the decision. Documentation must label current behavior versus target design.

## Start and repeat the cycle

- Start with [`CLAUDE.md`](CLAUDE.md), then use [`docs/README.md`](docs/README.md) to choose the relevant sources.
- Execute the repeatable consultation, implementation, verification, documentation-sync, and handoff cycle in
  [`docs/architecture/ai-operating-model.md`](docs/architecture/ai-operating-model.md).
- Use [`CONTEXT.md`](CONTEXT.md) when a product term, boundary, or name is ambiguous; update it only for durable
  shared vocabulary.
- Use [`docs/development/quality-gates.md`](docs/development/quality-gates.md) for evidence and
  [`docs/development/git-workflow.md`](docs/development/git-workflow.md) for human-owned delivery actions.

## Language

Technical artifacts are written in English: code, identifiers, comments, tests, ADRs, documentation, issue
templates, commit messages, and review text. User-facing InvitaMe product copy remains neutral professional
Spanish. Do not translate technical policy into product copy or put product promises in a technical example.

## Architecture and dependency direction

- Keep a modular monolith in `apps/web` and `apps/api`. The runtimes communicate over REST; `apps/web` never
  connects to PostgreSQL or imports Prisma. The API owns persistence.
- Organize real API capabilities by feature module, not by a global controllers/services/models dump. The
  target module shape is documented in `docs/architecture/module-template.md`.
- Within a module, dependencies point inward: `presentation -> application -> domain`. Infrastructure implements
  application ports and points inward. Domain imports no framework, ORM, provider, or presentation; platform-neutral
  standard-library types are allowed when they do not introduce a runtime or transport dependency.
- Presentation handles transport and mapping only. Application owns use-case orchestration. Domain owns pure
  business invariants. Infrastructure owns Prisma, external clients, and technical adapters.
- A module must not import another module's internals. Cross-module collaboration uses a deliberate public
  port or application contract. Avoid circular dependencies and service-locator access.
- Do not create empty layers for the current `health`, bootstrap, or seed foundation. Add the full module shape
  when a capability has real business behavior, persistence, or an external boundary.

## Data and persistence

- PostgreSQL and Prisma migrations are owned by `apps/api`. Schema changes, migration execution, and seed
  behavior are API work; the web runtime never reaches the database directly.
- Keep identifiers, relationships, lifecycle state, prices, timestamps, slugs, and query-critical fields in
  normalized columns with database constraints and indexes. Use validated JSONB only for bounded, versioned,
  presentation or extension payloads whose shape is explicitly documented.
- `Template` contains mutable catalog metadata. `TemplateVersion` is an append-only snapshot of renderer
  identity (`componentKey`), schema, and configuration. Future invitations reference a `TemplateVersion`, never
  mutable template metadata. A snapshot is changed by creating a new version, not by rewriting old data.
- Feature keys are data-driven catalog records. Package names, category names, and feature keys must not select
  code paths; capability behavior belongs to an explicit contract and an allow-listed implementation.
- Destructive or irreversible migrations require human approval, a rollback or recovery plan, and explicit
  verification. Never edit an applied migration to hide a new schema change.

## API, frontend, and security rules

- Expose stable REST contracts from NestJS. Validate untrusted input at the API boundary with DTOs and the
  existing global validation configuration; authorize every protected action on the backend.
- Keep Next.js App Router server-first. Use client components only for actual browser interactivity, keep data
  fetching and authorization on trusted server boundaries, and never treat hidden UI or client state as a guard.
- Validate environment configuration at startup. Secrets belong in environment or approved secret storage, never
  in source, fixtures, logs, URLs, screenshots, generated output, or documentation examples.
- Log structured operational facts without passwords, tokens, payment details, or unnecessary personal data.
  An operational log is not an audit trail. Fail closed when trust, signature, authorization, or configuration is
  missing.
- Integrate payment, media, email, and other providers behind ports/adapters. Verify webhook signatures, persist
  idempotency keys, make side effects retry-safe, and do not let provider payloads become the domain model.
- Bound upload size, type, dimensions, storage lifetime, and ownership before accepting media. Store binaries in
  object storage when that capability is approved; do not put files in PostgreSQL rows.
- Do not invent authentication or cryptography. Use the approved library and have security-sensitive design
  decisions reviewed by a human before implementation.

## Testing and definition of done

- Tests prove observable behavior and failure paths; they do not merely exercise lines or implementation details.
  Keep unit tests close to pure domain/application behavior and add integration or end-to-end coverage when a
  real database, browser, permission boundary, payment, publication, or webhook is involved.
- A change is done only when scope and non-goals are clear, affected docs are current, tests cover the acceptance
  criteria, `pnpm docs:check`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `git diff --check`
  pass as applicable, and unavailable checks are recorded honestly. See `docs/development/quality-gates.md`.
- Use small vertical slices. Keep tests and documentation with the behavior they explain, avoid speculative
  dependencies, and do not pursue an unbounded AI task. Stop and split work when the acceptance boundary is no
  longer clear.

## Detailed references

- Product sequence: `ROADMAP.md`.
- Canonical product vocabulary: `CONTEXT.md`.
- Runtime and target architecture: `docs/architecture/overview.md`.
- AI workflow and handoffs: `docs/architecture/ai-operating-model.md`.
- Module shape: `docs/architecture/module-template.md`.
- Database invariants and future model: `docs/database/model.md`, `docs/database/future-model.md`.
- Anti-patterns: `docs/development/anti-patterns.md`.
- Verification: `docs/development/quality-gates.md`.
- Git changes: `docs/development/git-workflow.md`.
- Decision history: `docs/adr/`.
