import { randomUUID } from "node:crypto";

import type { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { EmailDeliveryUnavailableError } from "../../email/application/email-delivery.service";
import { CO_HOSTS_FEATURE_KEY } from "../../invitations/domain/invitation-features";
import type {
  InvitationCollaboratorRecord,
  InvitationCollaboratorRepository,
  NewInvitationCollaborator,
} from "./collaborator.repository";
import {
  buildCollaboratorInvitationMessage,
  type CollaboratorAcceptanceLink,
} from "./collaborator-invitation-message";
import {
  CollaboratorEmailUnavailableError,
  CollaboratorFeatureNotAvailableError,
  CollaborationRefusedError,
  InvalidCollaboratorInvitationError,
} from "./collaborator.errors";
import {
  collaboratorInvitationExpiresAt,
  COLLABORATOR_INVITATION_TTL_DAYS,
  MAX_INVITATION_COLLABORATORS,
  normalizeCollaboratorEmail,
  normalizeInvitationPermissions,
} from "../domain/invitation-collaborator";
import {
  collaboratorTokenHash,
  isCollaboratorTokenShape,
  mintCollaboratorToken,
} from "./collaborator-token";

// The co-host use cases (F12; S2.12, L17.1, L17.3, L17.5). The owner invites an address with a permission set; the
// recipient signs in with the product's own email code and accepts the single-use link; the owner lists, changes, and
// revokes. Every command receives the owner from the caller — the route reads it from the guard, never from the payload
// (S9) — and every read or write goes through a port whose statement carries that owner, so another customer's
// invitation answers exactly like an id that names nothing (A4). Nothing is deleted: revoking marks the row and burns
// the token.

/** The clock, injected so a test can observe the invitation window and the acceptance instant. */
export type CollaboratorClock = () => Date;

export interface InviteCollaboratorInput {
  /** The invitation's owner, resolved by the guard; never the payload (S9, L17.4). */
  readonly ownerId: string;
  readonly invitationId: string;
  readonly email: unknown;
  readonly permissions: unknown;
}

export interface AcceptCollaborationInput {
  /** The signed-in caller, from the session. */
  readonly userId: string;
  /** The token the emailed link carried. */
  readonly token: unknown;
}

export interface UpdateCollaboratorPermissionsInput {
  readonly ownerId: string;
  readonly invitationId: string;
  readonly collaboratorId: string;
  readonly permissions: unknown;
}

/** What the owner's screen shows: the standing collaborators and the cap it enforces (L17.1, L17.3). */
export interface InvitationCollaborators {
  readonly maxCollaborators: number;
  readonly collaborators: readonly InvitationCollaboratorRecord[];
}

/** The invitation an acceptance opened, which is all the answer carries. */
export interface AcceptedCollaborationResult {
  readonly invitationId: string;
}

/**
 * Invites one address to collaborate (L17.1, L17.3, L17.5): refuses an address or a permission set the domain does not
 * accept, answers null — the caller's 404 — when the invitation is not this owner's, refuses a pinned package that does
 * not grant `CO_HOSTS`, stores the invited row with the token's digest, and sends the link through the existing email
 * port. The plain token never leaves this method inside anything but that message: it is not logged, stored, or
 * answered, so the owner cannot read it back and a leaked response cannot become a link.
 */
export class InviteCollaboratorUseCase {
  constructor(
    private readonly collaborators: InvitationCollaboratorRepository,
    private readonly delivery: EmailDeliveryService,
    private readonly acceptanceLink: CollaboratorAcceptanceLink,
    private readonly now: CollaboratorClock = () => new Date(),
  ) {}

  async execute(input: InviteCollaboratorInput): Promise<InvitationCollaboratorRecord | null> {
    const email = normalizeCollaboratorEmail(input.email);
    if (!email.ok) {
      throw new InvalidCollaboratorInvitationError(email.issues);
    }
    const permissions = normalizeInvitationPermissions(input.permissions);
    if (!permissions.ok) {
      throw new InvalidCollaboratorInvitationError(permissions.issues);
    }

    const target = await this.collaborators.findInviteTarget(input.invitationId);
    if (target === null || target.ownerId !== input.ownerId) {
      return null;
    }
    if (!target.includedFeatureKeys.includes(CO_HOSTS_FEATURE_KEY)) {
      throw new CollaboratorFeatureNotAvailableError();
    }

    const invitedAt = this.now();
    const token = mintCollaboratorToken();
    const write: NewInvitationCollaborator = {
      invitationId: target.id,
      email: email.value,
      permissions: permissions.value,
      tokenHash: collaboratorTokenHash(token),
      tokenExpiresAt: collaboratorInvitationExpiresAt(invitedAt),
      invitedAt,
    };
    const stored = await this.collaborators.create(write);

    try {
      await this.delivery.send(
        buildCollaboratorInvitationMessage({
          to: stored.email,
          url: this.acceptanceLink(token),
          expiresInDays: COLLABORATOR_INVITATION_TTL_DAYS,
          idempotencyKey: randomUUID(),
        }),
      );
    } catch (error) {
      if (error instanceof EmailDeliveryUnavailableError) {
        // The row stands, because the decision was right; the owner revokes it and invites the address again, which
        // mints a fresh link. Nothing undelivered stays acceptable forever: the row's own seven-day window applies.
        throw new CollaboratorEmailUnavailableError();
      }
      throw error;
    }

    return stored;
  }
}

/**
 * Accepts one emailed invitation (L17.3): the caller must hold exactly the invited address, the link must be unexpired
 * and unused, and the row must not be revoked. Every one of those failures, and a token that names nothing at all, is
 * the one `CollaborationRefusedError` — the same 404 and the same body — so the answer never tells a caller whether the
 * address, the link, or the owner was the reason. A wrong account does not consume the link the right account can still
 * use, because the address is part of the accepting statement itself.
 */
export class AcceptCollaborationUseCase {
  constructor(
    private readonly collaborators: InvitationCollaboratorRepository,
    private readonly now: CollaboratorClock = () => new Date(),
  ) {}

  async execute(input: AcceptCollaborationInput): Promise<AcceptedCollaborationResult> {
    const token = input.token;
    if (!isCollaboratorTokenShape(token)) {
      throw new CollaborationRefusedError();
    }
    const email = await this.collaborators.findAccountEmail(input.userId);
    if (email === null) {
      throw new CollaborationRefusedError();
    }
    const accepted = await this.collaborators.accept(
      collaboratorTokenHash(token),
      email,
      input.userId,
      this.now(),
    );
    if (accepted === null) {
      throw new CollaborationRefusedError();
    }

    return accepted;
  }
}

/**
 * The standing collaborators of one invitation (L17.3), for the owner's screen. Null for an invitation that is not this
 * owner's or does not exist, which the route answers as its 404 (A4). Revoked rows are history and are not listed.
 */
export class ListInvitationCollaboratorsUseCase {
  constructor(private readonly collaborators: InvitationCollaboratorRepository) {}

  async execute(ownerId: string, invitationId: string): Promise<InvitationCollaborators | null> {
    const stored = await this.collaborators.listForOwner(ownerId, invitationId);

    return stored === null
      ? null
      : { maxCollaborators: MAX_INVITATION_COLLABORATORS, collaborators: stored };
  }
}

/**
 * Replaces what one collaborator may do (L17.3). The domain validates the set exactly as it does on the invitation; a
 * set the allow-list does not know is refused before anything is stored. Null for a row that is not this owner's
 * invitation's, which the route answers as its 404.
 */
export class UpdateCollaboratorPermissionsUseCase {
  constructor(private readonly collaborators: InvitationCollaboratorRepository) {}

  async execute(
    input: UpdateCollaboratorPermissionsInput,
  ): Promise<InvitationCollaboratorRecord | null> {
    const permissions = normalizeInvitationPermissions(input.permissions);
    if (!permissions.ok) {
      throw new InvalidCollaboratorInvitationError(permissions.issues);
    }

    return this.collaborators.updatePermissions(
      input.ownerId,
      input.invitationId,
      input.collaboratorId,
      permissions.value,
    );
  }
}

/**
 * Ends one collaborator's access (L17.3): pending or accepted, the row is marked revoked and its token burned in the
 * same statement, so the next request of that account already answers as a stranger and a link that was never used
 * stops working. Null for a row that is not this owner's invitation's.
 */
export class RevokeCollaboratorUseCase {
  constructor(
    private readonly collaborators: InvitationCollaboratorRepository,
    private readonly now: CollaboratorClock = () => new Date(),
  ) {}

  async execute(
    ownerId: string,
    invitationId: string,
    collaboratorId: string,
  ): Promise<InvitationCollaboratorRecord | null> {
    return this.collaborators.revoke(ownerId, invitationId, collaboratorId, this.now());
  }
}
