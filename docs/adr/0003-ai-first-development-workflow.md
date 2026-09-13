# ADR 0003: Proportional AI-first development workflow

## Status

Accepted.

## Context

InvitaMe is being built with AI assistance, but the current repository is a greenfield MVP foundation rather than
a mature product with CI enforcement or a large planning system. A useful workflow must prevent invented scope,
architecture drift, unsafe data changes, and unreviewable diffs without copying heavier machinery that the product
does not yet need.

## Decision

Adopt a proportional, evidence-led workflow:

1. Brief the goal, scope, non-goals, affected paths, acceptance criteria, commands, rollback, and decisions that
   still need human approval.
2. Map repository evidence and classify risk before editing.
3. Make architecture and security decisions explicit for medium/high-risk work.
4. Implement one small vertical slice with behavior tests and current documentation.
5. Run deterministic checks, inspect the complete diff, and report blocked checks honestly.
6. Obtain human approval before commit, push, pull request, merge, deploy, release, external-service creation,
   or destructive migration.

Direct work is preferred when scope is clear. Read-only delegated mapping or writing is allowed when it reduces
cognitive load, provided the handoff is bounded and the primary agent reconciles the result with executable source.
Structured planning, ADRs, or SDD may be used when their overhead is justified; SDD is not mandatory for every
change.

## Human authority

Humans own product scope, milestone boundaries, architecture approval, security decisions, destructive migration
impact, external services, and delivery actions. AI can inspect, propose, implement, and verify approved bounded
work, but cannot silently widen the change or treat a prior prompt or memory as runtime truth.

## Consequences

- Small work units remain understandable and reversible.
- Current code, tests, Prisma schema, migrations, seed data, and package scripts remain the runtime source of truth.
- Documentation must distinguish implemented foundation from planned product architecture.
- Optional read-only AI review can provide advisory feedback, but it never replaces human diff review and no review
  switch or CI gate is enabled by this ADR.
- Future automation may enforce these checks after the repository has an approved GitHub and deployment workflow.

## Non-goals

This ADR does not introduce feature modules, schema tables, authentication, providers, CI/CD, Git hooks, SDD
artifacts, microservices, or an automated AI reviewer.
