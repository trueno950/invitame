import {
  type InvitationPermission,
  storedInvitationPermissions,
} from "../domain/invitation-collaborator";
import type { InvitationCollaboratorRepository } from "./collaborator.repository";

/**
 * The one authorization resolver every invitation route of the API consults (F12; S2.12, L17.4). It answers one of three
 * things for one caller and one invitation: the caller owns it, the caller is an accepted collaborator holding a set of
 * permissions, or the caller has no access at all. Routes declare what they need, and a route that declares nothing is
 * owner-only, so the default is denial.
 *
 * Why it is one function and not a query inside each route: every owner route of this API scopes its own statements by
 * the invitation's owner — the media, guestbook, RSVP, guest-list, places, payment, and invitation adapters all read the
 * owner from their `WHERE` — so resolving access once, here, and handing the route the invitation's real owner is what
 * keeps a collaborator's write inside the same ownership rule the owner's write already follows. Nothing is cached: the
 * resolver reads the stored row on every request, so a revoke ends the access on the next one (L17.3).
 */

/** Who the caller is for one invitation (L17.4). */
export type InvitationRole = "OWNER" | "COLLABORATOR";

/** What one route may do, as the guard attaches it to the request. */
export interface InvitationAccess {
  readonly invitationId: string;
  /** The invitation's owner: what the owner-scoped ports of every module are given. */
  readonly ownerId: string;
  readonly role: InvitationRole;
  /** Empty for the owner, whose authority is not a permission set. */
  readonly permissions: readonly InvitationPermission[];
}

export interface InvitationAccessResolver {
  /** The caller's access to this invitation, or null when it has none — which every route answers as 404 (L17.4). */
  resolve(userId: string, invitationId: string): Promise<InvitationAccess | null>;
}

export const INVITATION_ACCESS_RESOLVER = Symbol("InvitationAccessResolver");

/** The stored id form a statement may receive: PostgreSQL compares ids as uuids and refuses anything else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value is the id form a stored invitation row carries. */
export function isInvitationRowId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * The resolver over the stored rows. The owner is recognized first and needs no collaborator row; anybody else is a
 * collaborator only while an accepted, non-revoked row stands and grants at least one permission the allow-list knows.
 */
export class StoredInvitationAccessResolver implements InvitationAccessResolver {
  constructor(private readonly collaborators: InvitationCollaboratorRepository) {}

  async resolve(userId: string, invitationId: string): Promise<InvitationAccess | null> {
    // A malformed id names nothing: the answer is the same 404 a foreign one gets, and no statement runs.
    if (!isInvitationRowId(invitationId) || userId === "") {
      return null;
    }
    // Who owns the invitation is the question this resolver exists to answer, so it reads the owner and nothing else;
    // every other read of this module carries the owner in its own `WHERE` (F12; L17.4, A4).
    const ownerId = await this.collaborators.findInvitationOwner(invitationId);
    if (ownerId === null) {
      return null;
    }
    if (ownerId === userId) {
      return { invitationId, ownerId, role: "OWNER", permissions: [] };
    }
    const stored = await this.collaborators.acceptedAccess(invitationId, userId);
    if (stored === null) {
      return null;
    }
    // A row written around the API is answered by what the allow-list knows, never by what it happens to hold (L20).
    const permissions = storedInvitationPermissions(stored);
    if (permissions.length === 0) {
      return null;
    }

    return {
      invitationId,
      ownerId,
      role: "COLLABORATOR",
      permissions,
    };
  }
}
