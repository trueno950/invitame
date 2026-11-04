# Milestone 2 — Identity, ownership, and authorization

Task brief and tracking for Milestone 2 on branch `feat/m2-identity`, implementing the accepted
[ADR 0004](../../docs/adr/0004-authentication-with-better-auth.md). Status: T1 (`ebabb0d`) and T1b (`71ae169`) committed; T2 done (L15), awaiting migration review, chain strategy,
and commit approval.
Commits need explicit human approval (repository policy); push, pull request, and merge stay human decisions.

| Field | Answer |
| --- | --- |
| Goal | ROADMAP outcome: "Give creators a verified account and a backend-enforced ownership model for their catalog and invitations." |
| Request type | Security (authentication), data/schema, and configuration. |
| Risk | High: authentication, the trust boundary between `apps/web` and `apps/api`, new dependencies, and a schema migration. |
| Scope | `apps/api` auth module, Prisma schema with one new migration, environment validation, CORS, email port and adapters; `apps/web` sign-in pages and session forwarding; a local mail catcher in Docker Compose; related documentation. |
| Non-goals | S3, plus: invitation authoring, payments, media, a production Resend account, Railway deployment, domain purchase, push, pull request, and merge. |
| Affected boundary | Runtime (API and web), data (new tables and `User` columns), trust (sessions, cookies, CORS), and dependencies. |
| Acceptance criteria | Every spec below holds and is proven by the task that owns it. |
| Verification | `pnpm docs:check`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`; the database gate (`db:up`, `db:migrate`, seed twice, `db:check`); integration tests against real PostgreSQL; native review per work unit; independent verification for security units. |
| Rollback | Each task is one work-unit commit on this branch and can be reverted alone. The T2 migration is additive; once applied to a shared database, it is undone only by a new migration, never by editing it. |
| Human decisions | Commit approval per unit, T2 migration review, T11 security sign-off, and the domain name (not blocking). |
| Delivery | Review slices of about 400 authored lines. Slice 1 is T1 and T1b (`ebabb0d`, `71ae169`; 407 lines). The chain strategy, stacked pull requests to `master` or a feature-branch chain with a tracker, is a pending human decision (L14). |

## Specs

Cited documents are authoritative; read them in full. S14 to S31 come from the two native reviews of ADR 0004, which
exposed only ID, severity, and location: each reading is ours and is confirmed by the task that resolves it.

- **S1** ROADMAP Milestone 2 key scope, verbatim: "authentication and session lifecycle with Better Auth, as decided
  in ADR 0004; user profile and account status behavior; API authorization policy for creator-owned resources and
  administrative actions; secure session boundaries between `apps/web` and `apps/api`; and unit/integration tests for
  denied access, ownership, and session failure paths."
- **S2** ROADMAP Milestone 2 exit criteria, verbatim: "Protected API actions deny unauthenticated and unauthorized
  requests regardless of UI state." "User ownership is represented by normalized relations and database
  constraints." "Secret handling, session expiry, and error mapping have human-approved security evidence."
- **S3** ROADMAP Milestone 2 non-goals, verbatim: "No OAuth, social login, custom domains, multi-organization billing,
  or invitation authoring is included."
- **S4** ADR 0004 decision 1, Library, including the fallback.
- **S5** ADR 0004 decision 2, Persistence.
- **S6** ADR 0004 decision 3, Sign-in, including the administrator enrollment gate.
- **S7** ADR 0004 decision 4, Sessions and hosting.
- **S8** ADR 0004 decision 5, Origins.
- **S9** ADR 0004 decision 6, Authorization.
- **S10** ADR 0004 decision 7, Abuse limits.
- **S11** ADR 0004 decision 8, Email delivery.
- **S12** ADR 0004 decision 9, Configuration.
- **S13** ADR 0004 consequences: the spike comes first, the `User` migration gets human review, and the listed
  integration tests exist.
- **S14** First review R1-001 (risk, SUGGESTION): scope the session cookie as narrowly as possible, and never serve
  untrusted content from a host that receives it.
- **S15** First review R2-001 (readability, SUGGESTION): concrete values for code expiry and attempt limits.
- **S16** First review R2-002 (readability, SUGGESTION): the exact cookie name, `Domain`, and lifetime.
- **S17** R3-adr-test-coverage-gaps (reliability, WARNING): tests beyond the ADR minimum, such as untrusted origins,
  disabled password sign-up, a client-supplied role, and enumeration-safe responses.
- **S18** R3-disable-revocation-cache (reliability, SUGGESTION): disabling a user takes effect on the next request; no
  session cache keeps a revoked session valid.
- **S19** R4-ratelimit-store-failure-mode (resilience, SUGGESTION): sign-in fails closed when the rate-limit store
  fails.
- **S20** Second review R1-001 (risk, SUGGESTION): bound the pre-enrollment window of a new administrator (initial
  password strength and lifetime).
- **S21** R2-ambiguous-pronoun-enrollment-gate (readability, WARNING): state unambiguously what a pre-enrollment
  administrator account can and cannot do.
- **S22** R3-enrollment-gate-email-otp (reliability, WARNING): email OTP sign-in is rejected for administrator
  accounts in every enrollment state.
- **S23** R3-send-failure-code-lifecycle (reliability, WARNING): what happens to a code whose email failed, and how it
  counts against attempts.
- **S24** R3-send-failure-enumeration (reliability, WARNING): send-failure responses are identical for new, existing,
  and administrator emails; an administrator email gets the same response as a customer email.
- **S25** R4-send-failure-rate-limit-interaction (resilience, WARNING): send failures neither lock customers out
  through rate limits nor open an abuse path.
- **S26** R2-duplicated-logging-rule (readability, SUGGESTION): a single logging rule in the ADR.
- **S27** R2-unexplained-native-review-reference (readability, SUGGESTION): explain the native-review reference in
  the ADR status.
- **S28** R2-unquantified-retry-and-alert-thresholds (readability, SUGGESTION): concrete retry count and backoff.
- **S29** R3-alert-threshold-undefined (reliability, SUGGESTION): a concrete alert threshold for repeated send
  failures.
- **S30** R3-test-obligations-unasserted (reliability, SUGGESTION): every ADR test obligation maps to a named
  assertion.
- **S31** R4-provider-retry-duplicate-delivery (resilience, SUGGESTION): retries avoid duplicate delivery where the
  provider supports idempotency.
- **S32** (L11) DTO validation runs under `pnpm dev` and `pnpm test`: the development and test runners emit decorator
  metadata, so the global `ValidationPipe` receives DTO types without workarounds.
- **S33** (L11) Biome accepts NestJS parameter decorators such as `@Body()`.
- **S34** (L11) The root `engines.node` floor is at least the integration's `>=22.22.1`.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Spike: Better Auth through `@thallesp/nestjs-better-auth` on NestJS 12 with the body parser disabled; prove the auth handler, JSON parsing, and the global `ValidationPipe`; decide integration or fallback. | S4, S13 | worker | `ebabb0d` |
| T1b | Tooling: a dev and test runner that emits decorator metadata, Biome parameter decorators, and the Node engines floor; remove the spike test's workarounds and clarify its intent. | S32, S33, S34 | worker | `71ae169` |
| T2 | Schema: map Better Auth's user onto `User`; add session, account, verification, and two-factor models and a server-side role; one additive migration; database gate; human migration review. | S2, S5, S13 | inline | — |
| T3 | Configuration and origins: validate the auth secret, public base URL, and trusted origins at startup; credentialed CORS only for trusted origins, shared with Better Auth. | S8, S12 | inline | — |
| T4 | Email port: application port, in-memory test adapter, Resend adapter, local mail catcher; bounded retries and failure handling. | S11, S23, S28, S29, S31 | inline | — |
| T5 | Customer sign-in: email OTP with concrete expiry and attempt limits, enumeration-safe responses, persistent rate limiting and its failure mode. | S6, S10, S15, S19, S24, S25 | inline | — |
| T6 | Authorization and profile: deny-by-default guard, explicit public routes, server-side role, `DISABLED` sign-in block and session revocation, own-profile endpoints as the first owned resource. | S1, S2, S9, S18 | inline | — |
| T7 | Administrator: server-side creation command, password sign-in for administrators only, mandatory TOTP enrollment gate, backup codes, and enumeration-safe rejection of email OTP. | S6, S20, S21, S22 | inline | — |
| T8 | Web session boundary: server-side cookie forwarding, customer sign-in pages, and administrator sign-in and TOTP enrollment pages in Spanish product copy; cookie scope settings. | S1, S7, S14, S16 | inline | — |
| T9 | Integration and E2E tests: every ADR obligation and finding against real PostgreSQL, each traced to a named assertion. | S2, S13, S17, S30 | inline | — |
| T10 | Documentation: ADR wording fixes, architecture, database, and quality-gate docs, environment examples, and the administrator recovery procedure. | S13, S21, S26, S27 | inline | — |
| T11 | Security evidence: independent verification of every spec, and human sign-off of secret handling, session expiry, and error mapping. | S2 | verify | — |

## Log

- **L1** (2026-11-03) User, verbatim, answering "¿Arrancamos con el plan del M2?", which proposed a task document with
  the Milestone 2 requirements including the 18 review findings, a dedicated branch with small commits, and a short
  spike as the first unit: "si"
- **L2** User, verbatim, answering "¿Vamos con Better Auth y login por código al email?": "si dale"
- **L3** User, verbatim: "de las decisiones abiertas que proveedor me recomiendas, lo mismo para el hosting y segundo
  factor de que?"; then "si" to recording Resend, Railway, and an administrator password with a mandatory
  authenticator app in ADR 0004.
- **L4** User "si" to accepting, committing, and pushing ADR 0004 (`ae46d99`), and "si" to its amendment for
  administrator enrollment and email failure handling (`ef1df0a`).
- **L5** Evidence (2026-11-03, npm registry and Better Auth documentation): `better-auth` 1.7.16;
  `@thallesp/nestjs-better-auth` 2.8.0 declares NestJS `^11.1.6 || ^12.0.0` and Express `^5.1.0`; the NestJS
  integration requires `bodyParser: false`; two-factor enforcement covers only credential sign-in endpoints, not
  `/sign-in/email-otp`; `allowPasswordless` enables 2FA management without a password.
- **L6** Planning defaults, reversible: the user's own profile is the first owned resource; local development sends
  mail to a local mail catcher; tests use an in-memory email adapter.
- **L7** Open, not blocking: the domain name (`.mx` or `.com`).
- **L8** (2026-11-03) User, verbatim, answering "¿Apruebas el plan y arranco con T1, la prueba técnica?": "dale". No
  standing commit permission was granted; ask before each commit.
- **L9** (2026-11-03) T1 evidence: GO for ADR 0004 decision 1. `better-auth` 1.7.16 and
  `@thallesp/nestjs-better-auth` 2.8.0 are pinned with no peer warnings; its GraphQL, WebSockets, and `qs` peers are
  optional and lazily imported. With NestJS's body parser disabled, `GET /api/auth/ok` returns 200 `{"ok":true}`,
  valid JSON is accepted, an invalid body gets 400 from the global `ValidationPipe`, and helmet headers stay. The
  integration registers a global guard by default: undecorated routes return 401, `@AllowAnonymous()` makes a route
  public, and the guard runs before validation and calls `getSession` on every request. With an array of trusted
  origins it also enables its own CORS unless `disableTrustedOriginsCors: true` is set. Both packages are ESM-only
  and load through Node's `require(esm)`; the integration declares Node `>=22.22.1`. A control run with NestJS's body
  parser left on also passed.
- **L10** Open decisions raised by T1 (repository-wide, not caused by T1): `tsx` emits no decorator metadata, so the
  global `ValidationPipe` skips DTO validation under `pnpm dev` and `pnpm test` while the `tsc` build is unaffected;
  Biome rejects parameter decorators such as `@Body()` unless `unsafeParameterDecoratorsEnabled` is set; and the root
  `engines.node` floor (`>=22.0.0`) is below the integration's `>=22.22.1`.
- **L11** (2026-11-03) User, verbatim, answering "¿Commiteo T1 y sigo con esas tres correcciones como la próxima
  unidad, antes de T2?": "si". T1 committed as `ebabb0d`.
- **L12** T1 native review (`review-c7ff91fc7592f205`) advisory findings and their owners:
  R2-shared-boundary-omits-body-parser (WARNING) goes to T3; R3-test-glob-engine-floor (WARNING) goes to T1b (S34);
  R3-guard-positive-path-unproved goes to T6 and T9; R2-spike-suite-made-permanent,
  R2-body-passthrough-probe-intent-implicit, and R2-test-baseurl-differs-from-served-origin go to T1b;
  R2-task-status-stale-on-commit is fixed by this update.
- **L13** T1b evidence: the API `dev` and `test` scripts run through `@swc-node/register` 1.12.1 with `@swc/core`
  1.16.21, which map `emitDecoratorMetadata` from `apps/api/tsconfig.json`; `tsx` remains only for the Prisma scripts.
  RED: under `tsx`, the new metadata test and both 400 tests failed (3 of 11). GREEN: 11 of 11 pass under SWC, with
  real `@Body()` decorators and no manual metadata. The dev script booted with inline environment variables and
  served `GET /health` (503 without a database). Biome enables `unsafeParameterDecoratorsEnabled`; the root
  `engines.node` floor is `>=22.22.1 <27`.
- **L14** (2026-11-03) User, verbatim, answering "¿Commiteo T1b?": "si". T1b committed as `71ae169`, closing slice 1
  at 407 authored lines; the chain strategy will be asked before the T2 commit.
- **L15** T2 evidence: migration `20261104030448_add_better_auth_identity` is additive: the `UserRole` enum; `User`
  gains `emailVerified`, `image`, `role` (default `CUSTOMER`), and `twoFactorEnabled`, all with defaults or nullable;
  new `Session`, `Account`, `Verification`, `TwoFactor`, and `RateLimit` tables, with cascading foreign keys from
  `User`. Better Auth's `name` maps onto `displayName`; ids stay UUIDs (`generateId: "uuid"`); the role is not
  accepted as input. The shapes come from Better Auth 1.7.16's own `getAuthTables()`. On a disposable PostgreSQL 17
  the migration applied, the seed ran twice, and `test:db` passed 3 of 3 (email OTP creates a verified customer and
  a session, consumes the verification row, persists rate-limit rows, and ignores a client-supplied role); RED before
  the migration was 3 of 3 failing. `*.db-spec.ts` files are excluded from `pnpm test`, CI, and the build.
- **L16** T2 follow-ups for later tasks: T3 owns real trusted origins and the base URL; T5 maps rate-limit storage
  failures, configures the trusted client IP header (otherwise all clients share one bucket), and bounds or strips
  client `name` and `image`; T6 enforces `role` and `status`, since cascades apply only to hard deletes; T7 relies on
  the unique `(providerId, accountId)` and one `TwoFactor` row per user.
