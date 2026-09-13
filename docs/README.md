# InvitaMe documentation index

Use the root [`AGENTS.md`](../AGENTS.md) as the canonical operating policy. This index separates implemented
foundation evidence from target design so that a planned document is never mistaken for a shipped feature.

## Recommended reading order

1. [`../CLAUDE.md`](../CLAUDE.md) — short agent entrypoint and navigation.
2. [`../AGENTS.md`](../AGENTS.md) — authority, source-of-truth hierarchy, architecture, security, and quality rules.
3. [`../ROADMAP.md`](../ROADMAP.md) — ten milestones with explicit current/planned status and non-goals.
4. [`architecture/overview.md`](architecture/overview.md) — current runtime map and planned module boundaries.
5. [`architecture/ai-operating-model.md`](architecture/ai-operating-model.md) — actionable AI workflow and handoffs.
6. [`development/quality-gates.md`](development/quality-gates.md) — current scripts and Definition of Done.
7. [`development/git-workflow.md`](development/git-workflow.md) — branch, work-unit, staged-diff, and PR procedure.
8. [`development/anti-patterns.md`](development/anti-patterns.md) — failure modes and preferred alternatives.
9. [`database/model.md`](database/model.md) — implemented migration invariants.
10. [`database/future-model.md`](database/future-model.md) — design-only future data analysis; no tables are added.
11. [`architecture/module-template.md`](architecture/module-template.md) — structure for a real future API module.
12. [`adr/`](adr/) — accepted architectural decisions, including the proportional AI workflow.

## Current versus planned

### Implemented foundation

- `apps/web` contains the current Next.js 16 landing page.
- `apps/api` contains configuration, Prisma ownership, the health module, and a database-backed health check.
- The first Prisma migration contains the minimal user identity record, catalog, and immutable template-version
  foundations only; authentication behavior is still planned.
- Root scripts provide local format, lint, typecheck, test, build, and Docker/PostgreSQL commands.

### Planned design

The target module map, invitation flows, payment/media/guest/RSVP/analytics models, CI/CD, and release operations
are documented for sequencing and decision-making. They are not implemented because they appear in a roadmap or
architecture document.

Documentation states decisions and intent. Executable code, tests, package scripts, Prisma schema, migrations,
seed data, and reproducible generated behavior remain the source of truth for runtime behavior. If a document and
the repository disagree, report the conflict and preserve executable truth.
