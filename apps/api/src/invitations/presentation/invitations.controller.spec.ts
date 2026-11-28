import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it, mock } from "node:test";

import { type INestApplication, Logger, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { createApp } from "../../app.setup";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import {
  INITIAL_OPERATIONAL_SETTINGS_READER,
  OPERATIONAL_SETTINGS_READER,
} from "../../settings/application/operational-settings";
import {
  GUEST_REPOSITORY,
  type GuestCheckIn,
  type GuestFields,
  type GuestListReadModel,
  type GuestRecord,
  type GuestRepository,
  type GuestResponseWrite,
  type GuestWithResponse,
  type NewGuest,
} from "../application/guest.repository";
import { guestTokenHash } from "../application/guest-token";
import {
  InvitationContentConflictError,
  InvitationSlugRenameConflictError,
  InvitationSlugRenameLimitError,
  InvitationSlugTakenError,
} from "../application/invitation.application.errors";
import {
  INVITATION_REPOSITORY,
  type InvitationFeatureSettingsWrite,
  type InvitationPasswordState,
  type InvitationPlaceWrite,
  type InvitationRecord,
  type InvitationRecordWithMusic,
  type InvitationRepository,
  type NewInvitation,
  type SharedInvitationRecord,
} from "../application/invitation.repository";
import {
  type CatalogPackageEntitlements,
  type CatalogTemplateVersionSnapshot,
  type CatalogVersionRenderData,
  type CatalogVersionSchema,
  INVITATION_CATALOG,
  type InvitationCatalog,
} from "../application/invitation-catalog";
import { GuestSeatsBelowConfirmedPartyError } from "../application/invitation-guest.errors";
import {
  INVITATION_PAYMENT_GATE,
  type InvitationPaymentDecision,
  type InvitationPaymentGate,
} from "../application/invitation-payment-gate";
import {
  INVITATION_VIEW_REPOSITORY,
  type InvitationViewRepository,
} from "../application/invitation-views";
import { MUSIC_METADATA_PROVIDER, type MusicMetadataProvider } from "../application/music-metadata";
import { UnlockInvitationUseCase } from "../application/invitation-unlock.use-cases";
import { createInvitationAccessTokens } from "../application/invitation-access-token";
import { InvitationPasswordGate } from "../application/invitation-lock";
import { REMINDER_SENDER } from "../../reminders/application/reminder-sender";
import { NotConfiguredReminderSender } from "../../reminders/infrastructure/not-configured-reminder-sender";
import { PLACE_SEARCH, type PlaceSearch } from "../application/place-search";
import { InMemoryPlaceSearchCache } from "../application/place-search-cache";
import {
  PLACE_SEARCH_RATE_LIMITER,
  type PlaceSearchRateLimiter,
} from "../application/place-search-rate-limiter";
import {
  SLUG_AVAILABILITY_RATE_LIMITER,
  SLUG_AVAILABILITY_RATE_LIMIT,
  type SlugAvailabilityRateLimiter,
} from "../application/slug-availability-rate-limiter";
import {
  GUESTBOOK_REPOSITORY,
  INVITATION_GUESTBOOK_READER,
  type GuestbookRepository,
  type InvitationGuestbookReader,
} from "../application/guestbook.repository";
import { INVITATION_GUEST_ALBUM_READER } from "../application/invitation-guest-album";
import {
  GUESTBOOK_RATE_LIMITER,
  type GuestbookRateLimiter,
} from "../application/guestbook-rate-limiter";
import {
  GUESTBOOK_OWNER_ENTRIES_MAX,
  type GuestbookEntryRecord,
  type GuestbookEntryValues,
  publicGuestbookEntries,
} from "../domain/invitation-guestbook";
import {
  RSVP_REPOSITORY,
  type RsvpReadModel,
  type RsvpRepository,
  type RsvpResponseRecord,
  type RsvpResponseWrite,
} from "../application/rsvp.repository";
import { RSVP_RATE_LIMITER, type RsvpRateLimiter } from "../application/rsvp-rate-limiter";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import type { JsonObject } from "../domain/invitation-content";
import type { PlaylistMetadata } from "../domain/invitation-features";
import type { InvitationGiftRegistry } from "../domain/invitation-gift-registry";
import type { InvitationItinerary } from "../domain/invitation-itinerary";
import type { InvitationLodging } from "../domain/invitation-lodging";
import type { InvitationLivestream } from "../domain/invitation-livestream";
import type { InvitationReminders } from "../domain/invitation-reminders";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type { PlacePoint } from "../domain/invitation-place";
import type { RsvpSettings } from "../domain/invitation-rsvp";
import {
  type InvitationAccess,
  INVITATION_ACCESS_RESOLVER,
} from "../../collaborators/application/invitation-access";
import type { InvitationPermission } from "../../collaborators/domain/invitation-collaborator";
import { INVITATION_USE_CASES } from "../invitations.module";
import { InvitationsController } from "./invitations.controller";
import { PublicInvitationsController } from "./public-invitations.controller";

// `/invitations` (M4 T4 and M5 T4; S1, S2, S3, S7, S9, A3, A4, A7) and the `@Public()` public read of a
// published slug, through the shared createApp boundary, the project-owned guard, and Better Auth on the in-memory
// adapter. The invitation port and the catalog contract are in-memory fakes, so the suite needs no network and no
// database; their Prisma adapters are proved in the `*.db-spec.ts` suites, and the use cases themselves in
// `invitation.use-cases.spec.ts`. What this suite owns is the HTTP contract: the session is the only source of the
// owner (S9), no response carries `ownerId`, an id that is not a UUID is refused before it reaches a port, every
// application or domain error maps to its documented status and body, and the public page carries only the
// allow-listed projection with one identical 404 for every slug a guest must not render (A3, A7).

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const PATH = "/invitations";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
/** A row of a memory store this suite mutates, as the read-only records it answers are written. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const PUBLISHED_VERSION_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_PACKAGE_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_VERSION_ID = "44444444-4444-4444-8444-444444444444";
/** PUBLISHED, but its `componentKey` is outside the API's renderer allow-list (A3). */
const UNRENDERABLE_VERSION_ID = "55555555-5555-4555-8555-555555555555";
/** An ACTIVE package that includes the implemented catalog features (F1, F6, F7; S4, S7). */
const FEATURE_PACKAGE_ID = "66666666-6666-4666-8666-666666666666";
/** An ACTIVE package with the batch-2 features: music and the gift registry (S7). */
const MUSIC_PACKAGE_ID = "77777777-7777-4777-8777-777777777777";
/** An ACTIVE package with RSVP and no guest list: the open form (M6 S4). */
const RSVP_PACKAGE_ID = "88888888-8888-4888-8888-888888888888";
/** An ACTIVE package with the guest list, which replaces the open form (M6 S4; G2 implements it). */
const GUEST_LIST_PACKAGE_ID = "99999999-9999-4999-8999-999999999999";
/** The seeded Deluxe keys (M6 S3): the guest list and its access pass (G2). */
const QR_PASS_PACKAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** An ACTIVE package that grants `ITINERARY` and no other implemented key: the plan of the day (F1; L3.2). */
const ITINERARY_PACKAGE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** An ACTIVE package that grants `LODGING` and no other implemented key: hotels and transport (F4; L7.2). */
const LODGING_PACKAGE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
/** An ACTIVE package that grants `LIVESTREAM` and no other implemented key: the transmission (F9; L12.2). */
const LIVESTREAM_PACKAGE_ID = "abababab-abab-4bab-8bab-abababababab";
/** An ACTIVE package that grants `GUESTBOOK` and no other implemented key: the wall of messages (F7; L10.2). */
const GUESTBOOK_PACKAGE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
/** An ACTIVE package that grants `GUEST_ALBUM` and no other implemented key: the guests' photos (F8; L11.2). */
const GUEST_ALBUM_PACKAGE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
/** An ACTIVE package that grants `OPENING_ANIMATION` and no other implemented key: the envelope (F10; L14.4). */
const OPENING_ANIMATION_PACKAGE_ID = "acacacac-acac-4cac-8cac-acacacacacac";
/** An ACTIVE package that grants `PASSWORD_PROTECTION` and no other implemented key: the access code (F13; L18.5). */
const PASSWORD_PACKAGE_ID = "adadadad-adad-4dad-8dad-adadadadadad";
/** A PUBLISHED version whose schema declares the address fields a place may belong to (S2). */
const PLACE_VERSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** A PUBLISHED version whose schema declares the legacy gift registry text field (F2; L4.3). */
const GIFT_TEXT_VERSION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PHONE = "+525512345678";
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
/** A gift registry of one store, one transfer, and the envelopes line (F2; L4.1). */
const GIFT_REGISTRY: InvitationGiftRegistry = {
  version: 1,
  stores: [
    {
      name: "Liverpool",
      reference: "Evento 51234567",
      url: "https://mesaderegalos.liverpool.com.mx/milistadelivery/51234567",
    },
  ],
  transfer: { bank: "BBVA", holder: "Ana Martínez", clabe: "012180000123456782" },
  envelopes: true,
  note: "Si prefieres, también puedes llevarlo el día del evento.",
};
const ITINERARY: InvitationItinerary = {
  version: 1,
  items: [
    { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
    { time: "19:30", title: "Recepción y cóctel" },
  ],
};
/** One livestream with the note the artboard draws under the player (F9; L12.1). */
const LIVESTREAM: InvitationLivestream = {
  version: 1,
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  note: "Inicia a las 17:00 h",
};
/** A livestream that is no YouTube link, so the guest may only open it in a new tab (F9; L12.3). */
const LIVESTREAM_EXTERNAL: InvitationLivestream = {
  version: 1,
  url: "https://us02web.zoom.us/j/123456789",
};
const LODGING: InvitationLodging = {
  version: 1,
  hotels: [
    {
      name: "Hotel Misión",
      distance: "A 5 min",
      price: "Desde $1,450 por noche",
      groupCode: "BODA-AYL",
      bookingUrl: "https://hotelmision.example.com/reserva",
      address: "Av. Juárez 120, Centro",
    },
    { name: "City Express", address: "Blvd. Bernardo Quintana 45" },
  ],
  transport: "Habrá camión del hotel al salón a las 19:00 y de regreso a la 1:00.",
};
const REMINDERS: InvitationReminders = { version: 1, pendingRsvp: true, eventEve: false };
const RENDERER = "birthday-poster-01";
const UNREGISTERED_RENDERER = "unregistered-renderer-99";
const SCHEMA = {
  type: "object",
  required: ["title"],
  properties: { title: { type: "string", maxLength: 120 } },
};
/** The schema that still declares the gift registry text field an older invitation stores (F2; L4.3). */
const GIFT_TEXT_SCHEMA = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", maxLength: 120 },
    giftRegistry: { type: "string", maxLength: 200 },
  },
};
/** The address fields a place write validates against: `address` and `ceremonyAddress`, never `receptionPlace`. */
const ADDRESS_SCHEMA = {
  type: "object",
  required: ["address"],
  properties: {
    location: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 240 },
    ceremonyAddress: { type: "string", maxLength: 240 },
    receptionPlace: { type: "string", maxLength: 120 },
  },
};

type Row = Record<string, unknown>;

/** The invitation port in memory: owner scoping, a unique slug, and the lifecycle writes the adapter runs. */
class MemoryInvitationRepository implements InvitationRepository {
  readonly rows: InvitationRecordWithMusic[] = [];
  /** How many upcoming creates collide on the slug; the create use case retries and then answers 503. */
  slugCollisions = 0;
  private sequence = 0;

  async create(input: NewInvitation): Promise<InvitationRecordWithMusic> {
    if (this.slugCollisions > 0) {
      this.slugCollisions -= 1;
      throw new InvitationSlugTakenError(input.slug);
    }
    if (this.rows.some((row) => row.slug === input.slug)) {
      throw new InvitationSlugTakenError(input.slug);
    }
    this.sequence += 1;
    const at = new Date(Date.UTC(2026, 10, 11, 12, 0, this.sequence));
    const row: InvitationRecordWithMusic = {
      id: randomUUID(),
      ...input,
      content: structuredClone(input.content),
      status: "DRAFT",
      // The database defaults every new row reads (S4, M6 G1).
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      itinerary: null,
      giftRegistry: null,
      lodging: null,
      livestream: null,
      openingAnimation: true,
      reminders: null,
      // Every new invitation starts with no access code (F13; L18.1).
      passwordProtected: false,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
      places: {},
      archivedAt: null,
      publishedAt: null,
      firstPublishedAt: null,
      expiresAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return structuredClone(row);
  }

  async updatePlace(
    ownerId: string,
    id: string,
    place: InvitationPlaceWrite,
  ): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; an archived one is read-only (A2, S7).
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    row.places = {
      ...row.places,
      [place.field]: { label: place.label, lat: place.lat, lng: place.lng },
    };
    return structuredClone(row);
  }

  /** The encoded hash this double stored, so a test observes what the port received (F13; L18.1). */
  readonly passwordHashes = new Map<string, string>();
  private readonly passwordVersions = new Map<string, number>();

  async setPassword(
    ownerId: string,
    id: string,
    passwordHash: string,
  ): Promise<InvitationPasswordState | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    const version = (this.passwordVersions.get(id) ?? 0) + 1;
    this.passwordVersions.set(id, version);
    this.passwordHashes.set(id, passwordHash);
    row.passwordProtected = true;

    return { passwordProtected: true, passwordVersion: version };
  }

  async clearPassword(ownerId: string, id: string): Promise<InvitationPasswordState | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    const version = (this.passwordVersions.get(id) ?? 0) + 1;
    this.passwordVersions.set(id, version);
    this.passwordHashes.delete(id);
    row.passwordProtected = false;

    return { passwordProtected: false, passwordVersion: version };
  }

  async clearPlace(
    ownerId: string,
    id: string,
    field: string,
  ): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    row.places = Object.fromEntries(Object.entries(row.places).filter(([key]) => key !== field));
    return structuredClone(row);
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    return row ? structuredClone(row) : null;
  }

  async listOwned(ownerId: string): Promise<InvitationRecordWithMusic[]> {
    return this.rows
      .filter((row) => row.ownerId === ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((row) => structuredClone(row));
  }

  /**
   * The invitations shared with an account (F12; L17.5), as the suite seeds them: the account's own accepted rows and the
   * permissions each one grants. The access rule is inside the lookup — the account, the acceptance, and the absence of a
   * revoke — so a row this map does not name is invisible here, exactly like the adapter's `WHERE`.
   */
  private readonly shared = new Map<string, Map<string, InvitationPermission[]>>();

  /** Seeds one accepted, standing collaborator row for the suite's list and read cases. */
  share(invitationId: string, userId: string, permissions: InvitationPermission[]): void {
    const forUser = this.shared.get(userId) ?? new Map<string, InvitationPermission[]>();
    forUser.set(invitationId, permissions);
    this.shared.set(userId, forUser);
  }

  /** The three answers the authorization resolver gives, read from this suite's own rows and shared map (L17.4). */
  accessFor(userId: string, invitationId: string): InvitationAccess | null {
    const row = this.rows.find((stored) => stored.id === invitationId);
    if (row === undefined) {
      return null;
    }
    if (row.ownerId === userId) {
      return { invitationId, ownerId: userId, role: "OWNER", permissions: [] };
    }
    const permissions = this.shared.get(userId)?.get(invitationId);

    return permissions === undefined
      ? null
      : { invitationId, ownerId: row.ownerId, role: "COLLABORATOR", permissions };
  }

  async listSharedWith(userId: string): Promise<SharedInvitationRecord[]> {
    const forUser = this.shared.get(userId);
    if (forUser === undefined) {
      return [];
    }

    return this.rows
      .filter((row) => row.ownerId !== userId && forUser.has(row.id))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((row) => ({
        ...structuredClone(row),
        permissions: forUser.get(row.id) ?? [],
      }));
  }

  async updateContent(
    ownerId: string,
    id: string,
    content: JsonObject,
    expectedUpdatedAt?: Date,
  ): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    // Like the adapter's `WHERE updatedAt`, a write that names an older version changes nothing (S2).
    const same = row.updatedAt.getTime() === expectedUpdatedAt?.getTime();
    if (expectedUpdatedAt !== undefined && !same) {
      throw new InvitationContentConflictError();
    }
    row.content = structuredClone(content);
    return structuredClone(row);
  }

  async updateFeatures(
    ownerId: string,
    id: string,
    features: InvitationFeatureSettingsWrite,
  ): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    row.timeZone = features.timeZone;
    row.whatsappPhone = features.whatsappPhone;
    row.playlistUrl = features.playlistUrl;
    row.playlistTitle = features.playlistTitle;
    row.playlistCoverUrl = features.playlistCoverUrl;
    row.itinerary = features.itinerary;
    row.giftRegistry = features.giftRegistry;
    row.lodging = features.lodging;
    row.livestream = features.livestream;
    // An omitted switch keeps the stored one, exactly like the Prisma adapter (F10; L14.3).
    if (features.openingAnimation !== undefined) {
      row.openingAnimation = features.openingAnimation;
    }
    row.reminders = features.reminders;
    return structuredClone(row);
  }

  async archive(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // Archiving is allowed from DRAFT or from PUBLISHED, and clears the publication marker (A2).
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "ARCHIVED";
    row.archivedAt = new Date();
    row.publishedAt = null;
    return structuredClone(row);
  }

  async publish(ownerId: string, id: string, at: Date): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "PUBLISHED") {
      throw new InvitationAlreadyPublishedError();
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "PUBLISHED";
    row.publishedAt = at;
    row.firstPublishedAt ??= at;
    row.updatedAt = at;
    return structuredClone(row);
  }

  async unpublish(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "DRAFT") {
      throw new InvitationNotPublishedError();
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "DRAFT";
    row.publishedAt = null;
    return structuredClone(row);
  }

  async findPublishedBySlug(slug: string): Promise<InvitationRecordWithMusic | null> {
    // An expired row is answered like a live one: it stays visible read-only and the projection flags it (S2, T3).
    const row = this.rows.find((stored) => stored.slug === slug && stored.status === "PUBLISHED");
    return row ? structuredClone(row) : null;
  }

  /** The previous addresses of every invitation (F11; L15.2, L15.3), keyed by slug. */
  readonly aliases = new Map<string, string>();
  /** Whether the next rename answers the concurrent-rename conflict the adapter raises (R4-002). */
  renameConflict = false;

  async findPublishedByAlias(slug: string): Promise<InvitationRecordWithMusic | null> {
    const invitationId = this.aliases.get(slug);
    if (invitationId === undefined) {
      return null;
    }
    const row = this.rows.find(
      (stored) => stored.id === invitationId && stored.status === "PUBLISHED",
    );

    return row ? structuredClone(row) : null;
  }

  async countSlugAliases(invitationId: string): Promise<number> {
    return [...this.aliases.values()].filter((value) => value === invitationId).length;
  }

  async isSlugInUse(slug: string, exceptInvitationId: string): Promise<boolean> {
    const current = this.rows.some((row) => row.slug === slug && row.id !== exceptInvitationId);

    return current || this.aliases.has(slug);
  }

  async renameSlug(
    ownerId: string,
    id: string,
    slug: string,
  ): Promise<InvitationRecordWithMusic | null> {
    // The one outcome only PostgreSQL can produce: a concurrent rename of the same invitation stored the previous
    // address first, so this one must be retried rather than answered as a taken address (R4-002).
    if (this.renameConflict) {
      this.renameConflict = false;
      throw new InvitationSlugRenameConflictError();
    }
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    const previous = row.slug;
    if (previous === slug) {
      return structuredClone(row);
    }
    const kept = [...this.aliases.values()].filter((value) => value === id).length;
    if (kept >= 5) {
      throw new InvitationSlugRenameLimitError(5);
    }
    if (await this.isSlugInUse(slug, id)) {
      throw new InvitationSlugTakenError(slug);
    }
    row.slug = slug;
    row.updatedAt = new Date(row.updatedAt.getTime() + 1_000);
    this.aliases.set(previous, id);

    return structuredClone(row);
  }
}

/**
 * The catalog contract in memory: one PUBLISHED version, one DRAFT version, and one ACTIVE and one DRAFT
 * package. An unpublished version answers `findPublishedVersion` with null and `findVersionSchema` with its
 * schema, exactly as the catalog contract states (S3). One extra version is PUBLISHED but names a renderer the
 * API's allow-list does not know, so the public read can be shown refusing it (A3).
 */
class MemoryInvitationCatalog implements InvitationCatalog {
  readonly versions = new Map<
    string,
    { published: boolean; schema: unknown; componentKey?: string }
  >([
    [PUBLISHED_VERSION_ID, { published: true, schema: SCHEMA }],
    [PLACE_VERSION_ID, { published: true, schema: ADDRESS_SCHEMA }],
    [GIFT_TEXT_VERSION_ID, { published: true, schema: GIFT_TEXT_SCHEMA }],
    [DRAFT_VERSION_ID, { published: false, schema: SCHEMA }],
    [
      UNRENDERABLE_VERSION_ID,
      { published: true, schema: SCHEMA, componentKey: UNREGISTERED_RENDERER },
    ],
  ]);
  readonly packages = new Map<string, CatalogPackageEntitlements>([
    [ACTIVE_PACKAGE_ID, { status: "ACTIVE", includedFeatureKeys: [], durationDays: 30 }],
    [DRAFT_PACKAGE_ID, { status: "DRAFT", includedFeatureKeys: [], durationDays: 30 }],
    // The seeded Basic package's keys (prisma/catalog-seed.ts), for the gated feature read (S4).
    [
      FEATURE_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["COUNTDOWN", "MAP", "WHATSAPP"], durationDays: 30 },
    ],
    // The seeded Deluxe package's batch-2 keys (S7): music and the gift registry.
    [
      MUSIC_PACKAGE_ID,
      {
        status: "ACTIVE",
        includedFeatureKeys: ["COUNTDOWN", "MUSIC", "MAP", "WHATSAPP", "GIFT_REGISTRY"],
        durationDays: 180,
      },
    ],
    // The seeded Premium keys (M6 S3): RSVP without a guest list.
    [
      RSVP_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["COUNTDOWN", "RSVP"], durationDays: 90 },
    ],
    // The seeded Deluxe keys (M6 S3): the guest list replaces the open form.
    [
      GUEST_LIST_PACKAGE_ID,
      {
        status: "ACTIVE",
        includedFeatureKeys: ["COUNTDOWN", "RSVP", "GUEST_LIST"],
        durationDays: 180,
      },
    ],
    // The same keys plus the access pass (M6 G2; S3, S4).
    [
      QR_PASS_PACKAGE_ID,
      {
        status: "ACTIVE",
        includedFeatureKeys: ["COUNTDOWN", "RSVP", "GUEST_LIST", "QR_PASS"],
        durationDays: 180,
      },
    ],
    // The itinerary key alone (F1; L3.2), so a guest who sees the plan sees nothing else with it.
    [
      ITINERARY_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["ITINERARY"], durationDays: 30 },
    ],
    // The lodging key alone (F4; L7.2).
    [LODGING_PACKAGE_ID, { status: "ACTIVE", includedFeatureKeys: ["LODGING"], durationDays: 30 }],
    // The livestream key alone (F9; L12.2).
    [
      LIVESTREAM_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["LIVESTREAM"], durationDays: 90 },
    ],
    // The guestbook key alone (F7; L10.2).
    [
      GUESTBOOK_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["GUESTBOOK"], durationDays: 90 },
    ],
    // The album key alone (F8; L11.2).
    [
      GUEST_ALBUM_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["GUEST_ALBUM"], durationDays: 90 },
    ],
    // The opening animation key alone (F10; L14.4), so the switch is the only thing that decides.
    [
      OPENING_ANIMATION_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["OPENING_ANIMATION"], durationDays: 30 },
    ],
    // The access code key alone (F13; L18.5).
    [
      PASSWORD_PACKAGE_ID,
      { status: "ACTIVE", includedFeatureKeys: ["PASSWORD_PROTECTION"], durationDays: 180 },
    ],
  ]);

  /** Every version renders with the allow-listed component unless it says otherwise. */
  private componentKeyOf(versionId: string): string {
    return this.versions.get(versionId)?.componentKey ?? RENDERER;
  }

  async findPublishedVersion(versionId: string): Promise<CatalogTemplateVersionSnapshot | null> {
    const stored = this.versions.get(versionId);
    if (!stored?.published) {
      return null;
    }

    return {
      id: versionId,
      templateId: randomUUID(),
      componentKey: this.componentKeyOf(versionId),
      schema: stored.schema,
      requiredFeatureKeys: [],
    };
  }

  async findVersionSchema(versionId: string): Promise<CatalogVersionSchema | null> {
    const stored = this.versions.get(versionId);
    return stored ? { id: versionId, schema: stored.schema } : null;
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    return this.packages.get(packageId) ?? null;
  }

  async findVersionRenderData(versionId: string): Promise<CatalogVersionRenderData | null> {
    const stored = this.versions.get(versionId);
    if (!stored) {
      return null;
    }
    const componentKey = this.componentKeyOf(versionId);

    return {
      componentKey,
      configuration: { componentKey },
      schema: stored.schema,
    };
  }

  isRendererRegistered(componentKey: string): boolean {
    return componentKey === RENDERER;
  }
}

/**
 * The publication payment gate in memory (S6): it answers "no payment required" until a test asks it to
 * refuse, so the 402 outcome can be observed even though Milestone 5 binds the always-free adapter.
 */
class MemoryPaymentGate implements InvitationPaymentGate {
  refusalReason: string | null = null;
  asked = 0;

  async publicationPaymentRequired(): Promise<InvitationPaymentDecision> {
    this.asked += 1;
    return this.refusalReason === null
      ? { required: false }
      : { required: true, reason: this.refusalReason };
  }
}

/**
 * The music metadata port in memory (S2): every lookup is counted and answered from `answer`, so a test proves a
 * save asks at most once and that a link which did not change asks nothing.
 */
class MemoryMusicMetadataProvider implements MusicMetadataProvider {
  answer: PlaylistMetadata | null = null;
  readonly asked: Array<{ playlistUrl: string; provider: string }> = [];

  /** Forgets every lookup and every answer, so one test's playlist save cannot leak into the next. */
  reset(): void {
    this.answer = null;
    this.asked.length = 0;
  }

  async lookup(playlistUrl: string, provider: string): Promise<PlaylistMetadata | null> {
    this.asked.push({ playlistUrl, provider });
    return this.answer;
  }
}

/**
 * The place search port in memory (S2): every search is recorded and answered from `answer`, so a test proves the
 * route asks once, asks with the trimmed text, and answers from the cache the second time.
 */
class MemoryPlaceSearch implements PlaceSearch {
  answer: PlacePoint[] = [];
  readonly asked: string[] = [];

  async search(query: string): Promise<readonly PlacePoint[]> {
    this.asked.push(query);
    return this.answer;
  }
}

/** The owner's place-search limit in memory (S2): it counts and answers whatever a test chose, so 429 is observable. */
class MemoryPlaceSearchLimiter implements PlaceSearchRateLimiter {
  allow = true;
  readonly consumed: string[] = [];

  async consume(ownerId: string): Promise<boolean> {
    this.consumed.push(ownerId);
    return this.allow;
  }
}

/**
 * The address-check limiter in memory (F11; L15.3): it counts who checked, lets the test close the window, and, when a
 * `max` is set, enforces the real cap so a request over it is observable as the 429 the store answers.
 */
class MemorySlugAvailabilityLimiter implements SlugAvailabilityRateLimiter {
  allow = true;
  /** The cap this fake enforces per owner, or null while the answer is `allow` alone. */
  max: number | null = null;
  readonly consumed: string[] = [];

  async consume(ownerId: string): Promise<boolean> {
    this.consumed.push(ownerId);

    if (!this.allow) {
      return false;
    }

    return this.max === null || this.consumed.length <= this.max;
  }
}

/**
 * The RSVP port in memory (M6 G1; S1, S4). It repeats the adapter's own guards — the owner scope, an editable
 * status, and a still-published invitation — so a route that skipped them would be caught here.
 */
class MemoryRsvpRepository implements RsvpRepository {
  readonly responses: RsvpResponseRecord[] = [];
  /** The settings of every invitation, written through `PUT /invitations/:id/rsvp-settings`. */
  readonly settings = new Map<string, RsvpSettings>();
  private sequence = 0;

  constructor(private readonly invitations: MemoryInvitationRepository) {}

  theSettings(invitationId: string): RsvpSettings {
    const invitation = this.invitations.rows.find((row) => row.id === invitationId);
    return {
      deadline: invitation?.rsvpDeadline ?? null,
      partyLimit: invitation?.rsvpPartyLimit ?? 4,
    };
  }

  async saveSettings(
    ownerId: string,
    id: string,
    settings: RsvpSettings,
  ): Promise<RsvpSettings | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === id && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    if (invitation.status === "ARCHIVED") {
      throw new InvitationNotEditableError(invitation.status);
    }
    invitation.rsvpDeadline = settings.deadline;
    invitation.rsvpPartyLimit = settings.partyLimit;
    this.settings.set(id, settings);
    return settings;
  }

  async findResponses(ownerId: string, id: string): Promise<RsvpReadModel | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === id && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    return {
      slug: invitation.slug,
      settings: this.theSettings(id),
      responses: this.responses
        .filter((response) => response.invitationId === id)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    };
  }

  async upsertResponse(
    invitationId: string,
    response: RsvpResponseWrite,
    at: Date,
  ): Promise<boolean> {
    const invitation = this.invitations.rows.find((row) => row.id === invitationId);
    if (
      invitation?.status !== "PUBLISHED" ||
      (invitation.rsvpDeadline !== null && at.getTime() > invitation.rsvpDeadline.getTime())
    ) {
      return false;
    }
    const existing = this.responses.find(
      (stored) => stored.invitationId === invitationId && stored.dedupeKey === response.dedupeKey,
    );
    if (existing) {
      Object.assign(existing, response, { updatedAt: at });
      return true;
    }
    this.sequence += 1;
    this.responses.push({
      id: randomUUID(),
      invitationId,
      ...response,
      createdAt: new Date(at.getTime() + this.sequence),
      updatedAt: at,
    });
    return true;
  }

  /** A response inserted directly, for the creator read and the export under test. */
  seedResponse(
    invitationId: string,
    overrides: Partial<RsvpResponseWrite> & { createdAt?: Date; updatedAt?: Date } = {},
  ): RsvpResponseRecord {
    const at = overrides.createdAt ?? new Date(Date.UTC(2026, 10, 19, 10, 0, 0));
    const stored: RsvpResponseRecord = {
      id: randomUUID(),
      invitationId,
      name: "Ana Pérez",
      dedupeKey: "ana perez|+525512345678",
      attending: true,
      partySize: 2,
      companions: [],
      dietaryNotes: null,
      phone: "+525512345678",
      message: null,
      createdAt: at,
      updatedAt: overrides.updatedAt ?? at,
      ...overrides,
    };
    this.responses.push(stored);
    return stored;
  }
}

/**
 * The guestbook port in memory (F7; S2.7, L10). It repeats the adapter's own rules — the owner scope, the published and
 * not-expired invitation an insert needs, the visible-only wall, and the invisible null of an entry that belongs to
 * another invitation — so a route that skipped one would be caught here.
 */
class MemoryGuestbookRepository implements GuestbookRepository, InvitationGuestbookReader {
  readonly entries: Array<Mutable<GuestbookEntryRecord> & { invitationId: string }> = [];
  private sequence = 0;

  constructor(private readonly invitations: MemoryInvitationRepository) {}

  async findVisible(invitationId: string): Promise<GuestbookEntryRecord[]> {
    return this.sorted(invitationId)
      .filter((entry) => !entry.hidden)
      .slice(0, 50);
  }

  async readVisibleEntries(invitationId: string) {
    return publicGuestbookEntries(await this.findVisible(invitationId));
  }

  async findOwnedEntries(
    ownerId: string,
    invitationId: string,
  ): Promise<GuestbookEntryRecord[] | null> {
    const owned = this.invitations.rows.some(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );

    return owned ? this.sorted(invitationId).slice(0, GUESTBOOK_OWNER_ENTRIES_MAX) : null;
  }

  async insert(invitationId: string, entry: GuestbookEntryValues): Promise<boolean> {
    const invitation = this.invitations.rows.find((row) => row.id === invitationId);
    if (invitation?.status !== "PUBLISHED") {
      return false;
    }
    const at = new Date();
    if (invitation.expiresAt !== null && invitation.expiresAt.getTime() < at.getTime()) {
      return false;
    }
    this.sequence += 1;
    this.entries.push({
      id: randomUUID(),
      invitationId,
      ...entry,
      hidden: false,
      createdAt: new Date(at.getTime() + this.sequence),
    });
    return true;
  }

  async setHidden(
    ownerId: string,
    invitationId: string,
    entryId: string,
    hidden: boolean,
  ): Promise<GuestbookEntryRecord | null> {
    const owned = this.invitations.rows.some(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    const entry = owned
      ? this.entries.find((stored) => stored.id === entryId && stored.invitationId === invitationId)
      : undefined;
    if (entry === undefined) {
      return null;
    }
    entry.hidden = hidden;
    return entry;
  }

  /** The entries of one invitation newest first, as the adapter's own read orders them. */
  private sorted(invitationId: string): GuestbookEntryRecord[] {
    return this.entries
      .filter((entry) => entry.invitationId === invitationId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  /** An entry stored directly, for the wall and the moderation reads under test. */
  seedEntry(
    invitationId: string,
    overrides: Partial<GuestbookEntryValues> & { hidden?: boolean; createdAt?: Date } = {},
  ): Mutable<GuestbookEntryRecord> & { invitationId: string } {
    this.sequence += 1;
    const stored = {
      id: randomUUID(),
      invitationId,
      authorName: overrides.authorName ?? "Tía Rosa",
      message: overrides.message ?? "¡Que este día sea tan hermoso como tú!",
      hidden: overrides.hidden ?? false,
      createdAt:
        overrides.createdAt ?? new Date(Date.UTC(2026, 11, 1, 10, 0, 0) + this.sequence * 1_000),
    };
    this.entries.push(stored);
    return stored;
  }
}

/**
 * The guestbook rate limiter in memory (F7; L10.3): records what it counted and answers whatever a test chose, so the
 * 429 outcome is observable without a database.
 */
class MemoryGuestbookRateLimiter implements GuestbookRateLimiter {
  allow = true;
  readonly consumed: Array<{ invitationId: string; clientAddress: string }> = [];

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    this.consumed.push({ invitationId, clientAddress });
    return this.allow;
  }
}

/**
 * The guest port in memory (M6 G2; S1, S4). It repeats the adapter's own guards — the owner scope, the editable
 * statuses, the attending answer a check-in needs, and the seats a confirmed party needs — so a route that skipped
 * one would be caught here. The plain token never enters this class: it holds the digests, as `Guest.tokenHash` does.
 */
/**
 * The `InvitationView` write port (M9 T11; S2, S7) over an in-memory list. It records every increment the public reads
 * make, so the suite can prove which openings are counted and which are not, and it can fail on demand to prove the
 * guest's answer never depends on the counter.
 */
class MemoryInvitationViewRepository implements InvitationViewRepository {
  readonly increments: Array<{ invitationId: string; source: string; at: Date }> = [];
  fail = false;

  async increment(invitationId: string, source: "PUBLIC" | "GUEST", at: Date): Promise<void> {
    if (this.fail) {
      throw new Error("counter unavailable");
    }
    this.increments.push({ invitationId, source, at });
  }
}

class MemoryGuestRepository implements GuestRepository {
  readonly guests: Array<GuestRecord & { tokenHash: string }> = [];
  readonly responses: Array<
    GuestResponseWrite & { guestId: string; createdAt: Date; updatedAt: Date }
  > = [];
  private sequence = 0;

  constructor(private readonly invitations: MemoryInvitationRepository) {}

  private editable(ownerId: string, invitationId: string): InvitationRecord | null {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    if (invitation.status === "ARCHIVED") {
      throw new InvitationNotEditableError(invitation.status);
    }
    return invitation;
  }

  private of(invitationId: string, guestId: string) {
    return this.guests.find((row) => row.id === guestId && row.invitationId === invitationId);
  }

  private withResponse(guest: GuestRecord & { tokenHash: string }): GuestWithResponse {
    const answer = this.responses.find((row) => row.guestId === guest.id) ?? null;
    return {
      id: guest.id,
      invitationId: guest.invitationId,
      name: guest.name,
      seats: guest.seats,
      phone: guest.phone,
      note: guest.note,
      tableLabel: guest.tableLabel,
      tokenIssuedAt: guest.tokenIssuedAt,
      checkedInAt: guest.checkedInAt,
      createdAt: guest.createdAt,
      updatedAt: guest.updatedAt,
      response:
        answer === null
          ? null
          : {
              attending: answer.attending,
              partySize: answer.partySize,
              companions: answer.companions,
              dietaryNotes: answer.dietaryNotes,
              message: answer.message,
              createdAt: answer.createdAt,
              updatedAt: answer.updatedAt,
            },
    };
  }

  async create(
    ownerId: string,
    invitationId: string,
    guest: NewGuest,
    at: Date,
  ): Promise<GuestRecord | null> {
    if (this.editable(ownerId, invitationId) === null) {
      return null;
    }
    this.sequence += 1;
    const created = {
      id: randomUUID(),
      invitationId,
      name: guest.name,
      seats: guest.seats,
      phone: guest.phone,
      note: guest.note,
      tableLabel: guest.tableLabel,
      tokenHash: guest.tokenHash,
      tokenIssuedAt: at,
      checkedInAt: null,
      createdAt: new Date(at.getTime() + this.sequence),
      updatedAt: at,
    };
    this.guests.push(created);
    return this.withResponse(created);
  }

  async findGuests(ownerId: string, invitationId: string): Promise<GuestListReadModel | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    return {
      slug: invitation.slug,
      guests: this.guests
        .filter((row) => row.invitationId === invitationId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((row) => this.withResponse(row)),
    };
  }

  async findGuest(
    ownerId: string,
    invitationId: string,
    guestId: string,
  ): Promise<GuestWithResponse | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    if (!invitation) {
      return null;
    }
    const guest = this.of(invitationId, guestId);
    return guest === undefined ? null : this.withResponse(guest);
  }

  async update(
    ownerId: string,
    invitationId: string,
    guestId: string,
    fields: GuestFields,
    at: Date,
  ): Promise<GuestRecord | null> {
    if (this.editable(ownerId, invitationId) === null) {
      return null;
    }
    const guest = this.of(invitationId, guestId);
    if (guest === undefined) {
      return null;
    }
    const answer = this.responses.find((row) => row.guestId === guestId);
    if (answer?.attending === true && answer.partySize > fields.seats) {
      throw new GuestSeatsBelowConfirmedPartyError(answer.partySize);
    }
    // An omitted table keeps the stored one, exactly like the adapter's statement (F5; L8.3, L20).
    const { tableLabel, ...rest } = fields;
    Object.assign(guest, rest, { updatedAt: at });
    if (tableLabel !== undefined) {
      guest.tableLabel = tableLabel;
    }
    return this.withResponse(guest);
  }

  async remove(ownerId: string, invitationId: string, guestId: string): Promise<boolean> {
    if (this.editable(ownerId, invitationId) === null) {
      return false;
    }
    const index = this.guests.findIndex(
      (row) => row.id === guestId && row.invitationId === invitationId,
    );
    if (index === -1) {
      return false;
    }
    this.guests.splice(index, 1);
    for (let position = this.responses.length - 1; position >= 0; position -= 1) {
      if (this.responses[position]?.guestId === guestId) {
        this.responses.splice(position, 1);
      }
    }
    return true;
  }

  async rotateToken(
    ownerId: string,
    invitationId: string,
    guestId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestRecord | null> {
    if (this.editable(ownerId, invitationId) === null) {
      return null;
    }
    const guest = this.of(invitationId, guestId);
    if (guest === undefined) {
      return null;
    }
    guest.tokenHash = tokenHash;
    guest.tokenIssuedAt = at;
    guest.updatedAt = at;
    return this.withResponse(guest);
  }

  async findByToken(invitationId: string, tokenHash: string): Promise<GuestWithResponse | null> {
    const guest = this.guests.find(
      (row) => row.invitationId === invitationId && row.tokenHash === tokenHash,
    );
    return guest === undefined ? null : this.withResponse(guest);
  }

  async upsertResponse(
    invitationId: string,
    guestId: string,
    response: GuestResponseWrite,
    at: Date,
  ): Promise<boolean> {
    const invitation = this.invitations.rows.find((row) => row.id === invitationId);
    const guest = this.of(invitationId, guestId);
    if (
      invitation?.status !== "PUBLISHED" ||
      guest === undefined ||
      (invitation.rsvpDeadline !== null && at.getTime() > invitation.rsvpDeadline.getTime())
    ) {
      return false;
    }
    const existing = this.responses.find((row) => row.guestId === guestId);
    if (existing !== undefined) {
      Object.assign(existing, response, { updatedAt: at });
      return true;
    }
    this.responses.push({ guestId, ...response, createdAt: at, updatedAt: at });
    return true;
  }

  async checkIn(
    ownerId: string,
    invitationId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestCheckIn | null> {
    const invitation = this.invitations.rows.find(
      (row) => row.id === invitationId && row.ownerId === ownerId,
    );
    const guest = this.guests.find(
      (row) => row.invitationId === invitationId && row.tokenHash === tokenHash,
    );
    if (invitation === undefined || guest === undefined || invitation.status === "ARCHIVED") {
      return null;
    }
    const answer = this.responses.find((row) => row.guestId === guest.id);
    if (answer?.attending !== true) {
      return null;
    }
    guest.checkedInAt ??= at;
    return {
      id: guest.id,
      name: guest.name,
      seats: guest.seats,
      partySize: answer.partySize,
      checkedInAt: guest.checkedInAt,
    };
  }

  /** A guest inserted directly, for the reads and the check-in under test. */
  seedGuest(
    invitationId: string,
    overrides: Partial<GuestFields> & { token: string; checkedInAt?: Date | null } = {
      token: "A".repeat(22),
    },
  ): GuestRecord & { tokenHash: string } {
    this.sequence += 1;
    const at = new Date(Date.UTC(2026, 10, 19, 10, 0, 0));
    const created = {
      id: randomUUID(),
      invitationId,
      name: overrides.name ?? "Ana Pérez",
      seats: overrides.seats ?? 3,
      phone: overrides.phone ?? PHONE,
      note: overrides.note ?? "Mesa 4",
      tableLabel: overrides.tableLabel ?? null,
      tokenHash: guestTokenHash(overrides.token),
      tokenIssuedAt: at,
      checkedInAt: overrides.checkedInAt ?? null,
      createdAt: new Date(at.getTime() + this.sequence),
      updatedAt: at,
    };
    this.guests.push(created);
    return created;
  }

  /** A stored answer for one guest, for the check-in and the export under test. */
  seedResponse(guestId: string, overrides: Partial<GuestResponseWrite> = {}): void {
    const at = new Date(Date.UTC(2026, 10, 20, 10, 0, 0));
    this.responses.push({
      guestId,
      attending: true,
      partySize: 2,
      companions: [],
      dietaryNotes: null,
      message: "Vamos",
      createdAt: at,
      updatedAt: at,
      ...overrides,
    });
  }
}

/**
 * The RSVP rate limiter in memory (M6 G1; S4): records what it counted and answers whatever a test chose, so the
 * 429 outcome is observable without a database.
 */
class MemoryRateLimiter implements RsvpRateLimiter {
  allow = true;
  readonly consumed: Array<{ invitationId: string; clientAddress: string }> = [];

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    this.consumed.push({ invitationId, clientAddress });
    return this.allow;
  }
}

/**
 * The album source of the public read (F8; L11.4) in memory: it repeats the adapter's rule that only published photos are
 * answered, newest first and capped at 60, so a projection that leaked a pending one would be caught here.
 */
class MemoryGuestAlbumReader {
  readonly photos: Array<{
    invitationId: string;
    url: string;
    uploaderName: string | null;
    status: "PENDING" | "PUBLISHED" | "HIDDEN";
    createdAt: Date;
  }> = [];

  seedPhoto(
    invitationId: string,
    overrides: {
      url?: string;
      uploaderName?: string | null;
      status?: "PENDING" | "PUBLISHED" | "HIDDEN";
      createdAt?: Date;
    } = {},
  ): void {
    this.photos.push({
      invitationId,
      url: overrides.url ?? `https://api.example.test/media/${randomUUID()}`,
      uploaderName: overrides.uploaderName ?? null,
      status: overrides.status ?? "PUBLISHED",
      createdAt: overrides.createdAt ?? new Date(Date.UTC(2026, 11, 1, 10, 0, 0)),
    });
  }

  async readPublishedPhotos(invitationId: string) {
    const published = this.photos
      .filter((photo) => photo.invitationId === invitationId && photo.status === "PUBLISHED")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return {
      photos: published
        .slice(0, 60)
        .map((photo) => ({ url: photo.url, uploaderName: photo.uploaderName })),
      count: published.length,
    };
  }
}

describe("invitations routes: /invitations", () => {
  const database: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database),
    // No probe here requests a sign-in code.
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });
  const repository = new MemoryInvitationRepository();
  const catalog = new MemoryInvitationCatalog();
  const paymentGate = new MemoryPaymentGate();
  const musicMetadata = new MemoryMusicMetadataProvider();
  const rsvpRepository = new MemoryRsvpRepository(repository);
  const guestRepository = new MemoryGuestRepository(repository);
  const rateLimiter = new MemoryRateLimiter();
  const guestbookRepository = new MemoryGuestbookRepository(repository);
  const guestAlbumReader = new MemoryGuestAlbumReader();
  const guestbookRateLimiter = new MemoryGuestbookRateLimiter();
  const viewRepository = new MemoryInvitationViewRepository();
  const placeSearch = new MemoryPlaceSearch();
  const placeSearchLimiter = new MemoryPlaceSearchLimiter();
  const slugAvailabilityLimiter = new MemorySlugAvailabilityLimiter();
  let app: INestApplication;
  let baseUrl: string;
  let userCounter = 0;

  before(async () => {
    @Module({
      imports: [
        createConfigModule({
          NODE_ENV: "development",
          CORS_ORIGIN: TRUSTED_ORIGIN,
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL,
        }),
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
      ],
      controllers: [InvitationsController, PublicInvitationsController],
      providers: [
        ...INVITATION_USE_CASES,
        // The one authorization resolver every invitation route consults (F12; L17.4), over this suite's own memory
        // repository: the owner of the row, an accepted collaborator whose permissions the suite seeded, or nobody — the
        // same three answers the Prisma resolver gives, without a database.
        {
          provide: INVITATION_ACCESS_RESOLVER,
          useValue: {
            resolve: async (
              userId: string,
              invitationId: string,
            ): Promise<InvitationAccess | null> => {
              const access = repository.accessFor(userId, invitationId);

              return access;
            },
          },
        },
        { provide: INVITATION_REPOSITORY, useValue: repository },
        { provide: INVITATION_CATALOG, useValue: catalog },
        // Publication is free in Milestone 5; the publish use case asks this gate (S6).
        { provide: INVITATION_PAYMENT_GATE, useValue: paymentGate },
        { provide: MUSIC_METADATA_PROVIDER, useValue: musicMetadata },
        // This deployment has no WhatsApp Business account, so the sender is the adapter that sends nothing (F6; S6).
        { provide: REMINDER_SENDER, useValue: new NotConfiguredReminderSender() },
        { provide: RSVP_REPOSITORY, useValue: rsvpRepository },
        { provide: GUEST_REPOSITORY, useValue: guestRepository },
        { provide: RSVP_RATE_LIMITER, useValue: rateLimiter },
        { provide: GUESTBOOK_REPOSITORY, useValue: guestbookRepository },
        // The public projection reads the wall through its own port, as the module's one adapter serves both (F7).
        { provide: INVITATION_GUESTBOOK_READER, useValue: guestbookRepository },
        { provide: GUESTBOOK_RATE_LIMITER, useValue: guestbookRateLimiter },
        // The public projection reads the album through its own port (F8; L11.4).
        { provide: INVITATION_GUEST_ALBUM_READER, useValue: guestAlbumReader },
        // The public reads count one opening each through this port (M9 T11; S2, S7).
        { provide: INVITATION_VIEW_REPOSITORY, useValue: viewRepository },
        { provide: PLACE_SEARCH, useValue: placeSearch },
        { provide: PLACE_SEARCH_RATE_LIMITER, useValue: placeSearchLimiter },
        // The address check counts on its own limit, on the same store (F11; L15.3).
        { provide: SLUG_AVAILABILITY_RATE_LIMITER, useValue: slugAvailabilityLimiter },
        { provide: InMemoryPlaceSearchCache, useValue: new InMemoryPlaceSearchCache() },
        // The operational settings (M9 T13; S5, S8): this suite exercises other rules, so it composes the reader
        // that answers the values the migration seeds.
        { provide: OPERATIONAL_SETTINGS_READER, useValue: INITIAL_OPERATIONAL_SETTINGS_READER },
        // The password gate the public controller declares, always open: this suite's subject is the owner's own routes,
        // and the locked state of every public route is proved by `public-invitation-lock.spec.ts` (F13; L18.2).
        {
          provide: InvitationPasswordGate,
          useValue: new InvitationPasswordGate(
            { findLockBySlug: async () => null },
            createInvitationAccessTokens(secret),
          ),
        },
        // The unlock route's use case, which the public controller injects: unreachable here, because the routes this
        // suite serves are the owner's.
        {
          provide: UnlockInvitationUseCase,
          useValue: { execute: async () => ({ status: "rejected" }) },
        },
      ],
    })
    class InvitationsTestModule {}

    app = await createApp(InvitationsTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  /** A stored customer and a signed session cookie for them, as an email-code sign-in leaves them. */
  async function signedInCustomer(): Promise<{ userId: string; cookie: string }> {
    userCounter += 1;
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      { email: `m4-t4-invitations-${userCounter}@example.test`, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    const session = await context.internalAdapter.createSession(created.id);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      userId: created.id,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    };
  }

  function send(
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  }

  const draftBody = () => ({
    templateVersionId: PUBLISHED_VERSION_ID,
    packageId: ACTIVE_PACKAGE_ID,
  });

  async function createDraft(cookie: string) {
    const response = await send("POST", PATH, cookie, draftBody());
    assert.equal(response.status, 201);
    return (await response.json()) as Row & { id: string; slug: string };
  }

  const SUMMARY_KEYS = [
    "archivedAt",
    "createdAt",
    "id",
    "packageId",
    "publishedAt",
    "slug",
    "status",
    "templateVersionId",
    "updatedAt",
  ];
  /** One row of `GET /invitations`: the summary plus what a card renders the invitation from (T2; S2.6). */
  const LIST_KEYS = [
    ...SUMMARY_KEYS,
    "componentKey",
    "configuration",
    "content",
    // The caller's own role and permissions (F12; L17.5).
    "role",
    "permissions",
  ].sort();
  const OWNED_KEYS = [
    ...SUMMARY_KEYS,
    "content",
    "missingRequiredFields",
    "timeZone",
    "featureSettings",
    "availableFeatures",
    "places",
    // Whether this deployment can send a reminder at all (F6; S6, L9.5): a capability, never a secret.
    "remindersConfigured",
    // How many renames the owner has left (F11; L15.2).
    "slugRenamesRemaining",
    // Whether a shared access code protects the invitation (F13; L18.1): only this boolean, never the code.
    "passwordProtected",
    // The caller's own role and permissions (F12; L17.4, L17.5).
    "role",
    "permissions",
  ].sort();

  describe("access control", () => {
    const requests: Array<[string, string, string, unknown?]> = [
      ["create", "POST", PATH, { templateVersionId: 42, role: "ADMIN" }],
      ["list", "GET", PATH],
      ["read", "GET", `${PATH}/${UNKNOWN_ID}`],
      ["replace content", "PUT", `${PATH}/${UNKNOWN_ID}/content`, { content: "not-an-object" }],
      [
        "replace features",
        "PUT",
        `${PATH}/${UNKNOWN_ID}/features`,
        { timeZone: "Europe/Madrid", whatsappPhone: "12345" },
      ],
      ["place search", "GET", `${PATH}/${UNKNOWN_ID}/places/search?q=quer%C3%A9taro`],
      [
        "store place",
        "PUT",
        `${PATH}/${UNKNOWN_ID}/places/address`,
        { label: "Parroquia de San José", lat: 20.5888, lng: -100.3899 },
      ],
      ["clear place", "DELETE", `${PATH}/${UNKNOWN_ID}/places/address`],
      ["archive", "POST", `${PATH}/${UNKNOWN_ID}/archive`],
      ["publish", "POST", `${PATH}/${UNKNOWN_ID}/publish`],
      ["unpublish", "POST", `${PATH}/${UNKNOWN_ID}/unpublish`],
      [
        "rsvp settings",
        "PUT",
        `${PATH}/${UNKNOWN_ID}/rsvp-settings`,
        { deadline: null, partyLimit: 4 },
      ],
      ["rsvp read", "GET", `${PATH}/${UNKNOWN_ID}/rsvp`],
      ["rsvp export", "GET", `${PATH}/${UNKNOWN_ID}/rsvp.csv`],
      ["guest list", "GET", `${PATH}/${UNKNOWN_ID}/guests`],
      [
        "create guest",
        "POST",
        `${PATH}/${UNKNOWN_ID}/guests`,
        { name: "Ana", seats: 2, phone: null, note: null },
      ],
      [
        "edit guest",
        "PUT",
        `${PATH}/${UNKNOWN_ID}/guests/${UNKNOWN_ID}`,
        { name: "Ana", seats: 2, phone: null, note: null },
      ],
      ["remove guest", "DELETE", `${PATH}/${UNKNOWN_ID}/guests/${UNKNOWN_ID}`],
      ["rotate guest token", "POST", `${PATH}/${UNKNOWN_ID}/guests/${UNKNOWN_ID}/token`],
      [
        "guest check-in",
        "POST",
        `${PATH}/${UNKNOWN_ID}/guests/check-in`,
        { token: "A".repeat(22) },
      ],
    ];

    it("answers 401 without a valid session, before validating the body, and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const headers = [undefined, `${SESSION_COOKIE}=not-a-session`, `${cookie.slice(0, -4)}AAAA`];

      for (const header of headers) {
        for (const [label, method, target, body] of requests) {
          assert.equal((await send(method, target, header, body)).status, 401, label);
        }
      }
      assert.equal(repository.rows.length, 0);
    });

    it("lets a signed-in customer reach every route (none answers 401 or 403)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const [label, method, target, body] of requests) {
        const patched = target.replace(UNKNOWN_ID, draft.id);
        const response = await send(method, patched, cookie, body ?? undefined);
        assert.ok(
          response.status !== 401 && response.status !== 403,
          `${label}: ${response.status}`,
        );
      }
    });
  });

  describe("POST /invitations", () => {
    it("creates a DRAFT owned by the session user and answers 201 with the owned invitation", async () => {
      const { userId, cookie } = await signedInCustomer();

      const response = await send("POST", PATH, cookie, draftBody());

      assert.equal(response.status, 201);
      const body = (await response.json()) as Row & { id: string };
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.archivedAt, null);
      assert.equal(body.templateVersionId, PUBLISHED_VERSION_ID);
      assert.equal(body.packageId, ACTIVE_PACKAGE_ID);
      assert.match(String(body.slug), /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.deepEqual(body.content, {});
      assert.deepEqual(body.missingRequiredFields, ["title"]);
      assert.equal(body.timeZone, "America/Mexico_City");
      assert.deepEqual(body.featureSettings, {
        whatsappPhone: null,
        playlistUrl: null,
        playlistTitle: null,
        playlistCoverUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      // The ACTIVE fixture package includes no catalog feature, so only the calendar is offered (S4).
      assert.deepEqual(body.availableFeatures, ["CALENDAR"]);
      for (const field of ["createdAt", "updatedAt"]) {
        assert.equal(new Date(String(body[field])).toISOString(), body[field], field);
      }

      const stored = repository.rows.find((row) => row.id === body.id);
      assert.ok(stored);
      assert.equal(stored.ownerId, userId);
    });

    it("takes the owner from the session and never from the body", async () => {
      const { userId, cookie } = await signedInCustomer();
      const other = await signedInCustomer();

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        ownerId: other.userId,
      });

      // An unknown field is refused by the global pipe, so no request can even offer an owner.
      assert.equal(response.status, 400);
      assert.equal(
        repository.rows.some((row) => row.ownerId === other.userId),
        false,
      );

      const accepted = await createDraft(cookie);
      assert.equal(repository.rows.find((row) => row.id === accepted.id)?.ownerId, userId);
    });

    it("answers 400 for a body the DTO refuses and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;
      const bodies: unknown[] = [
        {},
        { templateVersionId: PUBLISHED_VERSION_ID },
        { packageId: ACTIVE_PACKAGE_ID },
        { templateVersionId: "not-a-uuid", packageId: ACTIVE_PACKAGE_ID },
        { templateVersionId: PUBLISHED_VERSION_ID, packageId: "not-a-uuid" },
        { ...draftBody(), slug: "chosen-by-the-client" },
        { ...draftBody(), status: "ARCHIVED" },
        "not-json",
      ];

      for (const body of bodies) {
        const response = await send("POST", PATH, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(repository.rows.length, before);
    });

    it("answers 404 INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED for a version that is missing or not published", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      for (const templateVersionId of [UNKNOWN_ID, DRAFT_VERSION_ID]) {
        const response = await send("POST", PATH, cookie, {
          ...draftBody(),
          templateVersionId,
        });

        assert.equal(response.status, 404, templateVersionId);
        assert.deepEqual(await response.json(), {
          code: "INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED",
        });
      }
      assert.equal(repository.rows.length, before);
    });

    it("answers 404 INVITATION_PACKAGE_NOT_FOUND for a package that does not exist", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        packageId: UNKNOWN_ID,
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_PACKAGE_NOT_FOUND" });
      assert.equal(repository.rows.length, before);
    });

    it("answers 400 INVITATION_PACKAGE_DOES_NOT_FIT for a package that does not fit and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        packageId: DRAFT_PACKAGE_ID,
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "INVITATION_PACKAGE_DOES_NOT_FIT" });
      assert.equal(repository.rows.length, before);
    });

    it("answers 503 INVITATION_SLUG_UNAVAILABLE when no slug can be stored and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;
      repository.slugCollisions = Number.MAX_SAFE_INTEGER;

      try {
        const response = await send("POST", PATH, cookie, draftBody());

        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { code: "INVITATION_SLUG_UNAVAILABLE" });
        assert.equal(repository.rows.length, before);
      } finally {
        repository.slugCollisions = 0;
      }
    });
  });

  describe("GET /invitations", () => {
    it("lists only the session user's invitations, newest first, with no ownerId", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const first = await createDraft(owner.cookie);
      const second = await createDraft(owner.cookie);
      await createDraft(other.cookie);

      const response = await send("GET", PATH, owner.cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row[];
      assert.deepEqual(
        body.map((item) => item.id),
        [second.id, first.id],
      );
      for (const item of body) {
        assert.deepEqual(Object.keys(item).sort(), LIST_KEYS);
        assert.equal(item.ownerId, undefined);
        // The card's own data: the pinned version's renderer and the stored content (T2; S2.6).
        assert.equal(item.componentKey, RENDERER);
        assert.deepEqual(item.configuration, { componentKey: RENDERER });
        assert.deepEqual(item.content, {});
      }
    });

    it("answers an empty list to an owner without invitations", async () => {
      const { cookie } = await signedInCustomer();

      const response = await send("GET", PATH, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
    });

    it("adds the invitations shared with the caller, marked with its role and permissions (F12; L17.5)", async () => {
      const owner = await signedInCustomer();
      const shared = await signedInCustomer();
      const stranger = await signedInCustomer();
      const theirs = await createDraft(owner.cookie);
      const own = await createDraft(shared.cookie);
      repository.share(theirs.id, shared.userId, ["VIEW_ATTENDANCE"]);

      const response = await send("GET", PATH, shared.cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row[];
      assert.deepEqual(
        body.map((item) => item.id),
        [own.id, theirs.id],
        "newest first across both reads",
      );
      for (const item of body) {
        assert.deepEqual(Object.keys(item).sort(), LIST_KEYS);
        assert.equal(item.ownerId, undefined);
      }
      assert.equal(body[0]?.role, "OWNER");
      assert.deepEqual(body[0]?.permissions, []);
      assert.equal(body[1]?.role, "COLLABORATOR");
      assert.deepEqual(body[1]?.permissions, ["VIEW_ATTENDANCE"]);

      // The same caller reading the shared invitation answers the same role, and a stranger still sees nothing of it.
      const read = await send("GET", `${PATH}/${theirs.id}`, shared.cookie);
      assert.equal(read.status, 200);
      const readBody = (await read.json()) as Row;
      assert.equal(readBody.role, "COLLABORATOR");
      assert.deepEqual(readBody.permissions, ["VIEW_ATTENDANCE"]);
      const strangerList = await send("GET", PATH, stranger.cookie);
      assert.deepEqual(
        ((await strangerList.json()) as Row[]).map((item) => item.id),
        [],
      );
    });
  });

  describe("GET /invitations/:id", () => {
    it("answers the owner's invitation with its content and missing required fields", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("GET", `${PATH}/${draft.id}`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.ownerId, undefined);
      assert.deepEqual(body.content, {});
      assert.deepEqual(body.missingRequiredFields, ["title"]);
      assert.equal(body.timeZone, "America/Mexico_City");
      assert.deepEqual(body.featureSettings, {
        whatsappPhone: null,
        playlistUrl: null,
        playlistTitle: null,
        playlistCoverUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      assert.deepEqual(body.availableFeatures, ["CALENDAR"]);
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("GET", `${PATH}/${id}`, other.cookie);
        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
    });

    it("answers 400 for an id that is not a UUID", async () => {
      const { cookie } = await signedInCustomer();

      const probes: Array<[string, string, unknown?]> = [
        ["GET", `${PATH}/not-a-uuid`],
        ["GET", `${PATH}/1`],
        ["PUT", `${PATH}/1/content`, { content: {} }],
        ["POST", `${PATH}/1/archive`],
        ["POST", `${PATH}/1/publish`],
        ["POST", `${PATH}/1/unpublish`],
        ["PUT", `${PATH}/1/rsvp-settings`, { deadline: null, partyLimit: 4 }],
        ["GET", `${PATH}/1/rsvp`],
        ["GET", `${PATH}/1/rsvp.csv`],
        ["GET", `${PATH}/1/guests`],
        ["POST", `${PATH}/1/guests`, { name: "Ana", seats: 1, phone: null, note: null }],
        ["PUT", `${PATH}/1/guests/1`, { name: "Ana", seats: 1, phone: null, note: null }],
        ["DELETE", `${PATH}/1/guests/1`],
        ["POST", `${PATH}/1/guests/1/token`],
        ["POST", `${PATH}/1/guests/check-in`, { token: "A".repeat(22) }],
      ];

      for (const [method, path, body] of probes) {
        const response = await send(method, path, cookie, body);
        assert.equal(response.status, 400, `${method} ${path}`);
      }
    });
  });

  describe("the caller's own access on every answer a collaborator reaches (F12; L17.4)", () => {
    const POINT: PlacePoint = { label: "Parroquia de San José", lat: 20.5888, lng: -100.3899 };

    /**
     * A draft of `owner`'s, shared with one accepted collaborator holding `permissions`. The collaborator writes through
     * the owner's own scoped statements, so every route it reaches must answer the *caller's* role and permissions —
     * `COLLABORATOR` with its set — and never `OWNER`, which would tell the web a co-host may do what only the owner may.
     */
    async function sharedDraft(permissions: readonly InvitationPermission[]) {
      const owner = await signedInCustomer();
      const collaborator = await signedInCustomer();
      const response = await send("POST", PATH, owner.cookie, {
        templateVersionId: PLACE_VERSION_ID,
        packageId: FEATURE_PACKAGE_ID,
      });
      assert.equal(response.status, 201);
      const draft = (await response.json()) as Row & { id: string };
      repository.share(draft.id, collaborator.userId, [...permissions]);
      return { owner, collaborator, draft };
    }

    it("answers the collaborator's role on content, features, places, clear, publish, and the read", async () => {
      const contentWriter = await sharedDraft(["EDIT_CONTENT"]);
      const cookie = contentWriter.collaborator.cookie;
      const id = contentWriter.draft.id;
      const answers: Array<[string, Response]> = [
        [
          "content",
          await send("PUT", `${PATH}/${id}/content`, cookie, {
            content: { address: "Av. Juárez 45" },
          }),
        ],
        [
          "features",
          await send("PUT", `${PATH}/${id}/features`, cookie, {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: null,
          }),
        ],
        ["place", await send("PUT", `${PATH}/${id}/places/address`, cookie, POINT)],
        ["clear place", await send("DELETE", `${PATH}/${id}/places/address`, cookie)],
        ["read", await send("GET", `${PATH}/${id}`, cookie)],
      ];

      const publisher = await sharedDraft(["PUBLISH"]);
      const filled = await send(
        "PUT",
        `${PATH}/${publisher.draft.id}/content`,
        publisher.owner.cookie,
        {
          content: { address: "Av. Juárez 45" },
        },
      );
      assert.equal(filled.status, 200, "the draft the collaborator publishes is ready");
      answers.push([
        "publish",
        await send("POST", `${PATH}/${publisher.draft.id}/publish`, publisher.collaborator.cookie),
      ]);

      for (const [name, response] of answers) {
        assert.equal(response.status, 200, name);
        const body = (await response.json()) as Row;
        assert.equal(body.role, "COLLABORATOR", name);
        assert.deepEqual(
          body.permissions,
          name === "publish" ? ["PUBLISH"] : ["EDIT_CONTENT"],
          `${name} answers the caller's own permissions`,
        );
      }
    });

    it("keeps answering OWNER with no permissions to the owner on the same routes", async () => {
      const owner = await signedInCustomer();
      const created = await send("POST", PATH, owner.cookie, {
        templateVersionId: PLACE_VERSION_ID,
        packageId: FEATURE_PACKAGE_ID,
      });
      const draft = (await created.json()) as Row & { id: string };

      const saved = await send("PUT", `${PATH}/${draft.id}/content`, owner.cookie, {
        content: { address: "Av. Juárez 45" },
      });
      const published = await send("POST", `${PATH}/${draft.id}/publish`, owner.cookie);

      for (const [name, response] of [
        ["content", saved],
        ["publish", published],
      ] as const) {
        assert.equal(response.status, 200, name);
        const body = (await response.json()) as Row;
        assert.equal(body.role, "OWNER", name);
        assert.deepEqual(body.permissions, [], name);
      }
    });
  });

  describe("PUT /invitations/:id/content", () => {
    it("replaces the content, validates it against the pinned version, and answers the owned invitation", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Cumpleaños de Ana" },
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual(body.content, { title: "Cumpleaños de Ana" });
      assert.deepEqual(body.missingRequiredFields, []);
      assert.equal(body.ownerId, undefined);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, {
        title: "Cumpleaños de Ana",
      });
    });

    it("answers 400 INVALID_INVITATION_CONTENT with its issues and keeps the stored content", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id)?.content);

      for (const content of [{ title: 42 }, { subtitle: "x" }, "not-an-object", []]) {
        const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content });

        assert.equal(response.status, 400, JSON.stringify(content));
        const body = (await response.json()) as { code: string; issues: string[] };
        assert.equal(body.code, "INVALID_INVITATION_CONTENT");
        assert.ok(Array.isArray(body.issues) && body.issues.length > 0);
      }
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, before);
    });

    it("answers 400 for a body without content or with an unknown field, and changes nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const body of [{}, { content: {}, templateVersionId: UNKNOWN_ID }, { content: "x" }]) {
        const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, {});
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps it unchanged", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Ana" },
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.deepEqual(stored?.content, {});
    });

    it("applies a content write only if the version it names is still the stored one (S2)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const path = `${PATH}/${draft.id}/content`;
      const stored = () => repository.rows.find((row) => row.id === draft.id);
      const put = (title: string, expectedUpdatedAt: string) =>
        send("PUT", path, cookie, { content: { title }, expectedUpdatedAt });

      await send("PUT", path, cookie, { content: { title: "Ana" } });
      const version = stored()?.updatedAt;
      assert.ok(version !== undefined);
      const stale = new Date(version.getTime() - 1_000).toISOString();
      const conflict = await put("Otra", stale);
      assert.equal(conflict.status, 409);
      assert.deepEqual(await conflict.json(), { code: "INVITATION_CONTENT_CONFLICT" });
      assert.deepEqual(stored()?.content, { title: "Ana" });

      assert.equal((await put("Beatriz", version.toISOString())).status, 200);
      assert.deepEqual(stored()?.content, { title: "Beatriz" });
    });

    it("answers 404 for another customer's invitation and changes nothing", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, other.cookie, {
        content: { title: "Ana" },
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.deepEqual(stored?.content, {});
      assert.equal(stored?.status, "DRAFT");
    });
  });

  describe("PUT /invitations/:id/features", () => {
    it("stores the zone, the normalized phone, and the playlist link and answers the owned invitation (F1, F6; S4, S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: "(55) 1234-5678",
        playlistUrl: PLAYLIST,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.timeZone, "America/Tijuana");
      assert.deepEqual(body.featureSettings, {
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
        playlistTitle: null,
        playlistCoverUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      // The ACTIVE fixture package includes no catalog feature, so only the calendar is offered (S4).
      assert.deepEqual(body.availableFeatures, ["CALENDAR"]);
      assert.equal(body.ownerId, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.timeZone, "America/Tijuana");
      assert.equal(stored?.whatsappPhone, PHONE);
      assert.equal(stored?.playlistUrl, PLAYLIST);
    });

    it("clears the stored phone with null and with an empty value (S4)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Cancun",
        whatsappPhone: PHONE,
        playlistUrl: null,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      for (const whatsappPhone of [null, ""]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Cancun",
          whatsappPhone,
          playlistUrl: null,

          itinerary: null,
          giftRegistry: null,
          lodging: null,
          livestream: null,
          openingAnimation: true,
          reminders: null,
        });

        assert.equal(response.status, 200, String(whatsappPhone));
        assert.deepEqual(((await response.json()) as Row).featureSettings, {
          whatsappPhone: null,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
          livestream: null,
          openingAnimation: true,
          reminders: null,
        });
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.whatsappPhone, null);
      }
    });

    it("stores and answers the playlist title and cover the provider named (S2)", async () => {
      musicMetadata.reset();
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      musicMetadata.answer = {
        title: "Today’s Top Hits",
        coverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",
      };

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: PLAYLIST,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      // The owner reads the stored metadata, so the editor and the preview can show the same card a guest sees.
      assert.deepEqual(body.featureSettings, {
        whatsappPhone: null,
        playlistUrl: PLAYLIST,
        playlistTitle: "Today’s Top Hits",
        playlistCoverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      assert.deepEqual(musicMetadata.asked, [{ playlistUrl: PLAYLIST, provider: "spotify" }]);

      // Saving the same link again asks nothing and keeps what was stored for it (S2).
      musicMetadata.answer = { title: "Otra lista", coverUrl: null };
      const again = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Cancun",
        whatsappPhone: null,
        playlistUrl: PLAYLIST,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      assert.equal(again.status, 200);
      assert.equal(musicMetadata.asked.length, 1);
      assert.deepEqual(((await again.json()) as Row).featureSettings, {
        whatsappPhone: null,
        playlistUrl: PLAYLIST,
        playlistTitle: "Today’s Top Hits",
        playlistCoverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      // A later owner read answers the same stored metadata, so the editor and the preview render it too (S2).
      const stored = (await (await send("GET", `${PATH}/${draft.id}`, cookie)).json()) as Row;
      assert.deepEqual(stored.featureSettings, {
        whatsappPhone: null,
        playlistUrl: PLAYLIST,
        playlistTitle: "Today’s Top Hits",
        playlistCoverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
    });

    it("clears the stored playlist title and cover with the link (S2)", async () => {
      musicMetadata.reset();
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      musicMetadata.answer = { title: "La boda", coverUrl: "https://i.scdn.co/image/abc" };
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: PLAYLIST,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      const cleared = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      assert.equal(cleared.status, 200);
      assert.deepEqual(((await cleared.json()) as Row).featureSettings, {
        whatsappPhone: null,
        playlistUrl: null,
        playlistTitle: null,
        playlistCoverUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      assert.equal(musicMetadata.asked.length, 1);
    });

    it("stores the itinerary and answers it in the owner read (F1; L3.1, L3.3)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: ITINERARY,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual((body.featureSettings as Row).itinerary, ITINERARY);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.deepEqual(stored?.itinerary, ITINERARY);

      // The owner read answers the same payload the write stored, so the editor can round-trip it.
      const read = await send("GET", `${PATH}/${draft.id}`, cookie);
      assert.equal(read.status, 200);
      assert.deepEqual(
        ((await read.json()) as { featureSettings: Row }).featureSettings.itinerary,
        ITINERARY,
      );
    });

    it("keeps the stored itinerary when a body omits it, so an older client never clears it (F1; review R3-001)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: ITINERARY,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: null,
        playlistUrl: null,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.equal(body.timeZone, "America/Tijuana");
      assert.deepEqual((body.featureSettings as Row).itinerary, ITINERARY);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.itinerary, ITINERARY);
    });

    it("clears the stored itinerary with null and with an empty list (F1; L3.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const body = (itinerary: unknown) => ({
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary,
      });
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(ITINERARY));

      for (const cleared of [null, { version: 1, items: [] }]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(cleared));

        assert.equal(response.status, 200, JSON.stringify(cleared));
        assert.equal(
          ((await response.json()) as { featureSettings: Row }).featureSettings.itinerary,
          null,
          JSON.stringify(cleared),
        );
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.itinerary, null);
      }
    });

    it("stores the gift registry, answers it in the owner read, and withholds the legacy text (F2; L4.1, L4.3)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry: GIFT_REGISTRY,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual((body.featureSettings as Row).giftRegistry, GIFT_REGISTRY);
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id)?.giftRegistry,
        GIFT_REGISTRY,
      );

      // The owner read answers the same payload the write stored, so the editor can round-trip it.
      const read = await send("GET", `${PATH}/${draft.id}`, cookie);
      assert.equal(read.status, 200);
      assert.deepEqual(
        ((await read.json()) as { featureSettings: Row }).featureSettings.giftRegistry,
        GIFT_REGISTRY,
      );
    });

    it("keeps the stored gift registry when a body omits it, so an older client never clears it (F2; L4.3)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry: GIFT_REGISTRY,
      });

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: null,
        playlistUrl: null,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.equal(body.timeZone, "America/Tijuana");
      assert.deepEqual((body.featureSettings as Row).giftRegistry, GIFT_REGISTRY);
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id)?.giftRegistry,
        GIFT_REGISTRY,
      );
    });

    it("clears the stored gift registry with null and with an empty payload (F2; L4.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const body = (giftRegistry: unknown) => ({
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry,
      });
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(GIFT_REGISTRY));

      for (const cleared of [null, { version: 1, stores: [], envelopes: false }]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(cleared));

        assert.equal(response.status, 200, JSON.stringify(cleared));
        assert.equal(
          ((await response.json()) as { featureSettings: Row }).featureSettings.giftRegistry,
          null,
          JSON.stringify(cleared),
        );
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.giftRegistry, null);
      }
    });

    it("stores the lodging, answers it in the owner read, and keeps it when a body omits it (F4; L7.1, L7.3)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        lodging: LODGING,
        reminders: null,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual((body.featureSettings as Row).lodging, LODGING);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.lodging, LODGING);

      // The owner read answers the same payload the write stored, so the editor can round-trip it.
      const read = await send("GET", `${PATH}/${draft.id}`, cookie);
      assert.equal(read.status, 200);
      assert.deepEqual(
        ((await read.json()) as { featureSettings: Row }).featureSettings.lodging,
        LODGING,
      );

      // A client built before F4 omits the field, and the stored cards stay (L7.3).
      const older = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: null,
        playlistUrl: null,
      });

      assert.equal(older.status, 200);
      assert.deepEqual(
        ((await older.json()) as { featureSettings: Row }).featureSettings.lodging,
        LODGING,
      );
    });

    it("stores the livestream, answers it in the owner read, and keeps it when a body omits it (F9; L12.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        livestream: LIVESTREAM,
        openingAnimation: true,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual((body.featureSettings as Row).livestream, LIVESTREAM);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.livestream, LIVESTREAM);

      // The owner read answers the same payload the write stored, so the editor can round-trip it.
      const read = await send("GET", `${PATH}/${draft.id}`, cookie);
      assert.equal(read.status, 200);
      assert.deepEqual(
        ((await read.json()) as { featureSettings: Row }).featureSettings.livestream,
        LIVESTREAM,
      );

      // A client built before F9 omits the field, and the stored link stays (L20).
      const older = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: null,
        playlistUrl: null,
      });

      assert.equal(older.status, 200);
      assert.deepEqual(
        ((await older.json()) as { featureSettings: Row }).featureSettings.livestream,
        LIVESTREAM,
      );

      // Null and a payload without a link both clear it.
      for (const cleared of [null, { version: 1, url: "" }]) {
        await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Mexico_City",
          whatsappPhone: null,
          playlistUrl: null,
          livestream: LIVESTREAM,
          openingAnimation: true,
        });

        const clearing = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Mexico_City",
          whatsappPhone: null,
          playlistUrl: null,
          livestream: cleared,
          openingAnimation: true,
        });

        assert.equal(clearing.status, 200, JSON.stringify(cleared));
        assert.equal(
          ((await clearing.json()) as { featureSettings: Row }).featureSettings.livestream,
          null,
          JSON.stringify(cleared),
        );
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.livestream, null);
      }
    });

    it("refuses a livestream the contract does not allow and stores nothing (F9; L12.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: "+525512345678",
        playlistUrl: null,
        livestream: LIVESTREAM,
        openingAnimation: true,
      });
      const before = structuredClone<InvitationRecordWithMusic | undefined>(
        repository.rows.find((row) => row.id === draft.id),
      );

      for (const refused of [
        { version: 2, url: LIVESTREAM.url },
        { version: 1, url: "http://www.youtube.com/watch?v=dQw4w9WgXcQ" },
        { version: 1, url: LIVESTREAM.url, note: "n".repeat(121) },
        { version: 1, url: 42 },
        "https://youtu.be/dQw4w9WgXcQ",
      ]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Tijuana",
          whatsappPhone: "+525587654321",
          playlistUrl: null,
          livestream: refused,
          openingAnimation: true,
        });

        assert.equal(response.status, 400, JSON.stringify(refused));
        const body = (await response.json()) as { code: string; issues: string[] };
        assert.equal(body.code, "INVALID_INVITATION_FEATURES");

        // A refused request stores nothing: the link, the phone, and the zone are the ones already stored.
        const stored = repository.rows.find((row) => row.id === draft.id);
        assert.deepEqual(stored?.livestream, before?.livestream);
        assert.equal(stored?.whatsappPhone, before?.whatsappPhone);
        assert.equal(stored?.timeZone, before?.timeZone);
      }
    });

    it("stores the reminder switches, answers them on the owner read, and reports the capability (F6; L9.1, L9.5)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        reminders: REMINDERS,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual((body.featureSettings as Row).reminders, REMINDERS);
      // This deployment has no provider, so the read says so and never a secret (S6, L9.5).
      assert.equal(body.remindersConfigured, false);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.reminders, REMINDERS);

      // The owner read answers the same pair the write stored, so the editor can round-trip it.
      const read = await send("GET", `${PATH}/${draft.id}`, cookie);
      assert.equal(read.status, 200);
      const readBody = (await read.json()) as Row & { remindersConfigured: boolean };
      assert.deepEqual((readBody.featureSettings as Row).reminders, REMINDERS);
      assert.equal(readBody.remindersConfigured, false);
    });

    it("keeps the stored reminder switches when a body omits them, so an older client never switches them off (F6; L9.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        reminders: REMINDERS,
      });

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: null,
        playlistUrl: null,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.equal(body.timeZone, "America/Tijuana");
      assert.deepEqual((body.featureSettings as Row).reminders, REMINDERS);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.reminders, REMINDERS);
    });

    it("clears the reminder switches with null and with a pair switched off (F6; L9.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const body = (reminders: unknown) => ({
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        reminders,
      });
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(REMINDERS));

      for (const cleared of [null, { version: 1, pendingRsvp: false, eventEve: false }]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(cleared));

        assert.equal(response.status, 200, JSON.stringify(cleared));
        assert.equal(
          ((await response.json()) as { featureSettings: Row }).featureSettings.reminders,
          null,
          JSON.stringify(cleared),
        );
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.reminders, null);
      }
    });

    it("refuses reminder switches the contract does not allow and leaves the stored ones untouched (F6; L9.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: "+525512345678",
        playlistUrl: null,
        reminders: REMINDERS,
      });
      const before = structuredClone<InvitationRecordWithMusic | undefined>(
        repository.rows.find((row) => row.id === draft.id),
      );

      for (const refused of [
        { version: 2, pendingRsvp: true, eventEve: true },
        { version: 1, pendingRsvp: "sí", eventEve: true },
        { version: 1 },
        "on",
      ]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Tijuana",
          whatsappPhone: "+525587654321",
          playlistUrl: null,
          reminders: refused,
        });

        assert.equal(response.status, 400, JSON.stringify(refused));
        const body = (await response.json()) as { code: string; issues: string[] };
        assert.equal(body.code, "INVALID_INVITATION_FEATURES");

        // A refused request stores nothing: the switches, the phone, and the zone are the ones already stored.
        const stored = repository.rows.find((row) => row.id === draft.id);
        assert.deepEqual(stored?.reminders, before?.reminders);
        assert.equal(stored?.whatsappPhone, before?.whatsappPhone);
        assert.equal(stored?.timeZone, before?.timeZone);
      }
    });

    it("stores the opening animation switch, keeps it when a body omits it, and answers it on the owner read (F10; L14.3)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const body = (openingAnimation?: unknown) => ({
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        ...(openingAnimation === undefined ? {} : { openingAnimation }),
      });

      // A new invitation plays the animation: the column's default is true (L14.3).
      const created = await send("GET", `${PATH}/${draft.id}`, cookie);
      assert.equal(created.status, 200);
      assert.equal(
        ((await created.json()) as { featureSettings: Row }).featureSettings.openingAnimation,
        true,
      );

      // The owner's switch off is stored and answered.
      const off = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(false));
      assert.equal(off.status, 200);
      assert.equal(
        ((await off.json()) as { featureSettings: Row }).featureSettings.openingAnimation,
        false,
      );
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.openingAnimation, false);

      // A body that omits the switch keeps the stored one, so a client built before F10 never turns it on or off.
      const kept = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body());
      assert.equal(kept.status, 200);
      assert.equal(
        ((await kept.json()) as { featureSettings: Row }).featureSettings.openingAnimation,
        false,
      );
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.openingAnimation, false);

      // And the switch turns back on when the owner says so.
      const on = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body(true));
      assert.equal(on.status, 200);
      assert.equal(
        ((await on.json()) as { featureSettings: Row }).featureSettings.openingAnimation,
        true,
      );
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.openingAnimation, true);
    });

    it("refuses an opening animation switch that is not a boolean and stores nothing (F10; L14.3)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const before = structuredClone<InvitationRecordWithMusic | undefined>(
        repository.rows.find((row) => row.id === draft.id),
      );

      for (const refused of ["sí", 1, null]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Tijuana",
          whatsappPhone: "+525587654321",
          playlistUrl: null,
          openingAnimation: refused,
        });

        assert.equal(response.status, 400, JSON.stringify(refused));
        assert.deepEqual(await response.json(), {
          code: "INVALID_INVITATION_FEATURES",
          issues: ["openingAnimation must be true or false"],
        });
        // A refused request stores nothing: the switch, the phone, and the zone are the ones already stored.
        const stored = repository.rows.find((row) => row.id === draft.id);
        assert.equal(stored?.openingAnimation, before?.openingAnimation);
        assert.equal(stored?.whatsappPhone, before?.whatsappPhone);
        assert.equal(stored?.timeZone, before?.timeZone);
      }
    });

    it("refuses a lodging the contract does not allow and stores nothing (F4; L7.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const before = structuredClone<InvitationRecordWithMusic | undefined>(
        repository.rows.find((row) => row.id === draft.id),
      );

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        lodging: {
          version: 1,
          hotels: [{ name: "Hotel Misión", distance: "A 5 min", bookingUrl: "http://hotel.test" }],
        },
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        code: "INVALID_INVITATION_FEATURES",
        issues: ["lodging.hotels[0].bookingUrl must be an https link of at most 500 characters"],
      });
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("refuses a gift registry the contract does not allow and stores nothing (F2; L4.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));
      const refused = {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry: {
          version: 1,
          stores: [{ name: "Liverpool", url: "http://mesaderegalos.liverpool.com.mx/1" }],
          transfer: { bank: "BBVA", holder: "Ana", clabe: "012180000123456788" },
          envelopes: "sí",
        },
      };

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, refused);

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        code: "INVALID_INVITATION_FEATURES",
        issues: [
          "giftRegistry.stores[0].url must be an https link of at most 500 characters",
          "giftRegistry.transfer.clabe must be an 18-digit CLABE with a valid control digit",
          "giftRegistry.envelopes must be true or false",
        ],
      });
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("refuses a gift registry write to an archived invitation (F2; L4.3, A2)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry: GIFT_REGISTRY,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.giftRegistry, null);
    });

    it("clears the stored playlist link with null and with an empty value (F6; S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Cancun",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      for (const playlistUrl of [null, ""]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
          timeZone: "America/Cancun",
          whatsappPhone: PHONE,
          playlistUrl,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
          livestream: null,
          openingAnimation: true,
          reminders: null,
        });

        assert.equal(response.status, 200, String(playlistUrl));
        assert.deepEqual(((await response.json()) as Row).featureSettings, {
          whatsappPhone: PHONE,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
          livestream: null,
          openingAnimation: true,
          reminders: null,
        });
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.playlistUrl, null);
      }
    });

    it("answers 400 INVALID_INVITATION_FEATURES with its issues and stores nothing (S4, S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      const refused: Array<[string, Record<string, unknown>, string[]]> = [
        [
          "a zone outside the allow-list",
          { timeZone: "Europe/Madrid", whatsappPhone: null, playlistUrl: null, itinerary: null },
          ["timeZone must be one of the supported time zones"],
        ],
        [
          "a phone it cannot normalize",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: "12345",
            playlistUrl: null,
            itinerary: null,
            giftRegistry: null,
            lodging: null,
            livestream: null,
            openingAnimation: true,
            reminders: null,
          },
          [
            "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          ],
        ],
        [
          "a phone that is not a string",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: 5512345678,
            playlistUrl: null,
            itinerary: null,
            giftRegistry: null,
            lodging: null,
            livestream: null,
            openingAnimation: true,
            reminders: null,
          },
          ["whatsappPhone must be a string or null"],
        ],
        [
          "a link that is not https",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: "http://open.spotify.com/playlist/abc",
            itinerary: null,
            giftRegistry: null,
            lodging: null,
            livestream: null,
            openingAnimation: true,
            reminders: null,
          },
          ["playlistUrl must be an https link"],
        ],
        [
          "a link on another host",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: "https://example.com/playlist/abc",
            itinerary: null,
            giftRegistry: null,
            lodging: null,
            livestream: null,
            openingAnimation: true,
            reminders: null,
          },
          ["playlistUrl must link to Spotify, Apple Music, YouTube, Deezer, or SoundCloud"],
        ],
        [
          "a link that is not a string",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: 42,
            itinerary: null,
            giftRegistry: null,
            lodging: null,
            livestream: null,
            openingAnimation: true,
            reminders: null,
          },
          ["playlistUrl must be a string or null"],
        ],
        [
          "an itinerary of another version",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: null,
            itinerary: { version: 2, items: [{ time: "17:00", title: "Misa" }] },
            giftRegistry: null,
            lodging: null,
            livestream: null,
            openingAnimation: true,
            reminders: null,
          },
          ["itinerary.version must be 1"],
        ],
        [
          "an itinerary moment outside the contract",
          {
            timeZone: "America/Mexico_City",
            whatsappPhone: null,
            playlistUrl: null,
            itinerary: {
              version: 1,
              items: [
                { time: "17:00", title: "Misa" },
                { time: "25:00", title: "" },
              ],
            },
          },
          [
            "itinerary.items[1].time must be a time between 00:00 and 23:59",
            "itinerary.items[1].title must be between 1 and 60 characters",
          ],
        ],
        [
          "every value wrong, the zone first and the playlist last",
          {
            timeZone: "not-a-zone",
            whatsappPhone: "12345",
            playlistUrl: "http://x.test",
            itinerary: null,
            giftRegistry: null,
            lodging: null,
            livestream: null,
            openingAnimation: true,
            reminders: null,
          },
          [
            "timeZone must be one of the supported time zones",
            "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
            "playlistUrl must be an https link",
          ],
        ],
      ];

      for (const [label, body, issues] of refused) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body);

        assert.equal(response.status, 400, label);
        assert.deepEqual(await response.json(), { code: "INVALID_INVITATION_FEATURES", issues });
      }
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("answers 400 for a body without a field or with an unknown field (S4, S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      for (const body of [
        {},
        { timeZone: "America/Mexico_City" },
        { whatsappPhone: null },
        // The old two-field body: `playlistUrl` is required like the other two, so the global pipe refuses it.
        { timeZone: "America/Mexico_City", whatsappPhone: null },
        {
          timeZone: "America/Mexico_City",
          whatsappPhone: null,
          playlistUrl: null,
          packageId: UNKNOWN_ID,
        },
        "not-json",
      ]) {
        const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, body);

        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("names playlistUrl when the body omits it (S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      // The client learns which field it forgot, so the refusal is actionable rather than a bare 400.
      assert.match(JSON.stringify(body), /playlistUrl/);
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps it unchanged (S7, A2)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      const response = await send("PUT", `${PATH}/${draft.id}/features`, cookie, {
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,

        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });

    it("answers 404 for another customer's invitation and for an unknown id (A4)", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id));

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("PUT", `${PATH}/${id}/features`, other.cookie, {
          timeZone: "America/Tijuana",
          whatsappPhone: PHONE,
          playlistUrl: PLAYLIST,

          itinerary: null,
          giftRegistry: null,
          lodging: null,
          livestream: null,
          openingAnimation: true,
          reminders: null,
        });

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      assert.deepEqual(
        repository.rows.find((row) => row.id === draft.id),
        before,
      );
    });
  });

  describe("access-code routes (F13; S2.13, L18.1, L18.5)", () => {
    /** A draft of the package that grants the capability, and its cookie. */
    async function protectedDraft(packageId: string = PASSWORD_PACKAGE_ID) {
      const { cookie } = await signedInCustomer();
      const created = (await (
        await send("POST", PATH, cookie, { templateVersionId: PUBLISHED_VERSION_ID, packageId })
      ).json()) as Row & { id: string; slug: string };

      return { cookie, created };
    }

    it("stores only the hash and answers whether a code is set and the new version", async () => {
      const { cookie, created } = await protectedDraft();
      const response = await send("PUT", `${PATH}/${created.id}/password`, cookie, {
        password: "clave-familiar",
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { passwordProtected: true, passwordVersion: 1 });
      // The value the port received is the encoded scrypt hash, never the code, and the answer never carries either.
      const stored = repository.passwordHashes.get(created.id);
      assert.ok(stored);
      assert.equal(stored.startsWith("scrypt$"), true);
      assert.equal(stored.includes("clave-familiar"), false);

      // The owner's read now states that a code is set, and still answers no code and no hash.
      const read = await send("GET", `${PATH}/${created.id}`, cookie);
      const body = (await read.json()) as Row;
      assert.equal(body.passwordProtected, true);
      assert.equal(JSON.stringify(body).includes("scrypt$"), false);
      assert.equal(JSON.stringify(body).includes("clave-familiar"), false);
    });

    it("raises the version on every set and on the removal, and opens the invitation again", async () => {
      const { cookie, created } = await protectedDraft();
      const path = `${PATH}/${created.id}/password`;

      assert.deepEqual(await (await send("PUT", path, cookie, { password: "primera" })).json(), {
        passwordProtected: true,
        passwordVersion: 1,
      });
      assert.deepEqual(await (await send("PUT", path, cookie, { password: "segunda" })).json(), {
        passwordProtected: true,
        passwordVersion: 2,
      });

      const removed = await send("DELETE", path, cookie);
      assert.equal(removed.status, 200);
      assert.deepEqual(await removed.json(), { passwordProtected: false, passwordVersion: 3 });
      assert.equal(repository.passwordHashes.has(created.id), false);
      assert.equal(
        ((await (await send("GET", `${PATH}/${created.id}`, cookie)).json()) as Row)
          .passwordProtected,
        false,
      );

      // Removing a code that is not set changes no data and still raises the version.
      assert.deepEqual(await (await send("DELETE", path, cookie)).json(), {
        passwordProtected: false,
        passwordVersion: 4,
      });
    });

    it("refuses a value the domain refuses, and stores nothing", async () => {
      const { cookie, created } = await protectedDraft();

      // The domain's own refusals: too short, too long, and a control character the owner cannot type.
      for (const password of ["abc", "a".repeat(41), "clave\u0000familiar"]) {
        const response = await send("PUT", `${PATH}/${created.id}/password`, cookie, { password });

        assert.equal(response.status, 400, JSON.stringify(password));
        const body = (await response.json()) as Row;
        assert.equal(body.code, "INVALID_INVITATION_PASSWORD");
        assert.ok(Array.isArray(body.issues));
      }
      // A value that is not a string, and a missing field, are malformed requests the global pipe refuses.
      for (const body of [{ password: 42 }, { password: null }, {}]) {
        assert.equal(
          (await send("PUT", `${PATH}/${created.id}/password`, cookie, body)).status,
          400,
          JSON.stringify(body),
        );
      }
      assert.equal(repository.passwordHashes.has(created.id), false);
    });

    it("refuses a pinned package that does not grant PASSWORD_PROTECTION (L18.5)", async () => {
      const { cookie, created } = await protectedDraft(ACTIVE_PACKAGE_ID);
      const response = await send("PUT", `${PATH}/${created.id}/password`, cookie, {
        password: "clave-familiar",
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "PASSWORD_PROTECTION_NOT_AVAILABLE" });
      assert.equal(repository.passwordHashes.has(created.id), false);
    });

    it("refuses an archived invitation and another customer's invitation", async () => {
      const { cookie, created } = await protectedDraft();
      const other = await signedInCustomer();

      assert.equal((await send("POST", `${PATH}/${created.id}/archive`, cookie)).status, 200);
      const archived = await send("PUT", `${PATH}/${created.id}/password`, cookie, {
        password: "clave-familiar",
      });
      assert.equal(archived.status, 409);
      assert.deepEqual(await archived.json(), { code: "INVITATION_NOT_EDITABLE" });
      assert.equal((await send("DELETE", `${PATH}/${created.id}/password`, cookie)).status, 409);

      const foreign = await protectedDraft();
      for (const method of ["PUT", "DELETE"]) {
        const response = await send(
          method,
          `${PATH}/${foreign.created.id}/password`,
          other.cookie,
          method === "PUT" ? { password: "clave-familiar" } : undefined,
        );
        assert.equal(response.status, 404, method);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      assert.equal(repository.passwordHashes.has(foreign.created.id), false);
    });

    it("refuses a malformed id with the controller's own 400, so no port ever sees it", async () => {
      const { cookie } = await signedInCustomer();

      for (const method of ["PUT", "DELETE"]) {
        const response = await send(
          method,
          `${PATH}/not-a-uuid/password`,
          cookie,
          method === "PUT" ? { password: "clave-familiar" } : undefined,
        );

        assert.equal(response.status, 400, method);
      }
    });
  });

  describe("custom address routes (F11; S2.11, L15.1-L15.3)", () => {
    // Every test names its own address: the in-memory store is shared by the whole suite, so a repeated address
    // would be a real conflict here just as it is in PostgreSQL (L15.1).
    const AVAILABLE = "valentina-xv";

    /** The address check of one invitation, with the query encoded as the editor sends it. */
    const checkPath = (id: string, slug: string) =>
      `${PATH}/${id}/slug-availability?slug=${encodeURIComponent(slug)}`;

    beforeEach(() => {
      slugAvailabilityLimiter.allow = true;
      slugAvailabilityLimiter.consumed.length = 0;
    });

    it("answers available for a free address and spends one check of the owner's limit", async () => {
      const { userId, cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("GET", checkPath(draft.id, AVAILABLE), cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { slug: AVAILABLE, status: "available" });
      assert.deepEqual(slugAvailabilityLimiter.consumed, [userId]);
    });

    it("answers taken for another invitation's address and for a previous one, naming nobody (L15.3)", async () => {
      const first = await signedInCustomer();
      const mine = await createDraft(first.cookie);
      const other = await signedInCustomer();
      const theirs = await createDraft(other.cookie);
      // Another owner renamed their invitation after saving this address.
      for (const slug of ["fiesta-uno", "fiesta-dos"]) {
        assert.equal(
          (await send("PUT", `${PATH}/${theirs.id}/slug`, other.cookie, { slug })).status,
          200,
        );
      }

      const current = await send("GET", checkPath(mine.id, "fiesta-dos"), first.cookie);
      const previous = await send("GET", checkPath(mine.id, "fiesta-uno"), first.cookie);

      assert.deepEqual(await current.json(), { slug: "fiesta-dos", status: "taken" });
      assert.deepEqual(await previous.json(), { slug: "fiesta-uno", status: "taken" });
    });

    it("spends one check for every request of the owner, an invalid or reserved address included (L15.3)", async () => {
      const { userId, cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const [slug, status] of [
        ["boda--2027", "invalid"],
        ["Valentina", "invalid"],
        ["ab", "invalid"],
        ["admin", "reserved"],
        ["invitame", "reserved"],
      ] as const) {
        const response = await send("GET", checkPath(draft.id, slug), cookie);

        assert.equal(response.status, 200, slug);
        assert.deepEqual(await response.json(), { slug, status }, slug);
      }
      // The limit is counted first (R4-003): a request the rule itself answers still spends one of the owner's slots,
      // so the check is never free.
      assert.deepEqual(slugAvailabilityLimiter.consumed, [userId, userId, userId, userId, userId]);
    });

    it("refuses an unknown invitation before anything is read, so no check is spent (F12; L17.4, R4-003)", async () => {
      const { userId, cookie } = await signedInCustomer();

      const response = await send("GET", checkPath(UNKNOWN_ID, "valentina-xv"), cookie);

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      // Since F12 the access resolver answers before the handler, so an id nobody may reach is refused without reading
      // the address or spending one of the caller's checks. The property R4-003 protects still holds, one step earlier:
      // an invitation the caller does not own is never a way to learn which addresses are held, free or not.
      assert.deepEqual(slugAvailabilityLimiter.consumed, []);
      assert.equal(await repository.countSlugAliases(UNKNOWN_ID), 0);
      assert.equal(userId.length > 0, true);
    });

    it("answers 429 for the 121st check of the window, the invalid ones counted first (R4-003)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      slugAvailabilityLimiter.max = SLUG_AVAILABILITY_RATE_LIMIT.max;

      try {
        for (let check = 1; check <= SLUG_AVAILABILITY_RATE_LIMIT.max; check += 1) {
          const accepted = await send("GET", checkPath(draft.id, "boda--2027"), cookie);

          assert.equal(accepted.status, 200, `check ${check}`);
        }

        const refused = await send("GET", checkPath(draft.id, "boda--2027"), cookie);

        assert.equal(refused.status, 429);
        assert.deepEqual(await refused.json(), { code: "SLUG_AVAILABILITY_RATE_LIMITED" });
      } finally {
        slugAvailabilityLimiter.max = null;
      }
    });

    it("answers available for the owner's own current address, so saving it changes nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("GET", checkPath(draft.id, draft.slug), cookie);

      assert.deepEqual(await response.json(), { slug: draft.slug, status: "available" });
    });

    it("answers 429 SLUG_AVAILABILITY_RATE_LIMITED once the owner is over the check limit", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      slugAvailabilityLimiter.allow = false;

      const response = await send("GET", checkPath(draft.id, AVAILABLE), cookie);

      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), { code: "SLUG_AVAILABILITY_RATE_LIMITED" });
    });

    it("answers 404 for another customer's invitation and for an unknown id, and 400 for an id that is not a UUID", async () => {
      const { cookie } = await signedInCustomer();
      const other = await signedInCustomer();
      const theirs = await createDraft(other.cookie);

      for (const [id, asking] of [
        [theirs.id, cookie],
        [UNKNOWN_ID, cookie],
      ] as const) {
        const response = await send("GET", checkPath(id, AVAILABLE), asking);

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      const malformed = await send("GET", `${PATH}/not-a-uuid/slug-availability?slug=x`, cookie);
      assert.equal(malformed.status, 400);
    });

    it("renames the address, answers the owned invitation, and keeps the previous address resolving (L15.2, L15.3)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      assert.equal(
        (await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } }))
          .status,
        200,
      );
      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);

      const response = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug: AVAILABLE });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.slug, AVAILABLE);
      // The previous address is stored as an alias, and the current one answers as before.
      assert.equal(repository.aliases.get(draft.slug), draft.id);

      const alias = await send("GET", `/public/invitations/${draft.slug}`);
      assert.equal(alias.status, 200);
      const aliasBody = (await alias.json()) as Row;
      assert.equal(aliasBody.slug, AVAILABLE);
      assert.equal(aliasBody.redirectTo, AVAILABLE);

      const current = await send("GET", `/public/invitations/${AVAILABLE}`);
      const currentBody = (await current.json()) as Row;
      assert.equal(currentBody.slug, AVAILABLE);
      assert.equal(currentBody.redirectTo, null);
    });

    it("saves the same address without storing an alias", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const kept = repository.aliases.size;
      const response = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug: draft.slug });

      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as Row).slug, draft.slug);
      assert.equal(repository.aliases.size, kept);
    });

    it("answers 400 INVALID_INVITATION_SLUG with its issue for an address the rule refuses", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const kept = repository.aliases.size;
      for (const slug of ["boda--2027", "Valentina", "ab", "-boda"]) {
        const response = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug });

        assert.equal(response.status, 400, slug);
        assert.deepEqual(await response.json(), {
          code: "INVALID_INVITATION_SLUG",
          issues: [
            "The address must be 3 to 40 characters of lower-case letters, digits, and inner hyphens.",
          ],
        });
      }
      assert.equal(repository.aliases.size, kept);
    });

    it("answers 409 INVITATION_SLUG_RESERVED for a route or product word (L15.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const slug of ["admin", "cuenta", "invitame", "public", "media"]) {
        const response = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug });

        assert.equal(response.status, 409, slug);
        assert.deepEqual(await response.json(), { code: "INVITATION_SLUG_RESERVED" });
      }
    });

    it("answers 409 INVITATION_SLUG_TAKEN for an address another invitation holds, without renaming", async () => {
      const mine = await signedInCustomer();
      const draft = await createDraft(mine.cookie);
      const other = await signedInCustomer();
      const theirs = await createDraft(other.cookie);
      assert.equal(
        (await send("PUT", `${PATH}/${theirs.id}/slug`, other.cookie, { slug: "playa-uno" }))
          .status,
        200,
      );

      const response = await send("PUT", `${PATH}/${draft.id}/slug`, mine.cookie, {
        slug: "playa-uno",
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_SLUG_TAKEN" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.slug, draft.slug);
    });

    it("answers 409 INVITATION_SLUG_TAKEN for a previous address, which is final (L15.1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      assert.equal(
        (await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug: "mar-tres" })).status,
        200,
      );

      const response = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug: draft.slug });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_SLUG_TAKEN" });
    });

    it("answers 409 INVITATION_SLUG_RENAME_LIMIT for the sixth rename and keeps the fifth (L15.2)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const slug of ["casa-uno", "casa-dos", "casa-tres", "casa-cuatro", "casa-cinco"]) {
        const renamed = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug });

        assert.equal(renamed.status, 200, slug);
        assert.equal(((await renamed.json()) as Row).slug, slug);
      }

      const refused = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug: "casa-seis" });

      assert.equal(refused.status, 409);
      assert.deepEqual(await refused.json(), { code: "INVITATION_SLUG_RENAME_LIMIT" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.slug, "casa-cinco");
    });

    it("states the real renames left in every owned answer, never the product bound (R3-001)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const [slug, remaining] of [
        ["nube-uno", 4],
        ["nube-dos", 3],
      ] as const) {
        const renamed = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug });

        assert.equal(renamed.status, 200, slug);
        assert.equal(((await renamed.json()) as Row).slugRenamesRemaining, remaining, slug);
      }

      // Every route that answers the owned invitation states the same number as the owner's own read, so a save made
      // on another tab never tells the editor that the whole allowance is left again.
      const saves: Array<[string, Row]> = [
        ["content", { content: { title: "Ana" } }],
        ["features", { timeZone: "America/Mexico_City", whatsappPhone: null, playlistUrl: null }],
      ];
      for (const [route, body] of saves) {
        const response = await send("PUT", `${PATH}/${draft.id}/${route}`, cookie, body);

        assert.equal(response.status, 200, route);
        assert.equal(((await response.json()) as Row).slugRenamesRemaining, 3, route);
      }

      const read = await send("GET", `${PATH}/${draft.id}`, cookie);
      assert.equal(((await read.json()) as Row).slugRenamesRemaining, 3);
    });

    it("answers 429 over the address limit for a rename and changes nothing (R1)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      slugAvailabilityLimiter.max = 2;

      try {
        for (const slug of ["sol-uno", "sol-dos"]) {
          const renamed = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug });

          assert.equal(renamed.status, 200, slug);
        }
        const kept = new Map(repository.aliases);

        const refused = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug: "sol-tres" });

        assert.equal(refused.status, 429);
        assert.deepEqual(await refused.json(), { code: "SLUG_AVAILABILITY_RATE_LIMITED" });
        assert.equal(repository.rows.find((row) => row.id === draft.id)?.slug, "sol-dos");
        assert.deepEqual(repository.aliases, kept);
      } finally {
        slugAvailabilityLimiter.max = null;
      }
    });

    it("answers 409 INVITATION_SLUG_RENAME_CONFLICT when a concurrent rename moved the same invitation (R4-002)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      repository.renameConflict = true;

      try {
        const response = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, {
          slug: "luna-uno",
        });

        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "INVITATION_SLUG_RENAME_CONFLICT" });
      } finally {
        repository.renameConflict = false;
      }
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps its address", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      assert.equal((await send("POST", `${PATH}/${draft.id}/archive`, cookie)).status, 200);

      const response = await send("PUT", `${PATH}/${draft.id}/slug`, cookie, { slug: AVAILABLE });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.slug, draft.slug);
    });

    it("answers 404 for another customer's invitation and for an unknown id, and 400 for a body the pipe refuses", async () => {
      const { cookie } = await signedInCustomer();
      const other = await signedInCustomer();
      const theirs = await createDraft(other.cookie);

      for (const [id, asking] of [
        [theirs.id, cookie],
        [UNKNOWN_ID, cookie],
      ] as const) {
        const response = await send("PUT", `${PATH}/${id}/slug`, asking, { slug: AVAILABLE });

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }

      const mine = await createDraft(cookie);
      for (const body of [{}, { slug: AVAILABLE, extra: 1 }, "not-an-object"]) {
        const response = await send("PUT", `${PATH}/${mine.id}/slug`, cookie, body);

        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(repository.rows.find((row) => row.id === mine.id)?.slug, mine.slug);
    });
  });

  describe("place routes (S1, S2, S3)", () => {
    const SUGGESTION: PlacePoint = {
      label: "Parroquia de San José, Calle Hidalgo 12, Querétaro, Querétaro",
      lat: 20.5888,
      lng: -100.3899,
    };

    /** A draft whose pinned version declares the address fields a place may belong to (S2). */
    async function addressDraft(cookie: string) {
      const response = await send("POST", PATH, cookie, {
        templateVersionId: PLACE_VERSION_ID,
        packageId: FEATURE_PACKAGE_ID,
      });

      assert.equal(response.status, 201);
      return (await response.json()) as Row & { id: string };
    }

    /** The answer of the owner limit and of the geocoder, back to their defaults (S2). */
    beforeEach(() => {
      placeSearch.answer = [];
      placeSearch.asked.length = 0;
      placeSearchLimiter.allow = true;
      placeSearchLimiter.consumed.length = 0;
    });

    it("answers the geocoder's suggestions for the trimmed text and counts one search", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);
      placeSearch.answer = [SUGGESTION];

      const response = await send(
        "GET",
        `${PATH}/${draft.id}/places/search?q=${encodeURIComponent("  Parroquia de San José  ")}`,
        cookie,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), [SUGGESTION]);
      assert.deepEqual(placeSearch.asked, ["Parroquia de San José"]);
      assert.equal(placeSearchLimiter.consumed.length, 1);
    });

    it("answers 400 INVALID_PLACE_QUERY for a missing, too short, or too long query, asking nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);

      for (const query of ["", "?q=ab", `?q=${"a".repeat(121)}`]) {
        const response = await send("GET", `${PATH}/${draft.id}/places/search${query}`, cookie);

        assert.equal(response.status, 400, query);
        const body = (await response.json()) as { code: string; issues: string[] };
        assert.equal(body.code, "INVALID_PLACE_QUERY");
        assert.equal(body.issues.length, 1);
      }
      assert.deepEqual(placeSearch.asked, []);
      assert.deepEqual(placeSearchLimiter.consumed, []);
    });

    it("answers 429 PLACE_SEARCH_RATE_LIMITED once the owner is over the limit", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);
      placeSearchLimiter.allow = false;

      const response = await send(
        "GET",
        `${PATH}/${draft.id}/places/search?q=${encodeURIComponent("Avenida Siempreviva 742")}`,
        cookie,
      );

      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), { code: "PLACE_SEARCH_RATE_LIMITED" });
      assert.deepEqual(placeSearch.asked, []);
    });

    it("answers a repeated query from the cache, so the geocoder is asked once", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);
      placeSearch.answer = [SUGGESTION];
      const target = `${PATH}/${draft.id}/places/search?q=${encodeURIComponent("Calle Hidalgo 12")}`;

      const first = await send("GET", target, cookie);
      const second = await send("GET", target, cookie);

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(await second.json(), [SUGGESTION]);
      assert.deepEqual(placeSearch.asked, ["Calle Hidalgo 12"]);
      // The cached answer costs the owner nothing: retyping the same address never spends the limit.
      assert.equal(placeSearchLimiter.consumed.length, 1);
    });

    it("answers 404 for another owner's invitation and for an unknown id, asking nothing", async () => {
      const owner = await signedInCustomer();
      const stranger = await signedInCustomer();
      const draft = await addressDraft(owner.cookie);

      for (const [cookie, id] of [
        [stranger.cookie, draft.id],
        [owner.cookie, UNKNOWN_ID],
      ] as const) {
        const response = await send(
          "GET",
          `${PATH}/${id}/places/search?q=${encodeURIComponent("Querétaro")}`,
          cookie,
        );

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      // A malformed id is refused by the global pipe, exactly like every other owner route.
      assert.equal(
        (
          await send(
            "GET",
            `${PATH}/not-a-uuid/places/search?q=${encodeURIComponent("Querétaro")}`,
            owner.cookie,
          )
        ).status,
        400,
      );
      assert.deepEqual(placeSearch.asked, []);
    });

    it("stores the chosen point and answers the owned invitation with it", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/places/address`, cookie, {
        label: SUGGESTION.label,
        lat: SUGGESTION.lat,
        lng: SUGGESTION.lng,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row & { places: Record<string, PlacePoint> };
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual(body.places, { address: SUGGESTION });
    });

    it("replaces the point of the same field instead of adding another", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);
      const moved = { ...SUGGESTION, label: "Otra parroquia", lat: 19.4326, lng: -99.1332 };

      await send("PUT", `${PATH}/${draft.id}/places/address`, cookie, SUGGESTION);
      const response = await send("PUT", `${PATH}/${draft.id}/places/address`, cookie, moved);

      assert.equal(response.status, 200);
      assert.deepEqual(((await response.json()) as Row).places, { address: moved });
    });

    it("refuses a field outside the pinned schema's address fields, and a point outside its bounds", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);

      for (const [field, body] of [
        ["receptionPlace", SUGGESTION],
        ["title", SUGGESTION],
        ["address", { ...SUGGESTION, lat: 91 }],
        ["address", { ...SUGGESTION, lng: -181 }],
        ["address", { ...SUGGESTION, label: "" }],
      ] as const) {
        const response = await send("PUT", `${PATH}/${draft.id}/places/${field}`, cookie, body);

        assert.equal(response.status, 400, field);
        const refused = (await response.json()) as { code: string; issues: string[] };
        assert.equal(refused.code, "INVALID_INVITATION_PLACE");
        assert.ok(refused.issues.length > 0);
      }

      // A body that does not state the whole point is a malformed request (the global pipe).
      assert.equal(
        (
          await send("PUT", `${PATH}/${draft.id}/places/address`, cookie, {
            label: "Solo la etiqueta",
          })
        ).status,
        400,
      );
      assert.deepEqual(
        ((await send("GET", `${PATH}/${draft.id}`, cookie).then((r) => r.json())) as Row).places,
        {},
      );
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation, and 404 for a foreign one", async () => {
      const { cookie } = await signedInCustomer();
      const stranger = await signedInCustomer();
      const draft = await addressDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const archived = await send("PUT", `${PATH}/${draft.id}/places/address`, cookie, SUGGESTION);
      assert.equal(archived.status, 409);
      assert.deepEqual(await archived.json(), { code: "INVITATION_NOT_EDITABLE" });

      const foreign = await send(
        "PUT",
        `${PATH}/${draft.id}/places/address`,
        stranger.cookie,
        SUGGESTION,
      );
      assert.equal(foreign.status, 404);
      assert.deepEqual(await foreign.json(), { code: "INVITATION_NOT_FOUND" });
    });

    it("clears a stored point and leaves the address text alone", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await addressDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/places/ceremonyAddress`, cookie, SUGGESTION);

      const response = await send("DELETE", `${PATH}/${draft.id}/places/ceremonyAddress`, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(((await response.json()) as Row).places, {});
      assert.equal((await send("DELETE", `${PATH}/${draft.id}/places/title`, cookie)).status, 400);
    });
  });

  describe("POST /invitations/:id/archive", () => {
    it("archives a DRAFT and answers 200 with the summary", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), SUMMARY_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.status, "ARCHIVED");
      assert.equal(new Date(String(body.archivedAt)).toISOString(), body.archivedAt);
      assert.equal(body.ownerId, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.ok(stored?.archivedAt);
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for a repeated archive", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
    });

    it("answers 404 for another customer's invitation and keeps it a DRAFT", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, other.cookie);

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.status, "DRAFT");
    });
  });

  describe("POST /invitations/:id/publish", () => {
    /** A draft that satisfies the pinned schema, so readiness passes and only the transition is observed. */
    async function publishableDraft(cookie: string) {
      const draft = await createDraft(cookie);
      const filled = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Cumpleaños de Ana" },
      });
      assert.equal(filled.status, 200);
      return draft;
    }

    it("publishes a ready DRAFT and answers 200 with the owned invitation and its publishedAt", async () => {
      const { userId, cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      const asked = paymentGate.asked;

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.expiresAt, undefined, "Milestone 5 never exposes an expiry (S8)");
      assert.equal(body.status, "PUBLISHED");
      assert.equal(new Date(String(body.publishedAt)).toISOString(), body.publishedAt);
      assert.deepEqual(body.missingRequiredFields, []);
      assert.equal(paymentGate.asked, asked + 1, "the payment gate is asked once (S6)");

      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.ok(stored);
      assert.equal(stored.ownerId, userId);
      assert.equal(stored.status, "PUBLISHED");
      assert.equal(stored.publishedAt?.toISOString(), body.publishedAt);
    });

    it("answers 409 INVITATION_NOT_PUBLISHABLE with its issues for an incomplete draft, and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        code: "INVITATION_NOT_PUBLISHABLE",
        issues: ["content.title is required to publish"],
      });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 409 INVITATION_ALREADY_PUBLISHED for a repeated publish", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      const first = await send("POST", `${PATH}/${draft.id}/publish`, cookie);
      assert.equal(first.status, 200);
      const publishedAt = ((await first.json()) as Row).publishedAt;

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_PUBLISHED" });
      assert.equal(
        repository.rows.find((row) => row.id === draft.id)?.publishedAt?.toISOString(),
        publishedAt,
        "the first publishedAt is kept",
      );
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for an archived invitation, and keeps it archived", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      assert.equal((await send("POST", `${PATH}/${draft.id}/archive`, cookie)).status, 200);

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 402 INVITATION_PAYMENT_REQUIRED with the gate's reason and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      paymentGate.refusalReason = "SUBSCRIPTION_REQUIRED";

      try {
        const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

        assert.equal(response.status, 402);
        assert.deepEqual(await response.json(), {
          code: "INVITATION_PAYMENT_REQUIRED",
          reason: "SUBSCRIPTION_REQUIRED",
        });
        const stored = repository.rows.find((row) => row.id === draft.id);
        assert.equal(stored?.status, "DRAFT");
        assert.equal(stored?.publishedAt, null);
      } finally {
        paymentGate.refusalReason = null;
      }
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await publishableDraft(owner.cookie);

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("POST", `${PATH}/${id}/publish`, other.cookie);

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });
  });

  describe("POST /invitations/:id/unpublish", () => {
    /** Publishes through the API, so the unpublish test starts from a row the transitions really produced. */
    async function publishedDraft(cookie: string) {
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      return draft;
    }

    it("returns a PUBLISHED invitation to DRAFT and answers 200 with the summary", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishedDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), SUMMARY_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.publishedAt, null);
      assert.equal(body.archivedAt, null);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.expiresAt, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 409 INVITATION_NOT_PUBLISHED for a draft that was never published, and changes nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_PUBLISHED" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.status, "DRAFT");
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for an archived invitation, and keeps it archived", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishedDraft(cookie);
      assert.equal((await send("POST", `${PATH}/${draft.id}/archive`, cookie)).status, 200);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await publishedDraft(owner.cookie);
      const publishedAt = repository.rows.find((row) => row.id === draft.id)?.publishedAt;

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("POST", `${PATH}/${id}/unpublish`, other.cookie);

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "PUBLISHED");
      assert.equal(stored?.publishedAt, publishedAt);
    });
  });

  describe("GET /public/invitations/:slug", () => {
    const PUBLIC_PATH = "/public/invitations";
    /** Every key a guest receives (A7, S4): nothing else may appear. */
    const PUBLIC_KEYS = [
      "componentKey",
      "configuration",
      "content",
      "expired",
      "features",
      "hiddenFields",
      "places",
      "publishedAt",
      // The current address a guest reached through a previous one (F11; L15.3), null for the current one.
      "redirectTo",
      "slug",
      "timeZone",
    ];
    /** Everything a public body must never carry: owner, package, price, status, ids, and the expiry (A7, S8). */
    const PRIVATE_KEYS = [
      "archivedAt",
      "createdAt",
      "expiresAt",
      "id",
      "missingRequiredFields",
      "ownerId",
      "packageId",
      "status",
      "templateVersionId",
      "updatedAt",
    ];

    /**
     * A stored row inserted directly, because the public read is the only thing under test here: the owner
     * routes already write these states. `content` keeps one undeclared key (`subtitle`), so the projection
     * that drops it is observed (A7).
     */
    function seed(overrides: {
      slug: string;
      status: InvitationStatus;
      templateVersionId?: string;
      packageId?: string;
      expiresAt?: Date | null;
      timeZone?: string;
      whatsappPhone?: string | null;
      playlistUrl?: string | null;
      playlistTitle?: string | null;
      playlistCoverUrl?: string | null;
      itinerary?: InvitationItinerary | null;
      giftRegistry?: InvitationGiftRegistry | null;
      lodging?: InvitationLodging | null;
      livestream?: InvitationLivestream | null;
      openingAnimation?: boolean;
      reminders?: InvitationReminders | null;
      rsvpDeadline?: Date | null;
      rsvpPartyLimit?: number;
      places?: Record<string, { label: string; lat: number; lng: number }>;
      content?: Record<string, unknown>;
    }): InvitationRecordWithMusic {
      const at = new Date(Date.UTC(2026, 9, 12, 9, 0, 0));
      const row: InvitationRecordWithMusic = {
        id: randomUUID(),
        ownerId: randomUUID(),
        templateVersionId: overrides.templateVersionId ?? PUBLISHED_VERSION_ID,
        packageId: overrides.packageId ?? ACTIVE_PACKAGE_ID,
        slug: overrides.slug,
        status: overrides.status,
        content: overrides.content ?? {
          title: "Cumpleaños de Ana",
          subtitle: "una nota que el esquema no declara",
        },
        timeZone: overrides.timeZone ?? "America/Mexico_City",
        whatsappPhone: overrides.whatsappPhone ?? null,
        playlistUrl: overrides.playlistUrl ?? null,
        playlistTitle: overrides.playlistTitle ?? null,
        playlistCoverUrl: overrides.playlistCoverUrl ?? null,
        itinerary: overrides.itinerary ?? null,
        giftRegistry: overrides.giftRegistry ?? null,
        lodging: overrides.lodging ?? null,
        livestream: overrides.livestream ?? null,
        openingAnimation: overrides.openingAnimation ?? true,
        reminders: overrides.reminders ?? null,
        // The fixture stores no access code; the gate is what the F13 suite proves.
        passwordProtected: false,
        rsvpDeadline: overrides.rsvpDeadline ?? null,
        rsvpPartyLimit: overrides.rsvpPartyLimit ?? 4,
        places: overrides.places ?? {},
        archivedAt: overrides.status === "ARCHIVED" ? at : null,
        publishedAt: overrides.status === "PUBLISHED" ? at : null,
        firstPublishedAt: overrides.status === "PUBLISHED" ? at : null,
        expiresAt: overrides.expiresAt ?? null,
        createdAt: at,
        updatedAt: at,
      };
      repository.rows.push(row);
      return row;
    }

    it("answers exactly the public projection, without any session", async () => {
      const row = seed({ slug: "invitacion-k7m2qx", status: "PUBLISHED" });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.equal(body.slug, row.slug);
      assert.equal(body.componentKey, RENDERER);
      assert.deepEqual(body.configuration, { componentKey: RENDERER });
      // Only the keys the pinned schema declares; the stored `subtitle` never reaches a guest (A7).
      assert.deepEqual(body.content, { title: "Cumpleaños de Ana" });
      // The pinned schema of this fixture declares no omitted section, so the page hides no block (S8.3).
      assert.deepEqual(body.hiddenFields, []);
      assert.equal(body.timeZone, "America/Mexico_City");
      // The fixture's package includes no catalog feature, so only the calendar is left (S4).
      assert.deepEqual(body.features, {
        countdown: false,
        map: false,
        calendar: true,
        whatsapp: null,
        music: null,
        itinerary: null,
        giftRegistry: false,
        giftRegistryDetails: null,
        lodging: null,
        livestream: null,
        openingAnimation: false,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
      assert.equal(new Date(String(body.publishedAt)).toISOString(), body.publishedAt);
      for (const key of PRIVATE_KEYS) {
        assert.equal(body[key], undefined, key);
      }
      assert.equal(
        JSON.stringify(body).includes(row.ownerId),
        false,
        "the owner id never reaches a guest",
      );
      assert.equal(response.headers.get("cache-control"), "no-store");
    });

    it("serves the same page with a valid session and with a forged cookie, never reading one", async () => {
      const { cookie } = await signedInCustomer();
      const row = seed({ slug: "invitacion-cookie", status: "PUBLISHED" });

      for (const header of [
        undefined,
        `${SESSION_COOKIE}=forged.value`,
        `${cookie.slice(0, -4)}AAAA`,
        cookie,
      ]) {
        const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`, header);

        assert.equal(response.status, 200, String(header));
        assert.deepEqual(Object.keys((await response.json()) as Row).sort(), PUBLIC_KEYS);
      }
    });

    it("answers one identical uncacheable 404 for a malformed, unknown, draft, archived, or unrenderable slug (A3)", async () => {
      const cases: Array<[string, string]> = [
        ["malformed", "Invitacion-K7M2QX"],
        ["unknown", "invitacion-never0"],
        ["draft", seed({ slug: "invitacion-draft0", status: "DRAFT" }).slug],
        ["archived", seed({ slug: "invitacion-archiv", status: "ARCHIVED" }).slug],
        [
          "unregistered renderer",
          seed({
            slug: "invitacion-norend",
            status: "PUBLISHED",
            templateVersionId: UNRENDERABLE_VERSION_ID,
          }).slug,
        ],
        [
          "pinned version missing",
          seed({ slug: "invitacion-novers", status: "PUBLISHED", templateVersionId: UNKNOWN_ID })
            .slug,
        ],
      ];
      const answers = new Map<string, Row>();

      for (const [label, slug] of cases) {
        const response = await send("GET", `${PUBLIC_PATH}/${slug}`);
        answers.set(label, {
          status: response.status,
          body: await response.json(),
          cacheControl: response.headers.get("cache-control"),
        });
      }

      const [expected] = [...answers.values()];
      assert.deepEqual(expected, {
        status: 404,
        body: { code: "PUBLIC_INVITATION_NOT_FOUND" },
        cacheControl: "no-store",
      });
      for (const [label, answer] of answers) {
        assert.deepEqual(answer, expected, label);
      }
    });

    it("logs one structured line for a renderer the API does not know, with no content and no owner", async () => {
      const row = seed({
        slug: "invitacion-norend2",
        status: "PUBLISHED",
        templateVersionId: UNRENDERABLE_VERSION_ID,
      });
      const recorded: unknown[][] = [];
      const spy = mock.method(Logger.prototype, "warn", (...args: unknown[]) => {
        recorded.push(args);
      });

      try {
        const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
      } finally {
        spy.mock.restore();
      }

      const lines = recorded.filter(
        ([first]) =>
          (first as { event?: string } | undefined)?.event === "public-invitation-not-renderable",
      );
      assert.equal(lines.length, 1, "the fault is reported once");
      const event = lines[0]?.[0] as Row;
      assert.deepEqual(Object.keys(event).sort(), ["componentKey", "event", "slug"]);
      assert.equal(event.componentKey, UNREGISTERED_RENDERER);
      assert.equal(event.slug, row.slug);
      const text = JSON.stringify(event);
      assert.equal(text.includes(row.ownerId), false, "the owner is never logged");
      assert.equal(text.includes("Cumpleaños"), false, "the content is never logged");
    });

    it("keeps an expired invitation visible read-only and flags it, instead of answering 404 (S2, T3)", async () => {
      const expired = seed({
        slug: "invitacion-expird1",
        status: "PUBLISHED",
        expiresAt: new Date(Date.now() - 1_000),
      });
      const live = seed({ slug: "invitacion-live001", status: "PUBLISHED" });

      const expiredResponse = await send("GET", `${PUBLIC_PATH}/${expired.slug}`);
      const liveResponse = await send("GET", `${PUBLIC_PATH}/${live.slug}`);

      assert.equal(expiredResponse.status, 200);
      const expiredBody = (await expiredResponse.json()) as Row;
      assert.deepEqual(Object.keys(expiredBody).sort(), PUBLIC_KEYS);
      assert.equal(expiredBody.expired, true);
      // The guest still reads the whole invitation: only the RSVP closed (S2).
      assert.equal(expiredBody.slug, expired.slug);
      assert.deepEqual(expiredBody.content, { title: "Cumpleaños de Ana" });
      assert.equal(expiredResponse.headers.get("cache-control"), "no-store");

      assert.equal(liveResponse.status, 200);
      assert.equal(((await liveResponse.json()) as Row).expired, false);
    });

    it("never answers the expiry instant itself, only the flag it decided (S1, S2)", async () => {
      const row = seed({
        slug: "invitacion-expird2",
        status: "PUBLISHED",
        expiresAt: new Date(Date.now() - 1_000),
      });

      const body = (await (await send("GET", `${PUBLIC_PATH}/${row.slug}`)).json()) as Row;

      assert.equal(body.expiresAt, undefined);
      assert.equal(body.expired, true);
    });

    it("answers the time zone and the gated features, and nothing about the package (F1; S4)", async () => {
      const row = seed({
        slug: "invitacion-feat01",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.equal(body.timeZone, "America/Tijuana");
      assert.deepEqual(body.features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: { phone: PHONE },
        music: null,
        itinerary: null,
        giftRegistry: false,
        giftRegistryDetails: null,
        lodging: null,
        livestream: null,
        openingAnimation: false,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
      // No package key list, name, or id reaches a guest; only the gated result does (S4, A7).
      const text = JSON.stringify(body);
      for (const leaked of ["COUNTDOWN", "WHATSAPP", "MAP", FEATURE_PACKAGE_ID]) {
        assert.equal(text.includes(leaked), false, leaked);
      }
    });

    it("answers the music link and the gift registry only for a package that grants them (F6, F7; S7)", async () => {
      const row = seed({
        slug: "invitacion-feat03",
        status: "PUBLISHED",
        packageId: MUSIC_PACKAGE_ID,
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.deepEqual(body.features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: { phone: PHONE },
        music: { url: PLAYLIST, provider: "spotify", title: null, coverUrl: null },
        itinerary: null,
        giftRegistry: true,
        giftRegistryDetails: null,
        lodging: null,
        livestream: null,
        openingAnimation: false,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
      assert.equal(JSON.stringify(body).includes(MUSIC_PACKAGE_ID), false);
    });

    it("answers the itinerary moments only for a package that grants ITINERARY (F1; L3.3)", async () => {
      const granted = seed({
        slug: "invitacion-itiner1",
        status: "PUBLISHED",
        packageId: ITINERARY_PACKAGE_ID,
        itinerary: ITINERARY,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      const grantedResponse = await send("GET", `${PUBLIC_PATH}/${granted.slug}`);

      assert.equal(grantedResponse.status, 200);
      const grantedBody = (await grantedResponse.json()) as Row;
      assert.deepEqual(Object.keys(grantedBody).sort(), PUBLIC_KEYS);
      // The guest reads the moments in the owner's order, and the payload's version stays in the API.
      assert.deepEqual((grantedBody.features as Row).itinerary, { items: ITINERARY.items });

      const withheld = seed({
        slug: "invitacion-itiner2",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        itinerary: ITINERARY,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      const withheldBody = (await (
        await send("GET", `${PUBLIC_PATH}/${withheld.slug}`)
      ).json()) as Row;

      assert.equal((withheldBody.features as Row).itinerary, null);
      assert.equal(JSON.stringify(withheldBody).includes("Misa"), false);
    });

    it("answers the lodging cards and the transport only for a package that grants LODGING (F4; L7.2, L7.3)", async () => {
      const granted = seed({
        slug: "invitacion-hosped1",
        status: "PUBLISHED",
        packageId: LODGING_PACKAGE_ID,
        itinerary: null,
        giftRegistry: null,
        lodging: LODGING,
        reminders: null,
      });
      const grantedResponse = await send("GET", `${PUBLIC_PATH}/${granted.slug}`);

      assert.equal(grantedResponse.status, 200);
      const grantedBody = (await grantedResponse.json()) as Row;
      assert.deepEqual(Object.keys(grantedBody).sort(), PUBLIC_KEYS);
      // The version stays in the API, and an absent optional text stays absent rather than null.
      assert.deepEqual((grantedBody.features as Row).lodging, {
        hotels: LODGING.hotels,
        transport: LODGING.transport,
      });

      const withheld = seed({
        slug: "invitacion-hosped2",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        itinerary: null,
        giftRegistry: null,
        lodging: LODGING,
        reminders: null,
      });
      const withheldBody = (await (
        await send("GET", `${PUBLIC_PATH}/${withheld.slug}`)
      ).json()) as Row;

      assert.equal((withheldBody.features as Row).lodging, null);
      assert.equal(JSON.stringify(withheldBody).includes("Hotel Misión"), false);

      const empty = seed({
        slug: "invitacion-hosped3",
        status: "PUBLISHED",
        packageId: LODGING_PACKAGE_ID,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
      });
      const emptyBody = (await (await send("GET", `${PUBLIC_PATH}/${empty.slug}`)).json()) as Row;

      assert.equal((emptyBody.features as Row).lodging, null);
    });

    it("answers the livestream with its video id only for a package that grants LIVESTREAM (F9; L12.2, L12.3, L22)", async () => {
      const granted = seed({
        slug: "invitacion-envi01",
        status: "PUBLISHED",
        packageId: LIVESTREAM_PACKAGE_ID,
        livestream: LIVESTREAM,
        openingAnimation: true,
      });
      const grantedResponse = await send("GET", `${PUBLIC_PATH}/${granted.slug}`);

      assert.equal(grantedResponse.status, 200);
      const grantedBody = (await grantedResponse.json()) as Row;
      assert.deepEqual(Object.keys(grantedBody).sort(), PUBLIC_KEYS);
      // The API resolves the id and the version stays in the API: the web builds the only embed origin it renders.
      assert.deepEqual((grantedBody.features as Row).livestream, {
        url: LIVESTREAM.url,
        videoId: "dQw4w9WgXcQ",
        note: "Inicia a las 17:00 h",
      });

      // A link this API does not embed is answered with no video id, so the guest only opens it (L12.3).
      const external = seed({
        slug: "invitacion-envi02",
        status: "PUBLISHED",
        packageId: LIVESTREAM_PACKAGE_ID,
        livestream: LIVESTREAM_EXTERNAL,
        openingAnimation: true,
      });
      const externalBody = (await (
        await send("GET", `${PUBLIC_PATH}/${external.slug}`)
      ).json()) as Row;

      assert.deepEqual((externalBody.features as Row).livestream, {
        url: LIVESTREAM_EXTERNAL.url,
        videoId: null,
        note: null,
      });

      // A package without the key keeps a stored link private, and a link the API does not store draws nothing.
      const withheld = seed({
        slug: "invitacion-envi03",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        livestream: LIVESTREAM,
        openingAnimation: true,
      });
      const withheldBody = (await (
        await send("GET", `${PUBLIC_PATH}/${withheld.slug}`)
      ).json()) as Row;

      assert.equal((withheldBody.features as Row).livestream, null);
      assert.equal(JSON.stringify(withheldBody).includes("Inicia a las 17:00 h"), false);

      const empty = seed({
        slug: "invitacion-envi04",
        status: "PUBLISHED",
        packageId: LIVESTREAM_PACKAGE_ID,
        livestream: null,
        openingAnimation: true,
      });
      const emptyBody = (await (await send("GET", `${PUBLIC_PATH}/${empty.slug}`)).json()) as Row;

      assert.equal((emptyBody.features as Row).livestream, null);
    });

    it("answers the opening animation with the grant and the owner's switch, so the page plays it only when both say so (F10; L14.4, L22)", async () => {
      // The package grants the key and the owner left the switch on: the page draws the envelope.
      const playing = seed({
        slug: "invitacion-abre01",
        status: "PUBLISHED",
        packageId: OPENING_ANIMATION_PACKAGE_ID,
        openingAnimation: true,
      });
      const playingResponse = await send("GET", `${PUBLIC_PATH}/${playing.slug}`);

      assert.equal(playingResponse.status, 200);
      const playingBody = (await playingResponse.json()) as Row;
      assert.deepEqual(Object.keys(playingBody).sort(), PUBLIC_KEYS);
      assert.equal((playingBody.features as Row).openingAnimation, true);

      // The same granted package with the owner's switch off shows the invitation directly.
      const off = seed({
        slug: "invitacion-abre02",
        status: "PUBLISHED",
        packageId: OPENING_ANIMATION_PACKAGE_ID,
        openingAnimation: false,
      });
      const offBody = (await (await send("GET", `${PUBLIC_PATH}/${off.slug}`)).json()) as Row;

      assert.equal((offBody.features as Row).openingAnimation, false);

      // A package that does not grant the key plays nothing, even for an invitation whose switch is on.
      const withheld = seed({
        slug: "invitacion-abre03",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        openingAnimation: true,
      });
      const withheldBody = (await (
        await send("GET", `${PUBLIC_PATH}/${withheld.slug}`)
      ).json()) as Row;

      assert.equal((withheldBody.features as Row).openingAnimation, false);
      // The switch itself is never answered: a guest reads whether the page plays, never the owner's stored boolean.
      assert.equal(Object.hasOwn(offBody.features as Row, "featureSettings"), false);
    });

    it("answers the gift registry only for a package that grants it and only while it shows something (F2; L4.3)", async () => {
      const granted = seed({
        slug: "invitacion-regal01",
        status: "PUBLISHED",
        packageId: MUSIC_PACKAGE_ID,
        giftRegistry: GIFT_REGISTRY,
      });
      const grantedBody = (await (
        await send("GET", `${PUBLIC_PATH}/${granted.slug}`)
      ).json()) as Row;

      assert.deepEqual(Object.keys(grantedBody).sort(), PUBLIC_KEYS);
      // The guest reads the stores in the owner's order, and the payload's version stays in the API.
      assert.deepEqual((grantedBody.features as Row).giftRegistryDetails, {
        stores: GIFT_REGISTRY.stores,
        transfer: GIFT_REGISTRY.transfer,
        envelopes: true,
        note: GIFT_REGISTRY.note,
      });
      assert.equal((grantedBody.features as Row).giftRegistry, true);

      // A package without the key answers no registry, and the stored one stays private.
      const withheld = seed({
        slug: "invitacion-regal02",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        giftRegistry: GIFT_REGISTRY,
      });
      const withheldBody = (await (
        await send("GET", `${PUBLIC_PATH}/${withheld.slug}`)
      ).json()) as Row;
      assert.equal((withheldBody.features as Row).giftRegistryDetails, null);
      assert.equal(JSON.stringify(withheldBody).includes("Liverpool"), false);
      assert.equal(JSON.stringify(withheldBody).includes("012180000123456782"), false);

      // An empty registry is no registry, even for a package that grants the key.
      const empty = seed({
        slug: "invitacion-regal03",
        status: "PUBLISHED",
        packageId: MUSIC_PACKAGE_ID,
        giftRegistry: { version: 1, stores: [], envelopes: false },
      });
      const emptyBody = (await (await send("GET", `${PUBLIC_PATH}/${empty.slug}`)).json()) as Row;
      assert.equal((emptyBody.features as Row).giftRegistryDetails, null);
      assert.equal((emptyBody.features as Row).giftRegistry, true);
    });

    it("withholds the legacy gift registry text while the structured registry shows (F2; L4.3)", async () => {
      const legacyContent = {
        title: "Cumpleaños de Ana",
        giftRegistry: "Mesa de regalos Liverpool · Código 5123 4471",
      };
      const legacy = seed({
        slug: "invitacion-regal04",
        status: "PUBLISHED",
        templateVersionId: GIFT_TEXT_VERSION_ID,
        packageId: MUSIC_PACKAGE_ID,
        content: legacyContent,
      });
      const legacyBody = (await (await send("GET", `${PUBLIC_PATH}/${legacy.slug}`)).json()) as Row;

      // An invitation with only the old text keeps it: nothing changed for it.
      assert.deepEqual(legacyBody.hiddenFields, []);
      assert.equal(
        (legacyBody.content as Row).giftRegistry,
        "Mesa de regalos Liverpool · Código 5123 4471",
      );
      // The gate keeps the boolean it always answered, so a page deployed before the structured registry still draws
      // the old text (review R3-001); the card itself travels apart.
      assert.equal((legacyBody.features as Row).giftRegistry, true);
      assert.equal((legacyBody.features as Row).giftRegistryDetails, null);

      const structured = seed({
        slug: "invitacion-regal05",
        status: "PUBLISHED",
        templateVersionId: GIFT_TEXT_VERSION_ID,
        packageId: MUSIC_PACKAGE_ID,
        content: legacyContent,
        giftRegistry: GIFT_REGISTRY,
      });
      const structuredResponse = await send("GET", `${PUBLIC_PATH}/${structured.slug}`);

      assert.equal(structuredResponse.status, 200);
      const structuredBody = (await structuredResponse.json()) as Row;
      // The guest never sees both: the old field is named as hidden and its value never travels.
      assert.deepEqual(structuredBody.hiddenFields, ["giftRegistry"]);
      assert.equal((structuredBody.content as Row).giftRegistry, undefined);
      assert.equal(JSON.stringify(structuredBody).includes("Código 5123 4471"), false);
      assert.deepEqual((structuredBody.features as Row).giftRegistryDetails, {
        stores: GIFT_REGISTRY.stores,
        transfer: GIFT_REGISTRY.transfer,
        envelopes: true,
        note: GIFT_REGISTRY.note,
      });
    });

    it("answers no itinerary when the invitation stores none, whatever the package grants (F1; L3.3)", async () => {
      const row = seed({
        slug: "invitacion-itiner3",
        status: "PUBLISHED",
        packageId: ITINERARY_PACKAGE_ID,
      });
      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { features: Row }).features.itinerary, null);
    });

    it("answers the stored playlist title and cover to a guest, in the music feature (S2, A7)", async () => {
      const row = seed({
        slug: "invitacion-metada",
        status: "PUBLISHED",
        packageId: MUSIC_PACKAGE_ID,
        playlistUrl: PLAYLIST,
        playlistTitle: "Today’s Top Hits",
        playlistCoverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.deepEqual((body.features as Row).music, {
        url: PLAYLIST,
        provider: "spotify",
        title: "Today’s Top Hits",
        coverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",
      });
    });

    it("keeps a cover off the allow-list out of the guest page, and the link with it (S2)", async () => {
      const row = seed({
        slug: "invitacion-metad2",
        status: "PUBLISHED",
        packageId: MUSIC_PACKAGE_ID,
        playlistUrl: PLAYLIST,
        playlistTitle: "Today’s Top Hits",
        playlistCoverUrl: "https://evil.test/cover.jpg",
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const features = ((await response.json()) as Row).features as Row;
      // The link and the title stay; the image host this deployment does not allow does not (S2, S3).
      assert.deepEqual(features.music, {
        url: PLAYLIST,
        provider: "spotify",
        title: "Today’s Top Hits",
        coverUrl: null,
      });
    });

    it("keeps a stored link private when the package does not grant music (F6; S7)", async () => {
      const row = seed({
        slug: "invitacion-feat04",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
        playlistUrl: PLAYLIST,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual((body.features as Row).music, null);
      assert.equal(JSON.stringify(body).includes("spotify"), false);
      assert.equal(JSON.stringify(body).includes(PLAYLIST), false);
    });

    it("drops WhatsApp while no phone is stored, whatever the package includes (S4)", async () => {
      const row = seed({
        slug: "invitacion-feat02",
        status: "PUBLISHED",
        packageId: FEATURE_PACKAGE_ID,
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      assert.deepEqual(((await response.json()) as Row).features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: null,
        music: null,
        itinerary: null,
        giftRegistry: false,
        giftRegistryDetails: null,
        lodging: null,
        livestream: null,
        openingAnimation: false,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
    });

    it("answers the RSVP mode the pinned package grants, with the deadline and the party limit (M6 G1)", async () => {
      const deadline = new Date("2026-12-31T23:59:59.000Z");
      const open = seed({
        slug: "invitacion-rsvp01",
        status: "PUBLISHED",
        packageId: RSVP_PACKAGE_ID,
        rsvpDeadline: deadline,
        rsvpPartyLimit: 6,
      });
      const guestList = seed({
        slug: "invitacion-rsvp02",
        status: "PUBLISHED",
        packageId: GUEST_LIST_PACKAGE_ID,
      });

      const openBody = (await (await send("GET", `${PUBLIC_PATH}/${open.slug}`)).json()) as Row;
      assert.deepEqual((openBody.features as Row).rsvp, {
        mode: "open",
        deadline: deadline.toISOString(),
        partyLimit: 6,
        qrPass: false,
      });
      assert.equal(JSON.stringify(openBody).includes("RSVP"), false, "the key list stays private");

      const guestListBody = (await (
        await send("GET", `${PUBLIC_PATH}/${guestList.slug}`)
      ).json()) as Row;
      assert.deepEqual((guestListBody.features as Row).rsvp, {
        mode: "guest-list",
        deadline: null,
        partyLimit: 4,
        qrPass: false,
      });
    });

    it("stops resolving the slug after unpublishing and resolves it again after republishing (S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });

      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      const published = await send("GET", `${PUBLIC_PATH}/${draft.slug}`);
      assert.equal(published.status, 200);
      assert.equal(((await published.json()) as Row).slug, draft.slug);

      assert.equal((await send("POST", `${PATH}/${draft.id}/unpublish`, cookie)).status, 200);
      const unpublished = await send("GET", `${PUBLIC_PATH}/${draft.slug}`);
      assert.equal(unpublished.status, 404);
      assert.deepEqual(await unpublished.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });

      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      assert.equal((await send("GET", `${PUBLIC_PATH}/${draft.slug}`)).status, 200);
    });

    it("shows the stored point only while the address text still carries its label (S2)", async () => {
      const label = "Parroquia de San José, Calle Hidalgo 12, Querétaro, Querétaro";
      const row = seed({
        slug: "invitacion-place-confirmed",
        status: "PUBLISHED",
        templateVersionId: PLACE_VERSION_ID,
        packageId: FEATURE_PACKAGE_ID,
        content: { address: label, location: "Parroquia de San José" },
        places: { address: { label, lat: 20.5888, lng: -100.3899 } },
      });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.equal((body.features as Row).map, true);
      assert.deepEqual(body.places, { address: { label, lat: 20.5888, lng: -100.3899 } });
    });

    it("shows no point once the address text changed, and none for a package without MAP (S2)", async () => {
      const label = "Parroquia de San José";
      const stored = { address: { label, lat: 20.5888, lng: -100.3899 } };
      const rewritten = seed({
        slug: "invitacion-place-rewritten",
        status: "PUBLISHED",
        templateVersionId: PLACE_VERSION_ID,
        packageId: FEATURE_PACKAGE_ID,
        content: { address: "Otra dirección escrita a mano" },
        places: stored,
      });
      const withoutMap = seed({
        slug: "invitacion-place-no-map",
        status: "PUBLISHED",
        templateVersionId: PLACE_VERSION_ID,
        packageId: ACTIVE_PACKAGE_ID,
        content: { address: label },
        places: stored,
      });

      for (const row of [rewritten, withoutMap]) {
        const body = (await send("GET", `${PUBLIC_PATH}/${row.slug}`).then((r) => r.json())) as Row;
        assert.deepEqual(body.places, {}, row.slug);
      }
    });
  });

  describe("RSVP creator routes (M6 G1; S1, S4)", () => {
    /** A DRAFT pinned to the given package, with content that publishes, as the owner routes leave it. */
    async function draft(cookie: string, packageId: string) {
      const response = await send("POST", PATH, cookie, {
        templateVersionId: PUBLISHED_VERSION_ID,
        packageId,
      });
      assert.equal(response.status, 201);
      const created = (await response.json()) as Row & { id: string; slug: string };
      assert.equal(
        (await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } }))
          .status,
        200,
      );
      return created;
    }

    describe("PUT /invitations/:id/rsvp-settings", () => {
      it("stores the deadline and the party limit and answers them", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);

        const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });
        const stored = repository.rows.find((row) => row.id === created.id);
        assert.equal(stored?.rsvpPartyLimit, 6);
        assert.equal(stored?.rsvpDeadline?.toISOString(), "2026-12-31T23:59:59.000Z");
      });

      it("clears the deadline with null", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });

        const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: null,
          partyLimit: 4,
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { deadline: null, partyLimit: 4 });
        assert.equal(repository.rows.find((row) => row.id === created.id)?.rsvpDeadline, null);
      });

      it("answers 400 INVALID_RSVP_SETTINGS with its issues and stores nothing", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        const before = structuredClone(repository.rows.find((row) => row.id === created.id));

        const refused: Array<[string, Record<string, unknown>, string[]]> = [
          [
            "a deadline that is not an instant",
            { deadline: "2026-12-31", partyLimit: 4 },
            ["deadline must be an ISO 8601 instant with an offset, or null"],
          ],
          [
            "a party limit of 0",
            { deadline: null, partyLimit: 0 },
            ["partyLimit must be between 1 and 10"],
          ],
          [
            "a party limit of 11",
            { deadline: null, partyLimit: 11 },
            ["partyLimit must be between 1 and 10"],
          ],
          [
            "a party limit that is not an integer",
            { deadline: null, partyLimit: 4.5 },
            ["partyLimit must be an integer"],
          ],
          [
            "both values wrong, the deadline first",
            { deadline: "someday", partyLimit: 11 },
            [
              "deadline must be an ISO 8601 instant with an offset, or null",
              "partyLimit must be between 1 and 10",
            ],
          ],
        ];

        for (const [label, body, issues] of refused) {
          const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, body);

          assert.equal(response.status, 400, label);
          assert.deepEqual(await response.json(), { code: "INVALID_RSVP_SETTINGS", issues });
        }
        assert.deepEqual(
          repository.rows.find((row) => row.id === created.id),
          before,
        );
      });

      it("answers 400 for a body without a field or with an unknown field", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        const before = structuredClone(repository.rows.find((row) => row.id === created.id));

        for (const body of [
          {},
          { deadline: null },
          { partyLimit: 4 },
          { deadline: null, partyLimit: 4, whatsappPhone: null },
          "not-json",
        ]) {
          const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, body);
          assert.equal(response.status, 400, JSON.stringify(body));
        }
        assert.deepEqual(
          repository.rows.find((row) => row.id === created.id),
          before,
        );
      });

      it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps its settings", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        assert.equal((await send("POST", `${PATH}/${created.id}/archive`, cookie)).status, 200);

        const response = await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: null,
          partyLimit: 9,
        });

        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
        assert.equal(repository.rows.find((row) => row.id === created.id)?.rsvpPartyLimit, 4);
      });

      it("answers 404 for another customer's invitation and for an unknown id", async () => {
        const owner = await signedInCustomer();
        const other = await signedInCustomer();
        const created = await draft(owner.cookie, RSVP_PACKAGE_ID);

        for (const id of [created.id, UNKNOWN_ID]) {
          const response = await send("PUT", `${PATH}/${id}/rsvp-settings`, other.cookie, {
            deadline: null,
            partyLimit: 9,
          });

          assert.equal(response.status, 404, id);
          assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
        }
        assert.equal(repository.rows.find((row) => row.id === created.id)?.rsvpPartyLimit, 4);
      });
    });

    describe("GET /invitations/:id/rsvp", () => {
      it("answers the settings, the responses newest first, and the totals", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });
        const older = rsvpRepository.seedResponse(created.id, {
          name: "Vieja",
          attending: true,
          partySize: 3,
          createdAt: new Date("2026-11-18T10:00:00.000Z"),
        });
        const newer = rsvpRepository.seedResponse(created.id, {
          name: "Nueva",
          attending: false,
          partySize: 0,
          phone: null,
          createdAt: new Date("2026-11-19T10:00:00.000Z"),
        });

        const response = await send("GET", `${PATH}/${created.id}/rsvp`, cookie);

        assert.equal(response.status, 200);
        const body = (await response.json()) as Row;
        assert.deepEqual(Object.keys(body).sort(), ["responses", "settings", "totals"]);
        assert.deepEqual(body.settings, {
          deadline: "2026-12-31T23:59:59.000Z",
          partyLimit: 6,
        });
        assert.deepEqual(
          (body.responses as Row[]).map((item) => item.id),
          [newer.id, older.id],
        );
        assert.deepEqual(Object.keys((body.responses as Row[])[0] ?? {}).sort(), [
          "attending",
          "companions",
          "createdAt",
          "dietaryNotes",
          "id",
          "message",
          "name",
          "partySize",
          "phone",
          "updatedAt",
        ]);
        assert.deepEqual(body.totals, {
          attendingPeople: 3,
          attendingAdults: 3,
          attendingChildren: 0,
          declinedCount: 1,
          responses: 2,
        });
        // Nothing internal travels: no dedupe key, no invitation id, no owner id.
        const text = JSON.stringify(body);
        for (const internal of ["dedupeKey", created.id, "invitationId", "ownerId"]) {
          assert.equal(text.includes(internal), false, internal);
        }
      });

      it("answers an empty read to an owner without responses", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);

        const response = await send("GET", `${PATH}/${created.id}/rsvp`, cookie);

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          settings: { deadline: null, partyLimit: 4 },
          responses: [],
          totals: {
            attendingPeople: 0,
            attendingAdults: 0,
            attendingChildren: 0,
            declinedCount: 0,
            responses: 0,
          },
        });
      });

      it("answers 404 for another customer's invitation and for an unknown id", async () => {
        const owner = await signedInCustomer();
        const other = await signedInCustomer();
        const created = await draft(owner.cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(created.id);

        for (const id of [created.id, UNKNOWN_ID]) {
          const response = await send("GET", `${PATH}/${id}/rsvp`, other.cookie);

          assert.equal(response.status, 404, id);
          assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
        }
      });

      it("keeps two creators apart: each reads only the responses of their own invitation", async () => {
        const first = await signedInCustomer();
        const second = await signedInCustomer();
        const firstInvitation = await draft(first.cookie, RSVP_PACKAGE_ID);
        const secondInvitation = await draft(second.cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(firstInvitation.id, { name: "De la primera" });
        rsvpRepository.seedResponse(secondInvitation.id, { name: "De la segunda" });

        const read = (await (
          await send("GET", `${PATH}/${firstInvitation.id}/rsvp`, first.cookie)
        ).json()) as Row;

        assert.deepEqual(
          (read.responses as Row[]).map((item) => item.name),
          ["De la primera"],
        );
        assert.equal(JSON.stringify(read).includes("De la segunda"), false);
      });
    });

    describe("GET /invitations/:id/rsvp.csv", () => {
      it("answers an attachment with no-store and one escaped line per response, newest first", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(created.id, {
          name: "Vieja, Ana",
          partySize: 1,
          createdAt: new Date("2026-11-18T10:00:00.000Z"),
        });
        rsvpRepository.seedResponse(created.id, {
          name: "=Nueva",
          attending: false,
          partySize: 0,
          phone: null,
          message: 'Dijo: "sí"',
          createdAt: new Date("2026-11-19T10:00:00.000Z"),
        });

        const response = await send("GET", `${PATH}/${created.id}/rsvp.csv`, cookie);

        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
        assert.equal(
          response.headers.get("content-disposition"),
          `attachment; filename="asistencia-${created.slug}.csv"`,
        );
        assert.equal(response.headers.get("cache-control"), "no-store");
        const lines = (await response.text()).split("\r\n");
        assert.equal(
          lines[0],
          "Nombre,Asistencia,Personas,Acompañantes,Niños,Restricciones alimentarias,Teléfono,Mensaje,Primera respuesta,Última actualización",
        );
        assert.equal(
          lines[1],
          `'=Nueva,No,0,,0,,,"Dijo: ""sí""",2026-11-19T10:00:00.000Z,2026-11-19T10:00:00.000Z`,
        );
        assert.equal(
          lines[2],
          '"Vieja, Ana",Sí,1,,0,,\'+525512345678,,2026-11-18T10:00:00.000Z,2026-11-18T10:00:00.000Z',
        );
      });

      it("answers only the header for an invitation without responses", async () => {
        const { cookie } = await signedInCustomer();
        const created = await draft(cookie, RSVP_PACKAGE_ID);

        const response = await send("GET", `${PATH}/${created.id}/rsvp.csv`, cookie);

        assert.equal(response.status, 200);
        assert.deepEqual((await response.text()).split("\r\n"), [
          "Nombre,Asistencia,Personas,Acompañantes,Niños,Restricciones alimentarias,Teléfono,Mensaje,Primera respuesta,Última actualización",
          "",
        ]);
      });

      it("answers 404 for another customer's invitation and for an unknown id", async () => {
        const owner = await signedInCustomer();
        const other = await signedInCustomer();
        const created = await draft(owner.cookie, RSVP_PACKAGE_ID);
        rsvpRepository.seedResponse(created.id);

        for (const id of [created.id, UNKNOWN_ID]) {
          const response = await send("GET", `${PATH}/${id}/rsvp.csv`, other.cookie);

          assert.equal(response.status, 404, id);
          assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
          assert.equal(response.headers.get("cache-control"), "no-store");
        }
      });
    });
  });

  describe("POST /public/invitations/:slug/rsvp (M6 G1; S1, S4)", () => {
    const ATTEMPT = {
      name: "  Ana   Pérez ",
      attending: true,
      partySize: 2,
      phone: "55 1234 5678",
      message: "  ¡Con gusto! ",
      honeypot: "",
    };

    /** A published invitation of the given package, created through the owner routes. */
    async function published(packageId: string = RSVP_PACKAGE_ID) {
      const { cookie } = await signedInCustomer();
      const created = (await (
        await send("POST", PATH, cookie, {
          templateVersionId: PUBLISHED_VERSION_ID,
          packageId,
        })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);
      return { cookie, created };
    }

    const submit = (slug: string, body: unknown, headers: Record<string, string> = {}) =>
      send("POST", `/public/invitations/${slug}/rsvp`, undefined, body, headers);

    it("stores the response and answers the same minimal 202 as a retry", async () => {
      const { created } = await published();

      const response = await submit(created.slug, ATTEMPT);

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
      assert.equal(response.headers.get("cache-control"), "no-store");
      const stored = rsvpRepository.responses.filter((item) => item.invitationId === created.id);
      assert.equal(stored.length, 1);
      assert.equal(stored[0]?.name, "Ana Pérez");
      assert.equal(stored[0]?.dedupeKey, "ana perez|+525512345678");
      assert.equal(stored[0]?.phone, "+525512345678");
      assert.equal(stored[0]?.message, "¡Con gusto!");

      // A retry with the same normalized name and phone updates the row and answers the same 202.
      const retry = await submit(created.slug, { ...ATTEMPT, name: "ANA PEREZ", partySize: 4 });
      assert.equal(retry.status, 202);
      assert.deepEqual(await retry.json(), { status: "received" });
      const afterRetry = rsvpRepository.responses.filter(
        (item) => item.invitationId === created.id,
      );
      assert.equal(afterRetry.length, 1);
      assert.equal(afterRetry[0]?.partySize, 4);
      assert.equal(afterRetry[0]?.id, stored[0]?.id);
    });

    it("stores the companions and the dietary notes of the answer and refuses a mismatched list (F3; L6.1)", async () => {
      const { created } = await published();

      assert.equal(
        (
          await submit(created.slug, {
            ...ATTEMPT,
            partySize: 3,
            companions: [
              { name: "  Jorge   Gómez ", child: false },
              { name: "Sofía Gómez", child: true },
            ],
            dietaryNotes: "  Sin nueces  ",
          })
        ).status,
        202,
      );
      const stored = rsvpRepository.responses.filter((item) => item.invitationId === created.id);
      assert.deepEqual(stored[0]?.companions, [
        { name: "Jorge Gómez", child: false },
        { name: "Sofía Gómez", child: true },
      ]);
      assert.equal(stored[0]?.dietaryNotes, "Sin nueces");

      const refused = await submit(created.slug, {
        ...ATTEMPT,
        name: "Beto",
        partySize: 3,
        companions: [{ name: "Jorge", child: false }],
      });
      assert.equal(refused.status, 400);
      assert.deepEqual((await refused.json()) as Row, {
        code: "INVALID_RSVP",
        issues: ["companions must have exactly 2 entries when attending"],
      });
      // The refused answer stored nothing, so the first answer is still the only row.
      assert.equal(
        rsvpRepository.responses.filter((item) => item.invitationId === created.id).length,
        1,
      );
    });

    it("answers the same 202 without storing when the honeypot is filled", async () => {
      const { created } = await published();

      const response = await submit(created.slug, {
        ...ATTEMPT,
        name: "",
        honeypot: "https://spam.example",
      });

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
      assert.equal(
        rsvpRepository.responses.some((item) => item.invitationId === created.id),
        false,
      );
    });

    it("answers 400 INVALID_RSVP with the domain issues and stores nothing", async () => {
      const { cookie, created } = await published();
      await send("PUT", `${PATH}/${created.id}/rsvp-settings`, cookie, {
        deadline: null,
        partyLimit: 2,
      });

      const refused: Array<[string, Record<string, unknown>, string[]]> = [
        ["an empty name", { ...ATTEMPT, name: "" }, ["name must be between 1 and 80 characters"]],
        [
          "a party above the invitation's limit",
          { ...ATTEMPT, partySize: 3 },
          ["partySize must be between 1 and 2 when attending"],
        ],
        [
          "a declined response that still names people",
          { ...ATTEMPT, attending: false, partySize: 2 },
          ["partySize must be 0 when not attending"],
        ],
        [
          "a phone it cannot normalize",
          { ...ATTEMPT, phone: "12345" },
          [
            "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          ],
        ],
        [
          "a message above the limit",
          { ...ATTEMPT, message: "x".repeat(281) },
          ["message must be at most 280 characters"],
        ],
      ];

      for (const [label, body, issues] of refused) {
        const response = await submit(created.slug, body);

        assert.equal(response.status, 400, label);
        assert.deepEqual(await response.json(), { code: "INVALID_RSVP", issues });
      }
      assert.equal(
        rsvpRepository.responses.some((item) => item.invitationId === created.id),
        false,
      );
    });

    it("answers 400 for an unknown field or a value the DTO refuses, and stores nothing", async () => {
      const { created } = await published();

      for (const body of [
        { ...ATTEMPT, ownerId: UNKNOWN_ID },
        { ...ATTEMPT, attending: "yes" },
        { ...ATTEMPT, partySize: "2" },
        { name: "Ana" },
        "not-json",
      ]) {
        const response = await submit(created.slug, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(
        rsvpRepository.responses.some((item) => item.invitationId === created.id),
        false,
      );
    });

    it("answers the public 404 for a malformed, unknown, draft, or archived slug, without a session", async () => {
      const { cookie } = await signedInCustomer();
      const draftInvitation = (await (
        await send("POST", PATH, cookie, {
          templateVersionId: PUBLISHED_VERSION_ID,
          packageId: RSVP_PACKAGE_ID,
        })
      ).json()) as Row & { id: string; slug: string };
      const archived = await published();
      assert.equal(
        (await send("POST", `${PATH}/${archived.created.id}/archive`, archived.cookie)).status,
        200,
      );

      for (const slug of [
        "Invitacion-Malformed",
        "invitacion-never0",
        draftInvitation.slug,
        archived.created.slug,
      ]) {
        const response = await submit(slug, ATTEMPT);

        assert.equal(response.status, 404, slug);
        assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    });

    it("answers 409 RSVP_NOT_OPEN for a guest list, a package without RSVP, and a deadline that passed", async () => {
      const guestList = await published(GUEST_LIST_PACKAGE_ID);
      assert.equal((await submit(guestList.created.slug, ATTEMPT)).status, 409);
      assert.deepEqual(await (await submit(guestList.created.slug, ATTEMPT)).json(), {
        code: "RSVP_NOT_OPEN",
      });

      const basic = await published(ACTIVE_PACKAGE_ID);
      const basicResponse = await submit(basic.created.slug, ATTEMPT);
      assert.equal(basicResponse.status, 409);
      assert.deepEqual(await basicResponse.json(), { code: "RSVP_NOT_OPEN" });

      const closed = await published();
      assert.equal(
        (
          await send("PUT", `${PATH}/${closed.created.id}/rsvp-settings`, closed.cookie, {
            deadline: "2020-01-01T00:00:00.000Z",
            partyLimit: 4,
          })
        ).status,
        200,
      );
      const closedResponse = await submit(closed.created.slug, ATTEMPT);
      assert.equal(closedResponse.status, 409);
      assert.deepEqual(await closedResponse.json(), { code: "RSVP_NOT_OPEN" });

      for (const invitation of [guestList, basic, closed]) {
        assert.equal(
          rsvpRepository.responses.some((item) => item.invitationId === invitation.created.id),
          false,
        );
      }
    });

    it("answers 409 RSVP_NOT_OPEN for an expired invitation that still renders (S2, T4)", async () => {
      const { created } = await published();
      const stored = repository.rows.find((row) => row.id === created.id);
      assert.ok(stored);
      stored.expiresAt = new Date(Date.now() - 1_000);
      const counted = rateLimiter.consumed.length;

      // The page still renders, so the submission is refused as closed rather than as missing.
      assert.equal((await send("GET", `/public/invitations/${created.slug}`)).status, 200);
      const response = await submit(created.slug, ATTEMPT);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "RSVP_NOT_OPEN" });
      assert.equal(
        rsvpRepository.responses.some((item) => item.invitationId === created.id),
        false,
      );
      // A refused submission never spends the rate limit (S4).
      assert.equal(rateLimiter.consumed.length, counted);
    });

    it("answers 429 RSVP_RATE_LIMITED when the address is over the cap, and stores nothing", async () => {
      const { created } = await published();
      rateLimiter.allow = false;

      try {
        const response = await submit(created.slug, ATTEMPT);

        assert.equal(response.status, 429);
        assert.deepEqual(await response.json(), { code: "RSVP_RATE_LIMITED" });
        assert.equal(
          rsvpRepository.responses.some((item) => item.invitationId === created.id),
          false,
        );
      } finally {
        rateLimiter.allow = true;
      }
    });

    it("counts each client address separately, from the configured header", async () => {
      const { created } = await published();
      rateLimiter.consumed.length = 0;

      await submit(created.slug, ATTEMPT, { "x-forwarded-for": "198.18.0.21" });
      await submit(
        created.slug,
        { ...ATTEMPT, name: "Otra" },
        {
          "x-forwarded-for": "198.18.0.21, 10.0.0.1",
        },
      );
      await submit(
        created.slug,
        { ...ATTEMPT, name: "Tercera" },
        {
          "x-forwarded-for": "198.18.0.22",
        },
      );

      assert.deepEqual(
        rateLimiter.consumed.map((item) => item.clientAddress),
        ["198.18.0.21", "198.18.0.21", "198.18.0.22"],
      );
      for (const item of rateLimiter.consumed) {
        assert.equal(item.invitationId, created.id);
      }
    });

    it("serves the same answer with a forged cookie, never reading a session", async () => {
      const { created } = await published();

      const response = await send(
        "POST",
        `/public/invitations/${created.slug}/rsvp`,
        `${SESSION_COOKIE}=forged.value`,
        { ...ATTEMPT, name: "Con cookie" },
      );

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
    });

    it("never returns another guest's data or any administrative field", async () => {
      const { created } = await published();
      await submit(created.slug, ATTEMPT);
      const first = rsvpRepository.responses[0] as RsvpResponseRecord;

      const response = await submit(created.slug, {
        ...ATTEMPT,
        name: "Otra Persona",
        phone: null,
      });

      assert.equal(response.status, 202);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), { status: "received" });
      for (const leaked of [
        "Ana",
        "+525512345678",
        first.id,
        created.id,
        created.slug,
        "ownerId",
        "dedupeKey",
      ]) {
        assert.equal(text.includes(leaked), false, leaked);
      }
    });
  });

  describe("guestbook routes (F7; S2.7, L10.3, L10.4, L10.6)", () => {
    const SIGNATURE = {
      authorName: "  Tía   Rosa ",
      message: "  ¡Que este día sea tan hermoso como tú!\nTe queremos.  ",
      honeypot: "",
    };

    /** A published invitation of the given package, created through the owner routes. */
    async function published(packageId: string = GUESTBOOK_PACKAGE_ID) {
      const { cookie } = await signedInCustomer();
      const created = (await (
        await send("POST", PATH, cookie, {
          templateVersionId: PUBLISHED_VERSION_ID,
          packageId,
        })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);
      return { cookie, created };
    }

    const sign = (slug: string, body: unknown, headers: Record<string, string> = {}) =>
      send("POST", `/public/invitations/${slug}/guestbook`, undefined, body, headers);

    /** The entries the shared memory port holds for one invitation. */
    const entriesOf = (invitationId: string) =>
      guestbookRepository.entries.filter((entry) => entry.invitationId === invitationId);

    describe("the public album read (L11.4)", () => {
      it("answers features.guestAlbum with the published photos and the count, and never a pending one", async () => {
        const { created } = await published(GUEST_ALBUM_PACKAGE_ID);
        guestAlbumReader.seedPhoto(created.id, {
          url: "https://api.example.test/media/photo-1",
          uploaderName: "Tía Rosa",
          createdAt: new Date(Date.UTC(2026, 11, 1, 10, 0, 0)),
        });
        guestAlbumReader.seedPhoto(created.id, {
          url: "https://api.example.test/media/photo-2",
          uploaderName: null,
          createdAt: new Date(Date.UTC(2026, 11, 1, 11, 0, 0)),
        });
        // A photo the owner has not published is invisible to a guest, and one the owner hid is too.
        guestAlbumReader.seedPhoto(created.id, {
          url: "https://api.example.test/media/photo-pending",
          status: "PENDING",
        });
        guestAlbumReader.seedPhoto(created.id, {
          url: "https://api.example.test/media/photo-hidden",
          status: "HIDDEN",
        });

        const response = await send("GET", `/public/invitations/${created.slug}`);
        const body = (await response.json()) as Row & {
          features: { guestAlbum: { photos: Array<Row>; count: number } | null };
        };

        assert.equal(response.status, 200);
        assert.deepEqual(body.features.guestAlbum, {
          photos: [
            { url: "https://api.example.test/media/photo-2", uploaderName: null },
            { url: "https://api.example.test/media/photo-1", uploaderName: "Tía Rosa" },
          ],
          count: 2,
        });
        // Nothing about the review state, the storage key, or an unapproved photo reaches a guest.
        const text = JSON.stringify(body.features.guestAlbum);
        assert.equal(text.includes("PENDING"), false);
        assert.equal(text.includes("HIDDEN"), false);
        assert.equal(text.includes("photo-pending"), false);
      });

      it("answers an empty album for a granted package with no photo, and null when the package does not grant it", async () => {
        const granted = await published(GUEST_ALBUM_PACKAGE_ID);
        const basic = await published(ACTIVE_PACKAGE_ID);

        const grantedBody = (await (
          await send("GET", `/public/invitations/${granted.created.slug}`)
        ).json()) as Row & { features: { guestAlbum: unknown } };
        const basicBody = (await (
          await send("GET", `/public/invitations/${basic.created.slug}`)
        ).json()) as Row & { features: { guestAlbum: unknown } };

        assert.deepEqual(grantedBody.features.guestAlbum, { photos: [], count: 0 });
        assert.equal(basicBody.features.guestAlbum, null);
      });
    });

    describe("the public read (L10.4)", () => {
      it("answers features.guestbook with the visible entries newest first and keeps the hidden ones private", async () => {
        const { created } = await published();
        const older = guestbookRepository.seedEntry(created.id, {
          authorName: "Tía Rosa",
          message: "¡Que este día sea tan hermoso como tú!",
          createdAt: new Date(Date.UTC(2026, 11, 1, 9, 0, 0)),
        });
        guestbookRepository.seedEntry(created.id, {
          authorName: "Sofía y Jorge",
          message: "Nos vemos en la pista \u{1F483}",
          createdAt: new Date(Date.UTC(2026, 11, 1, 10, 0, 0)),
        });
        guestbookRepository.seedEntry(created.id, {
          authorName: "Anónimo",
          message: "Mensaje oculto",
          hidden: true,
          createdAt: new Date(Date.UTC(2026, 11, 1, 11, 0, 0)),
        });

        const response = await send("GET", `/public/invitations/${created.slug}`);
        const body = (await response.json()) as Row & {
          features: { guestbook: Array<Row> | null };
        };

        assert.equal(response.status, 200);
        assert.deepEqual(body.features.guestbook, [
          { authorName: "Sofía y Jorge", message: "Nos vemos en la pista \u{1F483}" },
          { authorName: "Tía Rosa", message: "¡Que este día sea tan hermoso como tú!" },
        ]);
        // The wall is plain text: no id and no moderation state travels to a guest.
        const text = JSON.stringify(body.features.guestbook);
        assert.equal(text.includes(older.id), false);
        assert.equal(text.includes("hidden"), false);
      });

      it("answers an empty list for a granted package with no entry, and null when the package does not grant it", async () => {
        const granted = await published();
        const basic = await published(ACTIVE_PACKAGE_ID);

        const grantedBody = (await (
          await send("GET", `/public/invitations/${granted.created.slug}`)
        ).json()) as Row & { features: { guestbook: unknown } };
        const basicBody = (await (
          await send("GET", `/public/invitations/${basic.created.slug}`)
        ).json()) as Row & { features: { guestbook: unknown } };

        assert.deepEqual(grantedBody.features.guestbook, []);
        assert.equal(basicBody.features.guestbook, null);
      });

      it("answers at most the newest 50 visible entries", async () => {
        const { created } = await published();
        for (let index = 0; index < 52; index += 1) {
          guestbookRepository.seedEntry(created.id, {
            authorName: `Invitado ${index}`,
            message: `Mensaje ${index}`,
            createdAt: new Date(Date.UTC(2026, 11, 1, 10, index)),
          });
        }

        const body = (await (
          await send("GET", `/public/invitations/${created.slug}`)
        ).json()) as Row & {
          features: { guestbook: Array<{ authorName: string }> };
        };

        assert.equal(body.features.guestbook.length, 50);
        assert.equal(body.features.guestbook[0]?.authorName, "Invitado 51");
        assert.equal(body.features.guestbook[49]?.authorName, "Invitado 2");
      });
    });

    describe("POST /public/invitations/:slug/guestbook", () => {
      it("stores the trimmed signature and answers the same minimal 202", async () => {
        const { created } = await published();

        const response = await sign(created.slug, SIGNATURE);

        assert.equal(response.status, 202);
        assert.deepEqual(await response.json(), { status: "received" });
        assert.equal(response.headers.get("cache-control"), "no-store");
        const stored = entriesOf(created.id);
        assert.equal(stored.length, 1);
        assert.equal(stored[0]?.authorName, "Tía   Rosa");
        assert.equal(stored[0]?.message, "¡Que este día sea tan hermoso como tú!\nTe queremos.");
        assert.equal(stored[0]?.hidden, false);
      });

      it("keeps markup as text and answers the guest page with it escaped", async () => {
        const { created } = await published();
        const html = "<script>alert(1)</script> https://spam.example";

        assert.equal((await sign(created.slug, { ...SIGNATURE, message: html })).status, 202);
        assert.equal(entriesOf(created.id)[0]?.message, html);
      });

      it("answers the same 202 without storing when the honeypot is filled, and still counts the attempt", async () => {
        const { created } = await published();
        guestbookRateLimiter.consumed.length = 0;

        const response = await sign(created.slug, {
          ...SIGNATURE,
          honeypot: "https://spam.example",
        });

        assert.equal(response.status, 202);
        assert.deepEqual(await response.json(), { status: "received" });
        assert.equal(entriesOf(created.id).length, 0);
        // The honeypot is answered after the rate limit on purpose, so a bot's dropped signature spends its slot (L10.3).
        assert.equal(guestbookRateLimiter.consumed.length, 1);
        assert.equal(guestbookRateLimiter.consumed[0]?.invitationId, created.id);
      });

      it("answers the same 202 without storing when the honeypot is filled even with a body the domain refuses", async () => {
        const { created } = await published();

        const response = await sign(created.slug, {
          authorName: "   ",
          message: "\u0000",
          honeypot: "filled",
        });

        assert.equal(response.status, 202);
        assert.deepEqual(await response.json(), { status: "received" });
        assert.equal(entriesOf(created.id).length, 0);
      });

      it("answers 400 INVALID_GUESTBOOK_ENTRY with the domain issues and stores nothing", async () => {
        const { created } = await published();
        guestbookRateLimiter.consumed.length = 0;
        const refused: Array<[string, Record<string, unknown>, string[]]> = [
          [
            "a blank name",
            { ...SIGNATURE, authorName: "   " },
            ["authorName must be between 1 and 60 characters"],
          ],
          [
            "a blank message",
            { ...SIGNATURE, message: " \n " },
            ["message must be between 1 and 500 characters"],
          ],
          [
            "a name above its bound",
            { ...SIGNATURE, authorName: "x".repeat(61) },
            ["authorName must be between 1 and 60 characters"],
          ],
          [
            "a message above its bound",
            { ...SIGNATURE, message: "x".repeat(501) },
            ["message must be between 1 and 500 characters"],
          ],
          [
            "a NUL in the name",
            { ...SIGNATURE, authorName: "Tía\u0000Rosa" },
            ["authorName must not contain control characters"],
          ],
          [
            "a NUL in the message",
            { ...SIGNATURE, message: "¡Felicidades!\u0000" },
            ["message must not contain control characters"],
          ],
          [
            "a control character in the message",
            { ...SIGNATURE, message: "Hola\u0007" },
            ["message must not contain control characters"],
          ],
        ];

        for (const [label, body, issues] of refused) {
          const response = await sign(created.slug, body);

          assert.equal(response.status, 400, label);
          assert.deepEqual(await response.json(), { code: "INVALID_GUESTBOOK_ENTRY", issues });
        }
        // The rate limit runs before the domain validation, so one refused signature spends one of the address's ten
        // slots; what it never does is reach the store (L10.3).
        assert.equal(guestbookRateLimiter.consumed.length, refused.length);
        assert.equal(entriesOf(created.id).length, 0);
      });

      it("answers 400 for an unknown field or a value the DTO refuses, and stores nothing", async () => {
        const { created } = await published();

        for (const body of [
          { ...SIGNATURE, hidden: true },
          { ...SIGNATURE, invitationId: UNKNOWN_ID },
          { ...SIGNATURE, authorName: 42 },
          { authorName: "Rosa" },
          "not-json",
        ]) {
          const response = await sign(created.slug, body);
          assert.equal(response.status, 400, JSON.stringify(body));
        }
        assert.equal(entriesOf(created.id).length, 0);
      });

      it("answers the public 404 for a malformed, unknown, draft, or archived slug, without a session", async () => {
        const { cookie } = await signedInCustomer();
        const draft = (await (
          await send("POST", PATH, cookie, {
            templateVersionId: PUBLISHED_VERSION_ID,
            packageId: GUESTBOOK_PACKAGE_ID,
          })
        ).json()) as Row & { id: string; slug: string };
        const archived = await published();
        assert.equal(
          (await send("POST", `${PATH}/${archived.created.id}/archive`, archived.cookie)).status,
          200,
        );

        for (const slug of [
          "Invitacion-Malformed",
          "invitacion-never0",
          draft.slug,
          archived.created.slug,
        ]) {
          const response = await sign(slug, SIGNATURE);

          assert.equal(response.status, 404, slug);
          assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
        }
        assert.equal(entriesOf(archived.created.id).length, 0);
      });

      it("answers 409 GUESTBOOK_CLOSED for a package without the key and for an expired invitation", async () => {
        const basic = await published(ACTIVE_PACKAGE_ID);
        const expired = await published();
        const stored = repository.rows.find((row) => row.id === expired.created.id);
        assert.ok(stored);
        stored.expiresAt = new Date(Date.now() - 1_000);
        guestbookRateLimiter.consumed.length = 0;

        for (const invitation of [basic, expired]) {
          const response = await sign(invitation.created.slug, SIGNATURE);

          assert.equal(response.status, 409);
          assert.deepEqual(await response.json(), { code: "GUESTBOOK_CLOSED" });
          assert.equal(entriesOf(invitation.created.id).length, 0);
        }
        // A closed wall never spends the guest's budget, and an expired invitation still renders read-only.
        assert.equal(guestbookRateLimiter.consumed.length, 0);
        assert.equal(
          (await send("GET", `/public/invitations/${expired.created.slug}`)).status,
          200,
        );
      });

      it("answers 429 GUESTBOOK_RATE_LIMITED when the address is over the cap, and stores nothing", async () => {
        const { created } = await published();
        guestbookRateLimiter.allow = false;

        try {
          const response = await sign(created.slug, SIGNATURE);

          assert.equal(response.status, 429);
          assert.deepEqual(await response.json(), { code: "GUESTBOOK_RATE_LIMITED" });
          assert.equal(entriesOf(created.id).length, 0);
        } finally {
          guestbookRateLimiter.allow = true;
        }
      });

      it("counts each client address separately, from the configured header", async () => {
        const { created } = await published();
        guestbookRateLimiter.consumed.length = 0;

        await sign(created.slug, SIGNATURE, { "x-forwarded-for": "198.18.0.31" });
        await sign(
          created.slug,
          { ...SIGNATURE, authorName: "Otra" },
          {
            "x-forwarded-for": "198.18.0.31, 10.0.0.1",
          },
        );
        await sign(
          created.slug,
          { ...SIGNATURE, authorName: "Tercera" },
          {
            "x-forwarded-for": "198.18.0.32",
          },
        );

        assert.deepEqual(
          guestbookRateLimiter.consumed.map((item) => item.clientAddress),
          ["198.18.0.31", "198.18.0.31", "198.18.0.32"],
        );
        for (const item of guestbookRateLimiter.consumed) {
          assert.equal(item.invitationId, created.id);
        }
      });

      it("serves the same answer with a forged cookie, never reading a session", async () => {
        const { created } = await published();

        const response = await send(
          "POST",
          `/public/invitations/${created.slug}/guestbook`,
          `${SESSION_COOKIE}=forged.value`,
          { ...SIGNATURE, authorName: "Con cookie" },
        );

        assert.equal(response.status, 202);
        assert.deepEqual(await response.json(), { status: "received" });
      });
    });

    describe("the owner's moderation routes (L10.6)", () => {
      it("reads every entry with its state and the two counts, and hides and shows one again", async () => {
        const { cookie, created } = await published();
        const visible = guestbookRepository.seedEntry(created.id, { authorName: "Tía Rosa" });
        const hidden = guestbookRepository.seedEntry(created.id, {
          authorName: "Anónimo",
          message: "Mensaje oculto",
          hidden: true,
        });

        const read = await send("GET", `${PATH}/${created.id}/guestbook`, cookie);
        assert.equal(read.status, 200);
        assert.deepEqual(await read.json(), {
          entries: [
            {
              id: hidden.id,
              authorName: "Anónimo",
              message: "Mensaje oculto",
              hidden: true,
              createdAt: hidden.createdAt.toISOString(),
            },
            {
              id: visible.id,
              authorName: "Tía Rosa",
              message: "¡Que este día sea tan hermoso como tú!",
              hidden: false,
              createdAt: visible.createdAt.toISOString(),
            },
          ],
          visibleCount: 1,
          hiddenCount: 1,
        });

        const hiddenWrite = await send(
          "PUT",
          `${PATH}/${created.id}/guestbook/${visible.id}`,
          cookie,
          {
            hidden: true,
          },
        );
        assert.equal(hiddenWrite.status, 200);
        assert.equal(((await hiddenWrite.json()) as Row).hidden, true);
        // The wall stops showing it at once, and the entry is still stored for the owner.
        const afterHide = (await (
          await send("GET", `/public/invitations/${created.slug}`)
        ).json()) as Row & { features: { guestbook: Array<Row> } };
        assert.deepEqual(afterHide.features.guestbook, []);
        assert.equal(entriesOf(created.id).length, 2);

        const shown = await send("PUT", `${PATH}/${created.id}/guestbook/${visible.id}`, cookie, {
          hidden: false,
        });
        assert.equal(shown.status, 200);
        assert.equal(((await shown.json()) as Row).hidden, false);
        const afterShow = (await (
          await send("GET", `/public/invitations/${created.slug}`)
        ).json()) as Row & { features: { guestbook: Array<{ authorName: string }> } };
        assert.deepEqual(
          afterShow.features.guestbook.map((entry) => entry.authorName),
          ["Tía Rosa"],
        );
      });

      it("bounds the owner's read to the newest 500 entries (L10.6)", async () => {
        const { cookie, created } = await published();
        for (let index = 0; index < 502; index += 1) {
          guestbookRepository.seedEntry(created.id, {
            authorName: `Invitado ${index}`,
            message: `Mensaje ${index}`,
            createdAt: new Date(Date.UTC(2026, 11, 1, 10, 0, 0) + index * 1_000),
          });
        }

        const response = await send("GET", `${PATH}/${created.id}/guestbook`, cookie);

        assert.equal(response.status, 200);
        const body = (await response.json()) as Row & {
          entries: Array<{ authorName: string }>;
          visibleCount: number;
          hiddenCount: number;
        };
        assert.equal(body.entries.length, 500);
        assert.equal(body.entries[0]?.authorName, "Invitado 501");
        assert.equal(body.entries[499]?.authorName, "Invitado 2");
        assert.equal(body.visibleCount, 500);
        assert.equal(body.hiddenCount, 0);
      });

      it("answers 404 for another owner's invitation and 404 for an entry of another invitation", async () => {
        const mine = await published();
        const theirs = await published();
        const foreignEntry = guestbookRepository.seedEntry(theirs.created.id);
        const otherCustomer = await signedInCustomer();

        for (const [label, response] of [
          [
            "the read",
            await send("GET", `${PATH}/${mine.created.id}/guestbook`, otherCustomer.cookie),
          ],
          [
            "the write",
            await send(
              "PUT",
              `${PATH}/${mine.created.id}/guestbook/${foreignEntry.id}`,
              otherCustomer.cookie,
              {
                hidden: true,
              },
            ),
          ],
        ] as const) {
          assert.equal(response.status, 404, label);
          assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
        }
        assert.equal(foreignEntry.hidden, false);

        // An entry id that belongs to another invitation of the same owner is the entry's own 404.
        const stored = guestbookRepository.seedEntry(mine.created.id);
        const crossed = await send(
          "PUT",
          `${PATH}/${mine.created.id}/guestbook/${stored.id}`,
          theirs.cookie,
          { hidden: true },
        );
        assert.equal(crossed.status, 404);
        assert.deepEqual(await crossed.json(), { code: "INVITATION_NOT_FOUND" });

        const ownInteresting = guestbookRepository.seedEntry(theirs.created.id);
        const wrongEntry = await send(
          "PUT",
          `${PATH}/${theirs.created.id}/guestbook/${ownInteresting.id}`,
          theirs.cookie,
          { hidden: "yes" },
        );
        assert.equal(wrongEntry.status, 400);
      });

      it("answers 404 for an entry id that names nothing of this invitation", async () => {
        const { cookie, created } = await published();
        const other = await published();

        const response = await send(
          "PUT",
          `${PATH}/${created.id}/guestbook/${UNKNOWN_ID}`,
          cookie,
          { hidden: true },
        );

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { code: "GUESTBOOK_ENTRY_NOT_FOUND" });

        // An entry of another invitation never changes, whatever the route names.
        const foreign = guestbookRepository.seedEntry(other.created.id);
        const crossed = await send("PUT", `${PATH}/${created.id}/guestbook/${foreign.id}`, cookie, {
          hidden: true,
        });
        assert.equal(crossed.status, 404);
        assert.deepEqual(await crossed.json(), { code: "GUESTBOOK_ENTRY_NOT_FOUND" });
        assert.equal(foreign.hidden, false);
      });

      it("keeps an archived invitation's entries readable and moderable", async () => {
        const { cookie, created } = await published();
        const entry = guestbookRepository.seedEntry(created.id);
        assert.equal((await send("POST", `${PATH}/${created.id}/archive`, cookie)).status, 200);

        const read = await send("GET", `${PATH}/${created.id}/guestbook`, cookie);
        assert.equal(read.status, 200);
        const written = await send("PUT", `${PATH}/${created.id}/guestbook/${entry.id}`, cookie, {
          hidden: true,
        });
        assert.equal(written.status, 200);
        assert.equal(entriesOf(created.id)[0]?.hidden, true);
      });

      it("refuses a malformed invitation id before it reaches a port, and answers a malformed entry id as the entry's 404", async () => {
        const { cookie, created } = await published();

        const malformedInvitation = await send("GET", `${PATH}/not-an-id/guestbook`, cookie);
        assert.equal(malformedInvitation.status, 400);

        // A valid invitation with an entry id that names no row is the entry's own 404, never the invitation's.
        const malformedEntry = await send(
          "PUT",
          `${PATH}/${created.id}/guestbook/not-an-entry`,
          cookie,
          { hidden: true },
        );
        assert.equal(malformedEntry.status, 404);
        assert.deepEqual(await malformedEntry.json(), { code: "GUESTBOOK_ENTRY_NOT_FOUND" });
        assert.equal(entriesOf(created.id).length, 0);
      });
    });
  });

  /** The guests the shared memory port holds for one invitation, so the assertions are not suite-wide. */
  const guestsOf = (invitationId: string) =>
    guestRepository.guests.filter((row) => row.invitationId === invitationId);
  /** The stored answers of one guest. */
  const responsesOf = (guestId: string) =>
    guestRepository.responses.filter((row) => row.guestId === guestId);

  describe("guest list creator routes (M6 G2; S1, S3, S4)", () => {
    /** A published invitation of the given package, created through the owner routes. */
    async function owned(cookie: string, packageId: string = QR_PASS_PACKAGE_ID) {
      const created = (await (
        await send("POST", PATH, cookie, { templateVersionId: PUBLISHED_VERSION_ID, packageId })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);
      return created;
    }

    const GUEST = { name: "  Ana   Pérez ", seats: 3, phone: "55 1234 5678", note: " Mesa 4 " };

    async function addGuest(cookie: string, id: string, body: unknown = GUEST) {
      const response = await send("POST", `${PATH}/${id}/guests`, cookie, body);
      assert.equal(response.status, 201, JSON.stringify(await response.clone().text()));
      return (await response.json()) as Row & { token: string; guest: Row & { id: string } };
    }

    it("creates a guest, answers the plain token once, and never returns it from the read", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);

      const response = await send("POST", `${PATH}/${created.id}/guests`, cookie, GUEST);

      assert.equal(response.status, 201);
      const body = (await response.json()) as Row & { token: string; guest: Row };
      assert.equal(typeof body.token, "string");
      assert.equal((body.token as string).length, 22);
      assert.deepEqual(Object.keys(body.guest).sort(), [
        "checkedInAt",
        "createdAt",
        "id",
        "name",
        "note",
        "phone",
        "response",
        "seats",
        "tableLabel",
        "tokenIssuedAt",
        "updatedAt",
      ]);
      assert.equal(body.guest.name, "Ana Pérez");
      assert.equal(body.guest.seats, 3);
      // A guest created without a table stores none, and the route answers it as null (F5; L8.1).
      assert.equal(body.guest.tableLabel, null);
      assert.equal(body.guest.phone, "+525512345678");
      assert.equal(body.guest.note, "Mesa 4");
      assert.equal(body.guest.response, null);
      assert.equal(body.guest.checkedInAt, null);

      const read = await send("GET", `${PATH}/${created.id}/guests`, cookie);
      assert.equal(read.status, 200);
      const list = (await read.json()) as Row;
      assert.deepEqual(Object.keys(list).sort(), ["guests", "totals"]);
      assert.deepEqual(list.totals, {
        guests: 1,
        seats: 3,
        attendingGuests: 0,
        attendingPeople: 0,
        attendingAdults: 0,
        attendingChildren: 0,
        declinedCount: 0,
        pendingCount: 1,
        checkedInCount: 0,
      });
      const text = JSON.stringify(list);
      assert.equal(text.includes(body.token), false, "the plain token is answered once");
      for (const internal of ["tokenHash", "dedupeKey", "invitationId", "ownerId"]) {
        assert.equal(text.includes(internal), false, internal);
      }
    });

    it("stores, keeps, and clears the table of a guest through the guest routes (F5; L8.1, L8.3, L20)", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);

      const response = await send("POST", `${PATH}/${created.id}/guests`, cookie, {
        ...GUEST,
        tableLabel: "  7  ",
      });
      assert.equal(response.status, 201);
      const body = (await response.json()) as Row & { guest: Row };
      assert.equal(body.guest.tableLabel, "7");
      const guestId = body.guest.id as string;

      // An edit that omits the field keeps the stored table, so a page written before the column existed still works.
      const omitted = await send("PUT", `${PATH}/${created.id}/guests/${guestId}`, cookie, {
        ...GUEST,
        name: "Ana María",
      });
      assert.equal(omitted.status, 200);
      assert.equal(((await omitted.json()) as Row).tableLabel, "7");

      const renamed = await send("PUT", `${PATH}/${created.id}/guests/${guestId}`, cookie, {
        ...GUEST,
        name: "Ana María",
        tableLabel: "Principal",
      });
      assert.equal(((await renamed.json()) as Row).tableLabel, "Principal");

      for (const cleared of [null, "   "] as const) {
        const emptied = await send("PUT", `${PATH}/${created.id}/guests/${guestId}`, cookie, {
          ...GUEST,
          name: "Ana María",
          tableLabel: cleared,
        });
        assert.equal(((await emptied.json()) as Row).tableLabel, null, JSON.stringify(cleared));
        // Reassign it, so the next round frees a stored table again.
        await send("PUT", `${PATH}/${created.id}/guests/${guestId}`, cookie, {
          ...GUEST,
          tableLabel: "7",
        });
      }
    });

    it("refuses a table the domain cannot store and leaves the stored guest unchanged (F5; L8.1)", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id, { ...GUEST, tableLabel: "7" });

      const refused: Array<[Record<string, unknown>, string[]]> = [
        [{ ...GUEST, tableLabel: "t".repeat(13) }, ["tableLabel must be at most 12 characters"]],
        [{ ...GUEST, tableLabel: 7 }, ["tableLabel must be a string or null"]],
      ];

      for (const [body, issues] of refused) {
        const created2 = await send("POST", `${PATH}/${created.id}/guests`, cookie, body);
        assert.equal(created2.status, 400, JSON.stringify(body));
        assert.deepEqual(await created2.json(), { code: "INVALID_GUEST", issues });

        const edited = await send("PUT", `${PATH}/${created.id}/guests/${guest.guest.id}`, cookie, {
          ...GUEST,
          ...body,
        });
        assert.equal(edited.status, 400, JSON.stringify(body));
        assert.deepEqual(await edited.json(), { code: "INVALID_GUEST", issues });
      }

      assert.equal(guestsOf(created.id).length, 1);
      const stored = guestsOf(created.id)[0];
      assert.equal(stored?.tableLabel, "7");
      assert.equal(stored?.name, "Ana Pérez");
    });

    it("answers 400 INVALID_GUEST with the domain issues and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);

      const refused: Array<[Record<string, unknown>, string[]]> = [
        [{ ...GUEST, name: "" }, ["name must be between 1 and 80 characters"]],
        [{ ...GUEST, seats: 0 }, ["seats must be between 1 and 10"]],
        [{ ...GUEST, seats: 11 }, ["seats must be between 1 and 10"]],
        [{ ...GUEST, seats: 2.5 }, ["seats must be an integer"]],
        [
          { ...GUEST, phone: "12345" },
          [
            "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          ],
        ],
        [{ ...GUEST, note: "n".repeat(201) }, ["note must be at most 200 characters"]],
        [
          { name: "", seats: 0, phone: "12345", note: "n".repeat(201) },
          [
            "name must be between 1 and 80 characters",
            "seats must be between 1 and 10",
            "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
            "note must be at most 200 characters",
          ],
        ],
      ];

      for (const [body, issues] of refused) {
        const response = await send("POST", `${PATH}/${created.id}/guests`, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { code: "INVALID_GUEST", issues });
      }
      assert.equal(guestsOf(created.id).length, 0);
    });

    it("answers 400 for a body with an unknown field or without a field", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);

      for (const body of [
        { ...GUEST, ownerId: UNKNOWN_ID },
        { ...GUEST, token: "A".repeat(22) },
        { name: "Ana" },
        {},
        "not-json",
      ]) {
        const response = await send("POST", `${PATH}/${created.id}/guests`, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(guestsOf(created.id).length, 0);
    });

    it("answers 409 GUEST_LIST_NOT_AVAILABLE for a package without the guest list", async () => {
      const { cookie } = await signedInCustomer();
      const premium = await owned(cookie, RSVP_PACKAGE_ID);

      for (const [method, path, body] of [
        ["GET", `${PATH}/${premium.id}/guests`, undefined],
        ["POST", `${PATH}/${premium.id}/guests`, GUEST],
        ["PUT", `${PATH}/${premium.id}/guests/${UNKNOWN_ID}`, GUEST],
        ["DELETE", `${PATH}/${premium.id}/guests/${UNKNOWN_ID}`, undefined],
        ["POST", `${PATH}/${premium.id}/guests/${UNKNOWN_ID}/token`, undefined],
      ] as const) {
        const response = await send(method, path, cookie, body);
        assert.equal(response.status, 409, `${method} ${path}`);
        assert.deepEqual(await response.json(), { code: "GUEST_LIST_NOT_AVAILABLE" });
      }
      assert.equal(guestsOf(premium.id).length, 0);
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps the list readable", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);
      assert.equal((await send("POST", `${PATH}/${created.id}/archive`, cookie)).status, 200);

      for (const [method, path, body] of [
        ["POST", `${PATH}/${created.id}/guests`, GUEST],
        ["PUT", `${PATH}/${created.id}/guests/${guest.guest.id}`, GUEST],
        ["DELETE", `${PATH}/${created.id}/guests/${guest.guest.id}`, undefined],
        ["POST", `${PATH}/${created.id}/guests/${guest.guest.id}/token`, undefined],
        ["POST", `${PATH}/${created.id}/guests/check-in`, { token: guest.token }],
      ] as const) {
        const response = await send(method, path, cookie, body);
        assert.equal(response.status, 409, `${method} ${path}`);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      }
      const read = await send("GET", `${PATH}/${created.id}/guests`, cookie);
      assert.equal(read.status, 200);
      const kept = (await read.json()) as Row & { guests: Row[] };
      assert.equal(kept.guests.length, 1);
    });

    it("reads the guests with their answers, the check-in state, the table, and the totals", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const first = await addGuest(cookie, created.id, {
        ...GUEST,
        name: "Ana",
        tableLabel: "7",
      });
      const second = await addGuest(cookie, created.id, {
        ...GUEST,
        name: "Beto",
        seats: 2,
        phone: null,
        note: null,
      });
      guestRepository.seedResponse(first.guest.id, { attending: true, partySize: 3 });
      guestRepository.seedResponse(second.guest.id, {
        attending: false,
        partySize: 0,
        message: null,
      });
      const checkedIn = guestRepository.guests.find((row) => row.id === first.guest.id);
      assert.ok(checkedIn);
      checkedIn.checkedInAt = new Date("2026-11-20T20:00:00.000Z");

      const response = await send("GET", `${PATH}/${created.id}/guests`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(body.totals, {
        guests: 2,
        seats: 5,
        attendingGuests: 1,
        attendingPeople: 3,
        attendingAdults: 3,
        attendingChildren: 0,
        declinedCount: 1,
        pendingCount: 0,
        checkedInCount: 1,
      });
      const guests = body.guests as Row[];
      assert.deepEqual(
        guests.map((guest) => guest.name),
        ["Beto", "Ana"],
      );
      assert.deepEqual(Object.keys(guests[1]?.response as Row).sort(), [
        "attending",
        "companions",
        "createdAt",
        "dietaryNotes",
        "message",
        "partySize",
        "updatedAt",
      ]);
      assert.equal(guests[1]?.checkedInAt, "2026-11-20T20:00:00.000Z");
      assert.equal(guests[0]?.response !== null, true);
      // The creator's read answers the assigned table, and null for a guest the owner left unassigned (F5; L8.3).
      assert.equal(guests[1]?.tableLabel, "7");
      assert.equal(guests[0]?.tableLabel, null);
    });

    it("edits a guest, refuses a seat count below the confirmed party, and answers 404 for a stranger", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id, { ...GUEST, seats: 3 });

      const edited = await send("PUT", `${PATH}/${created.id}/guests/${guest.guest.id}`, cookie, {
        name: "Ana María",
        seats: 5,
        phone: null,
        note: null,
      });
      assert.equal(edited.status, 200);
      const body = (await edited.json()) as Row;
      assert.equal(body.name, "Ana María");
      assert.equal(body.seats, 5);
      assert.equal(body.phone, null);
      assert.equal(body.note, null);

      guestRepository.seedResponse(guest.guest.id, { attending: true, partySize: 4 });
      const refused = await send("PUT", `${PATH}/${created.id}/guests/${guest.guest.id}`, cookie, {
        name: "Ana María",
        seats: 2,
        phone: null,
        note: null,
      });
      assert.equal(refused.status, 409);
      assert.deepEqual(await refused.json(), { code: "GUEST_SEATS_BELOW_RESPONSE", partySize: 4 });
      assert.equal(guestRepository.guests.find((row) => row.id === guest.guest.id)?.seats, 5);

      const other = await signedInCustomer();
      for (const id of [created.id, UNKNOWN_ID]) {
        const stranger = await send("PUT", `${PATH}/${id}/guests/${guest.guest.id}`, other.cookie, {
          name: "Intruso",
          seats: 1,
          phone: null,
          note: null,
        });
        assert.equal(stranger.status, 404, id);
        assert.deepEqual(await stranger.json(), { code: "INVITATION_NOT_FOUND" });
      }
    });

    it("removes a guest together with their answer and answers 404 for an unknown one", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);
      guestRepository.seedResponse(guest.guest.id);

      const response = await send(
        "DELETE",
        `${PATH}/${created.id}/guests/${guest.guest.id}`,
        cookie,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "deleted" });
      assert.equal(guestsOf(created.id).length, 0);
      assert.equal(responsesOf(guest.guest.id).length, 0);

      const again = await send("DELETE", `${PATH}/${created.id}/guests/${guest.guest.id}`, cookie);
      assert.equal(again.status, 404);
      assert.deepEqual(await again.json(), { code: "GUEST_NOT_FOUND" });
    });

    it("rotates the personal token, so the previous link stops resolving", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);

      const rotated = await send(
        "POST",
        `${PATH}/${created.id}/guests/${guest.guest.id}/token`,
        cookie,
      );

      assert.equal(rotated.status, 200);
      const body = (await rotated.json()) as Row & { token: string };
      assert.equal((body.token as string).length, 22);
      assert.notEqual(body.token, guest.token);
      assert.equal(JSON.stringify(body.guest).includes(body.token), false);

      const oldLink = await send(
        "GET",
        `/public/invitations/${created.slug}/guests/${guest.token}`,
      );
      assert.equal(oldLink.status, 404);
      const newLink = await send("GET", `/public/invitations/${created.slug}/guests/${body.token}`);
      assert.equal(newLink.status, 200);
    });

    it("checks a confirmed guest in once and answers the party of the first check-in", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id, { ...GUEST, seats: 3 });
      guestRepository.seedResponse(guest.guest.id, { attending: true, partySize: 2 });

      const first = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: guest.token,
      });

      assert.equal(first.status, 200);
      const body = (await first.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), [
        "attendingPartySize",
        "checkedInAt",
        "guestId",
        "name",
        "seats",
      ]);
      assert.equal(body.guestId, guest.guest.id);
      assert.equal(body.name, "Ana Pérez");
      assert.equal(body.seats, 3);
      assert.equal(body.attendingPartySize, 2);
      const checkedInAt = body.checkedInAt;

      const second = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: guest.token,
      });
      assert.equal(second.status, 200);
      assert.equal(((await second.json()) as Row).checkedInAt, checkedInAt);
      assert.equal(
        guestRepository.guests.find((row) => row.id === guest.guest.id)?.checkedInAt?.toISOString(),
        checkedInAt,
      );
    });

    it("refuses a check-in of an unconfirmed guest, an unknown token, and a package without the QR pass", async () => {
      const { cookie } = await signedInCustomer();
      const created = await owned(cookie);
      const guest = await addGuest(cookie, created.id);

      const unconfirmed = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: guest.token,
      });
      assert.equal(unconfirmed.status, 409);
      assert.deepEqual(await unconfirmed.json(), { code: "GUEST_NOT_CONFIRMED" });

      const unknown = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: "Z".repeat(22),
      });
      assert.equal(unknown.status, 404);
      assert.deepEqual(await unknown.json(), { code: "GUEST_NOT_FOUND" });

      const malformed = await send("POST", `${PATH}/${created.id}/guests/check-in`, cookie, {
        token: "not-a-token",
      });
      assert.equal(malformed.status, 404);
      assert.deepEqual(await malformed.json(), { code: "GUEST_NOT_FOUND" });

      const noQr = await owned(cookie, GUEST_LIST_PACKAGE_ID);
      const plain = await addGuest(cookie, noQr.id);
      guestRepository.seedResponse(plain.guest.id);
      const refused = await send("POST", `${PATH}/${noQr.id}/guests/check-in`, cookie, {
        token: plain.token,
      });
      assert.equal(refused.status, 409);
      assert.deepEqual(await refused.json(), { code: "QR_PASS_NOT_AVAILABLE" });

      const other = await signedInCustomer();
      const stranger = await send("POST", `${PATH}/${created.id}/guests/check-in`, other.cookie, {
        token: guest.token,
      });
      assert.equal(stranger.status, 404);
      assert.deepEqual(await stranger.json(), { code: "INVITATION_NOT_FOUND" });
    });

    it("exports the guest list in guest-list mode and keeps the open form's export otherwise", async () => {
      const { cookie } = await signedInCustomer();
      const guestList = await owned(cookie);
      const guest = await addGuest(cookie, guestList.id, {
        ...GUEST,
        name: "Ana",
        seats: 3,
        tableLabel: "7",
      });
      await addGuest(cookie, guestList.id, {
        ...GUEST,
        name: "Beto",
        seats: 1,
        phone: null,
        note: null,
      });
      guestRepository.seedResponse(guest.guest.id, { attending: true, partySize: 2 });

      const response = await send("GET", `${PATH}/${guestList.id}/rsvp.csv`, cookie);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(
        response.headers.get("content-disposition"),
        `attachment; filename="asistencia-${guestList.slug}.csv"`,
      );
      const lines = (await response.text()).split("\r\n");
      assert.equal(
        lines[0],
        "Nombre,Lugares,Mesa,Asistencia,Personas,Acompañantes,Niños,Restricciones alimentarias,Teléfono,Nota,Mensaje,Primer check-in,Primera respuesta,Última actualización",
      );
      const beto = guestsOf(guestList.id).find((row) => row.name === "Beto");
      assert.deepEqual(lines.slice(1, 3).sort(), [
        "Ana,3,7,Sí,2,,0,,'+525512345678,Mesa 4,Vamos,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
        `Beto,1,,Pendiente,,,,,,,,,,${beto?.updatedAt.toISOString()}`,
      ]);

      // The open form keeps its own export (M6 G1 preserved).
      const premium = await owned(cookie, RSVP_PACKAGE_ID);
      rsvpRepository.seedResponse(premium.id, { name: "Abierta" });
      const open = await send("GET", `${PATH}/${premium.id}/rsvp.csv`, cookie);
      assert.equal(
        (await open.text()).split("\r\n")[0],
        "Nombre,Asistencia,Personas,Acompañantes,Niños,Restricciones alimentarias,Teléfono,Mensaje,Primera respuesta,Última actualización",
      );
    });
  });

  describe("public guest routes (M6 G2; S1, S4)", () => {
    const PUBLIC_PATH = "/public/invitations";

    /** A published invitation of the given package, created through the owner routes. */
    async function published(packageId: string = QR_PASS_PACKAGE_ID) {
      const { cookie } = await signedInCustomer();
      const created = (await (
        await send("POST", PATH, cookie, { templateVersionId: PUBLISHED_VERSION_ID, packageId })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);
      const guest = guestRepository.seedGuest(created.id, {
        token: "A".repeat(22),
        name: "Ana",
        seats: 3,
        note: "Mesa 4",
        tableLabel: "7",
      });
      return { cookie, created, guest };
    }

    const guestPath = (slug: string, token: string) => `${PUBLIC_PATH}/${slug}/guests/${token}`;

    it("never carries the table on the open public read, only in the guest block (F5; L8.4)", async () => {
      const { created } = await published();

      const open = await send("GET", `${PUBLIC_PATH}/${created.slug}`);
      assert.equal(open.status, 200);
      assert.equal(JSON.stringify(await open.json()).includes("tableLabel"), false);

      const personal = (await (
        await send("GET", guestPath(created.slug, "A".repeat(22)))
      ).json()) as Row;
      assert.equal((personal.guest as Row).tableLabel, "7");
    });

    it("answers the published page plus this guest, and nothing about another guest", async () => {
      const { created, guest } = await published();
      guestRepository.seedGuest(created.id, { token: "B".repeat(22), name: "Beto" });
      guestRepository.seedResponse(guest.id, {
        attending: true,
        partySize: 2,
        message: "Vamos",
      });

      const response = await send("GET", guestPath(created.slug, "A".repeat(22)));

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), [
        "componentKey",
        "configuration",
        "content",
        "expired",
        "features",
        "guest",
        "hiddenFields",
        "places",
        "publishedAt",
        "redirectTo",
        "slug",
        "timeZone",
      ]);
      assert.equal(body.expired, false);
      assert.deepEqual(body.guest, {
        name: "Ana",
        seats: 3,
        tableLabel: "7",
        response: {
          attending: true,
          partySize: 2,
          companions: [],
          dietaryNotes: null,
          message: "Vamos",
        },
        qrPass: true,
      });
      assert.deepEqual((body.features as Row).rsvp, {
        mode: "guest-list",
        deadline: null,
        partyLimit: 4,
        qrPass: true,
      });
      const text = JSON.stringify(body);
      for (const secret of ["Beto", "A".repeat(22), guest.tokenHash, created.id, "tokenHash"]) {
        assert.equal(text.includes(secret), false, secret);
      }
    });

    it("offers the QR pass only to a confirmed guest whose package grants it", async () => {
      const noQr = await published(GUEST_LIST_PACKAGE_ID);
      guestRepository.seedResponse(noQr.guest.id);
      const page = (await (
        await send("GET", guestPath(noQr.created.slug, "A".repeat(22)))
      ).json()) as Row;
      assert.equal((page.guest as Row).qrPass, false);
      assert.equal(((page.features as Row).rsvp as Row).qrPass, false);

      const deluxe = await published();
      const pending = (await (
        await send("GET", guestPath(deluxe.created.slug, "A".repeat(22)))
      ).json()) as Row;
      assert.equal((pending.guest as Row).qrPass, false, "no answer yet");
      guestRepository.seedResponse(deluxe.guest.id, { attending: false, partySize: 0 });
      const declined = (await (
        await send("GET", guestPath(deluxe.created.slug, "A".repeat(22)))
      ).json()) as Row;
      assert.equal((declined.guest as Row).qrPass, false, "declined");
    });

    it("answers the same invisible 404 for a revoked, unknown, foreign, or malformed token and an invisible slug", async () => {
      const first = await published();
      const second = await published();
      const otherToken = "B".repeat(22);
      guestRepository.seedGuest(second.created.id, { token: otherToken, name: "Otra" });
      await send(
        "POST",
        `${PATH}/${first.created.id}/guests/${first.guest.id}/token`,
        first.cookie,
      );
      const draft = (await (
        await send("POST", PATH, first.cookie, {
          templateVersionId: PUBLISHED_VERSION_ID,
          packageId: QR_PASS_PACKAGE_ID,
        })
      ).json()) as Row & { id: string; slug: string };

      const probes = [
        guestPath(first.created.slug, "A".repeat(22)),
        guestPath(first.created.slug, otherToken),
        guestPath(first.created.slug, "Z".repeat(22)),
        guestPath(first.created.slug, "not-a-token"),
        guestPath("invitacion-never01", "A".repeat(22)),
        guestPath(String(draft.slug), "A".repeat(22)),
      ];

      for (const path of probes) {
        const response = await send("GET", path);
        assert.equal(response.status, 404, path);
        assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    });

    it("stores the guest's answer and answers the same minimal 202 for a change of mind", async () => {
      const { created, guest } = await published();
      const path = `${guestPath(created.slug, "A".repeat(22))}/rsvp`;

      const response = await send("POST", path, undefined, {
        attending: true,
        partySize: 3,
        message: "  Vamos ",
      });

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(responsesOf(guest.id).length, 1);
      assert.equal(responsesOf(guest.id)[0]?.partySize, 3);
      assert.equal(responsesOf(guest.id)[0]?.message, "Vamos");

      const retry = await send("POST", path, undefined, {
        attending: false,
        partySize: 0,
        message: null,
      });
      assert.equal(retry.status, 202);
      assert.deepEqual(await retry.json(), { status: "received" });
      assert.equal(responsesOf(guest.id).length, 1);
      assert.equal(responsesOf(guest.id)[0]?.attending, false);
    });

    it("answers 400 INVALID_RSVP with the issues and 400 for an unknown field", async () => {
      const { created, guest } = await published();
      const path = `${guestPath(created.slug, "A".repeat(22))}/rsvp`;

      for (const [body, issues] of [
        [
          { attending: true, partySize: 4, message: null },
          ["partySize must be between 1 and 3 when attending"],
        ],
        [
          { attending: false, partySize: 1, message: null },
          ["partySize must be 0 when not attending"],
        ],
        [
          { attending: true, partySize: 1, message: "x".repeat(281) },
          ["message must be at most 280 characters"],
        ],
      ] as const) {
        const response = await send("POST", path, undefined, body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.deepEqual(await response.json(), { code: "INVALID_RSVP", issues });
      }
      for (const body of [
        { attending: true, partySize: 1, name: "Otra" },
        { attending: true, partySize: 1, phone: "5512345678" },
        { attending: "yes", partySize: 1 },
        { name: "Ana" },
        "not-json",
      ]) {
        const response = await send("POST", path, undefined, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(
        guestRepository.responses.some((row) => row.guestId === guest.id),
        false,
      );
    });

    it("answers 409 RSVP_NOT_OPEN for an invitation without a guest list and for a passed deadline, and 429 over the cap", async () => {
      const open = await published(RSVP_PACKAGE_ID);
      const openGuest = guestRepository.seedGuest(open.created.id, { token: "C".repeat(22) });
      assert.ok(openGuest);
      const openResponse = await send(
        "POST",
        `${guestPath(open.created.slug, "C".repeat(22))}/rsvp`,
        undefined,
        {
          attending: true,
          partySize: 1,
          message: null,
        },
      );
      assert.equal(openResponse.status, 409);
      assert.deepEqual(await openResponse.json(), { code: "RSVP_NOT_OPEN" });

      const closed = await published();
      await send("PUT", `${PATH}/${closed.created.id}/rsvp-settings`, closed.cookie, {
        deadline: "2020-01-01T00:00:00.000Z",
        partyLimit: 4,
      });
      const closedResponse = await send(
        "POST",
        `${guestPath(closed.created.slug, "A".repeat(22))}/rsvp`,
        undefined,
        { attending: true, partySize: 1, message: null },
      );
      assert.equal(closedResponse.status, 409);
      assert.deepEqual(await closedResponse.json(), { code: "RSVP_NOT_OPEN" });

      const limited = await published();
      rateLimiter.allow = false;
      try {
        const response = await send(
          "POST",
          `${guestPath(limited.created.slug, "A".repeat(22))}/rsvp`,
          undefined,
          { attending: true, partySize: 1, message: null },
        );
        assert.equal(response.status, 429);
        assert.deepEqual(await response.json(), { code: "RSVP_RATE_LIMITED" });
      } finally {
        rateLimiter.allow = true;
      }
      const refusals = [openGuest.id, closed.guest.id, limited.guest.id];
      assert.equal(
        guestRepository.responses.some((row) => refusals.includes(row.guestId)),
        false,
        "no submission was stored",
      );
    });

    it("serves the same answer with a forged cookie, never reading a session", async () => {
      const { created } = await published();

      const response = await send(
        "POST",
        `${guestPath(created.slug, "A".repeat(22))}/rsvp`,
        `${SESSION_COOKIE}=forged.value`,
        { attending: true, partySize: 1, message: null },
      );

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { status: "received" });
    });
  });

  describe("invitation view counting (M9 T11; S2, S3, S7, L12)", () => {
    const PUBLIC_PATH = "/public/invitations";

    /** A published invitation created through the owner routes, so the public read serves it. */
    async function published(packageId: string = RSVP_PACKAGE_ID) {
      const { cookie } = await signedInCustomer();
      const created = (await (
        await send("POST", PATH, cookie, { templateVersionId: PUBLISHED_VERSION_ID, packageId })
      ).json()) as Row & { id: string; slug: string };
      await send("PUT", `${PATH}/${created.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${created.id}/publish`, cookie)).status, 200);

      return { cookie, created };
    }

    /** A stored row inserted directly, for the states the owner routes cannot produce here. */
    function seed(overrides: {
      slug: string;
      status: InvitationStatus;
      templateVersionId?: string;
    }): InvitationRecordWithMusic {
      const at = new Date(Date.UTC(2026, 9, 12, 9, 0, 0));
      const row: InvitationRecordWithMusic = {
        id: randomUUID(),
        ownerId: randomUUID(),
        templateVersionId: overrides.templateVersionId ?? PUBLISHED_VERSION_ID,
        packageId: ACTIVE_PACKAGE_ID,
        slug: overrides.slug,
        status: overrides.status,
        content: { title: "Cumpleaños de Ana" },
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        playlistTitle: null,
        playlistCoverUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        livestream: null,
        openingAnimation: true,
        reminders: null,
        passwordProtected: false,
        rsvpDeadline: null,
        rsvpPartyLimit: 4,
        places: {},
        archivedAt: overrides.status === "ARCHIVED" ? at : null,
        publishedAt: overrides.status === "PUBLISHED" ? at : null,
        firstPublishedAt: overrides.status === "PUBLISHED" ? at : null,
        expiresAt: null,
        createdAt: at,
        updatedAt: at,
      };
      repository.rows.push(row);
      return row;
    }

    it("counts exactly one PUBLIC opening of the public page, with the request's own instant", async () => {
      const { created } = await published();
      const before = viewRepository.increments.length;
      const startedAt = Date.now();

      const response = await send("GET", `${PUBLIC_PATH}/${created.slug}`);

      assert.equal(response.status, 200);
      const counted = viewRepository.increments.slice(before);
      assert.equal(counted.length, 1);
      assert.equal(counted[0]?.invitationId, created.id);
      assert.equal(counted[0]?.source, "PUBLIC");
      const at = counted[0]?.at.getTime() ?? 0;
      assert.ok(at >= startedAt - 1_000 && at <= Date.now() + 1_000, "the request's own instant");
    });

    it("counts nothing for an unknown, draft, archived, or unrenderable slug (A3)", async () => {
      const cases = [
        "invitacion-never0",
        seed({ slug: "invitacion-draft0", status: "DRAFT" }).slug,
        seed({ slug: "invitacion-archiv", status: "ARCHIVED" }).slug,
        seed({
          slug: "invitacion-norend",
          status: "PUBLISHED",
          templateVersionId: UNRENDERABLE_VERSION_ID,
        }).slug,
        seed({ slug: "invitacion-novers", status: "PUBLISHED", templateVersionId: UNKNOWN_ID })
          .slug,
        "Invitacion-Mayus",
      ];
      const before = viewRepository.increments.length;

      for (const slug of cases) {
        const response = await send("GET", `${PUBLIC_PATH}/${slug}`);

        assert.equal(response.status, 404, slug);
      }
      assert.equal(viewRepository.increments.length, before, "an invisible page counts nothing");
    });

    it("counts a GUEST opening of a personal link, never a PUBLIC one, and no RSVP submission", async () => {
      const { created } = await published(QR_PASS_PACKAGE_ID);
      const guest = guestRepository.seedGuest(created.id, {
        token: "A".repeat(22),
        name: "Ana",
        seats: 3,
      });
      const before = viewRepository.increments.length;

      const page = await send("GET", `${PUBLIC_PATH}/${created.slug}/guests/${"A".repeat(22)}`);
      assert.equal(page.status, 200);
      const counted = viewRepository.increments.slice(before);
      assert.deepEqual(
        counted.map((increment) => [increment.invitationId, increment.source]),
        [[created.id, "GUEST"]],
      );

      const submit = await send(
        "POST",
        `${PUBLIC_PATH}/${created.slug}/guests/${"A".repeat(22)}/rsvp`,
        undefined,
        { attending: true, partySize: 1, message: null },
      );
      assert.equal(submit.status, 202);
      assert.equal(viewRepository.increments.length, before + 1, "an answer is not an opening");
      assert.equal(guest.id, guest.id);
    });

    it("does not count an open-form RSVP submission or the owner's own preview", async () => {
      const { cookie, created } = await published();
      const before = viewRepository.increments.length;

      const submit = await send("POST", `${PUBLIC_PATH}/${created.slug}/rsvp`, undefined, {
        name: "Ana",
        attending: true,
        partySize: 1,
      });
      assert.equal(submit.status, 202);

      const preview = await send("GET", `${PATH}/${created.id}`, cookie);
      assert.equal(preview.status, 200);

      assert.equal(
        viewRepository.increments.length,
        before,
        "neither an answer nor a preview is an opening",
      );
    });

    it("answers the same page when the counter fails, and logs one line without a slug or an id", async () => {
      const { created } = await published();
      const healthy = await send("GET", `${PUBLIC_PATH}/${created.slug}`);
      const expectedBody = await healthy.text();
      const recorded: unknown[][] = [];
      const spy = mock.method(Logger.prototype, "warn", (...args: unknown[]) => {
        recorded.push(args);
      });

      viewRepository.fail = true;
      let failed: Response;
      try {
        failed = await send("GET", `${PUBLIC_PATH}/${created.slug}`);
      } finally {
        viewRepository.fail = false;
        spy.mock.restore();
      }

      assert.equal(healthy.status, 200);
      assert.equal(failed.status, 200, "a counter fault never changes the guest's answer");
      assert.equal(await failed.text(), expectedBody);
      assert.equal(failed.headers.get("cache-control"), healthy.headers.get("cache-control"));

      const lines = recorded.filter(
        ([first]) =>
          (first as { event?: string } | undefined)?.event === "invitation_view_count_failed",
      );
      assert.equal(lines.length, 1, "the fault is reported once");
      assert.deepEqual(lines[0]?.[0], { event: "invitation_view_count_failed" });
      const text = JSON.stringify(lines[0]?.[0]);
      assert.equal(text.includes(created.id), false, "no invitation id is logged");
      assert.equal(text.includes(created.slug), false, "no slug is logged");
    });
  });
});
