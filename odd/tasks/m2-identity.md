# Milestone 2 — Identity, ownership, and authorization

Task brief and tracking for Milestone 2 on branch `feat/m2-identity`, implementing the accepted
[ADR 0004](../../docs/adr/0004-authentication-with-better-auth.md). Status: T1 (`ebabb0d`), T1b (`71ae169`), T2 (`cb07c29`), and T3 (`4cfdb26`) committed and published (L21); T4
committed as slices 4 to 6 (L22); slices 1 to 6 merged into the tracker (L23); T5a merged as #8 (L24); T5b merged as #9 (L25); T5c merged as #10 (L26); T6a merged as #11 and #12 (L27, L28); T6b merged as #13 and #14 (L29, L30); T7 merged as #15 and #16 (L31, L32); T8a merged as #17 (L33 to L35); T8b merged as #18 and #19 (L36 to L38); T8c merged as #20 (L39, L40); T8t merged as #21 (L41, L42); T8d merged as #22 and #23 (L42 to L44); T8l merged as #24 (L45, L46); T9a merged as #25 (L47, L48); T7c merged as #26 (L48, L49); T7d merged as #27 (L49, L50); T9b part A merged as #28 (L50 to L52); T9b part B merged as #29 (L52 to L55); T8e merged as #30 (L55, L56); T9b part C1 merged as #31 (L56 to L59); T9b part C2 merged as #32 (L59, L60); T8f merged as #33 (L60, L61); T10a merged as #34 (L62, L63); the T10 documentation merged as #35 (L63, L64); the first T10 API readability part merged as #36 (L64, L65); the second merged as #37 (L65, L66); the T10 web and harness naming merged as #38 (L66, L67); the T10 web behavior merged as #39 (L68, L69); T10 complete (L61 to L69); T11b merged as #42 (L74, L75); T11c merged as #43 (L75, L76); T11d merged as #44 (L76, L77); T11e merged as #45 (L77, L78); T11f merged as #46 (L79, L80); T11 complete with the owner's sign-off (L70 to L81).
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
| Delivery | Feature branch chain (L17). `feat/m2-identity` is the tracker and final integration branch, with a draft pull request to `master` that is not merged before T11. Slice 1 `feat/m2-identity-01-spike` (T1, T1b; 407 lines) targets the tracker; slice 2 `feat/m2-identity-02-schema` (T2; 436 lines, 106 of them generated migration SQL) targets slice 1; slice 3 `feat/m2-identity-03-config` (T3, `4cfdb26`; about 747 lines, 415 of them tests) targets slice 2 with `size:exception` (L19); each later slice branches from and targets its parent. Pull requests: tracker #1 (draft, marker commit `7d9e3b9`), slice 1 #2, slice 2 #3, slice 3 #4. T4 is split into slice 4 `feat/m2-identity-04-email-core` (`01f44f5`), slice 5 `feat/m2-identity-05-email-adapters` (`f6cc504`), and slice 6 `feat/m2-identity-06-email-wiring`, each with `size:exception` (L22). Pull requests #2 to #7 are merged into the tracker with merge commits; later slices branch from the tracker and target it: slice 7 `feat/m2-identity-07-sign-in-code` (T5a, #8, merged) and slice 8 `feat/m2-identity-08-abuse-limits` (T5b, #9, merged), slice 9 `feat/m2-identity-09-abuse-hardening` (T5c, #10, merged), slice 10 `feat/m2-identity-10-authorization` (T6a access control, #11, merged), slice 11 `feat/m2-identity-11-disable-user` (T6a disable command, #12, merged), slice 12 `feat/m2-identity-12-session-status` (T6b session hardening, #13, merged), slice 13 `feat/m2-identity-13-own-profile` (T6b own profile, #14, merged), slice 14 `feat/m2-identity-14-admin-sign-in` (T7 administrator sign-in, #15, merged), slice 15 `feat/m2-identity-15-admin-create` (T7 creation command, #16, merged), slice 16 `feat/m2-identity-16-session-settings` (T8a session settings, #17, merged), slice 17 `feat/m2-identity-17-web-proxy` (T8b API proxy secret, #18, merged), slice 18 `feat/m2-identity-18-web-proxy-client` (T8b web proxy and server-side API client, #19, merged), slice 19 `feat/m2-identity-19-customer-pages` (T8c customer pages, #20, merged), slice 20 `feat/m2-identity-20-theme` (T8t theme foundations, #21, merged), slice 21 `feat/m2-identity-21-admin-pages` (T8d administrator sign-in and panel, #22, merged), slice 22 `feat/m2-identity-22-admin-enrollment` (T8d administrator enrollment, #23, merged), slice 23 `feat/m2-identity-23-landing` (T8l themed landing, #24, merged), slice 24 `feat/m2-identity-24-integration-tests` (T9a database tests in CI, #25, merged), slice 25 `feat/m2-identity-25-enrollment-race` (T7c enrollment race fix, #26, merged), slice 26 `feat/m2-identity-26-enrollment-hardening` (T7d enrollment hardening, #27, merged), slice 27 `feat/m2-identity-27-browser-tests` (T9b part A browser tests, #28, merged), slice 28 `feat/m2-identity-28-admin-browser-tests` (T9b part B administrator browser tests, #29, merged), slice 29 `feat/m2-identity-29-form-submission` (T8e form submission, #30, merged), slice 30 `feat/m2-identity-30-web-api-client` (T9b part C1 web server hardening, #31, merged), slice 31 `feat/m2-identity-31-test-findings` (T9b part C2 test findings, #32, merged), slice 32 `feat/m2-identity-32-self-hosted-fonts` (T8f self-hosted theme fonts, #33, merged), slice 33 `feat/m2-identity-33-admin-recovery` (T10a administrator recovery command, #34, merged), slice 34 `feat/m2-identity-34-docs-adr` (T10 documentation and ADR, #35, merged), slice 35 `feat/m2-identity-35-api-readability` (T10 API comments and naming, part 1, #36, merged), slice 36 `feat/m2-identity-36-api-users-readability` (T10 API comments and naming, part 2, #37, merged), slice 37 `feat/m2-identity-37-web-readability` (T10 web and harness comments and naming, #38, merged), slice 38 `feat/m2-identity-38-web-behavior` (T10 web behavior, #39, merged), slice 39 `feat/m2-identity-39-security-evidence` (T11a exact outputs and the T11 plan, #40, merged), and slice 40 `feat/m2-identity-40-account-races` (T11a race tests and the A′ and R4 reproductions, #41, merged), slice 41 `feat/m2-identity-41-api-security` (T11b API security fixes, #42, merged), slice 42 `feat/m2-identity-42-session-marker` (T11c second-factor marker, #43, merged), slice 43 `feat/m2-identity-43-log-contract` (T11d log contract, #44, merged), slice 44 `feat/m2-identity-44-web-edge` (T11e web edge, #45, merged), slice 45 `feat/m2-identity-45-security-signoff` (T11f verification findings and evidence report, #46, merged), and the sign-off record on `feat/m2-identity-46-signoff` (L23 to L81). Push and pull requests need human approval. |

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
  authenticator app, and the T9b browser tests read the secret from that text. That text already shipped in slice 22
  (`efc54cd`); part B gives it an accessible name (L53).
- **S42** (L55) Form submission without a URL, approved as: "Commit «test(web): add browser end-to-end tests for
  administrators» del árbol revisado, PR al tracker y merge si el CI pasa. Después, antes de la parte C, un slice
  corto T8e hace que esos tres formularios nunca envíen datos por la URL, con una prueba en navegador sin JavaScript
  que hoy falla. Lleva su propia revisión." No form that holds an email, a password, or a sign-in or authenticator
  code may put a field in a URL, also without JavaScript or before the page is interactive, and a browser test with
  JavaScript disabled proves it for `/admin/ingresar`, `/admin/activar`, and `/ingresar`.
- **S43** (L57) Theme fonts without the network, approved as: "Descargo una sola vez las fuentes del tema (con
  licencia abierta, como todas las de Google Fonts), las guardo en el repositorio y las cargo con next/font/local. El
  build deja de depender de la red y el diseño no cambia. Va como un slice corto propio después de la parte C, con su
  revisión." The web build fetches no font over the network: the theme's font files live in the repository with their
  licenses and load through `next/font/local`, with the same families, weights, and look as before.
- **S44** (L62) Administrator recovery command, approved as: "Un comando de terminal en el servidor de la API (nombre
  tentativo admin:reset-second-factor), con los mismos resguardos que admin:create. Con un administrador activo,
  revoca todas sus sesiones, borra su segundo factor y sus códigos, y emite una contraseña inicial nueva con otra
  ventana de 24 h para activarse de nuevo. Rechaza correos desconocidos, clientes y administradores deshabilitados;
  reactivarlos queda fuera. Solo registra el id del usuario. Cubre todos los bloqueos. Es código de seguridad, así que
  va en un slice propio con prueba primero, verificación independiente y revisión nativa: unas 250 a 350 líneas con
  pruebas y docs." An operator recovers a locked administrator only through a terminal command on the API host, with
  the safeguards of `admin:create`, never through an HTTP route or an environment flag (ADR 0004 decisions 3 and 6).
  For an active administrator, enrolled or not, it revokes every session, deletes the second factor and its backup
  codes, and issues a new initial password with a new 24-hour enrollment window (S20), as an `admin:create` reissue
  does. It refuses unknown addresses, customers, and disabled administrators, never creates or promotes an account,
  logs only the user id, and fails closed, leaving the account unchanged.
- **S45** (L68) Message for a superseded enrollment on `/admin/activar`, approved as: "Para 401 ENROLLMENT_SUPERSEDED
  muestro «Esta activación ya no es válida. Ingresa de nuevo con tu correo y tu contraseña.». Los demás 401 siguen con
  «Tu sesión terminó…». El texto es cierto en todos los casos que producen esa respuesta, y llevará pruebas del caso y
  del mensaje." The API answers `verify-totp` with `401` and the code `ENROLLMENT_SUPERSEDED` when a first
  confirmation loses a race (S39, S40, L49), whether another confirmation completed the enrollment or the enrollment
  was reverted; «Tu sesión terminó…» is today's full text «Tu sesión terminó. Ingresa de nuevo con tu correo y tu
  contraseña.».
- **S46** (L71) Proxy secret required by default, approved as: "Exigir el secreto por defecto (recomendado)",
  described as: "Por defecto se exige el secreto; solo las pruebas y el desarrollo local lo apagan de forma explícita.
  Si alguien olvida la opción, la API falla cerrada." `createAuth` defaults `requireProxySecret` to `false`
  (`apps/api/src/auth/auth.factory.ts:336`), and only production passes `true`
  (`apps/api/src/auth/auth.registration.ts:34`). The default becomes required, so a caller that omits the option fails
  closed, and tests and local development turn it off explicitly.
- **S47** (L71) Previous proxy secret during rotation, approved as: "Aceptar dos secretos al rotar (recomendado)",
  described as: "La API acepta además un secreto anterior opcional, por ejemplo AUTH_PROXY_SECRET_PREVIOUS, mientras
  dura la rotación: se cambia primero la API, después la web, y al final se borra el anterior. No hay corte." The API
  compares a single secret today (`apps/api/src/auth/auth-request-guard.ts:82-90` and `:141`), so a rotation rejects
  the web with `403` until both sides change. The API also accepts an optional previous secret while a rotation lasts;
  the example `.env` line is a human edit.
- **S48** (L71) Bidirectional controls in display names, approved as: "Rechazar los de dirección (recomendado)",
  described as: "La API rechaza con el mismo 400 los controles de dirección (U+202A a U+202E, U+2066 a U+2069, U+200E,
  U+200F y U+061C). Sigue aceptando el unidor de ancho cero, que usan los emojis compuestos y algunos idiomas."
  `FORBIDDEN_CHARACTER` (`apps/api/src/users/domain/display-name.ts:5`) refuses control characters and unpaired
  surrogates but accepts format characters. It also refuses the listed bidirectional controls with the same `400`, and
  still accepts the zero-width joiner (U+200D).
- **S49** (L71) Administrator session expiry with an invalid creation time, approved as: "Fallar cerrado y registrarlo
  (recomendado)", described as: "Una fecha inválida hace que la sesión se trate como vencida y se registre un evento
  sin datos personales. El administrador vuelve a ingresar." `administratorSessionExpiresAt`
  (`apps/api/src/auth/session-settings.ts:68-72`) falls back to the current time when `createdAt` is not a valid date,
  which grants a full 12 hours. An invalid creation time makes the session expired and logs an event without personal
  data.
- **S50** (L71) Operational log contract, approved as: "El contrato completo (recomendado)", described as: "Todos los
  cambios de la lista, en un slice con sus pruebas, sin datos personales en ningún campo." Slice C implements every
  listed change with its tests; no field carries an email address, a token, or a name, only events, routes, classes,
  and error codes.
- **S51** (L71) Client abort on the auth proxy, approved as: "Responder 499 (recomendado)", described as: "El código
  que muchas plataformas usan para «el cliente cerró el pedido». Las métricas de errores del servidor dejan de contar
  las cancelaciones." The auth proxy answers `502` when the browser cancels a `/api/auth` request
  (`apps/web/lib/server/auth-proxy.ts:248-250`). It answers `499` instead and still logs no failure.
- **S52** (L72) Second-factor marker on sessions, approved as: "Marcar cada sesión (recomendado)", described as: "Cada
  sesión guarda si se abrió con el segundo factor, y la API termina toda sesión de un administrador activado que no lo
  haya pasado. Cierra la brecha aunque la base de datos falle en ese paso. Requiere una migración que agrega una
  columna a la tabla de sesiones, sin borrar datos, en su propio slice. Las sesiones de administrador abiertas antes
  de esa migración piden ingresar de nuevo." `isPendingAdministrator` (`apps/api/src/auth/account-access.ts:55-56`)
  tells a pending session apart only by the account's `twoFactorEnabled`, so password-only sessions that survive a
  failed sibling delete get administrator access (A′, L72). Each session records whether it passed the second factor,
  through an additive migration in its own slice, and the API ends every session of an enrolled administrator that did
  not.
- **S53** (L72) Display-name write only while the account is active, approved as: "Guardar solo si sigue activa
  (recomendado)", described as: "La escritura exige que la cuenta siga activa en ese mismo instante. Si no lo está, la
  API responde 401, igual que cuando la cuenta ya no existe. Es una condición más en la escritura, y la prueba que hoy
  está en pausa pasa a correr." `PrismaOwnProfileRepository.updateDisplayName`
  (`apps/api/src/users/infrastructure/prisma-own-profile.repository.ts:27`) writes by id only, so a `user:disable`
  that commits between the guard and the write still stores the name and answers `200` (R4, L72). The write also
  requires an `ACTIVE` account and otherwise answers `401`, and the R4 `todo` test becomes a required test.
- **S54** (L72) Session refresh limit of 3 seconds, approved as: "Mantener 3 segundos (recomendado)", described as:
  "Si la API está lenta, la página avisa en unos 3 segundos en lugar de dejar esperando a la persona. Se documenta que
  ese es el límite real de esas páginas." `SESSION_REFRESH_TIMEOUT_MS` (`apps/web/lib/server/session-refresh.ts:15`)
  bounds the refresh before `/ingresar` and the `/cuenta` pages at 3 seconds. The limit stays, and the documentation
  states it as the real bound of those pages.
- **S55** (L79) `BETTER_AUTH_SECRETS` refused at startup, approved as: "Rechazarla al arrancar (recomendado)",
  described as: "Si `BETTER_AUTH_SECRETS` está definida, la API no arranca y nombra la variable sin repetir su valor,
  igual que con `BETTER_AUTH_TRUSTED_ORIGINS`. Lleva una prueba. Unas 15 líneas." Better Auth 1.7.16 reads
  `BETTER_AUTH_SECRETS` by itself (`context/create-context.mjs:70`) and lets it replace the validated
  `BETTER_AUTH_SECRET`. The API's startup validation (`apps/api/src/config/environment.ts`) refuses any value for it,
  names the variable, and never echoes the value, as it already does for `BETTER_AUTH_TRUSTED_ORIGINS`.
- **S56** (L79) Explicit `NODE_ENV`, approved as: "Exigirla al arrancar (recomendado)", described as: "La API no
  arranca si `NODE_ENV` falta; debe ser development, test o production. Los scripts locales y de prueba que hoy no la
  definen la reciben explícita. Falla cerrado. Unas 20 a 40 líneas, con pruebas." `validateEnvironment` no longer
  defaults a missing `NODE_ENV` to `development` (`apps/api/src/config/environment.ts:405`): a missing value fails the
  startup with a message that names the variable, and the accepted values stay `development`, `test`, and
  `production`. Every repository script, test harness, and CI step that starts or validates the API sets it
  explicitly.
- **S57** (L79) `BETTER_AUTH_SECRET` rotation documented, approved as: "Documentarlo ahora y rotar después
  (recomendado)", described as: "README y arquitectura explican qué rompe rotarlo y cómo recuperar a cada
  administrador. Usar la lista `secrets` de Better Auth para rotar sin romper queda como tarea del milestone de
  despliegue. Solo documentación." The API README and the architecture overview state that the secret signs every
  session and encrypts each administrator's TOTP secret and backup codes, so changing it ends every session and leaves
  each enrolled administrator unable to use the second factor until `admin:reset-second-factor`; rotation without that
  breakage, through Better Auth's `secrets` list, is a deployment-milestone task.

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
| T9b | Browser end-to-end tests with `@playwright/test` (L47) against the real web, API, and PostgreSQL in CI, in four slices (L50, L56). Part A (slice 27): the harness inside `apps/web` (no new workspace) with PostgreSQL and Mailpit, a CI job, and the customer flows (sign-in by emailed code, the account, and sign-out), with R3-proxy-composition-unproved and R3-session-api-cookie-roundtrip-still-unproved. Part B (slice 28): an accessible name for the existing manual enrollment key (S41, L51, L53), authenticator enrollment, administrator sign-in with the second factor or a backup code, the panel, and sign-out, with the L43 and L44 findings and the part A findings routed in L52 except R3-concurrent-cookie-isolation-not-forced (L54). Part C1 (slice 30): R3-concurrent-cookie-isolation-not-forced (L54), the L38 findings, and R4-cuenta-outage-latency-serialized. Part C2 (slice 31): R3-counted-range-shared-by-three-suites, R3-tampered-cookie-case-vacuous, the part B and T8e findings routed in L55 and L56, and the C1 findings routed in L59. | S2, S38, S41 | worker | `0227038` (#28), `4792b31` (#29), `526eee2` and `c19188f` (#31), `abf8336` (#32) |
| T8e | Forms never put credentials in a URL (L55, S42): the forms at `/admin/ingresar`, `/admin/activar`, and `/ingresar` never send their fields in a query string, with or without JavaScript; controls that act only through JavaScript wait until the page is interactive; a browser test with JavaScript disabled, and a single-click sign-out test that replaces the retry in the administrator tests (R3-sign-out-retry-not-idempotent, R4-signout-retry-cannot-recover-after-navigation). | S2, S42 | worker | `365a188` (#30) |
| T8f | Self-hosted theme fonts (L57, S43): the theme's font files and their licenses in the repository, loaded with `next/font/local` instead of `next/font/google`, so `next build` needs no network for fonts; same families, weights, and look. After T9b part C2. | S43 | worker | `cd63f22` (#33) |
| T10a | Administrator recovery command (L62, S44): an operator command in `apps/api` that resets a locked administrator's second factor, revokes every session, and issues a new initial password with a new enrollment window, with the safeguards of `admin:create`; its own slice, test first, with independent verification and native review. | S44 | worker | `da45569` (#34) |
| T10 | Documentation and the readability findings routed here (L63): ADR wording fixes, architecture, database, and quality-gate docs, the variables each runtime needs (the example `.env*` files are a human edit), and the comment, naming, and test findings, in slices: the documentation and the ADR (slice 34), the API comments and naming, the web and harness comments and naming, and the web behavior with the L49 copy. The administrator recovery command is T10a; the security and log-contract items moved to T11 (L63). | S13, S21, S26, S27, S45 | worker | `74f8521` and `c9d7864` (#35), `86b3a7d` and `91d7a9c` (#36), `4a8ebc2` and `54884bd` (#37), `041ce73` and `c7b01af` (#38), `91602cb` and `1f62cec` (#39) |
| T11a | Security tests (L70, L72): exact outputs of the `PATCH /me` 400 and `admin:create`, the pre-enrollment clause table, the reset-versus-disable race, and reproductions of the A′ and R4 gaps, in slices 39 and 40 | S2 | worker | `647ac08` and `37181cb` (#40), `b2561c1` and `217472b` (#41) |
| T11b | API security fixes (L71, L72): the proxy secret required by default, a previous secret during rotation, bidirectional controls refused in display names, a fail-closed administrator expiry, and the display-name write only while active | S46, S47, S48, S49, S53 | worker | `b3b58b1` and `044d098` (#42) |
| T11c | Second-factor marker on sessions (L72): an additive migration and the session-access hook change that close A′. Its own slice, test first, with independent verification and native review | S52 | worker | `679d72f` and `282ed9f` (#43) |
| T11d | Log contract (L71): the approved operational events and fields, without personal data | S50 | worker | `b9a93e6`, `a96f509`, `75798e2`, and `8b948ba` (#44) |
| T11e | Web edge (L71, L72): 499 for a client abort, the 3-second refresh documented, and the `API_ORIGIN` empty-credentials finding of L59 | S51, S54 | worker | `07072fd` (#45) |
| T11f | Verification findings (L79): refuse `BETTER_AUTH_SECRETS`, require an explicit `NODE_ENV`, document `BETTER_AUTH_SECRET` rotation, the reset command's failing `close()` (R9), a bounded path in guard events (N5), `499` for an abort while the body is read (N6), the traceability and ADR fixes (F5), the S2 foreign-key test, the accepted-risk tests, and the verification report in the repository | S2, S55, S56, S57 | worker | `6e476c9`, `81c5668`, `c12f6dc`, `f94db2f`, `95b66a4`, `13616dc`, `9668b02`, and `0642ba6` (#46) |
| T11 | Security evidence: independent verification of every spec, and human sign-off of secret handling, session expiry, and error mapping. The report also lists the accepted residual risks, such as the per-email cap (L71), and the decisions left open, such as the domain (L7, L71). | S2 | verify | evidence in `9668b02` (#46); owner sign-off L81 |

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
- **L52** (2026-11-06) Slice 27 (`0227038`, PR #28) holds T9b part A: six browser tests of the customer session with
  `@playwright/test` 1.64.1, a harness inside `apps/web` on disposable PostgreSQL and Mailpit, and a `browser-tests`
  CI job. No production code changed. Each test failed once under a deliberate sabotage; then 6 of 6 passed in two
  local runs and one run with `CI=1`, and the gates passed (API 318 of 318 and web 214 of 214 tests). An independent
  verification met all seven items, ran the documented sequence (6 of 6), and showed that deliberately wrong `.env`
  values do not reach the harness. The native review (`review-01398ac3d1bd24b1`, high tier, four lenses) approved
  without correction with eight advisory findings; a start with an explicit lens list was refused as `lenses-invalid`,
  and the tier default ran the same four lenses. User, choosing an option for "La parte A de T9b (slice 27) está
  lista. La revisión nativa de nivel alto la aprobó sin corrección, con 8 hallazgos no bloqueantes (2 advertencias y 6
  sugerencias), y la verificación independiente cumplió los 7 puntos: 6/6 pruebas en navegador, también con archivos
  .env envenenados que el arnés ignoró. Agrega @playwright/test 1.64.1 y un job de CI «browser-tests» que todavía no
  corrió en GitHub; el PR será su primera corrida. Aún no cubre la extensión de una cookie de más de un día ni el
  chequeo del secreto entre la web y la API, porque en el arnés la API corre en modo desarrollo. ¿Apruebas commit, PR
  y merge?": "Commit, PR y merge (recomendado)", whose description reads: "Commit «test(web): add browser end-to-end
  tests for the customer session» del árbol revisado, PR al tracker y merge si el CI pasa, incluida la primera corrida
  del job de navegador; actualizo #1. Los 8 hallazgos y las 2 pruebas que sugirió la verificación pasan a la parte B,
  que empiezo después." PR #28 passed CI, where the browser job ran its 6 tests on its first run, and was merged into
  the tracker as `f4d5f2b`, whose tree equals slice 27; the tracker description now lists slices 1 to 27, and CI on #1
  passed after #28, browser job included. Residual gaps: the extension of a day-old session cookie and the API's
  proxy-secret check are not shown in a browser (the harness runs the API with `NODE_ENV=development`, because
  production refuses Mailpit and plain HTTP), and the `test:e2e` scripts use POSIX shell syntax. Routing: T9b part B
  owns R2-mailpit-error-placeholder-base, R2-other-customer-email-duplicates-fixture, R2-receive-code-unwrap-repeated,
  R3-ci-failure-artifacts-discarded, R3-concurrent-cookie-isolation-not-forced,
  R3-rate-limit-loop-alert-assertion-stale, R3-web-bound-ipv4-browser-uses-localhost, and
  R4-browser-tests-failure-artifacts-discarded, together with the two regression tests the verification proposed: a
  browser without a cookie on `/cuenta`, and a unit test that the harness refuses a missing or remote database or
  Mailpit URL. T10 owns the wording that the servers never read a `.env` file, since they still open their own at
  startup. `admin:create` refuses a non-interactive terminal, so part B creates its administrator through a
  harness-only script in `apps/api/test`, never through a production endpoint or flag (S38). Slice 28
  (`feat/m2-identity-28-admin-browser-tests`, from `f4d5f2b`) holds T9b part B.
- **L53** (2026-11-06) Correction of L51: `/admin/activar` already shows the manual key. Slice 22 (`efc54cd`, T8d part
  B) renders the setup key under the QR code in groups of four, with the heading «¿No puedes escanearlo?», a visually
  hidden label «Clave de configuración», and select-all text (`apps/web/app/admin/activar/enrollment-flow.tsx`, with
  `groupSetupKey` and its unit tests in `apps/web/lib/admin/enrollment.ts`). The search behind L51 looked only under
  `apps/web/app/admin` for words the code does not use (the copy lives in `apps/web/lib/admin/enrollment-copy.ts`), so
  L51's premise that the page draws only the QR code was wrong, and the question asked of the owner rested on it. The
  T9b part B worker found the conflict. The owner's choice still holds with less work: part B keeps the existing key
  and copy, makes only a minimal accessibility fix so that the hidden label names the key for screen readers and
  tests, and its browser tests read the key from the page as a person would (S38, S41).
- **L54** (2026-11-06) T9b part B reached about 1,070 changed lines against its budget of about 900. The largest
  separable piece is a harness-only gate between the web and the API that holds both customers' `GET /me` reads until
  both are in flight, which R3-concurrent-cookie-isolation-not-forced needs (about 200 lines). It moves to part C,
  next to the L38 findings about the web's API client, so part B stays near 870 lines and the finding stays open until
  then.
- **L55** (2026-11-06) Slice 28 (`4792b31`, PR #29) holds T9b part B: seven administrator browser tests on the part A
  harness, a harness-only administrator script in `apps/api/test`, TOTP and harness unit tests, and the setup key's
  accessible name, its only production change. The S41 test failed against the build before the label fix and passed
  after it; each new browser test failed once under a deliberate sabotage; then 14 of 14 passed in two local runs and
  one run with `CI=1`, and the gates passed (API 318 of 318 and web 224 of 224 tests). An independent verification met
  all nine items and ran the documented sequence (14 of 14). The native review (`review-69fa045094c90091`, high tier,
  four lenses) approved without correction with eight advisory findings. The verification also confirmed a leak that
  predates T9b: with JavaScript disabled, submitting `/admin/ingresar` puts the email and the password in the URL,
  `/admin/activar` the password, and `/ingresar` the email, because those forms have named fields and neither a method
  nor an action. User, choosing an option for "La parte B de T9b (slice 28) está lista. La revisión nativa de nivel
  alto la aprobó sin corrección (8 hallazgos no bloqueantes) y la verificación independiente cumplió los 9 puntos, con
  14/14 pruebas en navegador. El único cambio a producción es la etiqueta accesible de la clave manual. Además, la
  verificación confirmó un problema de seguridad que ya existía: si se envían antes de que cargue la página o con
  JavaScript desactivado, /admin/ingresar pone el correo y la contraseña en la URL, /admin/activar pone la contraseña
  e /ingresar pone el correo. ¿Cómo seguimos?": "Commit, PR y merge; luego los formularios (recomendado)", whose
  description reads: "Commit «test(web): add browser end-to-end tests for administrators» del árbol revisado, PR al
  tracker y merge si el CI pasa. Después, antes de la parte C, un slice corto T8e hace que esos tres formularios nunca
  envíen datos por la URL, con una prueba en navegador sin JavaScript que hoy falla. Lleva su propia revisión." PR #29
  passed CI, where the browser job ran 14 tests, and was merged into the tracker as `625a087`, whose tree equals slice
  28; the tracker description now lists slices 1 to 28, and CI on #1 passed after #29, browser job included. This adds
  S42 and T8e. Routing: T8e owns R3-sign-out-retry-not-idempotent and
  R4-signout-retry-cannot-recover-after-navigation, together with the verification's single-click sign-out test. Part
  C owns R1-ci-failure-artifact-holds-test-credentials, R2-backup-code-count-literal-repeated,
  R2-test-address-domain-duplicated, R2-wrong-totp-offset-window-unexplained,
  R3-e2e-unit-tests-collected-by-playwright, the administrator script's refusal test the verification proposed, the
  type check of `apps/api/test`, the exact QR level assertion, and the CI comment about what failure traces hold. T10
  owns the quality-gate wording that every administrator test creates an administrator. This record fixes
  R2-t9b-task-row-shows-commit-while-parts-open in the T9b row. Slice 29 (`feat/m2-identity-29-form-submission`, from
  `625a087`) holds T8e.
- **L56** (2026-11-06) Slice 29 (`365a188`, PR #30) holds T8e: the forms at `/admin/ingresar`, `/admin/activar`, and
  `/ingresar` declare `method="post"`, their submit buttons and the shared sign-out button stay disabled until the
  page is interactive, and each form shows a line asking to enable JavaScript. The JavaScript-disabled browser test
  failed 12 times before the fix (by click and by Enter, on all three pages) and passes now; the browser suite passed
  17 of 17 twice, and the gates passed (API 318 of 318 and web 228 of 228 tests). The native review
  (`review-68e6469f08541252`, medium tier, one consolidated lens, run because the owner's approved option said T8e
  carries its own review) approved without correction with two advisory findings. User, choosing an option for "T8e
  (slice 29) está listo: los tres formularios ya no ponen datos en la URL. La prueba con JavaScript desactivado falló
  12 veces antes del arreglo (por clic y por Enter, en las tres páginas) y ahora pasa; la suite completa dio 17/17 dos
  veces y los 7 checks están en verde. La revisión nativa (nivel medio, un lente) lo aprobó sin corrección, con 2
  hallazgos no bloqueantes. Cambios visibles: los botones quedan desactivados un instante hasta que la página termina
  de cargar, y sin JavaScript aparece un aviso, por ejemplo «Para ingresar, activa JavaScript en tu navegador.».
  ¿Apruebas commit, PR y merge?": "Commit, PR y merge (recomendado)", whose description reads: "Commit «fix(web): keep
  credentials out of form URLs» del árbol revisado, PR al tracker y merge si el CI pasa; actualizo #1. Después sigo
  con la parte C de T9b." The first CI run failed in the build of both web jobs because `next/font/google` could not
  fetch the Cormorant Garamond file from `fonts.gstatic.com`; T8e touches no font, the same commit built locally, and
  a rerun of the failed jobs passed, with the browser job running 17 tests. PR #30 was merged into the tracker as
  `8e425bf`, whose tree equals slice 29; the tracker description now lists slices 1 to 29, and CI on #1 passed after
  #30, browser job included. The build's dependence on Google Fonts while it runs is a delivery risk that waits for an
  owner decision. T9b part C is split in two slices so that each stays reviewable: part C1 (slice 30) takes the web
  server findings (the L38 findings, R4-cuenta-outage-latency-serialized, and
  R3-concurrent-cookie-isolation-not-forced with the gate kept from L54), and part C2 (slice 31) takes the test and
  harness findings (R3-counted-range-shared-by-three-suites, R3-tampered-cookie-case-vacuous, the part B findings
  routed in L55, and the T8e findings R3-interactive-transition-asserted-by-constants and
  R3-signout-noscript-line-unproved). Slice 30 (`feat/m2-identity-30-web-api-client`, from `8e425bf`) holds T9b part
  C1.
- **L57** (2026-11-06) The build of slice 29 failed once because `next/font/google` could not fetch a theme font while
  it ran (L56), so every build, in CI and in a deployment, depends on Google Fonts answering at that moment. User,
  choosing an option for "El primer CI del PR #30 falló porque, durante el build, Next.js no pudo descargar la fuente
  Cormorant Garamond desde Google (fonts.gstatic.com); al relanzarlo pasó. Hoy cada build depende de que Google Fonts
  responda en ese momento, en el CI y también en un despliegue. ¿Cómo lo resolvemos?": "Servir las fuentes desde el
  repo (recomendado)", whose description reads: "Descargo una sola vez las fuentes del tema (con licencia abierta,
  como todas las de Google Fonts), las guardo en el repositorio y las cargo con next/font/local. El build deja de
  depender de la red y el diseño no cambia. Va como un slice corto propio después de la parte C, con su revisión." The
  other options were keeping Google Fonts and rerunning failed jobs, and deciding in T11. This adds S43 and T8f, which
  runs after T9b part C2.
- **L58** (2026-11-06) T9b part C1 reached 632 changed lines against its budget of about 500. It stays one slice with
  a size exception, because splitting it would divide hunks of the same documents between two commits. The worker
  fixed R3-api-client-body-timeout-misclassified and R4-api-client-body-timeout-misclassified,
  R3-cookie-name-parse-without-equals, R4-proxy-ignores-client-abort,
  R4-api-client-unavailable-drops-cause-and-logs-nothing, and R4-cuenta-outage-latency-serialized (against an API that
  never answers, the account page took 13.0 seconds before the fix and about 3 seconds after it), each with a test
  that failed first, and proved R3-concurrent-cookie-isolation-not-forced with the harness-only API gate, without a
  production change. The new log fields (a fixed kind and the class of the cause) wait for the T11 sign-off.
  R3-api-origin-rejects-equivalent-origins needed a security decision, because `API_ORIGIN` is refused unless it is
  written exactly in its normalized form. User, choosing an option for "La parte C1 está implementada y verificada
  (17/17 pruebas en navegador dos veces; API 318/318 y web 236/236). Queda un hallazgo que toca una decisión de
  seguridad: hoy la web no arranca si API_ORIGIN, la dirección interna con la que habla con la API, no está escrita
  exactamente en su forma normalizada. Por ejemplo, rechaza «http://API:3001» o «http://api:80», aunque son el mismo
  origen que «http://api:3001» y «http://api». ¿Qué hacemos?": "Aceptar y normalizar (recomendado)", whose description
  reads: "La web acepta cualquier origen http o https sin ruta, consulta ni credenciales, y guarda su forma
  normalizada; el proxy ya compara contra ese valor. No cambia con qué servidor se habla ni amplía la confianza. Lo
  agrego a este slice con su prueba." The other options were refusing with the normalized form in the message, and
  keeping the rule and documenting it.
- **L59** (2026-11-06) Slice 30 (`526eee2` and `c19188f`, PR #31) holds T9b part C1, as one slice with a size
  exception (L58). The native review (`review-99dd80ae42f6456b`, high tier, four lenses) approved the first commit
  without correction with eleven advisory findings. An independent verification met seven of eight items: on a running
  build, a forged `x-invitame-api-unavailable` header had no effect on `/cuenta`, `/admin`, or their URL variants; log
  lines carried only the event, the error class, the fixed kind, and the cause class; an aborted request stopped the
  API call after about one second; and every new unit test failed on the baseline source. The eighth item was two
  documents that still described the session read failure log line without its kind; the second commit, documentation
  only and rated passive by the native assessment, corrects them. User, choosing an option for "La parte C1 (slice 30)
  está lista. La revisión nativa de nivel alto la aprobó sin corrección (11 hallazgos no bloqueantes). La verificación
  independiente cumplió 7 de 8 puntos y probó sobre un build real que una cabecera falsificada no tiene efecto, que
  los logs no llevan datos personales y que la llamada a la API se corta cuando el navegador se va. El punto pendiente
  es de documentación: dos documentos todavía describen la línea de log anterior, sin el campo «kind». Propongo dos
  commits en el mismo PR: el árbol revisado tal cual, y un commit aparte, solo de documentación, que corrige esas dos
  líneas. ¿Apruebas commit, PR y merge?": "Dos commits, PR y merge (recomendado)", whose description reads: "Commit
  «fix(web): harden the server-side API client and auth proxy» del árbol revisado, más un commit de documentación que
  corrige esas dos líneas. PR al tracker con size:exception y merge si el CI pasa. Los hallazgos no bloqueantes pasan
  a la parte C2 y a T11." PR #31 passed CI, where the browser job ran 17 tests, and was merged into the tracker as
  `61d5da0`, whose tree equals slice 30; the tracker description now lists slices 1 to 30, and CI on #1 passed after
  #31, browser job included. The Claude Code stop hook proposed reviewing the whole branch against `master` again (215
  files, 28,192 lines); its consent envelope was relayed, the owner chose «Revisar este cambio», and the start failed
  with `lens_context_budget_exceeded` without creating a review, as in L48. Routing of the C1 findings: part C2 owns
  R3-abort-test-hangs-on-regression, R3-outage-header-wiring-unproved, R3-gate-upstream-response-error-unhandled,
  R2-gate-ready-path-duplicated-literal, R2-missing-cookie-masked-as-gate-refusal, and the tests the verification
  proposed (more accepted `API_ORIGIN` spellings, and a test that the page proxy strips the outage header); T10 owns
  R2-read-named-helpers-wrap-profile-update, R2-short-circuit-unavailable-indistinguishable-in-log, and
  R3-auth-session-log-shape-doc-stale; T11 owns R3-refresh-timeout-caps-page-api-tolerance, R4-001, R4-002, the
  sign-off of the new log fields, an `API_ORIGIN` with empty credentials (accepted, because URL normalization drops
  them), and the 502 the auth proxy still returns after an abort. Slice 31 (`feat/m2-identity-31-test-findings`, from
  `61d5da0`) holds T9b part C2.
- **L60** (2026-11-07) Slice 31 (`abf8336`, PR #32) holds T9b part C2: the test and harness findings routed in L48,
  L55, L56, and L59, with no production change. Each database suite that counts rate-limit rows draws addresses from
  its own block; the tampered-cookie case uses a live token signed with another secret; new tests cover the
  harness-only administrator script's refusals, the page proxy's outage header, the submit buttons locked until the
  page is interactive, and the sign-out line without JavaScript; and the browser job keeps its failure artifact for
  one day. The first worker run stopped at a usage limit with no change and was resumed. To bring `apps/api/test`
  under `pnpm typecheck`, the parent added `test` to the exclude list of `apps/api/tsconfig.build.json`, next to
  `prisma`, and the worker added it to the include of `apps/api/tsconfig.json`; a deliberate type error now fails the
  type check, and the build emits the same 212 files. Each new test failed once under a deliberate sabotage; the
  gates passed (API 318 of 318 and web 245 of 245 tests), `test:db` passed 60 of 60 twice, and the browser suite 19
  of 19 twice. The native review (`review-aa07befe246839c3`, high tier, four lenses) approved without correction with
  six suggestions; its first capture was refused at admission because one reviewer added an unknown field to its
  result, and the group was rerun once, as the provider instructed. User, choosing an option for "La parte C2 de T9b
  (slice 31) está lista. Resuelve unos 20 hallazgos de pruebas y arnés sin cambiar código de producción. Ahora las
  tres suites que cuentan intentos usan bloques de IP separados. La cookie manipulada se prueba con un token real con
  firma falsa. Hay pruebas nuevas para el script de administradores, para cómo proxy.ts maneja la cabecera de caída,
  para el aviso de cierre de sesión sin JavaScript y para los botones bloqueados hasta que carga la página. Las
  pruebas de la API ya pasan por el typecheck, gracias a mi línea en tsconfig.build.json. Y el CI guarda las trazas
  solo 1 día. Pruebas: todos los checks en verde, base de datos 60/60 y navegador 19/19, cada una dos veces. La
  revisión nativa de nivel alto la aprobó sin corrección, con 6 sugerencias menores; la primera corrida de un revisor
  se rechazó por un campo de más en su JSON y se relanzó una vez. ¿Apruebas commit, PR y merge?": "Commit, PR y merge
  (recomendado)", whose description reads: "Commit del árbol revisado, PR al tracker y merge si el CI pasa; actualizo
  #1. Las 6 sugerencias pasan a T10. Después sigo con T8f (fuentes en el repositorio)." PR #32 passed CI, where the
  browser job ran 19 tests, and was merged into the tracker as `e28b14b`, whose tree equals slice 31; the tracker
  description now lists slices 1 to 31, and CI on #1 passed after #32, browser job included. The Claude Code stop
  hook proposed reviewing the whole branch against `master` again (220 files, 28,640 lines); the owner chose «Revisar
  este cambio», and the start failed with `lens_context_budget_exceeded` without creating a review. Routing: T10 owns
  R2-counted-block-offsets-hand-maintained, R2-gate-factory-mutates-module-origin,
  R2-signout-note-located-by-sibling-xpath, R2-traceability-spec-count-stale,
  R3-admin-script-test-exact-stderr-brittle, and R3-gate-origin-module-global. That each counting suite owns its
  address block rests on naming, not on a dedicated test. T9b is complete. Slice 32
  (`feat/m2-identity-32-self-hosted-fonts`, from `e28b14b`) holds T8f.
- **L61** (2026-11-07) Slice 32 (`cd63f22`, PR #33) holds T8f (S43). `apps/web/app/layout.tsx` loads the theme fonts
  with `next/font/local` from `apps/web/app/fonts/<family>/`: the latin-subset woff2 files that `next/font/google`
  used, byte for byte, each family with its SIL Open Font License 1.1 text, and a `.gitattributes` that keeps the
  licenses byte for byte. The CSS variables, weights, styles, subset, and swap display are unchanged, and an
  `adjustFontFallback` choice per family keeps the fallback metrics close to the previous ones. A new test fails when
  any web source imports `next/font/google`; it failed 3 of 4 on the old layout. In a fresh copy with outbound network
  denied, the build failed before the change with `Failed to fetch Cormorant Garamond from Google Fonts.` and passes
  after it, and screenshots of `/`, `/ingresar`, and `/admin/ingresar` at 1440 and 390 pixels match before and after
  except 8 anti-aliased pixels on one card corner. The gates passed (API 318 of 318 and web 249 of 249 tests), and the
  browser suite passed 19 of 19. The parent corrected the `globals.css` comment on where the fonts come from. The
  native review (`review-e1eb8e4ecbd3b121`, medium tier, one lens), run because the approved option asked for a
  review, approved without correction with one suggestion; inspect and start each stopped once at
  `managed_assets_outdated` and passed after a sync. User, choosing an option for "T8f (slice 32) está listo: el build
  ya no descarga fuentes de Google. Las cargo desde el repositorio con next/font/local, usando los mismos archivos
  woff2 que el build bajaba (idénticos byte a byte) y la licencia OFL de cada familia. Pruebas: un build con la red
  bloqueada fallaba antes del cambio y ahora pasa. Las capturas antes y después son idénticas, salvo 8 píxeles de
  antialiasing en una esquina. Una prueba nueva impide volver a usar next/font/google. Todos los checks están en verde
  y el navegador pasa 19/19. La revisión nativa (nivel medio) lo aprobó sin corrección, con 1 sugerencia. Diferencias:
  antes de que cargue la fuente, el texto de respaldo se ve un poco distinto; y si algún día un texto usa letras fuera
  del alfabeto latino básico, se verán con la fuente de respaldo (hoy no hay ninguna). ¿Apruebas commit, PR y merge?":
  "Commit, PR y merge (recomendado)", whose description reads: "Commit «build(web): self-host the theme fonts» del
  árbol revisado, PR al tracker y merge si el CI pasa; actualizo #1. Después sigo con T10 (documentación y
  recuperación de administradores)." PR #33 passed CI, where the browser job ran 19 tests, and was merged into the
  tracker as `4b8585d`, whose tree equals slice 32; the tracker description now lists slices 1 to 32, and CI on #1
  passed after #33, browser job included. Routing: T10 owns R3-variable-weight-range-unproved. Residuals: the
  fallback's `size-adjust` before the fonts load differs slightly, and text in letters outside the latin subset would
  render in the fallback font; today's copy has none. T8f is complete. Slice 33 (`feat/m2-identity-33-admin-recovery`,
  from `4b8585d`) starts T10.
- **L62** (2026-11-07) T10 starts with two read-only maps: the findings routed to T10 since L20, and the states that
  lock an administrator out. The second map found that only an expired enrollment window (rerun `admin:create`) and
  the 15-minute second-factor lockout (wait) can be recovered today: `admin:create` refuses an enrolled administrator,
  so a failed or interrupted first confirmation (L48, L49), a second tab that signs out during activation (L50), a
  lost confirmation response before the backup codes were seen (L44), and a lost device or lost backup codes leave the
  administrator locked. User, choosing an option for "T10 incluye el procedimiento para recuperar administradores
  bloqueados. Cuando aprobaste L48 y L50, quedó como la salida de esos casos. Revisé en qué situaciones puede quedar
  bloqueado un administrador: (1) La confirmación del segundo factor falla o se cae a mitad. (2) Una segunda pestaña
  cierra sesión durante la activación. (3) Se pierde la respuesta antes de ver los códigos de respaldo. (4) Pierde el
  teléfono, o se le acaban o pierde los códigos. Hoy solo hay salida en dos casos: si venció la ventana de 24 h (se
  vuelve a correr admin:create) y si es el bloqueo de 15 minutos (hay que esperar). admin:create se niega a tocar a un
  administrador ya activado, así que los demás casos no tienen salida. ¿Cómo quieres que se recuperen?": "Comando
  nuevo de operador (recomendado)", whose description reads: "Un comando de terminal en el servidor de la API (nombre
  tentativo admin:reset-second-factor), con los mismos resguardos que admin:create. Con un administrador activo,
  revoca todas sus sesiones, borra su segundo factor y sus códigos, y emite una contraseña inicial nueva con otra
  ventana de 24 h para activarse de nuevo. Rechaza correos desconocidos, clientes y administradores deshabilitados;
  reactivarlos queda fuera. Solo registra el id del usuario. Cubre todos los bloqueos. Es código de seguridad, así que
  va en un slice propio con prueba primero, verificación independiente y revisión nativa: unas 250 a 350 líneas con
  pruebas y docs." The other options were a documented manual SQL step followed by `admin:create`, and documenting
  only the existing tools. This adds S44 and T10a, which goes first, in slice 33
  (`feat/m2-identity-33-admin-recovery`, from `4b8585d`); the routed findings and the documentation follow in later
  T10 slices. Routing: T11 owns a possible gap that the map inferred from Better Auth's source and the parent
  half-confirmed. `sessionHiddenOn` (`apps/api/src/auth/inactive-session-hook.ts:90-95`) hides a pending
  administrator's session only by `twoFactorEnabled`, so if a first confirmation sets the flag and fails before the
  other sessions end (S40), the password-only sessions opened during activation would gain full authority for up to 12
  hours; where those sessions end, and whether another check stops this, is unverified.
- **L63** (2026-11-07) Slice 33 (`da45569`, PR #34) holds T10a (S44). The new `admin:reset-second-factor` command runs
  only on an interactive terminal of the API host, like `admin:create`. In one transaction whose writes require an
  active administrator, it turns the second factor off, deletes the TOTP secret and the backup codes, revokes every
  session, and replaces the credential with a new initial password, which starts a new enrollment window. It refuses
  an unknown address, a customer, and a disabled administrator without changing any row, prints the new password once,
  and logs only the user id. The reissue writes are shared with `admin:create`, whose behavior is unchanged. The
  worker stopped at 839 changed lines against its limit of about 450 (912 with the plan: 341 for code, 459 for tests,
  39 for documentation, and 73 for the plan); the parent kept one slice with a size exception, because a split would
  leave a first slice of about 690 lines with an unused use case, and trimming tests would cut security coverage. The
  new use-case, command, and repository tests failed before the code existed, and a mutation showed that the two new
  sign-in tests are not vacuous; the gates passed (API 339 of 339 and web 249 of 249 tests), and `test:db` passed 66
  of 66. The independent verification met every S44 clause by running the real command on disposable databases, ran
  `admin:create` on the base commit and on the candidate with identical output in 8 cases, and found that a sign-in
  challenge that reads the second factor just before a reset commits ends as a gated pending session that cannot
  enroll without the new password. The native review (`review-14c690f86fcba40e`, high tier, four lenses) approved
  without correction with six findings; its first capture was refused because STATUS had moved to
  `managed_assets_outdated`, and it passed after a sync. User, choosing an option for "T10a (slice 33) está listo. El
  comando admin:reset-second-factor recupera a un administrador bloqueado y solo corre en una terminal del servidor de
  la API. En una sola transacción desactiva su segundo factor, borra sus códigos de respaldo y todas sus sesiones, y
  le emite una contraseña nueva con otra ventana de 24 h. Rechaza sin tocar nada los correos desconocidos, los
  clientes y los administradores deshabilitados. Solo registra el id del usuario. Pruebas: - Todos los checks en
  verde; base de datos 66/66, dos veces. - La verificación independiente ejecutó el comando real contra bases
  desechables y comprobó S44 cláusula por cláusula. - admin:create se comporta igual que antes: 8 casos idénticos. -
  La revisión nativa de nivel alto lo aprobó sin corrección, con 6 hallazgos menores. El único que es una advertencia:
  falta una prueba de la carrera con user:disable. Tamaño: 912 líneas con el plan (341 de código, 459 de pruebas y 39
  de documentación). Es más que las 250 a 350 que estimé. Propongo entregarlo como un solo slice con excepción de
  tamaño: dividirlo dejaría un primer slice de unas 690 líneas con código que nada usa. ¿Apruebas commit, PR y
  merge?": "Commit, PR y merge (recomendado)", whose description reads: "Commit «feat(api): add an administrator
  recovery command» del árbol revisado, como un solo slice con excepción de tamaño. PR al tracker y merge si el CI
  pasa; actualizo #1. Los hallazgos de legibilidad y pruebas van a T10; la carrera con user:disable y el de
  resiliencia, a T11. Después sigo con los slices restantes de T10." PR #34 passed CI, where the browser job ran 19
  tests, and was merged into the tracker as `c09ba6d`, whose tree equals slice 33; the tracker description now lists
  slices 1 to 33, and CI on #1 passed after #34, browser job included. The Claude Code stop hook proposed reviewing
  the whole branch against `master` again (233 files, 29,926 lines); the owner chose «Revisar este cambio», and the
  start failed with `lens_context_budget_exceeded` without creating a review. Routing: T10 owns
  R2-refusal-reason-literals-duplicated, R2-reset-deps-derived-from-create-deps, R2-zero-match-labelled-disabled, and
  R3-pending-unconfirmed-secret-not-seeded; T11 owns R3-reset-disable-race-unproved (no test covers a reset racing
  `user:disable`) and R4-001. The rest of T10 follows the L62 map in slices: the documentation and the ADR (slice 34,
  `feat/m2-identity-34-docs-adr`, from `c09ba6d`), the API comments and naming, the web and harness comments and
  naming, and the web behavior, which includes the `/admin/activar` message for `401 ENROLLMENT_SUPERSEDED` (L49)
  whose copy the owner decides. The security and log-contract items routed to T10 move to T11 for the owner's
  sign-off: the `requireProxySecret` default of `createAuth`, proxy secret rotation, the log-field changes, the silent
  `now` fallback of the administrator session expiry, and the `user:disable` output for a non-active status. The
  example environment files need a human edit, because agents cannot edit `.env*` files; today `apps/api/.env.example`
  sets an `AUTH_BASE_URL` outside `CORS_ORIGIN`, so the API does not start from it.
- **L64** (2026-11-07) Slice 34 (`74f8521` and `c9d7864`, PR #35) holds the documentation and ADR part of T10 (S13,
  S21, S26, S27). ADR 0004 now explains the native review its status names, states exactly what a pre-enrollment
  administrator account can and cannot do, keeps a single logging rule, lists every production variable in an
  amendment to decision 9, and records the outcome of its consequences, with no decision changed. The architecture
  overview, the database model, the quality gates, the test traceability, and the docs index lost their stale
  statements, and the README documents the variables each runtime requires. The writer checked each statement against
  the code, and the proposed example environment files passed the real configuration validators in a scratch
  directory; the documentation checks passed. The parent corrected the overview: the second-factor limit of 5 codes
  per minute equals the 5 wrong codes one challenge allows. The candidate came out at native risk high only because
  the ADR's file name names authentication; its inspect stopped once at `managed_assets_outdated` and passed after a
  sync. The native review (`review-fac4a669ee7ed063`, high tier, four lenses) approved without correction with seven
  findings. The second commit, kept apart so the reviewed tree stays intact (L59), answers three warnings and two
  suggestions: the first migration already creates the minimal `User` record (R2-first-migration-user-dropped,
  R3-first-migration-user-record-dropped), the browser harness keeps only the validated settings safe from env files
  (R3-harness-env-isolation-overclaimed), and the overview no longer claims that a challenge is never cut short
  (R3-totp-rate-limit-never-cut-short-absolute, R4-totp-limit-never-cut-short-overclaim). User, choosing an option for
  "El slice 34 (documentación y ADR de T10) está listo. Solo cambia documentación: 253 líneas, más 53 del plan (L63).
  Corrige: - el ADR 0004: S13, S21, S26, S27 y la lista de variables de producción; - frases desactualizadas en el
  overview, el modelo de datos, quality-gates, la trazabilidad y el índice de docs; - el README, que ahora documenta
  las variables que exige cada servidor. La revisión nativa lo aprobó sin corrección, con 7 hallazgos menores. Salió
  en nivel alto solo porque el nombre del ADR menciona la autenticación. Tres advertencias señalan frases inexactas: -
  el índice dejó de decir que la primera migración ya trae el registro User; - quality-gates exagera el aislamiento
  del arnés; - una frase que agregué yo en el overview era absoluta. Ya preparé esas correcciones (7 líneas) para un
  segundo commit, separado del árbol revisado, como en C1. ¿Apruebas los dos commits, el PR y el merge?": "Dos
  commits, PR y merge (recomendado)", whose description reads: "Commit «docs: update the identity docs and ADR 0004»
  del árbol revisado y un segundo commit «docs: correct three statements flagged in review» con las 7 líneas. PR al
  tracker y merge si el CI pasa; actualizo #1. Te paso el texto de los dos archivos .env de ejemplo para que lo
  pegues. Después sigo con el slice de comentarios y nombres de la API." PR #35 passed CI, where the browser job ran
  19 tests, and was merged into the tracker as `199304d`, whose tree equals the second commit's; the tracker
  description now lists slices 1 to 34, and CI on #1 passed after #35, browser job included. The Claude Code stop hook
  proposed reviewing the whole branch against `master` again (233 files, 30,080 lines); the owner chose «Revisar este
  cambio», and the start failed with `lens_context_budget_exceeded` without creating a review. The parent gave the
  owner the full proposed contents of `apps/api/.env.example` and `apps/web/.env.local.example`, with
  `BETTER_AUTH_SECRET` left empty instead of a fixed placeholder, so that a known secret cannot be copied into
  production; pasting them resolves R2-env-example-known-defect-unstated. Routing: T11 owns
  R3-pre-enrollment-clarification-untraced (the ADR clarification of the pre-enrollment account is not traced to
  tests). Slice 35 (`feat/m2-identity-35-api-readability`, from `199304d`) holds the API comments and naming part of
  T10.
- **L65** (2026-11-07) Slice 35 (`86b3a7d` and `91d7a9c`, PR #36) holds the first API part of the T10 readability
  findings: the auth core and the configuration, with no runtime behavior change. The auth path constants moved to
  `auth/auth-paths.ts` and the error-class and safe-logging helpers, copied in three places, to
  `auth/safe-logging.ts`; names that understated their behavior became `enforceSessionAccess`,
  `settleFirstConfirmation`, `settleSupersededConfirmation`, `withTrustedProxyHeadersOnly`, and the
  `REJECTED_SHUTTING_DOWN` key, whose event value is unchanged; the configuration and the session cookies share one
  HTTPS rule; the proxy secret's minimum length has its own name; an unused export is gone; comments were corrected
  and completed; and a new test applies each access decorator the Better Auth integration exports. The first worker
  run stalled for four minutes after a shell command and timed out; it was resumed for this auth group only, and the
  users module and the API test support moved to slice 36. The gates passed (API 340 of 340 and web 249 of 249 tests),
  and `test:db` passed 66 of 66. The parent updated the test traceability to the new names and the overview to the
  precise quota rule: only a scheduled sign-in request counts. Because the refactor touches the auth core, an
  independent verification checked every runtime change and found each equivalent (the session refusal predicate over
  2,755 cases, the shared logging helper with three callers and a throwing sink, the HTTPS rule, the secret length,
  the path constants, the event values, and the renames); a probe of 2,825 lines of constants, messages, and behavior
  printed byte-identical output on the base and on the candidate. The native review (`review-9b6dd5f74f428aa2`, high
  tier, four lenses) approved without correction with six findings; its inspect stopped once at
  `managed_assets_outdated` and passed after a sync. Its warning, R2-unsupported-marker-coverage-overclaimed, which
  the verification reproduced, is answered by the second commit: the decorator test does not pin each key, because
  `OrgRoles` also writes `REQUIRE_ACTIVE_ORG`, so a renamed `ORG_ROLES` would still be refused without failing the
  test. User, choosing an option for "El slice 35 está listo: comentarios y nombres de la API, parte 1, que cubre el
  núcleo de autenticación y la configuración. Es un refactor sin cambio de comportamiento: - comentarios corregidos; -
  nombres más claros, como enforceSessionAccess y settleFirstConfirmation; - constantes y helpers movidos a dos
  módulos nuevos, auth-paths y safe-logging; - una prueba nueva. Son 346 líneas: 232 de código, 61 de pruebas, 9 de
  documentación y 44 del plan (L64). La verificación independiente confirmó que los 9 cambios de código son
  equivalentes; el predicado de rechazo de sesión se probó en 2755 combinaciones. Comparó el resultado con la base y
  las constantes, los mensajes y los eventos son idénticos. Las pruebas pasan: API 340/340 y base de datos 66/66. La
  revisión nativa de nivel alto lo aprobó sin corrección, con 6 hallazgos menores. La única advertencia: un comentario
  prometía que la prueba nueva detecta el cambio de cualquier clave, y para ORG_ROLES no es así. Ya corregí ese
  comentario (4 líneas) para un segundo commit, separado del árbol revisado. Endurecer la prueba y los demás hallazgos
  van al slice 36. ¿Apruebas los dos commits, el PR y el merge?": "Dos commits, PR y merge (recomendado)", whose
  description reads: "Commit «refactor(api): clarify auth naming, comments, and shared helpers» del árbol revisado y
  un segundo commit «docs(api): state what the decorator marker test covers» con las 4 líneas del comentario. PR al
  tracker y merge si el CI pasa; actualizo #1. Después sigo con el slice 36: usuarios, hallazgos de T10a y soporte de
  pruebas." PR #36 passed CI, where the browser job ran 19 tests, and was merged into the tracker as `8c9233f`, whose
  tree equals the second commit's; the tracker description now lists slices 1 to 35, and CI on #1 passed after #36,
  browser job included. After the commits, the review reminder offered a review of the whole branch against `master`
  again; its start stopped in preflight with `lens_context_budget_exceeded`, before any consent prompt and without
  creating a review. Routing: slice 36 owns R2-marker-test-weak-assertion and R3-decorator-marker-test-weak-assertion
  (each decorator's own key), R2-session-hook-file-name-mismatch, and R3-validity-minutes-invariant-unenforced;
  R2-t10-row-commit-column-partial is answered as each T10 slice lands in the T10 row.
  R2-session-endpoint-inventory-duplicated and R2-doc-every-request-counts are resolved;
  R2-auth-return-type-erases-plugin-api stays open, because its explanatory comment exists since T5a and removing the
  type erasure would be a type-design change, not a readability fix. Slice 36
  (`feat/m2-identity-36-api-users-readability`, from `8c9233f`) holds the users module, the API test support, the four
  T10a advisories, and these slice 35 advisories.
- **L66** (2026-11-07) Slice 36 (`4a8ebc2` and `54884bd`, PR #37) holds the second API part of the T10 readability
  findings: the users module, the API test support, and the advisories of the T10a and slice 35 reviews, with no
  runtime behavior change. In the users module, the disable failure event joined `DISABLE_USER_EVENT` with its value
  unchanged; the display-name error reads its limit from `DISPLAY_NAME_MAX_LENGTH`; `admin:create` and
  `admin:reset-second-factor` share the initial password window, notice, and dependencies in
  `users/application/initial-password.ts`; the reset refusal reasons derive from `ResetRefusalReason`; the stored
  outcome and the disable counter have clearer local names; and comments now state the non-terminal exit code, that no
  code changes a role, and what a zero-match update means. `auth/inactive-session-hook.ts` became
  `auth/session-access-hook.ts` with identical content, and the parent updated its path in ADR 0004, outside the
  worker's surfaces. The decorator test now pins the keys each decorator writes, so a renamed `ORG_ROLES` fails it;
  the reset tests seed an unconfirmed secret; a new spec pins the sign-in code lifetime in whole minutes; and the API
  test support shares the in-memory own-profile repository and `LOCAL_HOSTS`, derives the counted address blocks from
  `COUNTING_SUITES`, and names the enrollment window. Resolved: R2-already-disabled-derived-from-not-active,
  R2-failure-event-name-outside-event-constant, and R2-client-prefix-range-unexplained (L28);
  R2-display-name-limit-hardcoded-in-error and R2-memory-repository-duplicates-empty-name-mapping (L30);
  R2-enrollment-window-hours-hard-coded, R2-exit-code-doc-omits-non-tty, and
  R2-refusal-reason-inferred-from-status-only (L32); R2-duplicated-local-hosts and R2-unnamed-enrollment-window (L48);
  R2-compensation-failed-test-name-abbreviates-event and R2-racing-enrollment-doc-describes-return-member-as-option
  (L50); R2-counted-block-offsets-hand-maintained (L60); R2-refusal-reason-literals-duplicated,
  R2-reset-deps-derived-from-create-deps, R2-zero-match-labelled-disabled, and
  R3-pending-unconfirmed-secret-not-seeded (L63); and R2-marker-test-weak-assertion,
  R3-decorator-marker-test-weak-assertion, R2-session-hook-file-name-mismatch, and
  R3-validity-minutes-invariant-unenforced (L65). R2-zero-match-labelled-disabled and
  R2-refusal-reason-inferred-from-status-only are answered by comments, because changing the logged label or the query
  would change behavior; R2-outcome-field-stutter is resolved in production code, where the local is now `stored`,
  while the `outcome` field keeps its name, because renaming it would change about 25 test lines and the value that
  `test/create-e2e-administrator.ts` prints. The worker's gates passed (API 342 of 342 and web 249 of 249 tests, and
  `test:db` 66 of 66). An independent verification found all eight items equivalent: 26 scenarios of `admin:create`,
  `admin:reset-second-factor`, and `user:disable` printed byte-identical output and exit codes on the base and on the
  candidate, each against its own disposable PostgreSQL 17; the `user_disable_failed` event and 14 HTTP 400 bodies
  were identical; the compiled JavaScript differed only in local names and in constants of equal value; and mutations
  made the strengthened decorator, pending-secret, and minutes tests fail, while the base pending-secret test had
  passed its mutation. The native review (`review-6d92d33fbfafe379`, high tier, four lenses) approved tree `624c225`
  without correction, with four suggestions that an 11-line second commit answers: the database suite derives its
  enrollment window from `ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS` (R2-db-spec-enrollment-window-third-copy,
  R3-enrollment-window-fixture-not-derived), a test title states what it pins (R2-display-name-test-title-overclaims,
  which the verification also raised), and imports are sorted (R3-reset-command-import-order, together with the
  database suite's order, which predates the slice); its gates passed, `test:db` included. User, choosing an option
  for "El slice 36 está listo: legibilidad de la API, parte 2 (módulo de usuarios, soporte de pruebas de la API y
  avisos del slice 35). Es un refactor sin cambio de comportamiento, de 458 líneas: 146 de código, 252 de pruebas, 8
  de docs y 52 del plan (L65). - El verify independiente lo encontró equivalente: 26 escenarios de admin:create,
  admin:reset-second-factor y user:disable dan la misma salida byte a byte en la base y en el candidato, y las pruebas
  reforzadas fallan ante mutaciones reales. - La revisión nativa (riesgo alto, 4 lentes) lo aprobó con 4 sugerencias.
  Preparé aparte un arreglo de 11 líneas, sin cambio de comportamiento, para esas sugerencias y el aviso del verify: -
  el título de una prueba que prometía más de lo que comprueba; - la ventana de 24 horas de la suite de base de datos,
  que ahora sale de la constante que la aplica; - el orden de los imports en dos archivos. Sus verificaciones están
  corriendo; solo hago ese commit si pasan. ¿Cómo sigo?": "Dos commits, PR y merge (recomendado)", whose description
  reads: "Commit 1: el árbol revisado, tal cual. Commit 2: el arreglo de 11 líneas, solo si pasan sus verificaciones.
  Después publico el PR #37 contra feat/m2-identity y lo mergeo con el CI en verde." PR #37 passed CI, where the
  browser job ran 19 tests, and was merged into the tracker as `3cdde74`, whose tree equals the second commit's; the
  tracker description now lists slices 1 to 36, and CI on #1 passed after #37, browser job included. After the
  commits, the review reminder named the reviewed target; its inspect then offered the whole branch against `master`
  (about 250 paths), whose start stopped in preflight with `lens_context_budget_exceeded` without creating a review.
  The reminder then named that whole-branch target. User, choosing an option for "El aviso de revisión volvió a marcar
  sin revisar el objetivo sha256:42939855…, que es toda la rama contra master (unas 250 rutas). Hace unos minutos ya
  corrí inspect y START para este mismo objetivo, y el proveedor lo frenó en el chequeo previo con
  lens_context_budget_exceeded, sin crear autoridad. Según el proveedor, reintentar este mismo candidato no puede
  funcionar. Cada slice de la rama ya tuvo su propia revisión nativa, incluido el slice 36. ¿Qué hago con este
  objetivo?": "Dejarlo sin revisar (recomendado)", whose description reads: "Lo registro como un objetivo que
  decidiste no revisar, y no vuelvo a lanzar la revisión para él. Las revisiones de cada slice siguen igual." Routed
  to T11: the verification's suggested tests, a pin of the DTO 400 body of `PATCH /me` and a unit test of the
  `admin:create` notice line, which has no command spec. Slice 37 (`feat/m2-identity-37-web-readability`, from
  `3cdde74`) holds the web and harness comments and naming.
- **L67** (2026-11-07) Slice 37 (`041ce73` and `c7b01af`, PR #38) holds the T10 web and harness comments and naming,
  with no runtime behavior change and no change to any Spanish string. On the web server, the api-client `rejected`
  doc now covers 3xx answers, `send` became `sendOwnProfileRequest`, `SERVICE_UNAVAILABLE_BODY` moved into
  `auth-proxy.ts`, its only user, `MINIMUM_PROXY_SECRET_LENGTH` is named and points to the API rule, and
  `logReadFailure` and `readUnlessApiUnavailable` became `logApiCallFailure` and `callUnlessApiUnavailable`;
  `SIGN_IN_CODE_POLICY` and `SECOND_FACTOR_POLICY` name the numbers the copy states, the code patterns derive from
  them, and tests pin the copy to them; one shared `browserFetch` replaces four identical copies; and each API gate of
  the browser harness owns its origin and held groups, with a two-gate test. Resolved:
  R2-api-client-3xx-mapped-to-rejected-contradicts-kind-doc, R2-api-client-generic-send-hardcodes-own-profile,
  R2-proxy-headers-module-holds-error-body, R2-web-secret-min-length-duplicates-api-rule-without-link,
  R2-read-named-helpers-wrap-profile-update, R2-copy-duplicates-api-policy-constants, R2-home-null-comment-misplaced,
  R2-session-is-gone-inverted-doc, R2-browser-fetch-duplicated, R2-gate-factory-mutates-module-origin, and
  R3-gate-origin-module-global; the L40 R2-001 and R2-002 findings and L44 R2-002; and, by inference, L44 R2-003,
  whose comment in `enrollment-copy.ts` gave a delivery reason instead of the real one. R2-internal-helpers-exported
  keeps the exports, now documented, because `enrollment.ts` imports them; R2-config-api-origin-check-misreports (L38)
  was already resolved by the L58 normalization. The Log holds no claim text for L40 R2-003 and R2-005 or for L44
  R2-001, R2-003, R2-004, and R2-005; an inspection found nothing stale in the files of L40 R2-003 and R2-005 and of
  L44 R2-001 and R2-005, and L44 R2-004 points at this plan. The worker's gates passed (API 342 of 342, web 254 of
  254, and the browser suite 19 of 19), and a scratch differential of the code helpers, the copy objects, the
  configuration errors, and the proxy's error answers printed byte-identical output on the base and on the candidate;
  the parent checked the auth proxy, configuration, and administrator sign-in diffs against the base, and no
  independent verifier ran, as the assessment planned none. While the worker was still writing, the review reminder
  named a partial snapshot; its inspect and start, run as the reminder asks, froze it as `review-051d265d4ab8f0bf` (19
  files, 263 lines), and the Pi host granted its consent without a relay. User, choosing an option for "El aviso de
  revisión llevó a un START que el host de Pi aceptó por su cuenta. Quedó abierta la revisión review-051d265d4ab8f0bf
  (riesgo alto, 4 lentes) sobre una foto parcial del slice 37: 19 archivos y 263 líneas, solo los grupos A y B. El
  worker todavía no termina; faltan la función fetch compartida y el gate de pruebas. Si la reviso ahora, son 4
  ejecuciones de modelo sobre trabajo incompleto, y el slice completo va a necesitar otra revisión de 4 lentes. ¿Qué
  hago con esta revisión?": "Esperar al slice completo (recomendado)", whose description reads: "No corro los 4
  revisores sobre la foto parcial. Cuando el worker termine, consulto el STATUS de esta revisión y sigo la ruta que
  ofrezca el proveedor para el slice completo. Si algo queda trabado, te lo informo." That review stays open with no
  reviewer run; a later reminder for another partial snapshot was deferred under the same decision until the worker
  finished, and the next inspect neither listed the open review nor let it block the review of the complete slice. On
  the complete slice, the native review (`review-e0e2c331139e15e4`, high tier, four lenses) approved tree `185e181`
  without correction, with five suggestions that an 85-line second commit answers: the doc of
  `normalizeAuthenticatorCode` names `SECOND_FACTOR_POLICY.codeDigits` (R2-authenticator-normalize-doc-hardcodes-six),
  a table test pins it and `isCompleteAuthenticatorCode` to the outputs of the customer helper they replaced
  (R3-authenticator-normalize-inlined-unproved), `sendOwnProfileRequest` accepts only the path `/me`
  (R2-own-profile-request-path-still-open), both copy suites share one `numbersBefore` shape and the administrator
  suite names its backup-code count (R2-copy-number-pin-helper-duplicated), and the copy pins accept any whitespace
  and singular units (R3-copy-policy-pin-narrow-pattern); its gates passed (web 255 of 255). User, choosing an option
  for "El slice 37 está listo: comentarios y nombres de la web y del arnés de pruebas, sin cambio de comportamiento.
  Son 396 líneas: 211 de código, 114 de pruebas, 2 de docs y 69 del plan (L66). - Ningún texto en español cambió. Las
  cifras que el texto repetía (6 dígitos, 5 minutos, 30 segundos, 15 minutos) ahora tienen nombre, y unas pruebas
  fijan que el texto coincida con ellas. - Las 4 copias idénticas del fetch del navegador quedaron en una sola, y el
  gate de pruebas guarda su estado por instancia. - El diferencial contra la base dio idéntico, y pasan las pruebas
  (API 342/342, web 254/254) y la suite de navegador (19/19). - La revisión nativa (riesgo alto, 4 lentes) lo aprobó
  con 5 sugerencias. Preparé aparte un arreglo de 85 líneas, sin cambio de comportamiento, para esas 5 sugerencias: un
  comentario, un tipo más estricto, una prueba nueva de la normalización del código del autenticador y patrones de
  prueba más amplios. Sus verificaciones pasaron (web 255/255, typecheck, lint y formato). ¿Cómo sigo?": "Dos commits,
  PR y merge (recomendado)", whose description reads: "Commit 1: el árbol revisado, tal cual. Commit 2: el arreglo de
  85 líneas. Después publico el PR #38 contra feat/m2-identity y lo mergeo con el CI en verde." PR #38 passed CI,
  where the browser job ran 19 tests, and was merged into the tracker as `58bf6a3`, whose tree equals the second
  commit's; the tracker description now lists slices 1 to 37, and CI on #1 passed after #38, browser job included.
  After the commits, the reminder named the whole branch against `master` again (about 250 paths), and its start
  stopped in preflight with `lens_context_budget_exceeded`. User, choosing an option for "El aviso de revisión volvió
  a nombrar toda la rama contra master, ahora el objetivo sha256:778223db… (unas 250 rutas, con los commits del slice
  37). Corrí inspect y START, y el proveedor lo frenó otra vez en el chequeo previo con lens_context_budget_exceeded,
  sin crear autoridad. Cada commit nuevo crea otro objetivo de rama completa que el proveedor nunca puede revisar, y
  cada slice ya tiene su propia revisión nativa. ¿Cómo manejo estos objetivos de rama completa de ahora en adelante?":
  "Dejarlos sin revisar, sin preguntarme (recomendado)", whose description reads: "Este objetivo y cada objetivo
  futuro de rama completa contra master que el proveedor ya haya frenado por presupuesto quedan registrados como no
  revisados por tu decisión. No vuelvo a lanzar START para ellos, y te informo cada caso en mi reporte. Las revisiones
  de cada slice siguen igual." Slice 38 (`feat/m2-identity-38-web-behavior`, from `58bf6a3`) holds the web behavior:
  S45 and three test items (L68).
- **L68** (2026-11-07) The `/admin/activar` message for `401 ENROLLMENT_SUPERSEDED`, which L49 left to T10; L44 R2-006
  had noted that the page reads every `401` from `verify-totp` other than `INVALID_CODE` as an ended session. User,
  choosing an option for "Para el slice 38 (comportamiento web) necesito tu decisión pendiente de L49: qué mensaje
  muestra /admin/activar cuando la API responde 401 ENROLLMENT_SUPERSEDED. Esa respuesta llega cuando la confirmación
  del primer código pierde una carrera: otra ventana ya completó la activación, o la activación se reinició (por
  ejemplo, porque un operador emitió una contraseña nueva). Hoy la página lo trata como una sesión terminada y muestra
  «Tu sesión terminó. Ingresa de nuevo con tu correo y tu contraseña.». En todos esos casos la persona tiene que
  volver a ingresar; lo que cambia es si el texto dice por qué. ¿Qué texto quieres?": "Texto nuevo para este caso
  (recomendado)", whose description reads: "Para 401 ENROLLMENT_SUPERSEDED muestro «Esta activación ya no es válida.
  Ingresa de nuevo con tu correo y tu contraseña.». Los demás 401 siguen con «Tu sesión terminó…». El texto es cierto
  en todos los casos que producen esa respuesta, y llevará pruebas del caso y del mensaje." S45 records it, and the
  T10 row now lists S45. Slice 38 implements it together with the three remaining T10 test items:
  R3-variable-weight-range-unproved, R3-admin-script-test-exact-stderr-brittle, and
  R2-signout-note-located-by-sibling-xpath.
- **L69** (2026-11-07) Slice 38 (`91602cb` and `1f62cec`, PR #39) holds the last T10 slice: S45 and three test items.
  `classifyConfirmResponse` now maps `401 ENROLLMENT_SUPERSEDED` to its own failure with the owner's text, and one
  helper decides the sign-in-again offer for it and for an ended session; the enable step and every other `401` are
  unchanged. The test items: `fonts.test.ts` reads the weight range each self-hosted woff2 file draws and checks the
  declared weights against it (R3-variable-weight-range-unproved), the administrator script test checks refusals
  without comparing all of stderr (R3-admin-script-test-exact-stderr-brittle), and the sign-out note is found as the
  page's only `noscript` element (R2-signout-note-located-by-sibling-xpath). The worker's gates passed (API 342 of
  342, web 262 of 262, and the browser suite 19 of 19), with test-first evidence for S45. Before the worker started:
  User, choosing an option for "Voy a lanzar el worker del slice 38. Mientras escribe, el aviso de revisión puede
  volver a nombrar fotos parciales del trabajo, como pasó en el slice 37: ahí START congeló trabajo a medio hacer, el
  host aceptó el consentimiento por su cuenta y quedó abierta una revisión sin uso (review-051d265d4ab8f0bf). ¿Cómo
  manejo esas fotos parciales de aquí en adelante?": "Esperar siempre al slice completo (recomendado)", whose
  description reads: "Mientras un worker escribe, cada foto parcial que nombre el aviso queda sin revisar por tu
  decisión, sin lanzar START, y te la informo en el reporte. La revisión nativa corre sobre el slice completo cuando
  el worker termina, como hasta ahora." The assessment found the slice medium and not due, but that rule promises a
  review of each complete slice: the native review (`review-b4f12df7aa48e3a9`, medium tier, one lens) approved tree
  `7e562e9` without correction, with one suggestion, R3-001: nothing proved that the confirmation step wires the
  superseded failure to the sign-in-again link. A second commit adds a browser test that answers the page's
  `verify-totp` request with the API's exact refusal, because a browser cannot lose the race itself (T7c and T7d prove
  it on PostgreSQL), and checks the S45 text and the «Ingresar de nuevo» link; it fails when the page offers signing
  in again only for an ended session, and the browser suite passes 20 of 20. User, choosing an option for "El slice 38
  está listo, y con él termina T10. Son 342 líneas: 44 de código, 198 de pruebas, 8 de docs y 92 del plan (S45, L67 y
  L68). - S45: para 401 ENROLLMENT_SUPERSEDED, /admin/activar muestra «Esta activación ya no es válida. Ingresa de
  nuevo con tu correo y tu contraseña.» y ofrece volver a ingresar, igual que con una sesión terminada. Los demás 401
  siguen con «Tu sesión terminó…». Es el único texto nuevo. - Los 3 ajustes de pruebas pendientes: el rango de pesos
  de cada fuente, el stderr del script de administración y la nota de cierre de sesión. - Pasan las pruebas (API
  342/342, web 262/262) y la suite de navegador (19/19). - La revisión nativa (riesgo medio, 1 lente) lo aprobó con
  una sugerencia. Preparé aparte una prueba de navegador de 40 líneas para esa sugerencia: confirma que, cuando la
  confirmación llega como superada, la página muestra el texto nuevo y el enlace «Ingresar de nuevo». Falla si el
  enlace deja de mostrarse, y con ella la suite completa pasa 20/20. ¿Cómo sigo?": "Dos commits, PR y merge
  (recomendado)", whose description reads: "Commit 1: el árbol revisado, tal cual. Commit 2: la prueba de navegador de
  40 líneas. Después publico el PR #39 contra feat/m2-identity y lo mergeo con el CI en verde." PR #39 passed CI,
  where the browser job ran 20 tests, and was merged into the tracker as `e5c5c8d`, whose tree equals the second
  commit's; the tracker description now lists slices 1 to 38, and CI on #1 passed after #39, browser job included.
  After the commits, the reminder named the whole branch against `master` again (about 250 paths); its one start
  stopped in preflight with `lens_context_budget_exceeded`, so it stays unreviewed under the rule of L67. T10 is
  complete (L61 to L69). T11 starts on `feat/m2-identity-39-security-evidence`, from `e5c5c8d` (L70).
- **L70** (2026-11-07) T11 plan. A read-only inventory found about 30 items routed to T11 and 11 open owner decisions.
  The review records keep no claim text for R1-001 of T6a, for R4-001 and R4-002 of slice 30 (`session-refresh.ts:72`
  and `:96`), or for R4-001 of T10a (`reset-second-factor.command.ts:83-85`), so T11 re-examines them at those
  locations instead of deciding them from missing text; R1-001 of T5b is the per-email cap, which lets anyone use up a
  victim's codes for an hour. User, choosing an option for "T10 está cerrado. Según el plan, T11 pide verificar de
  forma independiente cada spec (S1 a S45) y tu firma sobre el manejo de secretos, la expiración de sesiones y el
  mapeo de errores; después, el PR #1 puede salir de borrador. El inventario encontró unos 30 asuntos enviados a T11 y
  11 decisiones tuyas. Algunas son de seguridad y deben resolverse antes de escribir código: el valor por defecto y la
  rotación del secreto del proxy, los caracteres invisibles en nombres, el tope de códigos por correo, el respaldo de
  la expiración del administrador, el contrato de logs y la posible brecha A′. Te propongo: - Slice A, solo pruebas,
  unas 300 líneas y sin decisiones: el cuerpo del 400 de PATCH /me, el aviso de admin:create, la carrera entre reset y
  desactivar, una prueba que confirme o descarte la brecha A′, el cambio de nombre justo después de desactivar y la
  trazabilidad de la cuenta antes de la activación. - Mientras corre, tú decides en rondas de hasta 4 preguntas. -
  Después, los slices B (seguridad de la API), C (contrato de logs) y D (bordes de la web). - Al final, un informe de
  verificación independiente de S1 a S45 para tu firma. ¿Cómo quieres organizar T11?": "Plan propuesto (recomendado)",
  whose description reads: "Lanzo ya el slice A de solo pruebas. En paralelo te presento las decisiones en rondas de
  hasta 4 preguntas. Después vienen los slices B, C y D, cada uno con tus decisiones registradas antes del código, y
  al final el informe de verificación para tu firma." Slice 39 holds slice A, tests only.
- **L71** (2026-11-07) T11 decision rounds 1 and 2: while slice A ran (L70), the owner answered eight open questions.
  User, choosing an option for "createAuth recibe la opción requireProxySecret, que hoy vale false por defecto. Si
  alguien arma la autenticación sin pasarla, la API acepta pedidos que no pasan por el proxy de la web. Producción ya
  la pasa en true (auth.registration.ts:34). ¿Qué hacemos con el valor por defecto?": "Exigir el secreto por defecto
  (recomendado)", whose description reads: "Por defecto se exige el secreto; solo las pruebas y el desarrollo local lo
  apagan de forma explícita. Si alguien olvida la opción, la API falla cerrada." `createAuth` defaults
  `requireProxySecret` to `false` (`apps/api/src/auth/auth.factory.ts:336`), and only production passes it, at
  `auth.registration.ts:34`; S46 makes the secret required by default. User, choosing an option for "Hoy la web y la
  API comparten un único secreto, así que rotarlo exige cambiar ambos a la vez; mientras tanto, la API rechaza a la
  web con 403. ¿Cómo quieres rotarlo?": "Aceptar dos secretos al rotar (recomendado)", whose description reads: "La
  API acepta además un secreto anterior opcional, por ejemplo AUTH_PROXY_SECRET_PREVIOUS, mientras dura la rotación:
  se cambia primero la API, después la web, y al final se borra el anterior. No hay corte." The API accepts a single
  proxy secret today (`apps/api/src/auth/auth-request-guard.ts:82-90` and `:141`); S47 adds an optional previous
  secret accepted during rotation, and the example `.env` line is a human edit. User, choosing an option for "Los
  nombres visibles rechazan hoy los caracteres de control, pero aceptan caracteres invisibles de formato, como los que
  invierten la dirección del texto. Con ellos un nombre puede mostrarse distinto de lo que contiene. ¿Qué hacemos?":
  "Rechazar los de dirección (recomendado)", whose description reads: "La API rechaza con el mismo 400 los controles
  de dirección (U+202A a U+202E, U+2066 a U+2069, U+200E, U+200F y U+061C). Sigue aceptando el unidor de ancho cero,
  que usan los emojis compuestos y algunos idiomas." S48 adds the bidirectional controls to the characters that
  `apps/api/src/users/domain/display-name.ts:5` refuses in display names. User, choosing an option for "Cada dirección
  recibe como máximo 5 códigos por hora (S25). Quien conozca un correo puede pedir esos 5 y dejar a su dueño sin
  código durante una hora; la respuesta no cambia y no revela nada. ¿Qué hacemos con ese riesgo?": "Aceptarlo y
  documentarlo (recomendado)", whose description reads: "Se mantiene el tope, que protege la casilla y el costo del
  correo. El bloqueo dura como máximo una hora y queda registrado como riesgo residual aceptado en la firma de T11."
  R1-001 of T5b, the per-email cap of S25, stays as it is; the T11 sign-off report lists it as an accepted residual
  risk, and no spec records it. User, choosing an option for "La sesión de administrador vence 12 horas después de su
  creación. Si la fecha de creación llega inválida, hoy el código usa la hora actual sin avisar
  (session-settings.ts:68-72), así que la sesión recibe 12 horas completas. Better Auth siempre manda esa fecha, así
  que esto solo pasaría por un error. ¿Qué hacemos?": "Fallar cerrado y registrarlo (recomendado)", whose description
  reads: "Una fecha inválida hace que la sesión se trate como vencida y se registre un evento sin datos personales. El
  administrador vuelve a ingresar." The fallback to the current time for an invalid `createdAt`
  (`apps/api/src/auth/session-settings.ts:68-72`) becomes the fail-closed expiry of S49. User, choosing an option for
  "El slice C completa los logs operativos, siempre sin datos personales (ni correos, ni tokens, ni nombres; solo
  eventos, rutas, clases y códigos de error). Incluye: registrar las sesiones rechazadas y borradas, el rechazo
  silencioso al actualizar una sesión, la falla al borrar sesiones hermanas y la causa al fallar la lectura de la
  sesión de administrador en la web; registrar el revert de la activación después de intentarlo, con su resultado;
  agregar el código de error de Prisma (por ejemplo P2002) a las fallas de los comandos; distinguir en la web el corte
  rápido por API caída; y aprobar los campos kind y causa que agregó C1. ¿Qué apruebas?": "El contrato completo
  (recomendado)", whose description reads: "Todos los cambios de la lista, en un slice con sus pruebas, sin datos
  personales en ningún campo." S50 records this log contract. User, choosing an option for "Cuando el navegador
  cancela un pedido a /api/auth, el proxy de la web ya no lo registra como falla, pero responde 502. Nadie recibe esa
  respuesta, pero en las métricas de la plataforma parece una caída de la API. ¿Qué respondemos?": "Responder 499
  (recomendado)", whose description reads: "El código que muchas plataformas usan para «el cliente cerró el pedido».
  Las métricas de errores del servidor dejan de contar las cancelaciones." The `502` that the auth proxy returns after
  a client abort (`apps/web/lib/server/auth-proxy.ts:248-250`) becomes `499`, S51. User, choosing an option for "Sigue
  abierta la decisión de L7 sobre el dominio: .mx o .com. No bloquea M2, porque solo afecta la configuración de
  producción (AUTH_BASE_URL y CORS_ORIGIN) cuando se despliegue. ¿Qué decides?": "Decidirlo al desplegar
  (recomendado)", whose description reads: "Queda abierta y fuera de la firma de M2; se decide en el milestone de
  despliegue." The domain decision of L7 stays open outside M2 and its sign-off; no spec records it.
- **L72** (2026-11-07) Slice A results and T11 decision round 3. Slice A changed only tests and the traceability doc,
  with no production change. It proved the reset-versus-disable race in both orders on PostgreSQL: a disabled
  administrator never keeps a fresh initial password with a live session. It confirmed two gaps, kept as skipped tests
  in `apps/api/src/auth/account-state-races.prisma.db-spec.ts`. A′: when the sibling-session delete of an allowed
  first confirmation throws, `verify-totp` answers `500` but `twoFactorEnabled` stays true, so the password-only
  sessions read `/me`, `get-session`, and `list-sessions`; the cause is that `isPendingAdministrator`
  (`apps/api/src/auth/account-access.ts:55-56`) looks only at the flag. R4: a `user:disable` that commits between the
  guard and the write lets `PATCH /me` answer `200` and store the name
  (`apps/api/src/users/infrastructure/prisma-own-profile.repository.ts:27`). The gates passed: API 343 of 343, and
  `test:db` with 70 passed and 2 skipped. User, choosing an option for "La prueba confirmó la brecha A′. Cuando el
  administrador confirma su primer código, la API lo activa y borra sus otras sesiones abiertas solo con contraseña.
  Si ese borrado falla (por ejemplo, porque la base de datos no responde en ese instante), esas sesiones sobreviven y
  obtienen acceso completo de administrador hasta por 12 horas, sin haber pasado el segundo factor. La causa es que
  hoy la API reconoce una sesión pendiente solo porque la cuenta todavía no activó el segundo factor. ¿Cómo lo
  cerramos?": "Marcar cada sesión (recomendado)", whose description reads: "Cada sesión guarda si se abrió con el
  segundo factor, y la API termina toda sesión de un administrador activado que no lo haya pasado. Cierra la brecha
  aunque la base de datos falle en ese paso. Requiere una migración que agrega una columna a la tabla de sesiones, sin
  borrar datos, en su propio slice. Las sesiones de administrador abiertas antes de esa migración piden ingresar de
  nuevo." S52 records it; the additive migration and the session-access change go in their own slice, at high risk
  because they touch data and security. User, choosing an option for "La prueba también confirmó R4. Si alguien
  desactiva una cuenta justo mientras su dueño cambia su nombre visible, el nombre nuevo se guarda aunque la cuenta ya
  quedó desactivada, y la API responde 200. Desde el pedido siguiente, la cuenta ya no puede hacer nada. ¿Qué
  hacemos?": "Guardar solo si sigue activa (recomendado)", whose description reads: "La escritura exige que la cuenta
  siga activa en ese mismo instante. Si no lo está, la API responde 401, igual que cuando la cuenta ya no existe. Es
  una condición más en la escritura, y la prueba que hoy está en pausa pasa a correr." S53 records the conditional
  write, and the skipped R4 test becomes a required test. User, choosing an option for "Antes de mostrar /ingresar y
  las páginas de /cuenta, la web renueva la sesión con la API y espera como máximo 3 segundos. Si la API tarda más, la
  página muestra el aviso de servicio no disponible sin intentar su propia lectura, aunque esa lectura podría esperar
  hasta 10 segundos. Las páginas de administración no pasan por esta renovación. ¿Qué límite quieres?": "Mantener 3
  segundos (recomendado)", whose description reads: "Si la API está lenta, la página avisa en unos 3 segundos en lugar
  de dejar esperando a la persona. Se documenta que ese es el límite real de esas páginas." S54 records the 3-second
  limit as the documented bound of those pages. User, choosing an option for "El slice A terminó: solo pruebas y la
  tabla de trazabilidad, sin cambios en el código de producción. Todos los chequeos pasan: API 343 de 343, y en la
  base de datos 70 aprobadas y 2 en pausa, que son las dos brechas. Mide unas 560 líneas, más 61 del plan, y el límite
  es de unas 450. ¿Cómo lo entrego?": "Dividir en dos PR (recomendado)", whose description reads: "PR #40, de unas 200
  líneas: las fijaciones (el cuerpo del 400 de PATCH /me, la salida de admin:create y los cuatro endpoints de la
  cuenta pendiente), su parte de la tabla y el plan. PR #41, de unas 430 líneas: las pruebas de carreras y de las dos
  brechas. Cada PR lleva su propia revisión." Slice A ships as two PRs: #40 holds the exact outputs, the clause table,
  and the plan through L72 and S54, and #41 holds the races and the two reproductions.
- **L73** (2026-11-07) Slice 39 (`647ac08` and `37181cb`, PR #40) holds the first half of T11a: the exact `PATCH /me`
  400 body, the `admin:create` stdout checked through a child process on PostgreSQL, the four pending-administrator
  endpoints, the clause table of the ADR 0004 decision 3 clarification, and the plan through L72 and S54. The working
  copy of the traceability doc also held the lines that belong to #41, so its first part was staged by itself and the
  working copy was set to match the index before the review; the native review reads the working tree, not only the
  index. The native review (`review-07085ae1e29df843`, high tier because a test starts a child process; readability
  and reliability lenses) approved tree `b343b7e` with seven advisories. Their claim texts were deleted when the
  authority was burned, so each one was reconstructed from the code at its location. A second commit gives the refusal
  test its own address and proves that it creates no account, bounds the child process at 60 seconds, builds the
  password pattern from the alphabet and length constants, requires an empty stderr on reissue, drops a redundant
  assertion, renames the allow-list test for what it checks, and names slice 40 in the Delivery row. User, choosing an
  option for "La revisión nativa aprobó el PR #40 sin pedir correcciones: nivel alto, dos lentes (legibilidad y
  confiabilidad) y 7 avisos que no bloquean. Preparé las correcciones de los 7 avisos en un cambio aparte, sin tocar
  el árbol revisado. El worker corrigió seis en las pruebas: la prueba de rechazo de admin:create usa su propio correo
  y demuestra que no se escribe nada, el proceso hijo tiene un límite de 60 segundos, el patrón de la contraseña sale
  de las constantes del código, la reemisión comprueba que stderr quede vacío, sobraba una comprobación y el título de
  la prueba de los cuatro endpoints ahora describe lo que realmente comprueba. Yo corregí la fila Delivery del plan.
  Todos los chequeos pasan: API 343 de 343, base de datos 70 aprobadas y 2 en pausa, typecheck, lint y formato. El
  árbol revisado mide 342 líneas, más que las 200 que te anticipé, porque también lleva el registro de tus 12
  decisiones y las specs S46 a S54. ¿Cómo sigo?": "Dos commits, PR y merge (recomendado)", whose description reads:
  "El PR #40 lleva dos commits: el árbol revisado (342 líneas: 111 de pruebas, 22 de la tabla y 209 del plan) y las
  correcciones de los avisos (43 líneas). Después lo integro en el tracker y actualizo el #1." User, choosing an
  option for "Hay archivos temporales de esta sesión fuera del repo. Los que dejaron los workers:
  /tmp/t11-races-backup.ts, /tmp/t11-gate.log, /tmp/t11a-port.txt y /tmp/t11a-scratch.txt, y las carpetas
  tmp.J14LP0B2fJ, tmp.XIoS8K3tTD y tmp.bTM5AVM823 de /var/folders/65/rz7tsz7555q3vb571k24q8jw0000gn/T/. Los
  anteriores: la carpeta de verificación de 4,9 GB (tmp.FhsnS3jYfY), tmp.jgZNxyKgkB de esa misma ruta, y /tmp/.x.
  Guardan copias de pruebas, notas, scripts y una copia del repo para verificar. ¿Los borro?": "Sí, bórralos
  (recomendado)", whose description reads: "Primero miro cada ruta y después la borro con una orden que acepta solo
  esas rutas exactas. Si la política de seguridad bloquea alguna, te la informo." The ten scratch paths outside the
  repository, about 4.9 GB, were looked at and then removed. PR #40 passed CI (run 42442214629, where the browser job
  ran 20 tests) and was merged into the tracker as `ac88ed1`, whose tree equals the second commit's; the tracker
  description lists slices 1 to 39. Slice 40, on `feat/m2-identity-40-account-races`, holds the races file and its 11
  lines of the traceability doc (L72).
- **L74** (2026-11-08) Slice 40 (`b2561c1` and `217472b`, PR #41) holds the second half of T11a: a PostgreSQL suite
  that races `admin:reset-second-factor` against `user:disable` in both orders and proves that a disabled
  administrator never keeps a fresh initial password together with a live session, the A′ and R4 reproductions,
  their lines of the traceability doc, and L73. The native review (`review-ec2782fc98232e47`, high tier, readability
  and reliability lenses) approved tree `094b3b0` with nine advisories; this time their claim texts were read before
  the authority was burned (the Engram record holds them). A worker answered them without touching the reviewed
  tree: the gap tests run as `todo` instead of `skip`, so they execute and fail on the secure-outcome assertion; the
  held disable transaction is released in a `finally` and every wait on it is bounded at 10 seconds (a forced
  assertion failure ended the suite in about 2 seconds instead of hanging it); the lock-wait probe is scoped by
  `pg_blocking_pids` to the backend the held transaction blocks; the sibling-delete matcher reads structured
  arguments; and the T11a row and S53 were corrected. Those fixes came to 179 lines, so the owner was asked: User,
  choosing an option for "La revisión nativa aprobó el PR #41 sin pedir correcciones: nivel alto, dos lentes y 9
  avisos que no bloquean, 6 de nivel WARNING. Las correcciones ya están listas, sin tocar el árbol revisado
  (094b3b0): - Las pruebas de A′ y R4 pasan de `skip` a `todo`, así que ahora se ejecutan. Fallan hoy por la brecha
  misma, no por un problema del arnés, y no rompen la suite. - Si falla una aserción, cada carrera suelta el bloqueo
  retenido en un `finally` y espera como máximo 10 segundos. Lo comprobé forzando un fallo: la suite terminó en 2
  segundos, sin colgarse. - La espera del bloqueo ya no adivina por el texto SQL: identifica el proceso exacto que
  la desactivación tiene bloqueado. - El fallo inyectado revisa los argumentos de la consulta en lugar de su texto
  JSON. - Hay dos renombres, y corregí el plan (la fila T11a y S53) y el documento de trazabilidad.  Todos los
  chequeos pasan: API 343 de 343; base de datos 70 aprobadas y 2 `todo`; typecheck, lint, formato y documentación.
  Las correcciones suman 179 líneas, 167 de ellas en el arnés de carreras, mucho más que en el PR #40. ¿Cómo sigo?":
  "Revisar también las correcciones (recomendado)", whose description reads: "Hago el commit del árbol revisado (464
  líneas). Después corro una revisión nativa solo sobre las correcciones (179 líneas) y, si la aprueba, hago el
  segundo commit, abro el PR #41 y lo integro. Tarda unos minutos más, pero ningún cambio del arnés de carreras
  queda sin una revisión externa." The second native review (`review-50bffbe922af411e`, same tier and lenses)
  approved tree `2cbab88` with six advisories: the `todo` tests cannot tell a harness failure from the gap, the
  matcher recognizes only two query shapes, and the held transaction uses a partial stand-in client that drops
  transaction options, among others. User, choosing an option for "La revisión nativa también aprobó las
  correcciones del PR #41 sin pedir cambios: nivel alto, dos lentes y 6 avisos que no bloquean, 4 de nivel WARNING.
  Los avisos importantes: - Como `todo`, las pruebas de A′ y R4 no distinguen una falla del arnés de la brecha
  esperada. - El fallo inyectado reconoce solo dos formas de la consulta. - La transacción retenida usa un cliente
  falso parcial que no reenvía las opciones de la transacción.  T11b y T11c convierten esas dos pruebas en
  obligatorias y tocan ese mismo arnés, así que lo natural es atender ahí estos avisos. ¿Cómo sigo?": "Dos commits,
  PR y merge; avisos a T11b y T11c (recomendado)", whose description reads: "El PR #41 lleva el árbol revisado
  (b2561c1, 464 líneas) y las correcciones ya revisadas (179 líneas). Después lo integro en el tracker y actualizo
  el #1. Los 6 avisos quedan registrados para T11b y T11c, que vuelven obligatorias las pruebas de las brechas." PR
  #41 passed CI (run 42457433831, where the browser job ran 20 tests) and was merged into the tracker as `3d7bf32`,
  whose tree equals the second commit's; the tracker description lists slices 1 to 40, and T11a is complete. The six
  advisories of the second review go with the T11b and T11c workers, which make the gap tests required. T11b starts
  on `feat/m2-identity-41-api-security` (L71, L72).
- **L75** (2026-11-08) Slice 41 (`b3b58b1` and `044d098`, PR #42) holds T11b. A worker built S46, S47, S48, S49 and
  S53 test first: `createAuth` requires the proxy secret unless a caller opts out explicitly;
  `AUTH_PROXY_SECRET_PREVIOUS` is accepted during a rotation and compared in constant time next to the current secret;
  display names refuse the twelve bidirectional controls; an administrator session with an invalid creation time is
  stored as expired and logs one event; and the display-name write requires an ACTIVE account in the same statement,
  so the R4 test became a required test and passes. The diff came to 554 lines plus 46 of the plan, past the slice
  budget, and the worker had added one rule the quotes did not ask for, so the owner was asked: User, choosing an
  option for "T11b está listo y pasa todos los chequeos: API 372 de 372; base de datos 71 aprobadas y A′ todavía en
  `todo`. La prueba de R4 ya es obligatoria y pasa. Mide 554 líneas, más 46 del plan, y el límite es de unas 450. Unas
  330 son pruebas y 25 son documentación. El secreto del proxy (S46 y S47) y la expiración (S49) tocan los mismos dos
  archivos, auth.factory.ts y auth-request-guard.ts, así que dividirlo obligaría a separar cambios dentro de esos
  archivos. ¿Cómo lo entrego?": "Un solo PR con excepción de tamaño (recomendado)", whose description reads: "El PR
  #42 lleva todo T11b, unas 600 líneas con el plan. Antes pasa por una verificación independiente y por la revisión
  nativa completa, porque toca autenticación." User, choosing an option for "El worker agregó una regla que tu
  decisión no pedía: la API no arranca si AUTH_PROXY_SECRET_PREVIOUS está definido sin AUTH_PROXY_SECRET. Así nunca
  queda un secreto anterior suelto que no sirve para nada. ¿La dejamos?": "Dejarla (recomendado)", whose description
  reads: "Una configuración incoherente impide arrancar en lugar de pasar inadvertida; falla cerrada, igual que el
  resto de la validación del entorno." An independent verification passed S46, S47, S48, S49 and S53 with
  base-versus-candidate differentials, an exhaustive code-point scan for S48 and a captured single SQL statement for
  S53, and offered four regression tests and three low findings. While it ran, the owner pasted the example lines for
  `AUTH_PROXY_SECRET_PREVIOUS` into `apps/api/.env.example`; they were staged into the candidate. The native review
  (`review-385641bf2acc9c1f`, high tier, risk, resilience and reliability lenses) approved tree `184c7d8` (605 lines)
  with two advisories after one relaunch: admission had refused the risk lens because its evidence text said "cannot
  match", which it read as a failed inspection, and consumed no slot. The owner was asked: User, choosing an option
  for "La revisión nativa aprobó T11b sin pedir correcciones. Fue de nivel alto, con tres lentes (riesgo, resiliencia
  y confiabilidad), y dejó 2 avisos que no bloquean. La verificación independiente ya había dado por cumplidos S46 a
  S49 y S53. Entre las dos dejaron estos pendientes: - Dos pruebas dicen probar que un secreto anterior retirado
  recibe 403, pero nunca configuran ese secreto como anterior; pasarían aunque siguiera aceptado. - El guard confía en
  la cabecera de IP si hay secreto anterior pero no actual. Hoy solo lo impide la validación del entorno; propongo que
  el guard falle al construirse. - Las pruebas de navegador no fijan AUTH_PROXY_SECRET_PREVIOUS. - Falta actualizar
  overview.md, el ADR 0004 y dos comentarios. - Hay 4 pruebas de regresión listas para agregar. El árbol revisado
  (184c7d8) mide 605 líneas, incluidas las líneas de .env.example que pegaste. Las correcciones medirían unas 300 más
  y tocan código del guard. ¿Cómo sigo?": "Revisar también las correcciones (recomendado)", whose description reads:
  "Commit 1: el árbol revisado (605 líneas). Un worker hace las correcciones sin preparar (unas 300 líneas); pasan por
  su propia revisión nativa antes del commit 2. Después, PR #42 con los dos commits y merge." User, choosing an option
  for "El otro aviso de la revisión: además de los controles de dirección (S48), los nombres visibles todavía aceptan
  otros caracteres invisibles. Son el espacio de ancho cero U+200B, el unidor de palabras U+2060, un U+FEFF en medio
  del nombre y los separadores de línea y de párrafo U+2028 y U+2029. Con ellos, un nombre puede verse distinto de lo
  que contiene; el impacto es solo visual. ¿Qué hago?": "Riesgo residual en el informe (recomendado)", whose
  description reads: "No cambio la regla. Queda anotado como riesgo residual aceptado en el informe de firma de T11."
  The follow-up worker made the removal tests configure the previous secret before removing it, made the guard refuse
  to build with a previous secret and no current one, pinned the new variable in the Playwright API environment,
  synced the docs and comments, and added the four regression tests (387 lines, tree `d0e6fb0`). Its review
  (`review-d4e84cbfa6ea1326`, high tier, risk and reliability lenses) approved it with two suggestions: an empty
  previous secret is already read as unset, and the race probe of the new S53 PostgreSQL test matches any lock wait on
  `displayName` while `test:db` runs files in parallel, so narrowing it goes to T11c with the routed race-harness
  advisories. PR #42 passed CI (run 42498642868, where the browser job ran 20 tests) and was merged into the tracker
  as `b86f60b`, whose tree equals the second commit's; T11b is complete. The other invisible characters (U+200B,
  U+2060, an inner U+FEFF, U+2028 and U+2029) are a residual risk for the T11 sign-off report. T11c starts on
  `feat/m2-identity-42-session-marker` (L72).
- **L76** (2026-11-08) Slice 42 (`679d72f` and `282ed9f`, PR #43) holds T11c. A worker built S52 test first: an
  additive migration adds `Session.secondFactorVerified` (`BOOLEAN NOT NULL DEFAULT false`), declared to Better Auth
  as a server-only field; the session-create hook marks a session only for an enrolled administrator on
  `/two-factor/verify-totp` and `/two-factor/verify-backup-code`; and the session-access hook deletes an enrolled
  administrator's session that lacks the marker, so the A′ test became a required test and passes. The worker also
  took the six routed race-harness advisories. The slice came to about 680 lines plus the plan, so the owner was
  asked: User, choosing an option for "T11c está listo y pasa todos los chequeos locales: API 401 de 401, base de
  datos 81 de 81 y la prueba de A′ ya es obligatoria y pasa. La migración solo agrega la columna
  Session.secondFactorVerified (BOOLEAN NOT NULL DEFAULT false) y no borra datos: una sesión creada antes conserva sus
  datos con la marca en falso. Faltan las pruebas de navegador, que no pude correr en local; el CI las corre. Mide
  unas 680 líneas más 53 del plan, y el límite es de unas 480. El código de producción son unas 90 líneas; el resto
  son pruebas y documentación. Unas 106 líneas son los avisos del arnés de carreras que mandamos a T11c, y comparten
  archivo con la prueba de A′. ¿Cómo lo entrego?": "Un solo PR con excepción de tamaño (recomendado)", whose
  description reads: "El PR #43 lleva la marca, la migración, la prueba de A′ y los avisos del arnés, unas 730 líneas
  con el plan. Antes pasa por una verificación independiente y por la revisión nativa completa." The native review
  (`review-34e20a43b83e50b0`, high tier, risk, resilience and reliability lenses) approved tree `26f99eb` (738 lines)
  with two advisories: during a rolling deploy a second-factor sign-in served by an old instance is stored unmarked
  and then ended, which is transient; and the harness cleanup could mask an original assertion failure. Its first
  start was refused as invalid lenses, apparently for a non-ASCII character in the reason, and an ASCII reason was
  accepted. An independent verification found no blocker: pre-migration rows survive with the marker false and the
  rest of the data byte-identical, `prisma migrate diff` reports no difference, no client input or path spelling sets
  the marker, only a valid code does, and a 270-row base-versus-candidate battery changes only the stray A′ session
  (now answered as without a session) and the new response key. It offered regression tests and low findings: the
  guard relied on the hook alone (the same at base), the session-update hook did not refuse the marker while
  `model.md` said it refused every update, the new response key and the deploy order were undocumented, and a
  prefix-match mutant survived. The owner was asked: User, choosing an option for "T11c pasó la revisión nativa (nivel
  alto, tres lentes, 2 avisos) y la verificación independiente, sin bloqueos. - Migración: las sesiones previas
  sobreviven con la marca en falso y el resto de los datos queda idéntico. - Ningún cliente puede escribir la marca. -
  Solo un código válido de TOTP o de respaldo la pone. - En 49 rutas, la sesión sobrante de A′ ahora responde como sin
  sesión. Pendientes que propongo atender en un commit aparte (unas 300 líneas, sobre todo pruebas): - Segunda defensa
  en el guard: hoy depende solo del hook. Si la cuenta se activa entre las dos lecturas, `/me` responde 200 una vez.
  Ya pasaba antes de este cambio. - Que el hook de actualización de sesión rechace cualquier cambio de la marca, y
  corregir model.md, que dice que rechaza todo. - Documentar que `get-session` ahora devuelve la marca y que la
  migración debe aplicarse antes o junto con la API. - 7 pruebas de regresión, entre ellas una de ruta exacta que hoy
  ninguna prueba cubre. - El formato de schema.prisma, un comentario y el diagnóstico del arnés. El árbol revisado
  (26f99eb) mide 738 líneas. ¿Cómo sigo?": "Revisar también las correcciones (recomendado)", whose description reads:
  "Commit 1: el árbol revisado (738 líneas). Un worker hace las correcciones sin preparar (unas 300 líneas); como
  tocan el guard y el hook, pasan por su propia revisión nativa antes del commit 2. Después, PR #43 con los dos
  commits y merge." The follow-up (424 lines, tree `ca5faed`) added the seven regression tests, a second check in the
  guard, the update-hook refusal of the marker, the session contract, deploy order and rolling-deploy notes, the
  schema formatting and the harness fix. Its review (`review-745f23ba084c40ac`, high tier, risk and reliability
  lenses) approved it with one suggestion, a test-diagnostics nit for a frozen error, which goes to T11d. PR #43
  passed CI (run 42506614421, where the browser job ran 20 tests) and was merged into the tracker as `55dafc4`, whose
  tree equals the second commit's; T11c is complete and gap A′ is closed. The rolling-deploy skew and the deploy order
  are notes for the T11 sign-off report. T11d starts on `feat/m2-identity-43-log-contract` (L71).
- **L77** (2026-11-08) Slice 43 (PR #44) holds T11d, the operational log contract of S50. A worker built it test
  first: the API logs `session_refused`, `session_ended`, `session_update_refused`,
  `administrator_sibling_sessions_delete_failed`, and `administrator_enrollment_revert_result` with closed reason
  values; the commands add the Prisma error `code` to their failure events; and the web keeps the cause class of a
  failed session read and adds the `short-circuited` kind. No field carries an email address, token, name, IP address,
  or user id, and the tests assert it. The work came to about 1,140 lines, so the owner was asked: User, choosing an
  option for "T11d está completo y pasa todos los chequeos locales: API 437, base de datos 83 y web 265. Ningún evento
  lleva correo, token, nombre, IP ni id de usuario, y las pruebas lo comprueban. Pero mide unas 1.140 líneas (unas 700
  son pruebas) frente al límite de unas 400. Se divide sin conflicto en tres partes que tocan archivos distintos: - A:
  eventos de sesión en la API (rechazada, terminada, actualización rechazada, borrado de hermanas, resultado del
  revert) y el arnés. Unas 800 líneas, con toda la documentación del contrato. - B: el código de Prisma en las fallas
  de los comandos. Unas 200 líneas. - C: la web (causa en la lectura de sesión y el corte rápido). Unas 150 líneas.
  ¿Cómo lo entrego?": "Un PR con tres commits revisados por separado (recomendado)", whose description reads: "PR #44
  con los commits A, B y C. Cada uno pasa su propia revisión nativa antes de su commit, así ninguna revisión ve más de
  unas 800 líneas, y la documentación del contrato completo entra con A. El PR se integra de una vez." Commit A
  (`b9a93e6`, 962 lines) was reviewed as `review-c9ab3ee34bcfca69` (high tier; risk, readability, and reliability
  lenses) and approved with three advisories; commit B (`a96f509`, 203 lines) as `review-1274135561fe64be` (medium
  tier; risk and reliability) with three; and commit C (`75798e2`, 104 lines) as `review-eb122455385bc003` (high tier;
  risk and reliability) with two. A follow-up answered all eight, and the owner was asked: User, choosing an option
  for "Los tres commits de T11d ya están hechos y cada uno pasó su revisión nativa, sin pedir correcciones: - A
  `b9a93e6`, 962 líneas: nivel alto, tres lentes, 3 avisos. - B `a96f509`, 203 líneas: nivel medio, dos lentes, 3
  avisos. - C `75798e2`, 104 líneas: nivel alto, dos lentes, 2 avisos. La corrección ya está lista, sin commit: 39
  líneas en 6 archivos. Reordena un comentario, hace más robusta la prueba que lanza `user:disable`, agrega una prueba
  de un objeto lanzado con `name` que no es Error, documenta que el código de Prisma se valida solo por su forma y
  agrega pruebas de que la página muestra «no disponible» ante `short-circuited` y ante una causa guardada. Comprobé
  en el código que los dos avisos de C no son un riesgo hoy: ningún código decide según `kind`, y `loadAdminView` y
  `loadAccountView` atrapan el error sin imprimirlo. Chequeos con la corrección: API 438, web 266; typecheck, lint,
  formato, documentación y diff-check pasan. ¿Cómo sigo?": "Revisar también las correcciones (recomendado)", whose
  description reads: "Revisión nativa de las 39 líneas como cuarto commit. Si se aprueba: push, PR #44 hacia
  feat/m2-identity con 4 commits (A, B, C y la corrección), CI y merge." The follow-up (`8b948ba`, 39 lines) was
  reviewed as `review-89bc1c4874bd83ae` (high tier; readability and reliability) and approved with no findings. PR #44
  passed CI (run 42509901863) and was merged into the tracker as `98b91da`, whose tree equals the follow-up's; the
  tracker's CI passed too (run 42510173392). T11d is complete. T11e starts on `feat/m2-identity-44-web-edge` (L71,
  L72).
- **L78** (2026-11-08) Slice 44 (`07072fd`, PR #45) holds T11e, the web edge. The plan left the `API_ORIGIN`
  empty-credentials finding of L59 without a decision, and it is a security validation rule, so the owner was asked
  before any code: User, choosing an option for "La web valida `API_ORIGIN` al arrancar, y su mensaje de error dice
  que no admite credenciales. Comprobé que hoy `http://@api:3001` y `http://:@api:3001/` sí se aceptan: la
  normalización de URL borra el `@` vacío y la validación ya no lo ve. Lo dejamos anotado en L59 para T11. Con usuario
  o clave reales (`http://u:p@api:3001/`) ya se rechaza. ¿Qué hago en T11e?": "Rechazar también las credenciales
  vacías (recomendado)", whose description reads: "Se revisa el texto original antes de normalizarlo: cualquier `@`
  antes del host hace fallar el arranque con el mismo mensaje, que ya no echa el valor. El comportamiento coincide con
  lo que dice el error. Una prueba fija los dos casos. Unas 10 líneas." A worker then built the three items test
  first. S51: the auth proxy answers `499` (client closed request) instead of `502` when the browser cancels a
  `/api/auth` request, and still logs no failure; an unreachable API stays `502`, a timeout `504`, and an upstream 5xx
  keeps its status. S54: the comment on `SESSION_REFRESH_TIMEOUT_MS` and the architecture overview state the 3-second
  refresh as the real bound of `/ingresar` and the `/cuenta` pages, with the value unchanged. `API_ORIGIN`: any `@` in
  the raw value fails the startup with the unchanged message, which never echoes the value, because URL normalization
  had dropped empty credentials. The slice, with L77, came to 74 lines; its review (`review-a886cd989d57b2d1`, high
  tier, risk and reliability lenses) approved it with no findings, and the owner was asked: User, choosing an option
  for "T11e está listo y su revisión nativa lo aprobó sin avisos (nivel alto, lentes riesgo y confiabilidad). Son 74
  líneas en 7 archivos, incluidas las 40 del registro L77 del plan: - S51: el proxy responde 499 cuando el navegador
  cancela la petición. Sigue sin registrar falla, y las fallas reales siguen en 502, 504 o el código de la API. - S54:
  el límite de 3 segundos queda documentado como el límite real de /ingresar y /cuenta. El valor no cambia. -
  API_ORIGIN: cualquier `@` hace fallar el arranque con el mismo mensaje, sin repetir el valor. Los formatos válidos
  siguen aceptados. Chequeos: web 266 de 266 y API 438 de 438; typecheck, lint, formato, documentación y diff-check
  pasan. ¿Cómo sigo?": "Commit, PR y merge (recomendado)", whose description reads: "Un commit con el árbol revisado
  (5e65e82), push, PR #45 hacia feat/m2-identity, CI y merge. Después actualizo #1 y empiezo el informe final de T11."
  PR #45 passed CI (run 42512523225) and was merged into the tracker as `e8c092a`, whose tree equals the commit's.
  T11e is complete, and with it T11a to T11e. The T11 verification report and the owner's sign-off start on
  `feat/m2-identity-45-security-signoff`.
- **L79** (2026-11-08) The T11 verification (task `mw8778ss-13-uni3`, on `e8c092a`) reran every gate: API 438, web
  266, and `test:db` 83 passed, as did typecheck, lint, format, and docs, and the tracker's CI was green. It found 53
  specs PASS and S2 PARTIAL, whose last clause is the owner's sign-off, and it reported six new findings: Better
  Auth's own `BETTER_AUTH_SECRETS` replaces the validated secret (N1); a missing `NODE_ENV` turns off every production
  rule (N2); `BETTER_AUTH_SECRET` cannot be rotated and also encrypts the administrators' second factors (N3); a stale
  `NEXT_PUBLIC_API_URL` in the web's example environment file (N4); guard events log the raw request path (N5); and a
  browser abort while the body is read is not mapped to `499` (N6). It also confirmed that `apps/api/.env.example`
  names the wrong `AUTH_BASE_URL`, that the accepted invisible characters are more than the five recorded, and the
  T10a close failure (R9). The parent confirmed N1 and N2 in the code, and the owner was asked: 1. User, choosing an
  option for "La verificación final encontró esto: Better Auth lee por su cuenta la variable `BETTER_AUTH_SECRETS`. Si
  existe, reemplaza a `BETTER_AUTH_SECRET`, que es la que validamos (mínimo 32 caracteres, distinta del secreto del
  proxy). Lo reproduje: con `BETTER_AUTH_SECRETS="7:short"` firmó con "short" y solo dejó un aviso. La API ya rechaza
  `BETTER_AUTH_TRUSTED_ORIGINS` por la misma razón. ¿Qué hacemos?": "Rechazarla al arrancar (recomendado)", whose
  description reads: "Si `BETTER_AUTH_SECRETS` está definida, la API no arranca y nombra la variable sin repetir su
  valor, igual que con `BETTER_AUTH_TRUSTED_ORIGINS`. Lleva una prueba. Unas 15 líneas." 2. User, choosing an option
  for "Si `NODE_ENV` no está definida, la API asume `development`, y entonces se apagan todas las reglas de
  producción: el secreto del proxy, la IP del cliente, la exigencia de https y el envío solo por Resend. El script
  `start` (`node dist/main.js`) no la define. ¿Qué hacemos?": "Exigirla al arrancar (recomendado)", whose description
  reads: "La API no arranca si `NODE_ENV` falta; debe ser development, test o production. Los scripts locales y de
  prueba que hoy no la definen la reciben explícita. Falla cerrado. Unas 20 a 40 líneas, con pruebas." 3. User,
  choosing an option for "`BETTER_AUTH_SECRET` no tiene forma de rotarse. Además cifra los secretos TOTP y los códigos
  de respaldo de los administradores, así que cambiarlo cerraría todas las sesiones y dejaría a cada administrador
  activado sin poder usar su segundo factor hasta correr `admin:reset-second-factor`. Ningún documento lo dice. ¿Qué
  hacemos?": "Documentarlo ahora y rotar después (recomendado)", whose description reads: "README y arquitectura
  explican qué rompe rotarlo y cómo recuperar a cada administrador. Usar la lista `secrets` de Better Auth para rotar
  sin romper queda como tarea del milestone de despliegue. Solo documentación." 4. User, choosing an option for "¿Cómo
  entrego lo que sale de esta verificación? Además de N1 a N3 hay arreglos pequeños: `close()` en el comando de
  reinicio (R9), 499 también si el navegador cancela mientras se lee el cuerpo (N6), limitar la ruta que se registra
  en los eventos de la guarda (N5), las correcciones del documento de trazabilidad y del ADR (F5), una prueba de las
  llaves foráneas para S2, y guardar el informe en el repositorio. Los dos `.env*` (F1 y N4) los editas tú; te paso el
  contenido exacto.": "Una slice T11f con todo lo pequeño (recomendado)", whose description reads: "PR #46 con N1 a N3
  según tus respuestas, R9, N5, N6, F5, la prueba de S2, las pruebas de los riesgos aceptados y el informe. Pasa por
  pruebas primero, revisión nativa y tu aprobación. Después viene la firma." S55, S56, and S57 record the first three
  answers, and T11f holds the slice. The owner edits the two example environment files (F1, N4).
- **L80** (2026-11-08) Slice 45 (PR #46) holds T11f. A worker built it test first (L79): startup refuses
  `BETTER_AUTH_SECRETS` (S55) and requires `NODE_ENV` (S56); the rotation of `BETTER_AUTH_SECRET` is documented (S57);
  guard events log at most 128 characters of the path (N5); a failing store `close()` keeps a command's exit code
  (R9); a browser abort while the body is read answers `499` (N6); and new tests pin the S2 foreign keys, the accepted
  display-name characters (R2), and the committed `.env.example` (F1). It came to about 1,110 lines, so the owner was
  asked: 1. User, choosing an option for "T11f quedó listo, con pruebas primero, para N1, N2, la documentación de N3,
  R9, N5, N6, F5, la prueba de llaves foráneas de S2, la prueba que fija R2 y el documento de evidencia. Chequeos: API
  468 de 470 (las 2 que fallan son la prueba de `.env.example`, que pasa cuando cambies la línea 6), web 268 de 268,
  base de datos 87 de 87; typecheck, lint, formato, documentación y diff-check pasan. Mide unas 1.110 líneas frente al
  límite de unas 400: unas 616 de código y pruebas, y unas 495 de documentación (evidencia 301, trazabilidad, ADR,
  arquitectura, README) y del plan (L78, L79, S55 a S57). El worker también actualizó la decisión 9 del ADR (NODE_ENV
  obligatoria, BETTER_AUTH_SECRETS rechazada), que si no quedaba desactualizada, y usa eventos nuevos `*_close_failed`
  para que un reinicio ya hecho no se registre como falla. ¿Cómo lo entrego?": "Un PR con dos commits revisados aparte
  (recomendado)", whose description reads: "PR #46 con A: código y pruebas (unas 616 líneas) y B: documentación y plan
  (unas 495). Cada uno pasa su propia revisión nativa antes de su commit, como en T11d. Hago el commit A cuando hayas
  cambiado la línea 6 de `apps/api/.env.example`, para que el CI pase." Part A (`6e476c9`, tree `6c46c37`) passed
  `review-6dc65b5ad5841c71` (high tier) with three advisories, and the owner was asked: 2. User, choosing an option
  for "La parte A de T11f (código y pruebas, 616 líneas) pasó la revisión nativa: nivel alto, lentes riesgo,
  resiliencia y confiabilidad, aprobada con 3 avisos. - R3-proxy-abort-ordering (advertencia): el 499 de N6 depende de
  que la señal de cancelación ya esté marcada cuando falla la lectura del cuerpo. Si llega en otro orden, la respuesta
  sería un 500. Arreglo: tratar también un AbortError de esa lectura como cancelación del navegador, porque esa
  lectura no tiene plazo propio. Lleva una prueba. - R3-env-example-external-dependency (advertencia): la prueba de
  `.env.example` depende de un archivo que editas tú. Se arregla cuando cambies la línea 6 a
  `AUTH_BASE_URL=http://localhost:3000`; `NODE_ENV=development` ya está en la línea 1. - R3-dev-script-posix-env
  (sugerencia): `NODE_ENV=development node ...` en el script `dev` solo funciona en shells POSIX (macOS y Linux), no
  en Windows. El commit A espera tu cambio en `.env.example` para que el CI pase. ¿Cómo sigo?": "Revisar también las
  correcciones (recomendado)", whose description reads: "Commit A con el árbol revisado (6c46c37) en cuanto cambies la
  línea 6. Luego una corrección aparte para el orden de la cancelación, con su propia revisión nativa. El script `dev`
  queda POSIX y se anota. Después la parte B y el PR #46." The owner edited `apps/api/.env.example` by hand
  (`c12f6dc`). The abort-ordering fix (`81c5668`) passed `review-5bf0a49adc2b42df` together with part A, with three
  advisories, and the owner was asked: 3. User, choosing an option for "La revisión nativa aprobó juntas la parte A y
  la corrección del orden de cancelación (árbol f4990a2: nivel alto, lentes riesgo, resiliencia y confiabilidad). Hubo
  3 avisos: - R1-001 (sugerencia): un `BETTER_AUTH_SECRETS` que solo tiene espacios cuenta como ausente, porque la
  validación recorta el valor. Better Auth lee el valor crudo, así que los dos podrían no coincidir. Arreglo: rechazar
  cualquier valor definido que no sea vacío exacto. - R3-close-wiring-untested (advertencia): solo hay pruebas para el
  helper y para `admin:reset-second-factor`. Ninguna prueba cubre el cierre de `admin:create` ni el de `user:disable`,
  ni sus eventos `*_close_failed`. - R3-env-example-external-dependency (advertencia): se resuelve con tu cambio en la
  línea 6 de `apps/api/.env.example`, que sigue pendiente. ¿Cómo sigo?": "Revisar también las correcciones
  (recomendado)", whose description reads: "Commit A (6c46c37) y commit de la corrección ya revisada (f4990a2) cuando
  cambies la línea 6. Luego otra corrección pequeña, con su propia revisión, para R1-001 y las pruebas del cierre de
  `admin:create` y `user:disable`. Después la parte B y el PR #46." That follow-up (`f94db2f`) refuses a
  whitespace-only value of either library variable and pins the commands' close wiring; it passed
  `review-1de3b669abbd9c3d` with advisories on its entry guard, and the owner was asked: 4. User, choosing an option
  for "La segunda corrección (R1-001 y las pruebas del cierre de `admin:create` y `user:disable`) pasó la revisión
  nativa: nivel medio, lentes riesgo y confiabilidad, aprobada con 3 avisos. Mide 427 líneas, más de lo «pequeña» que
  te dije; 275 son las dos pruebas nuevas de comandos. API 497 de 497, web 270, base de datos 87. - R1-001 y
  R3-entrypoint-guard-main-undefined (dos advertencias sobre lo mismo): para que una prueba de base de datos que carga
  el comando con `node -e` siguiera pasando, `admin:create` ahora también arranca cuando `require.main` no está
  definido. Eso puede pasar al importarlo desde ESM, un REPL o `node -e`: el comando correría con los argumentos del
  proceso que lo importó, abriría una conexión a la base y cambiaría el código de salida. No permite crear un
  administrador (sin terminal o sin correo válido se rechaza), pero es un efecto no buscado. Arreglo: volver al
  `require.main === module` estricto, como `user:disable`, y que esa prueba llame a un `main()` exportado. Unas 10
  líneas. - R3-weak-no-echo-assertion (sugerencia): la prueba de «nunca repite el valor» es débil; mejor comparar el
  mensaje completo. Unas 5 líneas. ¿Cómo sigo?": "Revisar también las correcciones (recomendado)", whose description
  reads: "Commit de esta corrección con su árbol revisado (228100a). Luego una tercera corrección de unas 15 líneas
  (guarda estricta y aserción exacta) con su propia revisión. Después la parte B y el PR #46." `95b66a4` made
  `admin:create` start only on a direct run and passed `review-10f91d599059c6e8` with one advisory, and the owner was
  asked: 5. User, choosing an option for "La tercera corrección (guarda estricta de `admin:create` con `main()`
  exportado, y la aserción exacta del mensaje) pasó la revisión nativa: nivel medio, lentes riesgo y confiabilidad, 34
  líneas. Antes del cambio, la prueba de base de datos fallaba 85 de 87; con él, API 497, web 270 y base de datos 87.
  Hubo 1 aviso: - R3-001 (advertencia): ninguna prueba demuestra que correr `admin:create` como script lo arranca, ni
  que importarlo no hace nada. La prueba de base de datos ahora llama a `main()` directamente y no pasa por la guarda.
  Arreglo: dos pruebas sin base de datos que lancen el comando en un proceso aparte. Sin argumentos, debe imprimir el
  uso y salir con 2. Al importarlo con `require`, no debe imprimir nada y debe salir con 0. Unas 30 líneas. ¿Cómo
  sigo?": "Revisar también la prueba (recomendado)", whose description reads: "Commit de esta corrección con su árbol
  revisado (9cdf206). Luego las dos pruebas de la guarda como último commit de código, con su propia revisión. Después
  la parte B y el PR #46." The guard tests (`13616dc`) passed `review-89a5c14a77662a94`. Part B (`9668b02`: the
  evidence report, README, ADR 0004, overview, traceability, L78, L79, and S55 to S57) passed
  `review-7907f684bae83700` with seven consistency advisories, and the owner was asked: 6. User, choosing an option
  for "Terminé los commits de código de T11f: `6e476c9`, `81c5668`, tu `.env.example` en `c12f6dc`, `f94db2f`,
  `95b66a4` y `13616dc`. Cada uno tiene su árbol revisado. API 499, web 270, base de datos 87. Al último (las pruebas
  de la guarda) le quedó un aviso menor: compara stderr exacto, así que un aviso de Node podría romperla sin que la
  guarda falle. La parte B (documentación y plan: informe de evidencia, trazabilidad, ADR, README, arquitectura, L78,
  L79 y S55 a S57; 502 líneas) pasó la revisión nativa: nivel alto, lentes legibilidad y confiabilidad, aprobada con 7
  avisos. Todos son de coherencia de los documentos: - F1 aparece todavía como pendiente, aunque tu cambio ya está en
  `c12f6dc`. - La regla de S55 está escrita de tres formas. - U+180E está en una lista de caracteres y falta en la
  otra. - Hay conteos del cruce de trazabilidad que no cuadran. - El README sobre `NODE_ENV` es ambiguo. - Un aviso
  dice que el código no está en el candidato. No aplica: el código está en los commits anteriores y la revisión solo
  veía los documentos. ¿Cómo sigo?": "Dos commits, PR y merge (recomendado)", whose description reads: "Commit B con
  el árbol revisado (756b7c9) y un commit aparte, solo de documentación, que corrige los 6 avisos de coherencia y
  afloja la comparación de stderr de la prueba de la guarda. Luego push, PR #46 hacia feat/m2-identity, CI y merge.
  Después tu firma." `0642ba6` aligned the documents. PR #46 passed CI (run 42527131750) and was merged into the
  tracker as `1f9ca0c`, whose tree equals `0642ba6`'s; the tracker's CI passed too (run 42527367522). Gates: API 499,
  web 270, and `test:db` 87.
- **L81** (2026-11-08) T11 sign-off. With T11a to T11f merged (#40 to #46) and
  `docs/development/m2-security-evidence.md` reporting 53 specs PASS, S2 PARTIAL, and none FAIL, the owner was asked:
  1. User, choosing an option for "Ya están integradas todas las partes de T11, de T11a a T11f (#40 a #46; tracker
  `1f9ca0c`). El informe `docs/development/m2-security-evidence.md` da 53 specs como PASS, S2 como parcial (solo falta
  tu firma) y ninguna como FAIL; S55 a S57 quedan cubiertas por T11f. Las tres áreas que firmas son: - Secretos: el
  secreto del proxy se compara en tiempo constante y se puede rotar. La validación del arranque exige `NODE_ENV` y
  rechaza `BETTER_AUTH_SECRETS`. Los registros no llevan secretos ni datos personales. - Expiración de sesiones:
  cliente 7 días; administrador 12 horas sin renovación; ventana de activación de 24 horas; marca de segundo factor
  por sesión; al deshabilitar una cuenta se borran sus sesiones. - Mapeo de errores: 401, 403 y 400 genéricos en la
  API; respuestas que no revelan si una cuenta existe; el proxy responde 499, 502, 504 y 5xx; las páginas muestran «no
  disponible». Riesgos aceptados: el tope por correo, los caracteres invisibles en nombres, el orden del despliegue
  (migrar antes de la API y definir `NODE_ENV=production`) y la rotación de `BETTER_AUTH_SECRET`, que queda para el
  milestone de despliegue. Quedan abiertos el dominio y `CORS_ORIGIN`. ¿Firmas S2?": "Firmo S2 con estos riesgos
  aceptados (recomendado)", whose description reads: "Registro tu firma en el informe y en el plan (S2 pasa a PASS), y
  T11 queda completo." 2. User, choosing an option for "Tres hallazgos antiguos (R8: T6a R1-001; R10: slice 30 R4-001
  y R4-002; R14: R4-003) perdieron su texto original. El verificador revisó el código actual y no encontró ningún
  defecto. ¿Qué hacemos con ellos?": "Darlos por cerrados (recomendado)", whose description reads: "El informe los
  marca como cerrados por tu decisión, con la evidencia de la nueva revisión." 3. User, choosing an option for "Riesgo
  R2: los nombres visibles aceptan caracteres invisibles. Son 10 en total (9 fijados por pruebas, y U+180E aceptado
  sin prueba), y un nombre hecho solo de U+200B pasa. El impacto es solo visual. ¿Qué hacemos?": "Aceptarlo con su
  alcance real (recomendado)", whose description reads: "Queda como riesgo aceptado en tu firma, con la lista
  completa. Una regla más estricta puede venir en otro milestone." 4. User, choosing an option for "Después de
  registrar tu firma, ¿saco el PR #1 (`feat/m2-identity` hacia `master`) de borrador? El merge a `master` lo sigues
  decidiendo tú.": "Sí, sacarlo de borrador (recomendado)", whose description reads: "Lo marco como listo para
  revisión con `gh pr ready 1` después del commit de la firma. No lo integro." S2 is therefore PASS, the re-examined
  claims R8, R10, and R14 are closed, R2 is an accepted risk with its full scope, and T11 is complete. The stale
  partial review `review-051d265d4ab8f0bf` (L67) was still open, so the owner was asked: User, choosing an option for
  "Sigue abierta la revisión parcial `review-051d265d4ab8f0bf`, de la foto incompleta del slice 37 (19 archivos, 263
  líneas, árbol `0f1bd319`). Ese slice se integró hace tiempo en #38, y su código ya pasó por revisiones posteriores y
  por la verificación final de T11. El proveedor solo ofrece correr los 4 revisores sobre esa foto vieja. ¿Qué hago?":
  "Abandonarla (recomendado)", whose description reads: "Uso la operación `abandon` del proveedor sobre esa revisión.
  No corre ningún revisor, no toca el código y la revisión deja de aparecer como abierta. Queda anotado en el plan."
  The provider's `abandon` needs a maintainer authorization that only the owner composes, so the owner runs it. PR #1
  leaves draft after this record; merging it to `master` stays the owner's decision.
