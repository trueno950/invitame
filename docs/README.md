# InvitaMe documentation index

Use the root [`AGENTS.md`](../AGENTS.md) as the canonical operating policy. This index is the navigation map for
the repeatable AI development cycle and separates implemented foundation evidence from target design so that a
planned document is never mistaken for a shipped feature.

## Start here

For every task, follow this short path before editing:

1. [`../CLAUDE.md`](../CLAUDE.md) — agent entrypoint.
2. [`../AGENTS.md`](../AGENTS.md) — authority, conflict resolution, architecture, security, and quality rules.
3. [`../CONTEXT.md`](../CONTEXT.md) — canonical product vocabulary when names or boundaries are unclear.
4. [`architecture/ai-operating-model.md`](architecture/ai-operating-model.md) — the cycle and the task-specific
   reading map below.

Then read only the sources selected by the request classification. The operating model requires executable evidence
to be checked before prose, and it defines when a human decision is required.

## Read by request

| Request or risk | Read next | Verify against |
| --- | --- | --- |
| Product scope, milestone, or non-goal | [`../ROADMAP.md`](../ROADMAP.md) | Current source, tests, schema, migrations, seed data, and scripts. |
| Runtime boundary or API/web architecture | [`architecture/overview.md`](architecture/overview.md) | `apps/web`, `apps/api`, package scripts, and tests. |
| Web page look, colors, fonts, ornaments, or shared UI classes | [`design/theme.md`](design/theme.md) | `apps/web/app/globals.css`, `apps/web/app/_components`, and `apps/web/lib/theme/contrast.test.ts`. |
| New API capability or module placement | [`architecture/module-template.md`](architecture/module-template.md) | Existing module tree and the affected imports. |
| Prisma, migration, seed, or persistence work | [`database/model.md`](database/model.md), [`database/future-model.md`](database/future-model.md), and [`development/quality-gates.md`](development/quality-gates.md) | `apps/api/prisma/schema.prisma`, migrations, seed, and database commands. |
| Security, authorization, provider, public route, or trust boundary | [`../AGENTS.md`](../AGENTS.md) and [`development/anti-patterns.md`](development/anti-patterns.md) | The real API/web boundary, tests, and relevant accepted ADRs. |
| Verification or Definition of Done | [`development/quality-gates.md`](development/quality-gates.md) | `package.json`, workspace scripts, CI, and command output. |
| Branch, staged diff, commit, PR, or delivery | [`development/git-workflow.md`](development/git-workflow.md) and the GitHub templates | Git status, branch/remotes, complete diff, and human authorization. |
| A hard-to-reverse, surprising trade-off | [`adr/`](adr/) | The human decision and the affected executable boundary. |

## Complete document map

- [`../CONTEXT.md`](../CONTEXT.md) — canonical product vocabulary.
- [`../ROADMAP.md`](../ROADMAP.md) — ten milestones with explicit current/planned status and non-goals.
- [`architecture/ai-operating-model.md`](architecture/ai-operating-model.md) — repeatable AI development cycle and reading map.
- [`architecture/overview.md`](architecture/overview.md) — current runtime map and planned module boundaries.
- [`design/theme.md`](design/theme.md) — the current visual theme: tokens, fonts, ornaments, motion, and contrast rules.
- [`development/quality-gates.md`](development/quality-gates.md) — current scripts and Definition of Done.
- [`development/deployment.md`](development/deployment.md) — production configuration matrix per app, first-release values, and Railway services.
- [`development/deployment-services.md`](development/deployment-services.md) — the two Railway service descriptors, their exact build, migration, and start commands, and the prerequisites the first deploy needs.
- [`development/backup-restore.md`](development/backup-restore.md) — the Railway backup, restore-drill, RPO/RTO, and release-rollback plan, with the invariants a rollback must not break.
- [`development/runbooks.md`](development/runbooks.md) — the release checklist, the payment, email, media, retention, secret-rotation, and admin-lockout runbooks, and the alert-ownership table.
- [`development/performance.md`](development/performance.md) — the latency check for the public invitation and its API read, with its budgets.
- [`development/payments.md`](development/payments.md) — payment modes, environment, the simulated signature scheme, adding a real provider adapter, and the production checklist.
- [`development/media-storage.md`](development/media-storage.md) — invitation media storage, environment, serving, and the cleanup command.
- [`development/git-workflow.md`](development/git-workflow.md) — branch, work-unit, staged-diff, and PR procedure.
- [`development/anti-patterns.md`](development/anti-patterns.md) — failure modes and preferred alternatives.
- [`development/m2-security-evidence.md`](development/m2-security-evidence.md) — Milestone 2 security evidence: spec verdicts, sign-off areas, and open risks.
- [`database/model.md`](database/model.md) — implemented migration invariants.
- [`database/future-model.md`](database/future-model.md) — design-only future data analysis; no tables are added.
- [`architecture/module-template.md`](architecture/module-template.md) — structure for a real future API module.
- [`adr/`](adr/) — accepted architectural decisions, including the proportional AI workflow.

## Current versus planned

### Implemented foundation

- `apps/web` contains the Next.js 16 launch landing page at `/` (hero, catalog gallery by occasion, the three
  seeded packages, the four steps, and the FAQ, with «Crear mi invitación» leading to
  `/cuenta/invitaciones/nueva`), the customer pages, the administrator pages, and the `/api/auth` proxy, styled
  with the visual theme in [`design/theme.md`](design/theme.md).
- `apps/api` contains configuration, Prisma ownership, the health module, Better Auth sign-in and sessions
  ([ADR 0004](adr/0004-authentication-with-better-auth.md)), access control, the own profile, and the operator
  commands; see [`architecture/overview.md`](architecture/overview.md).
- The first Prisma migration contains the minimal user identity record and the catalog and immutable
  template-version foundations; the second maps Better Auth's user onto that record and adds the session,
  account, verification, two-factor, and rate-limit tables (see [`database/model.md`](database/model.md)).
- Root scripts provide local documentation consistency, format, lint, typecheck, test, build, and Docker/PostgreSQL
  commands.
- A limited GitHub Actions quality-gate CI workflow runs documentation consistency, format, lint, typecheck, test,
  build, and diff-hygiene checks on pushes to `master` and `main` and on pull requests.

### Planned design

The target module map, invitation flows, payment/media/guest/RSVP/analytics models, CD, hosted deployment,
required-check governance, issue/PR enforcement, and release operations are documented for sequencing and
decision-making. They are not implemented because they appear in a roadmap or architecture document.

Documentation states decisions and intent. Executable code, tests, package scripts, Prisma schema, migrations,
seed data, and reproducible generated behavior remain the source of truth for runtime behavior. If a document and
the repository disagree, report the conflict and preserve executable truth.
