import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  InvalidInvitationContentError,
  InvalidInvitationFeaturesError,
  InvalidInvitationPlaceError,
  InvalidInvitationSlugError,
  InvalidPlaceQueryError,
  InvitationContentConflictError,
  InvitationPackageDoesNotFitError,
  InvitationPackageNotFoundError,
  InvitationPaymentRequiredError,
  InvitationSlugRenameConflictError,
  InvitationSlugRenameLimitError,
  InvitationSlugTakenError,
  InvitationSlugUnavailableError,
  InvitationTemplateVersionNotPublishedError,
  PlaceSearchRateLimitedError,
  SlugAvailabilityRateLimitedError,
} from "../application/invitation.application.errors";
import type {
  InvitationListItem,
  InvitationSummary,
  OwnedInvitation,
} from "../application/invitation.use-cases";
import type { PublicInvitation } from "../application/invitation-public";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishableError,
  InvitationNotPublishedError,
  ReservedInvitationSlugError,
} from "../domain/invitation.errors";
import type { InvitationRole } from "../../collaborators/application/invitation-access";
import type { InvitationPermission } from "../../collaborators/domain/invitation-collaborator";
import type { JsonObject } from "../domain/invitation-content";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type { PlacePoint } from "../domain/invitation-place";

// The stable REST shapes of an invitation (M4 T4 and M5 T4; S1, S3, S7, S9, A3, A4, A7). `ownerId` is
// deliberately absent: it comes from the session and never belongs in a response (S9). An id that names nothing,
// or names another customer's invitation, answers the same 404 (A4), so a response never confirms that a foreign
// row exists. `expiresAt` is absent too: the guest page reads the boolean the API decided (`expired`), never the
// instant, so no client can compute a different answer from the one the API stated (S1, S2).

/**
 * The stable REST shape of one row of "Mis invitaciones". `publishedAt` is the publication instant, null while
 * the invitation is a draft; it is what the owner sees, never the expiry the API decided from the package (S7).
 */
export interface InvitationSummaryResponse {
  id: string;
  templateVersionId: string;
  packageId: string;
  slug: string;
  status: InvitationStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One row of "Mis invitaciones" as the list serves it (T2; S2.6): the summary plus the stored content and the
 * renderer identity of the pinned version, so the card renders the celebration's name, its date, and a miniature of
 * the real layout. The renderer and its configuration are null when the catalog answers no render data for the
 * pinned version, and then the card falls back to the content and the slug; nothing else of the summary changes.
 */
export interface InvitationListItemResponse extends InvitationSummaryResponse {
  content: JsonObject;
  componentKey: string | null;
  configuration: unknown;
  /**
   * The caller's role on this row (F12; L17.5): `OWNER` for an invitation the session user owns, `COLLABORATOR` for one
   * another owner shared with it. The card renders «Compartida contigo» from it and offers only the tabs the role may
   * use; the API checks every permission again on each request, so the field is a convenience the web never relies on.
   */
  role: InvitationRoleResponse;
  /**
   * What the caller may do here, in the domain's canonical order: empty for the owner, whose authority is not a
   * permission set, and at least one permission for a collaborator (L17.2).
   */
  permissions: readonly InvitationPermissionResponse[];
}

/** Who the caller is for one invitation, as the reads answer it (F12; L17.4). */
export type InvitationRoleResponse = InvitationRole;

/** One grantable permission, as the reads answer it (F12; L17.2). */
export type InvitationPermissionResponse = InvitationPermission;

/**
 * One invitation as its owner edits it: the stored fields, the content, the feature data, the gated features the
 * guest will see, and the fields it still lacks (F1; S4, S7).
 */
export interface OwnedInvitationResponse extends InvitationSummaryResponse {
  content: JsonObject;
  missingRequiredFields: string[];
  /**
   * The caller's role on this invitation (F12; L17.4, L17.5): `OWNER`, or `COLLABORATOR` when another owner shared it.
   * The editor offers only what the role may do, and the API checks the route's permission again on every request.
   */
  role: InvitationRoleResponse;
  /** What the caller may do here: empty for the owner, at least one permission for a collaborator (L17.2). */
  permissions: readonly InvitationPermissionResponse[];
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
    /**
     * The stored plan of the day as the validated payload `{ version: 1, items: [...] }`, or null when the invitation
     * has none (F1; L3.1). The owner's read answers the version so the editor can send the same payload back.
     */
    itinerary: {
      version: 1;
      items: Array<{ time: string; title: string; place?: string; address?: string }>;
    } | null;
    /**
     * The stored gift registry as the validated payload `{ version: 1, stores, transfer?, envelopes, note? }`, or null
     * when the invitation has none (F2; L4.1). The owner's read answers the version so the editor can send the same
     * payload back.
     */
    giftRegistry: {
      version: 1;
      stores: Array<{ name: string; reference?: string; url: string }>;
      transfer?: { bank: string; holder: string; clabe: string };
      envelopes: boolean;
      note?: string;
    } | null;
    /**
     * The stored lodging as the validated payload `{ version: 1, hotels, transport? }`, or null when the invitation has
     * none (F4; L7.1). The owner's read answers the version so the editor can send the same payload back.
     */
    lodging: {
      version: 1;
      hotels: Array<{
        name: string;
        distance?: string;
        price?: string;
        groupCode?: string;
        bookingUrl?: string;
        address?: string;
      }>;
      transport?: string;
    } | null;
    /**
     * The stored livestream as the validated payload `{ version: 1, url, note? }`, or null when the invitation has none
     * (F9; L12.1). The owner's read answers the version so the editor can send the same payload back.
     */
    livestream: { version: 1; url: string; note?: string } | null;
    /**
     * The stored opening animation switch (F10; L14.3), true by default. The owner's read answers the switch itself so the
     * editor shows the state the guest page will use; the public read answers the decision instead.
     */
    openingAnimation: boolean;
    /**
     * The stored reminder switches as the validated payload `{ version: 1, pendingRsvp, eventEve }`, or null while the
     * owner switched nothing on (F6; L9.1). The owner's read answers the version so the editor can send the same payload
     * back, and the switches work as soon as a sender is configured.
     */
    reminders: { version: 1; pendingRsvp: boolean; eventEve: boolean } | null;
    /**
     * The stored language of the invitation (F14; L19.1): `es`, `es-en`, or `en`. The owner's read answers the stored choice
     * so the editor shows the option it holds; the public read answers the decision instead.
     */
    language: "es" | "es-en" | "en";
  };
  /**
   * How many times the owner may still rename the address (F11; S2.11, L15.2). It is added beside the fields the body
   * already carried and changes none of them, so a page deployed before it reads the body it always read (L20).
   */
  slugRenamesRemaining: number;
  /**
   * Whether a shared access code protects this invitation (F13; S2.13, L18.1). It is added beside the fields the body
   * already carried and changes none of them, so a page deployed before it reads the body it always read (L20). The code
   * itself is never answered: the owner sees it once, when setting it.
   */
  passwordProtected: boolean;
  /**
   * Whether this deployment can deliver a WhatsApp reminder at all (F6; S6, L9.5): a capability, never a secret. False
   * is what the editor's reminder block shows as «Aún no está activo», and it never hides the switches, because they
   * are stored and take effect the moment a provider is configured.
   */
  remindersConfigured: boolean;
  /** The gated feature keys the guest will see, `CALENDAR` included (S4). */
  availableFeatures: string[];
  /**
   * The points the owner stored for the invitation's address fields, keyed by the content field each one belongs to
   * (S2). Every stored point is answered, so the editor can say whether each location is still confirmed.
   */
  places: Record<string, PlacePoint>;
}

/**
 * What a guest's page renders (M5 T4, F1; S2, S3, S4, A7): the renderer identity, its configuration, the content
 * keys the pinned schema declares, the slug, the publication instant, the invitation's time zone, and the gated
 * features. Nothing else is here, so no owner, package, price, status, package feature key, or internal id can
 * leak by accident (S4).
 */
export interface PublicInvitationResponse {
  slug: string;
  componentKey: string;
  configuration: unknown;
  content: JsonObject;
  /**
   * The content property names the invitation's omitted sections cover (S8.3), so the layouts know which block
   * not to draw without holding the schema; the values of those fields are absent from `content`. Always a
   * list, empty when the invitation omits nothing.
   */
  hiddenFields: string[];
  publishedAt: string | null;
  timeZone: string;
  features: {
    countdown: boolean;
    map: boolean;
    calendar: true;
    whatsapp: { phone: string } | null;
    /**
     * The playlist link, the service it names, and the metadata the provider answered, or null when the feature is
     * not available (S7, S2). `title` and `coverUrl` are always present and null when no lookup stored one.
     */
    music: {
      url: string;
      provider: string;
      title: string | null;
      coverUrl: string | null;
    } | null;
    /**
     * The moments of the day in the owner's order, or null when the package does not grant `ITINERARY` or the
     * invitation stores none (F1; L3.3). A guest page reads the list, never the payload's version.
     */
    itinerary: {
      items: Array<{ time: string; title: string; place?: string; address?: string }>;
    } | null;
    /**
     * Whether the pinned package grants `GIFT_REGISTRY`, which is also what lets each layout draw an older
     * invitation's content text field (F2; L4.3). It keeps the boolean the field always answered: the gate, never the
     * data.
     */
    giftRegistry: boolean;
    /**
     * The structured gift registry a guest's card draws, or null when the package does not grant `GIFT_REGISTRY` or
     * the invitation stores nothing a card would show (F2; L4.3). The transfer and the note are always present, null
     * when there is none.
     */
    giftRegistryDetails: {
      stores: Array<{ name: string; reference?: string; url: string }>;
      transfer: { bank: string; holder: string; clabe: string } | null;
      envelopes: boolean;
      note: string | null;
    } | null;
    /**
     * The hotel cards and the transport line a guest's block draws, or null when the package does not grant `LODGING`
     * or the invitation stores nothing there (F4; L7.3). The transport is always present, null when there is none.
     */
    lodging: {
      hotels: Array<{
        name: string;
        distance?: string;
        price?: string;
        groupCode?: string;
        bookingUrl?: string;
        address?: string;
      }>;
      transport: string | null;
    } | null;
    /**
     * The gallery photos in position order (M8 S4), an empty array when the package does not grant `GALLERY`; each
     * one is an absolute API URL with the dimensions the layout reserves and the creator's alt text.
     */
    gallery: Array<{ url: string; width: number; height: number; alt: string | null }>;
    /**
     * The livestream a guest's block draws (F9; L12.3): the stored link, the video id the API resolved when it is an
     * embeddable YouTube one, or null when the guest may only open the link, and the note as null when the owner wrote
     * none. It is null when the pinned package does not grant `LIVESTREAM` or the invitation stores no link. It is added
     * beside the fields the body already carried and changes none of them, so a page deployed before it reads the body
     * it always read.
     */
    livestream: { url: string; videoId: string | null; note: string | null } | null;
    /**
     * Whether the guest page draws the opening animation (F10; L14.4): true only while the pinned package grants
     * `OPENING_ANIMATION` and the owner's switch is on. It is added beside the fields the body already carried and
     * changes none of them, so a page deployed before it reads the body it always read, and a page that reads an absent
     * field plays no animation (L20).
     */
    openingAnimation: boolean;
    /**
     * The guestbook wall (F7; L10.4): the visible entries newest first, at most 50, each one the signature and the
     * message a guest signed, as plain text. It is the list itself — an empty array is a wall waiting for its first
     * message — and null only when the pinned package does not grant `GUESTBOOK`. It is added beside the fields the
     * body already carried and changes none of them, so a page deployed before it reads the body it always read.
     */
    guestbook: Array<{ authorName: string; message: string }> | null;
    /**
     * The album of the guests' photos (F8; L11.4): the newest published photos — at most 60 — and how many published
     * photos the invitation holds in total, each photo an absolute API URL and the optional name its uploader typed. It
     * is the album itself — an empty list is an album waiting for its first photo — and null only when the pinned
     * package does not grant `GUEST_ALBUM`. Pending and hidden photos are never answered. It is added beside the fields
     * the body already carried and changes none of them, so a page deployed before it reads the body it always read.
     */
    guestAlbum: {
      photos: Array<{ url: string; uploaderName: string | null }>;
      count: number;
    } | null;
    /**
     * How the guest page accepts attendance answers (M6 G1, G2; S4): `open`, `guest-list`, or `null`, with the
     * creator's deadline as an ISO instant (or null) and the party limit, and whether a confirmed guest's personal
     * page may show the access QR.
     */
    rsvp: {
      mode: "open" | "guest-list" | null;
      deadline: string | null;
      partyLimit: number;
      qrPass: boolean;
    };
    /**
     * The language a guest's page renders (F14; S2.14, L19.1, L19.5): `es`, `es-en`, or `en`. With `es-en` the page draws
     * the server-rendered ES / EN switch; with `en` every fixed text is English. It is the effective answer — the owner's
     * choice while the package grants `ENGLISH_INVITATION` and Spanish otherwise — added beside the fields the body
     * already carried and changing none of them, so a page deployed before it reads the body it always read (L20).
     */
    language: "es" | "es-en" | "en";
  };
  /**
   * The stored points a guest may see, keyed by the address field each one belongs to (S2): only while the package
   * grants MAP and only while the address text still equals the label the point was stored with. Empty otherwise.
   */
  places: Record<string, PlacePoint>;
  /**
   * Whether the invitation passed its expiry and is read-only (S2, T3). The page still renders the invitation; this is
   * what closes its RSVP. It is a boolean, never the instant, so the API keeps deciding when the expiration happened.
   */
  expired: boolean;
  /**
   * The current address when the guest arrived through a previous one (F11; S2.11, L15.3), or null when the slug the
   * guest asked for is the current one. The web answers it with a permanent redirect before rendering, so an already
   * shared link keeps working. It is added beside the fields the body already carried and changes none of them, so a
   * page deployed before it reads the body it always read (L20).
   */
  redirectTo: string | null;
}

export function toInvitationSummaryResponse(stored: InvitationSummary): InvitationSummaryResponse {
  return {
    id: stored.id,
    templateVersionId: stored.templateVersionId,
    packageId: stored.packageId,
    slug: stored.slug,
    status: stored.status,
    publishedAt: stored.publishedAt?.toISOString() ?? null,
    archivedAt: stored.archivedAt?.toISOString() ?? null,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

export function toInvitationListItemResponse(
  stored: InvitationListItem,
): InvitationListItemResponse {
  return {
    ...toInvitationSummaryResponse(stored),
    content: stored.content,
    componentKey: stored.componentKey,
    configuration: stored.configuration,
    role: stored.role,
    permissions: [...stored.permissions],
  };
}

export function toOwnedInvitationResponse(
  stored: OwnedInvitation,
  access: {
    readonly role: InvitationRoleResponse;
    readonly permissions: readonly InvitationPermissionResponse[];
  } = {
    role: "OWNER",
    permissions: [],
  },
): OwnedInvitationResponse {
  return {
    ...toInvitationSummaryResponse(stored),
    content: stored.content,
    missingRequiredFields: [...stored.missingRequiredFields],
    role: access.role,
    permissions: [...access.permissions],
    timeZone: stored.timeZone,
    featureSettings: {
      whatsappPhone: stored.featureSettings.whatsappPhone,
      playlistUrl: stored.featureSettings.playlistUrl,
      playlistTitle: stored.featureSettings.playlistTitle,
      playlistCoverUrl: stored.featureSettings.playlistCoverUrl,
      itinerary:
        stored.featureSettings.itinerary === null
          ? null
          : {
              version: 1,
              items: stored.featureSettings.itinerary.items.map((moment) => ({
                time: moment.time,
                title: moment.title,
                ...(moment.place === undefined ? {} : { place: moment.place }),
                ...(moment.address === undefined ? {} : { address: moment.address }),
              })),
            },
      giftRegistry:
        stored.featureSettings.giftRegistry === null
          ? null
          : {
              version: 1,
              stores: stored.featureSettings.giftRegistry.stores.map((store) => ({
                name: store.name,
                ...(store.reference === undefined ? {} : { reference: store.reference }),
                url: store.url,
              })),
              ...(stored.featureSettings.giftRegistry.transfer === undefined
                ? {}
                : {
                    transfer: {
                      bank: stored.featureSettings.giftRegistry.transfer.bank,
                      holder: stored.featureSettings.giftRegistry.transfer.holder,
                      clabe: stored.featureSettings.giftRegistry.transfer.clabe,
                    },
                  }),
              envelopes: stored.featureSettings.giftRegistry.envelopes,
              ...(stored.featureSettings.giftRegistry.note === undefined
                ? {}
                : { note: stored.featureSettings.giftRegistry.note }),
            },
      lodging:
        stored.featureSettings.lodging === null
          ? null
          : {
              version: 1,
              hotels: stored.featureSettings.lodging.hotels.map((hotel) => ({
                name: hotel.name,
                ...(hotel.distance === undefined ? {} : { distance: hotel.distance }),
                ...(hotel.price === undefined ? {} : { price: hotel.price }),
                ...(hotel.groupCode === undefined ? {} : { groupCode: hotel.groupCode }),
                ...(hotel.bookingUrl === undefined ? {} : { bookingUrl: hotel.bookingUrl }),
                ...(hotel.address === undefined ? {} : { address: hotel.address }),
              })),
              ...(stored.featureSettings.lodging.transport === undefined
                ? {}
                : { transport: stored.featureSettings.lodging.transport }),
            },
      livestream:
        stored.featureSettings.livestream === null
          ? null
          : {
              version: 1,
              url: stored.featureSettings.livestream.url,
              ...(stored.featureSettings.livestream.note === undefined
                ? {}
                : { note: stored.featureSettings.livestream.note }),
            },
      reminders:
        stored.featureSettings.reminders === null
          ? null
          : {
              version: 1,
              pendingRsvp: stored.featureSettings.reminders.pendingRsvp,
              eventEve: stored.featureSettings.reminders.eventEve,
            },
      openingAnimation: stored.featureSettings.openingAnimation,
      language: stored.featureSettings.language,
    },
    slugRenamesRemaining: stored.slugRenamesRemaining,
    remindersConfigured: stored.remindersConfigured,
    passwordProtected: stored.passwordProtected,
    availableFeatures: [...stored.availableFeatures],
    places: { ...stored.places },
  };
}

/** The guest's page of a published invitation, mapped from the application projection (A7, S4). */
export function toPublicInvitationResponse(stored: PublicInvitation): PublicInvitationResponse {
  return {
    slug: stored.slug,
    componentKey: stored.componentKey,
    configuration: stored.configuration,
    content: stored.content,
    hiddenFields: [...stored.hiddenFields],
    publishedAt: stored.publishedAt?.toISOString() ?? null,
    timeZone: stored.timeZone,
    features: {
      countdown: stored.features.countdown,
      map: stored.features.map,
      calendar: true,
      whatsapp:
        stored.features.whatsapp === null ? null : { phone: stored.features.whatsapp.phone },
      music:
        stored.features.music === null
          ? null
          : {
              url: stored.features.music.url,
              provider: stored.features.music.provider,
              title: stored.features.music.title,
              coverUrl: stored.features.music.coverUrl,
            },
      itinerary:
        stored.features.itinerary === null
          ? null
          : {
              items: stored.features.itinerary.items.map((moment) => ({
                time: moment.time,
                title: moment.title,
                ...(moment.place === undefined ? {} : { place: moment.place }),
                ...(moment.address === undefined ? {} : { address: moment.address }),
              })),
            },
      giftRegistry: stored.features.giftRegistry,
      giftRegistryDetails:
        stored.features.giftRegistryDetails === null
          ? null
          : {
              stores: stored.features.giftRegistryDetails.stores.map((store) => ({
                name: store.name,
                ...(store.reference === undefined ? {} : { reference: store.reference }),
                url: store.url,
              })),
              transfer:
                stored.features.giftRegistryDetails.transfer === null
                  ? null
                  : {
                      bank: stored.features.giftRegistryDetails.transfer.bank,
                      holder: stored.features.giftRegistryDetails.transfer.holder,
                      clabe: stored.features.giftRegistryDetails.transfer.clabe,
                    },
              envelopes: stored.features.giftRegistryDetails.envelopes,
              note: stored.features.giftRegistryDetails.note,
            },
      gallery: stored.features.gallery.map((photo) => ({
        url: photo.url,
        width: photo.width,
        height: photo.height,
        alt: photo.alt,
      })),
      lodging:
        stored.features.lodging === null
          ? null
          : {
              hotels: stored.features.lodging.hotels.map((hotel) => ({
                name: hotel.name,
                ...(hotel.distance === undefined ? {} : { distance: hotel.distance }),
                ...(hotel.price === undefined ? {} : { price: hotel.price }),
                ...(hotel.groupCode === undefined ? {} : { groupCode: hotel.groupCode }),
                ...(hotel.bookingUrl === undefined ? {} : { bookingUrl: hotel.bookingUrl }),
                ...(hotel.address === undefined ? {} : { address: hotel.address }),
              })),
              transport: stored.features.lodging.transport,
            },
      livestream:
        stored.features.livestream === null
          ? null
          : {
              url: stored.features.livestream.url,
              videoId: stored.features.livestream.videoId,
              note: stored.features.livestream.note,
            },
      openingAnimation: stored.features.openingAnimation,
      // The language the page renders (F14; L19.5): the owner's choice while the package grants it, Spanish otherwise. It is
      // added beside the fields the body already carried and changes none of them, so a page deployed before it reads the
      // body it always read, and a page that reads an absent field renders Spanish (L20).
      language: stored.features.language,
      guestbook:
        stored.features.guestbook === null
          ? null
          : stored.features.guestbook.map((entry) => ({
              authorName: entry.authorName,
              message: entry.message,
            })),
      guestAlbum:
        stored.features.guestAlbum === null
          ? null
          : {
              photos: stored.features.guestAlbum.photos.map((photo) => ({
                url: photo.url,
                uploaderName: photo.uploaderName,
              })),
              count: stored.features.guestAlbum.count,
            },
      rsvp: {
        mode: stored.features.rsvp.mode,
        deadline: stored.features.rsvp.deadline?.toISOString() ?? null,
        partyLimit: stored.features.rsvp.partyLimit,
        qrPass: stored.features.rsvp.qrPass,
      },
    },
    places: { ...stored.places },
    // A boolean, never the instant: the guest page reads this to close the RSVP (S2, T3).
    expired: stored.expired,
    // The current address a guest reached through a previous one (F11; L15.3).
    redirectTo: stored.redirectTo,
  };
}

/**
 * The answer of the address check (F11; S2.11, L15.3): the address the check is about and one of the four words the
 * editor renders. It never names an owner or an invitation, so a taken address only says that it is taken.
 */
export interface SlugAvailabilityResponse {
  slug: string;
  status: "available" | "taken" | "invalid" | "reserved";
}

/** The address check of one owned invitation, or the owner-facing 404 (F11; L15.3, A4). */
export function orSlugAvailabilityNotFound(
  stored: { slug: string; status: SlugAvailabilityResponse["status"] } | null,
): SlugAvailabilityResponse {
  return stored === null ? notFound() : { slug: stored.slug, status: stored.status };
}

/**
 * The guest-facing 404 (A3): one answer for a slug that is malformed, unknown, a draft, archived, expired, or
 * published with a renderer this deployment cannot render. Nothing distinguishes those cases to a guest, so a
 * 404 never confirms that an invitation exists but is not visible.
 */
export function publicInvitationNotFound(): never {
  throw new NotFoundException({ code: "PUBLIC_INVITATION_NOT_FOUND" });
}

/**
 * The answer for an invitation the session user does not own: no row has this id, or another customer has it
 * (A4). Both answer the same 404 with the same body, so nothing tells a foreign id apart from an unknown one.
 */
function notFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}

export function orOwnedInvitationNotFound(
  stored: OwnedInvitation | null,
  access?: {
    readonly role: InvitationRoleResponse;
    readonly permissions: readonly InvitationPermissionResponse[];
  },
): OwnedInvitationResponse {
  return stored === null ? notFound() : toOwnedInvitationResponse(stored, access);
}

/**
 * The place suggestions of one owned invitation, or the owner-facing 404 (S2, A4). A search is a read of the
 * invitation's own address fields, so an id that names nothing and another customer's id answer the same 404.
 */
export function orPlaceSuggestionsNotFound(places: readonly PlacePoint[] | null): PlacePoint[] {
  return places === null ? notFound() : [...places];
}

export function orInvitationSummaryNotFound(
  stored: InvitationSummary | null,
): InvitationSummaryResponse {
  return stored === null ? notFound() : toInvitationSummaryResponse(stored);
}

/**
 * Maps an invitation error to its HTTP outcome; any other error is rethrown unchanged.
 *
 * - a version that is missing or not published, and a package that does not exist, are 404: nothing to pin or
 *   nothing to check, and the caller learns nothing about a catalog it may not read;
 * - a package that does not fit is 400 with `INVITATION_PACKAGE_DOES_NOT_FIT`: the request is well formed, the
 *   API has no 422 anywhere, and a stable code is what the client branches on;
 * - content the pinned schema refuses is 400 with its issues (S3, S7);
 * - a content write whose named version moved is 409 `INVITATION_CONTENT_CONFLICT`, and nothing was stored (S2);
 * - feature data the domain refuses is 400 `INVALID_INVITATION_FEATURES` with its issues (F1; S4);
 * - a place query the domain refuses is 400 `INVALID_PLACE_QUERY` with its issues, and an owner over the search
 *   limit is 429 `PLACE_SEARCH_RATE_LIMITED` (S2);
 * - a place write the domain refuses is 400 `INVALID_INVITATION_PLACE` with its issues (S2, S3);
 * - an address the rule refuses is 400 `INVALID_INVITATION_SLUG` with its issue, a reserved word is 409
 *   `INVITATION_SLUG_RESERVED`, an address that is already held is 409 `INVITATION_SLUG_TAKEN`, the sixth rename is 409
 *   `INVITATION_SLUG_RENAME_LIMIT`, a rename that lost a race with another rename of the same invitation is 409
 *   `INVITATION_SLUG_RENAME_CONFLICT`, and an owner over the address limit is 429 `SLUG_AVAILABILITY_RATE_LIMITED`, for a
 *   check and for a rename alike (F11; S2.11, L15.1-L15.3);
 * - an archived invitation is 409 with `INVITATION_NOT_EDITABLE`, or `INVITATION_ALREADY_ARCHIVED` for a
 *   repeated archive (A3, S7);
 * - a publication the lifecycle refuses is 409 with `INVITATION_ALREADY_PUBLISHED` or `INVITATION_NOT_PUBLISHED`,
 *   so each wrong status has its own stable code and a repeated publish never looks like a change (S7, A2);
 * - an invitation that is not ready to publish is 409 `INVITATION_NOT_PUBLISHABLE` with the readiness issues:
 *   publishing a row whose content, package, or pinned version is not ready is a state conflict, not a
 *   malformed request, and this API uses no 422 (A1);
 * - a publication the payment gate refuses is 402 `INVITATION_PAYMENT_REQUIRED` with the gate's `reason`: the
 *   invitation is ready and only a payment is missing, which is what 402 Payment Required states. The `reason`
 *   is the machine-readable code the gate answered, never a provider payload (S6);
 * - no storable slug is 503 `INVITATION_SLUG_UNAVAILABLE`: the request is right, the server could not draw one.
 */
export function mapInvitationError(error: unknown): never {
  if (error instanceof InvitationTemplateVersionNotPublishedError) {
    throw new NotFoundException({ code: "INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED" });
  }
  if (error instanceof InvitationPackageNotFoundError) {
    throw new NotFoundException({ code: "INVITATION_PACKAGE_NOT_FOUND" });
  }
  if (error instanceof InvitationPackageDoesNotFitError) {
    throw new BadRequestException({ code: "INVITATION_PACKAGE_DOES_NOT_FIT" });
  }
  if (error instanceof InvalidInvitationContentError) {
    throw new BadRequestException({
      code: "INVALID_INVITATION_CONTENT",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvitationContentConflictError) {
    throw new ConflictException({ code: "INVITATION_CONTENT_CONFLICT" });
  }
  if (error instanceof InvalidPlaceQueryError) {
    throw new BadRequestException({
      code: "INVALID_PLACE_QUERY",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvalidInvitationPlaceError) {
    throw new BadRequestException({
      code: "INVALID_INVITATION_PLACE",
      issues: [...error.issues],
    });
  }
  if (error instanceof PlaceSearchRateLimitedError) {
    // 429 is the one answer for "you asked too often"; the editor shows it as a quiet note, never as a failure.
    throw new HttpException({ code: "PLACE_SEARCH_RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error instanceof SlugAvailabilityRateLimitedError) {
    // The address check has its own limit, so the owner sees one quiet note instead of a failing field (F11; L15.3).
    throw new HttpException(
      { code: "SLUG_AVAILABILITY_RATE_LIMITED" },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (error instanceof InvalidInvitationSlugError) {
    throw new BadRequestException({
      code: "INVALID_INVITATION_SLUG",
      issues: [...error.issues],
    });
  }
  if (error instanceof ReservedInvitationSlugError) {
    // The address is well formed but names a page of the product, so the owner must choose another one (F11; L15.1).
    throw new ConflictException({ code: "INVITATION_SLUG_RESERVED" });
  }
  if (error instanceof InvitationSlugTakenError) {
    // The rename is the only caller that lets this reach presentation (F11; L15.3): the answer never names the owner.
    throw new ConflictException({ code: "INVITATION_SLUG_TAKEN" });
  }
  if (error instanceof InvitationSlugRenameLimitError) {
    throw new ConflictException({ code: "INVITATION_SLUG_RENAME_LIMIT" });
  }
  if (error instanceof InvitationSlugRenameConflictError) {
    // A concurrent rename of the same invitation stored the address that was current here first, so the owner retries
    // and reads the invitation as it stands: never a false "taken" (F11; L15.2, R4-002).
    throw new ConflictException({ code: "INVITATION_SLUG_RENAME_CONFLICT" });
  }
  if (error instanceof InvalidInvitationFeaturesError) {
    throw new BadRequestException({
      code: "INVALID_INVITATION_FEATURES",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvitationNotEditableError) {
    throw new ConflictException({ code: "INVITATION_NOT_EDITABLE" });
  }
  if (error instanceof InvitationAlreadyArchivedError) {
    throw new ConflictException({ code: "INVITATION_ALREADY_ARCHIVED" });
  }
  if (error instanceof InvitationAlreadyPublishedError) {
    throw new ConflictException({ code: "INVITATION_ALREADY_PUBLISHED" });
  }
  if (error instanceof InvitationNotPublishedError) {
    throw new ConflictException({ code: "INVITATION_NOT_PUBLISHED" });
  }
  if (error instanceof InvitationNotPublishableError) {
    throw new ConflictException({
      code: "INVITATION_NOT_PUBLISHABLE",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvitationPaymentRequiredError) {
    throw new HttpException(
      { code: "INVITATION_PAYMENT_REQUIRED", reason: error.reason },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
  if (error instanceof InvitationSlugUnavailableError) {
    throw new ServiceUnavailableException({ code: "INVITATION_SLUG_UNAVAILABLE" });
  }
  throw error;
}
