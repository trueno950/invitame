# Deploy service descriptors

This document describes the two Railway service descriptors in the repository root and the commands they run
(Milestone 10, T3; S1, S5). It is repository-only evidence: **no Railway project, service, domain, database, or
variable exists today**, and creating them is the owner's external setup (T8). Nothing here deploys by itself.

## Format and ownership

- Railway's [Config as code reference](https://docs.railway.com/reference/config-as-code) defines deployment
  configuration in a `railway.json` or `railway.toml` file, validated against the published
  [schema](https://railway.com/railway.schema.json). The descriptors here are JSON so the schema applies; every key
  below is taken from that schema (`build.builder`, `build.buildCommand`, `build.watchPatterns`,
  `deploy.preDeployCommand`, `deploy.startCommand`, `deploy.healthcheckPath`, `deploy.healthcheckTimeout`,
  `deploy.restartPolicyType`, `deploy.restartPolicyMaxRetries`, `deploy.numReplicas`).
- **One config file configures one service.** The schema has no multi-service section, so a two-service monorepo
  needs two files. Each is selected per service in Railway under **Settings → Config as code** (config file path),
  which takes an absolute path from the repository root:

| Service | File | Config file path | Root Directory |
| --- | --- | --- | --- |
| API (`@invitame/api`) | `railway.api.json` | `/railway.api.json` | empty (repository root) |
| Web (`@invitame/web`) | `railway.web.json` | `/railway.web.json` | empty (repository root) |

- The root directory stays empty for both services, because every command below is written to run from the
  repository root. A config file path does not follow a root directory, so both paths are absolute.
- `builder` is `RAILPACK`, the default builder for new services per that reference. Both services are a pnpm
  workspace with no Dockerfile, so the builder installs dependencies and then runs the build command in the root.

## Node.js version

- The repository requires Node.js 26 (`/.nvmrc`) inside `engines.node` `>=22.22.1 <27` (`package.json`).
- Railpack resolves the Node.js version in this order: `RAILPACK_NODE_VERSION`, `devEngines.runtime`, **`engines.node`**,
  `.nvmrc`, `.node-version`, `mise.toml`/`.tool-versions`, then LTS. Because `engines.node` comes before `.nvmrc`, the
  range decides the concrete version the builder installs.
- To pin exactly 26 regardless of the range, set the service variable `RAILPACK_NODE_VERSION=26` on both services
  (first-deploy prerequisite 2 below). The descriptor schema has no variables section, so this is a service setting,
  not a file setting.

## API service commands

| Step | Command | Why |
| --- | --- | --- |
| Build | `pnpm install --frozen-lockfile && pnpm --filter @invitame/api prisma:generate && pnpm build` | The Prisma client is generated code: `pnpm build` only runs `tsc`, which fails without `@prisma/client` types, so generation runs first. `pnpm build` is Turborepo's root build, the same command CI and `docs`' quality gates run. The leading install is redundant with the builder's own install and exists so the command is exactly runnable from the repository root. |
| Pre-deploy | `pnpm --filter @invitame/api prisma:migrate:deploy` | `prisma migrate deploy` applies the committed migrations to the production database once per deployment, before the new version takes traffic. A failing migration fails the deploy and leaves the previous version serving. |
| Start | `node apps/api/dist/main.js` | The API builds with `tsc -p tsconfig.build.json` (`rootDir: src`, `outDir: dist`), so the entrypoint is `apps/api/dist/main.js` from the root. The package's own `start` script is `node dist/main.js`, relative to `apps/api`. The API reads `PORT` from the environment, so no port is hard-coded. |
| Health | `GET /health` | The API's readiness probe: it answers 200 only after a real database roundtrip and 503 when the database is unreachable (`apps/api/src/health`). Railway checks it for 300 seconds after the start command, so a deploy whose database is unreachable is not promoted. |
| Restart | `ON_FAILURE`, 10 retries | A crashed container restarts a bounded number of times instead of looping forever. |
| Replicas | 1 | The release has one API process, so migrations and the start command are never concurrent. |

`/health` answers without a session by design, so the probe needs no credential.

## Web service commands

| Step | Command | Why |
| --- | --- | --- |
| Build | `pnpm install --frozen-lockfile && pnpm build` | Same root Turborepo build as CI; `next build` runs in `apps/web`. The build needs none of the web's server settings, which are validated when the server starts instead (`apps/web/instrumentation.ts`). |
| Pre-deploy | none | The web applies no migrations; the API owns the database. |
| Start | `pnpm --filter @invitame/web start` | Runs the package's `start` script, `next start`, in `apps/web`. `next` is not a root binary, so the filter form is the runnable-from-root spelling. `next start` reads `PORT` from the environment. |
| Health | `GET /health` | `apps/web/app/health/route.ts` (see below), checked for 300 seconds after the start command. |
| Restart | `ON_FAILURE`, 10 retries | Same bounded restart as the API. |
| Replicas | 1 | One web process; the app holds no shared state that needs more. |

## Required service variables outside the descriptor

These two are **prerequisites of the first deploy** (T3 → T8). Neither can live in a descriptor, because the schema
has no variables section: both are service variables set in the Railway dashboard before the first deploy.

1. **`RAILPACK_PRUNE_DEPS=false` on the API service, or move `prisma` to `dependencies`.** Railpack removes
   development dependencies from the final image by default, and the pre-deploy command needs the `prisma` CLI, which
   is a development dependency of `@invitame/api`. Without this, `pnpm --filter @invitame/api prisma:migrate:deploy`
   fails for want of the CLI and the deploy is never promoted. The alternative fix is to move `prisma` from
   `devDependencies` to `dependencies` in `apps/api/package.json`; until then the variable is the only remedy. The two
   start commands need production dependencies only, so pruning is otherwise correct.
2. **`RAILPACK_NODE_VERSION=26` on both services.** Railpack resolves the Node.js version from `RAILPACK_NODE_VERSION`,
   then `devEngines.runtime`, then **`engines.node`**, then `.nvmrc`. The repository's `engines.node` range
   (`>=22.22.1 <27`) is therefore resolved before `.nvmrc` (26) and decides the installed version; the variable pins
   exactly the Node.js major the repository is developed and CI-tested on. Confirm the version Railpack reports on the
   first build.

Every application variable (`DATABASE_URL`, the auth secrets and headers, email, media, payments) belongs to the
production configuration matrix of this milestone, not to this document, and is set on the service, never in a
descriptor file or the repository.

## Watch patterns

Each descriptor lists its own `apps/*` tree plus the root install and build inputs (`package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `tsconfig.base.json`, `turbo.json`, `.nvmrc`). A deployment triggers only when a changed file
matches one of those patterns, so a documentation change or a change in the other application does not redeploy the
service. A manual redeploy always remains possible.

## What the web health route proves

`GET /health` on the web answers `200` with exactly `{"status":"ok"}`, `content-type: application/json`, and
`cache-control: no-store`, from a handler that takes no request argument:

- **Proves:** the Next.js server process started, is accepting HTTP requests, and is serving its App Router routes.
  That is what a start-command healthcheck has to answer.
- **Does not prove:** that the API or the database is reachable. The handler reads no environment variable and makes
  no API call, so an API outage does not restart the web, and a green web healthcheck is not evidence that the
  product works. The API's database-backed `/health` is the readiness probe for that half; the web shows its own
  outage handling instead (`apps/web/lib/server/session-refresh.ts`).
- `export const dynamic = "force-dynamic"` and `cache-control: no-store` keep Next.js from prerendering or caching
  the answer, so every probe reaches the running process.
- `apps/web/proxy.ts` does not match this path: its matcher lists only the session pages (`/ingresar`, `/cuenta`,
  `/cuenta/:path*`), so no session refresh runs before the route and the probe needs no cookie.
  `apps/web/app/health/route.test.ts` pins the status, the exact body, the headers, the absence of a request
  argument, and the fact that no proxy matcher covers `/health`.
- Route-level tests live beside the route they test (`app/**/route.test.ts`) and are matched by the `app/**/*.test.ts`
  glob in `apps/web`'s `test` script, next to `lib/**/*.test.ts`, `e2e/**/*.test.ts`, and `proxy.test.ts`. A test added
  beside a route runs in `pnpm --filter @invitame/web test` and therefore in CI; a test outside those globs would be
  silently skipped.

## Not covered here

- Creating the Railway project, services, domain, database, buckets, the two service variables above, and the first
  deploy (T8, owner).
- The production variable matrix, backups and restore, the release/rollback runbook, alerts, and CD wiring, which
  this milestone documents separately.
- Migrations run forward only in pre-deploy. A release is rolled back by redeploying the previous image; an applied
  migration is never rewritten or reversed. Review the migration in a release before it runs, and confirm its
  reversibility by backup when it drops or rewrites data. See [`../database/model.md`](../database/model.md) for the
  invariants the migrations must keep.
