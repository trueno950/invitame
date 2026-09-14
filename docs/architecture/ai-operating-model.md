# AI development operating model

Use this document for every feature, defect, documentation change, configuration change, or architecture proposal.
It turns the policy in [`AGENTS.md`](../../AGENTS.md) into a repeatable cycle: load the right context, keep the
request bounded, implement only approved work, prove the result, synchronize documentation, and stop at the human
decision or delivery boundary.

## Cycle at a glance

1. **Preflight** — inspect the checkout, preserve unrelated work, and load the minimum required context.
2. **Classify** — identify the request type, risk, scope, non-goals, affected boundaries, and human decisions.
3. **Resolve language** — consult [`CONTEXT.md`](../../CONTEXT.md) and settle ambiguous product terms before naming
   code, data, routes, or acceptance criteria.
4. **Explore and specify** — map executable evidence, affected symbols and paths, design the smallest slice, and
   write a brief or decision record when the risk justifies it.
5. **Implement** — make one bounded vertical slice without silently widening behavior, dependencies, or schema.
6. **Verify** — run the applicable deterministic and boundary checks, then inspect the complete diff.
7. **Synchronize** — update the smallest affected documentation set and run the documentation consistency check.
8. **Review and hand off** — report evidence, unresolved risk, and next work; obtain human approval before delivery.

The order is intentional. Do not begin implementation while scope, trust boundaries, or a material source conflict
remain unresolved.

## Source-of-truth order

When two sources disagree, use this order and show the evidence:

1. **Executable repository evidence** — package scripts, source, tests, Prisma schema, migrations, seed data,
   environment examples, CI configuration, and reproducible command output.
2. **`AGENTS.md`** — contributor policy, authority boundaries, and non-negotiable technical rules.
3. **`CONTEXT.md`** — canonical product vocabulary only; it does not prove runtime behavior.
4. **Accepted ADRs** — decisions and trade-offs that the repository has explicitly accepted.
5. **Detailed documentation** — architecture, database, development, and workflow guidance.
6. **`ROADMAP.md`** — planned sequence, outcomes, and non-goals.
7. **Task prompts, prior memory, and generated summaries** — useful context, never runtime truth.

If prose claims that a route, model, control, provider, or workflow exists, verify it in the executable sources before
repeating the claim. Preserve the executable behavior, report the conflict, and update the smallest stale document
after the human decision when the conflict affects scope, architecture, security, or data.

## What to read, and when

| Trigger | Read before editing | Then verify |
| --- | --- | --- |
| Every task | [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md), and [`docs/README.md`](../README.md) | `git status`, branch, recent history, affected source, tests, and scripts. |
| Product scope or milestone | [`ROADMAP.md`](../../ROADMAP.md) and [`CONTEXT.md`](../../CONTEXT.md) | Current routes, source, tests, schema, migrations, seed data, and package scripts. |
| Runtime boundary or module placement | [`overview.md`](overview.md) and [`module-template.md`](module-template.md) | Existing `apps/web`/`apps/api` tree and imports. |
| Prisma, migration, seed, or data contract | [`../database/model.md`](../database/model.md), [`../database/future-model.md`](../database/future-model.md), and [`../development/quality-gates.md`](../development/quality-gates.md) | `apps/api/prisma/schema.prisma`, migrations, seed, and database command output. |
| Security, authorization, public route, or provider | [`AGENTS.md`](../../AGENTS.md), [`../development/anti-patterns.md`](../development/anti-patterns.md), and relevant ADRs | The real trust boundary, failure tests, and approved library/provider boundary. |
| Verification or process change | [`../development/quality-gates.md`](../development/quality-gates.md), [`../development/git-workflow.md`](../development/git-workflow.md), CI, and templates | Package scripts, CI steps, exact command output, and complete diff. |
| Hard-to-reverse or surprising trade-off | Existing [`../adr/`](../adr/) entries | Alternatives, consequences, human decision, and affected executable boundary. |

Do not read every document by default. Follow the table, then expand only when the affected evidence or risk requires
it. The index is the navigation map; this document owns the cycle.

## 1. Preflight and context loading

Before editing:

- Read the entrypoint and the policy, then inspect the current checkout:

  ```bash
  git status --short
  git branch --show-current
  git log --oneline -5
  ```

- Confirm the request is for this repository and identify the allowed paths.
- Preserve unrelated working-tree changes. Do not reset, stash, revert, stage, or overwrite them without explicit
  instruction.
- Check whether the request changes runtime behavior, data/schema, security, external services, repository process,
  or documentation only.
- Treat the current branch, remotes, CI triggers, package scripts, and migration history as repository state to
  inspect, not assumptions to copy from an older task or document.

The preflight output is a short evidence note: current branch, unrelated changes, relevant sources, and any initial
contradictions.

## 2. Classify the request and set the boundary

Write a task brief before implementation. Use this minimum shape:

| Field | Required answer |
| --- | --- |
| Goal | What observable outcome is needed, and who benefits? |
| Request type | Product behavior, defect, data/schema, security, configuration, documentation/process, or delivery preparation. |
| Scope | Exact behavior, documents, or paths allowed to change. |
| Non-goals | Explicitly excluded features, refactors, providers, schema work, generated output, and delivery actions. |
| Affected boundary | Runtime, module, data, trust, CI, documentation, or repository boundary. |
| Acceptance criteria | Observable success and failure scenarios. |
| Verification | Exact commands, services, fixtures, and boundary tests needed. |
| Rollback | The smallest change set that can be reverted without removing unrelated work. |
| Human decisions | Product, architecture, security, destructive migration, external-service, or delivery decisions still open. |

### Risk classification

| Risk | Examples | Required handling |
| --- | --- | --- |
| Low | Bounded documentation, copy-free navigation, deterministic tooling with no runtime effect. | Direct work is acceptable after context mapping and checks. |
| Medium | New API behavior, persistence, authorization, public routes, dependency/build changes, or provider adapters. | Record design, invariants, failure paths, and the human decision before implementation. |
| High | Destructive migration, trust-boundary change, authentication/cryptography, payment, secrets, external service, or delivery action. | Stop at the human approval boundary until scope, recovery, and security decisions are explicit. |

The request type and risk determine which documents to read and which checks are mandatory. A task is not bounded if
its acceptance criteria imply an unapproved feature, schema, provider, or delivery operation.

## 3. Resolve vocabulary and ambiguity

Use [`CONTEXT.md`](../../CONTEXT.md) before choosing names for domain concepts, routes, records, capabilities, or
states. Keep product language separate from implementation names.

When a term is ambiguous or conflicts with the glossary:

1. State the competing meanings in the brief.
2. Inspect executable evidence and the relevant accepted design documents.
3. Choose the meaning only when the evidence is sufficient; otherwise ask one focused question before editing.
4. If the meaning is durable and shared, update `CONTEXT.md` with the canonical term and its boundary.
5. Do not turn a wording decision into an ADR or implementation change unless it also creates a hard-to-reverse,
   surprising trade-off.

Examples of boundaries worth making explicit: `Template` versus `TemplateVersion`, a catalog `Feature` versus
executable capability behavior, an `Invitation` versus a catalog template, and a planned publication flow versus a
currently available route.

## 4. Explore, design, and specify

Map the smallest useful slice before writing it:

- Find the current entry point, affected symbols, callers, tests, package scripts, schema/migration ownership, and
  documentation links.
- Record what is implemented, what is planned, and what is absent. Do not create files merely because a target
  architecture diagram shows them.
- For low-risk work, an inline plan in the task brief is enough.
- For medium/high-risk work, document invariants, dependencies, rejected alternatives, migration/recovery impact,
  test boundaries, and the exact human decision needed before implementation.
- Create an ADR only when the choice is hard to reverse, surprising without context, and the result of a real
  trade-off. Use the existing ADR format; do not create an ADR for ordinary procedure or terminology.
- Use structured planning only when it earns its overhead. SDD artifacts are not required for every change and must
  not be created without explicit approval.

The design must preserve dependency direction: presentation maps transport, application orchestrates, domain owns
pure invariants, and infrastructure implements technical ports. The design must also preserve the current/planned
distinction in any affected documentation.

## 5. Implement one bounded slice

Implementation rules:

- Change only the approved paths and behavior.
- Keep tests and documentation with the behavior or process they explain.
- Prefer existing dependencies, scripts, patterns, and module boundaries.
- Do not add empty layers, speculative providers, future schema, broad refactors, or hidden automation.
- Do not use names from catalog data to select arbitrary code paths.
- Do not treat client state, hidden UI, provider payloads, memory, or a previous prompt as authorization or runtime
  truth.
- Do not silently repair a documentation conflict by changing runtime behavior.

One agent may map, implement, verify, and review a small slice, but the responsibilities and human decision boundary
must remain visible in the handoff.

## 6. Verify the observable outcome

Use [`../development/quality-gates.md`](../development/quality-gates.md) to select the checks. For every change,
report the exact command and observed result; a skipped or unavailable check is not a pass.

At minimum, source and documentation changes use:

```bash
pnpm docs:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

Add `pnpm build` for runtime, dependency, package-script, or build-configuration changes. Add the database sequence
for schema, migration, seed, or database claims. Test the real boundary for database, browser, authorization,
publication, payment, webhook, and provider behavior; a mock proves only the behavior it actually models.

After checks pass, inspect:

- `git status --short`, `git diff --stat`, and `git diff --name-only`;
- the complete diff, including generated-file status and any staged diff when staging is authorized;
- secrets, local environment files, credentials, build output, dependency changes, schema/migration impact, and
  unrelated work; and
- whether every acceptance criterion and failure path is represented by evidence.

## 7. Synchronize documentation

Documentation synchronization is part of the same work unit, not a later cleanup task.

| Change made | Synchronize |
| --- | --- |
| Runtime behavior or API contract | Affected architecture/module documentation, tests, and current/planned status. |
| Prisma schema, migration, seed, or invariant | `docs/database/model.md`, relevant future model/roadmap text, quality gates, and recovery evidence. |
| Product scope or milestone | `ROADMAP.md`, `CONTEXT.md` when vocabulary changes, and the affected architecture or database document. |
| Repository process, script, CI, or template | `AGENTS.md` only for policy, the detailed workflow document for procedure, `docs/README.md` navigation, and the relevant template/CI file. |
| Documentation-only change | Link targets, current/planned labels, source-of-truth claims, and the documentation consistency check. |

Update the smallest canonical document. Link to it instead of copying long policy text into multiple files. Keep
`AGENTS.md` concise, keep `CONTEXT.md` free of implementation details, and preserve accurate sections rather than
rewriting them for style alone.

Run `pnpm docs:check` after synchronization. It checks required entrypoints and workflow sections and resolves local
Markdown links across the repository. It does not prove runtime behavior or replace the normal quality gates.

## 8. Review, approve, and hand off

Review the complete diff against the brief. Confirm scope, non-goals, current/planned labels, tests, documentation,
rollback, secrets, and residual risk.

### Human approval boundary

AI may inspect, propose, implement approved bounded work, verify it, and prepare a report. Human approval is required
before accepting product scope, milestone changes, architecture, security posture, destructive migration impact,
external-service creation, commit, push, pull request, merge, deploy, release, or other delivery action. Passing
checks does not grant that approval.

If a required decision or material check is unresolved, stop and report it. Do not choose a reversible-looking default
when the consequence affects trust, data, public behavior, or delivery.

### Closure report

Before declaring a work unit complete, provide:

- status and a one-paragraph outcome;
- exact changed paths and the rollback boundary;
- scope completed and explicit non-goals;
- verification commands with observed results, including blocked checks and residual risk;
- source conflicts found and how executable truth was preserved;
- human decisions still required; and
- the next recommended bounded work unit.

### Next-cycle handoff

Record durable decisions, discoveries, bugs, or conventions in the appropriate project documentation or approved
project memory. Keep the handoff concise and link to canonical sources. The next AI must repeat preflight and verify
the current checkout; a handoff, memory entry, or prior prompt never replaces repository evidence.

## Roles and review separation

- **Mapper:** identifies current behavior, sources, dependencies, risks, and blast radius.
- **Writer:** implements the approved code or documentation slice without widening scope.
- **Verifier:** runs deterministic checks and behavior tests, recording exact results and unavailable checks.
- **Reviewer:** reads the complete diff for scope, architecture, security, tests, and documentation consistency.
- **Human approver:** accepts product scope, architecture/security decisions, destructive migrations, external
  services, and delivery actions.

One agent may perform several roles for a small slice. Delegation, when used, must include the goal, scope,
non-goals, affected paths, acceptance criteria, commands, rollback, and authority boundary; it never transfers human
authority. Read-only AI review is advisory and never replaces human diff review.
