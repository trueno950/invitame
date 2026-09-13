# Quality gates

This document is the practical Definition of Done for the current repository. The commands below reflect the
scripts that exist today; future CI/CD enforcement is deliberately labeled as planned.

## Definition of Done

A work unit is ready for human review when:

- the goal, scope, non-goals, affected paths, and rollback boundary are explicit;
- executable behavior, tests, and documentation agree, with current versus planned status labeled;
- tests prove acceptance criteria and failure paths rather than only executing lines;
- the applicable deterministic commands below pass with their real output;
- the complete diff has been read, including staged files and generated-file status;
- no secrets, local environment files, unapproved dependencies, or unrelated refactors are included; and
- blocked or unavailable checks are named with the exact reason and residual risk.

Passing local commands does not authorize commit, push, PR, merge, deploy, release, or external-service creation.
Those actions remain human-owned as described in `AGENTS.md` and `docs/development/git-workflow.md`.

## Current command matrix

| Gate | Command | Current meaning | When required |
| --- | --- | --- | --- |
| Format validation | `pnpm format:check` | Runs the repository Biome formatter through the existing validation script; keep the working tree unchanged and treat non-zero output as a gate failure. | Every change. |
| Format repair | `pnpm format` | Writes Biome formatting changes; this is a repair command, not evidence by itself. | Before validation when needed. |
| Lint | `pnpm lint` | Runs `biome lint .` through both workspace packages via Turborepo. | Every code or source-adjacent change. |
| Type safety | `pnpm typecheck` | Runs strict TypeScript checks in `apps/api` and `apps/web`. | Every TypeScript/config change. |
| Unit tests | `pnpm test` | Runs package test scripts exposed to Turborepo. Today `apps/api` runs the Node test runner health suite; `apps/web` has no test script. | Every behavior change; documentation-only changes may record `N/A`. |
| Build | `pnpm build` | Builds the API with `tsc` and the web app with Next.js. Outputs are ignored build artifacts. | Runtime, dependency, configuration, or build changes; recommended for broad docs/process changes. |
| Diff hygiene | `git diff --check` | Finds whitespace errors in the working diff. | Every change before review. |
| Start local PostgreSQL | `pnpm db:up` | Starts the local Docker Compose PostgreSQL service. | Database or integration verification. |
| Apply migrations and generate Prisma | `pnpm db:migrate` | Runs `prisma migrate deploy` and `prisma generate` for the API schema. | Schema/migration changes and database verification. |
| Seed | `pnpm db:seed` | Runs the API Prisma seed. Run it twice when checking idempotence. | Seed/catalog changes and database verification. |
| Database connection | `pnpm db:check` | Executes the API connection check and a real `SELECT 1`. | Database changes or any claim about database connectivity. |
| Stop local PostgreSQL | `pnpm db:down` | Stops the local Compose services. | After local database work when the environment is no longer needed. |

`.github/workflows/ci.yml` runs the format/lint/typecheck/test/build/diff-hygiene gates on every push and pull
request. The repository still has no dedicated coverage, integration, browser E2E, or migration-validation
automation. Do not report those gates as passing. Add the capability only as part of an approved work unit that
defines its scope and ownership.

## Recommended local sequences

### Source-only or documentation change

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

Run `pnpm build` when the change touches build configuration, package scripts, application source, or a broad
repository instruction that could affect source scanning. For documentation-only changes, explain if the build is
not run.

### Database or seed change

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:seed
pnpm db:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
pnpm db:down
```

The duplicate seed is intentional: it checks that the seed remains safe to repeat. A destructive migration needs
human approval, a recovery plan, and explicit verification before it is applied to any shared environment.

## Test pyramid and behavior coverage

Prefer the cheapest test that proves the boundary, then add a higher-level test when the lower level cannot prove
it:

1. **Static checks** — formatting, lint, and strict types catch deterministic shape and dependency mistakes.
2. **Unit tests** — pure domain rules and application orchestration with ports replaced by controlled test doubles.
   The current repository has only the API health behavior suite, which tests healthy and unavailable database
   paths through a mocked Prisma boundary.
3. **Integration tests** — real PostgreSQL, Prisma, migrations, constraints, transactions, and seed behavior.
   This layer is planned for the first persisted business workflows.
4. **End-to-end tests** — browser/API journeys across real trust boundaries. This layer is planned for authoring,
   publication, payment, and RSVP workflows.

There is no 100% coverage goal. Coverage is a diagnostic and, once a future suite exists, a guard against obvious
gaps; it is not a substitute for meaningful behavior tests. A test that always passes, asserts implementation
details, or cannot fail when the behavior breaks is not evidence.

### Critical behavior matrix

| Behavior | Current status | Evidence required when implemented |
| --- | --- | --- |
| Payments | Planned; no provider or payment model exists. | Unit tests for state transitions, integration tests for persistence/idempotency, and provider webhook tests with signature failure and replay cases. |
| Publication | Planned; no invitation runtime exists. | Application authorization tests, integration tests for state and `TemplateVersion`, and public-route E2E coverage for unpublished and published states. |
| Permissions | Planned; current API has no authentication flow. | Deny-by-default unit/application cases, API integration tests for ownership/roles, and E2E coverage for direct unauthorized requests. |
| RSVP | Planned; no guest or RSVP model exists. | Domain/application behavior tests, database uniqueness/transaction tests, and public journey tests for valid, duplicate, and expired responses. |
| Template snapshots | Foundation implemented. | Existing migration/seed evidence plus tests that future code references the immutable version rather than mutable template metadata. |

## Extra checks by change type

| Change | Additional evidence |
| --- | --- |
| Prisma schema or migration | Review normalized/JSONB decision, constraints and indexes; run migration, seed twice, connection check, build, and database integration tests when available. Never edit an applied migration. |
| Seed/catalog | Verify exact keys and relations, rerun the seed, and confirm no package/category/feature name selects executable behavior. |
| API endpoint or DTO | Test valid and invalid input, authorization failures, stable response/error mapping, and database behavior at the appropriate boundary. |
| Public route or renderer | Test unpublished/missing data, renderer allow-list failures, caching/query behavior, and the rendered public journey. |
| Payment, media, email, or provider | Verify trust/signature handling, idempotency, retries, bounded input, adapter isolation, and provider failure behavior without real credentials in tests. |
| Frontend interaction | Keep server-first rendering, test the user-visible outcome and failure state, and confirm the server remains the authority. |
| Dependency or build configuration | Explain why it is needed now, update the lockfile intentionally, run format/lint/typecheck/build, and document runtime impact. |
| Documentation/process | Check links and current/planned claims manually, run format/lint/typecheck/test as applicable, and use `git diff --check`. |

## Honest handling of blocked checks

If Docker, PostgreSQL, a browser, a provider sandbox, credentials, or another required service is unavailable:

1. run the checks that do not need it;
2. record the exact command that could not run;
3. state why it was unavailable and which risk remains unverified;
4. do not replace the missing boundary with a claim that a mock proves it; and
5. stop at the human approval boundary if the missing evidence is material to security, data, payment, or release.

## CI/CD status

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: `pnpm install --frozen-lockfile`,
Prisma client generation, `format:check`, `lint`, `typecheck`, `test`, `build`, and `git diff --check`, in that
order. It does not start PostgreSQL, so database/migration/seed verification stays a manual local gate (see the
database change sequence above). Required status checks, hosted integration databases, browser runners, and
deployment gates remain planned; adopt each through an explicit process change rather than assuming CI already
covers them.
