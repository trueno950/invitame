import { Logger } from "@nestjs/common";

import {
  INITIAL_OPERATIONAL_SETTINGS_READER,
  type OperationalSettingsReader,
} from "../../settings/application/operational-settings";
import { InvitationNotPublishableError } from "../domain/invitation.errors";
import {
  type JsonObject,
  missingRequiredFields,
  validateDraftContent,
} from "../domain/invitation-content";
import { invitationExpiresAt, isInvitationExpired } from "../domain/invitation-expiration";
import {
  availableFeatureKeys,
  GALLERY_FEATURE_KEY,
  GUESTBOOK_FEATURE_KEY,
  EMPTY_PUBLIC_GUEST_ALBUM,
  GUEST_ALBUM_FEATURE_KEY,
  isMusicCoverUrl,
  MAP_FEATURE_KEY,
  musicProviderOf,
  normalizePlaylistTitle,
  publicInvitationFeatures,
  validateInvitationFeatureSettings,
} from "../domain/invitation-features";
import type { InvitationGiftRegistry } from "../domain/invitation-gift-registry";
import type { InvitationItinerary } from "../domain/invitation-itinerary";
import type { InvitationLodging } from "../domain/invitation-lodging";
import type { InvitationLivestream } from "../domain/invitation-livestream";
import type { InvitationReminders } from "../domain/invitation-reminders";
import {
  archive,
  assertEditable,
  type InvitationStatus,
  publish,
  unpublish,
} from "../domain/invitation-lifecycle";
import { confirmedPlaces, type PlacePoint } from "../domain/invitation-place";
import {
  generateInvitationSlug,
  isReservedSlug,
  isValidInvitationSlug,
  remainingSlugRenames,
} from "../domain/invitation-slug";
import { packageFitsTemplateVersion } from "../domain/package-fit";
import { PACKAGE_FIT_ISSUE, publicationIssues } from "../domain/publication-readiness";
import {
  InvalidInvitationContentError,
  InvalidInvitationFeaturesError,
  InvitationPackageDoesNotFitError,
  InvitationPackageNotFoundError,
  InvitationPaymentRequiredError,
  InvitationSlugTakenError,
  InvitationSlugUnavailableError,
  InvitationTemplateVersionNotPublishedError,
  PublicInvitationNotRenderableError,
} from "./invitation.application.errors";
import type {
  InvitationRecord,
  InvitationRecordWithMusic,
  InvitationRepository,
  NewInvitation,
  SharedInvitationRecord,
} from "./invitation.repository";
import type { CatalogVersionRenderData, InvitationCatalog } from "./invitation-catalog";
import type { InvitationRole } from "../../collaborators/application/invitation-access";
import type { InvitationPermission } from "../../collaborators/domain/invitation-collaborator";
import type { InvitationGalleryReader } from "./invitation-gallery";
import type { InvitationGuestbookReader } from "./guestbook.repository";
import type { InvitationGuestAlbumReader } from "./invitation-guest-album";
import type { InvitationPaymentGate } from "./invitation-payment-gate";
import {
  legacyGiftRegistryHiddenFields,
  type PublicInvitation,
  projectPublicContent,
  publicHiddenFields,
} from "./invitation-public";
import { type MusicMetadataProvider, NO_MUSIC_METADATA } from "./music-metadata";
import type { ReminderSender } from "../../reminders/application/reminder-sender";

// The invitation use cases (M4 T3 and M5 T3; S1, S2, S3, S6, S7, S9, A1, A3, A4, A7). Creating and editing a
// draft is free for any signed-in customer: the chosen package is only validated against the pinned version's
// renderer, and payment belongs to publication (M5/M7). Every command receives the owner from the caller, which
// the route reads from the session (S9); no command accepts an owner in its payload, and every read or write
// goes through a port whose query carries that owner (S9, A4). Publishing re-states the readiness rule, asks
// the payment gate, then writes; the public read carries no owner at all and answers only the allow-listed
// projection (A7). Nothing is deleted: archiving is the only terminal lifecycle write (S7, A2).

/** How many slugs one create request may try before it reports that no slug is available (S5). */
export const MAX_SLUG_ATTEMPTS = 5;

/**
 * Where a new draft's slug comes from. The module injects the domain generator over `Math.random`; a test
 * injects a deterministic sequence, which is the only way to observe the retry and the reserved-word skip.
 */
export type InvitationSlugSource = () => string;

/** The generated public slug (S5): a neutral prefix and six random characters, never derived from the owner. */
const DEFAULT_SLUG_SOURCE: InvitationSlugSource = () => generateInvitationSlug(Math.random);

/** The values of a create request; `ownerId` comes from the session, never from the request payload (S9). */
export interface CreateDraftInput {
  ownerId: string;
  templateVersionId: string;
  packageId: string;
}

/** The values of a content update; the owner again comes from the session (S9). */
export interface UpdateContentInput {
  ownerId: string;
  id: string;
  content: unknown;
  /** The `updatedAt` the caller read, which makes the write conditional on that version (S2). */
  expectedUpdatedAt?: string;
}

/**
 * The values of a feature update (F1, F6; S4, S7): the zone the owner chose, the phone they typed, and the
 * playlist link they pasted. All three are unvalidated request values — the domain validates them before
 * anything is stored — and the owner comes from the session (S9).
 */
export interface UpdateFeaturesInput {
  ownerId: string;
  id: string;
  timeZone: unknown;
  whatsappPhone: unknown;
  playlistUrl: unknown;
  /** The plan of the day as the request carried it; the domain validates it before anything is stored (F1; L3.1). */
  itinerary: unknown;
  /**
   * The gift registry as the request carried it, or `undefined` when the body omitted it (F2; L4.1, L4.3): an omitted
   * value keeps the stored registry, which is what lets a client built before F2 save the other fields without clearing
   * a registry it never knew about.
   */
  giftRegistry?: unknown;
  /**
   * The lodging as the request carried it, or `undefined` when the body omitted it (F4; L7.1, L7.3): an omitted value
   * keeps the stored lodging, which is what lets a client built before F4 save the other fields without clearing a
   * block it never knew about.
   */
  lodging?: unknown;
  /**
   * The livestream as the request carried it, or `undefined` when the body omitted it (F9; L12.1): an omitted value
   * keeps the stored livestream, which is what lets a client built before F9 save the other fields without clearing a
   * link it never knew about.
   */
  livestream?: unknown;
  /**
   * The opening animation switch as the request carried it, or `undefined` when the body omitted it (F10; L14.3): an
   * omitted value keeps the stored switch, which is what lets a client built before F10 save the other fields without
   * switching an animation off that it never knew about.
   */
  openingAnimation?: unknown;
  /**
   * The reminder switches as the request carried them, or `undefined` when the body omitted them (F6; L9.1): an omitted
   * value keeps the stored switches, which is what lets a client built before F6 save the other fields without
   * switching a reminder off that it never knew about.
   */
  reminders?: unknown;
}

/** A row of "Mis invitaciones": the editor loads one invitation when it opens it. */
export interface InvitationSummary {
  id: string;
  templateVersionId: string;
  packageId: string;
  slug: string;
  status: InvitationStatus;
  archivedAt: Date | null;
  /**
   * When the invitation was published, null while it is a DRAFT. `expiresAt` is deliberately not exposed: the
   * column exists for a later milestone and Milestone 5 never writes it, so a response must not pretend a
   * client can rely on an expiry (S8).
   */
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One row of "Mis invitaciones" as the list renders it (T2; S2.6): the lifecycle summary plus the stored content and
 * the renderer identity of the pinned version, so a card shows the celebration's name, its date, and a miniature of
 * the real layout instead of only the generated slug. The renderer and its configuration are null when the catalog
 * answers no render data for the pinned version, and then the card falls back to the content and the slug.
 */
export interface InvitationListItem extends InvitationSummary {
  content: JsonObject;
  componentKey: string | null;
  configuration: unknown;
  /**
   * The caller's role on this row (F12; L17.5): `OWNER` for an invitation the caller owns, `COLLABORATOR` for one another
   * owner shared with it. The card renders «Compartida contigo» from it, and the web offers only the tabs the role may
   * use; the API checks every route's permission again on each request, so this is a convenience, never a guard.
   */
  role: InvitationRole;
  /**
   * The permissions the caller holds here, in the domain's canonical order: empty for the owner, whose authority is not a
   * permission set, and at least one for a collaborator (L17.2).
   */
  permissions: readonly InvitationPermission[];
}

/**
 * One invitation as its owner edits it: the stored fields, the bounded content, the feature data, the gated
 * features the guest will see, and the required fields the draft does not provide yet (F1; S4, S7). The owner id
 * is deliberately absent: it came from the session and never belongs in a response.
 */
export interface OwnedInvitation extends InvitationSummary {
  content: JsonObject;
  missingRequiredFields: string[];
  /** The stored IANA zone (S4). */
  timeZone: string;
  /**
   * The stored feature data; `whatsappPhone` is E.164 or null, `playlistUrl` is a normalized `https` link on an
   * allow-listed music host or null, and `playlistTitle` and `playlistCoverUrl` are the metadata the provider
   * answered when that link was saved, or null (S4, S7, S2).
   */
  featureSettings: {
    whatsappPhone: string | null;
    playlistUrl: string | null;
    playlistTitle: string | null;
    playlistCoverUrl: string | null;
    /** The stored plan of the day, or null when the invitation has none (F1; L3.1). */
    itinerary: InvitationItinerary | null;
    /** The stored gift registry, or null when the invitation has none (F2; L4.1). */
    giftRegistry: InvitationGiftRegistry | null;
    /** The stored lodging, or null when the invitation has none (F4; L7.1). */
    lodging: InvitationLodging | null;
    /** The stored livestream, or null when the invitation has none (F9; L12.1). */
    livestream: InvitationLivestream | null;
    /** The stored opening animation switch (F10; L14.3), true by default. */
    openingAnimation: boolean;
    /** The stored reminder switches, or null while the owner switched nothing on (F6; L9.1). */
    reminders: InvitationReminders | null;
  };
  /**
   * How many times this owner may still rename the address (F11; S2.11, L15.2): the rename bound minus the previous
   * addresses the invitation keeps. It is added beside the fields the read already carried and changes none of them.
   */
  slugRenamesRemaining: number;
  /**
   * Whether this deployment can deliver a WhatsApp reminder at all (F6; S6, L9.5). It is a capability, never a secret:
   * false means every send is recorded as skipped `not_configured`, and the editor says «Aún no está activo». The
   * switches are stored either way, so they work as soon as a sender is configured.
   */
  remindersConfigured: boolean;
  /**
   * The gated keys of the features this invitation will show, `CALENDAR` included (S4). The package's keys are
   * read at request time, because the gate is about what the catalog grants now.
   */
  availableFeatures: string[];
  /**
   * The points the owner stored for the address fields of the invitation, keyed by the content field each one
   * belongs to (S2). Every stored point is answered, even one whose address text has since changed, so the editor can
   * say whether the location is still confirmed; the guest read is the one that drops a stale point.
   */
  places: Record<string, PlacePoint>;
}

const INVITATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value can name a stored row. An id that is not a UUID names nothing and would make PostgreSQL
 * refuse the cast, so the use cases answer "not found" before reaching a port.
 */
function isInvitationId(value: unknown): value is string {
  return typeof value === "string" && INVITATION_ID.test(value);
}

function toSummary(record: InvitationRecord): InvitationSummary {
  return {
    id: record.id,
    templateVersionId: record.templateVersionId,
    packageId: record.packageId,
    slug: record.slug,
    status: record.status,
    archivedAt: record.archivedAt,
    publishedAt: record.publishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** The owner's view of one invitation, with the schema of the version it is pinned to and the gated features. */
export function toOwnedInvitation(
  record: InvitationRecordWithMusic,
  schema: unknown,
  includedFeatureKeys: readonly string[],
  /**
   * How many renames the invitation still has, from the previous addresses it keeps (F11; L15.2, R3-001). It is a
   * required argument on purpose: every owned answer states the stored count, so no route falls back to the whole
   * allowance and reports five renames left after the owner already spent some.
   */
  slugRenamesRemaining: number,
  remindersConfigured = false,
): OwnedInvitation {
  return {
    ...toSummary(record),
    content: record.content,
    missingRequiredFields: missingRequiredFields(schema, record.content),
    timeZone: record.timeZone,
    featureSettings: {
      whatsappPhone: record.whatsappPhone,
      playlistUrl: record.playlistUrl,
      playlistTitle: record.playlistTitle,
      playlistCoverUrl: record.playlistCoverUrl,
      itinerary: record.itinerary,
      giftRegistry: record.giftRegistry,
      lodging: record.lodging,
      livestream: record.livestream,
      openingAnimation: record.openingAnimation,
      reminders: record.reminders,
    },
    slugRenamesRemaining,
    remindersConfigured,
    availableFeatures: availableFeatureKeys({
      includedFeatureKeys,
      whatsappPhone: record.whatsappPhone,
      playlistUrl: record.playlistUrl,
      playlistTitle: record.playlistTitle,
      playlistCoverUrl: record.playlistCoverUrl,
      itinerary: record.itinerary,
      giftRegistry: record.giftRegistry,
      lodging: record.lodging,
      livestream: record.livestream,
      openingAnimation: record.openingAnimation,
      rsvpDeadline: record.rsvpDeadline,
      rsvpPartyLimit: record.rsvpPartyLimit,
    }),
    // Every stored point, keyed by its address field: the editor decides what to say about each one (S2).
    places: { ...record.places },
  };
}

/**
 * The feature keys the pinned package includes right now, or none when the catalog can no longer answer for it.
 * A missing package fails closed: the gate then offers only `CALENDAR`, never a feature nobody verified (S4).
 * It is exported because the guest-list use cases ask the same question of the same contract (M6 G2).
 */
export async function includedFeatureKeysOf(
  catalog: InvitationCatalog,
  packageId: string,
): Promise<readonly string[]> {
  const entitlements = await catalog.findPackageEntitlements(packageId);

  return entitlements?.includedFeatureKeys ?? [];
}

/**
 * Creates a free DRAFT pinned to a PUBLISHED version (S1, S3, S6, S7). The version must be published and its
 * template too; the package must exist and fit what the version's renderer needs (A1); the content starts as
 * an empty object, so the draft is incomplete until the owner fills it. The slug is generated, reserved words
 * are skipped, and only a unique-slug collision is retried, at most `MAX_SLUG_ATTEMPTS` times. Throws
 * `InvitationTemplateVersionNotPublishedError`, `InvitationPackageNotFoundError`,
 * `InvitationPackageDoesNotFitError`, and `InvitationSlugUnavailableError`.
 */
export class CreateInvitationDraftUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly nextSlug: InvitationSlugSource = DEFAULT_SLUG_SOURCE,
    // The operational settings (M9 T13; S5, S8): a new draft starts with the party limit the panel states, read at
    // the moment the draft is created so a save takes effect on the next invitation. Composed without a settings
    // module, the reader answers the values the migration seeds.
    private readonly settings: OperationalSettingsReader = INITIAL_OPERATIONAL_SETTINGS_READER,
    /**
     * The WhatsApp reminder sender port (F6; S6), read only for its capability: the draft's read states whether this
     * deployment can deliver a reminder, never a secret and never a message. A caller that omits it answers false,
     * which is exactly what a deployment without a provider has.
     */
    private readonly reminders?: ReminderSender,
  ) {}

  async execute(input: CreateDraftInput): Promise<OwnedInvitation> {
    // A malformed id names no catalog record; report it as missing instead of letting PostgreSQL refuse it.
    if (!isInvitationId(input.templateVersionId)) {
      throw new InvitationTemplateVersionNotPublishedError();
    }
    if (!isInvitationId(input.packageId)) {
      throw new InvitationPackageNotFoundError();
    }

    const version = await this.catalog.findPublishedVersion(input.templateVersionId);
    if (version === null) {
      throw new InvitationTemplateVersionNotPublishedError();
    }

    const entitlements = await this.catalog.findPackageEntitlements(input.packageId);
    if (entitlements === null) {
      throw new InvitationPackageNotFoundError();
    }
    if (
      !packageFitsTemplateVersion(
        {
          packageStatus: entitlements.status,
          includedFeatureKeys: entitlements.includedFeatureKeys,
        },
        version.requiredFeatureKeys,
      )
    ) {
      throw new InvitationPackageDoesNotFitError(input.packageId);
    }

    const settings = await this.settings.current();
    const created = await this.createWithGeneratedSlug({
      ownerId: input.ownerId,
      templateVersionId: version.id,
      packageId: input.packageId,
      content: {},
      // The default party limit is the settings row's, so a panel save changes what the next draft starts with
      // without touching a single stored invitation (S8).
      rsvpPartyLimit: settings.rsvpDefaultPartyLimit,
    });

    return toOwnedInvitation(
      created,
      version.schema,
      entitlements.includedFeatureKeys,
      // A draft just created keeps no previous address, so it has the whole allowance (F11; L15.2).
      remainingSlugRenames(0),
      this.reminders?.isConfigured() ?? false,
    );
  }

  /**
   * Stores the draft with a generated slug. PostgreSQL's unique index is the only uniqueness guard (S3), so a
   * collision is an ordinary outcome: it draws again, and only a collision is retried. Any other failure is
   * reported as it is, because a second attempt would not fix it.
   */
  private async createWithGeneratedSlug(
    input: Omit<NewInvitation, "slug">,
  ): Promise<InvitationRecordWithMusic> {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.drawSlug();
      try {
        return await this.invitations.create({ ...input, slug });
      } catch (error) {
        if (!(error instanceof InvitationSlugTakenError)) {
          throw error;
        }
      }
    }

    throw new InvitationSlugUnavailableError();
  }

  /** A generated slug that is not a reserved word; a reserved draw is skipped, never attempted (S5). */
  private drawSlug(): string {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.nextSlug();
      if (!isReservedSlug(slug)) {
        return slug;
      }
    }

    throw new InvitationSlugUnavailableError();
  }
}

/**
 * The owner's invitations, newest first (S1), each with what a card renders it from (T2; S2.6).
 *
 * The shared read is the only part that can fail on its own without costing the caller their own list, so a failure there
 * is reported as one structured warning and the answer is the owned list: a co-host feature that is misbehaving must never
 * make «Mis invitaciones» fail (F12; L17.5).
 */
export class ListOwnInvitationsUseCase {
  private readonly logger = new Logger(ListOwnInvitationsUseCase.name);

  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
  ) {}

  /**
   * Every invitation the caller may reach, newest first: the ones it owns and, since F12, the ones another owner shared
   * with it (L17.5), each marked with the caller's role and permissions. Both reads scope access inside their own query,
   * so nothing the caller has no standing on can appear here. The render data of a pinned version is read once per
   * distinct snapshot, so a list of many drafts of one template costs one catalog read; a version the catalog does not
   * know answers no renderer, and the card then falls back to the content it already has.
   */
  async execute(userId: string): Promise<InvitationListItem[]> {
    const owned = await this.invitations.listOwned(userId);
    const shared = await this.sharedWith(userId);
    const versions = new Map<string, CatalogVersionRenderData | null>();
    const items: Array<InvitationListItem & { id: string; createdAt: Date }> = [];

    for (const record of [
      ...owned.map((row) => ({ row, role: "OWNER" as const, permissions: [] as const })),
      ...shared.map((row) => ({
        row,
        role: "COLLABORATOR" as const,
        permissions: row.permissions,
      })),
    ]) {
      let render = versions.get(record.row.templateVersionId);

      if (render === undefined) {
        render = await this.catalog.findVersionRenderData(record.row.templateVersionId);
        versions.set(record.row.templateVersionId, render);
      }
      items.push({
        ...toSummary(record.row),
        content: record.row.content,
        componentKey: render?.componentKey ?? null,
        configuration: render?.configuration ?? null,
        role: record.role,
        permissions: [...record.permissions],
      });
    }

    // One merged list newest first, with the id breaking a tie between two rows created in the same instant, exactly as
    // each read orders its own page. The id is compared by its code units, never by a locale: collation is a property of
    // the runtime's locale and would order the same two rows differently in two deployments, while the two reads order
    // theirs byte by byte in PostgreSQL.
    items.sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() ||
        (left.id > right.id ? -1 : left.id < right.id ? 1 : 0),
    );

    return items.map(
      (item): InvitationListItem => ({
        id: item.id,
        templateVersionId: item.templateVersionId,
        packageId: item.packageId,
        slug: item.slug,
        status: item.status,
        archivedAt: item.archivedAt,
        publishedAt: item.publishedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        content: item.content,
        componentKey: item.componentKey,
        configuration: item.configuration,
        role: item.role,
        permissions: item.permissions,
      }),
    );
  }

  /**
   * The invitations other owners shared with this account, or none when that read failed (F12; L17.5). One structured
   * warning states the fault and nothing else: no account id, no invitation id, and none of the driver's message, because
   * this line is operational evidence and never a place personal data or a query detail could reach.
   */
  private async sharedWith(userId: string): Promise<readonly SharedInvitationRecord[]> {
    try {
      return await this.invitations.listSharedWith(userId);
    } catch {
      this.logger.warn({ event: "invitation_shared_list_failed" });

      return [];
    }
  }
}

/**
 * One invitation of the owner (S7, A4), with the required fields it still lacks. The schema comes from the
 * pinned version, whatever that version's current status is, so a draft keeps validating and reporting missing
 * data after the catalog publishes a newer version (S3). Another owner's id answers null.
 */
export class GetOwnInvitationUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    /** The reminder sender port (F6; S6): its capability is what the editor's reminder block shows. */
    private readonly reminders?: ReminderSender,
  ) {}

  async execute(ownerId: string, id: string): Promise<OwnedInvitation | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }

    const snapshot = await this.catalog.findVersionSchema(stored.templateVersionId);
    const includedFeatureKeys = await includedFeatureKeysOf(this.catalog, stored.packageId);
    // How many renames are left is the alias count, read for the same read so the editor states it without a second
    // request (F11; L15.2).
    const renames = await this.invitations.countSlugAliases(stored.id);

    return toOwnedInvitation(
      stored,
      snapshot?.schema ?? null,
      includedFeatureKeys,
      // How many renames are left is the alias count, read for the same read so the editor states it without a second
      // request (F11; L15.2).
      remainingSlugRenames(renames),
      this.reminders?.isConfigured() ?? false,
    );
  }
}

/**
 * Replaces the bounded content of a DRAFT or a PUBLISHED invitation (S7): a published invitation changes live.
 * The content is validated against the pinned version's schema, which is read regardless of the version's
 * status (S3). Throws `InvitationNotEditableError` for an archived invitation and
 * `InvalidInvitationContentError` with the issues for content the pinned schema refuses; either way nothing is
 * stored. Another owner's id answers null (A4). A request that names the version it read is a conditional write:
 * `InvitationContentConflictError` when another writer committed since, and nothing is stored (S2).
 */
export class UpdateInvitationContentUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    /** The reminder sender port (F6; S6), read only for its capability, like every owned read. */
    private readonly reminders?: ReminderSender,
  ) {}

  async execute(input: UpdateContentInput): Promise<OwnedInvitation | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    // A read-only invitation is refused before its content is even looked at (S7, A2).
    assertEditable(stored.status);

    const snapshot = await this.catalog.findVersionSchema(stored.templateVersionId);
    const validation = validateDraftContent(snapshot?.schema ?? null, input.content);
    if (!validation.ok) {
      throw new InvalidInvitationContentError(validation.issues);
    }

    const updated = await this.invitations.updateContent(
      input.ownerId,
      input.id,
      validation.value,
      input.expectedUpdatedAt === undefined ? undefined : new Date(input.expectedUpdatedAt),
    );
    if (updated === null) {
      return null;
    }

    const [includedFeatureKeys, renames] = await Promise.all([
      includedFeatureKeysOf(this.catalog, updated.packageId),
      // The content save answers the same owned invitation as the read, so it states the same renames left (R3-001).
      this.invitations.countSlugAliases(updated.id),
    ]);

    return toOwnedInvitation(
      updated,
      snapshot?.schema ?? null,
      includedFeatureKeys,
      remainingSlugRenames(renames),
      this.reminders?.isConfigured() ?? false,
    );
  }
}

/**
 * Stores the feature data of a DRAFT or a PUBLISHED invitation (F1, F6; S4, S7; S2): the time zone the owner chose,
 * the WhatsApp phone, which normalizes to E.164 and is cleared by null or an empty value, and the playlist link,
 * which must be an `https` link on an allow-listed music host and is cleared the same way. Only the owner may
 * write: another customer's id answers null and changes nothing (A4). An archived invitation is refused
 * (`InvitationNotEditableError`) before its request values are looked at, exactly like a content save (A2, S7).
 * A phone or a link is stored even when the pinned package does not include its feature; the gate, not the write,
 * decides whether a guest sees it, so an upgrade later does not need the data typed again. The zone, the phone,
 * and the link are written in one transaction, so a refused request stores none of them.
 *
 * A new or changed playlist link is looked up once, before that transaction, and its title and cover are stored with
 * it (S2). An unchanged link keeps the metadata already stored and costs no request, and a cleared link clears the
 * metadata with it, so nothing stale can describe a link the invitation no longer has. The lookup fails open for
 * the save and closed for the cover: a provider that is down, slow, or unknown stores nulls and the save succeeds.
 */
export class UpdateInvitationFeaturesUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    /** The music metadata port (S2); the default answers nothing, so a caller that omits it stores no metadata. */
    private readonly music: MusicMetadataProvider = NO_MUSIC_METADATA,
    /** The reminder sender port (F6; S6), read only for its capability, like every owned read. */
    private readonly reminders?: ReminderSender,
  ) {}

  async execute(input: UpdateFeaturesInput): Promise<OwnedInvitation | null> {
    if (!isInvitationId(input.id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(input.ownerId, input.id);
    if (stored === null) {
      return null;
    }
    // A read-only invitation is refused before its request values are even looked at (S7, A2).
    assertEditable(stored.status);

    const validation = validateInvitationFeatureSettings({
      timeZone: input.timeZone,
      whatsappPhone: input.whatsappPhone,
      playlistUrl: input.playlistUrl,
      // An omitted itinerary keeps the stored one (review R3-001): only `null` or an empty list clears it.
      itinerary: input.itinerary === undefined ? stored.itinerary : input.itinerary,
      // The gift registry follows the same rule (F2; L4.3): an omitted value keeps the stored registry, and only
      // `null` or a payload that would show nothing clears it.
      giftRegistry: input.giftRegistry === undefined ? stored.giftRegistry : input.giftRegistry,
      // The lodging follows the same rule (F4; L7.3): an omitted value keeps the stored lodging, and only `null` or a
      // payload with no hotel and no transport line clears it.
      lodging: input.lodging === undefined ? stored.lodging : input.lodging,
      // The livestream follows the same rule (F9; L12.1): an omitted value keeps the stored link, and only `null` or a
      // payload without a link clears it.
      livestream: input.livestream === undefined ? stored.livestream : input.livestream,
      // The opening animation switch follows the same rule (F10; L14.3): an omitted value keeps the stored one, and only
      // a boolean clears or turns on what the owner chose.
      openingAnimation:
        input.openingAnimation === undefined ? stored.openingAnimation : input.openingAnimation,
      // And the reminder switches too (F6; L9.1): an omitted value keeps them, and only `null` or a pair with nothing
      // switched on clears them.
      reminders: input.reminders === undefined ? stored.reminders : input.reminders,
    });
    if (!validation.ok) {
      throw new InvalidInvitationFeaturesError(validation.issues);
    }

    const metadata = await this.playlistMetadataOf(stored, validation.value.playlistUrl);

    const updated = await this.invitations.updateFeatures(input.ownerId, input.id, {
      ...validation.value,
      playlistTitle: metadata.title,
      playlistCoverUrl: metadata.coverUrl,
    });
    if (updated === null) {
      return null;
    }

    const [snapshot, includedFeatureKeys, renames] = await Promise.all([
      this.catalog.findVersionSchema(updated.templateVersionId),
      includedFeatureKeysOf(this.catalog, updated.packageId),
      // The feature save answers the same owned invitation as the read, so it states the same renames left (R3-001).
      this.invitations.countSlugAliases(updated.id),
    ]);

    return toOwnedInvitation(
      updated,
      snapshot?.schema ?? null,
      includedFeatureKeys,
      remainingSlugRenames(renames),
      this.reminders?.isConfigured() ?? false,
    );
  }

  /**
   * The metadata that travels with the link being saved (S2): the stored one when the link did not change, nulls
   * when it was cleared or names no provider this API can ask, and otherwise one lookup whose answer is bounded by
   * the domain before it is stored. The lookup runs outside the write's transaction, so a slow provider delays this
   * save and never holds a row lock.
   */
  private async playlistMetadataOf(
    stored: InvitationRecordWithMusic,
    playlistUrl: string | null,
  ): Promise<{ title: string | null; coverUrl: string | null }> {
    if (playlistUrl === null) {
      return { title: null, coverUrl: null };
    }
    if (playlistUrl === stored.playlistUrl) {
      // The same link keeps what was stored for it: saving the zone or the phone again costs no request (S2).
      return { title: stored.playlistTitle, coverUrl: stored.playlistCoverUrl };
    }

    const provider = musicProviderOf(playlistUrl);
    if (provider === null) {
      return { title: null, coverUrl: null };
    }

    try {
      const metadata = await this.music.lookup(playlistUrl, provider);

      // The port is replaceable, so its answer is bounded here as well: a title the column cannot hold is cut, and
      // a cover off the allow-list is dropped instead of being shown to a guest (S2).
      return {
        title: normalizePlaylistTitle(metadata?.title),
        coverUrl: isMusicCoverUrl(metadata?.coverUrl) ? metadata.coverUrl : null,
      };
    } catch {
      // Fail open for the save, closed for the cover: the link is stored without metadata (S2).
      return { title: null, coverUrl: null };
    }
  }
}

/**
 * Archives a DRAFT or a PUBLISHED invitation: it becomes read-only and stays stored, because an invitation is
 * never deleted (S7, A2). Archiving a published invitation clears `publishedAt`, so the public slug stops
 * resolving. Throws `InvitationAlreadyArchivedError` for an invitation that is already archived, so a repeated
 * archive never looks like a change. Another owner's id answers null and changes nothing (A4).
 */
export class ArchiveInvitationUseCase {
  constructor(private readonly invitations: InvitationRepository) {}

  async execute(ownerId: string, id: string): Promise<InvitationSummary | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    // The domain states the transition; the adapter repeats it inside the write as the last guard.
    archive(stored.status);

    const archived = await this.invitations.archive(ownerId, id);

    return archived === null ? null : toSummary(archived);
  }
}

/** The instant a publication writes; injectable so a test can observe `publishedAt` exactly (S7). */
export type PublicationClock = () => Date;

/**
 * Publishes an owned DRAFT (M5 T3; S1, S2, S3, S6, A1). The readiness rule of the pinned snapshot is applied
 * first — the pinned schema's required fields and validation, whether the package still fits what the pinned
 * version's renderer requires, and whether that version is still PUBLISHED — and every reason is reported in
 * `InvitationNotPublishableError` without storing anything. Then the payment gate is asked once (S6), and only
 * then does the write happen with `publishedAt` set to the current instant and `expiresAt` to that instant plus the
 * pinned package's duration in days (S1, T2). Nothing extends an expiry (S3): a publication after an unpublish counts
 * its lifetime from the new instant. An id that names nothing or belongs to another owner answers null before the
 * catalog or the gate is consulted (A4); publishing an already published or an archived invitation is refused by the
 * domain with its own error (S7, A2).
 */
export class PublishInvitationUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    private readonly payments: InvitationPaymentGate,
    private readonly now: PublicationClock = () => new Date(),
    /** The reminder sender port (F6; S6), read only for its capability, like every owned read. */
    private readonly reminders?: ReminderSender,
  ) {}

  async execute(ownerId: string, id: string): Promise<OwnedInvitation | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    // The transition is stated before any catalog read: only a DRAFT publishes (S7, A2).
    publish(stored.status);

    const versionId = stored.templateVersionId;
    const version = await this.catalog.findPublishedVersion(versionId);
    const snapshot = await this.catalog.findVersionSchema(versionId);
    const entitlements = await this.catalog.findPackageEntitlements(stored.packageId);

    const issues = publicationIssues({
      // The schema the draft was validated against, whatever the version's status is (S3).
      schema: snapshot?.schema ?? null,
      content: stored.content,
      // A package that can no longer be read fails the fit rule instead of publishing unchecked (A1).
      packageEntitlements: {
        packageStatus: entitlements?.status ?? "",
        includedFeatureKeys: entitlements?.includedFeatureKeys ?? [],
      },
      // A retired pinned version reports its own issue and requires no feature of the new package (A1).
      requiredFeatureKeys: version?.requiredFeatureKeys ?? [],
      versionPublished: version !== null,
    });
    if (issues.length > 0) {
      throw new InvitationNotPublishableError(issues);
    }

    const payment = await this.payments.publicationPaymentRequired(stored);
    if (payment.required) {
      throw new InvitationPaymentRequiredError(payment.reason);
    }

    // The fit rule refused a package the catalog could not answer for (A1), so a publishable draft always has one; the
    // guard keeps the type honest instead of inventing a lifetime nobody chose.
    if (entitlements === null) {
      throw new InvitationNotPublishableError([PACKAGE_FIT_ISSUE]);
    }

    // One instant for both marks: the invitation expires exactly `durationDays` days after it was published (S1, T2).
    const at = this.now();
    const published = await this.invitations.publish(
      ownerId,
      id,
      at,
      invitationExpiresAt(at, entitlements.durationDays),
    );
    if (published === null) {
      return null;
    }

    return toOwnedInvitation(
      published,
      snapshot?.schema ?? null,
      entitlements?.includedFeatureKeys ?? [],
      // Publishing answers the same owned invitation as the read, so it states the same renames left (R3-001).
      remainingSlugRenames(await this.invitations.countSlugAliases(published.id)),
      this.reminders?.isConfigured() ?? false,
    );
  }
}

/**
 * Returns an owned PUBLISHED invitation to DRAFT (M5 T3; S7), clearing `publishedAt`, so the slug stops
 * resolving and the owner can edit and publish again. Only a published invitation changes; a draft throws
 * `InvitationNotPublishedError` and an archived one `InvitationAlreadyArchivedError`. Another owner's id
 * answers null and changes nothing (A4).
 */
export class UnpublishInvitationUseCase {
  constructor(private readonly invitations: InvitationRepository) {}

  async execute(ownerId: string, id: string): Promise<InvitationSummary | null> {
    if (!isInvitationId(id)) {
      return null;
    }
    const stored = await this.invitations.findOwned(ownerId, id);
    if (stored === null) {
      return null;
    }
    // The domain states the transition; the adapter repeats it inside the write as the last guard.
    unpublish(stored.status);

    const draft = await this.invitations.unpublish(ownerId, id);

    return draft === null ? null : toSummary(draft);
  }
}

/**
 * The public page of a published invitation (M5 T3; S1, S2, S3, A1, A3, A7). It carries no owner: the slug from
 * the URL is the only input. The slug format is checked first, so a malformed value never reaches a query; the
 * repository resolves the slug in one query and answers only a live PUBLISHED row, so a draft, an archived, an
 * expired, and an unknown slug all answer null (A3). The pinned version's render data is then read in any
 * status, so an already published invitation keeps rendering a version the catalog has since retired (A1). A
 * renderer the API's allow-list does not know is refused with `PublicInvitationNotRenderableError`, an
 * operational fault the caller logs and still answers as the same guest-facing 404 (A3). What comes back is
 * only the allow-listed projection: no owner, package, price, ids, or status (A7).
 */
export class GetPublicInvitationUseCase {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly catalog: InvitationCatalog,
    /**
     * The album of the guests' photos (F8; L11.4, L26). Required: the public projection shows an album whenever the
     * package grants `GUEST_ALBUM`, so a read composed without it would tell every guest that nothing was uploaded. The
     * media module binds it, and a module that forgets it fails while compiling or at startup.
     */
    private readonly guestAlbum: InvitationGuestAlbumReader,
    /**
     * The gallery source (M8 S4). The media module provides it; the default answers no photos so a test that
     * composes this read without media still projects a published invitation.
     */
    private readonly gallery: InvitationGalleryReader = { readGallery: async () => [] },
    /** The instant the expiry is judged at (S2); injectable so a test observes the boundary exactly. */
    private readonly now: () => Date = () => new Date(),
    /**
     * The guestbook source (F7; L10.4). The default answers no entry, so a test that composes this read without the
     * guestbook still projects a published invitation; the real adapter is bound in the module.
     */
    private readonly guestbook: InvitationGuestbookReader = { readVisibleEntries: async () => [] },
  ) {}

  async execute(slug: string): Promise<PublicInvitation | null> {
    if (!isValidInvitationSlug(slug)) {
      return null;
    }
    const resolved = await this.resolve(slug);

    return resolved === null ? null : this.project(resolved.published, resolved.redirectTo);
  }

  /**
   * The published invitation a current address or a previous one names, with the current address a redirect points at
   * (F11; S2.11, L15.3). The current address is read first, so the ordinary guest page costs the query it always cost;
   * only a slug no invitation currently holds is looked up in the aliases, and only a published row is answered, so a
   * draft that once had the address still answers nothing (A3). Null means the guest sees the one 404.
   */
  async resolve(
    slug: string,
  ): Promise<{ published: InvitationRecordWithMusic; redirectTo: string | null } | null> {
    if (!isValidInvitationSlug(slug)) {
      return null;
    }
    const published = await this.invitations.findPublishedBySlug(slug);
    if (published !== null) {
      return { published, redirectTo: null };
    }
    const renamed = await this.invitations.findPublishedByAlias(slug);

    return renamed === null ? null : { published: renamed, redirectTo: renamed.slug };
  }

  /**
   * The same projection for an invitation the caller already resolved as a live published row (M6 G2): the
   * personal guest page composes this read with the guest's own block, so both pages share one definition of what a
   * guest may see. It throws `PublicInvitationNotRenderableError` exactly like `execute`.
   */
  async project(
    published: InvitationRecordWithMusic,
    redirectTo: string | null = null,
  ): Promise<PublicInvitation> {
    const render = await this.catalog.findVersionRenderData(published.templateVersionId);
    // Fail closed: with no pinned version or a renderer nobody implements there is nothing to render (A3).
    if (render === null || !this.catalog.isRendererRegistered(render.componentKey)) {
      throw new PublicInvitationNotRenderableError(render?.componentKey ?? null);
    }

    // The gate reads the pinned package's keys at request time and fails closed when it cannot (S4).
    const includedFeatureKeys = await includedFeatureKeysOf(this.catalog, published.packageId);
    // The gallery is read only when the package grants it, so an invitation without it costs no extra query (S4).
    const gallery = includedFeatureKeys.includes(GALLERY_FEATURE_KEY)
      ? await this.gallery.readGallery(published.id)
      : [];
    // The same rule for the wall of messages (F7; L10.4): a package without `GUESTBOOK` costs no extra query, and the
    // projection answers no entries for it.
    const guestbook = includedFeatureKeys.includes(GUESTBOOK_FEATURE_KEY)
      ? await this.guestbook.readVisibleEntries(published.id)
      : [];
    // The same rule for the album (F8; L11.4): a package without `GUEST_ALBUM` costs no extra query, and the projection
    // answers null for it. The port answers published photos only, so a pending or hidden one never reaches a guest.
    const guestAlbum = includedFeatureKeys.includes(GUEST_ALBUM_FEATURE_KEY)
      ? await this.guestAlbum.readPublishedPhotos(published.id)
      : EMPTY_PUBLIC_GUEST_ALBUM;

    const features = publicInvitationFeatures(
      {
        includedFeatureKeys,
        whatsappPhone: published.whatsappPhone,
        playlistUrl: published.playlistUrl,
        playlistTitle: published.playlistTitle,
        playlistCoverUrl: published.playlistCoverUrl,
        itinerary: published.itinerary,
        giftRegistry: published.giftRegistry,
        lodging: published.lodging,
        livestream: published.livestream,
        openingAnimation: published.openingAnimation,
        rsvpDeadline: published.rsvpDeadline,
        rsvpPartyLimit: published.rsvpPartyLimit,
      },
      gallery,
      guestbook,
      guestAlbum,
    );
    // The fields the omitted sections cover (S8.3), computed once from the pinned schema and the stored list: the
    // guest page draws no block for them, and their values are withheld from the projection below. A structured gift
    // registry adds the legacy content field to that list, so a guest never sees the old text and the new card at the
    // same time (F2; L4.3).
    const hiddenFields = legacyGiftRegistryHiddenFields(
      publicHiddenFields(render.schema, published.content),
      features.giftRegistryDetails,
    );
    const content = projectPublicContent(render.schema, published.content, hiddenFields);

    return {
      // The id is internal to the API: the response mapper never answers it, and the public read counts with it (S7).
      invitationId: published.id,
      slug: published.slug,
      componentKey: render.componentKey,
      configuration: render.configuration,
      content,
      hiddenFields,
      publishedAt: published.publishedAt,
      timeZone: published.timeZone,
      features,
      // Only a package that grants MAP shows a point, and only while the address text still carries the label it
      // was stored with (S2): the gate and the staleness rule live in the domain, never here. The rule reads the
      // projected content, so an address of an omitted section has no text left to match and its point (label and
      // coordinates) is withheld like its value (S8.3).
      places: confirmedPlaces(
        published.places,
        content,
        includedFeatureKeys.includes(MAP_FEATURE_KEY),
      ),
      // An elapsed expiry is not a 404: the page still renders and the RSVP closes (S2, T3).
      expired: isInvitationExpired(published.expiresAt, this.now()),
      // The current address a guest reached through a previous one (F11; L15.3): null for the ordinary read.
      redirectTo,
    };
  }
}
