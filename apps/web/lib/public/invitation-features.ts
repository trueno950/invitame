import {
  buildIcsCalendar,
  calendarEventFor,
  type IcsCalendarInput,
} from "../invitation-features/calendar.ts";
import { type EventFacts, eventFactsFor } from "../invitation-features/event-facts.ts";
import {
  hasAnyFeature,
  type InvitationFeatures,
} from "../invitation-features/invitation-features.ts";
import { isSupportedTimeZone, startInstant } from "../invitation-features/start-instant.ts";
import type { PublicInvitation } from "../server/public-invitations-api.ts";
import { publicInvitationPath } from "./invitation-page.ts";

/**
 * The guest page's use of the features the API gated (F3; S4). The public read is the only input: the gated
 * booleans, the stored zone, and the layout's own content, which already carries the celebration's title,
 * its start, and its places. This module turns that into the props of `InvitationFeaturesBlock` and into the
 * `.ics` file the route handler under `/i/<slug>/calendario.ics` answers.
 *
 * Two degradations keep a guest's page safe, and both are per feature rather than one failure:
 *
 * - a zone this runtime cannot format turns off only the countdown and the calendar, because those are the
 *   two features that read a wall clock; the map and WhatsApp need no zone and stay;
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

/** The facts of a stored invitation, or undefined when its layout refuses the snapshot. */
function factsOf(invitation: PublicInvitation): EventFacts | undefined {
  try {
    return eventFactsFor(invitation.componentKey, invitation.content);
  } catch {
    return undefined;
  }
}

/**
 * The features block of one published invitation, or undefined when there is nothing to show. Undefined is
 * the same value the layouts read as "no features", so an invitation without features renders exactly the
 * markup it rendered before the block existed (S4).
 */
export function publicFeatureBlock(invitation: PublicInvitation): PublicFeatureBlock | undefined {
  const facts = factsOf(invitation);

  if (facts === undefined) {
    return undefined;
  }

  const zoned = isSupportedTimeZone(invitation.timeZone);
  const features: InvitationFeatures = {
    timeZone: invitation.timeZone,
    countdown: invitation.features.countdown && zoned,
    map: invitation.features.map,
    calendar: invitation.features.calendar && zoned,
    whatsapp: invitation.features.whatsapp,
  };

  return hasAnyFeature(features)
    ? { features, facts, calendarHref: invitationCalendarPath(invitation.slug) }
    : undefined;
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
