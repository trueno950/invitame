import {
  buildIcsCalendar,
  calendarEventFor,
  type IcsCalendarInput,
} from "../invitation-features/calendar.ts";
import { type EventFacts, eventFactsFor } from "../invitation-features/event-facts.ts";
import type { GalleryPhoto } from "../invitation-features/gallery.ts";
import type { GiftRegistry } from "../invitation-features/gift-registry.ts";
import {
  type GuestPageBlockView,
  hasAnyFeature,
  type InvitationFeatures,
  type RsvpBlockView,
  type WhatsAppContact,
} from "../invitation-features/invitation-features.ts";
import type { ItineraryMoment } from "../invitation-features/itinerary.ts";
import type { Lodging } from "../invitation-features/lodging.ts";
import type { MusicLink } from "../invitation-features/music.ts";
import { confirmedPlaces, type StoredPlaces } from "../invitation-features/place-point.ts";
import { isSupportedTimeZone, startInstant } from "../invitation-features/start-instant.ts";
import type { PublicInvitation } from "../server/public-invitations-api.ts";
import { publicInvitationPath } from "./invitation-page.ts";

/**
 * The guest page's use of the features the API gated (F3, F6, F7; S4, S7). The public read is the only input: the
 * gated booleans, the stored zone and link, and the layout's own content, which already carries the celebration's
 * title, its start, its places, and its gift registry text. This module turns that into the props of
 * `InvitationFeaturesBlock` and into the `.ics` file the route handler under `/i/<slug>/calendario.ics` answers.
 *
 * Two degradations keep a guest's page safe, and both are per feature rather than one failure:
 *
 * - a zone this runtime cannot format turns off only the countdown and the calendar, because those are the
 *   two features that read a wall clock; the map, WhatsApp, and music need no zone and stay;
 * - a snapshot whose facts cannot be read turns off every feature, because the block names the celebration
 *   in all four of them. In practice the page has already refused such a snapshot before rendering, so this
 *   is the second line of defense and never a path a guest reaches.
 */

/** The file the calendar feature downloads, and the path segment it is served under. */
export const INVITATION_CALENDAR_FILE_NAME = "invitacion.ics";
export const INVITATION_CALENDAR_SEGMENT = "calendario.ics";

/**
 * The headers of the download: a calendar file a browser saves instead of rendering, and a response no cache
 * may keep, because the owner can change the date or the place at any time (A6).
 */
export const INVITATION_CALENDAR_HEADERS = {
  "content-type": "text/calendar; charset=utf-8",
  "content-disposition": `attachment; filename="${INVITATION_CALENDAR_FILE_NAME}"`,
  "cache-control": "no-store",
} as const;

/** The complete answer of the download route: the file and the headers it is sent with. */
export interface InvitationCalendarFile {
  readonly body: string;
  readonly headers: typeof INVITATION_CALENDAR_HEADERS;
}

/** `/i/<slug>/calendario.ics`: the download of one invitation, next to the page (S4). */
export function invitationCalendarPath(slug: string): string {
  return `${publicInvitationPath(slug)}/${INVITATION_CALENDAR_SEGMENT}`;
}

/** Everything a renderer needs to place and fill the features block for one invitation. */
export interface PublicFeatureBlock {
  /** The gated features this page can actually show. */
  readonly features: InvitationFeatures;
  /** The celebration, read from the layout's own content. */
  readonly facts: EventFacts;
  /** The `.ics` download of this invitation. */
  readonly calendarHref: string;
}

/**
 * The facts of a rendered snapshot, or undefined when its layout refuses the content. The snapshot's
 * `hiddenFields` (S8.3) travel with it, so a place the customer switched off is never named by the map, the
 * countdown, or the calendar, and the start hour comes from a place that stays shown.
 */
function factsOf(snapshot: {
  componentKey: string;
  content: unknown;
  hiddenFields?: readonly string[];
}): EventFacts | undefined {
  try {
    return eventFactsFor(snapshot.componentKey, snapshot.content, snapshot.hiddenFields ?? []);
  } catch {
    return undefined;
  }
}

/** What the shared features block renders: the features after the zone had its say, and the celebration. */
export interface FeatureBlockParts {
  readonly features: InvitationFeatures;
  readonly facts: EventFacts;
}

/**
 * The features a page is willing to show, before the invitation's zone decides the two wall-clock ones: the API's
 * gated flags on a guest page, the owner read's gated keys in the creator's preview. The calendar is always on for a
 * published invitation, so the public read says `true` there; a preview that serves no `.ics` download keeps the
 * flag the package grants, exactly like the countdown and the map.
 */
export interface GatedFeatures {
  readonly countdown: boolean;
  readonly map: boolean;
  readonly calendar: boolean;
  readonly whatsapp: WhatsAppContact | null;
  readonly music: MusicLink | null;
  /** Whether the pinned package grants `GIFT_REGISTRY`, the gate each layout reads for an older content text (F7, F2). */
  readonly giftRegistry: boolean;
  /** The structured registry the shared block draws, or null when there is none to draw (F2; L4.5). */
  readonly giftRegistryDetails: GiftRegistry | null;
  readonly gallery: readonly GalleryPhoto[];
  /**
   * The moments of the day (F1; L3.3), already gated by the page that built this source: the public read answers
   * them only while the package grants `ITINERARY`, and the preview applies the same rule from the owner's read.
   */
  readonly itinerary: readonly ItineraryMoment[];
  /**
   * The hotel cards and the transport line (F4; L7.5), already gated by the page that built this source: the public
   * read answers them only while the package grants `LODGING`, and the preview applies the same rule from the owner's
   * read. Null when the invitation stores nothing to draw.
   */
  readonly lodging: Lodging | null;
}

/** Everything one page renders the shared features block from. */
export interface FeatureBlockSource {
  readonly componentKey: string;
  readonly content: unknown;
  /**
   * The content fields the invitation's omitted sections cover (S8.3), as the API computed them for the public
   * read and as the preview derives them; absent means the version hides nothing.
   */
  readonly hiddenFields?: readonly string[];
  /** The invitation's stored zone, which decides whether a wall clock can be shown at all. */
  readonly timeZone: string;
  /** The features this deployment is willing to show for the invitation, before the zone has its say. */
  readonly gated: GatedFeatures;
  /**
   * The points the read answered for this invitation, keyed by address field (S1, S2). The public read carries only
   * the ones a guest may see; the owner read carries every stored one, so this source is filtered here by the same
   * rule and the preview shows exactly the guest's map.
   */
  readonly places?: StoredPlaces;
  /** The open attendance card, when this page shows one (G3; S4). */
  readonly rsvp?: RsvpBlockView;
  /** The personal block of one guest (G4), absent on every page that is not theirs. */
  readonly guest?: GuestPageBlockView;
}

/**
 * The parts of the features block for one rendered snapshot, or undefined when the page has nothing to give the
 * renderer. Undefined is the same value the layouts read as "no features", so an invitation without features
 * renders exactly the markup it rendered before the block existed (S4). A gift registry that is gated on but has no
 * other feature still returns a block, because the layout reads `features.giftRegistry`: the block itself renders
 * nothing when it has no section (F7; S7).
 *
 * This is the one place the gating rules live, and both pages that render an invitation read it: `/i/<slug>` from
 * the API's public projection, and the owner's draft preview from the owner's read (T2b). Neither page decides a
 * feature on its own, so the preview shows what the guest page would show.
 */
export function featureBlockParts(source: FeatureBlockSource): FeatureBlockParts | undefined {
  const facts = factsOf(source);

  if (facts === undefined) {
    return undefined;
  }

  const zoned = isSupportedTimeZone(source.timeZone);
  const places = confirmedPlaces(source.places, source.content);
  const features: InvitationFeatures = {
    timeZone: source.timeZone,
    countdown: source.gated.countdown && zoned,
    map: source.gated.map,
    calendar: source.gated.calendar && zoned,
    whatsapp: source.gated.whatsapp,
    music: source.gated.music,
    giftRegistry: source.gated.giftRegistry,
    ...(source.gated.giftRegistryDetails === null
      ? {}
      : { giftRegistryDetails: source.gated.giftRegistryDetails }),
    // The API gates the gallery and answers it in the creator's order; the block renders it as it comes (M8 S4).
    gallery: source.gated.gallery,
    ...(source.gated.itinerary.length === 0 ? {} : { itinerary: source.gated.itinerary }),
    ...(source.gated.lodging === null ? {} : { lodging: source.gated.lodging }),
    ...(Object.keys(places).length === 0 ? {} : { places }),
    ...(source.rsvp === undefined ? {} : { rsvp: source.rsvp }),
    ...(source.guest === undefined ? {} : { guest: source.guest }),
  };

  return hasAnyFeature(features) || features.giftRegistry ? { features, facts } : undefined;
}

/**
 * The features block of one published invitation, or undefined when the page has nothing to give the renderer
 * (F3, F6, F7; S4, S7). The block of this page carries the `.ics` download the public page owns; the owner's
 * preview renders the same parts without it (`featureBlockParts`), because no download serves an unpublished
 * draft.
 */
export function publicFeatureBlock(
  invitation: PublicInvitation,
  rsvp?: RsvpBlockView,
  guest?: GuestPageBlockView,
): PublicFeatureBlock | undefined {
  const parts = featureBlockParts({
    componentKey: invitation.componentKey,
    content: invitation.content,
    hiddenFields: invitation.hiddenFields,
    timeZone: invitation.timeZone,
    gated: {
      countdown: invitation.features.countdown,
      map: invitation.features.map,
      calendar: invitation.features.calendar,
      whatsapp: invitation.features.whatsapp,
      music: invitation.features.music,
      giftRegistry: invitation.features.giftRegistry,
      giftRegistryDetails: invitation.features.giftRegistryDetails,
      gallery: invitation.features.gallery,
      itinerary: invitation.features.itinerary?.items ?? [],
      lodging: invitation.features.lodging,
    },
    places: invitation.places,
    ...(rsvp === undefined ? {} : { rsvp }),
    ...(guest === undefined ? {} : { guest }),
  });

  return parts === undefined
    ? undefined
    : { ...parts, calendarHref: invitationCalendarPath(invitation.slug) };
}

/**
 * The `.ics` file of one invitation, or undefined when it cannot be built: the layout refuses the snapshot,
 * the zone is not one this runtime formats, or the start instant is unreadable. The route handler answers
 * the same 404 in that case, so a guest never downloads a calendar of an invitation they cannot see.
 */
export function invitationCalendar(invitation: PublicInvitation, now: Date): string | undefined {
  const facts = factsOf(invitation);

  if (facts === undefined || !isSupportedTimeZone(invitation.timeZone)) {
    return undefined;
  }

  try {
    const input: IcsCalendarInput = {
      slug: invitation.slug,
      event: calendarEventFor(facts, startInstant(facts.date, facts.time, invitation.timeZone)),
      stamp: now,
    };
    return buildIcsCalendar(input);
  } catch {
    return undefined;
  }
}

/**
 * The answer of `GET /i/[slug]/calendario.ics`, or undefined for the plain 404 the route answers when the
 * invitation is not public or the calendar cannot be built. The route only maps this value to a `Response`,
 * so the headers and the body are pinned by `invitation-features.test.ts` like any other page behavior.
 */
export function invitationCalendarFile(
  invitation: PublicInvitation,
  now: Date,
): InvitationCalendarFile | undefined {
  const body = invitationCalendar(invitation, now);

  return body === undefined ? undefined : { body, headers: INVITATION_CALENDAR_HEADERS };
}
