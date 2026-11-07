# Milestone 2 — Identity, ownership, and authorization

Task brief and tracking for Milestone 2 on branch `feat/m2-identity`, implementing the accepted
[ADR 0004](../../docs/adr/0004-authentication-with-better-auth.md). Status: T1 (`ebabb0d`), T1b (`71ae169`), T2 (`cb07c29`), and T3 (`4cfdb26`) committed and published (L21); T4
committed as slices 4 to 6 (L22); slices 1 to 6 merged into the tracker (L23); T5a merged as #8 (L24); T5b merged as #9 (L25); T5c merged as #10 (L26); T6a merged as #11 and #12 (L27, L28); T6b merged as #13 and #14 (L29, L30); T7 merged as #15 and #16 (L31, L32); T8a merged as #17 (L33 to L35); T8b merged as #18 and #19 (L36 to L38); T8c merged as #20 (L39, L40); T8t merged as #21 (L41, L42); T8d merged as #22 and #23 (L42 to L44); T8l merged as #24 (L45, L46); T9a merged as #25 (L47, L48); T7c merged as #26 (L48, L49); T7d merged as #27 (L49, L50); T9b in progress (L50).
Commits need explicit human approval (repository policy); push, pull request, and merge stay human decisions.

| Field | Answer |
| --- | --- |
| Goal | ROADMAP outcome: "Give creators a verified account and a backend-enforced ownership model for their catalog and invitations." |
| Request type | Security (authentication), data/schema, and configuration. |
| Risk | High: authentication, the trust boundary between `apps/web` and `apps/api`, new dependencies, and a schema migration. |
| Scope | `apps/api` auth module, Prisma schema with one new migration, environment validation, CORS, email port and adapters; `apps/web` sign-in pages and session forwarding; a local mail catcher in Docker Compose; related documentation. |
| Non-goals | S3, plus: invitation authoring, payments, media, a production Resend account, Railway deployment, domain purchase, push, pull request, and merge. |
| Affected boundary | Runtime (API and web), data (new tables and `User` columns), trust (sessions, cookies, CORS), and dependencies. |
| Acceptance criteria | Every spec below holds and is proven by the task that owns it. |
| Verification | `pnpm docs:check`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`; the database gate (`db:up`, `db:migrate`, seed twice, `db:check`); integration tests against real PostgreSQL; native review per work unit; independent verification for security units. |
| Rollback | Each task is one work-unit commit on this branch and can be reverted alone. The T2 migration is additive; once applied to a shared database, it is undone only by a new migration, never by editing it. |
| Human decisions | Commit approval per unit, T2 migration review, T11 security sign-off, and the domain name (not blocking). |
| Delivery | Feature branch chain (L17). `feat/m2-identity` is the tracker and final integration branch, with a draft pull request to `master` that is not merged before T11. Slice 1 `feat/m2-identity-01-spike` (T1, T1b; 407 lines) targets the tracker; slice 2 `feat/m2-identity-02-schema` (T2; 436 lines, 106 of them generated migration SQL) targets slice 1; slice 3 `feat/m2-identity-03-config` (T3, `4cfdb26`; about 747 lines, 415 of them tests) targets slice 2 with `size:exception` (L19); each later slice branches from and targets its parent. Pull requests: tracker #1 (draft, marker commit `7d9e3b9`), slice 1 #2, slice 2 #3, slice 3 #4. T4 is split into slice 4 `feat/m2-identity-04-email-core` (`01f44f5`), slice 5 `feat/m2-identity-05-email-adapters` (`f6cc504`), and slice 6 `feat/m2-identity-06-email-wiring`, each with `size:exception` (L22). Pull requests #2 to #7 are merged into the tracker with merge commits; later slices branch from the tracker and target it: slice 7 `feat/m2-identity-07-sign-in-code` (T5a, #8, merged) and slice 8 `feat/m2-identity-08-abuse-limits` (T5b, #9, merged), slice 9 `feat/m2-identity-09-abuse-hardening` (T5c, #10, merged), slice 10 `feat/m2-identity-10-authorization` (T6a access control, #11, merged), slice 11 `feat/m2-identity-11-disable-user` (T6a disable command, #12, merged), slice 12 `feat/m2-identity-12-session-status` (T6b session hardening, #13, merged), slice 13 `feat/m2-identity-13-own-profile` (T6b own profile, #14, merged), slice 14 `feat/m2-identity-14-admin-sign-in` (T7 administrator sign-in, #15, merged), slice 15 `feat/m2-identity-15-admin-create` (T7 creation command, #16, merged), slice 16 `feat/m2-identity-16-session-settings` (T8a session settings, #17, merged), slice 17 `feat/m2-identity-17-web-proxy` (T8b API proxy secret, #18, merged), slice 18 `feat/m2-identity-18-web-proxy-client` (T8b web proxy and server-side API client, #19, merged), slice 19 `feat/m2-identity-19-customer-pages` (T8c customer pages, #20, merged), slice 20 `feat/m2-identity-20-theme` (T8t theme foundations, #21, merged), slice 21 `feat/m2-identity-21-admin-pages` (T8d administrator sign-in and panel, #22, merged), slice 22 `feat/m2-identity-22-admin-enrollment` (T8d administrator enrollment, #23, merged), slice 23 `feat/m2-identity-23-landing` (T8l themed landing, #24, merged), slice 24 `feat/m2-identity-24-integration-tests` (T9a database tests in CI, #25, merged), slice 25 `feat/m2-identity-25-enrollment-race` (T7c enrollment race fix, #26, merged), slice 26 `feat/m2-identity-26-enrollment-hardening` (T7d enrollment hardening, #27, merged), and T9b on `feat/m2-identity-27-browser-tests` (L23 to L50). Push and pull requests need human approval. |

## Specs

Cited documents are authoritative; read them in full. S14 to S31 come from the two native reviews of ADR 0004, which
exposed only ID, severity, and location: each reading is ours and is confirmed by the task that resolves it.

- **S1** ROADMAP Milestone 2 key scope, verbatim: "authentication and session lifecycle with Better Auth, as decided
  in ADR 0004; user profile and account status behavior; API authorization policy for creator-owned resources and
  administrative actions; secure session boundaries between `apps/web` and `apps/api`; and unit/integration tests for
  denied access, ownership, and session failure paths."
- **S2** ROADMAP Milestone 2 exit criteria, verbatim: "Protected API actions deny unauthenticated and unauthorized
  requests regardless of UI state." "User ownership is represented by normalized relations and database
  constraints." "Secret handling, session expiry, and error mapping have human-approved security evidence."
- **S3** ROADMAP Milestone 2 non-goals, verbatim: "No OAuth, social login, custom domains, multi-organization billing,
  or invitation authoring is included."
- **S4** ADR 0004 decision 1, Library, including the fallback.
- **S5** ADR 0004 decision 2, Persistence.
- **S6** ADR 0004 decision 3, Sign-in, including the administrator enrollment gate.
- **S7** ADR 0004 decision 4, Sessions and hosting.
- **S8** ADR 0004 decision 5, Origins.
- **S9** ADR 0004 decision 6, Authorization.
- **S10** ADR 0004 decision 7, Abuse limits.
- **S11** ADR 0004 decision 8, Email delivery.
- **S12** ADR 0004 decision 9, Configuration.
- **S13** ADR 0004 consequences: the spike comes first, the `User` migration gets human review, and the listed
  integration tests exist.
- **S14** First review R1-001 (risk, SUGGESTION): scope the session cookie as narrowly as possible, and never serve
  untrusted content from a host that receives it. Decided (L33): the browser talks only to the web origin, which
  proxies `/api/auth` to the API and calls the API from its server with the cookie; the session cookie is host-only
  on the web host, with the `__Host-` prefix in production, so no other host, such as one for public invitations,
  receives it.
- **S15** First review R2-001 (readability, SUGGESTION): concrete values for code expiry and attempt limits.
  Decided (L23): 6-digit codes that expire after 300 seconds, at most 3 wrong attempts per code, stored hashed.
- **S16** First review R2-002 (readability, SUGGESTION): the exact cookie name, `Domain`, and lifetime. Decided (L33,
  L34): no `Domain` attribute (host-only on the web host); customer sessions last 7 days and are refreshed at most
  once per day of use; administrator sessions last 12 hours from sign-in and are never refreshed. T8a fixes and
  documents the exact cookie name.
- **S17** R3-adr-test-coverage-gaps (reliability, WARNING): tests beyond the ADR minimum, such as untrusted origins,
  disabled password sign-up, a client-supplied role, and enumeration-safe responses.
- **S18** R3-disable-revocation-cache (reliability, SUGGESTION): disabling a user takes effect on the next request; no
  session cache keeps a revoked session valid.
- **S19** R4-ratelimit-store-failure-mode (resilience, SUGGESTION): sign-in fails closed when the rate-limit store
  fails.
- **S20** Second review R1-001 (risk, SUGGESTION): bound the pre-enrollment window of a new administrator (initial
  password strength and lifetime). Decided (L30): the creation command generates a random 24-character initial
  password and shows it once in the terminal, never in logs; if the administrator has not enrolled an authenticator
  app within 24 hours of its issue, that password stops working and the same command must issue a new one; Milestone
  2 offers no password change through the API.
- **S21** R2-ambiguous-pronoun-enrollment-gate (readability, WARNING): state unambiguously what a pre-enrollment
  administrator account can and cannot do.
- **S22** R3-enrollment-gate-email-otp (reliability, WARNING): email OTP sign-in is rejected for administrator
  accounts in every enrollment state.
- **S23** R3-send-failure-code-lifecycle (reliability, WARNING): what happens to a code whose email failed, and how it
  counts against attempts. Decided (L23): the send request never waits for delivery; when delivery of a code fails
  after the bounded retries, that code is invalidated (never a newer code), the failure counts toward the degraded
  alert, and it does not count as a wrong attempt.
- **S24** R3-send-failure-enumeration (reliability, WARNING): send-failure responses are identical for new, existing,
  and administrator emails; an administrator email gets the same response as a customer email. Decided (L23): the
  send endpoint returns the same immediate success response for new, existing, and administrator emails, whatever
  the later delivery outcome, and administrator emails never receive a sign-in code. This amends ADR 0004 decision 8,
  which asked for a generic retryable error.
- **S25** R4-send-failure-rate-limit-interaction (resilience, WARNING): send failures neither lock customers out
  through rate limits nor open an abuse path. Decided (L23): persistent limits of 3 send requests per minute per
  client IP and 5 codes per hour per email address; every send request consumes its token whatever the delivery
  outcome, so one request causes at most 3 provider calls.
- **S26** R2-duplicated-logging-rule (readability, SUGGESTION): a single logging rule in the ADR.
- **S27** R2-unexplained-native-review-reference (readability, SUGGESTION): explain the native-review reference in
  the ADR status.
- **S28** R2-unquantified-retry-and-alert-thresholds (readability, SUGGESTION): concrete retry count and backoff.
- **S29** R3-alert-threshold-undefined (reliability, SUGGESTION): a concrete alert threshold for repeated send
  failures.
- **S30** R3-test-obligations-unasserted (reliability, SUGGESTION): every ADR test obligation maps to a named
  assertion.
- **S31** R4-provider-retry-duplicate-delivery (resilience, SUGGESTION): retries avoid duplicate delivery where the
  provider supports idempotency.
- **S32** (L11) DTO validation runs under `pnpm dev` and `pnpm test`: the development and test runners emit decorator
  metadata, so the global `ValidationPipe` receives DTO types without workarounds.
- **S33** (L11) Biome accepts NestJS parameter decorators such as `@Body()`.
- **S34** (L11) The root `engines.node` floor is at least the integration's `>=22.22.1`.
- **S35** (L41) Visual theme «A · Rosa y vino» (version 3), approved as: "Queda como tema. Lo implemento en dos
  partes. Primero colores, tipografías, ornamentos y componentes, con /ingresar y /cuenta ya con el tema; T8d
  (administrador) se construye sobre eso. Después, la portada completa, revisando contigo los textos que hoy prometen
  cosas que no existen." Light backgrounds only, never dark. Tokens: background `#FFF7F5`, surface `#FFFFFF`, text
  `#3B1424`, primary wine `#8C1C3A` (buttons with white text), rose `#E9A3B5`, gold `#C29A54` (ornaments and
  hairlines, never small text), leaf `#8FAF8C` (botanicals only); derived muted text `#6B3A4C`, deep wine `#6E1530`,
  and pink tints `#FDEEF2` and `#F8D7E0`. Fonts: Cormorant Garamond (display), Great Vibes (script, names and accents
  only), and Jost (interface). Flowers and ornaments are fine-line botanical engraving in wine and gold ("Flores de
  línea fina, sin IA"). Motion respects `prefers-reduced-motion`. Text meets WCAG AA (4.5:1), and component borders
  reach 3:1.
- **S36** (L42) Administrator pages, approved as: "Ingreso en /admin/ingresar (correo y contraseña, luego el código
  de la app o uno de respaldo), activación en /admin/activar (código QR, confirmación con el primer código y códigos
  de respaldo mostrados una sola vez) y un panel mínimo en /admin con tu cuenta y «Cerrar sesión». Mismo trato de tú
  que los clientes. Ninguna página pública enlaza a /admin; el aviso para administradores en /cuenta sí lleva al
  panel." The QR code is drawn in the browser with `lean-qr` (an approved new dependency, L42) from the enrollment
  response the browser already holds; the TOTP secret and the backup codes never reach a third-party service, a log,
  or storage outside the API.
- **S37** (L45) The landing is an honest pre-launch page, approved as: "Todo el diseño de la maqueta, con «Diseños de
  muestra» y «Próximamente» en el catálogo, secciones de «Así funcionará» y solo «Ingresar» como acción activa. Sin
  «hecha a mano» ni WhatsApp. Cada sección se activa cuando su función exista." No copy claims a feature that does not
  exist yet (catalog, personalization, sharing, attendance confirmation, countdown, location), and every product
  action except «Ingresar» is labeled «Próximamente».
- **S38** (L47) Testing approach, approved as: "El CI levanta PostgreSQL y corre las pruebas contra la base real.
  Completo las pruebas que exige el ADR, cada una con nombre. Sumo pruebas en navegador real con @playwright/test
  (dependencia de desarrollo nueva; el CI descarga Chromium y tarda unos minutos más) para el ingreso de clientes, la
  cuenta, el ingreso de administradores y la activación del segundo factor." PostgreSQL runs as a CI service and the
  database suites run there on every pull request and every push to `master` or `main` (L48). Browser tests use `@playwright/test`, an approved development dependency,
  and drive the real web and API against PostgreSQL. No test path may weaken production behavior: emailed codes and
  TOTP secrets reach a test only through the test harness's own composition, never through a production endpoint,
  flag, or log.
- **S39** (L48) Fix of T9a-D1, approved as: "Al crear la sesión de la primera confirmación, verifico que la sesión
  pendiente siga existiendo. Si una reemisión ganó la carrera, revierto la inscripción y rechazo sin sesión ni
  cookie. Sin migración ni dependencias. Residual: si el proceso cae justo entre ambos pasos, la cuenta queda bloqueada
  (falla cerrada) y solo la recuperación manual de T10 la libera." A first TOTP confirmation that loses the race to an
  `admin:create` reissue or to `user:disable` answers an error, stores no session, sets no cookie, and leaves
  `twoFactorEnabled` false, so the reissued password can still enroll. An enrolled administrator's sign-in challenge
  is unaffected. The compensation logs one structured event without personal data.
- **S40** (L49) Hardening of the first TOTP confirmation, approved as: "Las 4 piezas: confirmación vieja rechazada,
  doble envío sin reversión, fallo de compensación registrado y cierre de las demás sesiones al inscribirse. Worker
  implementa con pruebas de carrera en PostgreSQL, revisión nativa y luego te pido commit." A sign-in challenge is
  told apart from a first confirmation by whether the endpoint resolved a session, not by the `TwoFactor` row. A
  superseded first confirmation is refused without reverting when another confirmation already completed or is
  completing, and reverted when a reissue, a disable, or a sign-out removed its pending session. A newer session
  does not prove that a confirmation is completing, because a second tab may have signed in with the password
  alone, so that refusal first ends every session of the administrator (native review correction). A failed revert is
  logged with the error class only and still refused. A successful first confirmation ends every other session of
  the administrator, so no session opened with the password alone keeps authority after enrollment. No migration.
- **S41** (L51) Manual enrollment key, approved as: "Agrego bajo el QR la clave para escribirla a mano en la app (por
  ejemplo, «¿No puedes escanear? Escribe esta clave»). Resuelve el caso del teléfono, la prueba la lee como lo haría
  una persona y S38 queda intacta. Cambia la página y su texto: unas 60 a 100 líneas más en la parte B, con su
  revisión." Below the QR code, `/admin/activar` shows the TOTP secret as text the administrator can type into an
  authenticator app, and the T9b browser tests read the secret from that text.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Spike: Better Auth through `@thallesp/nestjs-better-auth` on NestJS 12 with the body parser disabled; prove the auth handler, JSON parsing, and the global `ValidationPipe`; decide integration or fallback. | S4, S13 | worker | `ebabb0d` |
| T1b | Tooling: a dev and test runner that emits decorator metadata, Biome parameter decorators, and the Node engines floor; remove the spike test's workarounds and clarify its intent. | S32, S33, S34 | worker | `71ae169` |
| T2 | Schema: map Better Auth's user onto `User`; add session, account, verification, and two-factor models and a server-side role; one additive migration; database gate; human migration review. | S2, S5, S13 | worker | `cb07c29` |
| T3 | Configuration and origins: validate the auth secret, public base URL, and trusted origins at startup; credentialed CORS only for trusted origins, shared with Better Auth. | S8, S12 | worker | `4cfdb26` |
| T4 | Email port: application port, in-memory test adapter, Resend adapter, local mail catcher; bounded retries and failure handling. | S11, S23, S28, S29, S31 | worker | `01f44f5`, `f6cc504`, slice 6 (L22) |
| T5a | Sign-in code flow: customer email OTP with the S15 values, background delivery with a uniform response, invalidation of an undelivered code, no codes for administrators, client profile fields ignored at sign-up; amend ADR 0004 decision 8. | S6, S15, S23, S24 | worker | `8ab8dcc` (#8) |
| T5b | Abuse limits: persistent rate limits in every environment, the per-email cap, the trusted client IP header, and a rate-limit store that fails closed; plus the T5a review findings routed here in L24. | S10, S19, S25 | worker | `3dfb6f6` (#9) |
| T5c | Abuse-limit hardening: refuse background work once the shutdown drain starts, a fixed per-email quota window, quota storage errors surfaced instead of masked, and one pending-task bound (L25). | S23, S25 | worker | `83997bb` (#10) |
| T6a | Access control: deny-by-default guard with explicit public routes that never read the session, a server-side administrator role check, the `DISABLED` sign-in block on every path, session revocation on disable through a server-side command, and no email-code session for administrators (L26). | S1, S2, S9, S18 | worker | `3af25ea` (#11), `8d9beec` (#12) |
| T6b | Own profile: read and update the signed-in user's own profile as the first owned resource, with validated, bounded fields (L26); refuse unsupported route markers at startup instead of per request (L27); refuse a session on Better Auth's own endpoints unless its stored user is `ACTIVE`, and route profile updates through the validated endpoint instead of Better Auth's `/update-user` (L28). | S1, S2, S9, S18 | worker | `81207e8` (#13), `8490cd5` (#14) |
| T7 | Administrator: server-side creation command, password sign-in for administrators only, mandatory TOTP enrollment gate, backup codes, and enumeration-safe rejection of email OTP; initial password and enrollment window per S20 (L30). | S6, S20, S21, S22 | worker | `8880096` (#15), `b4bb01f` (#16) |
| T8a | Session settings: customer sessions of 7 days refreshed at most once a day, administrator sessions of 12 hours without refresh, and a host-only session cookie served through the web origin (`__Host-` prefix in production), with Better Auth's base URL set to the public web origin; ADR 0004 decision 4 states the mechanism, cookie name, `Domain`, and lifetimes (L33, L34). | S7, S14, S16 | worker | `41f6d06` (#17) |
| T8b | Web proxy and server-side API client: the web forwards `/api/auth` to the API with the client IP and passes cookies through without storing them, and its server calls the API with the session cookie; server-only API configuration in `apps/web`; the API trusts the client IP only from the web hop, proven by a shared web-to-API secret that the API requires on every authentication request in production (L33, L36). | S1, S7, S14 | worker | `e41a42a` (#18), `6c66236` (#19) |
| T8c | Customer pages in Spanish product copy addressed with tú (L39): sign-in by email code at `/ingresar`, the own profile at `/cuenta`, and sign-out, all through the web server; the pages extend the session cookie through the proxy before every session read (L34, L37, L40), and the web settings are validated at startup (L38). | S1, S6 | worker | `5ecd5f6` (#20) |
| T8t | Visual theme foundations (L41): the S35 tokens and fonts in `apps/web` (Tailwind theme and `next/font`), fine-line ornaments as static SVG assets, the shared components in `app/_components`, `/ingresar` and `/cuenta` restyled with unchanged copy and behavior, the current landing moved onto the tokens without new sections, a contrast test over the token pairs, and `docs/design/theme.md`. | S35 | worker | `0de8136` (#21) |
| T8d | Administrator pages in Spanish product copy addressed with tú, on the S35 theme (L42): password sign-in with the TOTP or backup-code challenge at `/admin/ingresar`, enrollment with a QR code (`lean-qr`) and backup codes shown once at `/admin/activar`, a minimal panel with sign-out at `/admin`, and the T8c sign-out and account-logging findings (L40). | S6, S21, S35, S36 | worker | `219ec1d` (#22), `efc54cd` (#23) |
| T8l | Themed landing page (L41, L45): the approved concept's sections and the draw-on bouquet in `apps/web/app/page.tsx`, as an honest pre-launch page (S37). | S35, S37 | worker | `26e3e4a` (#24) |
| T9a | Integration tests on real PostgreSQL in CI (L47): a PostgreSQL service in the CI workflow runs the migrations and `test:db` on every push, and every ADR 0004 test obligation and S17 case maps to a named assertion (S13, S30), together with the database-bound findings routed to T9 in L35 to L44. | S2, S13, S17, S30, S38 | worker | `b47cfe1` (#25) |
| T7c | Fail closed when the first TOTP confirmation races an `admin:create` reissue (T9a-D1, L48): in the session-create hook, a first confirmation whose pending session is gone reverts `twoFactorEnabled` and refuses without a session or cookie; the T9a `todo` test becomes a required test, together with the re-enable and `user:disable` variants and an unaffected sign-in challenge. | S6, S21, S39 | worker | `3e8620b` (#26) |
| T7d | Harden the first TOTP confirmation (L49, S40): tell the sign-in challenge apart by the session the endpoint resolved, refuse a superseded confirmation without reverting when another confirmation completed or is completing, log a failed revert, and end every other session of the administrator at a successful first confirmation; race tests on PostgreSQL. | S6, S21, S39, S40 | worker | `68a3a07` (#27) |
| T9b | Browser end-to-end tests with `@playwright/test` (L47) against the real web, API, and PostgreSQL in CI, in three slices (L50). Part A (slice 27): the harness inside `apps/web` (no new workspace) with PostgreSQL and Mailpit, a CI job, and the customer flows (sign-in by emailed code, the account, and sign-out), with R3-proxy-composition-unproved and R3-session-api-cookie-roundtrip-still-unproved. Part B (slice 28): the manual enrollment key (S41, L51), authenticator enrollment, administrator sign-in with the second factor or a backup code, the panel, and sign-out, with the L43 and L44 findings. Part C (slice 29): the other routed findings: the L38 findings, R4-cuenta-outage-latency-serialized, R3-counted-range-shared-by-three-suites, and R3-tampered-cookie-case-vacuous. | S2, S38, S41 | worker | — |
| T10 | Documentation: ADR wording fixes, architecture, database, and quality-gate docs, environment examples, and the administrator recovery procedure. | S13, S21, S26, S27 | inline | — |
| T11 | Security evidence: independent verification of every spec, and human sign-off of secret handling, session expiry, and error mapping. | S2 | verify | — |

## Log

- **L1** (2026-11-03) User, verbatim, answering "¿Arrancamos con el plan del M2?", which proposed a task document with
  the Milestone 2 requirements including the 18 review findings, a dedicated branch with small commits, and a short
  spike as the first unit: "si"
- **L2** User, verbatim, answering "¿Vamos con Better Auth y login por código al email?": "si dale"
- **L3** User, verbatim: "de las decisiones abiertas que proveedor me recomiendas, lo mismo para el hosting y segundo
  factor de que?"; then "si" to recording Resend, Railway, and an administrator password with a mandatory
  authenticator app in ADR 0004.
- **L4** User "si" to accepting, committing, and pushing ADR 0004 (`ae46d99`), and "si" to its amendment for
  administrator enrollment and email failure handling (`ef1df0a`).
- **L5** Evidence (2026-11-03, npm registry and Better Auth documentation): `better-auth` 1.7.16;
  `@thallesp/nestjs-better-auth` 2.8.0 declares NestJS `^11.1.6 || ^12.0.0` and Express `^5.1.0`; the NestJS
  integration requires `bodyParser: false`; two-factor enforcement covers only credential sign-in endpoints, not
  `/sign-in/email-otp`; `allowPasswordless` enables 2FA management without a password.
- **L6** Planning defaults, reversible: the user's own profile is the first owned resource; local development sends
  mail to a local mail catcher; tests use an in-memory email adapter.
- **L7** Open, not blocking: the domain name (`.mx` or `.com`).
- **L8** (2026-11-03) User, verbatim, answering "¿Apruebas el plan y arranco con T1, la prueba técnica?": "dale". No
  standing commit permission was granted; ask before each commit.
- **L9** (2026-11-03) T1 evidence: GO for ADR 0004 decision 1. `better-auth` 1.7.16 and
  `@thallesp/nestjs-better-auth` 2.8.0 are pinned with no peer warnings; its GraphQL, WebSockets, and `qs` peers are
  optional and lazily imported. With NestJS's body parser disabled, `GET /api/auth/ok` returns 200 `{"ok":true}`,
  valid JSON is accepted, an invalid body gets 400 from the global `ValidationPipe`, and helmet headers stay. The
  integration registers a global guard by default: undecorated routes return 401, `@AllowAnonymous()` makes a route
  public, and the guard runs before validation and calls `getSession` on every request. With an array of trusted
  origins it also enables its own CORS unless `disableTrustedOriginsCors: true` is set. Both packages are ESM-only
  and load through Node's `require(esm)`; the integration declares Node `>=22.22.1`. A control run with NestJS's body
  parser left on also passed.
- **L10** Open decisions raised by T1 (repository-wide, not caused by T1): `tsx` emits no decorator metadata, so the
  global `ValidationPipe` skips DTO validation under `pnpm dev` and `pnpm test` while the `tsc` build is unaffected;
  Biome rejects parameter decorators such as `@Body()` unless `unsafeParameterDecoratorsEnabled` is set; and the root
  `engines.node` floor (`>=22.0.0`) is below the integration's `>=22.22.1`.
- **L11** (2026-11-03) User, verbatim, answering "¿Commiteo T1 y sigo con esas tres correcciones como la próxima
  unidad, antes de T2?": "si". T1 committed as `ebabb0d`.
- **L12** T1 native review (`review-c7ff91fc7592f205`) advisory findings and their owners:
  R2-shared-boundary-omits-body-parser (WARNING) goes to T3; R3-test-glob-engine-floor (WARNING) goes to T1b (S34);
  R3-guard-positive-path-unproved goes to T6 and T9; R2-spike-suite-made-permanent,
  R2-body-passthrough-probe-intent-implicit, and R2-test-baseurl-differs-from-served-origin go to T1b;
  R2-task-status-stale-on-commit is fixed by this update.
- **L13** T1b evidence: the API `dev` and `test` scripts run through `@swc-node/register` 1.12.1 with `@swc/core`
  1.16.21, which map `emitDecoratorMetadata` from `apps/api/tsconfig.json`; `tsx` remains only for the Prisma scripts.
  RED: under `tsx`, the new metadata test and both 400 tests failed (3 of 11). GREEN: 11 of 11 pass under SWC, with
  real `@Body()` decorators and no manual metadata. The dev script booted with inline environment variables and
  served `GET /health` (503 without a database). Biome enables `unsafeParameterDecoratorsEnabled`; the root
  `engines.node` floor is `>=22.22.1 <27`.
- **L14** (2026-11-03) User, verbatim, answering "¿Commiteo T1b?": "si". T1b committed as `71ae169`, closing slice 1
  at 407 authored lines; the chain strategy will be asked before the T2 commit.
- **L15** T2 evidence: migration `20261104030448_add_better_auth_identity` is additive: the `UserRole` enum; `User`
  gains `emailVerified`, `image`, `role` (default `CUSTOMER`), and `twoFactorEnabled`, all with defaults or nullable;
  new `Session`, `Account`, `Verification`, `TwoFactor`, and `RateLimit` tables, with cascading foreign keys from
  `User`. Better Auth's `name` maps onto `displayName`; ids stay UUIDs (`generateId: "uuid"`); the role is not
  accepted as input. The shapes come from Better Auth 1.7.16's own `getAuthTables()`. On a disposable PostgreSQL 17
  the migration applied, the seed ran twice, and `test:db` passed 3 of 3 (email OTP creates a verified customer and
  a session, consumes the verification row, persists rate-limit rows, and ignores a client-supplied role); RED before
  the migration was 3 of 3 failing. `*.db-spec.ts` files are excluded from `pnpm test`, CI, and the build.
- **L16** T2 follow-ups for later tasks: T3 owns real trusted origins and the base URL; T5 maps rate-limit storage
  failures, configures the trusted client IP header (otherwise all clients share one bucket), and bounds or strips
  client `name` and `image`; T6 enforces `role` and `status`, since cascades apply only to hard deletes; T7 relies on
  the unique `(providerId, accountId)` and one `TwoFactor` row per user.
- **L17** (2026-11-03) User, verbatim, answering "¿Apruebas la migración y la cadena con tracker, y commiteo T2?":
  "si". T2 committed as `cb07c29`. The branches were rebuilt locally with no commit lost: the tracker
  `feat/m2-identity` points at `master` (`ef1df0a`), and the slice branches carry the commits. T2 native review
  (`review-b5707b23df8564c4`) findings and their owners: `TwoFactor.verified` defaulting to true and the unexercised
  `Account` and `TwoFactor` tables go to T7; the role-input test that could pass without `input: false` goes to T5
  and T6; the database test's order coupling, cleanup outside `finally`, identifier substring match, `updatedAt`
  default, and random client IP collisions go to T9.
- **L18** T3 evidence: startup validation requires `BETTER_AUTH_SECRET` (at least 32 characters, never echoed) and
  `AUTH_BASE_URL` (an http(s) origin), parses `CORS_ORIGIN` as a comma-separated trusted-origins list (a single
  origin still works), and rejects empty entries, wildcards, and `BETTER_AUTH_TRUSTED_ORIGINS`. One `createApp`
  boundary owns `bodyParser: false`, credentialed CORS for the trusted list only (`GET`, `HEAD`, `POST`, `OPTIONS`),
  and the integration registers through `forRootAsync` with `disableTrustedOriginsCors: true` and Better Auth's
  origin check pinned on. `/health` is `@AllowAnonymous()`. Tests: 42 of 42 pass, covering untrusted preflights
  without CORS headers, `POST /api/auth/sign-out` returning 403 `INVALID_ORIGIN` for an untrusted origin and 200
  for a trusted one, `/health` returning 503 rather than 401 without a session, and `/api/auth/ok` returning 200.
  The dev boot smoke test passed. The safety policy blocked `apps/api/.env.example`, so the new variables are
  documented in the README and must be added to the example and local env files by hand. Size: about 747 changed
  lines (415 of them tests); the only cohesive split needs intermediate module and test states, so the slice is
  proposed as `size:exception`.
- **L19** (2026-11-04) User, verbatim, answering "¿Commiteo T3 como un solo slice con `size:exception`?": "listo ya
  agrege a los env, si comitea". T3 committed as `4cfdb26`; the user added the new variables to `apps/api/.env` and
  `apps/api/.env.example` (the example keeps `BETTER_AUTH_SECRET` empty).
- **L20** T3 native review (`review-71c31853c0109064`) findings and their owners: the integration guard reading the
  session before honoring `@AllowAnonymous()`, so `/health` can return 500 when the database is down and a cookie is
  present, goes to T6; the unproved origin-check pin and the untested runtime configuration branch go to T9; the
  unexplained and unexercised user mapping goes to T5 and T10; Better Auth implicitly trusting the `baseURL` origin
  goes to T8 and T10; duplicated test helpers go to T9.
- **L21** (2026-11-04) User, verbatim, answering "¿Pusheo la cadena y abro los 4 PRs?": "dale". The tracker received
  the empty marker commit `7d9e3b9`; the four branches were pushed without force and pull requests #1 (draft tracker
  to `master`), #2, #3, and #4 were opened with Chain Context sections.
- **L22** (2026-11-04) User, verbatim, answering "¿Lo commiteo así y publico los 3 slices como PRs encadenados (#5 a
  #7)?": "si". T4 lands as three chained slices, each with `size:exception` because about half of every slice is the
  tests of its own code: slice 4 `01f44f5` (port, delivery policy, in-memory adapter; 550 lines), slice 5 `f6cc504`
  (Resend and Mailpit adapters; 560 lines), and slice 6 (configuration, `EmailModule`, the delivery runtime, Compose
  Mailpit, docs, and this record). Each slice passed the gates in isolation and was assessed medium with no native
  review due. Isolation exposed a flaky adapter test (a 100 ms client timeout on success paths), which slice 5 fixes.
  Resend's 409 `concurrent_idempotent_requests` is treated as transient. S23 is covered only for retries reusing the
  same code; what happens to a code whose email failed, and how it counts against attempts, goes to T5, together with
  S24 (permanent failures return faster than transient ones, so timing must not reveal anything about the address)
  and S25 (whether a failed send consumes a rate-limit token, since each request can make three provider calls).
  Known limits: the degraded-alert counter is per process, and `Retry-After` is not honored.
- **L23** (2026-11-04) User, verbatim, answering "¿Apruebas el envío en segundo plano? Eso implica enmendar la
  decisión 8 del ADR 0004, y lo haría como parte de T5.": "si, pero mergeea todos los pr". Asked whether that
  included the tracker, the user chose "Dejar #1 hasta T11". Pull requests #2 to #7 were merged into the tracker with
  merge commits after each diff was checked against it; the tracker tree equals slice 6, its CI passed, and #1 stays
  a draft until T11. Evidence behind the decision: Better Auth 1.7.16 writes the Verification row before calling
  `sendVerificationOTP`, logs and swallows a send error, and still returns 200, so the generic retryable error of
  ADR 0004 decision 8 cannot surface without rewriting the response, and an awaited send leaks timing. The approved
  design is the recommendation recorded in S15, S23, S24, and S25; the value of 5 codes per hour per email is the
  orchestrator's choice within that design. T5 is split into T5a (sign-in code flow) and T5b (abuse limits).
- **L24** (2026-11-04) User, choosing an option for "¿Commiteo T5a, abro su PR contra el tracker y lo mergeo cuando
  pase la CI?": "Sí: commit, PR y merge". T5a was committed as `8ab8dcc` after its native review
  (`review-f9cdea2a75a0e3d1`, high tier, four lenses) was approved and acknowledged; PR #8 passed CI and was merged
  into the tracker, whose tree equals slice 7, and CI on #1 passed. The worker ignored a client-supplied name and image
  at sign-up (the profile comes from T6) and discards codes of other OTP types without sending. Advisory findings: T5b
  owns R1-unthrottled-unauthenticated-email-send, R4-unbounded-background-delivery, R3-shutdown-drain-ordering,
  R3-undelivered-code-on-lookup-failure, and R4-silent-fail-closed-without-context; T6 and T7 own
  R1-admin-otp-not-rejected-at-sign-in; T9 owns R3-db-spec-unbounded-wait and R3-runinline-untested; T10 owns
  R2-auth-return-type-erases-plugin-api, R2-duplicated-s15-literals-in-comment,
  R2-store-format-doc-attached-to-one-function, and R2-validity-minutes-implicit-constraint;
  R2-t5a-brief-says-bounded-code-discards is fixed in the T5a row. Orchestrator's choices for T5b within the approved
  design: a request over the per-email cap still gets the identical 200, but no code is sent and the issued code is
  discarded (S24); production requires an explicitly configured client IP header, and a production request whose client
  IP cannot be resolved is rejected with the generic error instead of sharing one global bucket.
- **L25** (2026-11-04) User, choosing an option for "¿Commiteo T5b, abro su PR contra el tracker y lo mergeo cuando
  pase la CI?": "Sí: commit, PR y merge"; the chosen option named T5c as the next step. T5b was committed as
  `3dfb6f6` after its native review (`review-29f61ae3c37f49da`, high tier, four lenses) was approved and acknowledged;
  PR #9 passed CI and was merged into the tracker, whose tree equals slice 8, and CI on #1 passed. The worker found that
  Nest runs this module's `onModuleDestroy` before Prisma disconnects, so the drain moved there, and that Better Auth
  prunes rate-limit rows older than its longest known window, so a never-matching retention rule keeps the hourly
  per-email rows. Advisory findings: R1-001 (anyone can spend an address's 5 codes and block its sign-in codes for an
  hour) needs a human decision before T11; T5c owns R3-drain-before-http-close and R4-shutdown-drain-before-http-close
  (work scheduled after the drain, before the HTTP server closes), R3-email-quota-window-extends-on-every-counted-code,
  R3-quota-create-errors-masked, and R2-duplicated-pending-task-bound; T9 owns R3-guard-not-proved-through-nest-mount,
  R3-db-spec-client-ip-collisions, R2-misleading-test-ip-range-comment, and R2-hardcoded-quota-in-assertions; T10 owns
  R2-doc-every-request-counts and R2-duplicated-error-class-and-safe-log.
- **L26** (2026-11-04) User, choosing an option for "¿Commiteo T5c, abro su PR contra el tracker y lo mergeo cuando
  pase la CI?": "Sí: commit, PR y merge", declining the standing-permission option, so every later slice is asked
  again. T5c was committed as `83997bb` after its native review (`review-ab643d956ae3c33c`, high tier, four lenses)
  was approved and acknowledged; `test:db` passed 8 of 8 on a throwaway PostgreSQL 17; PR #10 passed CI and was merged
  into the tracker, whose tree equals slice 9, and CI on #1 passed. Advisory findings: T9 owns
  R3-retention-proof-depends-on-unasserted-prune, R3-shutdown-warn-level-untested, and
  R3-create-error-masked-by-lookup-error; T10 owns R2-rejected-after-shutdown-name-vs-timing and
  R2-test-duplicates-quota-key-prefix. Orchestrator's routing: T6 is split into T6a (access control, which also owns
  the `/health` session-read finding of L20, the positive-path guard proof of L12, role and status enforcement of L17,
  `DISABLED` users still receiving codes from L24, and R1-admin-otp-not-rejected-at-sign-in) and T6b (own profile);
  with no admin interface in Milestone 2, disabling a user is a server-side command, like administrator creation in T7.
- **L27** (2026-11-04) User, choosing an option for "Slice A de T6a (control de acceso) pasó los chequeos y la
  revisión nativa. ¿Hago commit, abro su PR contra el tracker y lo mergeo cuando pase la CI? El slice B (comando
  user:disable) todavía tiene que pasar su propia revisión.": "Sí: A y B", so slice B is committed, published, and
  merged after its own native review and CI without asking again, unless that review requires a correction. The T6a
  worker stopped once on a usage limit and was resumed with its context. T6a is split in two cohesive slices: slice
  10 (`3af25ea`, PR #11) holds access control and passed the gates in isolation (155 of 155 tests, `test:db` 8 of 8)
  and its native review (`review-225cb68e85dfcdb9`, high tier, four lenses, approved and acknowledged); slice 11
  holds the `user:disable` command. Evidence the worker found: the integration's guard reads the session before it
  checks `@AllowAnonymous()`, which caused the L20 500, so it is disabled and replaced by a project-owned guard;
  Better Auth enables its session cookie cache by default only without a database, and it is pinned off anyway.
  Advisory findings of slice 10: slice 11 mitigates R3-disabled-session-live-on-auth-endpoints (Better Auth's own
  endpoints accept an existing session of a user set to `DISABLED`; the command deletes those sessions in the same
  transaction); T6b owns the startup check that R4-unsupported-marker-detected-only-per-request,
  R2-misdecorated-route-detected-only-at-request-time, and R3-integration-marker-detected-only-per-request ask for;
  T9 owns R3-session-hook-proved-only-on-memory-adapter (slice 11 adds the first PostgreSQL proof) and
  R3-forged-session-data-assertion-does-not-prove-cache-off; T10 owns R2-email-otp-prefix-match-unexplained,
  R2-may-receive-sign-in-code-doc-omits-unknown-address, R2-session-hook-context-fallback-undocumented,
  R2-session-refusal-restates-code-eligibility-rule, and R2-unsupported-integration-keys-copied-from-library-internals;
  T11 owns R1-001 (risk, `access-control.ts:86-88`) for the human security review. The parent checked that
  `isActive` fails closed: only the exact stored status `ACTIVE` passes.
- **L28** (2026-11-04) Slice 11 (`8d9beec`, PR #12) passed the gates in isolation (162 of 162 tests, `test:db` 12 of
  12, and a manual run of `user:disable` that exited 0, 0, 1, and 2 and never printed the address). Its native review
  (`review-2bc7b1fbbbf84d35`, four lenses) ran although the native assessment rated the slice medium with no review
  due, because the user's approval in L27 was conditioned on it and the slice deletes stored sessions; it approved
  with 11 advisory findings. PRs #11 and #12 passed CI and were merged into the tracker, whose tree equals slice 11,
  and CI on #1 passed. Routing: T6b owns R1-concurrent-sign-in-session-survives-disable,
  R3-concurrent-sign-in-session-survives-disable, and R4-001 (a sign-in that runs while the command commits can leave
  one session, which Better Auth's own endpoints still accept) together with R3-disabled-session-live-on-auth-endpoints
  from L27: every Better Auth endpoint that uses a session refuses it unless the stored user is `ACTIVE`, so a
  surviving session is useless everywhere. T6b also routes profile updates through its validated endpoint and disables
  Better Auth's `/update-user` (`disabledPaths`, `better-auth/dist/api/index.mjs:168-170`), which closes the unbounded
  `name` and `image` updates of L16. T9 owns R3-command-contract-untested, R3-command-unhandled-rejection-path, and
  R4-002; T10 owns R2-already-disabled-derived-from-not-active, R2-client-prefix-range-unexplained,
  R2-failure-event-name-outside-event-constant, R3-non-active-status-reported-as-already-disabled, and R4-003.
- **L29** (2026-11-04) User, choosing an option for "El slice A de T6b pasó los chequeos y la revisión nativa. Con
  este slice, la sesión de un usuario DISABLED deja de servir también en los endpoints de Better Auth, se
  deshabilitan 18 rutas que modifican usuarios o contraseñas, y la API no arranca si una ruta usa decoradores de la
  integración. ¿Hago commit, PR y merge cuando pase la CI? El slice B (perfil propio: GET y PATCH /me) todavía tiene
  que pasar su revisión.": "Sí: A y B". The T6b worker built all of T6b, then restructured it at the parent's request
  into two slices separable by whole files. Slice 12 (`81207e8`, PR #13) holds the session and route hardening: it
  passed the gates in isolation (182 of 182 tests, `test:db` 14 of 14) and its native review
  (`review-596a78b1e4de2c5b`, high tier, four lenses), which approved with 9 advisory findings and none from the risk
  lens. Its branch was renamed from `feat/m2-identity-12-own-profile` to `feat/m2-identity-12-session-status` before
  the push, because it holds the hardening; slice 13 holds the own profile. Beyond the brief but within its point 2,
  the worker also disabled the email-code password reset, because it creates a credential account and would give a
  customer a password. Routing: T9 owns R3-disabled-path-variants-unproved and R3-per-request-500-no-longer-asserted;
  T9 and T11 own R3-inactive-refusal-depends-on-delete-success (the request fails closed when the delete throws),
  R4-hook-doubles-session-reads, and R4-refused-session-deletion-unlogged; T10 owns
  R2-session-endpoint-inventory-duplicated, R2-db-spec-client-prefix-unexplained, R2-guard-targets-recomputed, and
  R2-guard-test-name-misattributes-deletion. Notes for later tasks: T7 keeps the email-code reset and
  `/reset-password` disabled, enables password sign-in for administrators only with sign-up disabled, and re-enables
  `/change-password` only if administrators may change their own password; in T8 a browser cannot call `PATCH /me`
  directly because CORS allows `GET`, `HEAD`, `POST`, and `OPTIONS`, so the web server calls it; T11 decides whether
  display names may contain invisible format characters such as bidirectional overrides.
- **L30** (2026-11-04) Slice 13 (`8490cd5`, PR #14) passed the gates in isolation (215 of 215 tests, `test:db` 19 of
  19) and its native review (`review-a82a203257448d51`, high tier, four lenses), which approved with 8 advisory
  findings. PRs #13 and #14 passed CI and were merged into the tracker, whose tree equals slice 13, and CI on #1
  passed. Routing: T9 and T11 own R4-profile-write-not-conditioned-on-active-status (a name change can land between the
  guard and the write if the account is disabled at that moment), R3-missing-user-to-401-path-untested,
  R3-null-display-name-new-auth-state-unproved, and R3-use-case-revalidation-unproved; T11 owns R1-001 (invisible format
  characters in display names, `display-name.ts:5`); T10 owns R2-display-name-limit-hardcoded-in-error,
  R2-memory-repository-duplicates-empty-name-mapping, and R2-own-profile-db-spec-client-prefix-unexplained. User,
  choosing an option for "T7 (administradores): ¿cómo se fija la contraseña inicial de un admin y cuánto tiempo tiene
  para enrolar su app autenticadora (TOTP) antes de que esa contraseña deje de servir?": "Generada por el comando, 24
  horas (recomendado)", whose description reads: "El comando genera una contraseña aleatoria de 24 caracteres y la
  muestra una sola vez en la terminal, nunca en logs. Si el admin no enrola el TOTP en 24 horas, la contraseña deja de
  servir y hay que reemitirla con el mismo comando. En M2 no hay cambio de contraseña por API: se reemite con el
  comando." This decides S20.
- **L31** (2026-11-05) The previous session split T7 into two slices separable by whole files, except for 7 lines of
  the architecture overview (backup ref `refs/backup/t7-full`), and stopped before checking them. User, choosing an
  option for "El slice A de T7 pasó los chequeos aislados (266/266 tests, test:db 22/22, estrés 5/5) y la revisión
  nativa (alto riesgo, 4 lentes, aprobada; 9 hallazgos no bloqueantes que registro en el slice B). Con este slice, los
  administradores entran con contraseña y una app autenticadora (TOTP) obligatoria. Un admin sin enrolar solo puede
  ver su sesión, enrolar el TOTP y cerrar sesión, y su contraseña inicial deja de servir a las 24 horas. ¿Hago
  commit, abro el PR contra el tracker (con size:exception, porque unas 1260 de las 1742 líneas son tests) y lo
  mergeo cuando pase la CI? El slice B (comando admin:create) todavía tiene que pasar su propia revisión.": "Sí: A y
  B", whose description reads: "Commit, PR y merge de A. Después preparo B (restaurar, chequeos, test:db, revisión
  nativa) y, si su revisión aprueba sin corrección, también hago su commit, PR y merge sin volver a preguntar." Slice
  14 (`8880096`, PR #15) holds administrator password sign-in, the TOTP enrollment gate and its 24-hour window, backup
  codes, and the password and second-factor limits. It passed the gates in isolation (266 of 266 tests, `test:db` 22
  of 22, 5 of 5 parallel runs) and its native review (`review-f7d52ae1fe049c79`, high tier, four lenses), which
  approved with 9 advisory findings and none from the risk lens. PR #15 passed CI and was merged into the tracker,
  whose tree equals slice 14, and CI on #1 passed. Slice 15 holds the `admin:create` command. Routing: T9 owns
  R2-duplicated-test-helpers-diverge, R3-future-issue-time-branch-unproved,
  R3-generate-backup-codes-enrolled-path-unproved, and R3-re-enable-replaces-secret-unproved; T9 and T11 own
  R4-expired-window-refusal-unobservable (no log line when an expired window deletes a session); T10 owns
  R2-hook-name-understates-behavior, R2-overview-claims-full-adr-implemented, R2-route-constants-live-in-abuse-limits,
  and R2-second-factor-limit-rationale-says-above-but-equal (the limit of 5 second-factor codes per minute equals,
  rather than exceeds, the 5 wrong codes one challenge allows). Parent's notes: Better Auth 1.7.16 refuses
  `/two-factor/enable` with `400 TOTP_ALREADY_ENABLED` once the `TwoFactor` row is verified
  (`plugins/two-factor/index.mjs:188`), so an enrolled administrator cannot replace the secret through it; T9 and T11
  own proving that a TOTP confirmation that runs while `admin:create` reissues a password fails closed, because the
  reissue deletes the `TwoFactor` row that the confirmation is about to mark verified.
- **L32** (2026-11-05) Slice 15 (`b4bb01f`, PR #16) holds the `admin:create` command. It passed the gates in isolation
  (279 of 279 tests, `test:db` 29 of 29, 5 of 5 parallel runs) and a manual run on a disposable PostgreSQL 17, which
  exited `2` without an address and with redirected output (no user stored), `0` on create and on reissue (a
  different password, a restarted window, one credential account), and `1` for an enrolled administrator; it never
  printed the address, and no plain password was stored. Its native review (`review-9d9f6d7b70171459`, four lenses)
  ran although the native assessment rated the slice medium with no review due, because the user's approval in L31
  named it; it approved with 8 advisory findings and none from the risk lens. PR #16 passed CI and was merged into
  the tracker, whose tree equals slice 15, and CI on #1 passed. Routing: T9 owns R3-command-contract-unproved and
  R3-concurrent-first-create-unproved; T9 and T11 own R3-disconnect-failure-bypasses-redaction; T10 owns
  R2-enrollment-window-hours-hard-coded, R2-refusal-reason-inferred-from-status-only, R2-exit-code-doc-omits-non-tty,
  R2-outcome-field-stutter, and R4-failure-log-drops-prisma-error-code.
- **L33** (2026-11-05) User, choosing an option for "T7 quedó cerrada: #15 y #16 están mergeados y la CI del tracker
  está en verde. Para T8 hay una decisión de seguridad pendiente. Hoy la cookie de sesión queda atada al host de la
  API, así que el servidor de la web (app.) nunca la recibe, y el ADR 0004 solo dice que debe quedar "scoped so both
  the browser and the web server can send it". ¿Cómo debe llegar la cookie al servidor de la web?": "Proxy por la
  web (recomendado)", whose description reads: "El navegador habla solo con `app.<dominio>`: la web reenvía
  `/api/auth` a la API y llama a la API desde su servidor con la cookie. La cookie vive solo en el host de la app (con
  prefijo `__Host-` en producción), así ningún otro subdominio la recibe, por ejemplo uno futuro para invitaciones
  públicas (S14). Costo: la web tiene que pasarle a la API la IP del cliente para los límites por IP." The other
  option was a cookie shared across subdomains through `Domain`. This decides the mechanism of ADR 0004 decision 4,
  S14, and the `Domain` of S16.
- **L34** (2026-11-05) User, choosing an option for "Segunda decisión de seguridad para T8: ¿cuánto dura una sesión?
  Hoy rige el valor por defecto de Better Auth: 7 días, renovados como máximo una vez al día mientras se usa la
  cuenta, y es el mismo para clientes y administradores. El roadmap exige que la expiración de sesión tenga
  aprobación humana, y S16 pide fijar la duración.": "Clientes 7 días, admins 12 horas (recomendado)", whose
  description reads: "Clientes: 7 días, renovados como máximo una vez al día mientras usan la cuenta.
  Administradores: 12 horas desde que entran, sin renovación; después piden de nuevo contraseña y código TOTP. Una
  sesión robada de admin sirve como mucho 12 horas. Costo: un poco más de código y tests, porque Better Auth tiene
  una sola duración global y la de admins la fija nuestro hook de sesión." The other option was 7 days for everyone.
  This decides the lifetimes of S16. Orchestrator's split: T8 becomes T8a (session settings in the API), T8b (web
  proxy and server-side API client), T8c (customer pages), and T8d (administrator pages), each a slice from the
  tracker. T8a must check how Better Auth 1.7.16 names a secure cookie, because it prepends `__Secure-` to every
  cookie name when cookies are secure.
- **L35** (2026-11-05) Slice 16 (`41f6d06`, PR #17) holds T8a. A worker implemented it; its startup rule that
  `AUTH_BASE_URL` must be one of the `CORS_ORIGIN` entries broke the `AUTH_BASE_URL` fixtures of four test files
  outside its edit surfaces, and the parent changed only those fixtures. It passed the gates in isolation (299 of 299
  tests, `test:db` 30 of 30, 5 of 5 parallel runs) and its native review (`review-fec4566c40a28b60`, high tier, four
  lenses), which approved with 8 advisory findings and none from the risk lens. User, choosing an option for "T8a
  (ajustes de sesión en la API) pasó los chequeos: 299/299 tests, test:db 30/30 y estrés 5/5. También pasó la
  revisión nativa (alto riesgo, 4 lentes), que lo aprobó con 8 hallazgos no bloqueantes, ninguno del lente de
  riesgo. El slice deja: sesiones de clientes de 7 días, renovadas a lo sumo una vez al día; sesiones de admin de 12
  horas, sin renovación; una cookie que vive solo en el host de la web (`__Host-better-auth.session_token` en
  producción, sin Domain); la exigencia de que AUTH_BASE_URL esté entre los orígenes de CORS_ORIGIN y use https en
  producción. Importante: después de esto, la API local no arranca hasta que cambies AUTH_BASE_URL a
  http://localhost:3000 en apps/api/.env y apps/api/.env.example. Yo no puedo editar archivos .env. ¿Hago el commit,
  abro el PR contra el tracker (con size:exception: 919 líneas, 650 de ellas tests) y lo mergeo cuando pase la CI?":
  "Sí: commit, PR y merge", whose description reads: "Commit de T8a en feat/m2-identity-16-session-settings, PR
  contra el tracker y merge cuando pase la CI. Después sigo con T8b (proxy de la web y cliente de la API del lado del
  servidor)." PR #17 passed CI and was merged into the tracker, whose tree equals slice 16, and CI on #1 passed. Local
  `apps/api/.env` and
  `apps/api/.env.example` need `AUTH_BASE_URL=http://localhost:3000`, a human edit. Routing: T9 owns
  R3-admin-cap-only-at-creation and R3-customer-refresh-via-guard-unproved (the parent read Better Auth 1.7.16:
  `getSession` stores the session on the request context before it refreshes, and the update hook receives that
  endpoint context, so a refresh through the project guard is expected to work); T9 and T11 own
  R4-silent-session-update-refusal; T10 owns R2-admin-expiry-silent-now-fallback,
  R2-update-hook-comment-overclaims-attribution, R2-auth-base-url-literal-not-tied-to-trusted-origin,
  R2-https-rule-duplicated, and R2-session-cookie-name-unused-export.
- **L36** (2026-11-05) User, choosing an option for "T8b (el proxy de la web) tiene una decisión de seguridad. La API
  limita los intentos de login por IP. Con el proxy, todas las peticiones le llegan desde el servidor de la web, así
  que la web le tiene que informar la IP real del cliente en un encabezado. Si alguien llamara a la API directamente,
  podría inventar ese encabezado y saltarse los límites por IP. ¿Cómo protegemos ese salto web → API?": "Secreto
  compartido web-API (recomendado)", whose description reads: "La web envía en cada petición a la API un secreto que
  solo conocen las dos (una variable de entorno de 32 caracteres o más en cada servicio). En producción la API
  rechaza cualquier petición de autenticación que no lo traiga, y solo entonces confía en la IP que informa la web.
  Protege aunque la API quede expuesta en internet por error. Costo: un secreto más para configurar y rotar." The
  other option was trusting the private network alone. This decides how T8b proves the web hop.
- **L37** (2026-11-05) The T8b worker built the API secret and the web proxy in separate files (about 2,300 changed
  lines), so the parent split them like T7: slice 17 holds the API side with interim README and overview text, and
  slice 18 the web side (backup ref `refs/backup/t8b-full`). The worker asked once about a fixture outside its edit
  surfaces, and the parent added the `AUTH_PROXY_SECRET` line to `email.module.spec.ts` itself. Slice 17 (`e41a42a`,
  PR #18) passed the gates in isolation (315 of 315 tests, `test:db` 32 of 32, 5 of 5 parallel runs) and its native
  review (`review-75a15f3271d1b6d3`, high tier, four lenses), which approved with 9 advisory findings and none from
  the risk lens. User, choosing an option for "Dividí T8b en dos slices. Slice A (17): el secreto web-API del lado
  de la API. Pasó los chequeos aislados: 315/315 tests, test:db 32/32 y estrés 5/5. Pasó la revisión nativa (alto
  riesgo, 4 lentes), que lo aprobó con 9 hallazgos no bloqueantes, ninguno del lente de riesgo. Con este slice, en
  producción la API rechaza con 403 cualquier petición a /api/auth que no traiga el secreto compartido, y solo
  confía en la IP que informa la web cuando el secreto es válido. Slice B (18): el proxy de /api/auth en la web y el
  cliente de la API del lado del servidor. Son unas 1.450 líneas, 806 de ellas tests, y todavía tiene que pasar su
  propia revisión. Para usar B en local vas a tener que agregar variables nuevas en apps/api/.env y
  apps/web/.env.local; te paso las líneas exactas. ¿Hago el commit de A, abro el PR contra el tracker (con
  size:exception: 840 líneas, 602 de ellas tests) y lo mergeo cuando pase la CI?": "Sí: A y B", whose description
  reads: "Commit, PR y merge de A. Después preparo B (restaurar, chequeos, test:db, revisión nativa) y, si su
  revisión aprueba sin corrección, también hago su commit, PR y merge sin volver a preguntar." PR #18 passed CI and
  was merged into the tracker, whose tree equals slice 17. Routing: T9 owns
  R3-registration-require-proxy-secret-unproved and R3-db-spec-client-prefix-collision; T10 owns
  R2-db-spec-client-prefix-uniqueness-overclaim, R2-proxy-header-doc-present-tense-for-planned-sender,
  R2-proxy-secret-min-length-borrows-auth-constant, and R2-without-proxy-headers-name-understates-condition; T10 and
  T11 own R2-require-proxy-secret-optional-fail-open (the `requireProxySecret` option of `createAuth` defaults to
  false) and R4-proxy-secret-rotation-hard-cutover (rotating the secret needs a simultaneous change in the web and
  the API; a rotation procedure or a second accepted secret is a T11 decision); slice 18 resolves
  R4-enforcement-ships-before-sender. Worker notes for T9 and T11: `/me` does not check the secret, and behind the
  proxy Better Auth's `Sec-Fetch` check falls back to its origin check.
- **L38** (2026-11-05) Slice 18 (`6c66236`, PR #19) holds the web proxy and the server-side API client. It passed the
  gates in isolation (web 37 of 37 and API 315 of 315 tests, `test:db` 32 of 32, 5 of 5 parallel runs of each suite)
  and its native review (`review-e4bf8d392e794ea8`, high tier, four lenses), which approved without correction with
  15 advisory findings and none from the risk lens; under L37 it was committed, published, and merged without asking
  again. PR #19 passed CI and was merged into the tracker, whose tree equals slice 18; CI on #1 passed after #18 and
  after #19. Routing: T8c owns R4-web-config-validated-only-on-first-request (validate the web settings at startup),
  R3-session-api-cookie-roundtrip-unproved, and R2-session-api-doc-says-request-bound-but-client-is-process-singleton;
  T9 owns R3-api-client-body-timeout-misclassified, R3-api-origin-rejects-equivalent-origins,
  R3-cookie-name-parse-without-equals, and R4-proxy-ignores-client-abort; T9 and T11 own
  R4-api-client-unavailable-drops-cause-and-logs-nothing and R4-api-client-body-timeout-misclassified; T10 owns
  R2-api-client-3xx-mapped-to-rejected-contradicts-kind-doc, R2-config-api-origin-check-misreports-normalized-origin-as-path,
  R2-api-client-generic-send-hardcodes-own-profile, R2-proxy-headers-module-holds-error-body, and
  R2-web-secret-min-length-duplicates-api-rule-without-link. R3-readme-copies-missing-web-env-example needs a human
  edit: `apps/web/.env.local.example` still lists only `NEXT_PUBLIC_API_URL`.
- **L39** (2026-11-05) User, choosing an option for "T8b quedó cerrada: #17, #18 y #19 están mergeados y el
  navegador ya habla solo con la web. Ahora sigue T8c, las páginas de cliente en español (entrar con un código por
  correo, ver y editar el perfil, cerrar sesión). Antes de escribir el texto necesito una decisión de producto:
  ¿cómo se dirige InvitaMe a sus clientes?": "Tú (recomendado)", whose description reads: "Cercano y habitual en
  apps de consumo en México: «Ingresa tu correo y te enviamos un código de 6 dígitos». Las páginas quedarían en
  /ingresar y /cuenta, con el mismo estilo de la portada actual." The other option was usted. This decides the voice
  of the customer product copy and the routes of T8c.
- **L40** (2026-11-05) Slice 19 (`5ecd5f6`, PR #20) holds the customer pages. After the gates passed, the user chose
  "Revisión nativa y luego commit (recomendado)": run the four-lens native review, because the change touches the
  renewal of the session cookie, and commit, publish, and merge without asking again only if the review approved
  without correction (the verbatim question and description were lost to a context compaction; these are its terms).
  The native review (`review-f054199d107c490d`, medium tier, four lenses and a refuter) required one correction for
  R3-ingresar-get-me-consumes-refresh-window (CRITICAL, reliability, introduced): the `/ingresar` render and the
  `/cuenta` server action read the session through the API outside the refresh, so the stored expiry moved without a
  cookie for the browser, and a customer who always entered through the landing page would be signed out on day 7.
  The 62-line correction makes `proxy.ts` refresh before every page or server action that reads the session (matcher
  `/ingresar`, `/cuenta`, and `/cuenta/:path*`; `GET` and `POST`), and the targeted validator approved it. Its first
  relay run ended after 908 seconds on a model safeguards flag without a verdict; the one permitted relaunch
  succeeded. The gates passed (web 83 of 83 and API 315 of 315 tests; 5 of 5 parallel web runs before the
  correction), and the build manifest holds the matcher. Because the review required a correction, the user was
  asked again. User, choosing an option for "La revisión pidió una corrección, que ya está aplicada y validada.
  ¿Apruebas hacer el commit de T8c, abrir el PR contra feat/m2-identity y hacer merge cuando pase el CI?": "Sí:
  commit, PR y merge (recomendado)", whose description reads: "Commit de la versión revisada tal cual, con los dos
  agregados que hizo el worker sin que se los pidieran: el enlace «Ingresar» en la portada y el aviso para
  administradores en /cuenta. Abro el PR (debería ser el #20) marcado como excepción de tamaño, hago merge cuando
  pase el CI y actualizo el PR #1." This keeps both additions. PR #20 passed CI and was merged into the tracker as
  `2174d90`, whose tree equals slice 19; CI on #1 passed after #20. From the L38 routing, T8c closed
  R4-web-config-validated-only-on-first-request (startup validation) and
  R2-session-api-doc-says-request-bound-but-client-is-process-singleton (the `session-api.ts` comment); the cookie
  round trip stays open. Routing of the 12 advisory findings: T8d owns R3-sign-out-fails-without-cookie and
  R4-sign-out-stuck-when-already-signed-out (sign-out must still end on `/ingresar` when the session is already
  gone) and R4-account-catch-all-unlogged; T9 owns R3-proxy-composition-unproved,
  R3-session-api-cookie-roundtrip-still-unproved, and R4-cuenta-outage-latency-serialized; T10 owns R2-001 to
  R2-005 (readability in `sign-in.ts`, `copy.ts`, `ui.ts`, `app/page.tsx`, and `sign-out-button.tsx`); the
  correction resolved R4-ingresar-and-patch-me-consume-session-roll-without-cookie. Slice 19 ends at `5ecd5f6`; slice 20
  starts from `2174d90` (L41).
- **L41** (2026-11-05) Visual theme. Before T8d the user asked: "antes de contonuar con la ultima tarea que ya es
  crear las paginas me gustarias que definieramos el tema, para ello tenemos gentle design, genera 4 opciones para yo
  poder elegir un diseno y de ahi continuar con todo el roadmap". No "gentle design" tool exists in this environment
  and Codex image generation had no credentials, so every option was built as an HTML concept under the gitignored
  `.atl/`. Round 1 (four design-system boards in `.atl/theme-options/`) was rejected. User, answering "¿Qué
  dirección visual usamos para InvitaMe? Será el tema de todas las páginas: portada, cliente, administrador y las que
  vengan en el roadmap." with a custom response: "No me gusto ninguno, siento muy simple los disenos, para ser una
  pagina de invitaciones debemos reflejar estilo para llamar la atención, aun no me dice nada de esos los disenos, la
  paleta debe ser claros contrastando con cololes elegantes tal vez un rojito o moradito, rosita, no me des opciones
  obscuros pero si metele mas al diseno debe reflejar ese experiencia para enamorar al cliente". Round 2 built four
  light landing concepts in `.atl/theme-v2/` (A Rosa y vino, B Lavanda real, C Rosa brillo, D Carmín mexicano).
  User, answering "¿Con cuál dirección visual seguimos para InvitaMe? Será el tema de la portada y de todas las
  páginas: cliente, administrador y las que vengan en el roadmap." with a custom response: "Me gusto el a solo que
  siento que los elementos son muy simples por ejemplo las flores, vinetas etc pudieramos mejorar mas". After a
  layered-vector illustration pass, User, answering "¿Apruebas la versión 2 de «A · Rosa y vino» como el tema de
  InvitaMe?" with a custom response: "Mejoro un poco pero las flores no me convencieron". User, choosing an option for
  "¿Cómo resolvemos las flores del tema «A · Rosa y vino»?": "Flores de línea fina, sin IA", whose description reads:
  "Dibujo botánico tipo grabado en trazo fino vino y oro, como las invitaciones de letterpress. Sin login ni cuota."
  The other option was flowers painted with AI. User, choosing an option for "¿Apruebas la versión 3 de «A · Rosa y
  vino», con flores de línea fina, como el tema de InvitaMe?": "Aprobar y continuar (recomendado)", whose description
  reads: "Queda como tema. Lo implemento en dos partes. Primero colores, tipografías, ornamentos y componentes, con
  /ingresar y /cuenta ya con el tema; T8d (administrador) se construye sobre eso. Después, la portada completa,
  revisando contigo los textos que hoy prometen cosas que no existen." This adds S35 and the tasks T8t (theme
  foundations, before T8d) and T8l (themed landing, after T8d). The approved concept is `.atl/theme-v2/a/`
  (`index.html`, `styles.css`, `art/`, and screenshots, with earlier versions as `*-v1.png` and `*-v2.png`); it is a
  local, uncommitted blueprint, so S35 records its tokens. Its sample copy makes claims the product cannot keep yet
  ("hecha a mano", "Envíala por WhatsApp", a catalog that does not exist), which T8l reviews with the owner. Slice 20
  (`feat/m2-identity-20-theme`, from `2174d90`) holds T8t; the admin routes and voice of T8d are still open.
- **L42** (2026-11-06) Slice 20 (`0de8136`, PR #21) holds the theme foundations (T8t). Its gates passed (web 108 of
  108 and API 315 of 315 tests, 5 of 5 parallel web runs; the contrast test failed with 15 of 20 before the tokens
  existed and passes with 25 of 25), and screenshots of the real app matched the approved concept. The native review
  was not run: its risk assessment rated the candidate medium and under budget. User, choosing an option for "T8t (la
  base del tema «Rosa y vino») pasó los 7 checks y lo verifiqué contra las capturas de la app real. ¿Apruebas el
  commit, el PR contra feat/m2-identity y el merge cuando pase el CI?": "Sí: commit, PR y merge (recomendado)", whose
  description reads: "Commit de lo verificado (22 archivos, 856 líneas), PR marcado como excepción de tamaño, merge
  cuando pase el CI y actualizo el PR #1. La evaluación de riesgo no pide revisión nativa." PR #21 passed CI and was
  merged into the tracker as `275eb8c`, whose tree equals slice 20. While it merged, User, choosing an option for
  "Mientras se integra el tema, defino lo que sigue. T8d crea las páginas de administrador con el tema «Rosa y vino»:
  ingreso con contraseña, el código de la app autenticadora, la activación de esa app con códigos de respaldo que se
  muestran una sola vez, y cerrar sesión. ¿Qué rutas y qué trato usan?": "/admin, con tú y sin enlace público
  (recomendado)", whose description reads: "Ingreso en /admin/ingresar (correo y contraseña, luego el código de la
  app o uno de respaldo), activación en /admin/activar (código QR, confirmación con el primer código y códigos de
  respaldo mostrados una sola vez) y un panel mínimo en /admin con tu cuenta y «Cerrar sesión». Mismo trato de tú
  que los clientes. Ninguna página pública enlaza a /admin; el aviso para administradores en /cuenta sí lleva al
  panel." The other option was usted. No QR encoder was installed (`apps/web` depends only on `next`, `react`, and
  `react-dom`), so, User, choosing an option for "Para mostrar el código QR en /admin/activar hace falta una
  dependencia nueva en la web, y eso requiere tu aprobación. ¿Cómo lo resolvemos?": "Agregar lean-qr (recomendado)",
  whose description reads: "Librería MIT sin dependencias propias, versión estable 2.7.4, actualizada en septiembre
  de 2026. El QR se dibuja en el navegador con el dato que ya recibe al activar; el secreto nunca sale a un servicio
  externo. Es una sola dependencia nueva en apps/web." The other option was a typed setup key without a QR code. This
  adds S36. CI on #1 passed after #21. T8d ships as two slices: slice 21 (`feat/m2-identity-21-admin-pages`, from
  `275eb8c`) holds sign-in, the panel, the shared sign-out, and the server log; slice 22 holds enrollment with the
  QR code and `lean-qr`.
- **L43** (2026-11-06) One worker built all of T8d (36 files, 2858 lines). The parent split it into two slices for
  review, kept the full tree in `refs/backup/t8d-full`, and gave slice 21 interim documentation that names
  `/admin/activar` as the next slice. Slice 21 (`219ec1d`, PR #22) holds administrator sign-in with the second factor,
  the panel, the shared sign-out fix, the server log, and the `/cuenta` link. Its gates passed (web 178 of 178 and API
  315 of 315 tests, 5 of 5 parallel web runs; every new test failed first). A first typecheck failed on stale
  `.next/types` from the full build (the web `tsconfig.json` includes `.next/types/**`); the build regenerated them
  and `tsc` passes. Before the review, inspect stopped with `managed_assets_outdated`, and the provider-issued
  `gentle-ai sync --agent pi` fixed it. The native review (`review-ab2a033865f2efca`, high tier from
  `lib/server/auth-session.ts` on the auth hot path, four lenses) approved without correction with 12 advisory
  findings. User, choosing an option for "T8d quedó partida en dos slices. A (slice 21) incluye el ingreso de
  administradores con código de la app o de respaldo, el panel /admin, el arreglo de «Cerrar sesión» y el log del
  servidor: 26 archivos y 1,939 líneas, 7 checks en verde y la revisión nativa (nivel alto, 4 lentes) aprobada sin
  corrección. B (slice 22) incluye la activación en /admin/activar con QR y los códigos de respaldo, en unas 920
  líneas, y lleva su propia revisión. ¿Apruebas A y B?": "Sí: A y B (recomendado)", whose description reads:
  "Commit, PR y merge de A ahora. Luego restauro B, corro sus checks y su revisión nativa; si aprueba sin
  corrección, hago commit, PR y merge de B sin volver a preguntarte." PR #22 passed CI and was merged into the
  tracker as `a432222`, whose tree equals slice 21. Routing: slice 22 resolves R2-overview-activar-listed-as-current,
  R3-overview-claims-activar-current, R3-pending-admin-dead-end, and R4-pending-admin-dead-end; T10 owns
  R2-browser-fetch-duplicated, R2-copy-duplicates-api-policy-constants, R2-home-null-comment-misplaced,
  R2-internal-helpers-exported, and R2-session-is-gone-inverted-doc; T9 owns R3-admin-form-transitions-untested and
  R3-get-auth-session-wiring-unproved; T9 and T11 own R4-admin-session-failure-undiagnosable. Slice 22
  (`feat/m2-identity-22-admin-enrollment`, from `a432222`) holds the enrollment at `/admin/activar` with `lean-qr`.
- **L44** (2026-11-06) Slice 22 (`efc54cd`, PR #23) holds the administrator enrollment at `/admin/activar` with the QR
  code from `lean-qr` and the full administrator documentation. Its gates passed (web 206 of 206 and API 315 of 315
  tests, 5 of 5 parallel web runs). Part B was restored from `refs/backup/t8d-full`, because a pathspec stash keeps
  the whole index and `git stash pop --index` refused to apply it. The native review (`review-9c0eb2f6d6b7e9a3`,
  medium tier, four lenses) ran because the owner's approval for both slices required it, and it approved without
  correction with 10 advisory findings; under L43 the slice was committed, published, and merged without asking
  again. PR #22 merged as `a432222` and PR #23 as `3a9c876`, each tree equal to its slice; CI on #1 passed after #23.
  Before each review, inspect or start stopped with `managed_assets_outdated`: another Gentle AI installation rewrites
  `~/.claude/CLAUDE.md` and the shared review-ledger contract after the Pi sync, so the provider-issued sync ran right
  before start. Routing: T10 owns R2-001 to R2-006 (readability in `qr.test.ts`, `enrollment-flow.tsx`,
  `enrollment-copy.ts`, the plan, and `enrollment.ts`); T9 owns R3-activar-page-routing-unproved,
  R3-enrollment-flow-transitions-untested, and R3-qr-medium-correction-test-vacuous; the T10 administrator recovery
  procedure and T11 own R4-confirm-lost-response-loses-backup-codes (a lost response to the confirmation can leave an
  administrator without having seen the backup codes). The backup ref and the stash were deleted after checking that
  the tracker holds the same content.
- **L45** (2026-11-06) Before T8l, the concept's copy was compared with what exists today (customer sign-in, the
  account, and the administrator pages; nothing about invitations): "hecha a mano", a catalog with four named
  designs, "Ver diseños" and "Crear mi invitación", "Envíala por WhatsApp o redes", attendance confirmation, the
  countdown, and the location are not real yet. User, choosing an option for "Para T8l, la portada completa con el tema
  «Rosa y vino»: ¿cómo manejamos los textos que hoy prometen funciones que todavía no existen?": "Pre-lanzamiento
  honesto (recomendado)", whose description reads: "Todo el diseño de la maqueta, con «Diseños de muestra» y
  «Próximamente» en el catálogo, secciones de «Así funcionará» y solo «Ingresar» como acción activa. Sin «hecha a
  mano» ni WhatsApp. Cada sección se activa cuando su función exista." The other options were the final launch copy
  now and a minimal landing. This adds S37. Slice 23 (`feat/m2-identity-23-landing`, from `3a9c876`) holds T8l.
- **L46** (2026-11-06) Slice 23 (`26e3e4a`, PR #24) holds the themed pre-launch landing (T8l). Its gates passed (web
  214 of 214 and API 315 of 315 tests, 5 of 5 parallel web runs); the copy test failed 7 of 8 against the concept's
  original claims and passes 8 of 8, and `/` is prerendered as static with no client JavaScript. The risk assessment
  rated it medium and under budget, so no native review was due. User, choosing an option for "T8l (la portada de
  pre-lanzamiento) pasó los 7 checks. ¿Apruebas el commit, el PR contra feat/m2-identity y el merge cuando pase el
  CI?": "Sí: commit, PR y merge (recomendado)", whose description reads: "Commit de la portada verificada (43
  archivos, 3,691 líneas), PR marcado como excepción de tamaño y merge cuando pase el CI. Las ilustraciones de
  muestra conservan el botón «Confirmar asistencia» y la cuenta regresiva, marcadas como ejemplo." The other options
  were removing those sample elements, running the native review first, and holding, so the receipt-driven reminder
  for this candidate was answered as left unreviewed by the owner. This settles the S37 reading: non-interactive
  sample illustrations labeled as examples may show coming features. PR #24 passed CI and was merged into the
  tracker as `1adcf88`, whose tree equals slice 23; CI on #1 passed after #24.
- **L47** (2026-11-06) T9 approach. Continuous integration ran no PostgreSQL (the nine `*.db-spec.ts` suites ran only
  locally through `test:db`), and no browser tests existed. User, choosing an option for "¿Cómo armamos T9, las
  pruebas de integración y de punta a punta?": "PostgreSQL en el CI y navegador (recomendado)", whose description
  reads: "El CI levanta PostgreSQL y corre las pruebas contra la base real. Completo las pruebas que exige el ADR, cada
  una con nombre. Sumo pruebas en navegador real con @playwright/test (dependencia de desarrollo nueva; el CI descarga
  Chromium y tarda unos minutos más) para el ingreso de clientes, la cuenta, el ingreso de administradores y la
  activación del segundo factor." The other option was HTTP-only end-to-end tests without a browser. This approves
  `@playwright/test` as a development dependency and a PostgreSQL service in CI, adds S38, and splits T9 into T9a
  (slice 24, `feat/m2-identity-24-integration-tests`, from `1adcf88`) and T9b.
- **L48** (2026-11-06) Slice 24 (`b47cfe1`, PR #25) holds T9a. Its gates passed (API 318 of 318 and web 214 of 214
  tests; `test:db` 49 tests, 48 passing and one `todo`, in two runs on PostgreSQL 17). The new tests exposed defect
  T9a-D1: a first TOTP confirmation that races an `admin:create` reissue still answers 200, stores a 12-hour session,
  and sets `twoFactorEnabled` although the reissue removed the `TwoFactor` row; the test stays `todo` until the fix.
  The native review (`review-b650d6a7d9ec3e17`, high tier, four lenses) approved without correction with 10 advisory
  findings; after a session pause it first stopped with `managed_assets_outdated`, and the provider-issued sync ran
  right before the capture. User, choosing an option for "T9a pasó 7 checks y revisión nativa (nivel alto, 4 lentes)
  sin corrección. ¿Apruebas commit, PR y merge de T9a, y cuándo arreglamos D1?": "T9a ahora; D1 justo después
  (recomendado)", whose description reads: "Commit, PR y merge de T9a con prueba de D1 visible como pendiente. Luego
  exploro arreglo de D1 y te traigo diseño para aprobar antes de tocar código; va en slice propio con revisión
  nativa, antes de T9b." PR #25 passed CI, including the first run of the new database job, and was merged into the
  tracker as `757372d`, whose tree equals slice 24; CI on #1 passed after #25. Then a second Gentle AI integration
  (the Claude Code stop hook of gentle-ai 4.3.1; Pi runs 4.2.0) blocked the end of the turn with a candidate made of
  the whole branch against `master` (198 files, 24,916 lines) and relayed its consent envelope. User, choosing an
  option for "Gentle AI puede revisar este cambio antes de que lo des por terminado. La revisión puede ayudar a
  identificar posibles problemas de seguridad. Revisar toma un poco más de tiempo y hace el resultado más seguro.
  Riesgo: alto · 198 archivos cambiados · 24,916 líneas cambiadas. Evidencia de riesgo: - autenticación en
  apps/api/prisma/migrations/20261104030448_add_better_auth_identity/migration.sql - scripts de shell en
  .github/workflows/ci.yml Para desactivar las revisiones de forma permanente, ejecuta 'gentle-ai review mode
  disable'.": "Revisar este cambio", whose description reads: "Revisa solo este cambio; los cambios posteriores de
  riesgo medio o alto vuelven a preguntar, y la entrega necesita aprobación aparte." The granted start stopped in
  preflight with `lens_context_budget_exceeded` and created no review authority, so the slices stay the review units.
  A read-only exploration mapped D1: Better Auth 1.7.16 `verify-totp` writes the enrollment flag, then creates the
  session, then sets the cookie, each in its own statement without a transaction, and the reissue's conditional user
  update is the only serialization point, so the race is decided before the session is created. User, choosing an
  option for "¿Cómo arreglamos D1? Recordatorio: si admin:create reemite la contraseña mientras se confirma el primer
  código TOTP, hoy la confirmación crea sesión de administrador inscrito sin TOTP real. El arreglo va en su propio
  slice: worker implementa, prueba pendiente pasa a obligatoria, revisión nativa y luego te pido commit.": "A:
  verificar en hook y revertir (recomendado)", whose description reads: "Al crear la sesión de la primera
  confirmación, verifico que la sesión pendiente siga existiendo. Si una reemisión ganó la carrera, revierto la
  inscripción y rechazo sin sesión ni cookie. Sin migración ni dependencias. Residual: si el proceso cae justo entre
  ambos pasos, la cuenta queda bloqueada (falla cerrada) y solo la recuperación manual de T10 la libera." The other
  option added a PostgreSQL trigger through a new migration. This adds S39 and task T7c (slice 25,
  `feat/m2-identity-25-enrollment-race`, from `757372d`). Routing of the T9a findings: T7c resolves
  R1-totp-reissue-race-todo, R3-race-todo-masks-harness-failure, and R4-001; T9b owns
  R3-counted-range-shared-by-three-suites and R3-tampered-cookie-case-vacuous; T10 owns
  R2-counted-range-exclusivity-claim, R2-duplicated-local-hosts, R2-shadowed-after-hook, and
  R2-unnamed-enrollment-window; this record fixes R2-every-push-overstatement in S38.
- **L49** (2026-11-06) Slice 25 (`3e8620b`, PR #26) holds T7c. Its gates passed (API 318 of 318 and web 214 of 214
  tests; `test:db` 53 of 53 in two runs, with no `todo` left). Before the fix, the reissue race and the re-enable
  variant answered 200 with a session cookie. The native review (`review-4b1a82bcf1ab5b05`, high tier, four lenses)
  approved without correction with 8 advisory findings; its target was the same one the Claude Code integration had
  proposed, so both integrations share target identities, and its start ran after the provider-issued sync. User,
  choosing an option for "T7c cierra D1 tal como lo aprobaste: 7 checks en verde, 53/53 pruebas de base de datos y
  revisión nativa de nivel alto aprobada sin corrección. ¿Cómo seguimos con las tres advertencias de los
  revisores?": "Commit ahora; endurecer después (recomendado)", whose description reads: "Commit, PR y merge de T7c
  ya revisado. Luego un slice corto T7d cierra los dos casos restantes y registra si la compensación falla; te traigo
  su diseño antes de tocar código y lleva su propia revisión. Va antes de T9b." PR #26 passed CI and was merged into
  the tracker as `6ba88bc`, whose tree equals slice 25; CI on #1 passed after #26. A read-only exploration designed T7d
  and surfaced a verified gap that predates T7c: `sessionHiddenOn` in `apps/api/src/auth/inactive-session-hook.ts`
  hides an administrator session only while `twoFactorEnabled` is not true, so once enrollment completes in one
  session, every other session opened before it with the password alone gains administrator authority without a
  second factor. User, choosing an option for "¿Apruebas el diseño de T7d para endurecer la activación de
  administradores?": "Diseño completo, sin migración (recomendado)", whose description reads: "Las 4 piezas:
  confirmación vieja rechazada, doble envío sin reversión, fallo de compensación registrado y cierre de las demás
  sesiones al inscribirse. Worker implementa con pruebas de carrera en PostgreSQL, revisión nativa y luego te pido
  commit." The other options were the design without ending the other sessions and the design plus a migration with
  an enrollment counter. This adds S40. The residual races fail closed: a check-then-revert window that only a
  migration could close exactly, clock skew between `admin:create` and the API, and a second tab that can look like a
  double submit (the account then waits for the T10 recovery). Routing of the T7c findings: T7d resolves
  R3-verified-row-shortcut-admits-stale-confirmation, R4-concurrent-first-confirmation-reverts-success,
  R3-revert-failure-locks-without-log, R1-001, R2-residual-risk-overstates-no-twofactor-row,
  R2-revert-returns-error-name, and R2-log-test-name-event-mismatch; this record fixes
  R2-t7c-task-row-misstates-trigger; T10 owns the `/admin/activar` message for `401 ENROLLMENT_SUPERSEDED`. Slice 26
  (`feat/m2-identity-26-enrollment-hardening`, from `6ba88bc`) holds T7d.
- **L50** (2026-11-06) Slice 26 (`68a3a07`, PR #27) holds T7d. The native review (`review-dbeb69c8becfe4c4`, high
  tier, four lenses) required one correction, R3-newer-session-refuse-keeps-flag-with-password-session: a newer
  session that was a second tab's password-only session made the hook refuse while keeping `twoFactorEnabled` true and
  that session alive, so the second tab gained administrator authority without a second factor. The correction ends
  every session of the administrator before that refusal (S40); its new test failed first (19 of 20 tests in the file
  passed, and the second tab still read the user) and passes now. Gates passed (API 318 of 318 and web 214 of 214
  tests; `test:db` 60 of 60 in two runs). TDD caveat: the "401, not 500" assertion of the failed-revert test never had
  a valid RED run. The targeted validator first hit the Pi host relay bound (924782 ms against 924548 ms) without a
  verdict. User, choosing an option for "La corrección de T7d ya está probada: la prueba de dos pestañas falló antes
  del arreglo y ahora pasa, los 7 checks están en verde y la base de datos pasó 60/60 dos veces. Pero el validador de
  la revisión se cortó por tiempo (15 min 25 s, con límite de 15 min 24.5 s) sin dar veredicto. Reintentar igual
  chocaría con el mismo límite, y ese límite solo se cambia en el entorno con el que arrancas Pi. ¿Cómo seguimos?":
  "Subir el límite y reintentar (recomendado)", whose description reads: "Cierras Pi y lo vuelves a abrir con
  GENTLE_PI_REVIEW_RELAY_PI_TIMEOUT_MS=3600000 (1 hora; el máximo es 2 horas), por ejemplo con un export en tu
  terminal antes de abrirlo, y retomas esta sesión. Yo consulto el estado de la revisión y relanzo el validador una
  sola vez. Cuesta una ejecución más del modelo." After the restart with that bound, the provider-issued sync (the
  managed assets were outdated again), and a fresh status, the validator approved the correction with six advisory
  findings, and the acknowledgement burned the authority. User, choosing an option for "La revisión nativa de T7d
  quedó aprobada: el validador confirmó la corrección del hallazgo crítico y la autoridad ya se quemó. Pruebas sobre
  el árbol revisado: 7 checks en verde, API 318/318, web 214/214 y base de datos 60/60 en dos corridas. Cambios de
  comportamiento: un doble envío al activar la app autenticadora cierra todas las sesiones y obliga a ingresar de
  nuevo con contraseña y código; si una segunda pestaña coincide con un cierre de sesión durante la activación, la
  cuenta queda bloqueada hasta la recuperación manual de T10. Riesgos residuales (todos fallan cerrado): la ventana
  entre comprobar y revertir, el desfase de reloj entre admin:create y la API, y ese caso de segunda pestaña. Aviso de
  TDD: la parte «401, no 500» de la prueba de reversión fallida nunca tuvo una corrida RED válida. Quedan 6 hallazgos
  no bloqueantes (3 advertencias y 3 sugerencias) que repartiría entre T10 y T11. ¿Apruebas commit, PR y merge de
  T7d?": "Commit, PR y merge (recomendado)", whose description reads: "Commit «fix(api): harden the first TOTP
  confirmation» del árbol revisado, PR #27 al tracker y merge cuando pase el CI; actualizo #1. Después abro T9b y
  registro L50 con estas decisiones y el reparto de los 6 hallazgos." PR #27 passed CI and was merged into the tracker
  as `21d66b6`, whose tree equals slice 26; the tracker description now lists slices 1 to 26, and CI on #1 passed
  after #27. Routing of the T7d
  findings: T10 owns R2-compensation-failed-test-name-abbreviates-event, R2-decide-function-hides-session-deletion,
  R2-racing-enrollment-doc-describes-return-member-as-option, and R4-reverted-logged-before-attempt; T11 owns
  R4-allow-path-write-failure-unlogged and R4-double-submit-deletes-sibling-session. T9b, with about 17 routed findings,
  a new harness, and a CI job, does not fit one reviewable slice, so it is split into parts A to C (see the T9b row);
  part A needs no product decision. Slice 27 (`feat/m2-identity-27-browser-tests`, from `21d66b6`) holds T9b part A.
- **L51** (2026-11-06) T9b part B needs the TOTP secret in a browser test. `/admin/activar` draws only the QR code, so no
  secret reaches a test without a production channel, and an administrator who opens the page on the phone that holds
  the authenticator app cannot scan it. User, choosing an option for "Para la parte B de T9b (activación del segundo
  factor e ingreso de administradores en el navegador), la prueba necesita el secreto TOTP para generar los códigos.
  Hoy /admin/activar solo dibuja el QR: el secreto no aparece como texto en la página, y S38 prohíbe que llegue a la
  prueba por un endpoint, flag o log de producción. Además, quien abre esa página en el mismo teléfono donde tiene la
  app autenticadora no puede escanear su propia pantalla. ¿Cómo obtiene la prueba el secreto?": "Mostrar la clave
  manual (recomendado)", whose description reads: "Agrego bajo el QR la clave para escribirla a mano en la app (por
  ejemplo, «¿No puedes escanear? Escribe esta clave»). Resuelve el caso del teléfono, la prueba la lee como lo haría
  una persona y S38 queda intacta. Cambia la página y su texto: unas 60 a 100 líneas más en la parte B, con su
  revisión." The other options were reading the browser's own enable response, with a rewording of S38, and
  decrypting the stored secret from PostgreSQL in the harness. This adds S41 and puts the manual key in T9b part B.
