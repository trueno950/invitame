# ADR 0002: Store template render contracts as immutable versions

## Status

Accepted.

## Context

Template metadata can evolve, while rendered invitations must preserve the contract that created them.

## Decision

Keep mutable metadata on `Template`. Store each render/data contract on `TemplateVersion` with a per-template
version number, immutable renderer `componentKey`, immutable JSONB schema and configuration, and a database
trigger that rejects snapshot rewrites.

## Consequences

Future invitations must reference a `TemplateVersion`. New behavior is introduced by creating a new version,
not by mutating a contract that existing invitations could depend on.
