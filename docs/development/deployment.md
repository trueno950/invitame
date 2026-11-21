# Production deployment and configuration

Status: the production configuration matrix for the first release (Milestone 10, T2; S1, S5). Nothing is deployed
today: there is no Railway project, no registered domain, no production email sender, no media bucket, and no payment
credential (`odd/tasks/m10-release.md`). The Railway service descriptors live in
[`deployment-services.md`](deployment-services.md); this document states what the code validates today. Where the repository has no answer,
it says so instead of guessing.

Every rule below was read from the validators, not from memory. Sources, in the order this document uses them:

- `apps/api/src/config/environment.ts` — the API validator, cited as `environment.ts:<line>`.
- `apps/web/lib/server/config.ts` — the web validator, cited as `config.ts:<line>`.
- `apps/api/src/main.ts`, `apps/api/src/config/config.module.ts`, `apps/web/instrumentation.ts`, and
  `apps/web/lib/server/startup.ts` — how each app fails at startup.
- [ADR 0004](../adr/0004-authentication-with-better-auth.md) — the host, the domain shape, and the accepted
  configuration decisions.
- [`odd/tasks/m10-release.md`](../../odd/tasks/m10-release.md) — the milestone specs and the owner decisions.

No value in this document is a real secret: every example is a shape.

## How each app fails closed

**API.** `ConfigModule.forRoot({ validate: validateEnvironment })` validates `process.env` merged with
`apps/api/.env` (`apps/api/src/config/config.module.ts:16-24`), so a container uses process variables only. A
validation error reaches `createApp` (`apps/api/src/main.ts:9`), Nest logs the exception, and the process prints
`API bootstrap failed.` and exits with code 1 (`apps/api/src/main.ts:17-20`). The logged line carries the validator
message quoted in the tables below. This is the code path, not a hosted observation: nothing runs in production yet.

**Web.** The settings are validated once when the Node.js server starts (`apps/web/instrumentation.ts:6-16`). A
failure writes one JSON line to stderr, `{"event":"web_config_invalid","message":"<validator message>"}`, and exits
with code 1 (`apps/web/lib/server/startup.ts:34-42`). `next build` is skipped by design
(`apps/web/lib/server/startup.ts:27-29`), so a build needs none of these values; the production rules apply when the
server starts.

Both validators: an empty or whitespace-only value counts as unset (`environment.ts:266-273`,
`config.ts:42-45`), and no message ever echoes the value, because several are secrets. Validation runs in source
order and cross-variable rules run last (`environment.ts:983-990`), so the first failure reported is the first
failing variable in that order — the media family is checked before the payments family
(`environment.ts:977-980`).

## API configuration matrix

`apps/api/src/config/environment.ts`. "Kind" is secret (must live in the host's secret store and never in a
repository, a log, or a screenshot) or plain configuration.

| Variable | Kind | Required when | Validation rule | Failure message | Example shape |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | plain | Always | Exactly `development`, `test`, or `production`; no default, because an unset value would turn every production rule off (`environment.ts:947-958`) | `NODE_ENV must be provided as development, production, or test.` / `NODE_ENV must be development, production, or test.` | `production` |
| `PORT` | plain | Optional | Integer 1–65535, default `3001` (`environment.ts:206`, `289-303`) | `PORT must be an integer between 1 and 65535.` | `3001`, or the port the host injects |
| `CORS_ORIGIN` | plain | Always | Comma-separated `http`/`https` origins; no empty entry, no `*`, and each entry an origin only — a lone trailing `/` is dropped, a path, query, or fragment is refused (`environment.ts:305-339`) | `CORS_ORIGIN must be provided.` / `CORS_ORIGIN must not contain empty entries.` / `CORS_ORIGIN must not contain wildcards.` / `CORS_ORIGIN must be a valid HTTP origin.` / `CORS_ORIGIN must use HTTP or HTTPS.` / `CORS_ORIGIN must not include a path, query, or fragment.` | `https://app.example.com` |
| `DATABASE_URL` | secret (carries the password) | Always | A parseable URL whose protocol is `postgresql:` or `postgres:`; nothing else is checked (`environment.ts:478-493`) | `DATABASE_URL must be provided.` / `DATABASE_URL must be a valid PostgreSQL connection URL.` / `DATABASE_URL must use the postgresql or postgres protocol.` | `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public` |
| `BETTER_AUTH_SECRET` | secret | Always | At least 32 characters; must differ from the proxy and payments secrets (`environment.ts:342-348`, `390-414`, `729-765`) | `BETTER_AUTH_SECRET must be provided.` / `BETTER_AUTH_SECRET must be at least 32 characters long.` | 32 random bytes, base64 (`openssl rand -base64 32`) |
| `AUTH_BASE_URL` | plain | Always | An `http`/`https` origin (same origin rules as `CORS_ORIGIN`) that is one of the `CORS_ORIGIN` entries, and `https` in production (`environment.ts:454-469`, `984`) | `AUTH_BASE_URL must be provided.` / `AUTH_BASE_URL must be a valid HTTP origin.` / `AUTH_BASE_URL must use HTTP or HTTPS.` / `AUTH_BASE_URL must not include a path, query, or fragment.` / `AUTH_BASE_URL must be one of the trusted origins in CORS_ORIGIN.` / `AUTH_BASE_URL must use HTTPS in production.` | `https://app.example.com` (the public web origin) |
| `AUTH_PROXY_SECRET` | secret | Production; optional in development and test | At least 32 characters, and different from `BETTER_AUTH_SECRET` (`environment.ts:357-372`, `390-398`) | `AUTH_PROXY_SECRET must be provided in production.` / `AUTH_PROXY_SECRET must be at least 32 characters long.` / `AUTH_PROXY_SECRET must differ from BETTER_AUTH_SECRET.` | 32 random bytes, base64; the same value in the web |
| `AUTH_PROXY_SECRET_PREVIOUS` | secret | Optional, only during a rotation | At least 32 characters, requires `AUTH_PROXY_SECRET`, and differs from both other auth secrets (`environment.ts:375-386`, `400-414`) | `AUTH_PROXY_SECRET_PREVIOUS must be at least 32 characters long.` / `AUTH_PROXY_SECRET_PREVIOUS must differ from BETTER_AUTH_SECRET.` / `AUTH_PROXY_SECRET must be provided in production.` / `AUTH_PROXY_SECRET_PREVIOUS must differ from AUTH_PROXY_SECRET.` | the previous proxy secret |
| `AUTH_CLIENT_IP_HEADER` | plain | Production; `x-forwarded-for` elsewhere | One lower-case HTTP header name (RFC 9110 token characters), never a list (`environment.ts:261-263`, `572-586`) | `AUTH_CLIENT_IP_HEADER must be provided in production.` / `AUTH_CLIENT_IP_HEADER must be a single HTTP header name.` | `x-invitame-client-ip` (the same name the web sets) |
| `AUTH_TRUSTED_PROXIES` | plain | Optional | Comma-separated IP addresses or CIDR ranges, prefix length ≤ 32 for IPv4 and ≤ 128 for IPv6; empty list by default (`environment.ts:557-566`, `588-595`) | `AUTH_TRUSTED_PROXIES must list IP addresses or CIDR ranges.` | `10.0.0.0/8` |
| `EMAIL_TRANSPORT` | plain | Optional; only `resend` in production | `resend`, `mailpit`, or `memory`; defaults to `resend` in production, `mailpit` in development, `memory` in test (`environment.ts:233-238`, `515-528`) | `EMAIL_TRANSPORT must be resend, mailpit, or memory.` / `EMAIL_TRANSPORT must be resend in production.` | `resend` |
| `EMAIL_FROM` | plain | Production; a reserved local sender elsewhere | An address or `Name <address>`: the address has no whitespace, `<`, `>`, or `@` outside the single separator, and needs a dot; a line break anywhere is refused (`environment.ts:254-255`, `500-509`) | `EMAIL_FROM must be provided.` / `EMAIL_FROM must be an email address or "Name <address>".` | `InvitaMe <no-reply@mail.example.com>` |
| `MAILPIT_URL` | plain | Optional, but always validated | An `http`/`https` origin, default `http://localhost:8025`; validated in every environment, including production where the transport is `resend` (`environment.ts:240`, `535-538`) | `MAILPIT_URL must be a valid HTTP origin.` / `MAILPIT_URL must use HTTP or HTTPS.` / `MAILPIT_URL must not include a path, query, or fragment.` | `http://localhost:8025` |
| `RESEND_API_KEY` | secret | With `EMAIL_TRANSPORT=resend`, so always in production | Non-empty (`environment.ts:541-548`) | `RESEND_API_KEY must be provided when EMAIL_TRANSPORT is resend.` | `re_...` from the provider panel |
| `MUSIC_METADATA_LOOKUP` | plain | Optional | `on` or `off`; `on` in development and production, `off` in test (`environment.ts:220-224`, `872-884`) | `MUSIC_METADATA_LOOKUP must be on or off.` | `on` |
| `PLACE_SEARCH_PROVIDER` | plain | Optional | `photon` or `off`; `photon` in development and production, `off` in test (`environment.ts:226-230`, `928-938`) | `PLACE_SEARCH_PROVIDER must be photon or off.` | `photon` |
| `PLACE_SEARCH_PHOTON_URL` | plain | Optional, but always validated | An `http`/`https` URL with no credentials, query, or fragment; a path is allowed; default `https://photon.komoot.io/api/` (`environment.ts:232`, `891-921`, `940-942`) | `PLACE_SEARCH_PHOTON_URL must be an http or https URL without credentials, query, or fragment.` | `https://photon.komoot.io/api/` |
| `PAYMENTS_MODE` | plain | Production; `free` elsewhere | `free`, `simulated`, or `mercadopago`; required in production and `simulated` refused there (`environment.ts:611-639`) | `PAYMENTS_MODE must be provided in production.` / `PAYMENTS_MODE must be free, simulated, or mercadopago.` / `PAYMENTS_MODE must not be simulated in production.` | `free` for the first release |
| `PAYMENTS_SIMULATED_SECRET` | secret | With `PAYMENTS_MODE=simulated` (never in production) | Required, at least 32 characters, different from every auth secret (`environment.ts:641-649`, `729-765`) | `PAYMENTS_SIMULATED_SECRET must be provided when PAYMENTS_MODE is simulated.` / `PAYMENTS_SIMULATED_SECRET must be at least 32 characters long.` / `PAYMENTS_SIMULATED_SECRET must differ from <other secret>.` | 32 random bytes, base64 |
| `PAYMENTS_RETURN_BASE_URL` | plain | With `simulated` or `mercadopago`; not read in `free` | An `http`/`https` origin, default `http://localhost:3000`; `https` in production for `mercadopago` (`environment.ts:245`, `654-658`, `706-713`) | `PAYMENTS_RETURN_BASE_URL must be a valid HTTP origin.` / `PAYMENTS_RETURN_BASE_URL must use HTTP or HTTPS.` / `PAYMENTS_RETURN_BASE_URL must not include a path, query, or fragment.` / `PAYMENTS_RETURN_BASE_URL must use HTTPS in production.` | `https://app.example.com` |
| `PAYMENTS_WEBHOOK_BASE_URL` | plain | With `PAYMENTS_MODE=mercadopago` | Required, an `http`/`https` origin, `https` in production (`environment.ts:682-701`) | `PAYMENTS_WEBHOOK_BASE_URL must be provided when PAYMENTS_MODE is mercadopago.` / `PAYMENTS_WEBHOOK_BASE_URL must be a valid HTTP origin.` / `PAYMENTS_WEBHOOK_BASE_URL must use HTTPS in production.` | `https://api.example.com` |
| `MERCADOPAGO_ACCESS_TOKEN` | secret | With `PAYMENTS_MODE=mercadopago` | Required and different from every auth, proxy, and webhook secret (`environment.ts:671-676`, `729-765`) | `MERCADOPAGO_ACCESS_TOKEN must be provided when PAYMENTS_MODE is mercadopago.` / `MERCADOPAGO_ACCESS_TOKEN must differ from <other secret>.` | provider token, never committed |
| `MERCADOPAGO_WEBHOOK_SECRET` | secret | With `PAYMENTS_MODE=mercadopago` | Required, different from the access token and every auth secret (`environment.ts:678-684`, `746-765`) | `MERCADOPAGO_WEBHOOK_SECRET must be provided when PAYMENTS_MODE is mercadopago.` / `MERCADOPAGO_WEBHOOK_SECRET must differ from MERCADOPAGO_ACCESS_TOKEN.` / `MERCADOPAGO_WEBHOOK_SECRET must differ from <other secret>.` | panel signing secret, never committed |
| `MERCADOPAGO_API_BASE_URL` | plain | Optional; read only with `mercadopago` | An `http`/`https` origin, default `https://api.mercadopago.com`, `https` in production (`environment.ts:250`, `692-704`) | `MERCADOPAGO_API_BASE_URL must be a valid HTTP origin.` / `MERCADOPAGO_API_BASE_URL must use HTTPS in production.` | `https://api.mercadopago.com` |
| `MEDIA_STORAGE_DRIVER` | plain | Optional; defaults to `s3` in production and `local` in development and test | `local` or `s3`; `local` is refused in production (`environment.ts:791-804`) | `MEDIA_STORAGE_DRIVER must be local or s3.` / `MEDIA_STORAGE_DRIVER must be s3 in production.` | `s3` |
| `MEDIA_PUBLIC_BASE_URL` | plain | Optional by name, effectively required in production: the default is `http://localhost:3001`, which the production HTTPS rule refuses (`environment.ts:211`, `782-789`) | An `http`/`https` origin, `https` in production | `MEDIA_PUBLIC_BASE_URL must be a valid HTTP origin.` / `MEDIA_PUBLIC_BASE_URL must not include a path, query, or fragment.` / `MEDIA_PUBLIC_BASE_URL must use HTTPS in production.` | `https://api.example.com` (the API's own public origin) |
| `MEDIA_LOCAL_DIRECTORY` | plain | With `MEDIA_STORAGE_DRIVER=local` only | No validation; default `apps/api/.local-media` (`environment.ts:213`, `808-810`) | none | a writable directory |
| `MEDIA_S3_ENDPOINT` | plain | With `s3`, so in production | Required, an `http`/`https` origin, `https` in production (`environment.ts:815-822`) | `MEDIA_S3_ENDPOINT must be provided.` / `MEDIA_S3_ENDPOINT must be a valid HTTP origin.` / `MEDIA_S3_ENDPOINT must use HTTPS in production.` | `https://<account-id>.r2.cloudflarestorage.com` |
| `MEDIA_S3_REGION` | plain | With `s3`, so in production | Required and matched against `^[a-z0-9-]+$` (`environment.ts:215-217`, `824-827`) | `MEDIA_S3_REGION must be provided.` / `MEDIA_S3_REGION must be a region name such as us-east-1 or auto.` | `auto` (R2) or `us-east-1` |
| `MEDIA_S3_BUCKET` | plain | With `s3`, so in production | Required and matched against `^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$` (`environment.ts:215`, `829-832`) | `MEDIA_S3_BUCKET must be provided.` / `MEDIA_S3_BUCKET must be a valid bucket name.` | `invitame-media` |
| `MEDIA_S3_ACCESS_KEY_ID` | secret | With `s3`, so in production | Required and non-empty (`environment.ts:834`) | `MEDIA_S3_ACCESS_KEY_ID must be provided.` | the provider's access key id |
| `MEDIA_S3_SECRET_ACCESS_KEY` | secret | With `s3`, so in production | Required and non-empty (`environment.ts:835`) | `MEDIA_S3_SECRET_ACCESS_KEY must be provided.` | the provider's secret access key |
| `MEDIA_S3_FORCE_PATH_STYLE` | plain | Optional, only read with `s3` | Exactly `true` or `false` (lower-case literals); default `false` (`environment.ts:218`, `836-841`) | `MEDIA_S3_FORCE_PATH_STYLE must be true or false.` | `false` (R2), `true` (MinIO) |
| `BETTER_AUTH_TRUSTED_ORIGINS` | plain | Refused | Any value other than unset or exactly `""` stops the startup, so `CORS_ORIGIN` stays the only list of trusted origins (`environment.ts:429-434`) | `BETTER_AUTH_TRUSTED_ORIGINS is not supported; list trusted origins in CORS_ORIGIN.` | do not set it |
| `BETTER_AUTH_SECRETS` | plain | Refused | Any value other than unset or exactly `""` stops the startup, because Better Auth would read it and replace the validated `BETTER_AUTH_SECRET` (`environment.ts:442-446`) | `BETTER_AUTH_SECRETS is not supported; set BETTER_AUTH_SECRET.` | do not set it |

## Web configuration matrix

`apps/web/lib/server/config.ts`. None of these uses the `NEXT_PUBLIC_` prefix, so none reaches a browser bundle
(`config.ts:4-7`).

| Variable | Kind | Required when | Validation rule | Failure message | Example shape |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | plain | Not required by the web | Not validated: only `NODE_ENV === "production"` is read, to switch the production rules on (`config.ts:133`). `next start` sets `NODE_ENV=production` when it is unset (Next.js 16.3.5 `dist/bin/next`, hook `preAction`), so the documented start command gets the production rules | none | `production` |
| `API_ORIGIN` | plain | Production; `http://localhost:3001` elsewhere | An `http`/`https` origin, normalized (default port and a lone trailing `/` dropped), with no `@` anywhere, no credentials, and no path, query, or fragment (`config.ts:66-95`, `134-136`) | `API_ORIGIN must be provided in production.` / `API_ORIGIN must be an http or https origin without a path, query, fragment, or credentials.` | `http://api.railway.internal:3001` |
| `AUTH_PROXY_SECRET` | secret | Production; optional in development and test | At least 32 characters; the same value the API holds (`config.ts:36`, `111-129`) | `AUTH_PROXY_SECRET must be provided in production.` / `AUTH_PROXY_SECRET must be at least 32 characters long.` | 32 random bytes, base64 |
| `AUTH_CLIENT_IP_HEADER` | plain | Production; `x-forwarded-for` elsewhere | One lower-case header name, and not `x-invitame-proxy-secret` (`config.ts:97-109`, `138-141`) | `AUTH_CLIENT_IP_HEADER must be provided in production.` / `AUTH_CLIENT_IP_HEADER must be a single HTTP header name.` / `AUTH_CLIENT_IP_HEADER must not be the proxy secret header.` | `x-invitame-client-ip` (the same name the API reads) |
| `AUTH_EDGE_CLIENT_IP_HEADER` | plain | Production; `x-forwarded-for` elsewhere | One lower-case header name, and in production it must not be `x-forwarded-for` or `forwarded`, because a browser can set both (`config.ts:26-30`, `97-109`, `142-156`) | `AUTH_EDGE_CLIENT_IP_HEADER must be provided in production.` / `AUTH_EDGE_CLIENT_IP_HEADER must be a single HTTP header name.` / `AUTH_EDGE_CLIENT_IP_HEADER must name a header the platform edge overwrites in production.` | `x-real-ip` — only if the edge overwrites it |

The two header names are a cross-app contract: the web reads the client IP from `AUTH_EDGE_CLIENT_IP_HEADER` and
sets `AUTH_CLIENT_IP_HEADER` on its request to the API, and the API reads `AUTH_CLIENT_IP_HEADER` next to a valid
proxy secret (`config.ts:14-17`; `README.md` "Environment variables").

## Rules that make a deployment dangerous

1. **`AUTH_BASE_URL` must be one of the `CORS_ORIGIN` entries** (`environment.ts:984`). Both sides are normalized to
   origins first, so `https://app.example.com/` and `https://app.example.com` match; a subdomain that is only in one
   of them stops the API, and Better Auth never trusts an origin CORS does not.
2. **Production requires `https` on `AUTH_BASE_URL`** (`environment.ts:464`), because the session cookie is
   `__Host-`-prefixed and `Secure` only over `https` (ADR 0004 decision 4).
3. **Production refuses `PAYMENTS_MODE=simulated`** (`environment.ts:637-639`). Its adapter can mint a valid
   signature from a configuration value, so a deployment using it could grant publication to an event the API itself
   produced.
4. **Production defaults `MEDIA_STORAGE_DRIVER` to `s3` and refuses `local`** (`environment.ts:791-804`). An
   ephemeral filesystem would lose the photos, so a production API does not start until
   `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, and
   `MEDIA_S3_SECRET_ACCESS_KEY` exist — even before any invitation uses media.
5. **`MEDIA_PUBLIC_BASE_URL` has an `http` default** (`environment.ts:211`) that the production `https` rule refuses
   (`environment.ts:787-789`). Leaving it unset fails the production startup instead of publishing `http` URLs.
6. **The web refuses client-controlled edge headers in production** (`config.ts:152-156`): `x-forwarded-for` and
   `forwarded` are refused, because Next.js keeps a client-supplied `x-forwarded-for` and appends to `forwarded`.
   The named header must be one the platform edge overwrites on every request; choosing it is an open decision (see
   below).
7. **Secrets must be distinct.** `AUTH_PROXY_SECRET` and its previous value must differ from `BETTER_AUTH_SECRET`
   (`environment.ts:390-414`); a payments secret must differ from every auth secret (`environment.ts:729-765`); and
   `MERCADOPAGO_WEBHOOK_SECRET` must differ from `MERCADOPAGO_ACCESS_TOKEN`
   (`environment.ts:746-749`). Copying one generated value into two slots fails the startup.
8. **Two Better Auth variables are refused outright** (`environment.ts:429-446`): any value other than unset or
   exactly `""` for `BETTER_AUTH_TRUSTED_ORIGINS` or `BETTER_AUTH_SECRETS` stops the API. A whitespace-only value is
   refused; `""` is accepted because Better Auth treats it as absent.
9. **`MAILPIT_URL` is validated even when it is unused** (`environment.ts:535-538`): production needs
   `EMAIL_TRANSPORT=resend`, but a syntactically wrong `MAILPIT_URL` still stops the startup.
10. **`MEDIA_S3_FORCE_PATH_STYLE` accepts only the lower-case literals** `true` and `false`
    (`environment.ts:218`, `836-841`); a JSON-style boolean or `yes` stops the startup.
11. **Validation order hides later errors**: media is parsed before payments (`environment.ts:977-980`) and
    cross-variable rules run last (`environment.ts:983-990`), so fixing one reported variable can reveal the next.
    Expect more than one round when a production environment is assembled by hand.
12. **The web's production rules depend on `NODE_ENV === "production"`** (`config.ts:133`). A custom start command
    that forces `NODE_ENV=development` silently falls back to `http://localhost:3001` and dev defaults instead of
    failing.

## The first release with `PAYMENTS_MODE=free`

The owner chose a free first release: the product publishes without charging until a Mercado Pago sandbox test
happens with test credentials (`odd/tasks/m10-release.md`, S2).

`free` needs `PAYMENTS_MODE=free` and nothing else in the payments family: `parsePaymentsEnvironment` returns
immediately for `free` (`environment.ts:629-631`), so the following are not read at all and need not be set:

- `PAYMENTS_SIMULATED_SECRET`, `PAYMENTS_RETURN_BASE_URL` (read only for `simulated`, `environment.ts:641-658`);
- `PAYMENTS_WEBHOOK_BASE_URL`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`,
  `MERCADOPAGO_API_BASE_URL` (read only for `mercadopago`, `environment.ts:669-704`).

`PAYMENTS_MODE` itself is required in production regardless of mode (`environment.ts:617-620`). Nothing else about
the release is free: email still needs Resend, and media still needs the S3-compatible bucket (rules 4 and 5 above).
The provider test itself stays deferred; see [`payments.md`](payments.md) for the modes and the provider checklist.

### API variables the first release needs

`NODE_ENV=production`, `DATABASE_URL`, `CORS_ORIGIN`, `BETTER_AUTH_SECRET`, `AUTH_BASE_URL`,
`AUTH_PROXY_SECRET`, `AUTH_CLIENT_IP_HEADER`, `EMAIL_FROM`, `RESEND_API_KEY`, `PAYMENTS_MODE=free`,
`MEDIA_PUBLIC_BASE_URL`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`,
`MEDIA_S3_SECRET_ACCESS_KEY`, plus `MEDIA_S3_FORCE_PATH_STYLE=true` only when the provider needs path-style addressing
(MinIO; R2 and AWS S3 do not). `PORT` comes from the host when it injects one. The remaining variables have working
defaults (`MEDIA_STORAGE_DRIVER=s3` in production, `AUTH_TRUSTED_PROXIES` empty, `EMAIL_TRANSPORT=resend`,
`MUSIC_METADATA_LOOKUP=on`, `PLACE_SEARCH_PROVIDER=photon`,
`PLACE_SEARCH_PHOTON_URL=https://photon.komoot.io/api/`).

### Web variables the first release needs

`API_ORIGIN`, `AUTH_PROXY_SECRET`, `AUTH_CLIENT_IP_HEADER`, `AUTH_EDGE_CLIENT_IP_HEADER`. `NODE_ENV` is set by
`next start`; nothing else exists.

### Producing each secret, in order

Generate locally where possible and paste the value only into the host's variable store. `.env` and `.env.*` are
ignored by Git and only the `*.example` files are tracked (`.gitignore:19-23`), so no generated value belongs in the
repository, a commit message, an issue, or a screenshot.

1. `BETTER_AUTH_SECRET` — `openssl rand -base64 32` (44 characters; the minimum is 32).
2. `AUTH_PROXY_SECRET` — `openssl rand -base64 32` in a separate invocation, because it must differ from the first
   value; use the same value in the API and the web.
3. `DATABASE_URL` — read from the Postgres service's credentials in the host; the API only checks that it parses and
   uses the `postgresql:` or `postgres:` protocol.
4. `RESEND_API_KEY` — created in the email provider's panel, not generated locally; the sending domain needs SPF,
   DKIM, and DMARC before it can be used (ADR 0004, "Email delivery").
5. `MEDIA_S3_ACCESS_KEY_ID` and `MEDIA_S3_SECRET_ACCESS_KEY` — created as an API token in the object-storage
   provider's panel, not generated locally, and scoped to the media bucket only.
6. Nothing for payments at this release: no `PAYMENTS_SIMULATED_SECRET`, no `MERCADOPAGO_*` credential.

If `AUTH_PROXY_SECRET` is ever rotated, follow the order in `README.md` ("Environment variables"): set
`AUTH_PROXY_SECRET_PREVIOUS` and the new `AUTH_PROXY_SECRET` on the API, then the new value on the web, then remove
the previous one from the API (`environment.ts:375-414`).

## Railway as the host

The host is Railway (ADR 0004 decision 4): one project with two services, `web` (Next.js) and `api` (NestJS), plus a
Postgres service, under one registrable domain with `app.` and `api.` subdomains
(`docs/adr/0004-authentication-with-better-auth.md:105-110`). Backups are Railway's own (owner decision S3 in
`odd/tasks/m10-release.md`), so the chosen plan must include them; the backup, verification, and restore procedure is
T5 and is not repeated here.

### Per-service variables

| Service | Variables |
| --- | --- |
| `api` | Everything in the API matrix that the first release needs, including `DATABASE_URL` pointing at the Postgres service. It never receives `API_ORIGIN`. |
| `web` | `API_ORIGIN` (the API service's internal origin, `http` inside the project), `AUTH_PROXY_SECRET` (same value as the API), `AUTH_CLIENT_IP_HEADER`, `AUTH_EDGE_CLIENT_IP_HEADER`. It never receives `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, or the media credentials. |
| `Postgres` | No application variables; `DATABASE_URL` is derived from its credentials and given to `api`. |

The exact variable-reference form Railway uses for the database URL, and the port each service listens on, are
platform facts that the repository does not contain; confirm them when the project is created (T8).

### What the repository does not provide yet

- **Build.** `apps/api` builds with `tsc -p tsconfig.build.json` (`apps/api/package.json:9`) and the root build is
  `turbo run build` (`package.json:12`); the web builds with `next build` (`apps/web/package.json:6`). Nothing in
  `build` generates the Prisma client: the generation step is the separate `prisma:generate` script
  (`apps/api/package.json:14`), which CI runs on its own. A deployment build must therefore run
  `pnpm --filter @invitame/api prisma:generate` as part of (or immediately before) the build, or the API starts
  without an initialized Prisma client.
- **Migrations.** The repository's own scripts contain no predeploy hook: `prisma:migrate:deploy`
  (`apps/api/package.json:15`) is a script nothing runs automatically, so migrations must be applied before the new
  API version starts. The service descriptors add that pre-deploy command; see
  [`deployment-services.md`](deployment-services.md), whose commands are authoritative over this paragraph.
- **Start commands.** `api` starts with `node dist/main.js` (`apps/api/package.json:17`) and sets no `NODE_ENV`, so
  the service must set it. `web` starts with `next start` (`apps/web/package.json:9`), which sets
  `NODE_ENV=production` when unset.
- **Health.** Only the API has a health endpoint today: `GET /health` (`apps/api/src/health/health.controller.ts:8-25`),
  public by design, which runs `SELECT 1` and answers `503` with
  `{"status":"unhealthy","database":"unavailable","checkedAt":"..."}` when the database is unreachable
  (`apps/api/src/health/health.service.ts:11-19`). The web answers `GET /health` with `{"status":"ok"}`
  (`apps/web/app/health/route.ts`), a liveness answer that touches no database and no API; it proves the web process
  serves requests, not that the API or the database are healthy.
- **Scheduled maintenance.** The approved daily retention task (`pnpm analytics:retention`) is created with the first
  deployment and does not exist yet; see [`analytics-retention.md`](analytics-retention.md).

### Owner decisions still open

1. **Plan and region.** ADR 0004 records Hobby for development and Pro for production
   (`docs/adr/0004-authentication-with-better-auth.md:108-110`); the plan actually bought, and the region, are not
   decided anywhere in the repository.
2. **Domain.** One registrable domain with `app.` and `api.` subdomains is decided (ADR 0004:107-108); which domain,
   `.mx` or `.com`, is still open (`docs/adr/0004-authentication-with-better-auth.md:243`).
3. **Client-IP header at the edge.** The production web refuses `x-forwarded-for` and `forwarded` and needs a header
   the edge overwrites on every request (`config.ts:152-156`). Which header the chosen edge actually overwrites is
   not recorded; until it is, the production web cannot start, because the default is refused.
4. **Alert destination.** The API emits an `email_delivery_degraded` event and nothing routes it anywhere; the
   operational alert is listed as still open (ADR 0004, "Outcome", and `docs/adr/0004-authentication-with-better-auth.md:237-239`).

## What fails and how it looks

The message is the API's logged validator error followed by `API bootstrap failed.` (exit code 1), or the web's
single `web_config_invalid` JSON line (exit code 1).

| Misconfiguration | Resulting startup error |
| --- | --- |
| `NODE_ENV` missing in the API service | `NODE_ENV must be provided as development, production, or test.` |
| Local values copied into production (`MEDIA_PUBLIC_BASE_URL` unset) | `MEDIA_PUBLIC_BASE_URL must use HTTPS in production.` |
| `MEDIA_STORAGE_DRIVER=local` in production | `MEDIA_STORAGE_DRIVER must be s3 in production.` |
| Media bucket never configured | `MEDIA_S3_ENDPOINT must be provided.` (then region, bucket, and credentials in turn) |
| `PAYMENTS_MODE` missing in production | `PAYMENTS_MODE must be provided in production.` |
| `PAYMENTS_MODE=simulated` in production | `PAYMENTS_MODE must not be simulated in production.` |
| `AUTH_BASE_URL` not in `CORS_ORIGIN` | `AUTH_BASE_URL must be one of the trusted origins in CORS_ORIGIN.` |
| `http://` auth origin in production | `AUTH_BASE_URL must use HTTPS in production.` |
| Proxy secret missing (API or web) | API: `AUTH_PROXY_SECRET must be provided in production.` Web: `web_config_invalid` with the same message |
| Proxy secret copied from the auth secret | `AUTH_PROXY_SECRET must differ from BETTER_AUTH_SECRET.` |
| Email transport left at a development value | `EMAIL_TRANSPORT must be resend in production.` |
| Resend key missing | `RESEND_API_KEY must be provided when EMAIL_TRANSPORT is resend.` |
| Web edge header left at `x-forwarded-for` | `web_config_invalid` with `AUTH_EDGE_CLIENT_IP_HEADER must name a header the platform edge overwrites in production.` |
| `API_ORIGIN` missing on the web | `web_config_invalid` with `API_ORIGIN must be provided in production.` |
| API pointed at the public web origin instead of the API | the web starts and its proxy calls the wrong origin; the failure appears on the first auth request, not at startup |
| Health check against the API while Postgres is down | `503` with `{"status":"unhealthy","database":"unavailable","checkedAt":"..."}` |

## Related documents

- [`payments.md`](payments.md) — payment modes, the simulated signature scheme, and the provider checklist.
- [`media-storage.md`](media-storage.md) — the media adapters, the S3-compatible settings, and the cleanup command.
- [`analytics-retention.md`](analytics-retention.md) — the retention command and its pending Railway schedule.
- [`quality-gates.md`](quality-gates.md) — the commands a change must pass before it reaches a deploy.
- [ADR 0004](../adr/0004-authentication-with-better-auth.md) — sessions, hosts, cookies, and the accepted
  configuration decisions.
