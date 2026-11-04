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
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm dev
```

The web app runs on `http://localhost:3000`; the API runs on `http://localhost:3001`.

The API refuses to start until `apps/api/.env` defines its required variables. Besides `DATABASE_URL`, set:

- `BETTER_AUTH_SECRET`: at least 32 characters; generate one with `openssl rand -base64 32` and never commit it.
- `AUTH_BASE_URL`: the public origin of the API, for example `http://localhost:3001`.
- `CORS_ORIGIN`: a comma-separated list of trusted web origins, for example `http://localhost:3000`. The same
  list feeds credentialed CORS and Better Auth's origin checks.

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

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js 16 App Router landing page runtime |
| `apps/api` | NestJS REST API runtime and Prisma ownership boundary |
| `docs/architecture` | Architecture decisions and operating model |
| `docs/database` | Relational model and JSONB boundary |
| `docs/development` | Anti-patterns, quality gates, and Git workflow |
| `docs/adr` | Concise architectural decision records |

## Implemented scope boundary

The current runtime intentionally excludes authentication flows, invitations, RSVP and guest records, payments,
analytics, media storage, continuous deployment (CD), and hosted deployment. Limited quality-gate CI exists, but
CD and hosted deployment are not implemented. Docker Compose is used only for local PostgreSQL and the Mailpit mail
catcher. See
[`ROADMAP.md`](ROADMAP.md) for the planned sequence and [`docs/README.md`](docs/README.md) for documentation
entry points.
