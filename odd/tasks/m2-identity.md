# Milestone 2 — Identity, ownership, and authorization

Task brief and tracking for Milestone 2 on branch `feat/m2-identity`, implementing the accepted
[ADR 0004](../../docs/adr/0004-authentication-with-better-auth.md). Status: T1 (`ebabb0d`), T1b (`71ae169`), T2 (`cb07c29`), and T3 (`4cfdb26`) committed and published (L21); T4
committed as slices 4 to 6 (L22); slices 1 to 6 merged into the tracker (L23); T5a merged as #8 (L24); T5b merged as #9 (L25); T5c merged as #10 (L26); T6a merged as #11 and #12 (L27, L28); T6b merged as #13 and #14 (L29, L30); T7 in progress.
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
| Delivery | Feature branch chain (L17). `feat/m2-identity` is the tracker and final integration branch, with a draft pull request to `master` that is not merged before T11. Slice 1 `feat/m2-identity-01-spike` (T1, T1b; 407 lines) targets the tracker; slice 2 `feat/m2-identity-02-schema` (T2; 436 lines, 106 of them generated migration SQL) targets slice 1; slice 3 `feat/m2-identity-03-config` (T3, `4cfdb26`; about 747 lines, 415 of them tests) targets slice 2 with `size:exception` (L19); each later slice branches from and targets its parent. Pull requests: tracker #1 (draft, marker commit `7d9e3b9`), slice 1 #2, slice 2 #3, slice 3 #4. T4 is split into slice 4 `feat/m2-identity-04-email-core` (`01f44f5`), slice 5 `feat/m2-identity-05-email-adapters` (`f6cc504`), and slice 6 `feat/m2-identity-06-email-wiring`, each with `size:exception` (L22). Pull requests #2 to #7 are merged into the tracker with merge commits; later slices branch from the tracker and target it: slice 7 `feat/m2-identity-07-sign-in-code` (T5a, #8, merged) and slice 8 `feat/m2-identity-08-abuse-limits` (T5b, #9, merged), slice 9 `feat/m2-identity-09-abuse-hardening` (T5c, #10, merged), slice 10 `feat/m2-identity-10-authorization` (T6a access control, #11, merged), slice 11 `feat/m2-identity-11-disable-user` (T6a disable command, #12, merged), slice 12 `feat/m2-identity-12-session-status` (T6b session hardening, #13, merged), slice 13 `feat/m2-identity-13-own-profile` (T6b own profile, #14, merged), and T7 on `feat/m2-identity-14-admin-sign-in` (L23 to L30). Push and pull requests need human approval. |

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
  Decided (L23): 6-digit codes that expire after 300 seconds, at most 3 wrong attempts per code, stored hashed.
- **S16** First review R2-002 (readability, SUGGESTION): the exact cookie name, `Domain`, and lifetime.
- **S17** R3-adr-test-coverage-gaps (reliability, WARNING): tests beyond the ADR minimum, such as untrusted origins,
  disabled password sign-up, a client-supplied role, and enumeration-safe responses.
- **S18** R3-disable-revocation-cache (reliability, SUGGESTION): disabling a user takes effect on the next request; no
  session cache keeps a revoked session valid.
- **S19** R4-ratelimit-store-failure-mode (resilience, SUGGESTION): sign-in fails closed when the rate-limit store
  fails.
- **S20** Second review R1-001 (risk, SUGGESTION): bound the pre-enrollment window of a new administrator (initial
  password strength and lifetime). Decided (L30): the creation command generates a random 24-character initial
  password and shows it once in the terminal, never in logs; if the administrator has not enrolled an authenticator
  app within 24 hours of its issue, that password stops working and the same command must issue a new one; Milestone
  2 offers no password change through the API.
- **S21** R2-ambiguous-pronoun-enrollment-gate (readability, WARNING): state unambiguously what a pre-enrollment
  administrator account can and cannot do.
- **S22** R3-enrollment-gate-email-otp (reliability, WARNING): email OTP sign-in is rejected for administrator
  accounts in every enrollment state.
- **S23** R3-send-failure-code-lifecycle (reliability, WARNING): what happens to a code whose email failed, and how it
  counts against attempts. Decided (L23): the send request never waits for delivery; when delivery of a code fails
  after the bounded retries, that code is invalidated (never a newer code), the failure counts toward the degraded
  alert, and it does not count as a wrong attempt.
- **S24** R3-send-failure-enumeration (reliability, WARNING): send-failure responses are identical for new, existing,
  and administrator emails; an administrator email gets the same response as a customer email. Decided (L23): the
  send endpoint returns the same immediate success response for new, existing, and administrator emails, whatever
  the later delivery outcome, and administrator emails never receive a sign-in code. This amends ADR 0004 decision 8,
  which asked for a generic retryable error.
- **S25** R4-send-failure-rate-limit-interaction (resilience, WARNING): send failures neither lock customers out
  through rate limits nor open an abuse path. Decided (L23): persistent limits of 3 send requests per minute per
  client IP and 5 codes per hour per email address; every send request consumes its token whatever the delivery
  outcome, so one request causes at most 3 provider calls.
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
| T2 | Schema: map Better Auth's user onto `User`; add session, account, verification, and two-factor models and a server-side role; one additive migration; database gate; human migration review. | S2, S5, S13 | worker | `cb07c29` |
| T3 | Configuration and origins: validate the auth secret, public base URL, and trusted origins at startup; credentialed CORS only for trusted origins, shared with Better Auth. | S8, S12 | worker | `4cfdb26` |
| T4 | Email port: application port, in-memory test adapter, Resend adapter, local mail catcher; bounded retries and failure handling. | S11, S23, S28, S29, S31 | worker | `01f44f5`, `f6cc504`, slice 6 (L22) |
| T5a | Sign-in code flow: customer email OTP with the S15 values, background delivery with a uniform response, invalidation of an undelivered code, no codes for administrators, client profile fields ignored at sign-up; amend ADR 0004 decision 8. | S6, S15, S23, S24 | worker | `8ab8dcc` (#8) |
| T5b | Abuse limits: persistent rate limits in every environment, the per-email cap, the trusted client IP header, and a rate-limit store that fails closed; plus the T5a review findings routed here in L24. | S10, S19, S25 | worker | `3dfb6f6` (#9) |
| T5c | Abuse-limit hardening: refuse background work once the shutdown drain starts, a fixed per-email quota window, quota storage errors surfaced instead of masked, and one pending-task bound (L25). | S23, S25 | worker | `83997bb` (#10) |
| T6a | Access control: deny-by-default guard with explicit public routes that never read the session, a server-side administrator role check, the `DISABLED` sign-in block on every path, session revocation on disable through a server-side command, and no email-code session for administrators (L26). | S1, S2, S9, S18 | worker | `3af25ea` (#11), `8d9beec` (#12) |
| T6b | Own profile: read and update the signed-in user's own profile as the first owned resource, with validated, bounded fields (L26); refuse unsupported route markers at startup instead of per request (L27); refuse a session on Better Auth's own endpoints unless its stored user is `ACTIVE`, and route profile updates through the validated endpoint instead of Better Auth's `/update-user` (L28). | S1, S2, S9, S18 | worker | `81207e8` (#13), `8490cd5` (#14) |
| T7 | Administrator: server-side creation command, password sign-in for administrators only, mandatory TOTP enrollment gate, backup codes, and enumeration-safe rejection of email OTP; initial password and enrollment window per S20 (L30). | S6, S20, S21, S22 | worker | — |
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
- **L17** (2026-11-03) User, verbatim, answering "¿Apruebas la migración y la cadena con tracker, y commiteo T2?":
  "si". T2 committed as `cb07c29`. The branches were rebuilt locally with no commit lost: the tracker
  `feat/m2-identity` points at `master` (`ef1df0a`), and the slice branches carry the commits. T2 native review
  (`review-b5707b23df8564c4`) findings and their owners: `TwoFactor.verified` defaulting to true and the unexercised
  `Account` and `TwoFactor` tables go to T7; the role-input test that could pass without `input: false` goes to T5
  and T6; the database test's order coupling, cleanup outside `finally`, identifier substring match, `updatedAt`
  default, and random client IP collisions go to T9.
- **L18** T3 evidence: startup validation requires `BETTER_AUTH_SECRET` (at least 32 characters, never echoed) and
  `AUTH_BASE_URL` (an http(s) origin), parses `CORS_ORIGIN` as a comma-separated trusted-origins list (a single
  origin still works), and rejects empty entries, wildcards, and `BETTER_AUTH_TRUSTED_ORIGINS`. One `createApp`
  boundary owns `bodyParser: false`, credentialed CORS for the trusted list only (`GET`, `HEAD`, `POST`, `OPTIONS`),
  and the integration registers through `forRootAsync` with `disableTrustedOriginsCors: true` and Better Auth's
  origin check pinned on. `/health` is `@AllowAnonymous()`. Tests: 42 of 42 pass, covering untrusted preflights
  without CORS headers, `POST /api/auth/sign-out` returning 403 `INVALID_ORIGIN` for an untrusted origin and 200
  for a trusted one, `/health` returning 503 rather than 401 without a session, and `/api/auth/ok` returning 200.
  The dev boot smoke test passed. The safety policy blocked `apps/api/.env.example`, so the new variables are
  documented in the README and must be added to the example and local env files by hand. Size: about 747 changed
  lines (415 of them tests); the only cohesive split needs intermediate module and test states, so the slice is
  proposed as `size:exception`.
- **L19** (2026-11-04) User, verbatim, answering "¿Commiteo T3 como un solo slice con `size:exception`?": "listo ya
  agrege a los env, si comitea". T3 committed as `4cfdb26`; the user added the new variables to `apps/api/.env` and
  `apps/api/.env.example` (the example keeps `BETTER_AUTH_SECRET` empty).
- **L20** T3 native review (`review-71c31853c0109064`) findings and their owners: the integration guard reading the
  session before honoring `@AllowAnonymous()`, so `/health` can return 500 when the database is down and a cookie is
  present, goes to T6; the unproved origin-check pin and the untested runtime configuration branch go to T9; the
  unexplained and unexercised user mapping goes to T5 and T10; Better Auth implicitly trusting the `baseURL` origin
  goes to T8 and T10; duplicated test helpers go to T9.
- **L21** (2026-11-04) User, verbatim, answering "¿Pusheo la cadena y abro los 4 PRs?": "dale". The tracker received
  the empty marker commit `7d9e3b9`; the four branches were pushed without force and pull requests #1 (draft tracker
  to `master`), #2, #3, and #4 were opened with Chain Context sections.
- **L22** (2026-11-04) User, verbatim, answering "¿Lo commiteo así y publico los 3 slices como PRs encadenados (#5 a
  #7)?": "si". T4 lands as three chained slices, each with `size:exception` because about half of every slice is the
  tests of its own code: slice 4 `01f44f5` (port, delivery policy, in-memory adapter; 550 lines), slice 5 `f6cc504`
  (Resend and Mailpit adapters; 560 lines), and slice 6 (configuration, `EmailModule`, the delivery runtime, Compose
  Mailpit, docs, and this record). Each slice passed the gates in isolation and was assessed medium with no native
  review due. Isolation exposed a flaky adapter test (a 100 ms client timeout on success paths), which slice 5 fixes.
  Resend's 409 `concurrent_idempotent_requests` is treated as transient. S23 is covered only for retries reusing the
  same code; what happens to a code whose email failed, and how it counts against attempts, goes to T5, together with
  S24 (permanent failures return faster than transient ones, so timing must not reveal anything about the address)
  and S25 (whether a failed send consumes a rate-limit token, since each request can make three provider calls).
  Known limits: the degraded-alert counter is per process, and `Retry-After` is not honored.
- **L23** (2026-11-04) User, verbatim, answering "¿Apruebas el envío en segundo plano? Eso implica enmendar la
  decisión 8 del ADR 0004, y lo haría como parte de T5.": "si, pero mergeea todos los pr". Asked whether that
  included the tracker, the user chose "Dejar #1 hasta T11". Pull requests #2 to #7 were merged into the tracker with
  merge commits after each diff was checked against it; the tracker tree equals slice 6, its CI passed, and #1 stays
  a draft until T11. Evidence behind the decision: Better Auth 1.7.16 writes the Verification row before calling
  `sendVerificationOTP`, logs and swallows a send error, and still returns 200, so the generic retryable error of
  ADR 0004 decision 8 cannot surface without rewriting the response, and an awaited send leaks timing. The approved
  design is the recommendation recorded in S15, S23, S24, and S25; the value of 5 codes per hour per email is the
  orchestrator's choice within that design. T5 is split into T5a (sign-in code flow) and T5b (abuse limits).
- **L24** (2026-11-04) User, choosing an option for "¿Commiteo T5a, abro su PR contra el tracker y lo mergeo cuando
  pase la CI?": "Sí: commit, PR y merge". T5a was committed as `8ab8dcc` after its native review
  (`review-f9cdea2a75a0e3d1`, high tier, four lenses) was approved and acknowledged; PR #8 passed CI and was merged
  into the tracker, whose tree equals slice 7, and CI on #1 passed. The worker ignored a client-supplied name and image
  at sign-up (the profile comes from T6) and discards codes of other OTP types without sending. Advisory findings: T5b
  owns R1-unthrottled-unauthenticated-email-send, R4-unbounded-background-delivery, R3-shutdown-drain-ordering,
  R3-undelivered-code-on-lookup-failure, and R4-silent-fail-closed-without-context; T6 and T7 own
  R1-admin-otp-not-rejected-at-sign-in; T9 owns R3-db-spec-unbounded-wait and R3-runinline-untested; T10 owns
  R2-auth-return-type-erases-plugin-api, R2-duplicated-s15-literals-in-comment,
  R2-store-format-doc-attached-to-one-function, and R2-validity-minutes-implicit-constraint;
  R2-t5a-brief-says-bounded-code-discards is fixed in the T5a row. Orchestrator's choices for T5b within the approved
  design: a request over the per-email cap still gets the identical 200, but no code is sent and the issued code is
  discarded (S24); production requires an explicitly configured client IP header, and a production request whose client
  IP cannot be resolved is rejected with the generic error instead of sharing one global bucket.
- **L25** (2026-11-04) User, choosing an option for "¿Commiteo T5b, abro su PR contra el tracker y lo mergeo cuando
  pase la CI?": "Sí: commit, PR y merge"; the chosen option named T5c as the next step. T5b was committed as
  `3dfb6f6` after its native review (`review-29f61ae3c37f49da`, high tier, four lenses) was approved and acknowledged;
  PR #9 passed CI and was merged into the tracker, whose tree equals slice 8, and CI on #1 passed. The worker found that
  Nest runs this module's `onModuleDestroy` before Prisma disconnects, so the drain moved there, and that Better Auth
  prunes rate-limit rows older than its longest known window, so a never-matching retention rule keeps the hourly
  per-email rows. Advisory findings: R1-001 (anyone can spend an address's 5 codes and block its sign-in codes for an
  hour) needs a human decision before T11; T5c owns R3-drain-before-http-close and R4-shutdown-drain-before-http-close
  (work scheduled after the drain, before the HTTP server closes), R3-email-quota-window-extends-on-every-counted-code,
  R3-quota-create-errors-masked, and R2-duplicated-pending-task-bound; T9 owns R3-guard-not-proved-through-nest-mount,
  R3-db-spec-client-ip-collisions, R2-misleading-test-ip-range-comment, and R2-hardcoded-quota-in-assertions; T10 owns
  R2-doc-every-request-counts and R2-duplicated-error-class-and-safe-log.
- **L26** (2026-11-04) User, choosing an option for "¿Commiteo T5c, abro su PR contra el tracker y lo mergeo cuando
  pase la CI?": "Sí: commit, PR y merge", declining the standing-permission option, so every later slice is asked
  again. T5c was committed as `83997bb` after its native review (`review-ab643d956ae3c33c`, high tier, four lenses)
  was approved and acknowledged; `test:db` passed 8 of 8 on a throwaway PostgreSQL 17; PR #10 passed CI and was merged
  into the tracker, whose tree equals slice 9, and CI on #1 passed. Advisory findings: T9 owns
  R3-retention-proof-depends-on-unasserted-prune, R3-shutdown-warn-level-untested, and
  R3-create-error-masked-by-lookup-error; T10 owns R2-rejected-after-shutdown-name-vs-timing and
  R2-test-duplicates-quota-key-prefix. Orchestrator's routing: T6 is split into T6a (access control, which also owns
  the `/health` session-read finding of L20, the positive-path guard proof of L12, role and status enforcement of L17,
  `DISABLED` users still receiving codes from L24, and R1-admin-otp-not-rejected-at-sign-in) and T6b (own profile);
  with no admin interface in Milestone 2, disabling a user is a server-side command, like administrator creation in T7.
- **L27** (2026-11-04) User, choosing an option for "Slice A de T6a (control de acceso) pasó los chequeos y la
  revisión nativa. ¿Hago commit, abro su PR contra el tracker y lo mergeo cuando pase la CI? El slice B (comando
  user:disable) todavía tiene que pasar su propia revisión.": "Sí: A y B", so slice B is committed, published, and
  merged after its own native review and CI without asking again, unless that review requires a correction. The T6a
  worker stopped once on a usage limit and was resumed with its context. T6a is split in two cohesive slices: slice
  10 (`3af25ea`, PR #11) holds access control and passed the gates in isolation (155 of 155 tests, `test:db` 8 of 8)
  and its native review (`review-225cb68e85dfcdb9`, high tier, four lenses, approved and acknowledged); slice 11
  holds the `user:disable` command. Evidence the worker found: the integration's guard reads the session before it
  checks `@AllowAnonymous()`, which caused the L20 500, so it is disabled and replaced by a project-owned guard;
  Better Auth enables its session cookie cache by default only without a database, and it is pinned off anyway.
  Advisory findings of slice 10: slice 11 mitigates R3-disabled-session-live-on-auth-endpoints (Better Auth's own
  endpoints accept an existing session of a user set to `DISABLED`; the command deletes those sessions in the same
  transaction); T6b owns the startup check that R4-unsupported-marker-detected-only-per-request,
  R2-misdecorated-route-detected-only-at-request-time, and R3-integration-marker-detected-only-per-request ask for;
  T9 owns R3-session-hook-proved-only-on-memory-adapter (slice 11 adds the first PostgreSQL proof) and
  R3-forged-session-data-assertion-does-not-prove-cache-off; T10 owns R2-email-otp-prefix-match-unexplained,
  R2-may-receive-sign-in-code-doc-omits-unknown-address, R2-session-hook-context-fallback-undocumented,
  R2-session-refusal-restates-code-eligibility-rule, and R2-unsupported-integration-keys-copied-from-library-internals;
  T11 owns R1-001 (risk, `access-control.ts:86-88`) for the human security review. The parent checked that
  `isActive` fails closed: only the exact stored status `ACTIVE` passes.
- **L28** (2026-11-04) Slice 11 (`8d9beec`, PR #12) passed the gates in isolation (162 of 162 tests, `test:db` 12 of
  12, and a manual run of `user:disable` that exited 0, 0, 1, and 2 and never printed the address). Its native review
  (`review-2bc7b1fbbbf84d35`, four lenses) ran although the native assessment rated the slice medium with no review
  due, because the user's approval in L27 was conditioned on it and the slice deletes stored sessions; it approved
  with 11 advisory findings. PRs #11 and #12 passed CI and were merged into the tracker, whose tree equals slice 11,
  and CI on #1 passed. Routing: T6b owns R1-concurrent-sign-in-session-survives-disable,
  R3-concurrent-sign-in-session-survives-disable, and R4-001 (a sign-in that runs while the command commits can leave
  one session, which Better Auth's own endpoints still accept) together with R3-disabled-session-live-on-auth-endpoints
  from L27: every Better Auth endpoint that uses a session refuses it unless the stored user is `ACTIVE`, so a
  surviving session is useless everywhere. T6b also routes profile updates through its validated endpoint and disables
  Better Auth's `/update-user` (`disabledPaths`, `better-auth/dist/api/index.mjs:168-170`), which closes the unbounded
  `name` and `image` updates of L16. T9 owns R3-command-contract-untested, R3-command-unhandled-rejection-path, and
  R4-002; T10 owns R2-already-disabled-derived-from-not-active, R2-client-prefix-range-unexplained,
  R2-failure-event-name-outside-event-constant, R3-non-active-status-reported-as-already-disabled, and R4-003.
- **L29** (2026-11-04) User, choosing an option for "El slice A de T6b pasó los chequeos y la revisión nativa. Con
  este slice, la sesión de un usuario DISABLED deja de servir también en los endpoints de Better Auth, se
  deshabilitan 18 rutas que modifican usuarios o contraseñas, y la API no arranca si una ruta usa decoradores de la
  integración. ¿Hago commit, PR y merge cuando pase la CI? El slice B (perfil propio: GET y PATCH /me) todavía tiene
  que pasar su revisión.": "Sí: A y B". The T6b worker built all of T6b, then restructured it at the parent's request
  into two slices separable by whole files. Slice 12 (`81207e8`, PR #13) holds the session and route hardening: it
  passed the gates in isolation (182 of 182 tests, `test:db` 14 of 14) and its native review
  (`review-596a78b1e4de2c5b`, high tier, four lenses), which approved with 9 advisory findings and none from the risk
  lens. Its branch was renamed from `feat/m2-identity-12-own-profile` to `feat/m2-identity-12-session-status` before
  the push, because it holds the hardening; slice 13 holds the own profile. Beyond the brief but within its point 2,
  the worker also disabled the email-code password reset, because it creates a credential account and would give a
  customer a password. Routing: T9 owns R3-disabled-path-variants-unproved and R3-per-request-500-no-longer-asserted;
  T9 and T11 own R3-inactive-refusal-depends-on-delete-success (the request fails closed when the delete throws),
  R4-hook-doubles-session-reads, and R4-refused-session-deletion-unlogged; T10 owns
  R2-session-endpoint-inventory-duplicated, R2-db-spec-client-prefix-unexplained, R2-guard-targets-recomputed, and
  R2-guard-test-name-misattributes-deletion. Notes for later tasks: T7 keeps the email-code reset and
  `/reset-password` disabled, enables password sign-in for administrators only with sign-up disabled, and re-enables
  `/change-password` only if administrators may change their own password; in T8 a browser cannot call `PATCH /me`
  directly because CORS allows `GET`, `HEAD`, `POST`, and `OPTIONS`, so the web server calls it; T11 decides whether
  display names may contain invisible format characters such as bidirectional overrides.
- **L30** (2026-11-04) Slice 13 (`8490cd5`, PR #14) passed the gates in isolation (215 of 215 tests, `test:db` 19 of
  19) and its native review (`review-a82a203257448d51`, high tier, four lenses), which approved with 8 advisory
  findings. PRs #13 and #14 passed CI and were merged into the tracker, whose tree equals slice 13, and CI on #1
  passed. Routing: T9 and T11 own R4-profile-write-not-conditioned-on-active-status (a name change can land between the
  guard and the write if the account is disabled at that moment), R3-missing-user-to-401-path-untested,
  R3-null-display-name-new-auth-state-unproved, and R3-use-case-revalidation-unproved; T11 owns R1-001 (invisible format
  characters in display names, `display-name.ts:5`); T10 owns R2-display-name-limit-hardcoded-in-error,
  R2-memory-repository-duplicates-empty-name-mapping, and R2-own-profile-db-spec-client-prefix-unexplained. User,
  choosing an option for "T7 (administradores): ¿cómo se fija la contraseña inicial de un admin y cuánto tiempo tiene
  para enrolar su app autenticadora (TOTP) antes de que esa contraseña deje de servir?": "Generada por el comando, 24
  horas (recomendado)", whose description reads: "El comando genera una contraseña aleatoria de 24 caracteres y la
  muestra una sola vez en la terminal, nunca en logs. Si el admin no enrola el TOTP en 24 horas, la contraseña deja de
  servir y hay que reemitirla con el mismo comando. En M2 no hay cambio de contraseña por API: se reemite con el
  comando." This decides S20.
