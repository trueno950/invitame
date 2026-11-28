# ADR 0005: Authorize every invitation route through one resolver and declared permissions

## Status

Accepted (F12, co-hosts; S2.12, L17, with the owner's approval of the security design: «Sí, apruebo»).

## Context

Until F12 an invitation route had exactly one possible caller: its owner. Every owner-scoped port of the API carries
`ownerId` in its own `WHERE`, and the owner is always the session user, so "another customer's invitation answers 404"
was the whole authorization model. Co-hosts (S2.12, L17) introduce a second legitimate caller with a subset of the
permissions, on the highest-risk surface of the product: content, media, the guests' answers, and publication.

Three properties had to keep holding: a route cannot be reached by a caller who was not resolved; a route the design
has not opened stays owner-only; and a collaborator's write cannot escape the ownership rule that protects the row.
A per-route check would be a check someone forgets, and a role stored on the session would be a role that outlives a
revoke.

## Decision

1. One resolver answers one question per request.
   `InvitationAccessResolver.resolve(userId, invitationId)` (`apps/api/src/collaborators/application/invitation-access.ts`)
   answers `OWNER`, `COLLABORATOR` with the permission set of its accepted, non-revoked row, or `null`. It reads the
   stored rows on every request and caches nothing, so a revoke ends the access on the next request.
2. Every invitation route declares what it needs, and denial is the default.
   `@RequireInvitationPermission(...)` admits an accepted collaborator holding any of the named permissions and the
   owner; `@InvitationOwnerOnly()` admits the owner alone. `InvitationAccessGuard` resolves once, answers the module's
   own 404 to a caller with no access (so a foreign invitation is still indistinguishable from an unknown one) and
   `403 INVITATION_FORBIDDEN` to a declared permission the caller does not hold. A route that declares nothing is
   owner-only, so forgetting to declare narrows access instead of widening it.
3. The resolved access carries the invitation's real owner, and that is what the use cases receive.
   `@InvitationOwnerId()` answers it, and every owner-scoped port keeps its own `WHERE ownerId`. Authorization therefore
   happens once, at the boundary, while the ownership rule of each module stays exactly the invariant it already was;
   the session user is never silently used as the owner.
4. Permissions are a small, closed vocabulary of capabilities, not roles.
   `EDIT_CONTENT`, `VIEW_ATTENDANCE`, and `PUBLISH` are the only grantable permissions (L17.2). Paying, refunds,
   archiving, renaming the public address, and managing collaborators are owner-only *because they are not permissions*:
   a value that does not exist cannot be granted by a request body, a stored row, or a catalog change.
5. The declaration is metadata, and the test reads it.
   `invitation-authorization.matrix.spec.ts` derives every registered invitation route from the module's own metadata,
   fails when a route whose path names an invitation declares no permission, and asserts the exact status of every cell
   across the owner, each single permission, all three, a pending collaborator, a revoked one, a stranger, and an
   anonymous caller.
6. The grant is catalog data, not code.
   The `CO_HOSTS` key (Premium and Deluxe) gates inviting. Withdrawing it stops new invitations; the collaborations the
   owner already granted and has not revoked keep their access, because they are a promise the owner made to a person.

## Consequences

- Adding an invitation route now has one extra, reviewable step: declaring its permission. The matrix test and the
  declaration itself are the same act, so an unopened route cannot be reached by a collaborator by accident.
- A collaborator's actions run through the owner's own scoped statements, so no module needs a second ownership rule and
  no module needs to know what a collaborator is. The only module that knows is `collaborators`.
- Reads answer the caller's `role` and `permissions` so the web can hide what a collaborator cannot do. That is a
  convenience: the API checks the permission again on every request, and a hidden control is not a boundary (S9).
- The matrix test's use cases are stubs, so the suite observes the authorization decision and not the behavior of each
  route; that behavior stays owned by each route's own suite and by the collaborators db-spec.
- The access resolver adds one read for a collaborator's request (two for a caller who is not the owner), which is the
  price of caching nothing: an immediate revoke is worth more than a saved query.
- `INVITATION_ACCESS_RESOLVER` is exported by the `collaborators` module and imported by the invitations, media, and
  payments modules. That dependency direction is deliberate: those modules own the routes, and this one owns the
  decision, so the decision cannot be duplicated.
