# ADR 0003: Proportional AI-first development workflow

## Status

Accepted.

## Context

InvitaMe is being built with AI assistance, but the current repository is a greenfield MVP foundation with limited
quality-gate CI and no required-check governance or large planning system. A useful workflow must prevent invented
scope, architecture drift, unsafe data changes, and unreviewable diffs without copying heavier machinery that the
product does not yet need.

## Decision

Adopt a proportional, evidence-led workflow:

1. Brief the goal, scope, non-goals, affected paths, acceptance criteria, commands, rollback, and decisions that
   still need human approval.
2. Consult the task-specific sources, canonical vocabulary, and executable repository evidence; classify risk before
   editing.
3. Make architecture and security decisions explicit for medium/high-risk work.
4. Implement one small vertical slice with behavior tests and synchronized current documentation.
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
- The limited CI workflow checks documentation consistency and deterministic quality gates; it does not authorize
  delivery or replace human review and approval.
- Optional read-only AI review can provide advisory feedback, but it never replaces human diff review and no review
  switch or CI gate is enabled by this ADR.
- Future automation may enforce these checks after the repository has an approved GitHub and deployment workflow.

## Non-goals

This ADR does not introduce feature modules, schema tables, authentication, providers, CD, required-check
governance, Git hooks, SDD artifacts, microservices, or an automated AI reviewer.
