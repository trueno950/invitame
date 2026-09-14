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
- [`development/quality-gates.md`](development/quality-gates.md) — current scripts and Definition of Done.
- [`development/git-workflow.md`](development/git-workflow.md) — branch, work-unit, staged-diff, and PR procedure.
- [`development/anti-patterns.md`](development/anti-patterns.md) — failure modes and preferred alternatives.
- [`database/model.md`](database/model.md) — implemented migration invariants.
- [`database/future-model.md`](database/future-model.md) — design-only future data analysis; no tables are added.
- [`architecture/module-template.md`](architecture/module-template.md) — structure for a real future API module.
- [`adr/`](adr/) — accepted architectural decisions, including the proportional AI workflow.

## Current versus planned

### Implemented foundation

- `apps/web` contains the current Next.js 16 landing page.
- `apps/api` contains configuration, Prisma ownership, the health module, and a database-backed health check.
- The first Prisma migration contains the minimal user identity record, catalog, and immutable template-version
  foundations only; authentication behavior is still planned.
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
