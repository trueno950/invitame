import { Prisma, type PrismaClient } from "@prisma/client";

import {
  CollaboratorAlreadyInvitedError,
  CollaboratorLimitReachedError,
} from "../application/collaborator.errors";
import type {
  AcceptedCollaboration,
  InvitationCollaboratorRecord,
  InvitationCollaboratorRepository,
  InvitationInviteTarget,
  NewInvitationCollaborator,
} from "../application/collaborator.repository";
import type { InvitationPermission } from "../domain/invitation-collaborator";

/** The sentence the collaborator-count trigger of `20261214120000_add_invitation_collaborators` raises. */
const LIMIT_REFUSAL = "An invitation keeps at most five non-revoked collaborators";

/**
 * Whether the count trigger refused the write (L17.1). Its refusal reaches this adapter as a driver error that carries
 * no Prisma code, so the one fixed sentence the migration states is what identifies it; the message is compared and
 * never stored, logged, or returned, and a sentence that does not match is not treated as this refusal (the same rule
 * the address-alias trigger follows).
 */
function isCollaboratorLimitReached(error: unknown): boolean {
  return error instanceof Error && error.message.includes(LIMIT_REFUSAL);
}

const COLLABORATOR_SELECT = {
  id: true,
  invitationId: true,
  email: true,
  permissions: true,
  invitedAt: true,
  acceptedAt: true,
  revokedAt: true,
} as const;

type CollaboratorRow = {
  id: string;
  invitationId: string;
  email: string;
  permissions: InvitationPermission[];
  invitedAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

function toRecord(row: CollaboratorRow): InvitationCollaboratorRecord {
  return {
    id: row.id,
    invitationId: row.invitationId,
    email: row.email,
    permissions: row.permissions,
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
  };
}

/**
 * The co-hosts' Prisma adapter (F12; S2.12, L17.1, L17.3). Every statement that names one collaborator carries the
 * invitation and its owner in its own `WHERE` — through the invitation's `ownerId` — so another customer's invitation
 * reads and writes nothing, exactly like an id that names nothing (A4). Revoking and accepting are single statements
 * that burn the token, so no window exists in which a used or revoked link still resolves.
 */
export class PrismaInvitationCollaboratorRepository implements InvitationCollaboratorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findInviteTarget(
    ownerId: string,
    invitationId: string,
  ): Promise<InvitationInviteTarget | null> {
    // The owner is part of the query, and only the active feature rows are read: a capability withdrawn from the
    // catalog stops admitting new invitations even while its link is still stored (L17.5).
    const row = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: {
        id: true,
        ownerId: true,
        package: {
          select: {
            packageFeatures: {
              where: { included: true, feature: { isActive: true } },
              select: { feature: { select: { key: true } } },
            },
          },
        },
      },
    });

    return row === null
      ? null
      : {
          id: row.id,
          ownerId: row.ownerId,
          includedFeatureKeys: row.package.packageFeatures.map((link) => link.feature.key),
        };
  }

  async findInvitationOwner(invitationId: string): Promise<string | null> {
    const row = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      select: { ownerId: true },
    });

    return row === null ? null : row.ownerId;
  }

  async acceptedAccess(
    invitationId: string,
    userId: string,
  ): Promise<readonly InvitationPermission[] | null> {
    const row = await this.prisma.invitationCollaborator.findFirst({
      where: {
        invitationId,
        userId,
        acceptedAt: { not: null },
        revokedAt: null,
      },
      select: { permissions: true },
    });

    return row === null ? null : row.permissions;
  }

  async listForOwner(
    ownerId: string,
    invitationId: string,
  ): Promise<readonly InvitationCollaboratorRecord[] | null> {
    const owned = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { id: true },
    });
    if (owned === null) {
      return null;
    }
    const rows = await this.prisma.invitationCollaborator.findMany({
      where: { invitationId, revokedAt: null },
      orderBy: [{ invitedAt: "asc" }, { id: "asc" }],
      select: COLLABORATOR_SELECT,
    });

    return rows.map(toRecord);
  }

  async create(input: NewInvitationCollaborator): Promise<InvitationCollaboratorRecord> {
    try {
      // The invitation is connected through its id *and* its owner, so the write itself refuses another account's
      // invitation: no statement of this adapter can reach a row outside the caller's own invitations (A4).
      const created = await this.prisma.invitationCollaborator.create({
        data: {
          invitation: { connect: { id: input.invitationId, ownerId: input.ownerId } },
          email: input.email,
          permissions: [...input.permissions],
          tokenHash: input.tokenHash,
          tokenExpiresAt: input.tokenExpiresAt,
          invitedAt: input.invitedAt,
        },
        select: COLLABORATOR_SELECT,
      });

      return toRecord(created);
    } catch (error) {
      // P2002: the partial unique index over (invitationId, email) among non-revoked rows; PostgreSQL stored nothing.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CollaboratorAlreadyInvitedError();
      }
      if (isCollaboratorLimitReached(error)) {
        throw new CollaboratorLimitReachedError();
      }
      throw error;
    }
  }

  async updatePermissions(
    ownerId: string,
    invitationId: string,
    collaboratorId: string,
    permissions: readonly InvitationPermission[],
  ): Promise<InvitationCollaboratorRecord | null> {
    const { count } = await this.prisma.invitationCollaborator.updateMany({
      where: {
        id: collaboratorId,
        invitationId,
        revokedAt: null,
        invitation: { ownerId },
      },
      data: { permissions: [...permissions] },
    });
    if (count === 0) {
      return null;
    }

    return this.findStanding(ownerId, invitationId, collaboratorId);
  }

  async revoke(
    ownerId: string,
    invitationId: string,
    collaboratorId: string,
    at: Date,
  ): Promise<InvitationCollaboratorRecord | null> {
    // One statement burns the token and marks the row: an accepted collaborator loses the access on the next request,
    // and a link that was never used stops resolving at the same instant (L17.3).
    const { count } = await this.prisma.invitationCollaborator.updateMany({
      where: {
        id: collaboratorId,
        invitationId,
        revokedAt: null,
        invitation: { ownerId },
      },
      data: { revokedAt: at, tokenHash: null, tokenExpiresAt: null },
    });
    if (count === 0) {
      // Nothing stood to be revoked. A row this owner already revoked is answered as it stands, which is what the port
      // documents: revoking twice is the same outcome as revoking once, and the access is already gone. Any other reason
      // — another owner's invitation, another invitation's row, an id that names nothing — is the caller's 404.
      const standing = await this.prisma.invitationCollaborator.findFirst({
        where: {
          id: collaboratorId,
          invitationId,
          revokedAt: { not: null },
          invitation: { ownerId },
        },
        select: COLLABORATOR_SELECT,
      });

      return standing === null ? null : toRecord(standing);
    }

    return this.findStanding(ownerId, invitationId, collaboratorId);
  }

  async findAccountEmail(userId: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    return row === null ? null : row.email.trim().toLowerCase();
  }

  async accept(
    tokenHash: string,
    email: string,
    userId: string,
    at: Date,
  ): Promise<AcceptedCollaboration | null> {
    // The address, the expiry, the unused token, and the standing row are all part of the one statement, so an
    // acceptance either happens once or matches nothing — and a caller with the wrong account leaves the link for the
    // right one. The digest is unique, so it is the statement's own key.
    try {
      const accepted = await this.prisma.invitationCollaborator.update({
        where: {
          tokenHash,
          email,
          acceptedAt: null,
          revokedAt: null,
          tokenExpiresAt: { gt: at },
        },
        data: { userId, acceptedAt: at, tokenHash: null, tokenExpiresAt: null },
        select: { invitationId: true },
      });

      return { invitationId: accepted.invitationId };
    } catch (error) {
      // P2025: no row matched, which is every refusal this method can answer — an unknown digest, another account's
      // address, an expired link, a burned token, or a revoked row.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }

  /** One standing row of this owner's invitation, read back after a write that matched it. */
  private async findStanding(
    ownerId: string,
    invitationId: string,
    collaboratorId: string,
  ): Promise<InvitationCollaboratorRecord | null> {
    const row = await this.prisma.invitationCollaborator.findFirst({
      where: { id: collaboratorId, invitationId, invitation: { ownerId } },
      select: COLLABORATOR_SELECT,
    });

    return row === null ? null : toRecord(row);
  }
}
