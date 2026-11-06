# InvitaMe

InvitaMe is an early foundation for a future invitation product. The implemented milestone establishes the
catalog, immutable template-version contract, secure API baseline, local database workflow, and a small public
landing page. It does not create or send invitations yet.

## Start with the operating model

- [`AGENTS.md`](AGENTS.md) — canonical contributor and AI policy.
- [`CLAUDE.md`](CLAUDE.md) — short agent entrypoint and documentation links.
- [`CONTEXT.md`](CONTEXT.md) — canonical product vocabulary.
- [`ROADMAP.md`](ROADMAP.md) — implemented foundation and ten milestones with explicit current/planned status.
- [`docs/README.md`](docs/README.md) — documentation index with current/planned labels.

## Quick start

Prerequisites: Node.js 26 (see `.nvmrc`; `engines` accepts `>=22.22.1 <27`), pnpm 10, and Docker with Docker
Compose.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm dev
```

The web app runs on `http://localhost:3000`; the API runs on `http://localhost:3001`.

The API refuses to start until `apps/api/.env` defines its required variables. Besides `DATABASE_URL`, set:

- `BETTER_AUTH_SECRET`: at least 32 characters; generate one with `openssl rand -base64 32` and never commit it.
- `AUTH_BASE_URL`: the public web origin through which the web proxies `/api/auth` to the API, for example
  `http://localhost:3000`. It must be one of the `CORS_ORIGIN` entries, and production requires `https`. Over
  `https` the session cookie is `__Host-better-auth.session_token` (`Secure`, no `Domain`); over local `http` it
  is `better-auth.session_token` without `Secure`.
- `CORS_ORIGIN`: a comma-separated list of trusted web origins, for example `http://localhost:3000`. The same
  list feeds credentialed CORS and Better Auth's origin checks.

Rate limits run in every environment and are stored in PostgreSQL. They identify a client by its IP address:

- `AUTH_CLIENT_IP_HEADER`: the request header that carries the client IP, as set by the trusted proxy in front
  of the API. Optional outside production, where it defaults to `x-forwarded-for`; required in production.
- `AUTH_TRUSTED_PROXIES`: optional comma-separated IP addresses or CIDR ranges of proxies that append to that
  header. Without it, only a header holding a single address is accepted.
- `AUTH_PROXY_SECRET`: the shared web-to-API secret, at least 32 characters and different from
  `BETTER_AUTH_SECRET`; generate it like the auth secret and never commit it. The web sends it in the
  `x-invitame-proxy-secret` header. Required in production, where the API refuses every `/api/auth` request
  without it with a generic `403`; the client IP header is trusted only next to a valid secret. Optional outside
  production: without it the API serves direct requests and trusts the client IP header as before.

### Web server settings

The browser talks only to the web origin. The web proxies `/api/auth/*` to the API and calls the API from its
server with the session cookie (ADR 0004 decision 4). Its settings live in `apps/web/.env.local`, are read only
by server code, and never use the `NEXT_PUBLIC_` prefix, so they never reach the browser bundle. They are
validated when the web server starts: an invalid value logs a `web_config_invalid` line that names the variable
and stops the server with exit code 1. `next build` needs none of them. Because `pnpm --filter @invitame/web
start` runs in production mode, it requires the production values below:

- `API_ORIGIN`: the API's internal origin, by default `http://localhost:3001`; required in production.
- `AUTH_PROXY_SECRET`: the same value as the API's; required in production.
- `AUTH_CLIENT_IP_HEADER`: the same value as the API's; the web sets it to the client IP. Defaults to
  `x-forwarded-for` outside production; required in production.
- `AUTH_EDGE_CLIENT_IP_HEADER`: the header the platform edge overwrites with the client IP, which the web reads.
  Defaults to `x-forwarded-for` outside production, which Next.js fills from the socket; required in production,
  where `x-forwarded-for` and `forwarded` are refused because a browser can set them.

### Local email

In development the API sends email, such as customer sign-in codes, to Mailpit, a local mail catcher. Codes are
sent in the background, so a code request succeeds even when Mailpit is down; the code is then invalidated.
`pnpm db:up` starts only PostgreSQL; start Mailpit separately and read captured messages in its UI at
`http://localhost:8025`:

```bash
docker compose up -d mailpit
```

The email variables are optional outside production:

- `EMAIL_TRANSPORT`: `mailpit` (development default), `memory` (test default), or `resend`. Production accepts
  only `resend` and refuses to start otherwise.
- `EMAIL_FROM`: the sender, as `address` or `Name <address>`. Required in production; development and test default
  to `InvitaMe Local <no-reply@invitame.localhost>`.
- `MAILPIT_URL`: the Mailpit origin, by default `http://localhost:8025`.
- `RESEND_API_KEY`: required when `EMAIL_TRANSPORT` is `resend`; never commit it.

### Try customer sign-in locally

With the API and web running (`pnpm dev`) and Mailpit started:

1. Open `http://localhost:3000/ingresar` and enter any email address.
2. Open Mailpit at `http://localhost:8025` and copy the 6-digit code; it expires after 5 minutes.
3. Enter the code. The browser goes to `http://localhost:3000/cuenta`, which shows the email and lets you
   change or clear the display name and sign out.

Every address gets the same answer, but an administrator's address never receives a code. Before each
`/ingresar` and `/cuenta` render, and each `/cuenta` server action, the web refreshes the session through its
own `/api/auth` proxy (`apps/web/proxy.ts`), so
the browser's session cookie is extended while the customer uses the account; see "Customer pages" in
[`docs/architecture/overview.md`](docs/architecture/overview.md).

## Verification

Run the full local verification sequence after the database is running:

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:seed
pnpm db:check
pnpm docs:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

The exact Definition of Done and conditional database checks live in
[`docs/development/quality-gates.md`](docs/development/quality-gates.md). The branch, work-unit, staged-diff,
and PR procedure lives in [`docs/development/git-workflow.md`](docs/development/git-workflow.md).

For a bounded API smoke check, start the API in one terminal and call its database-backed health endpoint
from another:

```bash
pnpm --filter @invitame/api build
pnpm --filter @invitame/api start
curl --fail --max-time 5 http://localhost:3001/health
```

Stop the API with `Ctrl-C`. Use `pnpm db:down` to stop the local PostgreSQL container when finished.

### Disable a user

Disabling a user is a server-side command; there is no administrator interface yet. It sets the user to
`DISABLED` and deletes all of their sessions in one transaction, so the user loses access on the next request
and can no longer sign in. It reads `DATABASE_URL` like the other Prisma scripts and is safe to run twice:

```bash
pnpm --filter @invitame/api user:disable -- <email>
```

It prints one JSON line with the user id and the number of revoked sessions, never the email address. Exit
code 0 means disabled (or already disabled), 1 means no such user or a failure, and 2 means a usage error.

### Create an administrator

Administrators are created by a server-side command; there is no sign-up for them. It reads `DATABASE_URL`
like the other Prisma scripts and must run in an interactive terminal:

```bash
pnpm --filter @invitame/api admin:create -- <email>
```

It creates an `ACTIVE` administrator and generates a random 24-character initial password from letters and
digits without look-alikes (`0`, `O`, `o`, `1`, `l`, `I`). The password is printed once, on its own line, for
you to hand over through a secure channel; it is never logged or stored in plain text, and the command
refuses to run when its output is redirected. The administrator signs in with it at
`http://localhost:3000/admin/ingresar` and must enroll an authenticator app within **24 hours** of its issue
(the enrollment page `/admin/activar` lands in the next slice of M2 T8d). Until then the
account holds no administrator authority. After 24 hours without enrollment, the password stops
working and existing sessions end.

Run the same command again to reissue: for an administrator who has not enrolled, it replaces the password,
restarts the 24-hour window, discards an unconfirmed enrollment, and signs the administrator out everywhere,
in one transaction. It refuses an administrator who has already enrolled (recovery is a separate
procedure), a `DISABLED` administrator, and any customer address, which is never promoted. Milestone 2 offers
no password change through the API.

It prints one JSON line with the user id (and, on reissue, the number of revoked sessions), never the email
address. Exit code 0 means a password was issued, 1 means refused or a failure, and 2 means a usage error or a
non-interactive terminal.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js 16 App Router landing page, customer pages (`/ingresar`, `/cuenta`), administrator pages (`/admin/ingresar`, `/admin`; `/admin/activar` is next), the `/api/auth` proxy, and the server-side API client, styled with the visual theme in [`docs/design/theme.md`](docs/design/theme.md) |
| `apps/api` | NestJS REST API runtime and Prisma ownership boundary |
| `docs/architecture` | Architecture decisions and operating model |
| `docs/database` | Relational model and JSONB boundary |
| `docs/development` | Anti-patterns, quality gates, and Git workflow |
| `docs/adr` | Concise architectural decision records |

## Implemented scope boundary

The current runtime intentionally excludes administrative tools beyond sign-in and a minimal panel, invitations, RSVP and guest records, payments,
analytics, media storage, continuous deployment (CD), and hosted deployment. Limited quality-gate CI exists, but
CD and hosted deployment are not implemented. Docker Compose is used only for local PostgreSQL and the Mailpit mail
catcher. See
[`ROADMAP.md`](ROADMAP.md) for the planned sequence and [`docs/README.md`](docs/README.md) for documentation
entry points.
