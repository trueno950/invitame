import type { InvitationPermission } from "../domain/invitation-collaborator";

/**
 * Persistence port of the co-hosts (F12; S2.12, L17.1, L17.3). Every write that names one collaborator carries the
 * invitation and the owner in its own `WHERE` — through the invitation's `ownerId` — so another customer's invitation
 * answers exactly like an id that names nothing and no write can reach a row the caller does not own (the ownership
 * rule the whole API already uses, A4). Nothing is deleted: revoking marks `revokedAt` and burns the token, so the row
 * stays as history and the owner may invite that address again.
 */
export interface InvitationCollaboratorRecord {
  readonly id: string;
  readonly invitationId: string;
  /** The invited address, already trimmed and lower-cased (L17.1). */
  readonly email: string;
  /** What this row grants, in the domain's canonical order. */
  readonly permissions: readonly InvitationPermission[];
  readonly invitedAt: Date;
  /** When the invited account accepted, or null while the invitation is pending. */
  readonly acceptedAt: Date | null;
  /** When the owner revoked the access, or null while it stands. */
  readonly revokedAt: Date | null;
}

/** One invitation as the invite command reads it: who owns it and what its pinned package grants (L17.5). */
export interface InvitationInviteTarget {
  readonly id: string;
  readonly ownerId: string;
  readonly includedFeatureKeys: readonly string[];
}

/** A new invited row: the owner, the decision, the hashed token, and the instant the link stops working (L17.1). */
export interface NewInvitationCollaborator {
  /** The invitation's owner, so the statement itself can refuse a row outside the caller's own invitations (A4). */
  readonly ownerId: string;
  readonly invitationId: string;
  readonly email: string;
  readonly permissions: readonly InvitationPermission[];
  /** The SHA-256 hex digest of the token; the plain value never reaches the port. */
  readonly tokenHash: string;
  readonly tokenExpiresAt: Date;
  readonly invitedAt: Date;
}

/** The invitation an acceptance points at, which is all the answer carries. */
export interface AcceptedCollaboration {
  readonly invitationId: string;
}

export interface InvitationCollaboratorRepository {
  /**
   * The invitation's owner and its pinned package's feature keys, while `ownerId` owns it: another account's invitation
   * answers null exactly like an id that names nothing, because the owner is part of the query and not only of the use
   * case's comparison (F12; L17.4, A4). Only the feature links whose `Feature` row is active are answered, so a
   * capability withdrawn from the catalog stops admitting new invitations even though its link is still stored (L17.5).
   */
  findInviteTarget(ownerId: string, invitationId: string): Promise<InvitationInviteTarget | null>;

  /**
   * The invitation's owner, or null when no invitation has this id. This is the one read that cannot name an owner — it
   * is what answers who the owner is — and it exists so the access resolver never needs an owner-scoped read to discover
   * one (F12; L17.4).
   */
  findInvitationOwner(invitationId: string): Promise<string | null>;

  /**
   * The permissions one account holds on one invitation right now, or null when it holds none. Only an accepted,
   * non-revoked row counts, and it is read on every request — nothing is cached — so a revoke ends the access on the
   * next request (L17.3).
   */
  acceptedAccess(
    invitationId: string,
    userId: string,
  ): Promise<readonly InvitationPermission[] | null>;

  /**
   * The invitation's standing collaborators, oldest first, for the owner's screen (L17.3). Revoked rows are not
   * listed: they are history, not access. Null when no invitation has this id or another customer owns it (A4).
   */
  listForOwner(
    ownerId: string,
    invitationId: string,
  ): Promise<readonly InvitationCollaboratorRecord[] | null>;

  /**
   * Stores one invited row, only while `ownerId` owns the named invitation: the owner is part of the write itself, so a
   * caller that bypassed the use case stores nothing (F12; L17.4, A4). Throws `CollaboratorAlreadyInvitedError` when the
   * partial unique index already holds that address for this invitation — PostgreSQL refused it and nothing was stored —
   * and `CollaboratorLimitReachedError` when the invitation already keeps five non-revoked collaborators, which the
   * database's own trigger refuses.
   */
  create(input: NewInvitationCollaborator): Promise<InvitationCollaboratorRecord>;

  /** Replaces the permission set of one standing row; null when it is not this owner's invitation or row. */
  updatePermissions(
    ownerId: string,
    invitationId: string,
    collaboratorId: string,
    permissions: readonly InvitationPermission[],
  ): Promise<InvitationCollaboratorRecord | null>;

  /**
   * Revokes one standing row and burns its token in the same statement, so a link that was never used stops working and
   * an accepted collaborator loses the access on the next request (L17.3). Idempotent, as documented: revoking an
   * already revoked row changes nothing and answers it as it stands; null when it is not this owner's invitation or row.
   */
  revoke(
    ownerId: string,
    invitationId: string,
    collaboratorId: string,
    at: Date,
  ): Promise<InvitationCollaboratorRecord | null>;

  /** The account's stored address, trimmed and lower-cased, or null when no account has this id (L17.3). */
  findAccountEmail(userId: string): Promise<string | null>;

  /**
   * One acceptance, in one statement (L17.3): finds the pending row by the token's digest, requires the caller's own
   * address to be exactly the invited one, requires the link to be unexpired and the row to be neither accepted nor
   * revoked, and then stores the accepting account, the acceptance instant, and burns the token. Null — changing
   * nothing — for every one of those failures, so a wrong account does not even consume the legitimate recipient's
   * link.
   */
  accept(
    tokenHash: string,
    email: string,
    userId: string,
    at: Date,
  ): Promise<AcceptedCollaboration | null>;
}

export const INVITATION_COLLABORATOR_REPOSITORY = Symbol("InvitationCollaboratorRepository");
