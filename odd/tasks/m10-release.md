# Milestone 10 — Production readiness and first release

Status: owner decisions recorded (L2); repository-only slices first, then the external setup with the owner. Source of
scope: `ROADMAP.md` Milestone 10. Nothing is deployed today: there is no Railway project, domain, production email,
media bucket, or payment credential.

## Specs

- S1 — Order: «Primero el repositorio (recomendado)» — «Lo que no necesita tus cuentas: matriz de variables y
  secretos, archivos de Railway, health/readiness, CI más estricto, respaldos, runbooks y checks de rendimiento.
  Después creamos Railway, dominio, correo, R2 y Mercado Pago contigo.»
- S2 — Payments at the first release: «Gratis (recomendado)» — «PAYMENTS_MODE=free: se publica sin cobrar hasta que
  hagamos la prueba en sandbox de Mercado Pago con tus credenciales de prueba.»
- S3 — Backups: «Solo Railway» — «Los respaldos que ofrece Railway según el plan; menos piezas, pero dependes de él
  para restaurar.» The repository documents how to use, verify, and restore them; it adds no backup script.
- S4 — Branch protection: «Sí, lo configuro yo (recomendado)» — «master exige los tres checks (calidad, base de
  datos, navegador) y no admite push directo.»
- S5 — Exit criteria (ROADMAP): «Critical workflows have human-approved operational owners and tested recovery
  paths.»; «CI/CD runs the documented quality gates without silently skipping material checks.»; «The first release
  can be rolled back without rewriting migration history or losing invitation/payment truth.»

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Branch protection on `master` | S4 | inline | see L3 |
| T2 | Production configuration matrix (every variable per app, secret vs config, required and refused rules) | S1, S5 | worker | see L4 |
| T3 | Railway service descriptors (build with `prisma:generate`, predeploy `migrate deploy`, start, health check) and a web health route | S1, S5 | worker | see L4 |
| T4 | CI hardening for S5 (missing material gates, a guard that a removed gate fails CI) | S1, S5 | worker | see L5 |
| T5 | Backup and restore with Railway (S3), the migration recovery and release rollback plan | S3, S5 | worker | see L5 |
| T6 | Release checklist, post-release verification, operations runbooks, alert ownership table | S1, S5 | worker | see L5 |
| T7 | Performance checks for the public invitation and critical API reads | S1 | worker | see L5 |
| T9 | CI review follow-ups: `PATCH` in the required-check procedure, a seed-idempotence assertion, three guard gaps | S5 | worker | see L7 |
| T8 | External setup with the owner: Railway project, domain, secrets, Resend, R2, cron, alerts, first release | S1-S5 | owner | |

## Log

- L1 — Owner: «si» (after the M9 delivery) — do the M9 follow-up PR and then start Milestone 10.
- L2 — Owner answers: order «Primero el repositorio (recomendado)»; payments «Gratis (recomendado)»; backups «Solo
  Railway»; branch protection «Sí, lo configuro yo (recomendado)».
- L3 — T1 (parent): `gh api PUT repos/trueno950/invitame/branches/master/protection` — required checks «Quality gates»,
  «Database tests», «Browser tests»; `strict: false` (chained PRs merge after each retarget without a forced update);
  no required review (single owner); no force push, no deletion; `enforce_admins: false`.
- L4 — T2 (worker): `docs/development/deployment.md`, the production configuration matrix: 35 API and 5 web variables, each
  rule cited from the validators and each failure message observed by running them, the `PAYMENTS_MODE=free` first-release
  subset, the ordered secret production, and the open owner decisions. T3 (worker): `railway.api.json` and
  `railway.web.json` (one service per file; config paths `/railway.api.json` and `/railway.web.json`, empty root
  directory), `GET /health` on the web with its test, and `docs/development/deployment-services.md`. Parent: the web test
  script now also runs `app/**/*.test.ts`, so the health suite is in CI (1873 → 1877 tests); the two first-deploy
  prerequisites are numbered (`RAILPACK_PRUNE_DEPS=false` on the API, `RAILPACK_NODE_VERSION=26` on both); the service
  document is authoritative for descriptor commands and is linked from `docs/README.md`. Evidence: API 1973, web 1877,
  typecheck, lint, format, docs:check, `pnpm build`, diff-check.
- L5 — T4 (worker): `scripts/check-ci-gates.mjs` (documented gates ↔ workflow, both directions, `--self-test` 7 cases) wired
  into «Quality gates»; `pnpm db:check` and `pnpm db:seed` twice added to «Database tests»; required checks documented in
  `docs/development/git-workflow.md` §8. T5 (worker): `docs/development/backup-restore.md` (Railway-only backups, the
  restore drill, RPO/RTO, release rollback with its invariants; every Railway claim marked «confirm at project
  creation»). T6 (worker): `docs/development/runbooks.md` (nine runbooks and a 20-row alert table whose destinations are
  honestly undecided until T8). T7 (worker): `scripts/check-performance.mjs` (bounded latency check, budgets measured
  locally: web p95 250 ms, API 100 ms, provisional) + `docs/development/performance.md`. Parent: `pnpm performance:check`,
  the two index lines, the runbooks→backup-restore link.
  Evidence: API 1973, web 1877, the CI gate guard and its self-test, the performance dry run, typecheck, lint, format,
  docs:check, diff-check.
- L6 — T4-T7 delivered as chained PRs #117 (CI), #118 (backups), #119 (performance), #120 (runbooks), CI green, merged;
  master `862df74`. Native review of #117 `review-dd8974379479b5f7` approved (the others were passive or medium, not
  due). Its non-blocking findings become T9: «GitHub documents that endpoint's update operation as PATCH»; «never
  observes whether the second run created rows»; «a documented local-only gate such as `pnpm db:up` or `pnpm db:down`
  could be added to CI and the guard would still pass»; «If the heading remains but the table rows are deleted … the
  guard passes»; «removing the self-test step would leave the guard green». Owner: «el pr» — do T9 before T8.
- L7 — T9 (worker): `git-workflow.md` changes a required check with `gh api --method PATCH …/required_status_checks`
  (`strict` + `checks`, per GitHub REST «Update status check protection»), and every `gh api` call names its method;
  «Database tests» records the six seeded tables' row counts between the two seeds and fails when the second seed
  changes any (`scripts/check-seed-idempotence.mjs --record/--verify`); the CI guard refuses a local-only gate in CI,
  an emptied or incomplete required-checks table, and a removed `--self-test` or seed-count step (self-test 7 → 12
  cases, RED observed per gap). Evidence: guard, self-test, API 1973, web 1877, typecheck, lint, format, docs:check,
  scripts lint, diff-check; the seed-count step proved on a disposable database (pass, and fail on an extra row).
