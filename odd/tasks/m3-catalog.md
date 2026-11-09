# Milestone 3 — Catalog and renderer contracts

Task brief and tracking for Milestone 3 on branch `feat/m3-catalog`. The four product rules S4 to S7 are the owner's
answers of L2. Status: T0 to T5 merged as #49 (`671c770`); T4 and T6a as #50 (`b779e38`); T6b and T7 as #51 (`195c723`); T6c and
T8a in #52; T8b and T9 in the last pull request.

## Specs

Cited documents are authoritative; read them in full (`ROADMAP.md` Milestone 3, `AGENTS.md`, `CONTEXT.md`,
`docs/database/model.md`, `docs/architecture/module-template.md`).

- **S1** ROADMAP Milestone 3 key scope, verbatim: "category, package, and feature administration; package prices and
  currencies with normalized query fields; version creation and publication rules for templates; an
  application-owned renderer registry keyed by an explicit allow-list; validated schema/configuration contracts for
  each renderer; and admin/catalog behavior tests and version compatibility checks."
- **S2** ROADMAP Milestone 3 exit criteria, verbatim: "Catalog names and feature keys remain data and never select
  arbitrary code paths." "Every published renderer key resolves to reviewed application code." "New renderer
  behavior is introduced through a new immutable `TemplateVersion`."
- **S3** ROADMAP Milestone 3 non-goals, verbatim: "No arbitrary code in the database, dynamic module imports, or
  general-purpose visual editor is included."
- **S4** Pricing (L2), the owner's choice verbatim: "Solo MXN, entero en centavos" — "Una tabla PackagePrice (monto
  Int en centavos + código ISO), una moneda activa ahora; deja abierto agregar otras sin migrar el formato."
- **S5** Publication (L2), verbatim: "Una sola; las anteriores pasan a RETIRED" — "DRAFT → PUBLISHED → RETIRED. Las
  invitaciones existentes siguen usando su versión retirada; las nuevas solo eligen la publicada. Índice único
  parcial en BD."
- **S6** Renderer registry (L2), verbatim: "API valida, web renderiza" — "La API tiene la lista permitida y valida
  schema/configuración al publicar; la web tiene el mapa componentKey → componente. Una prueba asegura que ambas
  listas coinciden."
- **S7** Seed (L2), verbatim: "Solo crear lo que falte" — "El seed inserta los registros base si no existen y nunca
  borra ni reactiva datos que el administrador cambió."
- **S8** `AGENTS.md`, verbatim: "`TemplateVersion` is an append-only snapshot of renderer identity (`componentKey`),
  schema, and configuration." "Feature keys are data-driven catalog records. Package names, category names, and
  feature keys must not select code paths; capability behavior belongs to an explicit contract and an allow-listed
  implementation." "Destructive or irreversible migrations require human approval, a rollback or recovery plan, and
  explicit verification. Never edit an applied migration to hide a new schema change."
- **S9** `AGENTS.md`, verbatim: "Validate untrusted input at the API boundary with DTOs and the existing global
  validation configuration; authorize every protected action on the backend."

## Tasks

Design decisions that refine S4 to S7 are recorded in L4; workers read them as part of the spec. Every migration is
additive (no drop, no rewrite of stored rows). High-risk tasks (T3, T4, T6a) each get their own commit.

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T0 | ROADMAP: mark Milestone 2 implemented | S1 | inline | `4831180` |
| T1 | Database tests of the existing catalog schema: unique keys, `Restrict` foreign keys, and the `TemplateVersion` snapshot trigger (snapshot fields refused, `status` allowed) | S2, S8 | worker | `1557006` |
| T2 | Seed creates only what is missing: no deletes, no reactivation, no overwrite of admin edits; seed logic importable and covered by a database test that runs it twice | S7 | worker | `dc6adf9` |
| T3 | Version lifecycle: pure domain transition rules and an additive migration with a partial unique index (one `PUBLISHED` version per template) and a trigger refusing illegal status changes; database tests | S5, S8 | worker | `e0aec9f` |
| T4 | `PackagePrice`: additive migration and model (L4 shape), MXN allow-list in the domain, database tests | S4 | worker || `018fcde` |
| T5 | API renderer registry: explicit allow-list of `componentKey` with a per-renderer contract that validates a version's `schema` and `configuration`; unit tests; `birthday-adventure-01` is the first entry | S2, S3, S6 | worker | `773d95c` |
| T6a | Admin catalog API, categories and features: `src/catalog` module, `@AdminOnly()` controllers, list/create/update (no delete), DTO validation, 401/403 tests | S1, S2, S9 | worker || `04a2d88` |
| T6b | Admin catalog API, packages: list/create/update status, set included features, set the current price | S1, S4, S9 | worker || `ea564f7` |
| T6c | Admin catalog API, templates and versions: list/create/update templates, create a draft version validated by the registry, publish (retires the previous published version in one transaction), retire | S1, S5, S6, S9 | worker | `2833f1e` |
| T7 | Web renderer map (`componentKey` → component), the `birthday-adventure-01` component, and the test that the web and API key lists match | S2, S3, S6 | worker || `3d4fb3a` |
| T8 | Web admin catalog UI under `/admin/catalogo`: view and manage categories, features, packages with prices, templates and versions (publish, retire) | S1 | worker | `a8ba45a` (T8a), `b8c1234` (T8b) |
| T9 | Documentation: `module-template.md` path, `docs/database/model.md`, `CONTEXT.md` (catalog price and publication), the renderer-registry overlap between Milestones 3 and 5, and the ROADMAP status | S1 | inline | this commit |

## Log

- **L1** The owner's request, verbatim: "1 luego 2" (1: fix the Milestone 2 status in `ROADMAP.md`; 2: explore
  Milestone 3 and propose the task split), then "continua con todo, puedes abrir pr y mergearlos y continar con este
  paquete de tareas".
- **L2** The owner's answers (2026-11-09): pricing "Solo MXN, entero en centavos (Recomendado)"; publication "Una
  sola; las anteriores pasan a RETIRED (Recomendado)"; registry "API valida, web renderiza (Recomendado)"; seed "Solo
  crear lo que falte (Recomendado)". Mirrored in Engram `m3/catalog-decisions`.
- **L3** Evidence: the session cannot reach GitHub (`gh auth status`: not logged in; `git ls-remote origin`: "could
  not read Username"). Work-unit commits stay on `feat/m3-catalog`; push, pull requests, and merges wait for GitHub
  access.
- **L4** Design decisions by the parent within S4 to S7:
  - Prices: `PackagePrice(id uuid, packageId → Package Restrict, currency CHAR(3) CHECK '^[A-Z]{3}$', amountMinor
    INT CHECK >= 0, createdAt, retiredAt nullable)`; a partial unique index on `(packageId, currency) WHERE retiredAt
    IS NULL` keeps one current price; changing a price retires the current row and inserts a new one in one
    transaction (history kept); a trigger refuses updates to `packageId`, `currency`, `amountMinor`, `createdAt`, and
    clearing `retiredAt`. The domain allows only `MXN` today.
  - Versions: legal status changes are `DRAFT → PUBLISHED` and `PUBLISHED → RETIRED` only; a new version is created
    as `DRAFT` with `version = max + 1`; publishing retires the current `PUBLISHED` version of the same template in the
    same transaction; a `RETIRED` version stays readable by its `id`.
  - Templates: a template may be `PUBLISHED` only while it has a `PUBLISHED` version.
  - No delete endpoints; deactivation uses `isActive` or the status enums. Public (non-admin) catalog reads are not
    in this milestone.
  - The seed creates no prices: amounts are the owner's product decision and are set through the admin API.
- **L5** GitHub access (2026-11-09): the owner ran `gh auth login --insecure-storage`; the session uses
  `GH_CONFIG_DIR=/Users/joelmay/.config/gh` and `gh auth git-credential` without reading the token. L3 is resolved.
- **L6** Delivery strategy: the first slice (`4831180` to `773d95c`, about 2,300 lines, mostly tests) goes as one pull
  request after the independent verification required by the T3 migration; later tasks go as one pull request per
  task or pair of small tasks, each merged into `master` after CI passes. The seed keeps version 1 only for a template
  it creates (parent fix in `dc6adf9`).
- **L7** PR #49 (T0 to T5 and `e4ac12b`, the seed-contract test) merged into `master` as `671c770` after CI passed.
  Delivery runs from the clean worktree `.worktrees/m3-delivery` (locally excluded), because the delivery preflight
  refuses a worktree with uncommitted worker output.
- **L8** Independent verification of T4 and T6a: no blocking findings. Accepted follow-ups: a `PackagePrice` row can be
  deleted at the database level (no API route deletes one, and `Package` deletion is `Restrict`); CORS lists no `PATCH`,
  so the web admin (T8) calls the API from the server. PR #50 holds T4 and T6a.
- **L9** Independent verification of T6b, T7, T6c, and T8a: no blocking findings. PR #51 (T6b, T7) merged as
  `195c723`; PR #52 holds T6c and T8a. Accepted follow-ups, not in this milestone:
  - API: concurrent version creates mostly lose with `409` instead of queueing; a Prisma serialization error (P2034)
    is not mapped and would answer `500`; two 64 KiB JSON fields can exceed the body parser limit (`413`); the
    version list is not paginated; a version of an `ARCHIVED` template can be published while the template stays
    `ARCHIVED`; price errors echo the rejected value; replacing package features keeps an existing link's `included`
    flag.
  - Web: a refused create or edit form comes back empty; edit pages read the whole list (no read-by-id route); a
    refused publish shows a fixed message instead of the contract issues; there is no version preview; the renderer
    accepts an image URL with credentials; no Playwright journey covers the catalog pages.
- **L10** Slice boundaries: PR #51 ends at `5b8de11`; PR #52 at `a8ba45a`; the last pull request holds `b8c1234`
  and the T9 documentation commit.
