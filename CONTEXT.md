# InvitaMe vocabulary

This glossary defines the shared product language used by the repository. It is a language reference, not a
runtime specification or permission to implement planned behavior. When executable evidence disagrees with a term,
preserve the executable behavior and surface the vocabulary conflict for a human decision.

## Canonical terms

| Term | Meaning | Do not confuse it with |
| --- | --- | --- |
| Catalog | The organized set of categories, features, packages, and templates used to describe invitation offerings. | The public invitation experience or a finished product. |
| Category | A catalog grouping for an event type, such as XV años, a wedding, or a birthday. | A package or a renderer. |
| XV años | A quinceañera, the fifteenth-birthday celebration, offered as its own category. Code and keys use the English term `quinceanera`. | A generic birthday. |
| Feature | A named catalog capability that can be included in a package. A feature key is data, not an executable behavior switch. | A code module or an authorization grant. |
| Package | A catalog selection of included features and metadata for a future offering. | A payment record or proof that a customer has paid. |
| Template | Mutable catalog metadata describing a design offering. | The immutable render contract used by an existing invitation. |
| TemplateVersion | A versioned snapshot of the renderer identity, form schema, and presentation configuration for one template. | Mutable template metadata or arbitrary code stored in the database. |
| Invitation | A future customer-specific invitation instance that references a chosen `TemplateVersion`. | A catalog template or a template version. |
| Renderer | Reviewed application behavior that turns a `TemplateVersion` contract and allowed data into a presentation. | A module path, code expression, or code blob supplied by the database. |
| Publication | A future backend-controlled transition that makes an invitation available through its public experience. | A hidden button, a client-side flag, or a catalog status change. |
| Current | Behavior or repository state evidenced by executable source, tests, schema, migrations, seed data, scripts, or reproducible commands. | A target architecture or a roadmap statement. |
| Planned | An approved direction or design that is not evidence of implemented runtime behavior. | A promise that the corresponding route, model, provider, or control already exists. |

## Usage rules

- Use these terms consistently in task briefs, code, tests, documentation, and review comments.
- If a request uses an ambiguous term, state the competing meanings and check the relevant executable or accepted
  design evidence before naming a path, model, or behavior.
- Add a glossary entry only when a term is durable and shared. Do not put implementation details, file layouts, or
  temporary task notes in this document.
- Runtime status and data invariants remain documented in [`docs/README.md`](docs/README.md),
  [`ROADMAP.md`](ROADMAP.md), [`docs/architecture/overview.md`](docs/architecture/overview.md), and
  [`docs/database/model.md`](docs/database/model.md).
