import { Prisma, type PrismaClient } from "@prisma/client";
import {
  InvitationContentConflictError,
  InvitationPaymentRequiredError,
  InvitationSlugTakenError,
} from "../application/invitation.application.errors";
import type {
  InvitationFeatureSettingsWrite,
  InvitationPlaceWrite,
  InvitationRecordWithMusic,
  InvitationRepository,
  NewInvitation,
} from "../application/invitation.repository";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import type { JsonObject } from "../domain/invitation-content";
import { archive, assertEditable, publish, unpublish } from "../domain/invitation-lifecycle";
import {
  isAddressFieldName,
  isStoredPlacePoint,
  type PlacePoint,
} from "../domain/invitation-place";

const INVITATION_SELECT = {
  id: true,
  ownerId: true,
  templateVersionId: true,
  packageId: true,
  slug: true,
  status: true,
  content: true,
  timeZone: true,
  rsvpDeadline: true,
  rsvpPartyLimit: true,
  archivedAt: true,
  publishedAt: true,
  firstPublishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  // The one-to-one feature data travels with the row, so an owned or public read stays one query (S4, S2).
  featureSettings: {
    select: {
      whatsappPhone: true,
      playlistUrl: true,
      playlistTitle: true,
      playlistCoverUrl: true,
    },
  },
  // The stored points travel with the row too (S2): the public projection decides which of them a guest may see, and
  // both reads answer only the ones the domain still accepts.
  places: {
    select: {
      field: true,
      label: true,
      lat: true,
      lng: true,
    },
  },
} satisfies Prisma.InvitationSelect;

type InvitationRow = Prisma.InvitationGetPayload<{ select: typeof INVITATION_SELECT }>;

/**
 * The stored points of one row, keyed by their content field (S2, S3). Only a point the domain still accepts is
 * answered: a row written around the API — a field that is not an address field, a blank or oversized label, a
 * coordinate outside the range — degrades to "no stored point" instead of reaching the editor or a guest as a value
 * no rule validated.
 */
function toStoredPlaces(rows: InvitationRow["places"]): Record<string, PlacePoint> {
  return Object.fromEntries(
    rows
      .filter((place) => isAddressFieldName(place.field) && isStoredPlacePoint(place))
      .map((place) => [place.field, { label: place.label, lat: place.lat, lng: place.lng }]),
  );
}

/** The shape of a JSON object as PostgreSQL returns it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(row: InvitationRow): InvitationRecordWithMusic {
  return {
    id: row.id,
    ownerId: row.ownerId,
    templateVersionId: row.templateVersionId,
    packageId: row.packageId,
    slug: row.slug,
    status: row.status,
    // The column is NOT NULL and carries the `Invitation_content_object` check, so this fallback is
    // unreachable; it keeps the port's "content is an object" contract true without a cast.
    content: isJsonObject(row.content) ? row.content : {},
    timeZone: row.timeZone,
    // No settings row yet means no feature data: the phone is null, never an empty string.
    whatsappPhone: row.featureSettings?.whatsappPhone ?? null,
    playlistUrl: row.featureSettings?.playlistUrl ?? null,
    // A row written before the lookup existed, or one whose lookup failed, carries no metadata (S2).
    playlistTitle: row.featureSettings?.playlistTitle ?? null,
    playlistCoverUrl: row.featureSettings?.playlistCoverUrl ?? null,
    rsvpDeadline: row.rsvpDeadline,
    rsvpPartyLimit: row.rsvpPartyLimit,
    // The points are keyed by their content field, which is the name the layout's address field carries (S2).
    places: toStoredPlaces(row.places),
    archivedAt: row.archivedAt,
    publishedAt: row.publishedAt,
    firstPublishedAt: row.firstPublishedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * The invitation port on PostgreSQL (M4 T3 and M5 T3; S1, S2, S3, S5, S7, S9, A1, A2, A3, A4). Every statement
 * that names one invitation carries the owner id in its own `WHERE` (S9): another owner's row is
 * indistinguishable from a missing one, so no read-then-check outside the write can ever let a foreign row
 * through (A4). Each content change and each lifecycle write runs in one interactive transaction that re-states
 * the owner and the expected status in the `WHERE` of the write itself, so the domain check and the write cannot
 * disagree: a concurrent archive makes the write match nothing and is reported with the transition's own error
 * instead of silently rewriting a read-only invitation (S7, A2). Publishing and unpublishing write `status` and
 * `publishedAt` together, which the `Invitation_publishedAt_matches_status` check requires (S7). The public read
 * by slug is a single query on the unique slug index that also filters the status and the expiry, so a guest
 * read is bounded (S2, S3, A3). The unique index on `slug` is the only uniqueness guard; its violation (P2002)
 * is reported as `InvitationSlugTakenError` so the create use case can draw another slug.
 */
export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewInvitation): Promise<InvitationRecordWithMusic> {
    try {
      const created = await this.prisma.invitation.create({
        select: INVITATION_SELECT,
        data: {
          ownerId: input.ownerId,
          templateVersionId: input.templateVersionId,
          packageId: input.packageId,
          slug: input.slug,
          content: input.content as Prisma.InputJsonObject,
        },
      });
      return toRecord(created);
    } catch (error) {
      // P2002: the unique index "Invitation_slug_key"; PostgreSQL stored nothing. It is the only unique
      // index on the table, so no other constraint can be mistaken for a slug collision.
      if (isPrismaError(error, "P2002")) {
        throw new InvitationSlugTakenError(input.slug);
      }
      throw error;
    }
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const stored = await this.prisma.invitation.findFirst({
      where: { id, ownerId },
      select: INVITATION_SELECT,
    });
    return stored === null ? null : toRecord(stored);
  }

  async listOwned(ownerId: string): Promise<InvitationRecordWithMusic[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { ownerId },
      select: INVITATION_SELECT,
      // Newest first; the id breaks a tie between two rows created in the same instant.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toRecord);
  }

  async updateContent(
    ownerId: string,
    id: string,
    content: JsonObject,
    expectedUpdatedAt?: Date,
  ): Promise<InvitationRecordWithMusic | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      // State the rule now so the caller gets the real reason, and again inside the write below.
      assertEditable(toRecord(stored).status);

      // A write that names the version it read only applies while `updatedAt` still names it (S2).
      const version = expectedUpdatedAt === undefined ? {} : { updatedAt: expectedUpdatedAt };
      const changed = await tx.invitation.updateMany({
        // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
        where: { id, ownerId, status: { in: ["DRAFT", "PUBLISHED"] }, ...version },
        data: { content: content as Prisma.InputJsonObject },
      });
      if (changed.count !== 1) {
        // The row stopped being editable after the read, or a versioned write met a newer row (S2).
        throw expectedUpdatedAt === undefined
          ? new InvitationNotEditableError("ARCHIVED")
          : new InvitationContentConflictError();
      }

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  /**
   * Stores the feature data of a DRAFT or a PUBLISHED invitation in one transaction: the zone on the invitation
   * and the phone and playlist link in its one-to-one settings row, which is created on first write and never
   * deleted. The write's `WHERE` names the owner and both editable statuses, so an archived invitation is refused
   * even by a concurrent archive (S4, S7, A2), and another owner's id matches nothing (A4).
   */
  async updateFeatures(
    ownerId: string,
    id: string,
    features: InvitationFeatureSettingsWrite,
  ): Promise<InvitationRecordWithMusic | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      // State the rule now so the caller gets the real reason, and again inside the write below.
      assertEditable(toRecord(stored).status);

      const changed = await tx.invitation.updateMany({
        where: { id, ownerId, status: { in: ["DRAFT", "PUBLISHED"] } },
        data: { timeZone: features.timeZone },
      });
      if (changed.count !== 1) {
        // The row stopped being editable after the read: the only other status is ARCHIVED.
        throw new InvitationNotEditableError("ARCHIVED");
      }

      // One row per invitation at most, created on the first write; clearing a value writes NULL and keeps it.
      await tx.invitationFeatureSettings.upsert({
        where: { invitationId: id },
        create: {
          invitationId: id,
          whatsappPhone: features.whatsappPhone,
          playlistUrl: features.playlistUrl,
          playlistTitle: features.playlistTitle,
          playlistCoverUrl: features.playlistCoverUrl,
        },
        update: {
          whatsappPhone: features.whatsappPhone,
          playlistUrl: features.playlistUrl,
          // The metadata always travels with its link: a cleared or changed link writes its own, stale metadata
          // never survives a change (S2).
          playlistTitle: features.playlistTitle,
          playlistCoverUrl: features.playlistCoverUrl,
        },
      });

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  /**
   * Stores the point of one address field of a DRAFT or a PUBLISHED invitation in one transaction whose first read
   * names the owner, so another owner's id matches nothing (A4) and an archived invitation is refused before anything
   * is written (A2, S7). The upsert is keyed by the pair `(invitationId, field)`, so a second choice for the same
   * field replaces its label and coordinates instead of adding a row (S2).
   */
  async updatePlace(
    ownerId: string,
    id: string,
    place: InvitationPlaceWrite,
  ): Promise<InvitationRecordWithMusic | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      // State the rule now so the caller gets the real reason: only an archived invitation is refused (A2, S7).
      assertEditable(toRecord(stored).status);

      const point = { label: place.label, lat: place.lat, lng: place.lng };
      await tx.invitationPlace.upsert({
        where: { invitationId_field: { invitationId: id, field: place.field } },
        create: { invitationId: id, field: place.field, ...point },
        update: point,
      });

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  /** Clears the stored point of one address field, with the same owner scope and archived refusal (S2, A2, A4). */
  async clearPlace(
    ownerId: string,
    id: string,
    field: string,
  ): Promise<InvitationRecordWithMusic | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      assertEditable(toRecord(stored).status);

      await tx.invitationPlace.deleteMany({ where: { invitationId: id, field } });

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  async archive(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      const current = toRecord(stored);
      // The domain states the transition (DRAFT or PUBLISHED -> ARCHIVED, A2); ARCHIVED and its marker are
      // written together below. The status is no longer PUBLISHED, so the marker is cleared in the same write,
      // as the `Invitation_publishedAt_matches_status` check requires.
      const next = archive(current.status);

      const changed = await tx.invitation.updateMany({
        where: { id, ownerId, status: current.status },
        data: { status: next, archivedAt: new Date(), publishedAt: null },
      });
      if (changed.count !== 1) {
        // A concurrent archive won; this request archived nothing, so it is not a successful change.
        throw new InvitationAlreadyArchivedError();
      }

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  async publish(ownerId: string, id: string, at: Date): Promise<InvitationRecordWithMusic | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      const current = toRecord(stored);
      // The domain states the transition and gives each wrong status its own error: an already published
      // invitation and an archived one are not the same outcome (S7, A2).
      const next = publish(current.status);

      const changed = await tx.invitation.updateMany({
        // A claimed refund keeps this invitation out of publishing: the database orders the two (T2, S3).
        where: { id, ownerId, status: "DRAFT", refundRequestedAt: null },
        data: {
          status: next,
          publishedAt: at,
          // Only the first publication writes the history the refund rule reads; a publish after an unpublish keeps
          // the original instant (T2, S3). The transition is guarded by DRAFT, so this read cannot have gone stale:
          // nothing else writes this row while it is a draft.
          ...(current.firstPublishedAt === null ? { firstPublishedAt: at } : {}),
        },
      });
      if (changed.count !== 1) {
        // A claimed refund is what refused this publication, so it answers the payment gate's own refusal (T2, S3).
        const claimed = await tx.invitation.findFirst({
          where: { id, refundRequestedAt: { not: null } },
          select: { id: true },
        });
        if (claimed !== null) {
          throw new InvitationPaymentRequiredError("PAYMENT_REQUIRED");
        }
        // A concurrent publish or archive won; nothing was published by this request.
        throw new InvitationAlreadyPublishedError();
      }

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  async unpublish(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      const next = unpublish(toRecord(stored).status);

      const changed = await tx.invitation.updateMany({
        where: { id, ownerId, status: "PUBLISHED" },
        // The status is no longer PUBLISHED, so `publishedAt` is cleared in the same write (S7, A2).
        data: { status: next, publishedAt: null },
      });
      if (changed.count !== 1) {
        // A concurrent unpublish or archive won; nothing returned to DRAFT by this request.
        throw new InvitationNotPublishedError();
      }

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  async findPublishedBySlug(slug: string): Promise<InvitationRecordWithMusic | null> {
    const now = new Date();
    // One query on the unique slug index: the status and the expiry are filtered there too, so a draft, an
    // archived, an expired, and an unknown slug are all a single miss (S2, A3, S8).
    const stored = await this.prisma.invitation.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: INVITATION_SELECT,
    });

    return stored === null ? null : toRecord(stored);
  }
}
