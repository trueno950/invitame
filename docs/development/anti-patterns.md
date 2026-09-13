# InvitaMe anti-patterns

These are review rules for the product and its AI-assisted development process. Each item names the failure mode
and the smaller, safer alternative. A future exception needs a written reason and human approval when it affects
architecture, security, data, or delivery.

## Architecture

| # | Anti-pattern | Why it is harmful | Preferred alternative |
| ---: | --- | --- | --- |
| 1 | A global `controllers/services/models` dump | Product boundaries disappear, so a change crosses unrelated code and AI agents place new behavior inconsistently. | Organize real capabilities by feature module and keep each module's layers local. |
| 2 | A module importing another module's internals | It creates hidden coupling and makes extraction, testing, and ownership unclear. | Depend on a deliberate public application port or contract. |
| 3 | A god service | One class becomes the hidden owner of unrelated business rules, persistence, providers, and authorization. | Split by use case and keep orchestration in application services. |
| 4 | Controllers or components containing business logic | HTTP or JSX details become the only place where invariants are enforced and are difficult to test or reuse. | Keep transport/rendering in presentation and put invariants in domain/application code. |
| 5 | Cross-runtime database access | If `apps/web` reaches PostgreSQL, authorization and persistence boundaries can be bypassed and the API contract becomes meaningless. | Route web requests through the REST API; let `apps/api` own Prisma. |
| 6 | Framework or ORM imports in domain code | Pure business rules become coupled to NestJS, Prisma, React, or transport concerns. | Use pure domain code and ports implemented by infrastructure. |
| 7 | Creating empty layers for every current folder | Ceremony hides the small foundation and creates files with no behavior to protect. | Use a simpler folder for bootstrap, health, and seed code; introduce full layers when a real capability exists. |
| 7.1 | Explicit `any` in TypeScript | It disables strictness at the exact boundary where generated code most needs review and can hide invalid data flows. | Use a precise type, a generic, or `unknown` with a type guard. |

## Data and rendering

| # | Anti-pattern | Why it is harmful | Preferred alternative |
| ---: | --- | --- | --- |
| 8 | Branching behavior on package, category, or feature names | Renaming catalog data silently changes code behavior and creates an untracked product API. | Use explicit capability contracts and allow-listed implementations; keep keys as data. |
| 9 | Attaching invitations to mutable `Template` metadata | Editing a catalog record can change an already purchased or published invitation. | Store an immutable `TemplateVersion` reference on each invitation. |
| 10 | JSONB-everything | Constraints, indexes, relationships, and safe migrations disappear into opaque blobs. | Normalize identifiers, relationships, lifecycle, money, slugs, timestamps, and query-critical fields; validate bounded JSONB. |
| 11 | Storing binaries in PostgreSQL | Large objects increase backup, query, and retention costs and do not fit the intended media boundary. | Store media in approved object storage and persist ownership and metadata in normalized columns. |
| 12 | Dynamic code in the database | Evaluating a DB value as code turns catalog data into a code-execution and deployment boundary. | Persist an opaque `componentKey` and resolve it through a reviewed application registry. |
| 13 | N+1 queries during public rendering | A popular invitation can multiply database work per guest, section, or asset and degrade the public surface. | Design the read model deliberately, fetch bounded data in batches, and verify query behavior with integration tests. |
| 14 | Reading current package price after checkout | A later catalog edit can change the meaning of a completed payment or receipt. | Snapshot amount and currency at checkout and use the payment snapshot for settlement and display. |

## Security and providers

| # | Anti-pattern | Why it is harmful | Preferred alternative |
| ---: | --- | --- | --- |
| 15 | Trusting the frontend for payment or publication | A browser can be modified or call the API directly; UI state is not authorization or payment evidence. | Verify ownership, authorization, payment state, and completeness on the backend. |
| 16 | Homemade authentication or cryptography | Small mistakes in session, password, token, or key handling become account compromise. | Use the approved security library and obtain human review for security-sensitive design. |
| 17 | Missing backend validation or authorization | A valid-looking UI request can still carry malformed or unauthorized data. | Validate DTOs at the API boundary and authorize every protected action server-side. |
| 18 | Accepting unverified webhooks | An attacker can forge a provider event and grant access, mark payment complete, or trigger side effects. | Verify signatures, reject missing trust material, and map only verified events. |
| 19 | Non-idempotent payment or provider side effects | Retries and duplicate deliveries can charge, publish, email, or provision twice. | Persist an idempotency key, enforce uniqueness, and make the transition retry-safe. |
| 20 | Unbounded uploads | Large, malformed, or unexpected files can exhaust resources or create unsafe public content. | Bound size, type, dimensions, ownership, lifetime, and storage location before acceptance. |
| 21 | Leaking secrets or sensitive data | Tokens, credentials, payment details, and personal data become visible in logs, diffs, URLs, fixtures, or screenshots. | Keep secrets in approved environment storage and log only the minimum operational identifiers. |
| 22 | Coupling domain behavior directly to a provider SDK | Provider types and outages spread through the product and make replacement or deterministic tests expensive. | Define a narrow port and isolate the provider in an infrastructure adapter. |

## Frontend and product scope

| # | Anti-pattern | Why it is harmful | Preferred alternative |
| ---: | --- | --- | --- |
| 23 | Building an arbitrary Canva-style editor in the MVP | An unconstrained editor creates a second product: complex layout, persistence, validation, compatibility, and support work. | Start with approved renderer contracts, bounded form data, and a small allow-listed catalog. |
| 24 | Making every component a client component | It increases JavaScript, weakens server trust boundaries, and makes data fetching harder to reason about. | Use App Router server components by default; add client code only for real browser interaction. |
| 25 | Treating hidden UI or client state as a guard | Users can bypass presentation and call the REST API directly. | Treat the backend as the security boundary and test denied requests. |
| 26 | Shipping product promises before the workflow exists | Marketing copy, routes, or buttons can imply payments, publishing, or delivery that the system cannot honor. | Label planned material clearly and keep current product copy honest about the foundation. |

## AI-assisted development

| # | Anti-pattern | Why it is harmful | Preferred alternative |
| ---: | --- | --- | --- |
| 27 | Giant AI-generated diffs | Reviewers cannot reconstruct intent, and unrelated regressions hide inside volume. | Use small vertical slices, explicit non-goals, focused diffs, and work-unit boundaries. |
| 28 | Drive-by refactors | Unrequested cleanup expands risk and makes rollback or verification ambiguous. | Preserve unrelated code and propose a separate bounded work unit. |
| 29 | Inventing runtime claims from target architecture | Future modules, CI, providers, or security controls can be mistaken for implemented behavior. | Verify executable evidence and label current versus planned content. |
| 30 | Treating memory or a prior prompt as runtime truth | Historical context can be stale or scoped to a different decision. | Verify current code, tests, schema, migrations, and scripts before relying on memory. |
| 31 | Fake green checks | A skipped, mocked-away, or always-passing test creates confidence without proving behavior. | Confirm the check ran, test failure paths, and record unavailable verification honestly. |
| 32 | Delegating without a boundary | An explorer or writer can silently widen scope or introduce architecture the human did not approve. | Give every handoff goal, scope, non-goals, paths, acceptance criteria, commands, and rollback. |

## Git and repository operations

| # | Anti-pattern | Why it is harmful | Preferred alternative |
| ---: | --- | --- | --- |
| 33 | Committing generated output or secrets | Build artifacts and credentials pollute history and can be difficult or impossible to remove safely. | Use `.gitignore`, inspect the staged file list, and commit source plus intentional docs only. |
| 34 | Staging the repository with `git add .` blindly | Unrelated work, local files, generated output, and secrets can enter the change unnoticed. | Stage named paths and read the complete staged diff. |
| 35 | Force-pushing or rewriting a shared branch | Other work disappears or review references become unreliable. | Push normal history, coordinate branch ownership, and use a new corrective commit when needed. |
| 36 | Committing directly to `main` | It bypasses review, makes rollback less clear, and conflicts with the human approval boundary. | Work on a named branch and prepare a focused PR. |
| 37 | Adding an AI-authorship trailer | It changes repository history without adding technical evidence and may conflict with project conventions. | Use the normal conventional commit format with no AI attribution trailer. |
| 38 | Merging, releasing, or deploying after local checks alone | Local checks cannot establish human product approval, environment safety, or operational readiness. | Require the documented evidence, human approval, and the appropriate release/deploy procedure. |

## Operations and change safety

| # | Anti-pattern | Why it is harmful | Preferred alternative |
| ---: | --- | --- | --- |
| 39 | Creating an external service as a shortcut | Credentials, costs, ownership, and data retention become real before the product decision exists. | Surface the need, document the boundary, and wait for explicit human approval. |
| 40 | Editing an applied migration to hide a new change | Existing environments no longer have a reproducible history and rollback becomes unreliable. | Add a new migration, assess destructive impact, and obtain approval before applying it. |
| 41 | Calling a provider from a controller or UI | Retries, trust verification, and failure handling become scattered and untestable. | Use an application port and an infrastructure adapter with explicit retry/idempotency policy. |
| 42 | Calling unavailable infrastructure “tested” | A passing local unit test does not prove PostgreSQL, storage, payment, or publication behavior. | Name the missing boundary, run the closest safe check, and leave the residual risk visible. |
