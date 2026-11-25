# Quality gates

This document is the practical Definition of Done for the current repository. The commands below reflect the
scripts that exist today. A narrow documentation consistency check and a limited quality-gate CI workflow are
implemented, and the three required status checks are enforced on `master` (see
[Required status checks on `master`](#required-status-checks-on-master)); CD and hosted deployment remain
planned.

## Definition of Done

A work unit is ready for human review when:

- the goal, scope, non-goals, affected paths, and rollback boundary are explicit;
- executable behavior, tests, and documentation agree, with current versus planned status labeled;
- tests prove acceptance criteria and failure paths rather than only executing lines;
- the applicable deterministic commands below pass with their real output;
- documentation links and AI workflow invariants pass `pnpm docs:check`;
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
| Documentation consistency | `pnpm docs:check` | Resolves local Markdown links, verifies required documentation entrypoints and workflow sections, and confirms CI invokes the check. It does not prove runtime behavior. | Every change; especially documentation, process, configuration, and CI changes. |
| Lint | `pnpm lint` | Runs `biome lint .` through both workspace packages via Turborepo. | Every code or source-adjacent change. |
| Type safety | `pnpm typecheck` | Runs strict TypeScript checks in `apps/api` (including the test harness in `apps/api/test`, which the build excludes) and `apps/web`. | Every TypeScript/config change. |
| Unit tests | `pnpm test` | Runs package test scripts exposed to Turborepo. Today `apps/api` runs the Node test runner over `src/**/*.spec.ts` (health, configuration, email, auth, and users suites) through `@swc-node/register`, which emits decorator metadata like the `tsc` build; `apps/web` runs the Node test runner over `lib/**/*.test.ts`, the browser harness's `e2e/**/*.test.ts`, and `proxy.test.ts` with Node's built-in TypeScript type stripping (erasable syntax only, no extra dependency). | Every behavior change; documentation-only changes may record `N/A`. |
| Database integration tests | `DATABASE_URL=<local URL> pnpm --filter @invitame/api test:db` | Runs `apps/api/src/**/*.db-spec.ts` through the same SWC runner against a real, already migrated PostgreSQL. The script refuses to start without an explicit `DATABASE_URL`, and the suite refuses non-local hosts. It writes and then deletes its own rows; use a disposable database. CI runs it in the `database-tests` job against a PostgreSQL 17 service. | Schema, migration, and auth persistence changes. |
| Browser end-to-end tests | `pnpm --filter @invitame/web test:e2e` | Runs `apps/web/e2e/**/*.spec.ts` with `@playwright/test` in Chromium only, against the built API (`apps/api/dist`) and the production build of the web (`next start`), which the harness starts on the dedicated ports 3410 (web) and 3411 (API), with its API gate on 3412, or `E2E_WEB_PORT`, `E2E_API_PORT`, and `E2E_GATE_PORT`. It needs `pnpm build`, Chromium from `pnpm --filter @invitame/web test:e2e:install`, and an explicit `E2E_DATABASE_URL` (migrated) and `E2E_MAILPIT_URL`; it refuses missing or non-local values and never attaches to a server that is already listening. It is not part of `pnpm test`. CI runs it in the `browser-tests` job. See [Browser end-to-end tests](#browser-end-to-end-tests). | Changes to the web pages, their forms, the web's `/api/auth` proxy, `proxy.ts`, the server-side API client, or the auth flows they drive. |
| Build | `pnpm build` | Builds the API with `tsc` and the web app with Next.js. Outputs are ignored build artifacts. | Runtime, dependency, configuration, or build changes; recommended for broad docs/process changes. |
| Diff hygiene | `git diff --check` | Finds whitespace errors in the working diff. | Every change before review. |
| CI gate coverage | `node scripts/check-ci-gates.mjs` | Reads this matrix and `.github/workflows/ci.yml` and fails when a documented gate has no declared CI step in the documented job, when a declared gate is no longer documented, when a gate declared local only (`pnpm db:up`, `pnpm db:down`, `pnpm format`) appears in any workflow `run:` step, when a required check's job `name:` changed, or when the required-check table below is emptied or loses one of its three rows; `--self-test` proves the guard fails on a fixture for each of those, and the declaration requires both the guard and its `--self-test` step, so deleting the self-test fails CI. It checks the workflow definition, not that a past run passed. | Every CI or quality-gate change. |
| Start local PostgreSQL | `pnpm db:up` | Starts the local Docker Compose PostgreSQL service. | Database or integration verification. |
| Apply migrations and generate Prisma | `pnpm db:migrate` | Runs `prisma migrate deploy` and `prisma generate` for the API schema. | Schema/migration changes and database verification. |
| Seed | `pnpm db:seed` | Runs the API Prisma seed. Run it twice when checking idempotence: the CI `database-tests` job runs it twice on the freshly migrated service database and fails when the second run changes a row count. | Seed/catalog changes and database verification. |
| Seed idempotence counts | `node scripts/check-seed-idempotence.mjs` | Records the row count of every table the catalog seed writes (`--record`) and fails when a second seed changed any of them (`--verify`), against the already migrated `DATABASE_URL`. It proves the second run created nothing; it does not inspect what the rows contain. CI runs both modes around the second seed in the `database-tests` job. | Seed/catalog changes, and every CI or quality-gate change. |
| Database connection | `pnpm db:check` | Executes the API connection check and a real `SELECT 1`. CI runs it in the `database-tests` job before `test:db`. | Database changes or any claim about database connectivity. |
| Stop local PostgreSQL | `pnpm db:down` | Stops the local Compose services. | After local database work when the environment is no longer needed. |

`.github/workflows/ci.yml` runs the CI gate coverage guard and its self-test, the documentation consistency,
format/lint/typecheck/test/build/diff-hygiene gates on pushes to `master` and `main` and on pull requests, a
separate `database-tests` job that applies the migrations to an empty disposable PostgreSQL 17 service, runs
`db:check`, `test:db`, and then the seed twice, failing when the second run changes the row count of any table the
seed writes, and a `browser-tests` job that runs the browser end-to-end suite against PostgreSQL 17 and Mailpit
services. This is a limited quality workflow,
not CD or hosted deployment. The repository still has no coverage threshold, and the browser suite covers only
the customer and administrator flows listed below. Do not report those gaps as passing. Add the capability only
as part of an approved work unit that defines its scope and ownership.

## Recommended local sequences

### Source-only or documentation change

```bash
pnpm docs:check
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
node scripts/check-seed-idempotence.mjs --record
pnpm db:seed
node scripts/check-seed-idempotence.mjs --verify
pnpm db:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
pnpm db:down
```

The duplicate seed is intentional: it checks that the seed remains safe to repeat, and the counts recorded between
the two runs make the second run prove it created nothing instead of only proving it exited 0. A destructive
migration needs human approval, a recovery plan, and explicit verification before it is applied to any shared
environment.

### Browser end-to-end tests

The suite in `apps/web/e2e` drives Chromium through the customer pages (M2 T9b part A): sign-in by emailed code
at `/ingresar`, the own account at `/cuenta`, and sign-out, including a wrong code, the per-client attempt limit,
an invalid address, a visit to `/cuenta` without a cookie, and a replayed session cookie after sign-out. It also
drives the administrator pages (part B): enrollment at `/admin/activar` with the setup key read below the QR code
and the backup codes shown once, sign-in at `/admin/ingresar` with the password and then the app's code or a
backup code, the panel at `/admin`, sign-out with a replayed cookie, the routing of anonymous visitors, customers,
and pending and enrolled administrators, and the failure messages of each step. Sign-out is one click on the
enabled «Cerrar sesión» with exactly one `POST /api/auth/sign-out` (M2 T8e). With JavaScript disabled
(`e2e/form-submission.spec.ts`, T8e; S42), it fills `/admin/ingresar`, `/admin/activar` (with a pending
administrator's session), and `/ingresar`, tries to submit each by a click and by Enter, and proves that no
request carries a field value in its URL, that the page URL keeps no query string, and that the form shows its
line asking for JavaScript; a failure names the query keys only, never their values. The same file shows that
the submit buttons stay disabled in the server's render and are enabled once the page is interactive, and that
the disabled sign-out button on `/cuenta` and `/admin` shows its line asking for JavaScript (T9b part C2). The browser talks only to the
web origin; the web proxies `/api/auth` to the real API and reads `GET /me` and `get-session` from its server,
and the API stores users and sessions in PostgreSQL.

How the harness is composed (`apps/web/playwright.config.ts`, `apps/web/e2e/support/`):

- Playwright starts the API with `node dist/main.js` in development mode and the web with `next start` in
  production mode, passing every setting explicitly. Both servers still load their env files at startup: the API
  reads `apps/api/.env` (`apps/api/src/config/config.module.ts`) and Next.js reads `apps/web/.env*`. A process
  variable takes precedence over a file value, and the harness sets every variable the servers validate, empty
  when unused, so a developer's env files cannot change a validated setting; a variable the servers do not
  validate could still come from those files. The API secret and the web-to-API
  proxy secret are random per run and exist only in the two server processes; nothing is committed.
- The API sends each code through its existing `mailpit` email provider, and the tests read it through Mailpit's
  HTTP API. Production code has no test endpoint, flag, branch, or log (S38).
- Each administrator test that needs an administrator creates its own pending administrator with the
  harness-only script
  `apps/api/test/create-e2e-administrator.ts`, which runs the same use case, repository, and Better Auth hasher
  as `admin:create` against `E2E_DATABASE_URL` (refused when missing or not local) and hands the initial
  password to the test. The TOTP codes come from the setup key the test reads on `/admin/activar` (S41), computed
  with RFC 6238 in `e2e/support/totp.ts`; the backup codes come from the page's last step.
- The web reaches the API through a harness-only gate (`e2e/support/api-gate-server.ts`), started as a third
  server by `e2e/support/api-gate-main.ts`, which forwards every request unchanged and breaks off the web's
  request when the API's answer breaks off. A test can ask it to hold the web's `GET /me` reads of two
  session cookies until both are in flight and then release them together, so "shows each customer only their
  own account when two customers browse at once" proves that the shared API client keeps each request's cookie
  while both renders overlap; the hold reports `timeout` and the test fails when they do not. The gate never
  sees a browser request, and production code knows nothing of it (S38).
- The browser sends a per-test client IP in `x-e2e-edge-client-ip`, standing in for the platform edge header
  the web requires in production; each test also uses its own email address, so rate limits never couple two
  tests. No test sleeps for a fixed time, and failed tests are not retried.
- Test output goes to `apps/web/test-results` (ignored), or to `E2E_OUTPUT_DIR` when it is set: a screenshot and
  a trace of each failed test only. CI uploads that folder as the `browser-test-failures` artifact (1 day) when
  the job fails; the servers' output is in the job log. A trace records the browser's requests and responses,
  so it can hold that run's test addresses, initial passwords, sign-in codes, TOTP setup keys, backup codes, and
  session cookies; they work only against the job's database, which ends with the job.
- `pnpm --filter @invitame/web test` also runs the harness's own unit tests (`e2e/**/*.test.ts`), which the
  browser suite never collects: the refusal of a missing or remote `E2E_DATABASE_URL` or `E2E_MAILPIT_URL`, the
  administrator script's refusal of no argument (exit 2) and of a missing or non-local `DATABASE_URL` (exit 1,
  before Prisma loads, with no password printed), the gate's handling of a broken API answer, and the TOTP
  helper against the RFC test vectors.

Run it locally against disposable containers on free ports, never against the development database or mail
catcher:

```bash
pnpm --filter @invitame/api prisma:generate
pnpm build
pnpm --filter @invitame/web test:e2e:install   # once: Chromium inside node_modules
docker run --rm -d --name invitame-e2e-postgres -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=invitame_e2e -p 127.0.0.1::5432 postgres:17-alpine
docker run --rm -d --name invitame-e2e-mailpit -p 127.0.0.1::8025 axllent/mailpit:v1.33.0
export E2E_DATABASE_URL="postgresql://postgres@$(docker port invitame-e2e-postgres 5432)/invitame_e2e"
export E2E_MAILPIT_URL="http://$(docker port invitame-e2e-mailpit 8025)"
until docker exec invitame-e2e-postgres pg_isready -U postgres -d invitame_e2e; do sleep 1; done
DATABASE_URL="$E2E_DATABASE_URL" pnpm --filter @invitame/api prisma:migrate:deploy
pnpm --filter @invitame/web test:e2e
docker stop invitame-e2e-postgres invitame-e2e-mailpit
```

The containers listen only on `127.0.0.1` and are removed when stopped. The harness serves the built output, so
run `pnpm build` again after changing either app. Both installs keep Chromium in `node_modules`
(`PLAYWRIGHT_BROWSERS_PATH=0`) rather than in a user-wide cache.

## Test pyramid and behavior coverage

Prefer the cheapest test that proves the boundary, then add a higher-level test when the lower level cannot prove
it:

1. **Static checks** — formatting, lint, and strict types catch deterministic shape and dependency mistakes.
2. **Unit tests** — pure domain rules and application orchestration with ports replaced by controlled test doubles.
   `pnpm test` runs them: the API's `src/**/*.spec.ts` suites (health, configuration, email, auth, and users;
   the auth suites run Better Auth on its in-memory adapter) and the web's `*.test.ts` suites for its pages'
   logic, server modules, theme, and browser harness.
3. **Integration tests** — real PostgreSQL, Prisma, migrations, constraints, transactions, and seed behavior.
   The `*.db-spec.ts` suites cover authentication, sessions, and the own profile; every ADR 0004 test obligation
   maps to a named assertion in [ADR 0004 test traceability](adr-0004-test-traceability.md).
4. **End-to-end tests** — browser/API journeys across real trust boundaries. The `apps/web/e2e` suite covers the
   customer and administrator sign-in, account, enrollment, and sign-out journeys (see
   [Browser end-to-end tests](#browser-end-to-end-tests)), the invitation editor, and the publication journey
   (publish, guest view, unpublish, unknown slug); browser journeys for payment and RSVP are not written yet.

There is no 100% coverage goal. Coverage is a diagnostic and, once a future suite exists, a guard against obvious
gaps; it is not a substitute for meaningful behavior tests. A test that always passes, asserts implementation
details, or cannot fail when the behavior breaks is not evidence.

### Critical behavior matrix

| Behavior | Current status | Evidence required when implemented |
| --- | --- | --- |
| Payments | Implemented (Milestone 7): provider-neutral payments with a Mercado Pago adapter, signed webhooks, and the refund rule; unit, application, controller, and adapter specs under `apps/api/src/payments`. No browser journey yet; the sandbox pass waits on owner credentials. | Unit tests for state transitions, integration tests for persistence/idempotency, and provider webhook tests with signature failure and replay cases. |
| Publication | Implemented (Milestone 5): publish and unpublish with readiness checks and the public `/i/<slug>` runtime; domain specs and the `apps/web/e2e/public-invitation.spec.ts` journey. | Application authorization tests, integration tests for state and `TemplateVersion`, and public-route E2E coverage for unpublished and published states. |
| Permissions | Identity and own-profile authorization implemented (Milestone 2); see [ADR 0004 test traceability](adr-0004-test-traceability.md). Browser E2E covers the customer session and the administrator enrollment, sign-in, panel, and sign-out. | Deny-by-default unit/application cases, API integration tests for ownership/roles, and E2E coverage for direct unauthorized requests. |
| RSVP | Implemented (Milestone 6): open RSVP for packages with `RSVP`, the guest list, and CSV export; domain and application specs under `apps/api/src/invitations`. No browser journey yet, and expired responses wait on the expiration rule. | Domain/application behavior tests, database uniqueness/transaction tests, and public journey tests for valid, duplicate, and expired responses. |
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
| Documentation/process | Run `pnpm docs:check`, check current/planned claims, run format/lint/typecheck/test as applicable, and use `git diff --check`. |

## Honest handling of blocked checks

If Docker, PostgreSQL, a browser, a provider sandbox, credentials, or another required service is unavailable:

1. run the checks that do not need it;
2. record the exact command that could not run;
3. state why it was unavailable and which risk remains unverified;
4. do not replace the missing boundary with a claim that a mock proves it; and
5. stop at the human approval boundary if the missing evidence is material to security, data, payment, or release.

## CI/CD status

The repository has a limited quality-gate CI workflow. It runs on pushes to `master` and `main` and every pull
request. The `quality-gates` job (check name `Quality gates`) installs with `--frozen-lockfile`, then runs the CI
gate coverage guard and its self-test, `docs:check`, Prisma client generation, `format:check`, `lint`,
`typecheck`, `test`, `build`, and `git diff --check`, in that order. The `database-tests` job (check name
`Database tests`) starts an empty PostgreSQL 17 service with trust authentication (no password in the workflow),
generates the Prisma client, applies every migration to that empty database, runs `pnpm db:check`
(`prisma:check`, a real `SELECT 1`), runs `test:db`, and then runs `pnpm db:seed` twice. Between the two runs
`node scripts/check-seed-idempotence.mjs --record` stores the row count of each of the six tables the catalog seed
writes (`Category`, `Feature`, `Package`, `PackageFeature`, `Template`, `TemplateVersion`; the list lives in
`SEEDED_MODELS` in that script), and `… --verify` after the second run fails when any count changed, naming the
table with its before and after count. The script reads the counts through the Prisma client the job already
generated, so it needs no SQL client on the runner, and it never writes to the database. The second run must create
nothing and must not fail, which is the seed-idempotence proof the local database sequence asks for; the counts
make that visible in the job log instead of resting on an exit code alone. The seed runs after `test:db` so the
seeded catalog rows cannot change what the integration suites observe. The `browser-tests`
job (check name `Browser tests`) starts PostgreSQL 17 (trust authentication) and Mailpit
(`axllent/mailpit:v1.33.0`) services,
generates the Prisma client, applies the migrations, runs `pnpm build`, installs Chromium only with its system
dependencies (`test:e2e:install --with-deps`), runs `test:e2e` with two workers, and uploads the failed tests'
screenshots and traces for one day when it fails.

`pnpm db:up` and `pnpm db:down` stay local only: they drive the developer's Docker Compose database, while CI
starts its own service container per job. `pnpm format` is a repair command and is never evidence.

### Required status checks on `master`

Branch protection on `master` requires these three status checks, and their names are the job `name:` values in
`.github/workflows/ci.yml`, so renaming a job detaches protection from it (the CI gate coverage guard fails first):

| Required check | Job | Covers |
| --- | --- | --- |
| Quality gates | `quality-gates` | The static gates, tests, build, diff hygiene, and the CI gate coverage guard. |
| Database tests | `database-tests` | Migrations on an empty database, `db:check`, `test:db`, and the seed run twice. |
| Browser tests | `browser-tests` | The Chromium end-to-end suite against PostgreSQL and Mailpit. |

The protection is configured by the repository owner on `master` only: `strict: false` (a pull request need not be
up to date with `master` before merging, so chained pull requests merge after each retarget without a forced
update), no required review (single owner), no force push, no deletion, and `enforce_admins: false`. How to read
it and how to change it is documented in [`git-workflow.md`](git-workflow.md#8-required-status-checks-and-branch-protection).
Hosted integration databases, CD, and deployment gates remain planned; adopt each through an explicit process
change rather than assuming the limited CI workflow already covers them.
