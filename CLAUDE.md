# InvitaMe agent entrypoint

@AGENTS.md

`AGENTS.md` is the canonical policy and authority boundary. This file imports it for Claude and remains only a
navigation index; it intentionally does not duplicate those rules.

- Product scope and implemented/planned status: [`ROADMAP.md`](ROADMAP.md)
- Runtime and target architecture: [`docs/architecture/overview.md`](docs/architecture/overview.md)
- AI task lifecycle and handoffs: [`docs/architecture/ai-operating-model.md`](docs/architecture/ai-operating-model.md)
- Real module structure: [`docs/architecture/module-template.md`](docs/architecture/module-template.md)
- Current and future data contracts: [`docs/database/model.md`](docs/database/model.md) and
  [`docs/database/future-model.md`](docs/database/future-model.md)
- Anti-patterns: [`docs/development/anti-patterns.md`](docs/development/anti-patterns.md)
- Definition of Done and checks: [`docs/development/quality-gates.md`](docs/development/quality-gates.md)
- Branch, commit, and PR workflow: [`docs/development/git-workflow.md`](docs/development/git-workflow.md)
- Documentation index: [`docs/README.md`](docs/README.md)
- Accepted decisions: [`docs/adr/`](docs/adr/)

Before changing code, map the affected paths and confirm whether the requested behavior is implemented or
planned. Before reporting completion, show the commands and evidence required by the quality gates. Human
approval remains required for the authority boundaries defined in `AGENTS.md`.
