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
| T2 | Production configuration matrix (every variable per app, secret vs config, required and refused rules) | S1, S5 | worker | |
| T3 | Railway service descriptors (build with `prisma:generate`, predeploy `migrate deploy`, start, health check) and a web health route | S1, S5 | worker | |
| T4 | CI hardening for S5 (missing material gates, a guard that a removed gate fails CI) | S1, S5 | worker | |
| T5 | Backup and restore with Railway (S3), the migration recovery and release rollback plan | S3, S5 | worker | |
| T6 | Release checklist, post-release verification, operations runbooks, alert ownership table | S1, S5 | worker | |
| T7 | Performance checks for the public invitation and critical API reads | S1 | worker | |
| T8 | External setup with the owner: Railway project, domain, secrets, Resend, R2, cron, alerts, first release | S1-S5 | owner | |

## Log

- L1 — Owner: «si» (after the M9 delivery) — do the M9 follow-up PR and then start Milestone 10.
- L2 — Owner answers: order «Primero el repositorio (recomendado)»; payments «Gratis (recomendado)»; backups «Solo
  Railway»; branch protection «Sí, lo configuro yo (recomendado)».
- L3 — T1 (parent): `gh api PUT repos/trueno950/invitame/branches/master/protection` — required checks «Quality gates»,
  «Database tests», «Browser tests»; `strict: false` (chained PRs merge after each retarget without a forced update);
  no required review (single owner); no force push, no deletion; `enforce_admins: false`.
