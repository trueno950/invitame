import { formatRsvpDeadline } from "../invitation-features/rsvp-deadline.ts";
import type { GuestCheckIn, InvitationResult } from "../server/invitations-api.ts";
import { CHECK_IN_COPY } from "./copy.ts";

/**
 * The owner's check-in page of one QR (M6 G4; S1, S4). Opening the pass calls the API, and this module turns that one
 * answer into what the page shows. The page is never the guard: the API requires the session and the owned,
 * non-archived invitation, and answers 404 for a token that names no guest of it.
 *
 * The API keeps the *first* check-in instant and answers it again, so the same pass shown twice is idempotent and
 * this page always shows when the guest first arrived, never a second arrival.
 */

/** One labelled fact of a registered pass: the seats, the confirmed party, and when the guest arrived. */
export interface CheckInDetail {
  readonly label: string;
  readonly value: string;
}

/** What the check-in page renders. */
export interface CheckInView {
  readonly status: "ok" | "failed" | "sign-in";
  /** The page's heading: the guest who arrived, or what stopped the check-in. */
  readonly heading: string;
  /** One sentence under the heading. */
  readonly body: string;
  readonly details: readonly CheckInDetail[];
}

/** The label of a refusal: the API code is never shown, so a guest's page cannot echo it back. */
function refused(heading: string, body: string): CheckInView {
  return { status: "failed", heading, body, details: [] };
}

/**
 * The page of one check-in answer. `timeZone` is the invitation's stored zone, read on the owner's side, so the
 * arrival is shown on the same clock the invitation uses; an unreadable value falls back to the stored instant
 * instead of guessing a zone.
 */
export function checkInView(
  result: InvitationResult<GuestCheckIn> | "unavailable",
  timeZone: string,
): CheckInView {
  if (result === "unavailable") {
    return refused(CHECK_IN_COPY.heading, CHECK_IN_COPY.unavailable);
  }
  if (!result.ok) {
    switch (result.failure) {
      case "signed-out":
        return {
          status: "sign-in",
          heading: CHECK_IN_COPY.signInHeading,
          body: CHECK_IN_COPY.signInBody,
          details: [],
        };
      case "guest-not-confirmed":
        return refused(CHECK_IN_COPY.heading, CHECK_IN_COPY.notConfirmed);
      case "guest-not-found":
        return refused(CHECK_IN_COPY.heading, CHECK_IN_COPY.notFound);
      case "qr-pass-unavailable":
        return refused(CHECK_IN_COPY.heading, CHECK_IN_COPY.noPass);
      case "not-found":
        return refused(CHECK_IN_COPY.heading, CHECK_IN_COPY.invitationNotFound);
      default:
        return refused(CHECK_IN_COPY.heading, CHECK_IN_COPY.unavailable);
    }
  }

  const guest = result.value;

  return {
    status: "ok",
    heading: CHECK_IN_COPY.registeredHeading(guest.name),
    body: CHECK_IN_COPY.registeredBody,
    details: [
      { label: CHECK_IN_COPY.seatsLabel, value: String(guest.seats) },
      { label: CHECK_IN_COPY.partyLabel, value: String(guest.attendingPartySize) },
      {
        label: CHECK_IN_COPY.checkInLabel,
        value: formatRsvpDeadline(guest.checkedInAt, timeZone) ?? guest.checkedInAt,
      },
    ],
  };
}
