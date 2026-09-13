# ADR 0001: Use a modular monolith

## Status

Accepted.

## Context

InvitaMe needs independent web and API runtimes without distributed-system operational cost at the foundation
stage.

## Decision

Use `apps/web` for Next.js and `apps/api` for NestJS. Communicate over REST and let the API own PostgreSQL.
Use pnpm workspaces and Turborepo only for workspace task orchestration and caching.

## Consequences

The boundary is explicit without microservices, shared domain packages, CQRS, GraphQL, Kafka, or Kubernetes.
Future extraction must be justified by a measured product and operational need.
