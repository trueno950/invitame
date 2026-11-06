# Architecture overview

InvitaMe is a modular monolith with two independently runnable applications. The repository currently contains
only the foundation: catalog/version data, API configuration and health, Prisma ownership, and a small public
landing page. The module map and flows below describe the target product and are explicitly planned unless marked
implemented.

## Current versus target status

| Area | Current foundation | Target direction |
| --- | --- | --- |
| Web | `apps/web` is a Next.js 16 App Router landing page with Spanish product copy, a proxy for `/api/auth`, a server-side API client, and the customer pages `/ingresar` (sign-in by emailed code) and `/cuenta` (own profile and sign-out), and the administrator pages `/admin/ingresar` (password and second factor), `/admin/activar` (authenticator-app enrollment), and `/admin` (a minimal panel with sign-out); the pages use the visual theme «A · Rosa y vino» ([`docs/design/theme.md`](../design/theme.md): Tailwind tokens, `next/font` fonts, fine-line SVG ornaments, and a contrast test). The full concept landing page (M2 T8l) is planned. | Dashboard, authoring flows, and public invitation routes. **Planned.** |
| API | `apps/api` has configuration, a global Prisma service, `GET /health`, and Better Auth mounted at `/api/auth` with customer sign-in by emailed code, administrator sign-in by password and a mandatory authenticator app, a deny-by-default guard with an administrator role check and enrollment gate, the signed-in user's own profile (`GET /me`, `PATCH /me`), and account disabling and administrator creation by server-side commands. | Feature modules exposing stable REST contracts. **Planned.** |
| Database | PostgreSQL and Prisma own a minimal `User` foundation plus the catalog, packages, features, templates, and immutable template versions; authentication behavior is not implemented. | Invitation, guest, RSVP, payment, media, and analytics models. **Planned.** |
| Renderer | `TemplateVersion.componentKey` is persisted and protected as snapshot data. | An application-owned allow-listed renderer registry. **Planned.** |
| Operations | Local Docker Compose database and Mailpit mail catcher, workspace scripts, and limited GitHub Actions quality-gate CI; issue/PR governance is unmanaged. | CD, hosted deployment, observability, provider operations, and issue/PR enforcement. **Planned.** |

## Context and runtime map

```text
Browser
  ├── creator/dashboard traffic ──► apps/web (Next.js 16 App Router)
  └── public invitation traffic ──► apps/web

apps/web ── REST/JSON ──► apps/api (NestJS)
                              ├── Prisma ──► PostgreSQL
                              ├── email port ──► Resend (production) / Mailpit (local) / in-memory (test)
                              └── provider adapters ──► payment/media providers (planned)
```

`apps/web` never imports Prisma or connects to PostgreSQL. The API is the persistence boundary. Turborepo
orchestrates workspace tasks and caching; it does not create a shared domain package or a distributed runtime.

The current API tree is intentionally small:

```text
apps/api/src/
  auth/         Better Auth instance factory, integration registration, access control, and sign-in code delivery
  config/       startup environment validation and the configuration module
  database/     Prisma module and service
  email/        email delivery port, retry/alert policy, and Resend, Mailpit, and in-memory adapters
  health/       database-backed health endpoint and tests
  users/        own profile (`GET /me`, `PATCH /me`), the disable-user and create-administrator use cases, their
                Prisma adapters, and the `user:disable` and `admin:create` commands
  app.module.ts Nest composition root
  app.setup.ts  shared app creation: body parser off, Helmet, CORS, validation, shutdown hooks
  main.ts       HTTP bootstrap through the shared app creation
```

### Authentication boundary (current)

This is the implemented state of ADR 0004; see "Administrator sign-in and enrollment gate" below. The abuse limits of ADR 0004 decision 7 are current; see "Abuse limits" below, and "Access control" for roles
and account status.

- Better Auth runs inside the API through `@thallesp/nestjs-better-auth` and is mounted at `/api/auth`. It is
  built from validated configuration (`BETTER_AUTH_SECRET`, `AUTH_BASE_URL`, `CORS_ORIGIN`, and in production
  `AUTH_PROXY_SECRET`) and the shared Prisma client; the API refuses to start when any of them is missing or
  invalid.
- The integration's own global guard is disabled (`disableGlobalAuthGuard: true`); the project-owned guard
  described in "Access control" replaces it.
- `CORS_ORIGIN` is the single trusted-origins list. The project owns CORS (`credentials: true`; methods `GET`,
  `HEAD`, `POST`, `OPTIONS`; headers `Accept`, `Content-Type`) for those origins only, and the same list feeds
  Better Auth's origin checks. The integration's own CORS is disabled, and origin checks stay on in every
  `NODE_ENV`.
- `createApp` in `app.setup.ts` is the single app-creation boundary for the runtime and integration tests; it
  disables NestJS's body parser, as Better Auth requires.

### Sessions and cookies (current)

This is the implemented API side of ADR 0004 decision 4 as amended on 2026-11-05 (S14, S16;
`auth/session-settings.ts`, `auth/auth.factory.ts`, `auth/inactive-session-hook.ts`). The web side is
described in "Web boundary" below.

- `AUTH_BASE_URL` is the public web origin through which the web will proxy `/api/auth`. Startup validation
  requires it to be one of the `CORS_ORIGIN` entries, because Better Auth trusts that origin on its own, and
  to use `https` in production.
- Over `https` the session cookie is `__Host-better-auth.session_token`: `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`, and no `Domain`, so only the web host receives it. Every other Better Auth cookie (session data,
  "don't remember", the two-factor challenge `__Host-better-auth.two_factor`, trusted device) has the same
  prefix and attributes. Over local `http` the names drop the prefix (`better-auth.session_token`) and the
  cookies are not `Secure`. Cross-subdomain cookies are pinned off.
- A customer session lasts 7 days and is extended to 7 days from now at most once per day of use.
- An administrator session, pending or enrolled, lasts 12 hours from its creation: the password sign-in of a
  pending administrator, or the second factor of an enrolled one. It is never extended: the session hook
  skips Better Auth's refresh for administrators, and a session update hook refuses any expiry change that is
  not a customer's session refresh. The cookie keeps the 7-day `Max-Age`; the stored expiry decides, and
  every request reads it.

### Web boundary (current)

This is the implemented web side of ADR 0004 decision 4 as amended on 2026-11-05 (S7, S14; `apps/web/lib/server`,
`apps/web/app/api/auth/[...path]/route.ts`, and `apps/api/src/auth/auth-request-guard.ts`). The customer pages
are described in "Customer pages" below and the administrator pages in "Administrator pages".

```text
Browser ──► apps/web /api/auth/* (proxy) ──► apps/api /api/auth/*
                adds x-invitame-proxy-secret and the client IP header

apps/web server components and actions ──► apps/api /me
                Better Auth cookies and x-invitame-proxy-secret only
```

- The browser talks only to the web origin. `GET` and `POST /api/auth/*` are forwarded to the API's
  `/api/auth/*` with the query string; other methods get `405`, paths outside `/api/auth/` get `404`.
- The proxy forwards only `accept`, `accept-language`, `content-type`, `cookie`, `origin`, and `user-agent`; it
  never forwards `host`, hop-by-hop headers, or a browser copy of the client IP or secret headers. It sets the
  API's client IP header (`AUTH_CLIENT_IP_HEADER`) from the edge header (`AUTH_EDGE_CLIENT_IP_HEADER`) when that
  holds one valid address, and the `x-invitame-proxy-secret` header from `AUTH_PROXY_SECRET`.
- Bounds: request bodies up to 16 KiB (larger gets `413`) and 10 seconds for the whole upstream exchange.
  Redirects are returned, not followed. The upstream status, body, and every `Set-Cookie` pass unchanged, without
  hop-by-hop headers, and with `Cache-Control: no-store`. An unreachable API gets `502`, a timeout `504`, and an
  API `5xx` keeps its status; all three return the generic `SERVICE_UNAVAILABLE` body and log an
  `auth_proxy_upstream_failed` warning with the path, reason, and status only.
- The API refuses every `/api/auth` request without the secret in production (`403 {"code":"FORBIDDEN"}` and an
  `auth_proxy_rejected` warning with the path only) before any endpoint, hook, or rate-limit step runs. It
  always removes the secret header, and removes the client IP header unless the secret was valid. Outside
  production without a configured secret it serves direct requests and trusts the client IP header as before.
- The server-side API client (`lib/server/api-client.ts`, bound to the request by `lib/server/session-api.ts`)
  sends only Better Auth's cookies (`better-auth.*` and `__Host-better-auth.*`) and the secret. It calls
  `GET /me` and `PATCH /me` (the browser cannot call `PATCH` because of CORS), maps `401` to "not signed in",
  and maps other failures to a typed `ApiClientError` that never carries the response body. The API does not
  check the secret on `/me` in Milestone 2.
- Rolling sessions: a session read by the web server refreshes the stored session but sends the browser no
  cookie. The browser's cookie is extended only when `GET /api/auth/get-session` runs through the proxy; see
  "Customer pages" for why the web runs it before a signed-in page renders.
- The web settings have no `NEXT_PUBLIC_` prefix and are read only by server modules; the route handler and
  `session-api.ts` import `server-only`. `instrumentation.ts` validates them when the Node.js server starts;
  on an invalid setting it logs one `web_config_invalid` line that names the variable (never its value) and
  exits with code 1, because Next.js 16.3.5 would otherwise keep running and answer every request with `500`.
  `next build` skips this check and needs none of the variables. See the README for the variables.

### Customer pages (current)

This is M2 T8c (S1, S6; L34, L39): `apps/web/app/ingresar`, `apps/web/app/cuenta`, `apps/web/proxy.ts`, and
`apps/web/lib/customer`. Product copy is Spanish and addresses the customer with "tú" (see `CONTEXT.md`).

- `/ingresar` signs a customer in by emailed code. The browser sends `POST /api/auth/email-otp/send-verification-otp`
  with `{ email, type: "sign-in" }`, then `POST /api/auth/sign-in/email-otp` with `{ email, otp }`, both to the
  same-origin proxy, so the browser receives the session cookie directly. The copy is the same for every
  address (S24). A wrong or expired code (`400 INVALID_OTP` or `OTP_EXPIRED`), a rate limit (`429`), and every
  other failure each map to one fixed Spanish message; the API's text is never shown. A visitor who is already
  signed in is sent to `/cuenta`.
- `/cuenta` is a server component that reads `GET /me` on the web server. Without a session it redirects to
  `/ingresar`; when the API fails it shows a retry notice. A customer sees the email and display name and can
  change or clear the name through a server action that calls `PATCH /me`; a `400` becomes the Spanish length
  message (1 to 120 characters). An enrolled administrator sees a neutral notice with a link to the panel at
  `/admin` and the sign-out button; no public page links to `/admin`.
- Sign-out sends `POST /api/auth/sign-out` from the browser through the proxy, then loads `/ingresar`. When that
  request fails, the browser asks `GET /api/auth/get-session`; a `200 null` answer means the session is already
  gone (expired, revoked, or without a cookie), so the page still loads the sign-in page. The failure notice
  appears only while a session remains or the API cannot answer. Customers and administrators share this
  button (`app/_components/sign-out-button.tsx`).
- Rolling sessions: Better Auth sends the refreshed session cookie only in the same `getSession` call that
  moves the stored expiry, and the API guard behind `GET /me` also runs that refresh. A refresh started by the
  browser after the render would therefore find a fresh session and receive no cookie. So `proxy.ts` (the
  Next.js proxy, formerly middleware) runs `GET /api/auth/get-session` through the web's `/api/auth` proxy
  before every page whose render reads the session (`/ingresar`, `/cuenta`, and the paths under `/cuenta`),
  and returns every `Set-Cookie` with the page. It runs for a page `GET` and for a server action's `POST`
  that carry a Better Auth cookie, waits at most 3 seconds, and never blocks the page: on any failure the page
  renders and its own `GET /me` decides. A new customer page that reads the session must join the same
  matcher; the administrator pages stay out of it (see below).
- An unexpected failure of the `GET /me` read on the web server is logged once as
  `{"event":"own_profile_read_failed","error":"<class>"}` (`lib/server/server-log.ts`): the event name and the
  error class only, never a message, an address, a cookie, a token, or a response body.

### Administrator pages (current)

This is M2 T8d (S6, S21, S36; L34, L40, L42): `apps/web/app/admin`, `apps/web/lib/admin`, and
`apps/web/lib/server/auth-session.ts`. The copy addresses the administrator with "tú", like customers. No public
page links to `/admin`; the pages ask search engines not to index them. The pages only choose what a visitor
sees: the API authorizes every action.

- Each page reads the session on the web server with `GET /api/auth/get-session?disableRefresh=true` through the
  web's own `/api/auth` proxy, so the client IP and the proxy secret reach the API as on a browser request. A
  pending administrator cannot read `GET /me` (ADR 0004 decision 3), and `disableRefresh` keeps the stored session
  unchanged, so a customer who opens `/admin` does not lose the daily renewal of the cookie. Administrator
  sessions are never extended (L34), so the pages stay out of the `proxy.ts` matcher.
- Routing: anonymous visitors go to `/admin/ingresar`, pending administrators (role `ADMIN`, `twoFactorEnabled`
  not `true`) to `/admin/activar`, enrolled administrators to `/admin`, and customers to `/cuenta`. When the read
  fails, `/admin` and `/admin/activar` show a retry notice, `/admin/ingresar` shows the form, and the web logs one
  `{"event":"auth_session_read_failed","error":"<class>"}` line.
- `/admin/ingresar` sends `POST /api/auth/sign-in/email` with `{ email, password }`. An enrolled administrator
  gets `twoFactorRedirect` and enters the 6-digit code (`POST /api/auth/two-factor/verify-totp`) or, as an
  alternative, a backup code (`POST /api/auth/two-factor/verify-backup-code`); a pending administrator gets a
  session at once and goes to `/admin/activar`. Every `400` or `401` of the password step, which covers a wrong
  address or password, a customer, a `DISABLED` user, and an expired initial password, shows one message (S20,
  S22). The rate limit (`429`), a wrong code, a used or wrong backup code, an expired challenge, 5 wrong codes in
  one challenge, and the 15-minute lock each have their own message; an expired challenge and 5 wrong codes send
  the administrator back to the password step.
- `/admin/activar` asks for the password (`POST /api/auth/two-factor/enable`), shows the TOTP URI as a QR code
  drawn in the browser by `lean-qr` with the setup key in groups of 4 as a fallback, confirms with the first code
  (`POST /api/auth/two-factor/verify-totp` with the session, which replaces it with an enrolled one), and then
  shows the 10 backup codes once. Continuing to `/admin` needs an explicit «Ya los guardé» with a checked box.
  The URI, the setup key, and the backup codes exist only in the memory of the client component: never in a URL,
  a log, web storage, a cookie, a server action, or a third-party service.
- `/admin` shows the administrator's address, a note that the session ends 12 hours after sign-in, and «Cerrar
  sesión», which ends on `/admin/ingresar` even when the session is already gone.

### Access control (current)

This is the implemented state of ADR 0004 decision 6.

- `AccessControlGuard` (`auth/access-control/access-control.ts`) is the global guard, registered by
  `AccessControlModule`. It denies every route by default.
- `@Public()` marks a public route; the guard lets it through without reading any session, so `GET /health`
  reports its own status (503 when the database is down) whether or not a cookie is present. Today only
  `GET /health` is public.
- Every other route needs a valid session whose stored user is `ACTIVE`; otherwise it answers `401`.
- `@AdminOnly()` also needs the stored role `ADMIN`: anonymous requests get `401` and other users `403`. No
  administrative route exists yet.
- The integration's own markers (`@AllowAnonymous()`, `@Roles()`, and the rest) can never open or seem to
  restrict a route. `RouteMarkerCheck` (`auth/access-control/route-marker-check.ts`) scans every registered
  controller and handler during `app.init()` and refuses to start, naming the class, the handler, and the
  marker. The guard still refuses such a route with `500` per request, as defense in depth.
- The role and status are read from the stored user on every request. Better Auth's session cookie cache is
  pinned off, so a revoked session or a `DISABLED` user is rejected on the next request.
- On Better Auth's own endpoints, a `hooks.before` hook (`auth/inactive-session-hook.ts`) reads the session and
  its stored user from the database and deletes the session when the user is not `ACTIVE`. Every endpoint then
  answers as it does without a session: `GET /api/auth/get-session` returns `200 null`, endpoints that need a
  session return `401`, and sign-out still succeeds. The hook also runs for the guard's own session lookup.
  This makes a session that survives `user:disable`, for example one created by a concurrent sign-in, useless
  everywhere.
- `role` and `status` are server-side fields (`input: false`): a client value is ignored when an account is
  created and rejected with `400 FIELD_NOT_ALLOWED` by a server-side `auth.api.updateUser` call. Password
  sign-up is disabled: `POST /api/auth/sign-up/email` answers `400 EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- Better Auth routes that change a user, an email address, an account link, a password, or a second factor
  answer `404`
  (`disabledPaths`, `DISABLED_AUTH_PATHS` in `auth/auth.factory.ts`): `/update-user`, `/change-email`,
  `/delete-user` and its callback, `/change-password`, `/request-password-reset`, `/reset-password`, the
  email-code password reset, email change, and email verification routes, `/verify-email`,
  `/send-verification-email`, `/update-session`, `/link-social`, `/unlink-account`, `/two-factor/disable`,
  `/two-factor/get-totp-uri`, `/two-factor/send-otp`, and `/two-factor/verify-otp`. Profile changes go only
  through `PATCH /me`. `/set-password` is server-only and never routed. The restriction covers HTTP, not
  server-side `auth.api.*` calls.
- A Better Auth `session.create.before` hook (`auth/auth.factory.ts`) refuses a session to a user who is not
  `ACTIVE` on every sign-in path, to an administrator on the email-code paths, to anyone but an administrator
  on password sign-in, and to an un-enrolled administrator whose enrollment window has ended. On
  `POST /api/auth/sign-in/email-otp` the refusal is the same `400 INVALID_OTP` as a wrong code; on
  `POST /api/auth/sign-in/email` it is the same `401 INVALID_EMAIL_OR_PASSWORD` as a wrong password.
- `DISABLED` users and administrators receive no sign-in code; the request still gets the identical
  `200 {"success":true}`.
- `pnpm --filter @invitame/api user:disable -- <email>` (`users/`) sets a user to `DISABLED` and deletes all of
  their sessions in one transaction. It is idempotent and logs the user id only.

### Administrator sign-in and enrollment gate (current)

This is the implemented state of ADR 0004 decision 3 and S6, S20, S21, and S22 (`auth/account-access.ts`,
`auth/administrator-enrollment.ts`, `auth/inactive-session-hook.ts`).

- Administrators sign in with `POST /api/auth/sign-in/email` (email and password). A customer, an unknown
  address, a wrong password, a `DISABLED` administrator, and an expired initial password all get the identical
  `401 {"code":"INVALID_EMAIL_OR_PASSWORD","message":"Invalid email or password"}`. Milestone 2 offers no
  password change or reset through the API.
- An administrator is **enrolled** once `User.twoFactorEnabled` is `true`. Better Auth sets it only when the
  first valid TOTP code confirms enrollment; `TwoFactor.verified` is never used, because its column defaults
  to `true`.
- The **enrollment window**: until enrolled, the initial password works for 24 hours from its issue, which is
  the `createdAt` of the administrator's credential account. No API route can create or replace that account.
  After the 24 hours, password sign-in answers like a wrong password, every existing session of that
  administrator is deleted on its next use, and enrollment is therefore refused.
- A **pending administrator** (role `ADMIN`, not enrolled, inside the window) holds no administrator
  authority. Its session can do exactly four things on Better Auth's endpoints:
  1. `GET /api/auth/get-session`: read the session (the user has `twoFactorEnabled: false`);
  2. `POST /api/auth/two-factor/enable` with the password: returns the TOTP URI (issuer `InvitaMe`) and 10
     backup codes; calling it again replaces both while enrollment is unconfirmed;
  3. `POST /api/auth/two-factor/verify-totp` with a code from the app: confirms enrollment and replaces the
     session with a new one;
  4. `POST /api/auth/sign-out`.

  Every other Better Auth endpoint answers exactly as without a session; the session itself stays valid.
  Every project route, `@AdminOnly()` routes and `GET`/`PATCH /me` included, answers the generic
  `401 {"message":"Unauthorized","statusCode":401}`: the sign-in is incomplete until enrollment.
- Customer sessions are hidden from every `/two-factor/*` endpoint in the same way.
- An **enrolled administrator** signs in in two steps. The password step answers
  `200 {"twoFactorRedirect":true,"twoFactorMethods":["totp"]}` with only a `two_factor` challenge cookie (600
  seconds); Better Auth deletes the session it created for the password step within the same request. The
  second step, `POST /api/auth/two-factor/verify-totp` with a TOTP code or
  `POST /api/auth/two-factor/verify-backup-code` with a backup code, creates the session. Trusted devices are
  never honored (`trustDevice` is forced to `false`).
- Each backup code works once; the 10 codes are stored encrypted with the auth secret, and
  `POST /api/auth/two-factor/generate-backup-codes` (password required) replaces them for an enrolled
  administrator. The second factor cannot be removed through the API.
- Attempt limits: a challenge ends after 5 wrong codes (`400 TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`); 10
  consecutive failures across challenges lock the second factor for 15 minutes
  (`429 ACCOUNT_TEMPORARILY_LOCKED`, `TwoFactor.failedVerificationCount` and `lockedUntil`).
- Email-code sign-in stays refused for administrators in every state (pending, enrolled, or expired window):
  no code is sent and the send request gets the identical `200 {"success":true}`; a code issued earlier gets
  the identical `400 INVALID_OTP`.
- `pnpm --filter @invitame/api admin:create -- <email>` (`users/`) creates an `ACTIVE` `ADMIN` with a credential
  account holding a generated 24-character password, hashed with Better Auth's own hasher, in one
  transaction. For a pending administrator it replaces the password, restarts the window, drops an
  unconfirmed enrollment, and deletes their sessions in one transaction. It refuses an enrolled or `DISABLED`
  administrator and any customer address. See the README for usage.

### Own profile (current)

The signed-in user's own profile is the first owned resource (`users/`, in the module template's layers).

- `GET /me` returns `200 {"id","email","displayName","role"}` from the stored user of the session;
  `displayName` is `null` when no name is set.
- `PATCH /me` takes exactly `{"displayName": string | null}` and returns the updated profile. The name is
  trimmed and must then have 1 to 120 characters (Unicode code points, as `VarChar(120)` counts them) with no
  control character or unpaired surrogate; `null` clears it. Invalid values get `400` and change nothing.
- The user id comes only from the session (`@SessionUserId()`), never from the path, query, or body. Any
  other body field, including `id`, `email`, `role`, and `status`, gets `400`: the global `ValidationPipe`
  runs with `whitelist` and `forbidNonWhitelisted` (`app.setup.ts`).
- Anonymous, invalid, and non-`ACTIVE` sessions get `401` from the global guard, before the body is
  validated.
- Non-goals in Milestone 2: changing the email address and deleting the account; their Better Auth routes are
  disabled.

### Customer sign-in code (current)

This is the implemented state of ADR 0004 decisions 3 and 8 (as amended) for customers.

1. `POST /api/auth/email-otp/send-verification-otp` with `type: "sign-in"` stores a new 6-digit code that
   expires after 300 seconds, as a SHA-256 hash with an attempt counter, then calls the `SignInCodeSender` hook.
2. The hook returns at once for every address, so the response is always `200 {"success":true}`, whether the
   address is unknown, a customer, or an administrator, and whatever happens to the email.
3. In the background, `SignInCodeSender` first counts the request against the per-email cap; over the cap the
   issued code is removed unsent. It then looks up the account. An administrator or a `DISABLED` user receives
   no code and the issued code is removed. A customer's code goes through `EmailDeliveryService` in Spanish, with a random idempotency
   key per send, so retries reuse the same code and message.
4. When delivery still fails after the retries, exactly that code is removed, matched by its stored hash, so a
   newer code for the same address stays valid; the failure is not a wrong attempt.
5. `POST /api/auth/sign-in/email-otp` accepts the code; 3 wrong codes lock it (`403 TOO_MANY_ATTEMPTS`) and an
   expired code returns `400 OTP_EXPIRED`. The first sign-in creates a verified `CUSTOMER` and ignores a
   client-supplied `name`, `image`, and `role`.

The other OTP types (`email-verification`, `forget-password`) never send a message: their codes are deleted at
once for every address. Background tasks (`auth/sign-in-code/background-tasks.ts`) catch every failure and log
only a `background_task_failed` event with the task name, the failed stage (`quota`, `lookup`, `delivery`, or
`invalidation`), and the error class. When the cap check or the role lookup fails, the code is invalidated
before delivery. At most 100 deliveries wait per process; beyond that the code is discarded at once and a
`background_task_rejected` warning is logged. On shutdown, pending tasks drain in the sign-in module's
`onModuleDestroy`, which Nest runs before the global Prisma module disconnects. Nest closes the HTTP server only
after those hooks, so a request can still arrive during the drain: from the moment the drain starts, every new
task is refused with a `background_task_rejected_after_shutdown` warning, and the sender removes that code at
once, as it does at capacity, while pending tasks still complete. No log carries the code or the address.

### Abuse limits (current)

This is the implemented state of ADR 0004 decision 7 and S10, S19, and S25 for the code endpoints and for
administrator sign-in.

- Better Auth's rate limiter runs in every `NODE_ENV` and stores its counters in the `RateLimit` table through
  the Prisma adapter (`auth/auth.factory.ts`); tests use the in-memory database adapter on the same path.
- `/email-otp/send-verification-otp` and `/sign-in/email-otp` allow 3 requests per 60 seconds per client IP;
  the 4th gets Better Auth's `429`.
- `/sign-in/email`, `/two-factor/enable`, and `/two-factor/generate-backup-codes`, which check a password,
  allow 3 requests per 60 seconds per client IP. `/two-factor/verify-totp` and
  `/two-factor/verify-backup-code` allow 5 per 60 seconds per client IP, above the 5 wrong codes one challenge
  allows. Other paths keep the defaults of Better Auth and its email OTP plugin, such
  as 100 requests per 10 seconds per client IP.
- Each address gets at most 5 codes per fixed hour (`auth/abuse-limits.ts`): the hour starts at the first counted
  code, later codes never move it, and the first request after it ends opens a new hour. Every `sign-in` request
  counts, whatever
  its delivery outcome, in the background task, so the response timing does not depend on the address. Over the
  cap the response is the same `200 {"success":true}`, no email is sent, and the issued code is removed. The
  count is a `RateLimit` row keyed by `sign-in-code-email|` plus the SHA-256 of the lower-cased address; the
  plain address is never stored. The row's `lastRequest` holds the hour's start, and a rule that matches no path
  sets Better Auth's pruning cutoff to one hour, so pruning never deletes these rows before the hour ends. A
  storage error while counting, other than a concurrent create of the same row, removes the code and is logged
  with the `quota` stage.
- The client IP comes from one configured header, `AUTH_CLIENT_IP_HEADER` (default `x-forwarded-for` outside
  production; required in production), which the API trusts only next to a valid proxy secret when one is
  configured (see "Web boundary"). Without `AUTH_TRUSTED_PROXIES`, only a single-address value is accepted;
  with it, trusted proxy hops are stripped from the right.
- In production, a request whose client IP cannot be resolved gets the generic `503` below and a
  `client_ip_unresolved` warning; it never shares one rate-limit bucket. Startup also fails when Better Auth's
  own environment would map unknown clients to `127.0.0.1`.
- When the rate-limit store fails, Better Auth throws before the endpoint runs. The wrapper in
  `auth/auth-request-guard.ts` returns `503 {"code":"SERVICE_UNAVAILABLE",...}` with no internal detail and
  logs an `auth_request_unavailable` warning with the path and error class only: no code row, no email.
- Limits are per database, shared by every API instance; the background-task cap is per process.

### Email delivery (current)

This is the implemented state; customer sign-in codes are its only caller (ADR 0004 decision 8).

- `email/application` owns the `EmailSender` port (DI token `EMAIL_SENDER`) and `EmailDeliveryService`, the only
  entry point for callers. `EmailModule` binds the port to the adapter selected by `EMAIL_TRANSPORT` and exports
  only the service.
- Transport: `resend` in production (required; any other value fails closed at startup, and `EMAIL_FROM` and
  `RESEND_API_KEY` are required), `mailpit` by default in development, and `memory` by default in test.
- Retries: only transient failures (network errors, 4 s timeouts, 429, 5xx, and Resend's in-progress idempotency
  conflict) are retried, 3 attempts in total with 250 ms and 500 ms backoff. Every attempt sends the same message
  and the same `Idempotency-Key`, so Resend delivers it at most once within its 24-hour key window. Other 4xx
  responses are permanent and not retried.
- Failures: callers receive only `EmailDeliveryUnavailableError`; the sign-in code sender invalidates the code
  and never surfaces the error in a response. A structured
  `email_delivery_failed` warning records attempts, reason, and the transient flag, never the recipient, subject,
  body, code, or key. Five failed deliveries within five minutes emit one error-level `email_delivery_degraded`
  event, the hook for an operational alert; it re-arms after a failure-free window. The counter is per process.

Do not add empty feature layers to this foundation. A real capability earns a feature module when it has business
behavior, persistence, or an external boundary.

## Target feature module map (planned)

These are product boundaries, not a claim that the folders already exist:

| Module | Responsibility |
| --- | --- |
| Auth | Sessions, identity verification, and authentication policy. |
| Users | Account profile, ownership, and account lifecycle. |
| Categories | Event-category catalog management. |
| Templates | Mutable catalog metadata, versions, schemas, and renderer identity. |
| Invitations | Invitation lifecycle, authoring, publication reference, and ownership. |
| Packages | Sellable package catalog, prices, and included feature relationships. |
| Features | Allow-listed capability contracts represented by catalog data. |
| Payments | Checkout, payment state, provider references, and webhook intake. |
| Media | Upload policy, asset ownership, and object-storage adapters. |
| Guests | Invitation guest records and guest access tokens. |
| RSVP | Responses and invitation-specific attendance state. |
| Analytics | Privacy-bounded event capture and invitation metrics. |
| Admin | Catalog operations, support actions, and operational controls. |

Cross-module collaboration must use a deliberate public application port or contract. A module must not import
another module's domain, repositories, controllers, or infrastructure internals.

## Module layout and dependency direction

The minimum target shape for a real API module is documented in
[`module-template.md`](module-template.md). The conceptual direction is:

```text
presentation ──► application ──► domain
       infrastructure ───────────► domain
       infrastructure ──implements application ports
```

| Layer | Owns | May import | Must not import |
| --- | --- | --- | --- |
| `domain` | Pure invariants, value objects, domain errors, and contracts. | Language/runtime primitives and its own files. | NestJS, Prisma, HTTP, React, presentation, or infrastructure. |
| `application` | Use-case orchestration, authorization decisions, transaction intent, and ports. | Domain contracts and approved shared application primitives. | Prisma clients, HTTP decorators, React, or another module's internals. |
| `infrastructure` | Prisma repositories, provider clients, mappers, and technical adapters. | Domain/application ports and infrastructure libraries. | Presentation/UI. |
| `presentation` | DTO validation, transport mapping, controllers, and response policy. | Application contracts/use cases and NestJS transport code. | Prisma queries or business rules. |

The dependency arrow points inward. The application identifies the business operation that must be atomic; the
infrastructure adapter owns the actual Prisma transaction lifecycle. Controllers and UI do not open transactions.

## Request flow

For the current foundation, a health request follows this path:

```text
HTTP GET /health
  → HealthController
  → HealthService
  → PrismaService.$queryRaw(SELECT 1)
  → typed health response or 503
```

For a future protected operation:

```text
HTTP request
  → presentation DTO + global validation
  → authentication and authorization boundary
  → application use case
  → domain invariant checks
  → infrastructure port adapter and transaction
  → response mapper
```

Authorization is enforced by the API even when the web UI hides an action. A hidden button is not a security
boundary.

## Public invitation flow (planned)

```text
Public URL /<slug>
  → apps/web resolves the public route
  → apps/api loads the published Invitation by unique slug
  → API returns its referenced TemplateVersion snapshot and validated render data
  → web selects a component from the local renderer registry by componentKey
  → registry renders the invitation with data, never with executable database content
```

An invitation points to `TemplateVersion`, not to mutable `Template` metadata. Publishing changes which invitation
state is publicly visible; it does not rewrite the version snapshot. Public rendering must fetch the required data
without an N+1 query pattern and must fail closed for unpublished, missing, or unauthorized resources.

## Renderer registry and `componentKey`

`componentKey` is an identifier, not a module path, JavaScript expression, template string, or code blob. The
application owns a registry similar in concept to:

```text
"birthday-adventure-01" → BirthdayAdventureRenderer
"wedding-editorial-01" → WeddingEditorialRenderer
```

The registry is an explicit allow-list compiled into the application. The database stores the selected key plus
validated schema/configuration data. A missing or unknown key is an operational error, not permission to evaluate
dynamic code. New renderer behavior is shipped as reviewed application code and then referenced by a new
`TemplateVersion`.

## Publication and payment trust boundaries

Publication is a backend state transition. The browser can request it, but the API verifies ownership,
authorization, completeness, and any required payment state before changing the public state.

Payment status is provider input until the API verifies the provider signature, maps the event to an internal
payment state, and applies an idempotent transition. The frontend may display status, but it cannot grant access,
mark an invitation paid, or publish an invitation. Provider payloads remain adapter input and are not the domain
model. See [`future-model.md`](../database/future-model.md) for design-only data decisions.

## When a service extraction is justified

Keep the modular monolith until there is measured evidence that an extraction solves a real problem. A service
boundary requires a human-approved decision based on one or more of:

- independent scaling or availability needs that cannot be met inside the monolith;
- a provider or workload with materially different security or operational ownership;
- a stable contract with clear data ownership and an acceptable consistency model;
- measured deployment, performance, or fault-isolation pressure; and
- an operational plan for observability, retries, local development, data migration, and on-call ownership.

Extraction is not justified by folder size, fashion, or an AI-generated architecture diagram.

## Explicit MVP non-goals

The MVP does not introduce microservices, CQRS, event sourcing, GraphQL, Kafka, Kubernetes, or a general-purpose
workflow engine. It also does not include an arbitrary Canva-style editor, custom domains, OAuth, multiple payment
providers, sophisticated analytics, queues, or native mobile applications. These are roadmap decisions, not hidden
commitments in the current runtime.
