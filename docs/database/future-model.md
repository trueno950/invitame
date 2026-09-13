# Future data model

This is design documentation for planned capabilities. It does not add Prisma models, migrations, seed records,
or runtime behavior. The current schema remains the source of truth for the implemented foundation; these decisions
must be revisited against the approved product workflow before tables are created.

## Data boundary

Use normalized PostgreSQL columns for data that identifies, relates, authorizes, transitions, costs, expires,
sorts, filters, or enforces uniqueness. Use validated JSONB only for bounded, versioned payloads whose shape is
owned by an explicit contract and that do not need relational constraints. JSONB is not a substitute for a data
model.

Every future model needs an owner, lifecycle, retention policy, indexes for public/admin queries, authorization
rules, and tests for its failure paths before a migration is approved.

## Planned models

### Invitation

An `Invitation` represents a customer's invitation instance, not a catalog template. Normalize:

- `id`, owner/account reference, `templateVersionId`, lifecycle status, publication timestamps, expiration policy,
  and audit timestamps;
- a normalized, lower-case public `slug` with a database uniqueness constraint;
- event date/time and other fields used for sorting, reminders, or public filtering; and
- package/entitlement references when access decisions need relational queries.

Store invitation render data in validated JSONB only when the product contract allows bounded, versioned extension
fields. Core ownership, publication, schedule, status, and lookup fields must not be hidden in that payload.

The relationship is explicitly `Invitation -> TemplateVersion`. A future invitation never resolves its renderer or
form contract through mutable `Template` metadata.

### Payment

Normalize the internal payment id, invitation/order reference, provider name, provider payment identifier, state,
amount in the smallest supported currency unit, currency code, timestamps, and the provider event/idempotency key.
Provider identifiers and webhook event identifiers need database uniqueness where replay must be rejected.

At checkout, snapshot the package price and currency on the internal purchase/payment record. Later edits to the
catalog `Package` must not rewrite the amount that was offered, authorized, or paid. A validated JSONB field may
hold a bounded, redacted provider-metadata projection needed for support; it must not become the payment domain
model or contain card data, secrets, or unbounded payloads.

Webhook handling must verify the provider signature before mapping an event. Persist the idempotency key before
performing retryable side effects, enforce uniqueness, and make duplicate delivery return the already-known result
without applying the transition twice.

### MediaAsset

Normalize asset id, owner/invitation reference, storage provider, opaque storage key, purpose, MIME type, byte
size, dimensions when relevant, lifecycle state, retention/deletion timestamps, and audit timestamps. Store the
binary in approved object storage, never in a PostgreSQL row or an ephemeral application filesystem.

Validated JSONB may hold bounded derivative or processing metadata. Upload policy must enforce size, type, dimensions,
ownership, storage lifetime, and access mode before the asset is accepted.

### Guest

Normalize guest id, invitation reference, display name, contact identifiers needed by the approved workflow,
delivery/access state, token status, and timestamps. Index by invitation and the lookup fields used by the owner.

Guest-specific optional answers or bounded preferences may use validated JSONB only when they are not used for
authorization, uniqueness, reporting, or lifecycle transitions. Retention and deletion must account for personal
data before this model is exposed publicly.

### RSVP

Normalize RSVP id, invitation/guest reference, response state, party size if supported, response timestamp, and
created/updated timestamps. Enforce the product's duplicate rule with a database uniqueness constraint, such as one
active response per guest and invitation, rather than relying on a frontend check.

Additional bounded form answers may use validated JSONB with a versioned schema. Query-critical attendance state,
counts, and timestamps stay in columns so they can be constrained and indexed. Duplicate submissions should be
safe to retry and should not create multiple attendance records.

### Analytics

Start with the smallest useful event or aggregate model. Normalize invitation reference, event name from a closed
allow-list, occurrence time, coarse source/context needed for an approved metric, and retention/aggregation state.
Avoid storing raw URLs, tokens, full user-agent strings, or unnecessary personal data.

Validated JSONB can hold a bounded event-properties contract after privacy review, but analytics must not become an
unbounded event dump. Sophisticated funnels, streaming ingestion, queues, and long-term warehouse design are
post-MVP decisions.

## Slug uniqueness and regeneration

The database is the final authority for slug uniqueness. Generate a normalized candidate, enforce a unique index,
and handle collisions safely instead of relying on a preflight query. Slugs should not contain secrets or encode
authorization.

Regeneration is an explicit product action, not an automatic side effect of unrelated edits. Before implementing it,
decide whether the previous slug returns a redirect, a controlled not-found response, or remains reserved. If old
links must survive, persist the redirect/history relationship rather than silently reusing a former public address.

## Snapshot and checkout rules

- An invitation pins a specific `TemplateVersion`; publishing a new template version does not mutate existing
  invitations.
- A checkout records the package price and currency offered at that moment; later package catalog changes affect
  future checkout only.
- Payment state comes from verified provider events mapped to internal states, not from provider payload shape or
  browser state.
- Webhook idempotency keys and provider event identifiers are normalized, unique, and retained for the period
  needed to reject replay.

## Migration gate

Creating these tables is a future schema change, not part of the current documentation hardening. Before any model
is implemented, the work must include approved ownership/authorization rules, normalized-vs-JSONB justification,
indexes and constraints, migration and recovery planning, idempotency behavior, seed/test strategy, and the
database checks in [`quality-gates.md`](../development/quality-gates.md).
