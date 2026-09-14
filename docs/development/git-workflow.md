# Git change workflow

This is the intended workflow for reviewable InvitaMe changes. It documents procedure; it does not install hooks,
create GitHub automation, or authorize delivery actions. The repository has a limited quality-gate CI workflow for
pushes to `master` and `main` and pull requests, but no CD/hosted deployment automation or issue/PR enforcement.
Branch names, remotes, and history are repository state: inspect them before using a command instead of copying an
older branch assumption from this document.

## 1. Start from a known base

Inspect before touching anything:

```bash
git status --short
git branch --show-current
git log --oneline -5
```

When `main` exists and the work is authorized:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c docs/operating-model
```

If `main`, `origin`, or a remote workflow does not exist, stop and surface that repository decision. Do not
silently rename branches, create remotes, or discard the current branch. Preserve unrelated working-tree changes;
never reset, stash, revert, or stage them without explicit instruction.

## 2. Branch names

Branch names use this regex:

```text
^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)/[a-z0-9._-]+$
```

Use lowercase `type/description` names with no spaces:

```text
feat/invitation-authoring
fix/public-slug-collision
docs/operating-model
chore/update-local-checks
test/rsvp-duplicate-response
```

The branch type describes the primary work unit, not every file touched.

## 3. Work-unit commits

One commit should tell one reviewable story:

- include the smallest vertical behavior or documentation/process unit;
- keep tests and documentation with the behavior they explain;
- keep the diff focused and name the rollback boundary;
- do not mix drive-by refactors, generated output, unrelated formatting, or speculative dependencies; and
- make sure the repository remains understandable if only that commit is applied.

Use the adapted Conventional Commit format:

```text
<type>(<scope>): <imperative outcome>
```

The allowed type pattern is:

```text
^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9._-]+\))?!?: .+
```

InvitaMe examples:

```text
docs(architecture): define invitation renderer boundaries
docs(process): document AI-assisted delivery workflow
docs(roadmap): separate implemented foundation from planned milestones
feat(invitations): create version-pinned invitation draft
fix(payments): reject duplicate provider events
test(rsvp): cover duplicate response behavior
chore(tooling): align local verification commands
```

Do not add `Co-Authored-By` or AI-authorship trailers.

## 4. Local pre-commit sequence

InvitaMe currently has no committed Husky hook or other local hook. Run this exact sequence before preparing a
commit; it uses the commands that exist in the repository today:

```bash
pnpm docs:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

Run the database sequence when the work touches Prisma schema, migrations, or seed data:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:seed
pnpm db:check
pnpm build
pnpm db:down
```

The duplicate seed checks repeatability. Add `pnpm build` for runtime, dependency, or build-configuration changes.
See [`quality-gates.md`](quality-gates.md) for what each command proves and how to report a blocked check.

## 5. Review the staged change

Inspect status and the working diff, then stage only intentional paths:

```bash
git status --short
git diff --stat
git diff --check
git add path/to/intentional/file.md
git diff --cached --stat
git diff --cached --check
git diff --cached
```

The path list above is illustrative, not a command to copy for every change. Replace it with the exact files in
the work unit. Never use `git add .` blindly. Confirm that no `.env`, secret, build output, local database artifact,
or unrelated change is staged. The final staged diff is the review object.

Only after human approval of the staged work would the commit be created:

```bash
git commit -m "docs(process): document AI-assisted delivery workflow"
```

AI may prepare the staged review and report. AI must not commit unless the human explicitly authorizes that exact
commit action.

## 6. Push and pull request

When a remote and `main` governance exist, the human-approved sequence is:

```bash
git push -u origin docs/operating-model
gh pr create --base main --head docs/operating-model \
  --title "docs(process): harden repository operating model" \
  --body-file .github/PULL_REQUEST_TEMPLATE.md
```

The PR body should include:

- the linked issue when the project has an issue workflow; use `Closes #N`, `Fixes #N`, or `Resolves #N`;
- a one-paragraph outcome and explicit non-goals;
- the affected files or module boundaries;
- acceptance criteria and the rollback boundary;
- exact commands and results, including unavailable checks and residual risk;
- source-of-truth conflicts discovered and how they were handled; and
- confirmation that no secrets, generated output, unrelated changes, or AI-authorship trailers are included.

Issue linkage is recommended now as a planning habit and becomes required once GitHub governance explicitly
adopts issue-first approval. This repository currently has no workflow that validates issues, labels, or PR bodies;
the lightweight templates are guidance, not enforcement, and the quality-gate CI workflow does not change that.

## 7. Human approval and merge boundary

AI may map, implement, verify, and prepare a branch or PR body. Human approval is required before commit, push,
opening a PR, merge, release, deploy, external-service creation, or destructive migration. Do not force-push,
rewrite shared history, commit directly to `main`, or bypass review with `--no-verify` as a normal workflow.

After review, the human merges only when the applicable quality gates pass. Release and deployment follow a
separate human-approved procedure once environments and ownership exist; this repository does not claim those
procedures or CD/hosted deployment automation today.
