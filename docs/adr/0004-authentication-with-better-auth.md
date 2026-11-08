# ADR 0004: Authenticate with Better Auth inside the API

## Status

Accepted (2026-11-03). The human owner approved the library, customer sign-in by emailed one-time code,
administrator sign-in with a password and a mandatory authenticator app, Resend for email, and Railway for hosting.
Amended the same day, before any implementation, to define administrator enrollment (decision 3) and email
failure handling (decision 8) after the first automated review of this ADR. That review is an advisory AI design
review, not a human approval (see
[Roles and review separation](../architecture/ai-operating-model.md#roles-and-review-separation)); it reports
each finding by ID, severity, and location, and the findings of its two runs and their resolutions are recorded as
S14 to S31 in the [Milestone 2 plan](../../odd/tasks/m2-identity.md). Decision 8 was amended again on 2026-11-04,
during implementation, to send codes in the background, and decision 3 on the same day to bound the pre-enrollment
window. Decision 4 was amended on 2026-11-05 to route the session cookie through the web origin, to fix the
cookie name and the session lifetimes, and to prove the web-to-API hop with a shared secret. On 2026-11-07,
after implementation, decision 3 gained a clarification of the pre-enrollment account, decision 9 an amendment
with the full set of validated variables, and the Consequences an outcome record; the logging rule of decision 8
now appears once, and a pronoun in decision 3 names the account. No decision changed. The status stays Accepted.

## Context

Milestone 2 needs accounts, a session lifecycle, and backend authorization for creator-owned resources and
administrative actions. The constraints are:

- `apps/api` owns persistence; `apps/web` never connects to PostgreSQL or imports Prisma.
- Authentication and cryptography are not invented; protected actions are authorized on the backend and fail closed.
- External providers sit behind ports and adapters; secrets come from validated environment configuration.
- Buyers are self-service customers in Mexico who mostly buy once and use a phone. The owner needs an administrative
  role. OAuth and social login are Milestone 2 non-goals.

Current state: `User` has a UUID `id`, a unique `email`, an optional `displayName`, and a `status` (`ACTIVE` or
`DISABLED`). The API does not accept credentials yet: CORS sets `credentials: false` and allows only `GET`, `HEAD`,
and `OPTIONS`.

## Alternatives considered

Facts verified on 2026-11-03 against the npm registry and official documentation.

| Option | Outcome |
| --- | --- |
| Better Auth 1.7 with `@thallesp/nestjs-better-auth` 2.8 | Chosen. Runs in-process on the API database through Prisma. The NestJS integration declares NestJS 11.1.6+ or 12 and Express 5.1+. |
| NestJS and Passport with self-built sessions | Fallback only. `@nestjs/passport` 12.0.0 supports NestJS 12, but code, token, and session handling would be ours to write. |
| Hosted identity (Clerk, Auth0, WorkOS, Supabase Auth) | Rejected. Identity data would live outside the API database, in an external service or a separate auth server that an OAuth-free Milestone 2 does not need. |
| Auth.js | Rejected. The project is now part of Better Auth, which is the maintained path. |
| Lucia | Rejected. Deprecated since March 2025. |
| SuperTokens | Rejected. Requires a separate core service, self-hosted or managed. |

## Decision

1. **Library.** Use Better Auth inside `apps/api`, registered through `@thallesp/nestjs-better-auth`. The integration
   is community maintained; if it breaks, mount Better Auth's Node handler directly on Express behind a thin
   project-owned guard. Pin exact versions, as the repository already does.
2. **Persistence.** Use Better Auth's Prisma adapter on the API database. Map its `user` model onto the existing
   `User` model with `modelName` and `fields`, keep UUID identifiers (`advanced.database.generateId`), and add the
   session, account, and verification models through a new reviewed migration. Applied migrations are never edited.
3. **Sign-in.** Customers sign in with a one-time code sent by email (Better Auth email OTP plugin) and have no
   password. Administrators sign in with email and password plus a mandatory authenticator-app code (TOTP, Better
   Auth two-factor plugin) and keep backup codes offline. Better Auth enforces the second factor only on credential
   sign-in, not on email OTP sign-in, so email OTP sign-in is rejected for administrator accounts; otherwise it
   would bypass both the password and the second factor. A server-side command creates each administrator and sets
   the initial password without logging it. Until the administrator enrolls an authenticator app, confirmed by a
   first valid code, the account holds no administrator authority: the guard rejects every administrative action,
   and enrollment and sign-out are the only actions the account can take.

   **Amended (2026-11-04).** The human owner fixed the pre-enrollment window (S20):

   - The creation command generates a random 24-character initial password and shows it once in the
     terminal, never in logs.
   - Until the administrator enrolls an authenticator app, that password works for 24 hours from its issue.
     After that, password sign-in answers like a wrong password, existing sessions stop working, and
     enrollment is refused. Only the same command can issue a new password.
   - Milestone 2 offers no password change or reset through the API.

   An un-enrolled administrator's session can only read itself, enable the authenticator app, confirm it with
   the first code, and sign out. It is refused on every project route, including the user's own profile.

   **Clarified (2026-11-07).** What a pre-enrollment administrator account can and cannot do, as implemented
   (`apps/api/src/auth/administrator-enrollment.ts`, `PENDING_ADMINISTRATOR_ENDPOINTS`;
   `apps/api/src/auth/session-access-hook.ts`; `apps/api/src/auth/access-control/access-control.ts`):

   - Inside the 24-hour window, its session can call exactly four Better Auth endpoints:
     `GET /api/auth/get-session`, `POST /api/auth/two-factor/enable` (with the password),
     `POST /api/auth/two-factor/verify-totp` (the first code confirms enrollment), and
     `POST /api/auth/sign-out`.
   - Every other Better Auth endpoint answers as if the request had no session. Every project route, including
     `GET` and `PATCH /me` and every administrator-only route, answers `401`.
   - It never receives an email sign-in code (above).
   - After the window ends, its password is refused like a wrong password and each of its sessions is deleted
     on its next use, so it can do nothing until an operator issues a new initial password.
4. **Sessions and hosting.** Sessions are stored in the database and carried by an `HttpOnly`, `SameSite=Lax` cookie
   issued by the API, `Secure` outside local development. `apps/web` forwards the cookie from trusted server code and
   never stores it. Production runs web, API, and PostgreSQL in one Railway project under one registrable domain
   (`app.` and `api.` subdomains), with the cookie scoped so both the browser and the web server can send it. The
   Railway Hobby plan is for development; production moves to the Pro plan, which Railway positions for production
   workloads.

   **Amended (2026-11-05).** The human owner chose how the cookie reaches the web server and how long a
   session lasts (S14, S16):

   - The browser talks only to the web origin. The web proxies `/api/auth` to the API and calls the API from its
     server with the cookie. Better Auth's base URL (`AUTH_BASE_URL`) is that public web origin, and it must be
     one of the trusted origins in `CORS_ORIGIN`.
   - The session cookie is host-only on the web host: it has no `Domain` attribute, so no other host, such as a
     future host for public invitations, receives it. In production it is named
     `__Host-better-auth.session_token` and is `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. Production
     requires an `https` base URL. In local `http` development it is named `better-auth.session_token` and is
     not `Secure`. Every other Better Auth cookie follows the same rule.
   - A customer session lasts 7 days and is extended to 7 days from now at most once per day of use.
   - An administrator session lasts 12 hours from sign-in and is never extended; after that the administrator
     signs in again with the password and the authenticator app. This applies before enrollment too, and the
     24-hour enrollment window of decision 3 is unchanged.
   - The web proves each request to the API with a shared secret (`AUTH_PROXY_SECRET`, at least 32
     characters, different from the auth secret) in the `x-invitame-proxy-secret` header. In production the
     API refuses every `/api/auth` request without the right secret with a generic `403` before any endpoint,
     hook, or rate-limit step runs, and the API refuses to start without the secret. The API compares SHA-256
     digests in constant time and removes the header before Better Auth sees the request. This holds even if
     the API is exposed to the internet by mistake.
   - The client IP crosses the web hop in one header. The web reads it from a header the platform edge
     overwrites on every request (`AUTH_EDGE_CLIENT_IP_HEADER`; `x-forwarded-for` and `forwarded` are refused
     in production because a browser can set them), removes any browser copy of the client IP and secret
     headers, and sets the API's `AUTH_CLIENT_IP_HEADER` itself. The API trusts that header only next to a
     valid secret and otherwise removes it, so a direct caller can never choose its rate-limit bucket.
   - The web stores no cookie. It forwards only an allow-list of request headers and returns every
     `Set-Cookie` unchanged. The browser's session cookie is extended only when `/api/auth/get-session` runs
     through the proxy; a session read by the web server refreshes the stored session but cannot set the
     browser's cookie.
5. **Origins.** CORS allows credentials only for configured trusted origins, and the same list feeds Better Auth's
   origin checks.
6. **Authorization.** A global guard denies by default and public routes are marked explicitly. Public sign-up
   creates only customer accounts; password sign-up is disabled and administrator accounts are created server-side.
   The role (`customer` or `admin`) is stored server-side and is never accepted as client input. A `DISABLED` user
   cannot sign in, and disabling a user revokes their sessions.
7. **Abuse limits.** Codes expire quickly and allow few attempts, and both password and code attempts are rate
   limited. Rate limiting uses persistent storage in production, not process memory. Sign-in responses do not reveal
   whether an email already has an account.
8. **Email delivery.** Codes are sent through an application port whose production adapter uses Resend. Resend's
   free plan has a low daily sending limit (100 emails on 2026-11-03), so it serves development and testing only;
   because every customer sign-in sends an email, the account moves to a paid plan before launch. Transient
   provider errors are retried a bounded number of times with the same code, so a retry never creates a second
   valid code. When sending still fails, the API returns a generic, retryable error that does not reveal whether
   the account exists; repeated failures must raise an operational alert by the first production release. A
   provider outage blocks only new customer sign-ins: existing sessions keep working and administrator sign-in
   does not use email. A second provider can be added behind the same port but is not required for the first
   release. Tests use an in-memory adapter and local development uses a local mail catcher. No log carries a
   sign-in code or a recipient's address, including the log of a failed send.

   **Amended (2026-11-04).** The generic retryable error above is replaced; the human owner approved this change.
   Better Auth 1.7.16 stores the code before it calls the send hook, swallows a send error, and still returns
   success, so an error could only surface by rewriting its response, and waiting for the send would let
   response timing reveal the account and the provider outcome. Instead:

   - The send request returns the same success response at once for new, existing, and administrator emails,
     whatever the later delivery outcome. Administrator emails never receive a sign-in code (decision 3).
   - Delivery runs in the background with the bounded retries above, which reuse the same code and message.
   - When delivery still fails after the retries, that code is invalidated, never a newer code for the same
     address. The failure counts toward the degraded alert and not as a wrong attempt.
   - Repeated failures must still raise an operational alert by the first production release.
9. **Configuration.** The auth secret, public base URL, and trusted origins are required environment variables
   validated at startup; the API refuses to start without them.

   **Amended (2026-11-07).** The decisions above added variables; this is the full set the API validates at
   startup (`apps/api/src/config/environment.ts`). It refuses to start when a rule fails, and its error names
   the variable, never a secret value.

   | Variable | Rule |
   | --- | --- |
   | `CORS_ORIGIN`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_BASE_URL` | Required in every environment. The secret has at least 32 characters; `AUTH_BASE_URL` is one of the `CORS_ORIGIN` entries and uses `https` in production. |
   | `AUTH_PROXY_SECRET` | Required in production; optional elsewhere. At least 32 characters, different from `BETTER_AUTH_SECRET` (decision 4). |
   | `AUTH_CLIENT_IP_HEADER` | Required in production; elsewhere defaults to `x-forwarded-for` (decision 7). |
   | `EMAIL_FROM` | Required in production; elsewhere defaults to a local sender on the reserved `.localhost` domain. |
   | `EMAIL_TRANSPORT`, `RESEND_API_KEY` | Production accepts only `resend`, its default there. `RESEND_API_KEY` is required whenever the transport is `resend`. |
   | `NODE_ENV`, `PORT`, `AUTH_TRUSTED_PROXIES`, `MAILPIT_URL` | Optional and validated when set. |
   | `BETTER_AUTH_TRUSTED_ORIGINS` | Refused, so `CORS_ORIGIN` stays the only list of trusted origins. |

   The web server validates its own settings when it starts and refuses to run with an invalid one. In production
   it requires `API_ORIGIN`, `AUTH_PROXY_SECRET`, `AUTH_CLIENT_IP_HEADER`, and `AUTH_EDGE_CLIENT_IP_HEADER`
   (`apps/web/lib/server/config.ts`). [Environment variables](../../README.md#environment-variables) in the
   README lists every variable with its default.

## Consequences

- Milestone 2 gains accounts, sessions, and roles without project-owned cryptography, and identity data stays in the
  API database.
- NestJS's built-in body parser must be disabled for Better Auth. The first implementation step is a short spike that
  proves the integration runs on NestJS 12 and that JSON parsing and the global `ValidationPipe` still work on
  non-auth routes. If the spike fails, the fallback in decision 1 applies.
- The `User` migration is a schema change that needs the database quality gates and human review.
- Sign-in depends on Resend: the sending domain needs SPF, DKIM, and DMARC records, and the paid plan must be active
  before launch.
- Cookie-based sessions and email authentication both require registering the domain before the first deployment.
- Administrators depend on an authenticator app. Losing both the device and the backup codes requires a server-side
  recovery procedure, documented before the first production release.
- Integration tests with a real database must cover denied-by-default access, ownership, session expiry and
  revocation, disabled users, code expiry and attempt limits, rate limiting, the mandatory administrator second
  factor and its enrollment gate, rejection of email OTP sign-in for administrators, and email send failures.

**Outcome (2026-11-07).** Status of the consequences above after the Milestone 2 implementation. Task and log
references (T1, L9) point to the [Milestone 2 plan](../../odd/tasks/m2-identity.md).

- The spike came first. T1 (`ebabb0d`) proved Better Auth 1.7.16 through `@thallesp/nestjs-better-auth` 2.8.0 on
  NestJS 12 with the body parser disabled: the auth handler answers, JSON bodies parse, and the global
  `ValidationPipe` rejects invalid bodies on non-auth routes (L9). The fallback of decision 1 was not needed. The
  spike's test still runs in `pnpm test` as
  [`auth.integration.spec.ts`](../../apps/api/src/auth/auth.integration.spec.ts).
- The `User` migration is `20261104030448_add_better_auth_identity`. It is additive, passed the database gates,
  and the human owner approved it before its commit (L15, L17).
- The listed integration tests exist. Each obligation maps to named assertions on real PostgreSQL in
  [ADR 0004 test traceability](../development/adr-0004-test-traceability.md), and CI runs those suites in its
  `database-tests` job.
- The administrator recovery procedure exists: the `admin:reset-second-factor` operator command, described in
  [Recover a locked administrator](../../README.md#recover-a-locked-administrator).
- Still open: the domain registration, the sending domain's SPF, DKIM, and DMARC records, the paid Resend plan,
  Railway hosting, and the operational alert. The API logs an `email_delivery_degraded` event for repeated send
  failures, but nothing routes it to an alert yet.

## Open decisions

- The domain name to register (`.mx` or `.com`).
