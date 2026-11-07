# ADR 0004 test traceability

Maps every test obligation of [ADR 0004](../adr/0004-authentication-with-better-auth.md) (its Consequences) and
every S17 case of the Milestone 2 plan to a named assertion (S13, S30). Status: current as of Milestone 2 task
T8e. Browser end-to-end coverage exists for the customer flows (see the L40 rows below), the administrator flows
(see the L43, L44, and L52 rows), and form submission without JavaScript (see the L55 rows); the T9b part C
findings are listed without a test.

## How the evidence runs

- **Database suites** (`apps/api/src/**/*.db-spec.ts`) run the production `createAuth`, the project guard, and
  the Prisma adapter against a real, migrated PostgreSQL 17. They run through
  `pnpm --filter @invitame/api test:db`, locally against a disposable database and in CI in the
  `database-tests` job of [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), on every push to `master`
  or `main` and every pull request. The shared harness [`apps/api/test/database.ts`](../../apps/api/test/database.ts)
  refuses a missing or non-local `DATABASE_URL` and gives every suite its own client addresses.
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
| E2E-customer | [`apps/web/e2e/customer-session.spec.ts`](../../apps/web/e2e/customer-session.spec.ts) |

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
| 10 | Enrollment gate | DB-admin: "gates a pre-enrollment session, then enrolls, then requires the second factor", "deletes a pre-enrollment session once the window ends and refuses enrollment", "refuses an expired initial password exactly like a wrong one and creates no session", "fails closed when admin:create reissues the password during the first TOTP confirmation" (added; required since T7c, defect T9a-D1 below), "refuses the old confirmation after the reissued password has started a new enrollment", "refuses a first TOTP confirmation that races user:disable and leaves no session", "logs one administrator_enrollment_superseded event without personal data when it reverts a confirmation", and "lets an enrolled administrator pass the sign-in challenge with a stale session cookie" (added in T7c); "refuses a stale first confirmation without reverting after the reissued password enrolled", "refuses a duplicate first confirmation without reverting when the sibling completed first", "refuses a duplicate first confirmation without reverting and ends every session while the sibling is completing", "reverts a first confirmation that races a sign-out, then lets the password enroll", "ends a second tab's session when it refuses a confirmation that races a sign-out", "refuses with 401 and logs compensation_failed when the revert itself fails", and "ends every other session of the administrator at a successful first confirmation" (added in T7d). | U-admin: "enrollment gate (S6, S21)" and "pre-enrollment window of 24 hours (S20)" blocks. |
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

## Findings routed to T9 (plan Log L35 to L44)

API- and database-bound findings are resolved in T9a. Findings in `apps/web` or that need a browser belong to
T9b: part A resolves the two L40 findings below, part B the L43 and L44 rows and the L52 rows it marks fixed; the
others wait for part C.

| Log | Finding | Disposition |
| --- | --- | --- |
| L35 | R3-admin-cap-only-at-creation | DB-admin: "stores 12 hours for the enrollment session and for a second-factor sign-in". Every administrator session comes from the session create hook, and DB-create "refuses a customer address: no promotion and no password" shows no customer session can become an administrator's. A session row written outside Better Auth is not capped again on read; no code path writes one (T11 note). |
| L35 | R3-customer-refresh-via-guard-unproved | DB-profile: "› extends a customer session read through the project guard a day after its last refresh". |
| L35 | R4-silent-session-update-refusal (T9, T11) | DB-admin: "refuses a server-side session expiry change and leaves the stored row unchanged". The refusal still logs nothing; whether it should is a T11 decision. |
| L37 | R3-registration-require-proxy-secret-unproved | U-registration: production configuration refuses a request without the secret or with a wrong one with 403 before any query and logs the rejection; a request with the secret and a non-production request are served. |
| L37 | R3-db-spec-client-prefix-collision | Fixed in the harness: `ClientAddresses` draws each address at random, never repeats it within a suite, cleans up only its own rows, and keeps suites that count rows on one address in a range no other suite uses. |
| L37 | Worker notes: `/me` does not check the proxy secret; behind the proxy, Better Auth's `Sec-Fetch` check falls back to its origin check. | Recorded for T11; not a T9a test. |
| L38 | R3-api-client-body-timeout-misclassified, R3-api-origin-rejects-equivalent-origins, R3-cookie-name-parse-without-equals, R4-proxy-ignores-client-abort, R4-api-client-unavailable-drops-cause-and-logs-nothing (T9, T11), R4-api-client-body-timeout-misclassified (T9, T11) | `apps/web` server code: T9b part C. |
| L40 | R3-proxy-composition-unproved | E2E-customer (T9b part A). The route handler `app/api/auth/[...path]/route.ts` with the validated production web settings: "signs in through the web origin only and shows the account that GET /me returns" requests and enters a code through the proxy, receives the session cookie host-only on the web host (`127.0.0.1`, no `Domain`, `HttpOnly`, `SameSite=Lax`), and sends no request to any origin but the web's. `proxy.ts`: "ends the session, and the old session cookie no longer authorizes anything" replays the revoked cookie; `/` (outside the matcher) keeps it, and `/cuenta` returns it cleared, which only `proxy.ts`'s session read through the proxy can do. Not proved in a browser: the extension of a live cookie after a day of use, which needs a day-old session; DB-profile "› extends a customer session read through the project guard a day after its last refresh" and the web unit tests of `session-refresh.ts` cover it. |
| L40 | R3-session-api-cookie-roundtrip-still-unproved | E2E-customer (T9b part A): `/cuenta` shows the email that only `GET /me` returns for the browser's cookie ("signs in through the web origin only..."); "shows each customer only their own account when two customers browse at once" proves the process-wide API client uses each request's own cookie; after sign-out, a replayed cookie gets no account on `/cuenta` and `null` from `GET /api/auth/get-session` ("ends the session..."). |
| L40 | R4-cuenta-outage-latency-serialized | Outage latency of `/cuenta`: T9b part C. |
| L43 | R3-admin-form-transitions-untested | E2E-admin (T9b part B). `/admin/ingresar`: "keeps a wrong or incomplete password step on the form with the existing messages" (an invalid address and a missing password without any `/api/auth` request, then a wrong password, with no code step and no cookie); "signs in with the password and then the app's code; a wrong code grants nothing" (an incomplete and a wrong code, no cookie and a `null` session, then the right code); "signs in with a backup code instead, and each backup code works only once" (a wrong backup code, the switch back to the app's code and to the password step with focus, the right code, and the same code refused after sign-out). |
| L43 | R3-get-auth-session-wiring-unproved | E2E-admin: only `getAuthSession` through the web's proxy tells a pending administrator (sent to `/admin/activar` from `/admin` and `/admin/ingresar`), an enrolled one (sent to `/admin`), a customer (sent to `/cuenta`), and an anonymous visitor (sent to `/admin/ingresar`) apart, with the validated production web settings: the enrollment test, "sends anonymous visitors to sign in and customers to their own account", and the sign-in tests; "ends the session, and the old session cookie no longer opens the panel" replays the revoked cookie. |
| L43 | R4-admin-session-failure-undiagnosable (T9, T11) | Part B: a failed browser test keeps its screenshot and trace, CI uploads them, and the servers' output, including the web's `auth_session_read_failed` line, is in the job log. Remains for T11: that line carries the error class only (`ApiClientError`), not its kind or status, and no browser test forces a failed session read; `lib/server` is outside part B. |
| L44 | R3-activar-page-routing-unproved | E2E-admin: anonymous visitors are sent from `/admin/activar` to `/admin/ingresar`, customers to `/cuenta`, enrolled administrators to `/admin` (also right after enrollment, without the backup codes), and a pending administrator stays (the enrollment test). |
| L44 | R3-enrollment-flow-transitions-untested | E2E-admin: "enrolls with the key read below the QR code and shows the backup codes once" goes through a missing and a wrong password, the QR code and the setup key, an incomplete and a wrong code (`twoFactorEnabled` stays false), the right code (true), the backup codes without the key or the QR code, and the unchecked box; "tells the administrator to sign in again when the session ends during enrollment" covers the ended session and its link. |
| L44 | R3-qr-medium-correction-test-vacuous | Fixed in `lib/admin/qr.test.ts`: "uses at least the medium error correction..." now requires the medium-floor matrix for a URI whose lowest level fits a smaller version; drawn without the floor, the test fails (checked once by removing it). |
| L52 | R2-mailpit-error-placeholder-base, R2-other-customer-email-duplicates-fixture, R2-receive-code-unwrap-repeated | Fixed in the harness: the Mailpit error names the request's own path; `newCustomerEmail()` and `receiveSignInCode()` replace the copies. |
| L52 | R3-ci-failure-artifacts-discarded, R4-browser-tests-failure-artifacts-discarded | Fixed: failed tests keep a trace and a screenshot, and the `browser-tests` job uploads them as `browser-test-failures` when it fails. |
| L52 | R3-concurrent-cookie-isolation-not-forced | T9b part C. |
| L52 | R3-rate-limit-loop-alert-assertion-stale | Fixed: each wrong attempt is checked by its `400`, and the alert once after the third, since its text does not change between attempts. |
| L52 | R3-web-bound-ipv4-browser-uses-localhost | Fixed: the browser, Better Auth's base URL, and the API's trusted origin use `http://127.0.0.1:<port>`, the address the web binds to. |
| L52 | Verification: a browser without a cookie, and the harness's refusal of a missing or remote URL | E2E-customer "sends a browser without a session cookie from /cuenta to /ingresar" (also `null` from `get-session`); `e2e/support/environment.test.ts`, run by `pnpm --filter @invitame/web test`. |
| L55 | S42: no form puts a field in a URL, also without JavaScript (T8e) | E2E-forms: "/admin/ingresar never puts the email or the password in a URL", "/admin/activar never puts the password in a URL" (with a pending administrator's session), and "/ingresar never puts the email in a URL" each submit by a click and by Enter on a fresh page; no request carries a field value in its URL, the page URL has no query string, and the form shows its line asking for JavaScript. Against the forms before T8e every attempt failed, naming `/admin/ingresar?email=…&password=…`, `/admin/activar?password=…`, and `/ingresar?email=…`. With JavaScript, the submit and sign-out buttons wait for the page to be interactive (`lib/customer/interactive.test.ts`), and E2E-customer and E2E-admin keep passing. |
| L55 | R3-sign-out-retry-not-idempotent, R4-signout-retry-cannot-recover-after-navigation | Fixed in E2E-admin (T8e): `signOutOfPanel` waits for the enabled «Cerrar sesión», clicks it once, and requires exactly one `POST /api/auth/sign-out` before the sign-in page; it no longer retries the click. |
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
`decideFirstConfirmation` and `refuseSupersededConfirmation` in `auth/administrator-enrollment.ts`) decides
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
