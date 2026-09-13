# AI operating model

`AGENTS.md` is the canonical policy. This document turns that policy into a practical workflow for building
InvitaMe with AI while keeping product, architecture, security, and delivery decisions under human authority.

## Operating principle

AI accelerates bounded work; it does not become the product owner, architect of record, security approver, or
release operator. Every change must be evidence-led, reviewable, reversible, and explicit about what it does not
change.

## End-to-end workflow

Use this sequence for a feature, defect, documentation change, or architecture proposal:

1. **Intake and brief** — state the user problem, desired outcome, constraints, and whether the request changes
   runtime behavior, data, security, or only documentation.
2. **Context mapping** — inspect the repository policy, source-of-truth files, affected symbols and paths,
   current tests, and relevant accepted ADRs. Record current versus planned behavior.
3. **Risk classification** — classify the work as low, medium, or high risk. Data/schema, authentication,
   payment, publication, media, public routes, permissions, secrets, and external providers are at least medium;
   destructive changes and trust-boundary changes are high.
4. **Architecture decision** — for medium/high risk work, write down the smallest viable design, dependencies,
   invariants, rejected alternatives, migration or rollback plan, and human decision needed. Do not implement a
   consequential architecture choice silently.
5. **Implementation** — make one small vertical slice. Keep behavior, tests, and documentation together where
   they explain the same change. Do not add future modules or dependencies “for later.”
6. **Tests** — add or update tests that prove observable behavior and failure paths. Test the real boundary when
   the risk is a database, browser, authorization decision, payment, publication, or webhook.
7. **Deterministic checks** — run the applicable format, lint, typecheck, test, build, database, and diff checks
   from [`quality-gates.md`](../development/quality-gates.md). Never describe a skipped command as passing.
8. **Review** — inspect the complete diff, generated-file status, secrets exposure, dependency changes, scope,
   rollback boundary, and documentation accuracy. A read-only AI review may provide another signal, but it is
   advisory.
9. **Human approval** — the human decides whether the scope, architecture, security posture, migration impact,
   and evidence are acceptable.
10. **Delivery** — only after explicit authorization may a human-owned delivery action occur: commit, push, PR,
    merge, deploy, release, or external-service change.

## Required task brief or handoff

Every task prompt, delegated exploration, or handoff should include:

| Field | Required content |
| --- | --- |
| Goal | The observable outcome and who benefits. |
| Scope | Exact behavior, documents, or paths allowed to change. |
| Non-goals | Explicitly excluded modules, providers, schema work, refactors, or delivery actions. |
| Affected paths | Known files, runtime boundaries, symbols, and data boundaries. |
| Acceptance criteria | Testable behavior, documentation outcome, and failure cases. |
| Commands | Exact verification commands and any required local services or environment setup. |
| Rollback | The files or behavior that can be reverted without removing unrelated work. |
| Authority | Decisions still requiring human confirmation, especially security, schema, or external-service work. |

If a field is unknown, mark it unknown and investigate. Do not fill uncertainty with a plausible assumption.

## Handling uncertainty and failure

- **Unclear requirement:** stop at the smallest ambiguity that changes scope or risk, state the competing
  interpretations, and ask one focused question. Do not implement both.
- **Conflicting documents:** executable evidence wins. Report the exact conflict, preserve runtime truth, and
  update the smallest stale document after the human decision.
- **Failed check:** treat the failure as information. Read the complete error, determine whether it is a code,
  environment, or unavailable-service problem, fix only within scope, and rerun the relevant check. Do not weaken
  the check, hide output, or claim green status.
- **Unavailable check:** record the exact command, reason it could not run, and the risk left unverified. A blocked
  check is not a pass.
- **Secrets:** never request, print, copy, commit, or place secrets in prompts, logs, fixtures, screenshots, URLs,
  generated output, or documentation. Use environment examples with placeholders only.
- **Unrelated worktree changes:** inspect status before editing, preserve unrelated changes, do not stage or revert
  them, and call them out in the final evidence.
- **Scope creep:** stop when the acceptance boundary expands. Propose a follow-up work unit instead of quietly
  changing architecture, schema, dependencies, or product scope.

## Choosing the work mode

| Mode | Use when | Boundary |
| --- | --- | --- |
| Direct work | The target files and acceptance criteria are clear and the change is bounded. | The same agent maps, edits, and verifies the slice. |
| Delegated exploration | The repository area is unfamiliar or impact analysis is broad. | The mapper returns evidence and candidate paths; it does not widen scope. |
| Delegated writer | The content shape is clear but the document is large or repetitive. | The writer follows the approved outline and must not invent runtime claims. |
| Structured planning (optional) | The work spans multiple modules, risks a migration, or needs staged approval. | Use a plan, ADR, or other approved planning artifact only when it earns the overhead. SDD is not mandatory. |

Delegation separates investigation from implementation; it does not transfer human authority. The primary agent
remains responsible for reconciling the result with repository evidence.

## Roles and review separation

- **Mapper:** identifies current behavior, source-of-truth files, dependencies, risks, and blast radius.
- **Writer:** implements the approved code or documentation slice without changing the acceptance boundary.
- **Verifier:** runs deterministic checks and behavior tests, recording exact results and unavailable checks.
- **Reviewer:** reads the complete diff for scope, architecture, security, tests, and documentation consistency.
- **Human approver:** accepts product scope, architecture/security decisions, destructive migrations, external
  services, and delivery actions.

One agent may perform several roles for a small slice, but the responsibilities must remain explicit. A read-only
AI review is optional and advisory; it must not receive permission to edit, and it never replaces human diff
review or approval. This repository does not enable an AI review switch or claim automated review enforcement.

## Memory and documentation

Record durable decisions, discoveries, bugs, and process conventions in the appropriate project documentation or
approved project memory. Keep the entry concise: what changed, why, where, and what was learned. Link to the
canonical document instead of copying the same rule into multiple places.

Memory is context for future work, not runtime truth. Current code, tests, Prisma schema, migrations, seed data,
and package scripts decide what is implemented. Retrieved memory must be verified against the checkout before it
guides a code or security decision.

## Delivery boundary

AI may prepare a diff and verification report. It must not commit, push, open or merge a pull request, deploy,
release, create an external service, or approve a destructive migration unless the human explicitly authorizes
that exact action. See [`git-workflow.md`](../development/git-workflow.md) for the repository procedure.
