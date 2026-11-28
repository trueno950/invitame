import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  CollaboratorAlreadyInvitedError,
  CollaboratorEmailUnavailableError,
  CollaboratorFeatureNotAvailableError,
  CollaboratorLimitReachedError,
  CollaborationRefusedError,
  InvalidCollaboratorInvitationError,
} from "../application/collaborator.errors";
import type {
  InvitationCollaboratorRecord,
  InvitationInviteTarget,
} from "../application/collaborator.repository";
import type { InvitationCollaborators } from "../application/collaborator.use-cases";
import {
  type InvitationCollaboratorStatus,
  type InvitationPermission,
  collaboratorStatus,
} from "../domain/invitation-collaborator";

/**
 * The co-hosts' REST answers (F12; S2.12, L17.3). Two rules shape them: the plain token and its digest never appear —
 * the owner reads the address, the permissions, and the state, and nothing that could become a link — and the answer
 * carries no account id, so the screen shows a person by their address and never by an internal identifier.
 */
export interface CollaboratorResponse {
  readonly id: string;
  readonly email: string;
  readonly permissions: readonly InvitationPermission[];
  readonly status: InvitationCollaboratorStatus;
  readonly invitedAt: string;
  readonly acceptedAt: string | null;
}

/** The owner's screen: the standing collaborators and the cap the screen states. */
export interface CollaboratorListResponse {
  readonly maxCollaborators: number;
  readonly collaborators: readonly CollaboratorResponse[];
}

/** The acceptance's answer: the invitation it opened, so the web can navigate to it. */
export interface AcceptCollaborationResponse {
  readonly invitationId: string;
}

export function toCollaboratorResponse(record: InvitationCollaboratorRecord): CollaboratorResponse {
  return {
    id: record.id,
    email: record.email,
    permissions: [...record.permissions],
    status: collaboratorStatus(record),
    invitedAt: record.invitedAt.toISOString(),
    acceptedAt: record.acceptedAt === null ? null : record.acceptedAt.toISOString(),
  };
}

export function toCollaboratorListResponse(
  collaborators: InvitationCollaborators,
): CollaboratorListResponse {
  return {
    maxCollaborators: collaborators.maxCollaborators,
    collaborators: collaborators.collaborators.map(toCollaboratorResponse),
  };
}

/** The one 404 of the collaborator reads and writes: no invitation with this id, or another customer's (A4). */
export function collaboratorsInvitationNotFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}

/** The 404 of a collaborator id that names nothing of this invitation. */
export function collaboratorNotFound(): never {
  throw new NotFoundException({ code: "COLLABORATOR_NOT_FOUND" });
}

export function orCollaboratorList(
  stored: InvitationCollaborators | null,
): CollaboratorListResponse {
  return stored === null ? collaboratorsInvitationNotFound() : toCollaboratorListResponse(stored);
}

export function orCollaborator(stored: InvitationCollaboratorRecord | null): CollaboratorResponse {
  return stored === null ? collaboratorNotFound() : toCollaboratorResponse(stored);
}

export function orInvitedCollaborator(
  stored: InvitationCollaboratorRecord | null,
): CollaboratorResponse {
  // The invitation itself was the caller's — the guard proved it — so a null here is the invitation's own 404.
  return stored === null ? collaboratorsInvitationNotFound() : toCollaboratorResponse(stored);
}

/**
 * The one refusal of an acceptance (L17.3): a wrong account, an expired link, a used link, a revoked collaborator, and a
 * token that names nothing answer this single 404 with this single body, so no caller can tell which one it was.
 */
export function collaborationRefused(): never {
  throw new NotFoundException({ code: "COLLABORATION_NOT_FOUND" });
}

/**
 * Maps a co-host error to its HTTP outcome; any other error is rethrown unchanged.
 *
 * - a bad address or permission set is 400 `INVALID_COLLABORATOR_INVITATION` with its issues;
 * - a pinned package without `CO_HOSTS` is 409 `CO_HOSTS_NOT_AVAILABLE`, and nothing is stored (L17.5);
 * - an address that already has a standing invitation is 409 `COLLABORATOR_ALREADY_INVITED`;
 * - the sixth non-revoked collaborator is 409 `COLLABORATOR_LIMIT_REACHED` (L17.1);
 * - an email the deployment could not deliver is 503 `COLLABORATOR_EMAIL_UNAVAILABLE`: the row stands, and the owner
 *   revokes it and invites the address again, which mints a fresh link;
 * - every unusable acceptance is the one 404 `COLLABORATION_NOT_FOUND`.
 */
export function mapCollaboratorError(error: unknown): never {
  if (error instanceof InvalidCollaboratorInvitationError) {
    throw new BadRequestException({
      code: "INVALID_COLLABORATOR_INVITATION",
      issues: [...error.issues],
    });
  }
  if (error instanceof CollaboratorFeatureNotAvailableError) {
    throw new ConflictException({ code: "CO_HOSTS_NOT_AVAILABLE" });
  }
  if (error instanceof CollaboratorAlreadyInvitedError) {
    throw new ConflictException({ code: "COLLABORATOR_ALREADY_INVITED" });
  }
  if (error instanceof CollaboratorLimitReachedError) {
    throw new ConflictException({ code: "COLLABORATOR_LIMIT_REACHED" });
  }
  if (error instanceof CollaboratorEmailUnavailableError) {
    throw new ServiceUnavailableException({ code: "COLLABORATOR_EMAIL_UNAVAILABLE" });
  }
  if (error instanceof CollaborationRefusedError) {
    collaborationRefused();
  }
  throw error;
}

/** The invitation the email names, read only by the use case; kept exported so the port's shape has one owner. */
export type { InvitationInviteTarget };
