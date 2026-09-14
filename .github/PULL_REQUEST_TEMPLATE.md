## Linked issue

<!-- Issue linkage is recommended now and becomes required when GitHub governance is adopted. Use
     `Closes #N`, `Fixes #N`, or `Resolves #N` when an issue exists; otherwise explain why it is not linked. -->

## Change type

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation or process
- [ ] Refactor or maintenance
- [ ] Test

## Outcome

<!-- What observable problem does this change solve? -->

## Scope and non-goals

- Scope:
- Non-goals:
- Rollback boundary:

## Affected paths

| Path | Purpose of the change |
| --- | --- |
|  |  |

## Verification

List exact commands and results. Do not describe blocked or unavailable checks as passing.

- [ ] `pnpm format:check`
- [ ] `pnpm docs:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build` (when applicable)
- [ ] `git diff --check`
- [ ] Database checks (when applicable):
- [ ] Unavailable checks and residual risk are documented:

## Documentation synchronization

- [ ] I followed the AI operating model's source-reading path for this change.
- [ ] Current behavior and planned design are labeled accurately in affected documentation.
- [ ] Affected documentation, glossary terms, links, scripts, CI, and templates are synchronized, or the reason is
      recorded in the outcome.
- [ ] Any source-of-truth conflict and the evidence used to resolve it are recorded.

## Review checklist

- [ ] I read the complete diff, including staged files.
- [ ] Current behavior and planned design are not confused.
- [ ] No secrets, local environment files, generated output, or unrelated changes are included.
- [ ] No unapproved dependency, schema, security, or external-service change is hidden in the diff.
- [ ] Documentation and tests explain the behavior where applicable.
- [ ] Human approval is obtained for the repository actions this PR requires.
