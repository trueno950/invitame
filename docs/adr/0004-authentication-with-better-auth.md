# ADR 0004: Authenticate with Better Auth inside the API

## Status

Accepted (2026-11-03). The human owner approved the library, customer sign-in by emailed one-time code,
administrator sign-in with a password and a mandatory authenticator app, Resend for email, and Railway for hosting.

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
   would bypass both the password and the second factor.
4. **Sessions and hosting.** Sessions are stored in the database and carried by an `HttpOnly`, `SameSite=Lax` cookie
   issued by the API, `Secure` outside local development. `apps/web` forwards the cookie from trusted server code and
   never stores it. Production runs web, API, and PostgreSQL in one Railway project under one registrable domain
   (`app.` and `api.` subdomains), with the cookie scoped so both the browser and the web server can send it. The
   Railway Hobby plan is for development; production moves to the Pro plan, which Railway positions for production
   workloads.
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
   because every customer sign-in sends an email, the account moves to a paid plan before launch. Tests use an
   in-memory adapter and local development uses a local mail catcher; codes never appear in logs.
9. **Configuration.** The auth secret, public base URL, and trusted origins are required environment variables
   validated at startup; the API refuses to start without them.

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
  factor, and rejection of email OTP sign-in for administrators.

## Open decisions

- The domain name to register (`.mx` or `.com`).
