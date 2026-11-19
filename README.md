# InvitaMe

InvitaMe is an early foundation for a future invitation product. The implemented milestone establishes the
catalog, immutable template-version contract, secure API baseline, local database workflow, and an honest
pre-launch landing page: its sample designs and steps are labeled «Próximamente» and «Así funcionará», and
«Ingresar» is its only active action. It does not create or send invitations yet.

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
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm dev
```

The web app runs on `http://localhost:3000`; the API runs on `http://localhost:3001`.

Check `apps/api/.env` against the API table below before `pnpm dev`. The API refuses to start until the file sets
a `BETTER_AUTH_SECRET` of at least 32 characters and an `AUTH_BASE_URL` that is one of the `CORS_ORIGIN` entries:
locally, `http://localhost:3000` for both. The web needs no env file for local development, because each of its
settings has a development default; to override one, put it in `apps/web/.env.local`. Process variables take
precedence over both files.

### Environment variables

Startup validation reads these names and rules from `apps/api/src/config/environment.ts` (API) and
`apps/web/lib/server/config.ts` (web). An empty value counts as unset. Error messages name the variable, never
a secret value.

API (`apps/api/.env`):

| Variable | Required | Default and rules |
| --- | --- | --- |
| `NODE_ENV` | Always | `development`, `test`, or `production`, with no default: the API does not start without it, because an unset value would turn every production rule off. `pnpm dev` sets `NODE_ENV=development` in its script. `pnpm start` sets nothing, so `pnpm start` and any deploy must set `NODE_ENV` in the environment (`production` for a deploy). |
| `PORT` | No | `3001`; an integer from 1 to 65535. |
| `CORS_ORIGIN` | Always | Comma-separated trusted web origins, for example `http://localhost:3000`: no path, empty entry, or wildcard. The same list feeds credentialed CORS and Better Auth's origin checks. |
| `DATABASE_URL` | Always | A `postgresql:` or `postgres:` URL. `pnpm db:up` serves `postgresql://invitame:invitame_local_only@localhost:5442/invitame?schema=public`. |
| `BETTER_AUTH_SECRET` | Always | At least 32 characters. Generate one with `openssl rand -base64 32` and never commit it. |
| `AUTH_BASE_URL` | Always | The public web origin through which the web proxies `/api/auth`. It must be one of the `CORS_ORIGIN` entries and use `https` in production. |
| `AUTH_PROXY_SECRET` | Production | The shared web-to-API secret: at least 32 characters, different from `BETTER_AUTH_SECRET`, and the same value in the web. |
| `AUTH_PROXY_SECRET_PREVIOUS` | No | The secret from before a rotation, accepted next to `AUTH_PROXY_SECRET` while the rotation lasts. Needs `AUTH_PROXY_SECRET`, has the same rules, and must differ from it. |
| `AUTH_CLIENT_IP_HEADER` | Production | The header that carries the client IP for rate limits; `x-forwarded-for` outside production. |
| `AUTH_TRUSTED_PROXIES` | No | Comma-separated IP addresses or CIDR ranges of proxies that append to that header. |
| `EMAIL_TRANSPORT` | No | `mailpit` in development, `memory` in test, and `resend` in production, which accepts no other value. |
| `EMAIL_FROM` | Production | The sender, as `address` or `Name <address>`; `InvitaMe Local <no-reply@invitame.localhost>` outside production. |
| `MAILPIT_URL` | No | `http://localhost:8025`; an `http` or `https` origin. |
| `RESEND_API_KEY` | With `resend` | Required whenever `EMAIL_TRANSPORT` is `resend`, so always in production. Never commit it. |
| `MUSIC_METADATA_LOOKUP` | No | `on` in development and production, `off` in test: whether a saved Spotify or YouTube playlist link is looked up once through the provider's public oEmbed to store its title and cover. |
| `PLACE_SEARCH_PROVIDER` | No | `photon` in development and production, `off` in test: whether an address field may ask the OpenStreetMap Photon search for suggestions while the owner types. |
| `PLACE_SEARCH_PHOTON_URL` | No | `https://photon.komoot.io/api/`: the Photon instance the place search asks, so a self-hosted Photon is a configuration change. Never a Nominatim endpoint. |

The API also refuses `BETTER_AUTH_TRUSTED_ORIGINS`, so `CORS_ORIGIN` stays the only list of trusted origins, and
`BETTER_AUTH_SECRETS`, which Better Auth reads on its own and which would replace the validated
`BETTER_AUTH_SECRET`. Each is refused for any value other than unset or exactly the empty string `""`: a
whitespace-only value is refused, and `""` is accepted because Better Auth treats it as absent. Both messages name
the variable and never echo its value.

`BETTER_AUTH_SECRET` signs every session and encrypts each administrator's TOTP secret and backup codes. Changing
it ends every session, and each enrolled administrator cannot use their second factor until
`pnpm --filter @invitame/api admin:reset-second-factor -- <email>` runs for them. Rotating it without that breakage,
through Better Auth's `secrets` list, is a task of the deployment milestone.

Over `https` the session cookie is `__Host-better-auth.session_token` (`Secure`, no `Domain`); over local
`http` it is `better-auth.session_token` without `Secure`. Rate limits run in every environment and are stored in
PostgreSQL; they identify a client by the IP in `AUTH_CLIENT_IP_HEADER`. Without `AUTH_TRUSTED_PROXIES`, only a
header holding a single address is accepted. The web sends `AUTH_PROXY_SECRET` in the `x-invitame-proxy-secret`
header. In production the API refuses every `/api/auth` request without it with a generic `403`, and trusts the
client IP header only next to a valid secret. Outside production without a secret, the API serves direct
requests and trusts the client IP header.

To rotate `AUTH_PROXY_SECRET` without a cut, change the API first: set `AUTH_PROXY_SECRET_PREVIOUS` to the old value
and `AUTH_PROXY_SECRET` to the new one. Then change the web to the new value. At the end, remove
`AUTH_PROXY_SECRET_PREVIOUS` from the API.

Web (`apps/web/.env.local`, optional locally):

| Variable | Required | Default and rules |
| --- | --- | --- |
| `API_ORIGIN` | Production | The API's internal origin; `http://localhost:3001` outside production. No path, query, fragment, or credentials. |
| `AUTH_PROXY_SECRET` | Production | The same value as the API's; at least 32 characters. |
| `AUTH_CLIENT_IP_HEADER` | Production | The same value as the API's; the web sets that header to the client IP. `x-forwarded-for` outside production. |
| `AUTH_EDGE_CLIENT_IP_HEADER` | Production | The header the platform edge overwrites with the client IP, which the web reads. `x-forwarded-for` outside production, which Next.js fills from the socket; production refuses `x-forwarded-for` and `forwarded`, because a browser can set them. |

The browser talks only to the web origin. The web proxies `/api/auth/*` to the API and calls the API from its
server with the session cookie (ADR 0004 decision 4). Its settings are read only by server code and never use
the `NEXT_PUBLIC_` prefix, so they never reach the browser bundle. They are validated when the web server starts:
an invalid value logs a `web_config_invalid` line that names the variable and stops the server with exit code 1.
`next build` needs none of them. Because `pnpm --filter @invitame/web start` runs in production mode, it requires
the production values.

### Local email

In development the API sends email, such as customer sign-in codes, to Mailpit, a local mail catcher. Codes are
sent in the background, so a code request succeeds even when Mailpit is down; the code is then invalidated.
`pnpm db:up` starts only PostgreSQL; start Mailpit separately and read captured messages in its UI at
`http://localhost:8025`:

```bash
docker compose up -d mailpit
```

The email variables are optional outside production; see the API table above.

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
`http://localhost:3000/admin/ingresar` and must enroll an authenticator app at `/admin/activar` (QR code or the
setup key shown below it for manual entry, the first code, and 10 backup codes shown once) within **24 hours** of its issue. Until then the
account holds no administrator authority. After 24 hours without enrollment, the password stops
working and existing sessions end.

Run the same command again to reissue: for an administrator who has not enrolled, it replaces the password,
restarts the 24-hour window, discards an unconfirmed enrollment, and signs the administrator out everywhere,
in one transaction. It refuses an administrator who has already enrolled (see the recovery command below), a
`DISABLED` administrator, and any customer address, which is never promoted. Milestone 2 offers
no password change through the API.

It prints one JSON line with the user id (and, on reissue, the number of revoked sessions), never the email
address. Exit code 0 means a password was issued, 1 means refused or a failure, and 2 means a usage error or a
non-interactive terminal.

### Recover a locked administrator

An administrator who cannot finish signing in is recovered only by a server-side command, with the same
safeguards as `admin:create` (interactive terminal only, password printed once, exit codes 0, 1, and 2):

```bash
pnpm --filter @invitame/api admin:reset-second-factor -- <email>
```

It releases every lock state of an `ACTIVE` administrator, enrolled or not: a first confirmation that failed
or was interrupted, a second tab that signed out during activation, a lost confirmation response before the
backup codes were seen, a lost device, and lost or used-up backup codes. In one transaction it turns the
second factor off, deletes the authenticator secret and the backup codes, signs the administrator out
everywhere, and replaces the password with a new initial password that opens a new 24-hour enrollment
window. The administrator then signs in and enrolls an authenticator app again, as after `admin:create`.

1. Before running it, confirm the requester's identity out of band (for example, a call to a number you
   already know). Anyone who receives the new password can enroll their own device.
2. Run the command and hand over the password through a secure channel.

A pending administrator whose 24-hour window simply expired still uses `admin:create`. The command refuses
an unknown address, a customer (never created or promoted), and a `DISABLED` administrator, changing
nothing; a disabled administrator cannot be recovered, because re-enabling is out of scope. It prints one
JSON line with the user id at most, or the error class on a failure; never the email address, the password,
the authenticator secret, or the backup codes.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js 16 App Router pre-launch landing page (copy in `lib/landing/copy.ts`), customer pages (`/ingresar`, `/cuenta`), administrator pages (`/admin/ingresar`, `/admin/activar`, `/admin`), the `/api/auth` proxy, and the server-side API client, styled with the visual theme in [`docs/design/theme.md`](docs/design/theme.md) |
| `apps/api` | NestJS REST API runtime and Prisma ownership boundary |
| `docs/architecture` | Architecture decisions and operating model |
| `docs/database` | Relational model and JSONB boundary |
| `docs/development` | Anti-patterns, quality gates, and Git workflow |
| `docs/adr` | Concise architectural decision records |

## Implemented scope boundary

The current runtime intentionally excludes administrative tools beyond sign-in, enrollment, and a minimal panel, invitations, RSVP and guest records, payments,
analytics, media storage, continuous deployment (CD), and hosted deployment. Limited quality-gate CI exists, but
CD and hosted deployment are not implemented. Docker Compose is used only for local PostgreSQL and the Mailpit mail
catcher. See
[`ROADMAP.md`](ROADMAP.md) for the planned sequence and [`docs/README.md`](docs/README.md) for documentation
entry points.
