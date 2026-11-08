# Milestone 2 security evidence

Evidence for the human sign-off of Milestone 2 (task T11, S2): the independent verification of every spec on
`e8c092a` (2026-11-08), what the T11f slice then fixed or documented (L79), and the risks and decisions that stay
open. It maps specs to code and tests; the test names are in
[ADR 0004 test traceability](adr-0004-test-traceability.md). Status: current as of T11f. This document records
evidence and does not change a decision; [ADR 0004](../adr/0004-authentication-with-better-auth.md) and the
[Milestone 2 plan](../../odd/tasks/m2-identity.md) hold the decisions.

## Summary

- **Verdicts for S1 to S54:** 54 PASS, 0 PARTIAL, 0 FAIL after the owner's sign-off (L81); the verification itself
  found 53 PASS and S2 PARTIAL. S55 to S57 were decided after the verification (L79) and
  are covered by T11f.
- **S2 is PASS: the owner signed off on 2026-11-08 (L81)**, accepting the residual risks below. Its third clause,
  "human-approved security evidence", is that sign-off. The first two clauses hold, and T11f added the foreign-key test that was missing.
- **Rubric:** a clause the plan lists as a non-goal (Railway hosting, domain, live Resend) is noted, not scored.
  S7 and S11 are PASS on their in-scope parts.
- **Findings:** the verification reproduced six new findings (N1 to N6), the T10a close failure (R9), and the
  traceability and ADR fixes (F5). T11f fixed or documented all of them. F1 (`apps/api/.env.example`) was fixed by
  the owner in `c12f6dc`; N4 was closed by deleting `apps/web/.env.local.example` with the owner's authorization (L82). See "Verification findings and their resolution".

## Gate runs

Verification on `e8c092a`, each command wrapped in `perl -e 'alarm shift; exec @ARGV' <seconds> <cmd>`:

| Gate | Result |
| --- | --- |
| `pnpm --filter @invitame/api test` | 438 tests, 83 suites, 438 pass, 0 fail, 0 skipped, 0 todo |
| `pnpm --filter @invitame/web test` | 266 tests, 60 suites, 266 pass, 0 fail, 0 skipped, 0 todo |
| `pnpm typecheck` | exit 0 (both packages ran, no cache hit) |
| `pnpm lint` | exit 0; 2 warnings in `sign-in-code-sender.ts` (`useImportType`, DI value imports, R18) |
| `pnpm format:check` | 207 files, no fixes applied |
| `pnpm docs:check` | passed, 22 Markdown files |
| `test:db` | 83 tests, 24 suites, 83 pass, on `postgres:17-alpine` after 3 migrations |
| CI on the tracker branch | the two runs before the verification completed with success |

The verification did not run Playwright (CI only; the plan counts 20 browser tests), `pnpm build`, or
`git diff --check`. CI runs both in its quality-gates job.

T11f after the owner's `.env.example` edit (F1, `c12f6dc`) and the review follow-ups, on a disposable
`postgres:17-alpine`. The 499, 270, and 87 counts below were taken after that edit, so `config/env-example.spec.ts`
passes:

| Gate | Result |
| --- | --- |
| `pnpm --filter @invitame/api test` | 499 tests, 499 pass, 0 fail |
| `pnpm --filter @invitame/web test` | 270 tests, 270 pass, 0 fail |
| `test:db` | 87 tests, 87 pass (83 plus the four tests of S2's foreign keys) |
| `pnpm typecheck`, `pnpm format:check`, `git diff --check` | pass |
| `pnpm lint` | pass, with the 2 known `useImportType` warnings in `sign-in-code-sender.ts` |

The native reviews of T11f added four follow-ups, each reviewed on its own:

- a body read that fails with an `AbortError` before the request signal reports the abort also answers
  `499` (N6);
- `BETTER_AUTH_SECRETS` and `BETTER_AUTH_TRUSTED_ORIGINS` are refused unless unset or exactly `""`, because Better
  Auth reads the raw value (the rule is stated in the S55 row);
- `admin:create` and `user:disable` expose run functions whose tests pin the close-failure wiring (R9);
- `admin:create` starts only on a direct run (`require.main === module`), pinned by two spawned tests.

## Spec verdicts

Path prefixes: `a:` is `apps/api/src/`, `w:` is `apps/web/`. Test aliases:

- AC = `a:auth/access-control/access-control.spec.ts`
- AS = `a:auth/administrator-sign-in.spec.ts`
- ADB = `a:auth/administrator-sign-in.prisma.db-spec.ts`
- RACE = `a:auth/account-state-races.prisma.db-spec.ts`
- SIC = `a:auth/sign-in-code/sign-in-code.spec.ts`
- SICDB = `a:auth/sign-in-code/sign-in-code.prisma.db-spec.ts`
- SS = `a:auth/session-settings.spec.ts`
- APS = `a:auth/auth-proxy-secret.spec.ts`
- WIRE = `a:auth/auth.wiring.spec.ts`
- ENVT = `a:config/environment.spec.ts`
- ENVL = `a:config/environment-library-variables.spec.ts` (T11f)
- OPL = `a:auth/operational-log.spec.ts`
- PROF = `a:users/own-profile.prisma.db-spec.ts`
- OWN = `a:users/identity-ownership.prisma.db-spec.ts` (T11f)
- ABU = `a:auth/abuse-limits.spec.ts`
- EDS = `a:email/application/email-delivery.service.spec.ts`
- HES = `a:email/infrastructure/http-email-senders.spec.ts`
- PROXY = `w:lib/server/auth-proxy.test.ts`
- E2E-C / E2E-A / E2E-F = `w:e2e/customer-session.spec.ts` / `admin-session.spec.ts` / `form-submission.spec.ts`

Browser-only evidence comes from the CI run, not from a local run.

| S | Verdict | Implementation | Tests | Note |
| --- | --- | --- | --- | --- |
| S1 | PASS | `a:auth/access-control/access-control.ts:94-147`; `a:users/presentation/own-profile.controller.ts:47-72`; `w:lib/server/auth-proxy.ts` | AC:257-300; PROF:243,276,301; AS:585-720; E2E-C:52,217 | All five clauses asserted. |
| S2 | **PASS**, signed off by the owner on 2026-11-08 (L81) | FKs `a:../prisma/migrations/20261104030448_add_better_auth_identity/migration.sql:100-106`; `schema.prisma:58-121` | AC:266,270; PROF:243; OWN (T11f) | Clauses 1 and 2 hold, and OWN now pins the foreign keys, cascades, and uniqueness on PostgreSQL. Clause 3 is the owner's sign-off (L81). |
| S3 | PASS | no `socialProviders`; `auth.factory.ts:85` disables `/link-social`; no invitation model in `schema.prisma` | `auth.integration.spec.ts:139-150` (`/sign-in/social` gives 404 `PROVIDER_NOT_FOUND`); AC:428-470 | `/callback/google` gives 302 with no cookie. |
| S4 | PASS | `apps/api/package.json` exact pins; `auth.registration.ts:47-53` | `auth.integration.spec.ts:63-200` | Fallback not needed (ADR Outcome). |
| S5 | PASS | `auth.factory.ts:169-171,216-218`; `schema.prisma:40-121` | `auth.prisma.db-spec.ts:111,144` | |
| S6 | PASS | `auth.factory.ts:163-168,365-389`; `account-access.ts:131-180`; `a:users/create-administrator.command.ts:27-65` | SIC:696-775; AS:339-440,585-930; ADB:179 | |
| S7 | PASS | `session-settings.ts`; `auth-request-guard.ts`; `w:lib/server/config.ts` | SS:240-598; APS:122-505; PROXY:178-310 | Hosting half is a non-goal (ADR Outcome). |
| S8 | PASS | `a:app.setup.ts:24-29`; `a:config/environment.ts` | WIRE:223-290; ENVT:118-139,233-246; PROF:349 | |
| S9 | PASS | `access-control.ts:94-147`; `auth.factory.ts:222-233` | AC:257-426; AS:344,363; SIC:727-765 | |
| S10 | PASS | `a:auth/abuse-limits.ts`; `auth.factory.ts:181-194` | ABU:122-255; `abuse-limits.prisma.db-spec.ts:85,105`; SIC:207,387-447 | |
| S11 | PASS | `a:email/application/email-delivery.service.ts:16-26`; `resend-email-sender.ts:56`; `docker-compose.yml:23` | EDS:88-273; HES:119-316; `email.module.spec.ts:47-61`; SIC:332 | Live Resend not exercised (non-goal). |
| S12 | PASS | `a:config/environment.ts` | ENVT:38-654; WIRE:89-151; `env-example.spec.ts` (T11f) | `.env.example` contradicted it (F1); fixed in `c12f6dc`, and `env-example.spec.ts` now passes. |
| S13 | PASS | ADR `:194-228` | `auth.integration.spec.ts`; the `test:db` suites | Migration review recorded in L15, L17. |
| S14 | PASS | `session-settings.ts:56-65`; `w:lib/server/auth-proxy.ts` | SS:481-598; E2E-C:52 | |
| S15 | PASS | `sign-in-code-message.ts:4-6`; `auth.factory.ts:373-388` | SIC:387-447; SICDB:144,208,234 | |
| S16 | PASS | `session-settings.ts:10-17`; `auth.factory.ts:195-203,292-306` | SS:240-480; ADB:263,362; PROF:316 | |
| S17 | PASS | traceability "S17 cases" | WIRE:266; AS:344; AC:369-426; SIC:207; PROF:349; SICDB:257 | Every quoted name exists. |
| S18 | PASS | `auth.factory.ts:203`; `session-access-hook.ts:86-94`; `a:users/infrastructure/prisma-user-access.repository.ts:8-28` | AC:279,289,346,352; `prisma-user-access.repository.db-spec.ts:122,140` | |
| S19 | PASS | `auth-request-guard.ts` | ABU:153-196 | |
| S20 | PASS | `a:users/application/initial-password.ts:4-37`; `create-administrator.command.ts:33-52`; `account-access.ts:19,83-94` | `create-administrator.use-case.spec.ts:53-72`; `create-administrator.command.db-spec.ts:85,101`; AS:415,490-583 | |
| S21 | PASS | `administrator-enrollment.ts:52-57`; ADR `:56-100` | AS:585-720 | One stale name in the clause table (F5, fixed in T11f). |
| S22 | PASS | `account-access.ts:139,170-171` | AS:930-1006; SICDB:195,286 | |
| S23 | PASS | `a:auth/sign-in-code/sign-in-code-sender.ts` | SIC:285-385; `sign-in-code-sender.spec.ts:134-195`; SICDB:170 | |
| S24 | PASS (amends ADR 8) | `auth.factory.ts:380-387` | SIC:207-257; SICDB:257 | Timing is not measured; the doc says so. |
| S25 | PASS | `abuse-limits.ts:4,22-35` | ABU:124; SIC:447-672; `abuse-limits.prisma.db-spec.ts:85,105` | The cap is accepted risk R1. |
| S26 | PASS (doc) | ADR `:157-158` is the only logging rule | `docs:check` | |
| S27 | PASS (doc) | ADR `:3-18` | none | |
| S28 | PASS | `email-delivery.service.ts:16-18,116-121` | EDS:88,107,123 | Numbers are in code and overview, not in the ADR text. |
| S29 | PASS | `email-delivery.service.ts:25-26,137-161` | EDS:206-258 | Same as S28. |
| S30 | PASS | `docs/development/adr-0004-test-traceability.md` | cross-check below | 12 obligations and the S17 cases all resolve. |
| S31 | PASS | `resend-email-sender.ts:56`; `sign-in-code-sender.ts:111` | HES:131,210; EDS:107; SIC:310 | |
| S32 | PASS | `apps/api/package.json` scripts; `tsconfig.json:12-13` | `auth.integration.spec.ts:123` | |
| S33 | PASS | `biome.json:17-19` | `pnpm lint` exit 0 | |
| S34 | PASS | `package.json` (`>=22.22.1 <27`) | none | The integration needs `>=22.22.1`. |
| S35 | PASS | `w:app/globals.css:14-65`; `docs/design/theme.md` | `w:lib/theme/contrast.test.ts:60-140` | The test pins the exact hex values. |
| S36 | PASS | `w:app/admin/*`; `app/admin/layout.tsx:11`; `app/cuenta/page.tsx:73` | E2E-A (8 tests); `w:lib/admin/*.test.ts`; `w:lib/landing/copy.test.ts:105` | Browser evidence from CI. |
| S37 | PASS | `w:lib/landing/copy.ts` | `w:lib/landing/copy.test.ts:67-163` | |
| S38 | PASS | `.github/workflows/ci.yml`; `a:../tsconfig.build.json` excludes `test` | CI green | No test flag in production code (grep). |
| S39 | PASS | `administrator-enrollment.ts:113-150,236-273`; `auth.factory.ts:255-264` | ADB:565-692 | |
| S40 | PASS | same | ADB:692-897 | |
| S41 | PASS | `w:app/admin/activar/enrollment-flow.tsx` | E2E-A:67; `w:lib/admin/enrollment.test.ts:47-70` | |
| S42 | PASS | `method="post"` plus `useInteractive` | E2E-F:88-217; `w:lib/customer/interactive.test.ts:15-23` | |
| S43 | PASS | `w:app/layout.tsx:3,16-60`; `w:app/fonts/*` with OFL | `w:lib/theme/fonts.test.ts:124-196` | |
| S44 | PASS | `a:users/reset-second-factor.command.ts`; `prisma-administrator-account.repository.ts:99-129` | `prisma-administrator-account.repository.db-spec.ts:311-368`; `reset-second-factor.command.spec.ts`; ADB:928,970; RACE:334-480 | R9 (a failing `close()`) fixed in T11f. |
| S45 | PASS | `administrator-enrollment.ts:71-74`; `w:lib/admin/enrollment.ts:132-151` | `enrollment.test.ts:208-235`; E2E-A:160 | |
| S46 | PASS (supersedes L36 default) | `auth.factory.ts:125-129,409`; `auth-request-guard.ts`; `auth.registration.ts:35` | APS:218-257 | RED/GREEN recorded in the plan; not re-derived. |
| S47 | PASS | `auth-request-guard.ts`; `environment.ts`; `.env.example:7-9` | APS:259-399; `auth-proxy-secret-comparison.spec.ts:12`; ENVT:566-630 | Rotation order in README. |
| S48 | PASS | `a:users/domain/display-name.ts:8` | `display-name.spec.ts:18-47`; `own-profile.controller.spec.ts:211,252` | Residual R2, now pinned by `display-name-residual.spec.ts`. |
| S49 | PASS | `session-settings.ts:72-82`; `auth.factory.ts:299-304` | SS:298-386 | |
| S50 | PASS | `auth-request-guard.ts`; `auth.factory.ts:272-280,326-337`; `w:lib/server/server-log.ts:63-81` | OPL:144-492; RACE:482-558; `w:lib/server/auth-session.test.ts:115` | Guard events logged an unbounded path (N5, fixed in T11f). |
| S51 | PASS | `w:lib/server/auth-proxy.ts` | PROXY:426-457 (asserts 499, generic body, no log) | N6 is the same abort during the body read, fixed in T11f. |
| S52 | PASS (supersedes flag-only check) | `auth.factory.ts:204-214,286-308`; `account-access.ts:68-77`; `session-access-hook.ts:114-123`; `access-control.ts:125-133`; migration `20261108120000_…:2` | AS:1008-1435; `session-second-factor-marker.prisma.db-spec.ts:107-184`; RACE:482-558 | A′ closed. |
| S53 | PASS | `prisma-own-profile.repository.ts:25-41`; `own-profile.controller.ts:29-34` | `prisma-own-profile.repository.db-spec.ts:47-100`; RACE:560-603 | |
| S54 | PASS (doc) | `w:lib/server/session-refresh.ts:14-19`; `docs/architecture/overview.md` | none pins 3000 | Advisory: no test fixes the value. |
| S55 | PASS (T11f) | `a:config/environment.ts`, `rejectUnsupportedAuthSecrets` | ENVL (12 tests); WIRE "refuses to start with a BETTER_AUTH_SECRETS value (S55)" | **The rule, stated once:** `BETTER_AUTH_SECRETS` and `BETTER_AUTH_TRUSTED_ORIGINS` are refused for any value other than unset or exactly the empty string `""` (`isSetForLibrary`). A whitespace-only value is refused, because Better Auth reads the raw value and treats it as set. The empty string is accepted, because Better Auth treats it as absent. The message names the variable and never echoes the value. |
| S56 | PASS (T11f) | `a:config/environment.ts`, `validateEnvironment`; `apps/api/package.json` `dev`; `w:playwright.config.ts` | ENVT "NODE_ENV (S56)" (3 tests); WIRE "refuses to start with a missing NODE_ENV (S56)"; `env-example.spec.ts` | `start` sets nothing: the deploy environment must set `NODE_ENV=production`. |
| S57 | PASS (T11f, doc) | README "Environment variables"; `docs/architecture/overview.md` "Authentication boundary" | none (documentation only) | Rotation through Better Auth's `secrets` list is a deployment-milestone task. |

### Traceability cross-check

176 quoted fragments of the traceability document were matched against the 68 test files. Matching handles
`<state>` placeholders and the `›` separator; the fragment total includes some prose quotes. Some fragments did not
match verbatim. The list gives the cases: two real name issues (one stale name, one abbreviation) and one
parametrised name, plus two non-test fixes made in the same pass (header and legend).

- **Stale name (F5), fixed in T11f:** the clause table cited "allows an un-enrolled administrator's session on
  exactly four Better Auth endpoints"; the test is "lists exactly four Better Auth endpoints in the
  pending-administrator allow list" (AS:649).
- **Abbreviated name (F5), fixed in T11f:** "refuses with 401 and logs compensation_failed …" is now the full
  "…logs administrator_enrollment_compensation_failed…" (ADB:836).
- **Parametrised, fine:** the `pending` cases of obligation 11 come from a `${state}` loop (AS:971,986).
- **Header and legend (F5), fixed in T11f:** the header status is current, and the duplicate `E2E-customer` legend
  row is gone.

## Verification findings and their resolution

| ID | Finding | Resolution |
| --- | --- | --- |
| N1 | Better Auth 1.7.16 reads `BETTER_AUTH_SECRETS` (`context/create-context.mjs`) and lets it replace the validated `BETTER_AUTH_SECRET`. With `BETTER_AUTH_SECRETS="7:short"` and a 40-character `secret`, Better Auth signed with `"short"` and only logged a low-entropy warning. | Fixed in T11f (S55). The API refuses a set value, as the S55 row states, and names the variable without echoing it. Tests: ENVL (12 tests) and WIRE "refuses to start with a BETTER_AUTH_SECRETS value (S55)". |
| N2 | `NODE_ENV` defaulted to `development`. With it unset, `validateEnvironment` returned no `AUTH_PROXY_SECRET`, Mailpit as the email transport, and `x-forwarded-for` as the client IP header, because every production rule keys on it. `start` (`node dist/main.js`) sets nothing. | Fixed in T11f (S56). A missing `NODE_ENV` fails the startup; the values stay `development`, `test`, and `production`. Tests: ENVT "NODE_ENV (S56)" (missing, invalid, and the three valid values) and WIRE "refuses to start with a missing NODE_ENV (S56)". `dev` now sets `NODE_ENV=development`; the test environments pass it explicitly; Playwright already set it for the API and the web. `start` is unchanged: the deploy environment must set `NODE_ENV=production`. |
| N3 | `BETTER_AUTH_SECRET` has no rotation path, and Better Auth also encrypts each administrator's TOTP secret and backup codes with it (`plugins/two-factor`). The API passes a single `secret` (`auth.factory.ts:150`). Rotating it ends every session and leaves each enrolled administrator without a usable second factor. | Documented in T11f (S57), in the README and in `overview.md`: the secret signs every session and encrypts the second factors; changing it ends every session and needs `admin:reset-second-factor` for each enrolled administrator. Rotation through the `secrets` list is a deployment-milestone task (open). |
| N4 | `apps/web/.env.local.example:1` holds `NEXT_PUBLIC_API_URL=http://localhost:3001`. Nothing reads it, and the README says the web uses no `NEXT_PUBLIC_` settings. | **Fixed:** the file was deleted with the owner's authorization (L82). |
| N5 | Guard events (`auth_proxy_rejected`, `client_ip_unresolved`, `auth_request_unavailable`) logged the path of a request without a valid secret, which the sender chooses and which has no length limit. | Fixed in T11f. The events log the pathname without the query, cut to 128 characters. Tests: APS "the path in guard events is bounded (N5, L79)" (a 10,000-character path is logged as 128 characters, and no query string is logged). |
| N6 | A browser abort while the request body was read made `readBoundedBody` reject with `AbortError`, which `auth-proxy.ts` rethrew (a rejected route handler becomes a Next.js `500`, which the verification did not observe). | Fixed in T11f. When `request.signal` is aborted the proxy answers `499` with the generic body and logs nothing; any other read error still rethrows. Tests: PROXY "answers 499 without a log when the browser leaves while the body is being read (N6)" and "still rethrows a body read error when the browser has not left". |
| R9 | T10a R4-001: a failing `store.close()` after a committed `admin:reset-second-factor` rejected `runResetSecondFactor`, which `main` does not catch, after the password was printed. | Fixed in T11f. `closeCommandStore` catches the failure and prints one line with the class (and Prisma code) only; the exit code of the work is kept. `admin:create` and `user:disable` had the same `finally` and use the helper. Tests: `reset-second-factor.command.spec.ts` (R9 block) and `command-failure.spec.ts` "closeCommandStore". |
| F1 | `apps/api/.env.example:6` has `AUTH_BASE_URL=http://localhost:3001` while `CORS_ORIGIN` is `http://localhost:3000`, so the API refuses the file once its secret is filled in. | Fixed by the owner in `c12f6dc`: `AUTH_BASE_URL=http://localhost:3000`. `env-example.spec.ts` now passes. |
| F5 | The traceability document had a dead test name, an abbreviated name, a stale header status, and a duplicate legend row. ADR 0004's Status stopped at 2026-11-07 and said "No decision changed". | Fixed in T11f (documentation). The ADR Status now records the 2026-11-08 amendment of decision 3 (S52), and decision 9 (S55, S56). |

## Sign-off areas

### 1. Secret handling

- **Proxy secret:**
  - Header `x-invitame-proxy-secret` (`auth-request-guard.ts:9`).
  - The web sets it server-side only (`auth-proxy.ts`, `api-client.ts`) and drops browser copies.
  - The API compares SHA-256 digests in constant time against every configured secret with no early exit.
  - A missing or wrong secret gives a generic `403` before any hook or rate limit.
  - The API strips the header, and the client-IP header unless the secret was valid.
  - Required by default (`auth.factory.ts:409`). Building without it throws. Production passes
    `requireProxySecret: production` (`auth.registration.ts:35`).
- **Rotation of the proxy secret:**
  - `AUTH_PROXY_SECRET_PREVIOUS` is accepted next to the current secret, and the API refuses to build with a
    previous secret and no current one.
  - Environment rules: at least 32 characters, differs from `BETTER_AUTH_SECRET` and from the current secret, never
    echoed.
  - Order is API, then web, then remove the old one (README).
- **Rotation of `BETTER_AUTH_SECRET`:** not available (N3, S57). It signs every session and encrypts each
  administrator's TOTP secret and backup codes. Changing it ends every session and leaves each enrolled
  administrator unable to use their second factor until `admin:reset-second-factor`. Rotation through Better Auth's
  `secrets` list is a deployment-milestone task.
- **Environment validation:**
  - `NODE_ENV` is required and has no default (S56); `BETTER_AUTH_SECRET` is at least 32 characters.
  - `AUTH_PROXY_SECRET` is required in production.
  - `BETTER_AUTH_TRUSTED_ORIGINS` and `BETTER_AUTH_SECRETS` (S55) are refused under the rule in the S55 row; the
    message names the variable and never echoes the value.
  - The web validates at startup, logs `web_config_invalid` naming the variable, and exits with code 1
    (`w:lib/server/config.ts`, `startup.ts`).
- **Logs:**
  - `safe-logging.ts` logs the error class only.
  - The contract is in `overview.md`, "Operational log contract". Guard events carry a path of at most 128
    characters without a query (N5).
  - Tests: `operational-log.spec.ts:137`, `auth-proxy.test.ts:459`, `email-delivery.service.spec.ts:189`.
- **URLs:**
  - Forms never put fields in a URL (E2E-F:88-121).
  - Proxy logs omit the query string.
  - The TOTP URI and backup codes live only in component memory (`w:lib/admin/enrollment.ts:12-15`).
  - Proxied responses carry `no-store`.
  - The initial password is printed once, to a terminal only (`create-administrator.command.ts`).
- **Gaps:** `/me` does not check the proxy secret; that is documented in `overview.md`.

### 2. Session expiry

- **Customer sessions:**
  - 7 days, refreshed at most once per day (`session-settings.ts:10-11`, `auth.factory.ts:198-199`).
  - The session cookie cache is pinned off (`auth.factory.ts:203`).
  - The browser cookie is extended only through `get-session` via the web proxy (`w:proxy.ts:20-35`), bounded to
    3 seconds (`session-refresh.ts:19`, S54).
- **Administrator sessions:**
  - 12 hours from creation, never refreshed.
  - Code: `session-settings.ts:17,72-82`, `auth.factory.ts:292-306`, refresh skipped at
    `session-access-hook.ts:96-98`, other expiry changes refused at `auth.factory.ts:324-347`.
  - An invalid creation time is stored already expired and logs one event (`session-settings.ts:76-79`).
- **Cookie:** host-only, `__Host-` over https, HttpOnly, SameSite=Lax, `Path=/` (`session-settings.ts:56-65`).
- **Enrollment window:**
  - 24 hours from the credential account's `createdAt` (`account-access.ts:19,83-94`,
    `administrator-enrollment.ts:284-296`).
  - Enforced at sign-in (`account-access.ts:176-178`) and on each use (`session-access-hook.ts:120-122`).
- **Second-factor marker:**
  - `Session.secondFactorVerified` is true only for an enrolled administrator on `verify-totp` or
    `verify-backup-code` (`auth.factory.ts:286-290`, `auth-paths.ts:29-32`).
  - Enforced in the hook (`session-access-hook.ts:114-123`) and again in the guard (`access-control.ts:125-133`).
  - The update hook refuses the marker (`auth.factory.ts:335-337`).
- **Challenge and lockout:** challenge cookie 600 s, 5 wrong codes end it, 10 failures lock for 900 s
  (`administrator-enrollment.ts:37-45`).
- **Revocation on disable:**
  - One transaction sets `DISABLED` and deletes the sessions (`prisma-user-access.repository.ts:8-28`).
  - Strays are deleted on first use (`session-access-hook.ts:86-94`).
  - The create hook refuses non-ACTIVE users (`account-access.ts:164-168`).
  - The profile write needs `ACTIVE` in the same statement (`prisma-own-profile.repository.ts:27-41`).

### 3. Error mapping

- **API:**
  - Guard: `401` for no session, non-ACTIVE, pending, or unmarked; `403` for admin-only (`access-control.ts:132,142`).
  - Input: DTO `400` (`app.setup.ts:30-36`, `own-profile.controller.ts:66-69`). A write after disable gives `401`
    (`own-profile.controller.ts:30-34`).
  - Guard failures: `403 FORBIDDEN` and `503 SERVICE_UNAVAILABLE`, both generic (`auth-request-guard.ts`).
  - Enrollment race: `401 ENROLLMENT_SUPERSEDED` (`administrator-enrollment.ts:71-74,272`).
  - Sibling-delete failure: `500` (pinned at RACE:482).
- **Enumeration safety:**
  - A refused email-code session answers `400 INVALID_OTP`. A refused password session answers
    `401 INVALID_EMAIL_OR_PASSWORD` (`account-access.ts:96-156`).
  - A code request always answers `200 {"success":true}` (SIC:207, SICDB:257).
  - `get-session` answers `200 null` for non-ACTIVE users (AC:533).
- **Web proxy** (`w:lib/server/auth-proxy.ts`):
  - `405` for methods other than GET and POST; `404` outside `/api/auth/`; `413` for bodies over 16 KiB.
  - Browser abort gives `499`, no log, both while the body is read (N6, T11f) and during the API call (S51).
  - Timeout gives `504` and unreachable gives `502`; both log.
  - Upstream `5xx` keeps its status with the generic body.
  - `4xx` passes through, including `429` and `403`.
- **Server API client** (`api-client.ts:142-168`): `401` means signed out. `5xx`, network errors and timeouts map to
  `unavailable` with the cause kept. Other non-2xx maps to `rejected`. A bad body maps to `invalid-response`.
- **Pages:**
  - Customer `sign-in.ts:74-90` and admin `sign-in.ts:109-171`: anything outside 2xx, 400 `INVALID_OTP` or
    `OTP_EXPIRED`, and 429 becomes the fixed "unavailable" copy. That includes 499, 502, 504, and 403.
  - Enrollment gives `ENROLLMENT_SUPERSEDED` its own message (`enrollment.ts:132-151`).

## Residual risks and open decisions

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| R1 | Per-email cap (L71) | **Open, accepted.** 5 codes per hour per address (`abuse-limits.ts:22`). The 6th request is removed unsent, so the 5th code stays valid for 300 s. After that the owner gets no new code until the hour ends. Before the cap, each extra request emails them and shadows the previous code. | SIC:456-557; `sign-in-code-sender.spec.ts:79,90` |
| R2 | Invisible characters in display names | **Accepted by the owner with this full scope (L75, L81).** Accepted and pinned by the spec: U+200B, U+2060, inner U+FEFF, U+2028, U+2029, U+00AD, U+034F, U+115F, U+3164. Accepted but not pinned: U+180E (Mongolian vowel separator, checked by hand against `parseDisplayName`). A name made only of U+200B passes and renders empty. The 12 bidi controls are rejected. | `display-name.ts:8`; `display-name-residual.spec.ts` (T11f) pins today's decision |
| R3 | Rolling-deploy skew and deploy order | **Open: manual procedure, no deploy tooling.** An old instance stores a second-factor session unmarked, and the new API ends it once (transient, administrators only). New code on a database without the column answers `500` on `GET /api/auth/get-session`, `P2022`, empty body, no project log event. Reproduced on a database migrated only to the first two migrations. `start` has no migrate step. | ADR `:100-102`; `overview.md`; `model.md:62` |
| R4 | Pre-migration administrator sessions | **By design.** They read false and are ended once. Nothing is deployed, so nobody is affected yet. | `session-second-factor-marker.prisma.db-spec.ts:124`; AS:1116 |
| R5 | Domain, `AUTH_BASE_URL`, `CORS_ORIGIN` | **Open** (L7, L71). Production needs an https web origin that is in `CORS_ORIGIN`. | ADR `:230-232` |
| R6 | `.env.example` `AUTH_BASE_URL` | **Fixed in `c12f6dc`** (F1). | `env-example.spec.ts` |
| R7 | `user:disable` for a non-active status | **Open, latent.** `alreadyDisabled` means "was not ACTIVE". With a third status the command would change nothing, report `alreadyDisabled:true`, and exit 0. Unreachable with the current enum. | `prisma-user-access.repository.ts:15-26` |
| R8 | T6a R1-001 (`access-control.ts:86-93`) | **Closed by the owner (L81).** Re-examined, no defect. Today's code (`:125-133`) still fails closed, with the pending and marker checks added. The claim text is unrecorded. | AC:279,289,352 |
| R9 | T10a R4-001, a failing `close()` | **Fixed in T11f.** See the findings table. | `reset-second-factor.command.spec.ts`; `command-failure.spec.ts` |
| R10 | Slice 30 R4-001 and R4-002 | **Closed by the owner (L81).** Re-examined, no defect reproduced. A `403` from a secret mismatch is not flagged unavailable and leaves no web-side log (the API logs `auth_proxy_rejected`). The claim text is unrecorded. | `session-refresh.ts:76,103` |
| R11 | R4-double-submit (L50) | **Open, accepted.** Same-tab double submit is blocked (`enrollment-flow.tsx:117,125`). Two tabs: the loser ends every session, including the winner's. | ADB:742 |
| R12 | R4-hook-doubles-session-reads | **Open, performance only.** The access hook and the endpoint each read the session. | `session-access-hook.ts:80` |
| R13 | R4-confirm-lost-response | **Open, mitigated.** A lost or failed confirmation response leaves the administrator without having seen the backup codes. `admin:reset-second-factor` recovers. The `500` path is pinned at RACE:482. | `enrollment-flow.tsx:127` |
| R14 | R4-003 (L28) | **Closed by the owner (L81).** Cannot verify: The claim text and the T10 resolution are unrecorded. | none |
| R15 | R2-shadowed-after-hook | **Open, readability.** Local `const after = Date.now()` in files that import the `after` hook. | ADB:267; SICDB:212 |
| R16 | R2-auth-base-url-literal-not-tied-to-trusted-origin | **Open, readability.** Specs use a base URL that is not their trusted origin. | `abuse-limits.spec.ts:21-22`; `sign-in-code.spec.ts:26-27` |
| R17 | Duplicate `postJson` and `errorCode` in the web sign-in files | **Open.** | `w:lib/customer/sign-in.ts:103,54`; `w:lib/admin/sign-in.ts:93,84` |
| R18 | The 2 lint warnings in `sign-in-code-sender.ts` | **Known.** They are DI value imports; Biome's autofix would break Nest injection. | `sign-in-code-sender.ts:5-10` |

### Decisions left open

- **Rotation of `BETTER_AUTH_SECRET` (N3, S57).** Adopt Better Auth's `secrets` list in the deployment milestone.
- **Deploy checklist (R3, R5, N2).** Migrate before or with the API, and set `NODE_ENV=production`: the API now
  refuses to start without it.
- **Display names (R2).** Accepted with its real scope (L81); a stricter rule can come in a later milestone.
- **Re-examined claims (R8, R10, R14).** Closed by the owner (L81).
- **Advisories.** R7 and R17.
- **S2 sign-off.** Signed by the owner on 2026-11-08 (L81); S2 is closed.
