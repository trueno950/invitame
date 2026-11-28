import { Prisma, type PrismaClient } from "@prisma/client";
import {
  InvitationContentConflictError,
  InvitationPaymentRequiredError,
  InvitationSlugRenameConflictError,
  InvitationSlugRenameLimitError,
  InvitationSlugTakenError,
} from "../application/invitation.application.errors";
import type {
  InvitationFeatureSettingsWrite,
  InvitationPasswordState,
  InvitationPlaceWrite,
  InvitationRecordWithMusic,
  InvitationRepository,
  NewInvitation,
  SharedInvitationRecord,
} from "../application/invitation.repository";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import type { JsonObject } from "../domain/invitation-content";
import { storedGiftRegistry } from "../domain/invitation-gift-registry";
import { storedItinerary } from "../domain/invitation-itinerary";
import { storedInvitationLanguage } from "../domain/invitation-language";
import { storedLodging } from "../domain/invitation-lodging";
import { storedLivestream } from "../domain/invitation-livestream";
import { storedReminders } from "../domain/invitation-reminders";
import { archive, assertEditable, publish, unpublish } from "../domain/invitation-lifecycle";
import { MAX_INVITATION_SLUG_RENAMES } from "../domain/invitation-slug";
import { storedInvitationPermissions } from "../../collaborators/domain/invitation-collaborator";
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
  // Read only to answer whether a code is set: the hash itself never leaves this adapter (F13; L18.1).
  passwordHash: true,
  passwordVersion: true,
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
      // The stored plan of the day, gift registry, lodging, livestream, opening animation switch, and reminder switches
      // travel with the row too (F1, F2, F4, F9, F10, F6); the domain decides whether they read as one.
      itinerary: true,
      giftRegistry: true,
      lodging: true,
      livestream: true,
      openingAnimation: true,
      reminders: true,
      // The language the owner chose (F14; L19.1) travels with the row too, so an owned or public read stays one query.
      language: true,
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

/** The sentence the alias-limit trigger of `20261213120000_add_invitation_slug_alias` raises. */
const ALIAS_LIMIT_REFUSAL = "Invitation slug alias limit reached";

/**
 * Whether the alias-limit trigger refused the write (F11; L15.2, R4-002). The trigger's refusal reaches this adapter as
 * a driver error that carries no Prisma code, so the one fixed sentence the migration states is what identifies it; the
 * message is compared and never stored, logged, or returned, and a sentence that does not match is not treated as this
 * refusal.
 */
function isAliasLimitReached(error: unknown): boolean {
  return error instanceof Error && error.message.includes(ALIAS_LIMIT_REFUSAL);
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
    // A row written around the API reads as no itinerary instead of a payload no rule validated (F1; L3.1).
    itinerary: storedItinerary(row.featureSettings?.itinerary),
    // The gift registry follows the same rule (F2; L4.1).
    giftRegistry: storedGiftRegistry(row.featureSettings?.giftRegistry),
    // And the lodging too (F4; L7.1).
    lodging: storedLodging(row.featureSettings?.lodging),
    // And the livestream (F9; L12.1).
    livestream: storedLivestream(row.featureSettings?.livestream),
    // The opening animation switch (F10; L14.3): a row with no settings row reads the column's default, which is what the
    // first write stores, so an invitation that never saved feature data still plays the animation.
    openingAnimation: row.featureSettings?.openingAnimation ?? true,
    // The language reads as `es` for a row written around the API, which is the column's default (F14; L19.5).
    language: storedInvitationLanguage(row.featureSettings?.language),
    // The reminder switches read as none when a row written around the API does not satisfy their rules (F6; L9.1).
    reminders: storedReminders(row.featureSettings?.reminders),
    // Whether an access code protects the invitation (F13; L18.1). The hash is read and reduced to this boolean here, so no
    // projection, log, response, or test fixture of a read can carry it.
    passwordProtected: row.passwordHash !== null,
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

/**
 * The JSONB value of a nullable payload column (F1, F2): SQL NULL for "nothing stored", which is what a cleared
 * itinerary or gift registry is, and the validated payload otherwise. `Prisma.DbNull` is the database's NULL rather
 * than the JSON `null`, so the column never stores a value no reader can tell apart from an empty payload.
 */
function jsonPayloadColumn<T>(payload: T | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return payload === null ? Prisma.DbNull : (payload as unknown as Prisma.InputJsonValue);
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
          // The settings row's default party limit, read when the draft was created (M9 T13; S5, S8).
          rsvpPartyLimit: input.rsvpPartyLimit,
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

  async listSharedWith(userId: string): Promise<SharedInvitationRecord[]> {
    const rows = await this.prisma.invitation.findMany({
      where: {
        // Never the caller's own: an invitation it owns is already in the owned list, and answering it here too would
        // list it twice and mark it `COLLABORATOR` over its own row (F12; L17.5).
        ownerId: { not: userId },
        collaborators: {
          some: { userId, acceptedAt: { not: null }, revokedAt: null },
        },
      },
      // The caller's own accepted row travels with the invitation, and only that one: another collaborator's set is not
      // the caller's access. Access is inside the query — the account, the acceptance, and the absence of a revoke — so
      // an account can never list an invitation it has no accepted row for (F12; L17.5).
      select: {
        ...INVITATION_SELECT,
        collaborators: {
          where: { userId, acceptedAt: { not: null }, revokedAt: null },
          select: { permissions: true },
        },
      },
      // The same order the owner's own list uses, so one merged list reads newest first. PostgreSQL compares the uuid
      // bytes, which is the plain code-unit order the merge applies to the same values.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const shared: SharedInvitationRecord[] = [];
    for (const row of rows) {
      // A row written around the API is answered by what the allow-list knows, never by what it holds (L20): the known
      // permissions in the domain's canonical order, and a set that grants none of them is no access at all, so it never
      // reaches the list.
      const permissions = storedInvitationPermissions(
        row.collaborators.flatMap((collaborator) => collaborator.permissions),
      );
      if (permissions.length === 0) {
        continue;
      }
      shared.push({ ...toRecord(row), permissions });
    }

    return shared;
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
          itinerary: jsonPayloadColumn(features.itinerary),
          giftRegistry: jsonPayloadColumn(features.giftRegistry),
          lodging: jsonPayloadColumn(features.lodging),
          livestream: jsonPayloadColumn(features.livestream),
          // The switch is a column of its own (F10; L14.3): a write that names it stores it, and one that omits it keeps
          // the column's default, true, which is the state a granted package starts in.
          ...(features.openingAnimation === undefined
            ? {}
            : { openingAnimation: features.openingAnimation }),
          reminders: jsonPayloadColumn(features.reminders),
          // A write that names the language stores it; one that omits it keeps the column's default, `es` (F14; L19.1).
          ...(features.language === undefined ? {} : { language: features.language }),
        },
        update: {
          whatsappPhone: features.whatsappPhone,
          playlistUrl: features.playlistUrl,
          // The metadata always travels with its link: a cleared or changed link writes its own, stale metadata
          // never survives a change (S2).
          playlistTitle: features.playlistTitle,
          playlistCoverUrl: features.playlistCoverUrl,
          // A cleared itinerary, gift registry, lodging, or livestream is SQL NULL, never the JSON value `null`, so the
          // column reads as absent (F1, F2, F4, F9).
          itinerary: jsonPayloadColumn(features.itinerary),
          giftRegistry: jsonPayloadColumn(features.giftRegistry),
          lodging: jsonPayloadColumn(features.lodging),
          livestream: jsonPayloadColumn(features.livestream),
          // An omitted switch keeps the stored one, so a write that predates F10 never flips it (F10; L14.3).
          ...(features.openingAnimation === undefined
            ? {}
            : { openingAnimation: features.openingAnimation }),
          reminders: jsonPayloadColumn(features.reminders),
          // An omitted language keeps the stored one, so a write that predates F14 never resets it (F14; L19.1).
          ...(features.language === undefined ? {} : { language: features.language }),
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

  /**
   * Stores the encoded access-code hash and raises the password version, in one statement whose `WHERE` names the id, the
   * owner, and a row that is not archived (F13; L18.1, L18.2). Carrying the archived refusal inside the statement is what
   * closes the race a read-then-write leaves open: an invitation archived between the owner's read and this write matches
   * no row, so a code can never land on an archived invitation. The raise is part of the statement, so two concurrent
   * writes still leave a version above both reads and every token minted before either write stops opening the invitation.
   */
  async setPassword(
    ownerId: string,
    id: string,
    passwordHash: string,
  ): Promise<InvitationPasswordState | null> {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id, ownerId, status: { not: "ARCHIVED" } },
      data: { passwordHash, passwordVersion: { increment: 1 } },
    });

    return count === 0 ? this.passwordWriteMiss(ownerId, id) : this.passwordState(id);
  }

  /**
   * Clears the stored access code and raises the password version, in one statement with the same id, owner, and
   * not-archived `WHERE` as `setPassword` (F13; L18.1, L18.2).
   */
  async clearPassword(ownerId: string, id: string): Promise<InvitationPasswordState | null> {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id, ownerId, status: { not: "ARCHIVED" } },
      data: { passwordHash: null, passwordVersion: { increment: 1 } },
    });

    return count === 0 ? this.passwordWriteMiss(ownerId, id) : this.passwordState(id);
  }

  /**
   * The answer of a write whose one statement matched no row: another owner's id and an id that names nothing answer null
   * without saying which, and an archived invitation states its own refusal (A2, A4). The stored status is read only to
   * tell those two answers apart.
   */
  private async passwordWriteMiss(ownerId: string, id: string): Promise<null> {
    const stored = await this.prisma.invitation.findFirst({
      where: { id, ownerId },
      select: { status: true },
    });

    if (stored?.status === "ARCHIVED") {
      throw new InvitationNotEditableError("ARCHIVED");
    }

    return null;
  }

  /** The state one access-code write leaves, carrying only whether a code is set and its version (never the hash). */
  private async passwordState(id: string): Promise<InvitationPasswordState | null> {
    const stored = await this.prisma.invitation.findUnique({
      where: { id },
      select: { passwordHash: true, passwordVersion: true },
    });

    return stored === null
      ? null
      : {
          passwordProtected: stored.passwordHash !== null,
          passwordVersion: stored.passwordVersion,
        };
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
      // The domain states the transition (DRAFT or PUBLISHED -> ARCHIVED, A2); ARCHIVED and its markers are
      // written together below. The status is no longer PUBLISHED, so `publishedAt` and `expiresAt` are cleared in the
      // same write, as the `Invitation_publishedAt_matches_status` check requires and the expiry rule states (S1).
      const next = archive(current.status);

      const changed = await tx.invitation.updateMany({
        where: { id, ownerId, status: current.status },
        // The status is no longer PUBLISHED, so the publication markers are cleared in the same write (S1, A2).
        data: { status: next, archivedAt: new Date(), publishedAt: null, expiresAt: null },
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

  async publish(
    ownerId: string,
    id: string,
    at: Date,
    expiresAt: Date | null = null,
  ): Promise<InvitationRecordWithMusic | null> {
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
          // How long this invitation lives is the pinned package's decision, so the caller states the instant it
          // computed from the publication and the duration (S1, T2). A caller that states none leaves the row without an
          // expiry, which reads as "never expires" rather than as an invented lifetime.
          expiresAt,
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
        // The status is no longer PUBLISHED, so `publishedAt` and `expiresAt` are cleared in the same write (S1, S7, A2).
        data: { status: next, publishedAt: null, expiresAt: null },
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
    // One query on the unique slug index: a draft, an archived, and an unknown slug are a single miss (S2, A3). An
    // expired row is answered like a live one, because it stays visible read-only and the projection flags it (S2, T3).
    const stored = await this.prisma.invitation.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: INVITATION_SELECT,
    });

    return stored === null ? null : toRecord(stored);
  }

  async findPublishedByAlias(slug: string): Promise<InvitationRecordWithMusic | null> {
    // A previous address redirects to its invitation's current one (F11; L15.3). The alias row is read first and the
    // invitation through it, so a draft that once held the address answers nothing, exactly like the slug read (A3).
    const alias = await this.prisma.invitationSlugAlias.findUnique({
      where: { slug },
      select: { invitationId: true },
    });
    if (alias === null) {
      return null;
    }
    const stored = await this.prisma.invitation.findFirst({
      where: { id: alias.invitationId, status: "PUBLISHED" },
      select: INVITATION_SELECT,
    });

    return stored === null ? null : toRecord(stored);
  }

  async countSlugAliases(invitationId: string): Promise<number> {
    return this.prisma.invitationSlugAlias.count({ where: { invitationId } });
  }

  async isSlugInUse(slug: string, exceptInvitationId: string): Promise<boolean> {
    // The current addresses of the other invitations, then every previous address — including one this invitation left
    // behind, because a previous address is final (L15.1). One query per term, and the second is skipped when the first
    // already answered.
    const current = await this.prisma.invitation.findFirst({
      where: { slug, NOT: { id: exceptInvitationId } },
      select: { id: true },
    });
    if (current !== null) {
      return true;
    }
    const alias = await this.prisma.invitationSlugAlias.findUnique({
      where: { slug },
      select: { slug: true },
    });

    return alias !== null;
  }

  async renameSlug(
    ownerId: string,
    id: string,
    slug: string,
  ): Promise<InvitationRecordWithMusic | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const stored = await tx.invitation.findFirst({
          where: { id, ownerId },
          select: INVITATION_SELECT,
        });
        if (stored === null) {
          return null;
        }
        // State the rule now so the caller gets the real reason, and again inside the write below (A2, S7).
        assertEditable(toRecord(stored).status);

        const previousSlug = stored.slug;
        if (previousSlug === slug) {
          return toRecord(stored);
        }

        const kept = await tx.invitationSlugAlias.count({ where: { invitationId: id } });
        if (kept >= MAX_INVITATION_SLUG_RENAMES) {
          throw new InvitationSlugRenameLimitError(MAX_INVITATION_SLUG_RENAMES);
        }

        // The two uniqueness terms the database also holds: another invitation's current address, and any previous
        // address. Stated here so a taken address answers its own refusal instead of a constraint violation.
        const current = await tx.invitation.findFirst({
          where: { slug, NOT: { id } },
          select: { id: true },
        });
        if (current !== null) {
          throw new InvitationSlugTakenError(slug);
        }
        const alias = await tx.invitationSlugAlias.findUnique({
          where: { slug },
          select: { slug: true },
        });
        if (alias !== null) {
          throw new InvitationSlugTakenError(slug);
        }

        // The transaction-local setting is what the pinned-field trigger reads: it names this one invitation, lives
        // only as long as this transaction, and is never set by any other write (see the migration).
        await tx.$executeRaw`SELECT set_config('invitame.slug_rename', ${id}, true)`;

        const changed = await tx.invitation.updateMany({
          where: { id, ownerId, status: { in: ["DRAFT", "PUBLISHED"] } },
          data: { slug },
        });
        if (changed.count !== 1) {
          // The row stopped being editable after the read: the only other status is ARCHIVED.
          throw new InvitationNotEditableError("ARCHIVED");
        }

        // The previous address becomes an alias, so an already shared link keeps resolving to the current one. The
        // deferred constraint trigger refuses a rename whose alias this transaction did not store.
        await tx.invitationSlugAlias.create({ data: { invitationId: id, slug: previousSlug } });

        const renamed = await tx.invitation.findFirst({
          where: { id, ownerId },
          select: INVITATION_SELECT,
        });

        return renamed === null ? null : toRecord(renamed);
      });
    } catch (error) {
      // Two concurrent renames can pass every read above and meet the database's own guards, so each refusal is
      // reported as the outcome it is, never as a server fault or a false "taken" (F11; L15.2, R4-002).
      if (isAliasLimitReached(error)) {
        throw new InvitationSlugRenameLimitError(MAX_INVITATION_SLUG_RENAMES);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // A unique key refused the write. When the address the owner asked for is held by somebody else, it is the
        // taken address it always was; otherwise the winning rename of this same invitation already stored the
        // address that was current here, so the owner retries and reads the current state.
        if (await this.isSlugInUse(slug, id)) {
          throw new InvitationSlugTakenError(slug);
        }
        throw new InvitationSlugRenameConflictError();
      }
      throw error;
    }
  }
}
