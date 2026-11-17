# Architecture overview

InvitaMe is a modular monolith with two independently runnable applications. The repository currently contains
the foundation (catalog/version data, API configuration and health, Prisma ownership, and an honest pre-launch
landing page) and the Milestone 2 identity work: customer and administrator sign-in, sessions, access control,
the own profile, and the operator commands. The module map and flows below describe the target product and are
explicitly planned unless marked current.

## Current versus target status

| Area | Current foundation | Target direction |
| --- | --- | --- |
| Web | `apps/web` is a Next.js 16 App Router app with an honest pre-launch landing page at `/` (see Landing page below), a proxy for `/api/auth`, a server-side API client, and the customer pages `/ingresar` (sign-in by emailed code) and `/cuenta` (own profile and sign-out) with `/cuenta/invitaciones` (own invitation drafts: list, create from a published template and an active package, edit the pinned fields, edit the time zone and WhatsApp contact, archive), the guest page `/i/<slug>` of a published invitation (rendered per request, with its feature block and its `/i/<slug>/calendario.ics` download), and the administrator pages `/admin/ingresar` (password and second factor), `/admin/activar` (authenticator-app enrollment), and `/admin` (a minimal panel with sign-out); the pages use the visual theme «A · Rosa y vino» ([`docs/design/theme.md`](../design/theme.md): Tailwind tokens, fonts committed in the repository and loaded with `next/font/local` so the build needs no network for them, fine-line SVG ornaments, and a contrast test). | Guests, RSVP, payment, and media. **Planned** (Milestones 6–8). |
| API | `apps/api` has configuration, a global Prisma service, `GET /health`, and Better Auth mounted at `/api/auth` with customer sign-in by emailed code, administrator sign-in by password and a mandatory authenticator app, a deny-by-default guard with an administrator role check and enrollment gate, the signed-in user's own profile (`GET /me`, `PATCH /me`), and account disabling, administrator creation, and administrator recovery by server-side commands. | Feature modules exposing stable REST contracts. **Planned.** |
| Database | PostgreSQL and Prisma own `User` and the identity tables Better Auth reads and writes (sessions, credential accounts, verification codes, two-factor records, and rate-limit counters) plus the catalog, packages, features, templates, immutable template versions, and `Invitation` drafts pinned to a version; see [`model.md`](../database/model.md). | Guest, RSVP, payment, media, and analytics models. **Planned.** |
| Catalog | The API `catalog` module (`apps/api/src/catalog`) serves administrator-only endpoints under `/admin/catalog` for categories, features, packages with their features and MXN prices, templates, and template versions (create, publish, retire); the web pages under `/admin/catalogo` call them from the server. See Catalog administration below. Signed-in creators read the published templates and active packages through `GET /catalog/templates` and `GET /catalog/packages`, served from the catalog's public application contract (`CatalogPublicReader`); the template read also answers the published version's own `configuration` snapshot, so the creator chooser can preview each template with the real renderer instead of a stored screenshot. | Anonymous catalog browsing. **Planned.** |
| Invitations | The API `invitations` module (`apps/api/src/invitations`) lets a signed-in customer create, list, read, edit the content of, edit the feature data of, and archive their own drafts under `/invitations`, and publish (`POST /invitations/:id/publish`) or unpublish them; publication requires every required field, content that still validates, a package that still fits, and a pinned version that is still published, and it asks a payment gate that answers "no payment required" until Milestone 7. A published invitation stays editable live. Each invitation stores an IANA `timeZone` and one optional `InvitationFeatureSettings` row keyed by the invitation, written through `PUT /invitations/:id/features` (creator-owned, validated, refused for an archived invitation like a content save); the domain gates what a guest may see as the pinned package's feature keys intersected with the implemented allow-list `COUNTDOWN`, `MAP`, `RSVP`, `WHATSAPP`, `MUSIC`, `GIFT_REGISTRY`, `GUEST_LIST`, and `QR_PASS`, plus the always-available calendar, with WhatsApp only while a phone is stored and music only while an allow-listed playlist link is stored. Guests read it through the public, uncacheable `GET /public/invitations/:slug`, which returns only the slug, `componentKey`, configuration, the pinned schema's content, `publishedAt`, `timeZone`, and the gated `features` (`countdown`, `map`, `calendar`, `whatsapp`, `music` as `{ url, provider }` or null, `giftRegistry`, and `rsvp` as `{ mode: "open" | "guest-list" | null, deadline, partyLimit, qrPass }`, where `qrPass` is true only while the package grants both the guest list and its access pass); nothing about the package travels. Milestone 6 G1 adds the open RSVP: a creator sets the deadline and the party limit (`PUT /invitations/:id/rsvp-settings`, refused for an archived invitation), reads the answers with their totals (`GET /invitations/:id/rsvp`), and downloads them as a spreadsheet-safe CSV attachment (`GET /invitations/:id/rsvp.csv`); a guest submits `POST /public/invitations/:slug/rsvp` without a session, which is refused unless the invitation is published, its package grants `RSVP` without `GUEST_LIST`, and the deadline has not passed, is limited to 10 submissions per hour per client address and invitation on the shared `RateLimit` store, drops a submission whose honeypot field is filled while answering the same 202, and upserts on `(invitationId, dedupeKey)` so a retry never duplicates. Milestone 6 G2 adds the guest list behind `GUEST_LIST`: the creator lists the guests with their answers, check-in state, and totals (`GET /invitations/:id/guests`), adds one (`POST /invitations/:id/guests`, which answers the plain personal token once), edits one (`PUT /invitations/:id/guests/:guestId`), removes one together with the answer it gave (`DELETE /invitations/:id/guests/:guestId`), and rotates one's link (`POST /invitations/:id/guests/:guestId/token`); the CSV export becomes the guest list, pending guests and check-in times included, while the open form keeps its own export. A personal link is `/i/<slug>/g/<token>`, read through `GET /public/invitations/:slug/guests/:token` as the same public projection plus one `guest` block, and answered through `POST /public/invitations/:slug/guests/:token/rsvp`; both answer the one public 404 for every unknown, revoked, or foreign token, the answer is validated against the guest's own seats, and a submission is limited per guest on the shared `RateLimit` store. With `QR_PASS`, the owner checks a confirmed guest in through `POST /invitations/:id/guests/check-in`, which keeps the first check-in instant, and the personal page offers the access QR only to a confirmed guest. Every guest route is refused with 409 `GUEST_LIST_NOT_AVAILABLE` (or `QR_PASS_NOT_AVAILABLE` for the check-in) unless the pinned package grants the key. The web draft page adds a «Funcionalidades» section (the time zone select, the WhatsApp contact and the playlist link when the pinned package includes them, the note that names the packages granting the gift registry, and the automatic features the guests will see) that saves through a server action like the content form. A draft pins a published `TemplateVersion` and an active package that includes the renderer's required feature keys, gets a generated unique slug, and stores partial content validated against the pinned schema; the owner comes only from the session and another owner's draft answers 404. See `odd/tasks/m4-invitations.md` and `odd/tasks/invitation-features.md`. | Payment, the web guest list and QR pages (M6 G4), media, expiration rules, and slug regeneration. **Planned.** |
| Renderer | An allow-listed renderer registry: the API validates each version's `schema` and `configuration` against the renderer contract at creation and publication, and the web maps `componentKey` to a reviewed component; a test keeps both key lists equal. The registered renderers are the three themed birthday layouts `birthday-map-01`, `birthday-poster-01`, and `birthday-story-01` with the shared eight-theme allow-list, the baby shower layout `baby-shower-classic-01` with its eight baby shower themes, the themed baptism layout `baptism-classic-01` with its six themes, the three elegant «Arco y foto» layouts `xv-arch-01`, `wedding-arch-01`, and `baptism-arch-01`, and the three elegant «Ornamental» layouts `xv-ornamental-01`, `wedding-ornamental-01`, and `baptism-ornamental-01`, all six with the shared eight elegant themes; each takes exactly `{ componentKey, theme }`. The earlier single design `birthday-adventure-01` was deleted when the themed layouts replaced it. | Further layouts and themes per occasion. **Planned.** |
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
  users/        own profile (`GET /me`, `PATCH /me`), the disable-user, create-administrator, and
                reset-second-factor use cases, their Prisma adapters, and the `user:disable`, `admin:create`, and
                `admin:reset-second-factor` commands
  app.module.ts Nest composition root
  app.setup.ts  shared app creation: body parser off, Helmet, CORS, validation, shutdown hooks
  main.ts       HTTP bootstrap through the shared app creation
```

### Authentication boundary (current)

The sections below, up to "Email delivery", describe what the code implements of ADR 0004. Decisions 1 to 3,
5 to 7, and 9 are implemented in the API and the web. Decision 4 is implemented except its hosting part: nothing
is deployed, so the Railway project, the registered domain, and the production `https` origin do not exist yet.
Decision 8 is implemented in code, with Mailpit locally and a Resend adapter, but no production Resend account or
sending domain is set up (a Milestone 2 non-goal), and nothing routes the `email_delivery_degraded` event to an
alert. Start with "Access control" for roles and account status, "Administrator sign-in and enrollment gate" for
decision 3, and "Abuse limits" for decision 7.

- Better Auth runs inside the API through `@thallesp/nestjs-better-auth` and is mounted at `/api/auth`. It is
  built from validated configuration (`NODE_ENV`, `BETTER_AUTH_SECRET`, `AUTH_BASE_URL`, `CORS_ORIGIN`, and in
  production `AUTH_PROXY_SECRET`) and the shared Prisma client; the API refuses to start when any of them is
  missing or invalid.
- `NODE_ENV` has no default (S56, L79): a missing value fails the startup, because an unset value would turn off
  every production rule (the proxy secret, the client IP header, `https`, and Resend-only delivery). The accepted
  values are `development`, `test`, and `production`. `pnpm --filter @invitame/api start` sets nothing, so the
  deploy environment must set `NODE_ENV=production`.
- Better Auth reads some variables on its own, so the API refuses them at startup and names the variable without
  echoing its value: `BETTER_AUTH_TRUSTED_ORIGINS` (use `CORS_ORIGIN`) and `BETTER_AUTH_SECRETS` (S55, L79), which
  would replace the validated `BETTER_AUTH_SECRET`. Each is refused for any value other than unset or exactly the
  empty string `""`: a whitespace-only value is refused, and `""` is accepted because Better Auth treats it as
  absent.
- `BETTER_AUTH_SECRET` signs every session and encrypts each administrator's TOTP secret and backup codes (S57,
  L79). Changing it ends every session, and each enrolled administrator cannot use their second factor until
  `admin:reset-second-factor` runs for them. The API passes a single `secret`, so it has no rotation path yet:
  rotating without that breakage, through Better Auth's `secrets` list, is a task of the deployment milestone.
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
`auth/session-settings.ts`, `auth/auth.factory.ts`, `auth/session-access-hook.ts`). The web side is
described in "Web boundary" below.

- `AUTH_BASE_URL` is the public web origin through which the web proxies `/api/auth`. Startup validation
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
  every request reads it. A session whose creation time is not a valid date is stored as already expired
  instead of getting an unbounded expiry, and one `administrator_session_created_at_invalid` event is logged
  (S49).

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
  `auth_proxy_upstream_failed` warning with the path, reason, and status only. When the browser goes away, the
  proxy ends its API call too, answers `499` (the client-closed-request status, so server error metrics do not
  count a cancellation), and logs nothing, since the API did not fail (T9b part C1; S51).
- The API refuses every `/api/auth` request without the secret in production (`403 {"code":"FORBIDDEN"}` and an
  `auth_proxy_rejected` warning with the path only) before any endpoint, hook, or rate-limit step runs. It
  always removes the secret header, and removes the client IP header unless the secret was valid. Outside
  production without a configured secret it serves direct requests and trusts the client IP header as before.
- The server-side API client (`lib/server/api-client.ts`, bound to the request by `lib/server/session-api.ts`)
  sends only Better Auth's cookies (`better-auth.*` and `__Host-better-auth.*`) and the secret. It calls
  `GET /me` and `PATCH /me` (the browser cannot call `PATCH` because of CORS), maps `401` to "not signed in",
  and maps other failures to a typed `ApiClientError` that never carries the response body. One 10-second
  deadline covers the headers and the body: a body that stalls or breaks off is `unavailable`, and only a
  complete body that does not match the contract is `invalid-response`. An `unavailable` error keeps the
  network or timeout error as its `cause`. A cookie pair without `=` is never forwarded. The API does not
  check the secret on `/me` in Milestone 2.
- Rolling sessions: a session read by the web server refreshes the stored session but sends the browser no
  cookie. The browser's cookie is extended only when `GET /api/auth/get-session` runs through the proxy; see
  "Customer pages" for why the web runs it before a signed-in page renders.
- The web settings have no `NEXT_PUBLIC_` prefix and are read only by server modules; the route handler and
  `session-api.ts` import `server-only`. `instrumentation.ts` validates them when the Node.js server starts;
  on an invalid setting it logs one `web_config_invalid` line that names the variable (never its value) and
  exits with code 1, because Next.js 16.3.5 would otherwise keep running and answer every request with `500`.
  `next build` skips this check and needs none of the variables. See the README for the variables.

### Landing page (current)

This is M2 T8l (S35, S37; L41, L45): `apps/web/app/page.tsx`, `apps/web/app/_components/landing/`, and
`apps/web/lib/landing/copy.ts`. The page rebuilds the approved concept «A · Rosa y vino» version 3 (hero with
invitations fanned out of an envelope, the occasions band, the sample gallery, the steps, the guest experience on a
phone, the closing band, and the footer) as a server component with no client JavaScript. It is rendered per
request because it reads the request's cookies: a visitor who carries a Better Auth session cookie sees «Mi
cuenta» (to `/cuenta`) instead of «Ingresar» in the header, the closing band, and the footer. The cookie only
chooses the link and no API call is made; `/cuenta` checks the session and sends an expired one to `/ingresar`.

- It is an honest pre-launch page (S37): the customer pages and the administrator pages are the only product
  surfaces, so «Ingresar» (to `/ingresar`), or «Mi cuenta» with a session, is the only active product action. Every other product action is a
  «Próximamente» label that is neither a link nor a button; in-page anchors only scroll to `#disenos` or
  `#como-funcionara`. The gallery is «Diseños de muestra», the steps are «Así funcionará» in the future tense,
  and the guest phone is labeled «Ejemplo de invitación». No public page links to `/admin`.
- All landing copy, including the default page title and description in `app/layout.tsx`, lives in
  `lib/landing/copy.ts`. `lib/landing/copy.test.ts` rejects the claims the owner ruled out (handmade, brand names,
  usage numbers, an active «Crear mi invitación» or «Ver diseño»), checks that every action is «Ingresar» to
  `/ingresar`, a «Próximamente» label, or an anchor to a section of the page, and checks that the landing
  components take every link target from the copy and render no button. When a feature ships, its section changes
  in the copy after the owner reviews the claim.
- The hero bouquet draws itself from the CSS inside `public/ornaments/bouquet-draw.svg`; with reduced motion the
  page shows the same bouquet already drawn (see [`docs/design/theme.md`](../design/theme.md)).

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
- Forms never put a field in a URL (M2 T8e; S42). The forms of `/ingresar`, `/admin/ingresar`, and
  `/admin/activar` send only through JavaScript: each declares `method="post"`, and their submit buttons and the
  shared sign-out button stay disabled until the page is interactive (`useInteractive` in
  `lib/customer/interactive.ts`, which reads `false` in the server render and during hydration). So neither a
  click nor Enter submits a form natively before React handles it, and without JavaScript the page shows one
  line asking for it, kept in the page's copy module. The browser suite proves it with JavaScript disabled.
- Rolling sessions: Better Auth sends the refreshed session cookie only in the same `getSession` call that
  moves the stored expiry, and the API guard behind `GET /me` also runs that refresh. A refresh started by the
  browser after the render would therefore find a fresh session and receive no cookie. So `proxy.ts` (the
  Next.js proxy, formerly middleware) runs `GET /api/auth/get-session` through the web's `/api/auth` proxy
  before every page whose render reads the session (`/ingresar`, `/cuenta`, and the paths under `/cuenta`),
  and returns every `Set-Cookie` with the page. It runs for a page `GET` and for a server action's `POST`
  that carry a Better Auth cookie, waits at most 3 seconds, and never blocks the page. That limit
  (`SESSION_REFRESH_TIMEOUT_MS`) is the real bound of `/ingresar` and the `/cuenta` pages: when the API is slow,
  the page shows its unavailable notice after about 3 seconds instead of waiting on it (S54). When the refresh fails or
  the API answers it with a `5xx`, `proxy.ts` passes the render the request header `x-invitame-api-unavailable`,
  and the page's `GET /me` or `PATCH /me` answers unavailable at once instead of waiting up to 10 more seconds
  (R4-cuenta-outage-latency-serialized); `proxy.ts` removes any copy of that header the browser sent. Otherwise
  the page's own `GET /me` decides. A new customer page that reads the session must join the same matcher; the
  administrator pages stay out of it (see below).
- An unexpected failure of the `GET /me` read or the `PATCH /me` update on the web server is logged once as
  `{"event":"own_profile_read_failed","error":"<class>","kind":"<kind>","cause":"<class>"}` (or
  `own_profile_update_failed`; `lib/server/server-log.ts`): the event name, the error class, the API client's
  fixed failure kind, and the class of the error's cause (such as `TimeoutError` or `TypeError`) when present,
  never a message, an address, a cookie, a token, or a response body. A call that `proxy.ts` skipped because
  its refresh just found the API failing has the kind `short-circuited`, so it is not mistaken for a call
  that reached a failing API (S50).

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
  `{"event":"auth_session_read_failed","error":"<class>","kind":"<kind>"}` line, with the API client's fixed
  failure kind and, when the error has a cause, a `"cause"` class; never a status, message, or body.
- `/admin/ingresar` sends `POST /api/auth/sign-in/email` with `{ email, password }`. An enrolled administrator
  gets `twoFactorRedirect` and enters the 6-digit code (`POST /api/auth/two-factor/verify-totp`) or, as an
  alternative, a backup code (`POST /api/auth/two-factor/verify-backup-code`); a pending administrator gets a
  session at once and goes to `/admin/activar`. Every `400` or `401` of the password step, which covers a wrong
  address or password, a customer, a `DISABLED` user, and an expired initial password, shows one message (S20,
  S22). The rate limit (`429`), a wrong code, a used or wrong backup code, an expired challenge, 5 wrong codes in
  one challenge, and the 15-minute lock each have their own message; an expired challenge and 5 wrong codes send
  the administrator back to the password step.
- `/admin/activar` asks for the password (`POST /api/auth/two-factor/enable`), shows the TOTP URI as a QR code
  drawn in the browser by `lean-qr` with the setup key in groups of 4 below it for manual entry (S41; a visually
  hidden caption names it «Clave de configuración»), confirms with the first code
  (`POST /api/auth/two-factor/verify-totp` with the session, which replaces it with an enrolled one), and then
  shows the 10 backup codes once. Continuing to `/admin` needs an explicit «Ya los guardé» with a checked box.
  The URI, the setup key, and the backup codes exist only in the memory of the client component: never in a URL,
  a log, web storage, a cookie, a server action, or a third-party service.
- `/admin` shows the administrator's address, a note that the session ends 12 hours after sign-in, and «Cerrar
  sesión», which ends on `/admin/ingresar` even when the session is already gone.
- The forms of `/admin/ingresar` and `/admin/activar` and the sign-out button follow the customer pages' rule:
  they send only through JavaScript and stay disabled until the page is interactive (T8e; S42).

### Catalog administration (current)

This is Milestone 3 (`odd/tasks/m3-catalog.md`). Every route is administrator-only through a class-level
`@AdminOnly()`; input is validated by DTOs and the global validation pipe, and errors carry stable codes such as
`CATALOG_KEY_TAKEN`, `CATALOG_CONCURRENT_UPDATE`, `CATALOG_TEMPLATE_NOT_PUBLISHABLE`, and
`CATALOG_RENDERER_CONTRACT_INVALID`. There are no delete routes: deactivation uses `isActive` or a status.

- Categories and features: list, create, update. Keys are fixed at creation.
- Packages: list, create, update; replace the included features in one transaction; set the current MXN price,
  which retires the current price row and inserts a new one in one transaction (the same amount is a no-op); read
  the price history. A lost concurrent change answers `409 CATALOG_CONCURRENT_UPDATE`.
- Templates and versions: list, create, update templates; create a `DRAFT` version validated by the renderer
  registry (`schema` and `configuration` each at most 64 KiB and 32 nesting levels); publish, which re-validates
  the stored snapshot and retires the previous `PUBLISHED` version in the same transaction; retire. A template may
  be `PUBLISHED` only while it has a `PUBLISHED` version. A version is never edited: a change is a new version.
- Web: `/admin/catalogo` with Categorías, Funciones, Paquetes, and Plantillas. Every write is a server action and
  the browser never calls the API (CORS allows no `PATCH`). A server-only client forwards only Better Auth cookies
  and the proxy secret and validates every response fail-closed. Prices are typed in pesos and converted to
  centavos with string arithmetic. Contract issues of a refused version come back to the form as bounded state,
  never in a URL. Pages are gated by `routeAdminPage("catalog")` like `/admin`.

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
- On Better Auth's own endpoints, a `hooks.before` hook (`auth/session-access-hook.ts`) reads the session and
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
`auth/administrator-enrollment.ts`, `auth/session-access-hook.ts`).

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
     session with a new one, only while the pending session that sent the code still exists (see the
     confirmation race below);
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
- `pnpm --filter @invitame/api admin:reset-second-factor -- <email>` (`users/`, S44, T10a) recovers a locked
  `ACTIVE` `ADMIN`, enrolled or not, with the same terminal-only safeguards. Its user update is conditional on
  `role = ADMIN` and `status = ACTIVE` and sets `twoFactorEnabled` to false; in the same transaction it reuses
  the reissue step of `admin:create` (a new credential account, so a new 24-hour window; the `TwoFactor` row
  and its backup codes deleted; every session deleted). A first confirmation racing it is reverted by the
  hook below. It refuses unknown addresses, customers, and `DISABLED` administrators unchanged, and logs the
  user id only. The README has the operator procedure, including the out-of-band identity check.
- **Confirmation race** (S39, S40; T7c, T7d): Better Auth sets `twoFactorEnabled` before it creates the
  enrolled session, in separate statements. The session-create hook decides every session that `verify-totp`
  creates for an `ADMIN` whose flag is already true. A sign-in challenge resolves no session on the endpoint and
  is allowed. A first confirmation is allowed only while its pending session still exists for the same user;
  the hook then deletes every other session of that administrator, so no session opened with the password
  alone keeps authority after enrollment. A superseded first confirmation answers
  `401 {"code":"ENROLLMENT_SUPERSEDED"}` with no session and no cookie. It is refused without reverting when
  another confirmation completed or is completing (a verified `TwoFactor` row, or a newer session of the
  user; since a newer session may be a second tab signed in with the password alone, the hook first deletes
  every session of that administrator). It is reverted, `twoFactorEnabled` back to false for that user only,
  when an `admin:create` reissue, a `user:disable`, or a sign-out removed its pending session; the reissued or
  same password can then enroll.
  The hook logs one `administrator_enrollment_superseded` event with `compensation` (`reverted` or `skipped`)
  and no personal data, and one `administrator_enrollment_compensation_failed` event with the error class if
  the revert throws. After a revert attempt it also logs `administrator_enrollment_revert_result` (see
  "Operational log contract"). `/admin/activar` ends the activation on that `401` as on an ended session, with its own
  message (S45). If the revert fails or the process stops before it, the account stays enrolled without a
  session and only `admin:reset-second-factor` releases it.
- **Second-factor marker** (S52, T11c; closes A′): each `Session` row stores `secondFactorVerified`, false by
  default. The session-create hook stores true only for a session of an enrolled `ADMIN` created on
  `verify-totp` or `verify-backup-code` (a sign-in challenge, or the allowed first confirmation, which Better
  Auth creates as a new session); every other session, including a password-only, a sign-in-code, and a pending
  administrator session, is stored false, whatever a caller passes. The session hook then deletes, before the
  endpoint runs, the session of any `ACTIVE` administrator whose `twoFactorEnabled` is true and whose session is
  not marked, so the endpoint answers exactly as without a session (`401` on `/me`, `list-sessions`, and every
  project route; `get-session` answers `null`). This holds when the confirmation's sibling-session delete
  failed: the surviving password-only sessions (A′, L72) are ended on their next use, with no dependence on
  that delete. Sessions that existed before the migration read false, so enrolled administrators sign in again
  once. A pending administrator keeps the four-endpoint allow list unchanged; a customer is unaffected. The guard
  repeats the check on its own read of the session (`lacksRequiredSecondFactor`), so an account that turns enrolled
  between the hook's read and the guard's still gets `401`, never one `200`. The session-update hook refuses any
  update that touches the marker.
  - Contract: `GET /api/auth/get-session` and `GET /api/auth/list-sessions` return `session.secondFactorVerified`
    (boolean) on each session. Clients must not read it as an authorization signal; the API decides.
  - Deploy order: apply the migration before, or together with, the API that reads the column. New code on an
    unmigrated database answers `500` on `get-session`; old code on a migrated database works, because the column
    has a default.
  - Rolling deploy: a TOTP or backup-code sign-in served by an old instance stores the session unmarked (the
    column default), and a new instance then ends it on its next use. The effect is transient: the administrator
    signs in again.

### Own profile (current)

The signed-in user's own profile is the first owned resource (`users/`, in the module template's layers).

- `GET /me` returns `200 {"id","email","displayName","role"}` from the stored user of the session;
  `displayName` is `null` when no name is set.
- `PATCH /me` takes exactly `{"displayName": string | null}` and returns the updated profile. The name is
  trimmed and must then have 1 to 120 characters (Unicode code points, as `VarChar(120)` counts them) with no
  control character, unpaired surrogate, or bidirectional control (U+061C, U+200E, U+200F, U+202A to U+202E,
  U+2066 to U+2069; S48); `null` clears it. Invalid values get `400` and change nothing.
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
  `/two-factor/verify-backup-code` allow 5 per 60 seconds per client IP, as many as the 5 wrong codes one
  challenge allows. Other paths keep the defaults of Better Auth and its email OTP plugin, such as 100 requests
  per 10 seconds per client IP.
- Each address gets at most 5 codes per fixed hour (`auth/abuse-limits.ts`): the hour starts at the first counted
  code, later codes never move it, and the first request after it ends opens a new hour. Every scheduled `sign-in`
  request counts, whatever its delivery outcome, in the background task, so the response timing does not depend on
  the address; a request refused because the background queue is full or shutting down is discarded and never
  counted. Over the
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

### Operational log contract (current)

Decided in L71 and recorded as S50 (T11d). Every operational event is one structured JSON object. **No field of
any event carries personal data:** no email address, token, cookie, password, secret, name, user id (except where
a table row names `userId`, which a server-side command prints to its operator's terminal), or raw IP. A field
holds only an event name, a route, an error class (`error.name`), a Prisma error code such as `P2002`, a count,
or a member of a closed set listed here. A message is never copied, because it can echo a value. An operational
log is not an audit trail. A failing sink never changes a response (`auth/safe-logging.ts`, `server-log.ts`).

API auth events (`auth/auth-request-guard.ts`, sink `CreateAuthOptions.log`; `path` is the Better Auth route, and
is left out when a session is created or changed outside an endpoint). In the three events of the request guard the
sender chooses the path, so it is the pathname without the query, cut to 128 characters (N5, L79):

| Event | Emitted by | Fields |
| --- | --- | --- |
| `auth_proxy_rejected` | the request guard, no valid proxy secret | `path` |
| `client_ip_unresolved` | the request guard, production only | `path` |
| `auth_request_unavailable` | the request guard, a handler or rate-limit store failure | `path`, `error` |
| `session_refused` | the session-create hook (`auth.factory.ts`, `decideSessionRefusal`): never opened | `reason` (`account_missing`, `account_not_active`, `email_code_not_allowed`, `password_not_allowed`, `enrollment_window_closed`), `path`? |
| `session_ended` | the session-access hook (`session-access-hook.ts`): deleted on its first use | `reason` (`account_not_active`, `second_factor_missing`, `enrollment_window_closed`), `path`? |
| `session_update_refused` | the session-update hook (`auth.factory.ts`) | `reason` (`second_factor_marker`, `expiry_change_not_allowed`), `path`? |
| `administrator_sibling_sessions_delete_failed` | `settleFirstConfirmation`, ending the other sessions at a first confirmation; the error is rethrown | `path`, `error` |
| `administrator_enrollment_superseded` | `refuseSupersededConfirmation`, before the revert | `path`, `compensation` (`reverted`, `skipped`) |
| `administrator_enrollment_compensation_failed` | the same, when the revert throws | `path`, `error` |
| `administrator_enrollment_revert_result` | the same, after every revert attempt | `path`, `result` (`reverted`, `unchanged` when the guarded update matched no row, `failed`) |
| `administrator_session_created_at_invalid` | the session-create hook (S49) | none |

When several reasons apply to one stored session, `session_ended` names the first in the order above. A
refusal that is also a superseded confirmation is logged by its superseded event, not by `session_refused`.

Server-side commands (`users/`, printed as one JSON line; `userId` is shown to the operator at a terminal):
`administrator_created`, `administrator_password_reissued` (`userId`, `revokedSessions`),
`administrator_create_refused`, `user_disabled`, `user_disable_not_found`,
`administrator_second_factor_reset`, and `administrator_second_factor_reset_refused` keep their earlier shapes.
A failure, `administrator_create_failed`, `user_disable_failed`, or `administrator_second_factor_reset_failed`,
has `error` (the class) and, only for a Prisma failure, `code` (`P2002`, `P1001`, and so on; the pattern
`P` and four digits, read by `users/domain/database-error-code.ts`).
A command that fails only while closing its database connection after the work was done
(`administrator_create_close_failed`, `user_disable_close_failed`, or
`administrator_second_factor_reset_close_failed`, from `closeCommandStore`) prints one line of the same shape on
standard error and keeps the exit code of the work (T10a R4-001).

Web events (`apps/web/lib/server/server-log.ts`, standard error): `own_profile_read_failed`,
`own_profile_update_failed`, and `auth_session_read_failed` have `error` (the class), `kind` when the error is
an `ApiClientError` (`rejected`, `unavailable`, `invalid-response`, or `short-circuited`), and `cause` (the
class of the error's cause) when it has one. A failed proxy call of the administrator session read keeps its
cause, so that line names it. `auth_proxy_upstream_failed` (`path`, `reason`, `status`?) and
`web_config_invalid` (the variable name) are unchanged. The email and background-task events
(`email_delivery_failed`, `email_delivery_degraded`, `background_task_failed`, `background_task_rejected`,
and `background_task_rejected_after_shutdown`) are described in their own sections and also carry no address
or code.

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

## Public invitation flow

Status: **current** (Milestone 5, `odd/tasks/m5-publication.md`).

```text
Public URL /i/<slug>
  → apps/web renders app/i/[slug] per request (noindex; no session, no cookie forwarded)
  → apps/api GET /public/invitations/:slug (@Public, Cache-Control: no-store)
  → one query loads the PUBLISHED, unexpired Invitation by its unique slug
  → API returns componentKey, configuration, only the pinned schema's declared content, timeZone, and the gated
    features (countdown, map, calendar, WhatsApp phone)
  → web selects a component from the local renderer registry by componentKey
  → web maps timeZone and the gated features to one shared features block (countdown, map, calendar, WhatsApp)
  → registry renders the invitation with data, never with executable database content

Public RSVP form (the open form, when the pinned package grants RSVP and no guest list)
  → apps/api POST /public/invitations/:slug/rsvp (@Public, Cache-Control: no-store)
  → one query loads the PUBLISHED, unexpired Invitation by its unique slug
  → the package gate answers `open` (no RSVP key, or a guest list, answers 409 RSVP_NOT_OPEN), and the deadline is checked
  → 10 submissions per hour per client address and invitation are counted on the shared RateLimit store (429 over it)
  → a filled honeypot answers the same 202 without storing; the payload is validated against the party limit
  → one `INSERT … ON CONFLICT (invitationId, dedupeKey) DO UPDATE` stores or updates the one response of that guest
  → 202 { status: "received" } for every accepted attempt; the body carries no id, count, or other guest's data

Personal guest page (the guest list, when the pinned package grants GUEST_LIST; M6 G2)
  → apps/web renders /i/<slug>/g/<token> per request (noindex; no session, no cookie forwarded)
  → apps/api GET /public/invitations/:slug/guests/:token (@Public, Cache-Control: no-store)
  → one query resolves the PUBLISHED, unexpired Invitation by its unique slug, then one probe of Guest_tokenHash_key
    finds the guest by the SHA-256 digest of the token, scoped by that invitation
  → the package gate answers `guest-list`; any other mode, any malformed, unknown, revoked, or foreign token, and the
    same invisible slug cases answer the one public 404 PUBLIC_INVITATION_NOT_FOUND (no oracle)
  → the body is the public projection plus guest: { name, seats, response, qrPass }; no other guest is read
  → qrPass is true only for a confirmed guest of a package that grants QR_PASS

Personal guest answer (M6 G2)
  → apps/web app/i/[slug]/g/[token]/actions.ts posts the card of the same page; the action forwards the browser's
    address from the incoming request headers and redirects back to /i/<slug>/g/<token>?rsvp=<code>
  → apps/api POST /public/invitations/:slug/guests/:token/rsvp (@Public, Cache-Control: no-store)
  → 404 for every invisible slug or token case, 409 RSVP_NOT_OPEN when the mode is not `guest-list` or the deadline
    passed, 429 RSVP_RATE_LIMITED over the per-guest cap on the shared RateLimit store, 400 INVALID_RSVP with the
    domain issues
  → the answer is validated against the guest's own seats; name and phone come from the guest row, never the body
  → one `INSERT … ON CONFLICT (guestId) DO UPDATE` stores or updates the one answer of that guest, and its SELECT
    repeats the publication status and the deadline, so a race is refused by the database
  → 202 { status: "received" } for a first answer and for a change of mind

Owner check-in (M6 G2; the API's own route is /invitations/:id/guests/check-in)
  → apps/web app/cuenta/acceso/[slug]/[token] is the page a QR opens (M6 G4): the public read carries no invitation
    id, so the pass encodes /cuenta/acceso/<slug>/<token> and the page resolves the id from the owner's own invitations
    list before it calls the API; a slug the caller does not own finds no invitation and no request is made
  → a signed-out visitor is redirected to /cuenta/acceso/<slug>/<token>/ingresar, a route handler that stores the bare
    check-in path in the one-time hand-off (below) and answers 303 to /ingresar; /cuenta reads that handle once, after
    the visitor is signed in, and sends them back to the pass
  → apps/api POST /invitations/:id/guests/check-in { token } with the owner's session
  → 404 GUEST_NOT_FOUND for a malformed or unknown token, 409 GUEST_NOT_CONFIRMED without an attending answer,
    409 QR_PASS_NOT_AVAILABLE without the catalog key, 404 INVITATION_NOT_FOUND for a foreign invitation
  → one statement requires the owned, non-archived invitation, the token digest, and the attending answer, and keeps
    the first checkedInAt, so the same QR twice is idempotent
  → 200 { guestId, name, seats, attendingPartySize, checkedInAt }

Creator guest list (M6 G4; /cuenta/invitaciones/[id]/asistencia in guest-list mode)
  → apps/api GET /invitations/:id/guests with the owner's session (guests, answers, check-in state, totals)
  → apps/api POST /invitations/:id/guests, PUT /invitations/:id/guests/:guestId, DELETE the same path, and
    POST /invitations/:id/guests/:guestId/token, each from one server action
  → a creation and a rotation answer the plain personal token once; the action keeps it in this process's one-time
    store and the attendance page shows it exactly once (below)

Public URL /i/<slug>/calendario.ics
  → apps/web/app/i/[slug]/calendario.ics/route.ts answers the same public read as the page
  → the calendar is built from the invitation's own facts and stored zone (four hours from the start)
  → text/calendar; charset=utf-8, attachment filename="invitacion.ics", Cache-Control: no-store
  → 404 for a slug that is not public and for a calendar that cannot be built
```

The personal page and its pass are `noindex, nofollow` in their metadata and rendered per request: the page calls
`connection()` and exports `dynamic = "force-dynamic"`, `fetch` is never cached (`sendApiRequest` always sends
`cache: "no-store"`), and React's `cache` only deduplicates the read inside one request. The HTTP response header
observed in the development server is `Cache-Control: no-cache, must-revalidate`, which is what every dynamic page of
this app answers; an explicit `no-store` on the document would need a route handler or a `next.config.ts` rule.

The pass's QR is drawn on the server by `qrcode` (MIT, pinned in `apps/web/package.json` at 1.5.4 with
`@types/qrcode`), which answers the module matrix synchronously without a DOM, a canvas, or an image encoder; the web
turns that matrix into SVG (`apps/web/lib/server/guest-pass-qr.ts`) and hands it to an `<img>` as a data URL, so no
page injects raw markup and no guest page loads a script or a third-party request. `lean-qr` stays the browser-side
encoder of the administrator enrollment QR. The pass encodes the absolute check-in URL built from the request's own
origin (`requestOrigin`), never a value the browser sends in a path, query, or body, and it carries nothing but the
token the guest's own URL already holds.

The one-time hand-off (`apps/web/lib/server/single-use-flash.ts`) is how a token answers once without ever becoming a
URL: the server action stores the personal link in this process's bounded, five-minute store and the browser carries
only an opaque 22-character handle, in a cookie that is `httpOnly`, `SameSite=Strict`, path-scoped to the one
attendance page (`/cuenta/invitaciones/<id>/asistencia`) or to `/cuenta`, and `Secure` under https. The page takes the
value out of the store as it renders, which deletes it, so a reload, a second tab, or a later visit shows nothing
instead of the link again — Next.js allows no cookie deletion during a server render, which is why the store rather
than the cookie is what makes the reveal single-use. The after-sign-in return uses the same store with a bare
`/cuenta/acceso/<slug>/<token>` path, re-validated when it is read, so the return can never leave `/cuenta`. The store
lives in the web process's memory, which is what the single Node.js web server this repository targets provides; a
deployment with more than one web replica would need a shared store, and until then the hand-off would degrade to
showing nothing rather than to showing it twice. Nothing from either hand-off is ever logged.

Feature data is read per request from the invitation and its pinned package and gated in the API: a package key the
API does not implement never becomes a feature, and WhatsApp needs a stored E.164 phone. The public body carries the
gated booleans, never the package's key list, name, or id. The read is bounded — a fixed number of queries whatever
the package includes. The web never reads a package or a feature name to choose a code path: the block renders one
themed section from those booleans, and a zone this runtime cannot format or a snapshot whose facts cannot be read
only turns off the features it affects (`apps/web/lib/public/invitation-features.ts`).

An unknown, draft, archived, expired, or unrenderable slug answers 404 and the page shows «Esta invitación no está
disponible»; an unregistered renderer is logged as an operational event. The URL lives under `/i/` so it can never
collide with a site page. A version the catalog retires after publication keeps rendering for the invitations that
pin it.

An invitation points to `TemplateVersion`, not to mutable `Template` metadata. Publishing changes which invitation
state is publicly visible; it does not rewrite the version snapshot. Public rendering must fetch the required data
without an N+1 query pattern and must fail closed for unpublished, missing, or unauthorized resources.

## Invitation media (current)

Implemented by Milestone 8 (S1, S3, S4). Creators upload the invitation's main photo and, when the pinned package
grants `GALLERY`, up to twelve gallery photos. Binaries live in object storage, never in PostgreSQL and never on an
ephemeral filesystem in production.

- Feature module `apps/api/src/media/`: `domain` owns the pure upload rules (magic-byte format detection, 10 MB,
  8000 px per side, the 2000 px output target, the 120-character alt text, the key format and the two limits);
  `application` owns the `MediaStorage` and `ImageProcessor` ports, the `MediaRepository` port, and the use cases;
  `infrastructure` holds both storage adapters (`local`, `s3`), the `sharp` processor, and the Prisma repository;
  `presentation` holds the owner routes and the one public serving route.
- `MediaStorage` is the provider-neutral port (put, get as a stream with its size, idempotent delete, and a key list
  for cleanup). `MEDIA_STORAGE_DRIVER` selects the adapter: `local` in development and tests, refused at startup in
  production; `s3` for any S3-compatible provider (R2, AWS S3, MinIO), configured from the environment and failing
  closed until a bucket is set. The credential never leaves the adapter, and no provider message, endpoint, bucket,
  key, or signed URL reaches a log or a response.
- Uploads: `POST /invitations/:id/media` is multipart and accepts only `file`, `kind` (`main-photo` or `gallery`),
  and `alt`, with an approximately 11 MB body bound (413 past it); every other route keeps its existing JSON body
  limit. The format is decided from magic bytes, never the filename or the client MIME. The image is re-encoded to
  WebP with its longest side at most 2000 px and its metadata stripped (EXIF, GPS), so no location leaks.
- The order of side effects is the retry policy: process, put the object, insert the row; if the insert fails, the
  object is deleted best effort and logged by event name only. Deletion marks the row `deleted` first and deletes the
  object after it; a failed object delete leaves a row for `pnpm media:cleanup`, which also removes objects whose rows
  are missing. It is idempotent and supports `--dry-run`.
- Limits (S4), enforced in the transaction that writes a row and serialized on the invitation: one current main
  photo per invitation (replacing marks the previous one deleted and deletes its object), at most 12 gallery photos,
  at most 40 stored assets. Ownership and the archived refusal are in the same statement that reads or writes the
  row, so another customer's invitation or asset answers one 404 (A4).
- REST: owner routes `GET`/`POST /invitations/:id/media`, `PATCH`/`DELETE /invitations/:id/media/:assetId` behind the
  session guard, and the public `GET /media/:assetId`. That route is `@Public()`: a published invitation's image is
  public and cached for a year as immutable, the owner sees a draft with `private, no-store`, and every other case —
  missing, deleted, unpublished, foreign, or an object that is gone — is the same 404. It answers
  `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, and
  `Cross-Origin-Resource-Policy: cross-origin`; the session is read only when the invitation is not published.
- URLs are absolute API URLs built from the validated `MEDIA_PUBLIC_BASE_URL` (`<origin>/media/<assetId>`), never a
  provider URL. `GALLERY` joins the implemented feature allow-list, and the public read gains
  `features.gallery: [{ url, width, height, alt }]` in position order — an empty array when the package does not
  grant `GALLERY`, so the shape is stable and a layout always reads an array. The public projection reads the gallery
  through the `InvitationGalleryReader` port that the media module implements, so the invitations module never
  imports a media repository; the owner read exposes media only through the media routes.
- Configuration and operations: [`../development/media-storage.md`](../development/media-storage.md) documents every
  variable, the production checklist, the serving headers, and the cleanup command.
- Web (M8 S2, S4): `apps/web/lib/server/media-api.ts` is the web server's client of the four owner routes. It forwards
  only Better Auth's cookies and the proxy secret, parses every answer strictly (an absolute `http`/`https` URL without
  credentials, positive dimensions, a bounded alt text, a non-negative position), and maps each documented refusal to a
  typed outcome that never carries a body. The upload is multipart built on the server from the bytes the browser sent:
  the part is named `photo`, declared `application/octet-stream`, and carries no browser filename, so the creator's own
  file name and the browser's claimed MIME never leave the web. The 10 MB bound is enforced there before the body is
  read, and again before it is sent; one upload gets a 60-second deadline instead of the shared 10.
- Web actions (M8 S2, S3, S4): `apps/web/lib/customer/invitation-media.ts` turns one submitted form into the API call
  and the page's own redirect. A main photo is uploaded with `kind: main-photo` and then its answered URL is written
  into the template's `mainPhoto` content field through the same content save the editor uses, so every layout keeps
  rendering it unchanged. The gallery actions upload one photo, replace one alt text, move one photo one place (the
  API's `position` is the index it moves to, computed from the owner's own read, never from the browser), and remove
  one photo. Alt text over 120 characters and a file over 10 MB are refused on the web before any request. Each action
  is a server action (`apps/web/app/cuenta/invitaciones/actions.ts`), so the form works without JavaScript, and one
  unexpected failure is logged once as `invitation_media_call_failed` with the error class, the client's failure kind,
  and the class of its cause: never an alt text, a file name, an id, a cookie, or a response body.
- Web UI (M8 S2, S4): the draft page's content form carries «Subir foto» under the template's photo link field — its
  controls are associated with their own form element through the HTML `form` attribute, because a form cannot nest
  another one — and the «Galería» section appears below the content form only when the owner read lists `GALLERY` in
  `availableFeatures`. The gallery shows the count of twelve, one upload form, and per photo its thumbnail, its alt
  text, «Subir», «Bajar», and «Quitar». An archived invitation shows the photos with no form; a failed media read keeps
  the rest of the draft editable with one short note.
- Web rendering (M8 S3, S4): the public read's `features.gallery` is parsed strictly (a list of at most twelve photos,
  each an absolute API URL with positive dimensions and a bounded alt text) and handed to the shared features block,
  which renders «Galería» as a `grid-cols-2 sm:grid-cols-3` grid of plain `<img>` elements with the API's `width` and
  `height`, `loading="lazy"`, `decoding="async"`, and an `<a target="_blank" rel="noopener noreferrer">` around each
  photo. `next/image` is not used, so the API origin needs no entry in an image configuration; the web sends no
  `Content-Security-Policy` today, and the API's `Cross-Origin-Resource-Policy: cross-origin` is what lets the browser
  embed the image from the other origin. `GALLERY` also joined the web's mirror of the gated feature keys, because the
  owner read refuses a body that names a key this deployment does not know.
- Browser harness (M8 S2, S4): the end-to-end API process already runs with `NODE_ENV=development`
  (`apps/web/playwright.config.ts`), which is what keeps the local media driver allowed and the API starting without an
  S3 bucket. Serving correct media URLs there additionally needs `MEDIA_PUBLIC_BASE_URL` set to the harness's API origin
  (`API_ORIGIN`, port 3411), because the API builds absolute URLs from its own configuration.

## Renderer registry and `componentKey`

`componentKey` is an identifier, not a module path, JavaScript expression, template string, or code blob. The
application owns a registry similar in concept to:

```text
"birthday-map-01" → BirthdayMapRenderer
"birthday-poster-01" → BirthdayPosterRenderer
"birthday-story-01" → BirthdayStoryRenderer
"baby-shower-classic-01" → BabyShowerClassicRenderer
"baptism-classic-01" → BaptismClassicRenderer
"xv-arch-01" → XvArchRenderer
"wedding-arch-01" → WeddingArchRenderer
"baptism-arch-01" → BaptismArchRenderer
"xv-ornamental-01" → XvOrnamentalRenderer
"wedding-ornamental-01" → WeddingOrnamentalRenderer
"baptism-ornamental-01" → BaptismOrnamentalRenderer
```

Current: the API registry (`apps/api/src/catalog/domain/renderers/`) owns the allow-list and each renderer's
contract, and validates a version when it is created and when it is published. These eleven keys are the whole
current list. The three birthday layouts (`birthday-map-01`, `birthday-poster-01`, `birthday-story-01`) each take
exactly `{ componentKey, theme }`, where `theme` comes from the shared allow-list in `birthday-themes.ts` and the
content schema is the shared eight birthday fields, all of them required. The baby shower layout
(`baby-shower-classic-01`) and the themed baptism layout (`baptism-classic-01`) take the same configuration shape
with their own theme allow-lists (`baby-shower-themes.ts`, `baptism-themes.ts`); their content schemas declare
required fields plus optional ones (`babyName`, `genderReveal`, `giftRegistry`, and `mainPhoto` for a baby shower;
`mainPhoto` and `giftRegistry` for a baptism), which a renderer declares in its field list so the schema must
keep them out of `required`. The elegant «Arco y foto» line (`odd/tasks/elegant-line.md`, S4) adds one visual
layout per occasion with its own content schema and the shared eight-theme allow-list in `elegant-themes.ts`:
`xv-arch-01` for `quinceanera` (celebrant, parents, honor sponsors, the ceremony and reception blocks, dress code,
message, and RSVP required; chambelanes, gift registry, and main photo optional), `wedding-arch-01` for `wedding`
(the two names, the ceremony and reception blocks, dress code, message, and RSVP required; both families, wedding
sponsors, gift registry, main photo, and hashtag optional), and `baptism-arch-01` for `baptism`, the formal
baptism that reuses the themed baptism content fields exactly so no published invitation has to migrate. The
second elegant layout, «Ornamental — papelería clásica» (`odd/tasks/elegant-line.md`, S5), adds
`xv-ornamental-01`, `wedding-ornamental-01`, and `baptism-ornamental-01` in the same three categories with the
same eight themes; each ornamental renderer imports its occasion's arch field list
(`XV_ARCH_CONTENT_FIELDS`, `WEDDING_ARCH_CONTENT_FIELDS`, and the themed baptism `BAPTISM_CONTENT_FIELDS`), so
the two elegant layouts of an occasion share one content contract and one creator form. Each of the six takes
exactly `{ componentKey, theme }` and requires no catalog feature. The earlier single design,
`birthday-adventure-01` (its own `layout`, `palette`, `typography`, and `sectionOrder`), was deleted together with
its seed template, files, and tests when the themed layouts replaced it (S11).
The web map (`apps/web/lib/renderers/registry.ts`) resolves an allow-listed key to a reviewed component with no
dynamic import, and `registry-sync.test.ts` fails when the two key lists differ, so the three elegant keys also
need their reviewed web components and theme tokens before a published template can render.

Not yet shipped on this branch: the web components, theme tokens, ornaments, parsers, event facts, and creator
form fields of the elegant arch and ornamental layouts. The API half above is current.

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
