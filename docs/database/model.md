# Database model

The first migration creates only the catalog and template-version foundation.
Future invitation, payment, media, guest, RSVP, and analytics design is documented separately in
[`future-model.md`](future-model.md); that document does not add tables.

| Model | Role |
| --- | --- |
| `User` | Minimal future identity foundation; no authentication behavior exists yet |
| `Category` | Event catalog grouping |
| `Feature` | Extensible catalog capability with a database-enforced unique string `key` |
| `Package` | Sellable catalog metadata, independent of behavior branches |
| `PackageFeature` | Normalized package-to-feature relation |
| `Template` | Mutable template master metadata and category relation |
| `TemplateVersion` | Immutable renderer identity, render, and form-data contract for one template version |

## Invariants

- `Feature.key` is a unique database string, not a PostgreSQL enum. New feature keys can be added as data
  without a code migration.
- `TemplateVersion` is unique by `(templateId, version)`. Its renderer `componentKey` (`component_key` in
  PostgreSQL), `schema`, `configuration`, template reference, version number, and creation timestamp are
  protected against updates by the initial migration trigger.
- A version status can evolve through its stable lifecycle, but its snapshot contract cannot be rewritten.
- Future `Invitation` records must reference `TemplateVersion`, never mutable `Template` fields.

## JSONB boundary

Prisma `Json` maps only `TemplateVersion.schema` and `TemplateVersion.configuration` to PostgreSQL JSONB. The
schema is a validated form contract and configuration is a validated presentation contract. Renderer identity,
relationships, catalog keys, lifecycle statuses, and fields used for querying remain normalized columns.

## Deliberately absent

There are no invitation, payment, RSVP, guest, analytics, or media tables in this migration.
