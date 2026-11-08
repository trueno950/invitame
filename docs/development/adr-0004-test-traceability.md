# ADR 0004 test traceability

Maps every test obligation of [ADR 0004](../adr/0004-authentication-with-better-auth.md) (its Consequences) and
every S17 case of the Milestone 2 plan to a named assertion (S13, S30). Status: current as of Milestone 2 task
T11f (L79). Browser end-to-end coverage exists for the customer flows (see the L40 rows below), the administrator
flows (see the L43, L44, and L52 rows), and form submission without JavaScript (see the L55 rows); T9b part C1
resolves the web server findings in the L38, L40, and L52 rows, and part C2 the test and harness findings in the
L48, L55, L56, and L59 rows. The T11 sections below cover the security fixes (S46 to S53) and the verification
findings (S55 to S57, and the small fixes of T11f).

## How the evidence runs

- **Database suites** (`apps/api/src/**/*.db-spec.ts`) run the production `createAuth`, the project guard, and
  the Prisma adapter against a real, migrated PostgreSQL 17. They run through
  `pnpm --filter @invitame/api test:db`, locally against a disposable database and in CI in the
  `database-tests` job of [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), on every push to `master`
  or `main` and every pull request. The shared harness [`apps/api/test/database.ts`](../../apps/api/test/database.ts)
  refuses a missing or non-local `DATABASE_URL` and gives every suite its own client addresses; each suite that
  counts rate-limit rows draws from its own block, which no other suite uses (T9b part C2).
- **Unit suites** (`apps/api/src/**/*.spec.ts`) run the same `createAuth` on Better Auth's in-memory adapter,
  with controlled clocks, through `pnpm test` in the `quality-gates` job.
- **Browser suite** (`apps/web/e2e/**/*.spec.ts`, T9b) drives Chromium through the production build of the web,
  which proxies `/api/auth` to the built API and reads `GET /me` and `get-session` from its server; the API runs
  on a migrated PostgreSQL 17 and delivers sign-in codes through Mailpit, where the tests read them.
  Administrators come from the harness-only script `apps/api/test/create-e2e-administrator.ts` (the
  `admin:create` composition), and their TOTP codes from the setup key read on `/admin/activar` (S38, S41). It runs through
  `pnpm --filter @invitame/web test:e2e`, in CI in the `browser-tests` job; see
  [Browser end-to-end tests](quality-gates.md#browser-end-to-end-tests).

A test name below is quoted exactly; `›` separates a `describe` block from its test. "Added" marks assertions
written in T9a, "added in T7c" those of the T9a-D1 fix, and "added in T7d" those of its hardening (S40); every
other row existed before them.

### Suite legend

| Alias | File |
| --- | --- |
| DB-auth | [`auth/auth.prisma.db-spec.ts`](../../apps/api/src/auth/auth.prisma.db-spec.ts) |
| DB-limits | [`auth/abuse-limits.prisma.db-spec.ts`](../../apps/api/src/auth/abuse-limits.prisma.db-spec.ts) |
| DB-admin | [`auth/administrator-sign-in.prisma.db-spec.ts`](../../apps/api/src/auth/administrator-sign-in.prisma.db-spec.ts) |
| DB-proxy | [`auth/auth-proxy-secret.prisma.db-spec.ts`](../../apps/api/src/auth/auth-proxy-secret.prisma.db-spec.ts) |
| DB-inactive | [`auth/inactive-session.prisma.db-spec.ts`](../../apps/api/src/auth/inactive-session.prisma.db-spec.ts) |
| DB-code | [`auth/sign-in-code/sign-in-code.prisma.db-spec.ts`](../../apps/api/src/auth/sign-in-code/sign-in-code.prisma.db-spec.ts) |
| DB-profile | [`users/own-profile.prisma.db-spec.ts`](../../apps/api/src/users/own-profile.prisma.db-spec.ts) |
| DB-disable | [`users/infrastructure/prisma-user-access.repository.db-spec.ts`](../../apps/api/src/users/infrastructure/prisma-user-access.repository.db-spec.ts) |
| DB-create | [`users/infrastructure/prisma-administrator-account.repository.db-spec.ts`](../../apps/api/src/users/infrastructure/prisma-administrator-account.repository.db-spec.ts) |
| DB-races | [`auth/account-state-races.prisma.db-spec.ts`](../../apps/api/src/auth/account-state-races.prisma.db-spec.ts) (T11) |
| DB-marker | [`auth/session-second-factor-marker.prisma.db-spec.ts`](../../apps/api/src/auth/session-second-factor-marker.prisma.db-spec.ts) (T11c) |
| DB-command | [`users/create-administrator.command.db-spec.ts`](../../apps/api/src/users/create-administrator.command.db-spec.ts) (T11) |
| DB-ownership | [`users/identity-ownership.prisma.db-spec.ts`](../../apps/api/src/users/identity-ownership.prisma.db-spec.ts) (T11f) |
| E2E-customer | [`e2e/customer-session.spec.ts`](../../apps/web/e2e/customer-session.spec.ts) (browser) |
| E2E-admin | [`e2e/admin-session.spec.ts`](../../apps/web/e2e/admin-session.spec.ts) (browser) |
| E2E-forms | [`e2e/form-submission.spec.ts`](../../apps/web/e2e/form-submission.spec.ts) (browser, JavaScript disabled) |
| U-access | [`auth/access-control/access-control.spec.ts`](../../apps/api/src/auth/access-control/access-control.spec.ts) |
| U-admin | [`auth/administrator-sign-in.spec.ts`](../../apps/api/src/auth/administrator-sign-in.spec.ts) |
| U-limits | [`auth/abuse-limits.spec.ts`](../../apps/api/src/auth/abuse-limits.spec.ts) |
| U-wiring | [`auth/auth.wiring.spec.ts`](../../apps/api/src/auth/auth.wiring.spec.ts) |
| U-registration | [`auth/auth.registration.spec.ts`](../../apps/api/src/auth/auth.registration.spec.ts) |
| U-session | [`auth/session-settings.spec.ts`](../../apps/api/src/auth/session-settings.spec.ts) |
| U-code | [`auth/sign-in-code/sign-in-code.spec.ts`](../../apps/api/src/auth/sign-in-code/sign-in-code.spec.ts) |
| U-sender | [`auth/sign-in-code/sign-in-code-sender.spec.ts`](../../apps/api/src/auth/sign-in-code/sign-in-code-sender.spec.ts) |
| U-email | [`email/application/email-delivery.service.spec.ts`](../../apps/api/src/email/application/email-delivery.service.spec.ts) |
| U-profile | [`users/presentation/own-profile.controller.spec.ts`](../../apps/api/src/users/presentation/own-profile.controller.spec.ts) |

## ADR 0004 obligations

| # | Obligation | Real PostgreSQL | Unit |
| --- | --- | --- | --- |
| 1 | Denied-by-default access | DB-profile: "denied by default › answers GET /me and PATCH /me with 401 without a usable session and writes nothing" (added). | U-access: "deny by default (L12) › rejects an undecorated route with 401 without a session", "› rejects an invalid or tampered session cookie with 401"; U-wiring: "denies a new undecorated route with 401 without a session". |
| 2 | Ownership | DB-profile: "ownership › reads and writes only the session's own user, whatever user id the request names" (added); "PATCH /me › rejects an unknown field and a client-supplied role without writing". | U-profile: "GET /me › never reads a user id from the query". |
| 3 | Session expiry | DB-profile: "session expiry and revocation › refuses a customer session past its stored expiry with 401" (added), "› extends a customer session read through the project guard a day after its last refresh" (added); DB-admin: "stores an administrator session for 12 hours from sign-in and never extends it (S16)", "stores 12 hours for the enrollment session and for a second-factor sign-in" (added), "refuses a server-side session expiry change and leaves the stored row unchanged" (added). | U-session: "customer sessions: 7 days, refreshed at most once per day of use (S16, L34)" and "administrator sessions: 12 hours from sign-in, never refreshed (S16, L34)" blocks. |
| 4 | Session revocation | DB-disable: "sets DISABLED and deletes every session in one call, so existing cookies stop working"; DB-profile: "session expiry and revocation › revokes the session on sign-out, so the same cookie gets 401 on /me" (added); DB-create: "reissues an un-enrolled administrator's password, restarts the window, and revokes sessions". | U-access: "deny by default (L12) › rejects a revoked session with 401 on the next request (S18)". |
| 5 | Disabled users | DB-disable: "sends a DISABLED user no code and refuses them any new session", "is idempotent and revokes a session left behind by a write outside the command"; DB-inactive: "answers every endpoint exactly as without a session and deletes the session row"; DB-profile: "a session whose stored user turned DISABLED › gets 401 on GET /me and PATCH /me, changes nothing, and loses its session row". | U-access: "DISABLED users (S9, S18) › rejects an existing session with 401 once the stored user is DISABLED"; U-code: "sends a DISABLED user no code and removes the issued one, with the identical response", "refuses session creation for a DISABLED user on every path, server-side included". |
| 6 | Code expiry | DB-code: "stores a 300-second expiry and refuses an expired code without creating a user or session" (added). | U-code: "sign-in code values (S15) › accepts a code until 300 seconds and rejects it as expired after". |
| 7 | Attempt limits | DB-code: "refuses the right code after 3 wrong attempts and stores no user or session" (added); DB-admin: "gates a pre-enrollment session, then enrolls, then requires the second factor" (stored `failedVerificationCount`). | U-code: "rejects the 4th attempt with TOO_MANY_ATTEMPTS after 3 wrong codes, even with the right code"; U-admin: "ends a challenge after 5 wrong codes", "locks the second factor for 15 minutes after 10 consecutive failures". |
| 8 | Rate limiting | DB-limits: "persists client IP buckets and answers the 4th request from one IP with 429", "stores the per-email count under a hashed key and sends no 6th code within the hour"; DB-proxy: "stores the client IP bucket and the code for a request with the secret"; DB-auth: "writes rate-limit rows to the database". | U-limits: "client IP rate limits (S10, S25)" block, "rate-limit store failure (S19) › rejects code requests and code sign-ins with a generic 503 before the endpoint runs"; U-admin: "answers the 4th password attempt from one client IP within a minute with 429", "answers the 6th second-factor attempt from one client IP within a minute with 429". |
| 9 | Mandatory administrator second factor | DB-admin: "gates a pre-enrollment session, then enrolls, then requires the second factor". | U-admin: "requires a second factor after the password once enrolled: no session before the code", "never trusts a device: the next password sign-in still asks for the second factor", "disables two-factor removal, URI re-reading, and email two-factor codes". |
| 10 | Enrollment gate | DB-admin: "gates a pre-enrollment session, then enrolls, then requires the second factor", "deletes a pre-enrollment session once the window ends and refuses enrollment", "refuses an expired initial password exactly like a wrong one and creates no session", "fails closed when admin:create reissues the password during the first TOTP confirmation" (added; required since T7c, defect T9a-D1 below), "refuses the old confirmation after the reissued password has started a new enrollment", "refuses a first TOTP confirmation that races user:disable and leaves no session", "logs one administrator_enrollment_superseded event without personal data when it reverts a confirmation", and "lets an enrolled administrator pass the sign-in challenge with a stale session cookie" (added in T7c); "refuses a stale first confirmation without reverting after the reissued password enrolled", "refuses a duplicate first confirmation without reverting when the sibling completed first", "refuses a duplicate first confirmation without reverting and ends every session while the sibling is completing", "reverts a first confirmation that races a sign-out, then lets the password enroll", "ends a second tab's session when it refuses a confirmation that races a sign-out", "refuses with 401 and logs administrator_enrollment_compensation_failed when the revert itself fails", and "ends every other session of the administrator at a successful first confirmation" (added in T7d). | U-admin: "enrollment gate (S6, S21)" and "pre-enrollment window of 24 hours (S20)" blocks. |
| 11 | Email OTP sign-in rejected for administrators | DB-code: "sends an administrator no code and removes the issued row", "refuses an email-code session to an administrator (<state>) exactly like an invalid code" for `pending`, `enrolled`, and `expired` (added). | U-admin: "email codes for administrators in every enrollment state (S22)" block. |
| 12 | Email send failures | DB-code: "invalidates only a code whose delivery failed, keeping a newer code valid". | U-code: "invalidates a code whose delivery fails after the retries, without logging the code or the address"; U-sender: "logs the delivery stage for an unexpected delivery error and still invalidates the code"; U-email: "stops at the attempt limit and surfaces only the generic retryable error". |

## S17 cases

| Case | Real PostgreSQL | Unit |
| --- | --- | --- |
| Untrusted origins | DB-profile: "untrusted origins › answers sign-out from an untrusted Origin with 403 INVALID_ORIGIN and keeps the session" (added). | U-wiring: "rejects POST /api/auth/sign-out from an untrusted Origin with 403 INVALID_ORIGIN", "gives an untrusted origin no Access-Control-Allow-Origin". |
| Disabled password sign-up | DB-admin: "answers password sign-up with 400 EMAIL_PASSWORD_SIGN_UP_DISABLED and stores no user" (added). | U-admin: "answers /sign-up/email with 400 EMAIL_PASSWORD_SIGN_UP_DISABLED and stores nothing"; U-access: "keeps password sign-up closed, whatever role it asks for". |
| Client-supplied role | DB-auth: "ignores a client-supplied role when an email code creates the account"; DB-code: "stores the code hashed and ignores client name and image when the code creates a customer"; DB-profile: "PATCH /me › rejects an unknown field and a client-supplied role without writing". | U-access: "client-supplied role and status (S9, S17, L17)" block. |
| Enumeration-safe responses | DB-code: "answers a code request identically for unknown, customer, administrator, and DISABLED addresses" (added), and the three administrator email-code refusals of obligation 11 (added); DB-admin: "answers an unknown address, a customer, and a DISABLED administrator exactly like a wrong password" (added), "refuses an expired initial password exactly like a wrong one and creates no session". | U-code: "sign-in code request (S24) › returns the same immediate 200 body for unknown, existing-customer, and administrator emails"; U-admin: "answers a customer, an unknown address, a wrong password, and a DISABLED administrator identically". |

Response timing is not measured by any suite; the code request answers before delivery by design (S24).

## Pre-enrollment administrator account (decision 3, clarified 2026-11-07)

Maps each clause of the «Clarified (2026-11-07)» block of decision 3 (T11, L64 R3-pre-enrollment-clarification-untraced).
All U-admin names below sit in its "enrollment gate (S6, S21)", "pre-enrollment window of 24 hours (S20)", or
"TOTP enrollment and backup codes (decision 3)" blocks.

| Clause | Real PostgreSQL | Unit |
| --- | --- | --- |
| Inside the window, exactly four Better Auth endpoints serve the session | DB-admin: "gates a pre-enrollment session, then enrolls, then requires the second factor" (`get-session`, `two-factor/enable`, and `two-factor/verify-totp` with the pending session); "reverts a first confirmation that races a sign-out, then lets the password enroll" (`sign-out` answers 200). | U-admin: "lists exactly four Better Auth endpoints in the pending-administrator allow list" (added in T11; fails when a fifth path is allowed), "lets an un-enrolled administrator read its session", "returns the TOTP URI with the InvitaMe issuer and 10 backup codes, whatever issuer the client sends", "confirms enrollment with the first valid code and replaces the session", "lets an un-enrolled administrator sign out". |
| Every other Better Auth endpoint answers as without a session | DB-admin: "gates a pre-enrollment session, then enrolls, then requires the second factor" (`list-sessions`). | U-admin: "answers <method> <path> for an un-enrolled administrator exactly as without a session" for 11 endpoints, from `GET /list-sessions` to `POST /two-factor/verify-backup-code`. |
| Every project route answers 401, `GET` and `PATCH /me` and administrator-only routes included | — | U-admin: "refuses every project route to an un-enrolled administrator with 401 and a generic body" (an undecorated route, an `@AdminOnly()` route, `GET /me`, `PATCH /me`), "decides enrollment from twoFactorEnabled, never from a TwoFactor row's verified default (L17)". |
| Never receives an email sign-in code | The `pending` cases of obligation 11. | U-admin: "refuses an email-code session to a pending administrator, exactly like an invalid code", "sends a pending administrator no code, with the identical 200 response". |
| After the window: the password is refused like a wrong one, each session is deleted on its next use, and only a new initial password helps | DB-admin: "refuses an expired initial password exactly like a wrong one and creates no session", "deletes a pre-enrollment session once the window ends and refuses enrollment"; DB-create: "reissues an un-enrolled administrator's password, restarts the window, and revokes sessions". | U-admin: "answers the initial password after the window exactly like a wrong password", "stops an existing pre-enrollment session once the window ends, and refuses enrollment", "treats a missing credential account as an expired window". |

## T11 slice A tests

- R3-reset-disable-race-unproved (L63), fixed order on PostgreSQL: DB-races "admin:reset-second-factor racing
  user:disable › lets the reset complete, then the disable revokes the session its fresh password opened" and
  "› refuses the reset as disabled when the disable holds the row first, changing nothing". Either way the
  administrator ends DISABLED with no session, and a fresh initial password opens none.
- The `admin:create` stdout layout (L66): DB-command "admin:create stdout (real PostgreSQL) › prints the notice, a
  newline, the password, and a newline on create and on reissue".
- The `PATCH /me` 400 body (L66): U-profile "PATCH /me › rejects <case> with the DTO's 400 body and keeps the
  stored name" for each of 14 invalid values.
- A′ (L62), closed by T11c (S52, below): DB-races "a first confirmation whose sibling-session delete fails ›
  ends both password-only sessions on their next use, with the 401 of a missing session" is a required test.

## T11 slice C tests (S52)

Unit tests (U-admin, "second-factor marker on sessions (S52)") run in `pnpm --filter @invitame/api test`; the
PostgreSQL tests run in `test:db`.

- The column: DB-marker "adds a NOT NULL boolean column whose default is false" and "reads false for a session row
  inserted without the column" (a row as it was before the migration). U-admin "declares the marker to Better Auth
  as a server-only boolean that defaults to false" pins `input: false`.
- Each marking path stores true: U-admin "stores true only for the session that completes the first TOTP
  confirmation", "stores true for a session opened with the TOTP code at sign-in", and "stores true for a session
  opened with a backup code at sign-in"; DB-marker "marks only the sessions that passed the second factor" proves
  the Prisma adapter writes it.
- Every other path stores false: U-admin "stores false for the password-only session of a pending administrator"
  and "stores false for a customer session opened with a sign-in code, and keeps serving it".
- Enforcement: U-admin "ends a password-only session of an enrolled administrator on <endpoint>, as a missing
  session" for `/me`, `/probe/admin`, `get-session`, and `list-sessions`; "ends an enrolled administrator's session
  that has no marker, as one opened before the migration"; DB-marker "ends an enrolled administrator's session that
  predates the marker and keeps a customer's".
- Regression tests (verifier, F1 to F4): U-admin "stores true for an enrolled administrator only on the exact
  verification endpoints"; "stores false for a pending administrator and for a customer on the verification
  endpoints"; "takes the marker from the endpoint alone: no sign-in body, path spelling, or server-side update sets
  it"; "stores false when a password sign-in is dressed as a verification endpoint"; "opens no marked session
  without a verified code: a wrong code, a replayed challenge, or disableSession"; "answers every Better Auth route
  to a password-only session of an enrolled administrator as to no session"; "refuses PATCH /me and the project
  routes to a password-only session of an enrolled administrator".
- Guard second check (F1): U-admin "refuses a password-only session whose account turns enrolled between the hook's
  read and the guard's". Update hook (F2): U-admin "refuses every session update that touches the marker".
- A′ with a failed sibling delete: DB-races "a first confirmation whose sibling-session delete fails" (above).
- Unchanged: U-admin "lists exactly four Better Auth endpoints in the pending-administrator allow list" and
  "keeps a pending administrator's unmarked session on the four allowed endpoints only"; "still serves customers
  on project routes"; "gives an enrolled administrator the administrator routes and /me". U-access and U-profile
  mark the session they promote to an enrolled administrator, because an unmarked one is now ended.
- Harness advisories (L74, L75): DB-races "sibling-delete matcher › accepts a token exclusion held directly or
  inside AND, and no other delete"; the held-transaction cleanup is one helper that rethrows a timeout; the
  stand-in client forwards `$transaction` options and keeps every other member; the lock probe of
  `prisma-own-profile.repository.db-spec.ts` is scoped to the disable transaction's backend with `pg_blocking_pids`.

## T11 slice B tests (S46 to S49, S53)

Unit tests run in `pnpm --filter @invitame/api test`, the database test in `test:db`.

- S46, the proxy secret is required by default: `auth/auth-proxy-secret.spec.ts` "the proxy secret is required
  unless a caller turns it off (S46, L71)" refuses a request without the secret or with a wrong one (403) when the
  option is omitted, refuses to build with no secret, and still serves without one when a caller passes `false`.
  Every other `createAuth` caller in a test now passes `requireProxySecret: false` explicitly.
- S47, the previous secret: the same file, "a previous secret is accepted while a rotation lasts (S47, L71)"
  (either secret serves and trusts the client IP header, any other gets 403). "refuses a secret that was accepted
  as the previous one once it is removed" builds with the secret as the previous one (200), then without it (403).
  "refuses to build with a previous secret and no current one" covers the guard rule (no client IP is trusted
  without a valid secret). `auth/auth-proxy-secret-comparison.spec.ts` shows one constant-time comparison per
  configured secret, whichever matches. `config/environment.spec.ts` "AUTH_PROXY_SECRET_PREVIOUS (rotation)"
  (optional, at least 32 characters, differs from `BETTER_AUTH_SECRET` and from `AUTH_PROXY_SECRET`, needs
  `AUTH_PROXY_SECRET`, never echoed). U-registration "serves a production request with the previous proxy secret
  during a rotation (S47)" and "refuses the previous proxy secret once it is removed from the configuration
  (S47)" (the same value, 200 then 403).
- S48, bidirectional controls: U-profile "PATCH /me › rejects the bidirectional control U+<code point> with the DTO's
  400 body and keeps the stored name" for each of the 12 code points, and "accepts the zero-width joiner of composed
  emoji and some scripts (S48)".
  `users/domain/display-name.spec.ts` covers the rule at its source: each of the 12 code points at the start, inside,
  at the end, alone, and in padding, and the neighbours that stay valid.
- S49, an invalid administrator creation time: `auth/session-settings.spec.ts` "administrator session expiry with an
  invalid creation time (S49, L71)" proves the stored session is already expired, reads as no session, and logs one
  `administrator_session_created_at_invalid` event without personal data; a valid time still gives 12 hours.
  "deletes the expired session and clears the cookie on the next read over HTTP" shows nothing extends it.
- S50, the operational log contract (the events and fields are in `overview.md`, "Operational log contract"). Each
  test asserts a whole event, so an extra field fails it, and where the input holds an address, a token, or a
  cookie it asserts that none appears in the log. `auth/operational-log.spec.ts` covers `session_refused` (one test
  per reason, and an allowed sign-in that logs nothing), `session_ended` (one per reason, the first reason when
  several apply, and an active customer that logs nothing), `session_update_refused` (both reasons, and a change
  that logs nothing), `administrator_sibling_sessions_delete_failed` (both deletes, and a success that logs
  nothing), and `administrator_enrollment_revert_result` (`reverted`, `unchanged`, `failed`, and `refuse` that keeps
  the earlier event alone). DB-races "a first confirmation whose sibling-session delete fails" asserts the same
  events through the real hooks on PostgreSQL, and DB-admin asserts the revert result next to the superseded and
  compensation events. `users/command-failure.spec.ts` covers the Prisma code in command failures, including a
  spawned `user:disable` against an unreachable database (`P1001`, no address or URL printed), and
  `users/application/reset-second-factor.use-case.spec.ts` the same for the recovery command. On the web,
  `lib/server/auth-session.test.ts` proves the cause of a failed administrator session read is kept and only its
  class is logged, and `lib/server/session-refresh.test.ts` "logs the short circuit as its own kind" separates
  `short-circuited` from `unavailable`.
- S53, the display-name write needs an ACTIVE account: DB-races "PATCH /me racing user:disable › does not store the
  name of a user disabled after the guard's session check (S53)" (R4, L30) is a required test. `PATCH /me` answers
  401, the name stays empty, and the next request gets 401.
  `users/infrastructure/prisma-own-profile.repository.db-spec.ts` proves the same statement on PostgreSQL: an ACTIVE
  account renames and clears, a DISABLED or unknown one answers null and keeps its name, and a disable that holds
  the row lock makes the waiting write store nothing.

## T11f tests (S55 to S57 and the verification findings, L79)

Unit tests run in `pnpm --filter @invitame/api test` and `pnpm --filter @invitame/web test`, the database test in
`test:db`.

- S55, `BETTER_AUTH_SECRETS` and `BETTER_AUTH_TRUSTED_ORIGINS` refused unless unset or exactly `""` (the rule is
  stated in the evidence document's S55 row, `m2-security-evidence.md`): `config/environment-library-variables.spec.ts`
  "variables that Better Auth reads by itself (S55) › refuses BETTER_AUTH_SECRETS, which would replace the validated
  BETTER_AUTH_SECRET" (the message names the variable and never echoes the value), "› refuses it in production too,
  where a replaced secret matters most", "› still accepts the validated environment without it", "› accepts an empty
  value, which Better Auth reads as absent (the e2e API sets both to empty)", and, for each of the two variables, "›
  refuses <name> holding only whitespace (<value>) and never echoes it" (four whitespace values). U-wiring "AppModule startup configuration › refuses to start with a
  BETTER_AUTH_SECRETS value (S55)" proves the startup through `AppModule`.
- S56, an explicit `NODE_ENV`: `config/environment.spec.ts` "NODE_ENV (S56) › is required: a missing value fails
  closed instead of turning every production rule off" (unset, empty, and blank), "› rejects a value outside
  development, production, and test, without echoing it", and "› accepts each of the three values". U-wiring
  "refuses to start with a missing NODE_ENV (S56)". The test environments that omitted `NODE_ENV` now pass
  `development` (the value the old default gave them) or `test`; no assertion changed. `config/env-example.spec.ts`
  "sets NODE_ENV explicitly, which the API requires (S56)" reads the committed `apps/api/.env.example`.
- S57, the rotation of `BETTER_AUTH_SECRET`, is documentation only (README, "Environment variables", and
  `overview.md`, "Better Auth in the API"); no test.
- N5, a bounded path in guard events: `auth/auth-proxy-secret.spec.ts` "the path in guard events is bounded (N5,
  L79) › cuts the path of auth_proxy_rejected at 128 characters and drops the query", the same for
  `client_ip_unresolved` and `auth_request_unavailable`, and "› keeps a short path whole". A 10,000-character path
  is logged as its first 128 characters, and no query string is logged.
- N6, a browser that leaves while the body is read: U-proxy "bounds and failures › answers 499 without a log when
  the browser leaves while the body is being read (N6)" answers `499` with the generic body, logs nothing, and
  never calls the API; "› still rethrows a body read error when the browser has not left" keeps every other error.
- R9 (T10a R4-001), a failing `close()` after the work: `users/reset-second-factor.command.spec.ts` "when closing
  the store fails after the reset committed (T10a R4-001, R9) › still resolves with exit code 0, prints the password
  once, and logs the class only" and "› keeps the exit code 1 of a refusal and of a store failure".
  `users/command-failure.spec.ts` "closeCommandStore" proves the helper that `admin:create` and `user:disable` share
  with the recovery command: a successful close reports nothing, and a failing one reports one line with the event,
  the class, and the Prisma code, never the message.
- S2, ownership through database constraints: DB-ownership "refuses a session, an account, and a two-factor row
  whose user does not exist", "deletes a user's sessions, accounts, and two-factor row together with the user",
  "allows one two-factor row per user and one account per provider and account id", and "stores only the declared
  roles and statuses".
- R2, the accepted invisible-character risk (T11b R1-001, L75): `users/domain/display-name-residual.spec.ts` pins
  the characters that still pass (U+200B, U+2060, an inner U+FEFF, U+2028, U+2029, U+00AD, U+034F, U+115F, U+3164,
  and a name made only of U+200B). U+180E is accepted too but is not pinned (the evidence document's R2 row lists
  both sets). A later rule that refuses them changes these tests on purpose.
- F1, `.env.example`: `config/env-example.spec.ts` "passes the startup validation once BETTER_AUTH_SECRET is
  filled in" and "names the web origin as AUTH_BASE_URL, one of the CORS_ORIGIN entries" now pass, because the owner
  set `AUTH_BASE_URL=http://localhost:3000` in `apps/api/.env.example` (`c12f6dc`).

## Findings routed to T9 (plan Log L35 to L44)

API- and database-bound findings are resolved in T9a. Findings in `apps/web` or that need a browser belong to
T9b: part A resolves the two L40 findings below, part B the L43 and L44 rows and the L52 rows it marks fixed, and
part C1 the L38 rows, R4-cuenta-outage-latency-serialized, and R3-concurrent-cookie-isolation-not-forced.
U-client, U-proxy, U-log, U-refresh, and U-config are the web unit suites `lib/server/api-client.test.ts`,
`auth-proxy.test.ts`, `server-log.test.ts`, `session-refresh.test.ts`, and `config.test.ts`.

| Log | Finding | Disposition |
| --- | --- | --- |
| L35 | R3-admin-cap-only-at-creation | DB-admin: "stores 12 hours for the enrollment session and for a second-factor sign-in". Every administrator session comes from the session create hook, and DB-create "refuses a customer address: no promotion and no password" shows no customer session can become an administrator's. A session row written outside Better Auth is not capped again on read; no code path writes one (T11 note). |
| L35 | R3-customer-refresh-via-guard-unproved | DB-profile: "› extends a customer session read through the project guard a day after its last refresh". |
| L35 | R4-silent-session-update-refusal (T9, T11) | DB-admin: "refuses a server-side session expiry change and leaves the stored row unchanged". Since T11d (S50) the refusal is logged as `session_update_refused`: `auth/operational-log.spec.ts` "session_update_refused: the update hook refuses a change". |
| L37 | R3-registration-require-proxy-secret-unproved | U-registration: production configuration refuses a request without the secret or with a wrong one with 403 before any query and logs the rejection; a request with the secret and a non-production request are served. |
| L37 | R3-db-spec-client-prefix-collision | Fixed in the harness: `ClientAddresses` draws each address at random, never repeats it within a suite, cleans up only its own rows, and gives each suite that counts rows on one address its own block (part C2, below). |
| L37 | Worker notes: `/me` does not check the proxy secret; behind the proxy, Better Auth's `Sec-Fetch` check falls back to its origin check. | Recorded for T11; not a T9a test. |
| L38 | R3-api-client-body-timeout-misclassified, R4-api-client-body-timeout-misclassified (T9, T11) | Fixed in part C1: U-client "getOwnProfile failures while the body arrives › maps a body that stalls past the deadline or breaks off to unavailable, not invalid-response". The client reads the body as text under the same deadline, so only a complete body that is not the contract is `invalid-response`. |
| L38 | R3-cookie-name-parse-without-equals | Fixed in part C1: U-client "sessionCookieHeader › drops a pair without '=', whatever its text (R3-cookie-name-parse-without-equals)". |
| L38 | R4-proxy-ignores-client-abort | Fixed in part C1: U-proxy "bounds and failures › stops the API call when the browser goes away, and logs no upstream failure". |
| L38 | R4-api-client-unavailable-drops-cause-and-logs-nothing (T9, T11) | Fixed in part C1: U-client "getOwnProfile failures while the body arrives › keeps the original error as the cause of an unavailable failure"; U-log "logApiCallFailure › adds the API client's fixed kind and the class of the cause, never their messages"; `PATCH /me` failures are logged as `own_profile_update_failed`. The owner approved the log fields (event, error class, kind, cause class) in L71; the contract is in `overview.md`, "Operational log contract" (S50, T11d). |
| L38 | R3-api-origin-rejects-equivalent-origins | Fixed in part C1 (owner's option A): U-config "parseWebServerConfig › accepts any spelling of a bare http(s) origin and stores its normalized form (R3-api-origin-rejects-equivalent-origins)" (`http://API:3001`, `http://api:80`, and `https://api:443/` become `http://api:3001`, `http://api`, and `https://api`) and "› rejects an API_ORIGIN that is not a bare http(s) origin, without echoing it" (a path other than `/`, a query or fragment, even empty, credentials, another scheme, or an unparsable value). The proxy still compares against the stored normalized origin. |
| L40 | R3-proxy-composition-unproved | E2E-customer (T9b part A). The route handler `app/api/auth/[...path]/route.ts` with the validated production web settings: "signs in through the web origin only and shows the account that GET /me returns" requests and enters a code through the proxy, receives the session cookie host-only on the web host (`127.0.0.1`, no `Domain`, `HttpOnly`, `SameSite=Lax`), and sends no request to any origin but the web's. `proxy.ts`: "ends the session, and the old session cookie no longer authorizes anything" replays the revoked cookie; `/` (outside the matcher, requested without a page, so the landing's prefetch of `/ingresar` cannot run first) keeps it, and `/cuenta` returns it cleared, which only `proxy.ts`'s session read through the proxy can do. Not proved in a browser: the extension of a live cookie after a day of use, which needs a day-old session; DB-profile "› extends a customer session read through the project guard a day after its last refresh" and the web unit tests of `session-refresh.ts` cover it. |
| L40 | R3-session-api-cookie-roundtrip-still-unproved | E2E-customer (T9b part A): `/cuenta` shows the email that only `GET /me` returns for the browser's cookie ("signs in through the web origin only..."); "shows each customer only their own account when two customers browse at once" proves the process-wide API client uses each request's own cookie, with both reads in flight at once (part C1); after sign-out, a replayed cookie gets no account on `/cuenta` and `null` from `GET /api/auth/get-session` ("ends the session..."). |
| L40 | R4-cuenta-outage-latency-serialized | Fixed in part C1: U-refresh "the outage notice for the page (R4-cuenta-outage-latency-serialized) › never lets a browser's own copy of the header reach the page" and "› answers unavailable at once, without the API read, after a failed refresh" and "refreshSessionCookies with a fake proxy › reports the API unavailable on a 5xx from the proxy, and available otherwise". Against an API that never answers, `/cuenta` showed its unavailable notice after 3.0 s instead of 13.0 s (manual check, not a suite). |
| L43 | R3-admin-form-transitions-untested | E2E-admin (T9b part B). `/admin/ingresar`: "keeps a wrong or incomplete password step on the form with the existing messages" (an invalid address and a missing password without any `/api/auth` request, then a wrong password, with no code step and no cookie); "signs in with the password and then the app's code; a wrong code grants nothing" (an incomplete and a wrong code, no cookie and a `null` session, then the right code); "signs in with a backup code instead, and each backup code works only once" (a wrong backup code, the switch back to the app's code and to the password step with focus, the right code, and the same code refused after sign-out). |
| L43 | R3-get-auth-session-wiring-unproved | E2E-admin: only `getAuthSession` through the web's proxy tells a pending administrator (sent to `/admin/activar` from `/admin` and `/admin/ingresar`), an enrolled one (sent to `/admin`), a customer (sent to `/cuenta`), and an anonymous visitor (sent to `/admin/ingresar`) apart, with the validated production web settings: the enrollment test, "sends anonymous visitors to sign in and customers to their own account", and the sign-in tests; "ends the session, and the old session cookie no longer opens the panel" replays the revoked cookie. |
| L43 | R4-admin-session-failure-undiagnosable (T9, T11) | Part B: a failed browser test keeps its screenshot and trace, CI uploads them, and the servers' output, including the web's `auth_session_read_failed` line, is in the job log. Since T9b part C1, that line also carries the API client's fixed failure kind and the class of its cause, never a status or message. Since T11d, a failed proxy call of that read keeps its cause: `lib/server/auth-session.test.ts` "readAuthSession › keeps the proxy's failure as the cause and logs its class only (S50, L71)". Remains for T11: no browser test forces a failed session read; `lib/server` is outside part B. |
| L44 | R3-activar-page-routing-unproved | E2E-admin: anonymous visitors are sent from `/admin/activar` to `/admin/ingresar`, customers to `/cuenta`, enrolled administrators to `/admin` (also right after enrollment, without the backup codes), and a pending administrator stays (the enrollment test). |
| L44 | R3-enrollment-flow-transitions-untested | E2E-admin: "enrolls with the key read below the QR code and shows the backup codes once" goes through a missing and a wrong password, the QR code and the setup key, an incomplete and a wrong code (`twoFactorEnabled` stays false), the right code (true), the backup codes without the key or the QR code, and the unchecked box; "tells the administrator to sign in again when the session ends during enrollment" covers the ended session and its link; "tells the administrator to sign in again when the confirmation was superseded (S45)" (added in T10) answers the page's `verify-totp` with the API's `401 ENROLLMENT_SUPERSEDED` and requires the superseded message, the same link to `/admin/ingresar` (not followed: the stubbed answer leaves the pending session valid), and no ended-session message. |
| L44 | R3-qr-medium-correction-test-vacuous | Fixed in `lib/admin/qr.test.ts`: "uses at least the medium error correction..." now requires the medium-floor matrix for a URI whose lowest level fits a smaller version; drawn without the floor, the test fails (checked once by removing it). |
| L52 | R2-mailpit-error-placeholder-base, R2-other-customer-email-duplicates-fixture, R2-receive-code-unwrap-repeated | Fixed in the harness: the Mailpit error names the request's own path; `newCustomerEmail()` and `receiveSignInCode()` replace the copies. |
| L52 | R3-ci-failure-artifacts-discarded, R4-browser-tests-failure-artifacts-discarded | Fixed: failed tests keep a trace and a screenshot, and the `browser-tests` job uploads them as `browser-test-failures` when it fails. |
| L52 | R3-concurrent-cookie-isolation-not-forced | Proved without a production change in part C1: E2E-customer "shows each customer only their own account when two customers browse at once" holds both renders' `GET /me` in the harness-only API gate until both are in flight and requires the hold's outcome `released`. It fails with `timeout` when the reloads run one after the other, and when the API client shares one `GET /me` between cookies. |
| L52 | R3-rate-limit-loop-alert-assertion-stale | Fixed: each wrong attempt is checked by its `400`, and the alert once after the third, since its text does not change between attempts. |
| L52 | R3-web-bound-ipv4-browser-uses-localhost | Fixed: the browser, Better Auth's base URL, and the API's trusted origin use `http://127.0.0.1:<port>`, the address the web binds to. |
| L52 | Verification: a browser without a cookie, and the harness's refusal of a missing or remote URL | E2E-customer "sends a browser without a session cookie from /cuenta to /ingresar" (also `null` from `get-session`); `e2e/support/environment.test.ts`, run by `pnpm --filter @invitame/web test`. |
| L55 | S42: no form puts a field in a URL, also without JavaScript (T8e) | E2E-forms: "/admin/ingresar never puts the email or the password in a URL", "/admin/activar never puts the password in a URL" (with a pending administrator's session), and "/ingresar never puts the email in a URL" each submit by a click and by Enter on a fresh page; no request carries a field value in its URL, the page URL has no query string, and the form shows its line asking for JavaScript. Against the forms before T8e every attempt failed, naming `/admin/ingresar?email=…&password=…`, `/admin/activar?password=…`, and `/ingresar?email=…`. With JavaScript, the submit and sign-out buttons wait for the page to be interactive (`lib/customer/interactive.test.ts`), and E2E-customer and E2E-admin keep passing. |
| L55 | R3-sign-out-retry-not-idempotent, R4-signout-retry-cannot-recover-after-navigation | Fixed in E2E-admin (T8e): `signOutOfPanel` waits for the enabled «Cerrar sesión», clicks it once, and requires exactly one `POST /api/auth/sign-out` before the sign-in page; it no longer retries the click. |
| L48 | R3-counted-range-shared-by-three-suites | Fixed in part C2: DB-auth, DB-limits, and DB-proxy each draw from their own block of 198.19.0.0/16 (`ClientAddresses("auth.prisma")` and so on), so suites in parallel processes cannot share a counted address. |
| L48 | R3-tampered-cookie-case-vacuous | Fixed in part C2: DB-profile "denied by default › answers GET /me and PATCH /me with 401 without a usable session and writes nothing" signs the live session's token with another secret and gets 401, while the same token signed right gets 200; only then is the row deleted. Signed with the real secret, the case fails (200). |
| L55 | R1-ci-failure-artifact-holds-test-credentials | Part C2: the `browser-test-failures` artifact is kept for one day, and the workflow and [quality gates](quality-gates.md#browser-end-to-end-tests) say what a trace can hold (that run's test addresses, passwords, codes, setup keys, and cookies, valid only against the job's database). |
| L55 | R2-backup-code-count-literal-repeated, R2-test-address-domain-duplicated, R2-wrong-totp-offset-window-unexplained | Fixed in part C2: `BACKUP_CODE_COUNT` and `newTestEmail()` replace the copies, and `STEPS_ACCEPTED_SOON` explains the window in `e2e/support/totp.ts`. |
| L55 | R3-e2e-unit-tests-collected-by-playwright | Part C2: not reproduced (`testMatch` already collected only the `*.spec.ts` files); `testIgnore` now excludes `*.test.ts` explicitly. |
| L55 | Verification: the administrator script's refusal; `apps/api/test` under `pnpm typecheck`; the QR level; the CI comment | Part C2: `e2e/support/administrator-script.test.ts` (exit 2 and the usage line without exactly one argument; exit 1 with an `AssertionError` line, an empty stdout, and no database URL or Prisma error for a missing or non-local `DATABASE_URL`; since T10 it checks those lines, not the whole of stderr, so a runtime warning cannot fail it); `apps/api/tsconfig.json` includes `test/**/*.ts` and the build excludes it; `lib/admin/qr.test.ts` "uses at least the medium error correction..." accepts M, Q, or H and fails when the floor is removed; the CI comment as above. |
| L56 | R3-interactive-transition-asserted-by-constants, R3-signout-noscript-line-unproved | E2E-forms (part C2): "controls that act only through JavaScript › stay disabled in the server's render and are enabled once the page is interactive" fails when the hook never turns true, and "› sign-out shows its line asking for JavaScript on /cuenta and /admin" fails without the button's `<noscript>`. |
| L59 | R3-abort-test-hangs-on-regression | Fixed in part C2: U-proxy "bounds and failures › stops the API call when the browser goes away..." has a 2-second test timeout; without the browser's signal it fails after 2 seconds. |
| L59 | R3-outage-header-wiring-unproved | `proxy.test.ts` (part C2) drives `proxy.ts` against a local API: a browser's own `x-invitame-api-unavailable` never reaches the page, with or without a refresh, and the proxy sets it only when its own refresh gets a 5xx. It fails when `proxy.ts` passes the browser's headers through or ignores the refresh outcome. |
| L59 | R3-gate-upstream-response-error-unhandled, R2-gate-ready-path-duplicated-literal, R2-missing-cookie-masked-as-gate-refusal | Fixed in part C2: `e2e/support/api-gate-server.test.ts` "breaks off the web's request when the API's answer breaks off, and keeps serving" (without the fix the request stayed open, and the test fails at its 5-second bound); `playwright.config.ts` reads `GATE_READY_PATH`; E2E-customer requires both session cookies by name before arming the hold. |
| L59 | Verification: more `API_ORIGIN` spellings | U-config "› accepts any spelling of a bare http(s) origin..." also stores `HTTP://api:3001`, `http://api:3001/.`, and `http://api:3001/` as `http://api:3001` (part C2). |
| L31 | A TOTP confirmation that runs while `admin:create` reissues a password must fail closed (T9, T11). | DB-admin: "fails closed when admin:create reissues the password during the first TOTP confirmation" and the T7c variants in row 10; see defect T9a-D1 (fixed). |

Earlier database-suite findings also resolved by the shared harness: the order coupling, cleanup outside
`finally`, identifier substring match, and random client IP collisions of L17, and
R3-db-spec-client-ip-collisions of L25. Other findings routed to T9 before L35 are not revisited in T9a.

## Fixed defect

**T9a-D1: an enrollment confirmation that raced an `admin:create` reissue enrolled the administrator.** Fixed in
T7c (S39, L48). The DB-admin tests force the race deterministically: a wrapped Prisma client runs the real
reissue transaction (or `user:disable`) right after `/two-factor/verify-totp` has read the unconfirmed
`TwoFactor` row. Before the fix, observed on PostgreSQL 17, the confirmation answered 200, set a session cookie,
stored a 12-hour session, and set `twoFactorEnabled` to true although the reissue had deleted the `TwoFactor` row
and every session. Cause: Better Auth 1.7.16 `verify-totp` sets the flag, creates the session, and sets the
cookie in separate statements without a condition.

Before T7d, observed on PostgreSQL 17: a stale confirmation that finished after the reissued password had enrolled,
and a duplicate submit whose sibling had completed, answered 200 with a session cookie; a duplicate submit whose
sibling was still completing reverted the sibling's enrollment; and a pending session opened in a second tab
still read itself after enrollment completed in the first.

Current behavior (T7c, hardened in T7d, S40): the session-create hook (`auth/auth.factory.ts`,
`settleFirstConfirmation` and `refuseSupersededConfirmation` in `auth/administrator-enrollment.ts`) decides
every session that `verify-totp` creates for an `ADMIN` whose flag is already true. The endpoint stores the
session it resolved on its own context, which the hook receives; a sign-in challenge has none and is allowed.
A first confirmation is allowed only while its pending session still exists for the same user, and the hook
then deletes every other session of that user, so no session opened with the password alone keeps authority
after enrollment. Otherwise the confirmation was superseded and is refused with
`401 {"code":"ENROLLMENT_SUPERSEDED"}`, so no session row and no cookie exist:

- without reverting (`compensation: "skipped"`) when the `TwoFactor` row is verified (another confirmation
  completed) or when a session of the user was created at or after the pending one (a duplicate submit may be
  completing, or a second tab signed in with the password alone). For a newer session the hook first deletes
  every session of the user, so no session keeps authority without the second factor;
- with a revert (`compensation: "reverted"`) when the user is not `ACTIVE`, the credential account is missing or
  was issued after the pending session began (an `admin:create` reissue), or nothing else explains the missing
  session (a sign-out). The revert sets `twoFactorEnabled` from true back to false for that user only, and the
  reissued or same password then signs in to a pending session and can enroll.

The hook logs one `administrator_enrollment_superseded` event with the path and `compensation` and no personal
data. If the revert throws, one `administrator_enrollment_compensation_failed` event with the path and the error
class follows and the refusal stands. The tests above are required; none carries the `todo` option.

Residual risk (accepted in L48 and L49): if the revert fails or the process stops between Better Auth's flag
update and the revert, the flag stays true without a session (and, after a reissue, without a `TwoFactor` row).
The account then fails closed: `admin:create` refuses to reissue an enrolled administrator, and only the manual
recovery procedure (T10) releases it. The same locked state follows the remaining races, which all fail closed:
the window between the hook's checks and the revert, clock skew between `admin:create` and the API, and a second
tab that confirms like a double submit.
