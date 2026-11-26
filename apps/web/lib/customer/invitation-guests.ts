import { formatRsvpDeadline } from "../invitation-features/rsvp-deadline.ts";
import type { RsvpCompanionValue } from "../public/rsvp-companions.ts";
import { personalGuestPath } from "../public/guest-pass.ts";
import {
  GUEST_NAME_MAX_LENGTH,
  GUEST_NOTE_MAX_LENGTH,
  GUEST_SEATS_MAX,
  GUEST_SEATS_MIN,
  type GuestItem,
  type GuestList,
  type GuestResponseSummary,
  type GuestWithToken,
  type InvitationResult,
  type InvitationsClient,
  isInvitationId,
  isInvitationSlug,
} from "../server/invitations-api.ts";
import { GUEST_COPY } from "./copy.ts";
import { RSVP_PATHS } from "./invitation-rsvp.ts";
import {
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  invitationNoticeTarget,
  sendInvitationCall,
} from "./invitations.ts";

/**
 * The creator's guest list (M6 G4; S1, S4): the totals, the guests with the answer each one gave and their check-in
 * state, the form that adds and edits one guest, and the three writes that change the list.
 *
 * Two things are deliberately not here. The personal token is never part of the list — the API answers it once, when
 * a guest is created or their link is rotated — so the page shows the link exactly once, through the one-time
 * hand-off of `lib/server/single-use-flash.ts`. And ownership is never checked here: the page and the actions call the
 * API with the session cookie, and the API answers 404 for an invitation this customer does not own (A4).
 */

/** The owner's guest-list paths, next to the invitation they belong to and the CSV that exports the same rows. */
export const GUEST_PATHS = {
  asistencia: (id: string) => RSVP_PATHS.responses(id),
  csv: (id: string) => RSVP_PATHS.csv(id),
} as const;

/** One guest as the page's table renders them (S1, S4). */
export interface GuestRow {
  readonly id: string;
  readonly name: string;
  readonly seats: number;
  readonly answerLabel: string;
  /** The confirmed party, or a dash for a guest who has not answered. */
  readonly partySize: string;
  /** The companion names the guest gave, or a dash when they named none (F3; L6.4). */
  readonly companions: string;
  /** How many companions are children, as the row shows it, or a dash without a confirmed answer (F3; L6.4). */
  readonly children: string;
  /** The dietary restrictions, or a dash when the guest named none (F3; L6.4). */
  readonly dietaryNotes: string;
  /** The first check-in on the invitation's clock, or the note that there is none. */
  readonly checkIn: string;
  /** The stored phone, or a dash when the creator left none. */
  readonly phone: string;
  /** The stored note, or a dash when the creator left none. */
  readonly note: string;
  /** Whether the guest answered again, so the creator knows this row is the newer one. */
  readonly updated: boolean;
}

/** The values one guest's form shows before it is submitted. */
export interface GuestFormValues {
  readonly id: string;
  readonly name: string;
  readonly seats: number;
  readonly phone: string;
  readonly note: string;
}

/** Everything the guest list of one invitation renders (S1, S4). */
export interface GuestListView {
  readonly invitationId: string;
  /** False while the invitation is archived, like every other section of the page. */
  readonly editable: boolean;
  readonly totals: readonly { readonly label: string; readonly value: number }[];
  readonly rows: readonly GuestRow[];
  /** The CSV of the same guest list, pending guests and check-in times included. */
  readonly csvHref: string;
  /** Why no personal link is listed here, next to the actions that mint a new one (S4). */
  readonly note: string;
}

/** A stored optional text as the table shows it: the value, or a dash when it is empty. */
function orDash(value: string | null): string {
  return value === null || value === "" ? "—" : value;
}

/**
 * The companion names of one answer, as the table shows them (F3; L6.4): in the guest's own order, joined by a comma,
 * with a blank name left out because a guest may confirm a count without every name. A dash is what the page shows when
 * nobody was named, which is also how an answer stored before the companions existed reads.
 */
function companionNames(companions: readonly RsvpCompanionValue[] | null): string {
  const named = (companions ?? []).map((companion) => companion.name).filter((name) => name !== "");

  return named.length === 0 ? "—" : named.join(", ");
}

/** How many companions of one answer are children (F3; L6.4). */
function childrenOf(response: GuestResponseSummary): number {
  return (response.companions ?? []).filter((companion) => companion.child).length;
}

/** One guest's answer as its Spanish label, and the party that comes with it. */
function answerOf(guest: GuestItem): { label: string; party: string } {
  if (guest.response === null) {
    return { label: GUEST_COPY.answerPending, party: "—" };
  }
  return {
    label: guest.response.attending ? GUEST_COPY.answerYes : GUEST_COPY.answerNo,
    party: String(guest.response.partySize),
  };
}

/**
 * The guest list of one invitation (S1, S4). Every time is read on the invitation's own clock, the order is the
 * API's (the oldest guest first, which is the order the CSV exports), and a guest who answered twice says so instead
 * of hiding the second answer.
 */
export function guestListView(
  invitation: { id: string; timeZone: string; status: string },
  list: GuestList,
): GuestListView {
  return {
    invitationId: invitation.id,
    editable: invitation.status !== "ARCHIVED",
    totals: [
      { label: GUEST_COPY.totalGuests, value: list.totals.guests },
      { label: GUEST_COPY.totalSeats, value: list.totals.seats },
      { label: GUEST_COPY.totalAttending, value: list.totals.attendingPeople },
      // The confirmed people apart, adults and children (F3; L6.4).
      { label: GUEST_COPY.totalAttendingAdults, value: list.totals.attendingAdults },
      { label: GUEST_COPY.totalAttendingChildren, value: list.totals.attendingChildren },
      { label: GUEST_COPY.totalDeclined, value: list.totals.declinedCount },
      { label: GUEST_COPY.totalPending, value: list.totals.pendingCount },
      { label: GUEST_COPY.totalCheckedIn, value: list.totals.checkedInCount },
    ],
    rows: list.guests.map((guest) => {
      const answer = answerOf(guest);

      return {
        id: guest.id,
        name: guest.name,
        seats: guest.seats,
        answerLabel: answer.label,
        partySize: answer.party,
        companions: companionNames(guest.response?.companions ?? null),
        children: guest.response?.attending === true ? String(childrenOf(guest.response)) : "—",
        dietaryNotes: orDash(guest.response?.dietaryNotes ?? null),
        checkIn:
          guest.checkedInAt === null
            ? GUEST_COPY.checkInNone
            : GUEST_COPY.checkInDone(
                formatRsvpDeadline(guest.checkedInAt, invitation.timeZone) ?? guest.checkedInAt,
              ),
        phone: orDash(guest.phone),
        note: orDash(guest.note),
        updated: guest.response !== null && guest.response.updatedAt !== guest.response.createdAt,
      };
    }),
    csvHref: GUEST_PATHS.csv(invitation.id),
    note: GUEST_COPY.linkOnceNote,
  };
}

/** The guest the page's own query asks to edit or to remove, when that guest is part of this list. */
export interface GuestSelection {
  readonly editing: GuestFormValues | null;
  readonly removing: { readonly id: string; readonly name: string } | null;
}

/** A query value as one plain string, or undefined when it is missing or repeated. */
function queryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The values one guest's edit form shows (S4). */
export function guestFormValues(guest: GuestItem): GuestFormValues {
  return {
    id: guest.id,
    name: guest.name,
    seats: guest.seats,
    phone: guest.phone ?? "",
    note: guest.note ?? "",
  };
}

/**
 * The guests the page shows a form for, read from its own query and resolved against the list it just read: an id
 * that is not part of this invitation is ignored, so a hand-edited query shows no form at all.
 */
export function guestSelection(
  list: GuestList,
  parameters: Record<string, string | string[] | undefined> = {},
): GuestSelection {
  const editing = queryValue(parameters.editar);
  const removing = queryValue(parameters.quitar);
  const editGuest =
    editing === undefined ? undefined : list.guests.find((guest) => guest.id === editing);
  const removeGuest =
    removing === undefined ? undefined : list.guests.find((guest) => guest.id === removing);

  return {
    editing: editGuest === undefined ? null : guestFormValues(editGuest),
    removing: removeGuest === undefined ? null : { id: removeGuest.id, name: removeGuest.name },
  };
}

/** The most characters a submitted phone may carry, so a hostile form cannot grow the request. */
const MAX_PHONE_TEXT_LENGTH = 32;

/** The guest one submitted form asks to store, or nothing when no request could store it. */
export type GuestFormParse =
  | {
      readonly ok: true;
      readonly value: {
        readonly name: string;
        readonly seats: number;
        readonly phone: string | null;
        readonly note: string | null;
      };
    }
  | { readonly ok: false };

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/**
 * The guest a submitted form asks to add or to edit (S4). The name must be 1 to 80 characters, the seats an integer
 * from 1 to 10, and the phone and the note are optional (a blank one clears it). The API normalizes and validates the
 * phone again and answers its own issue when it refuses it; this function only refuses what no request could fix, so
 * a value it accepts never becomes a request the API cannot even parse.
 */
export function parseGuestForm(form: FormData): GuestFormParse {
  const name = text(form, "name")?.trim() ?? "";
  const seatsText = text(form, "seats") ?? "";
  const seats = /^\d{1,2}$/.test(seatsText) ? Number(seatsText) : Number.NaN;
  const phone = text(form, "phone")?.trim() ?? "";
  const note = text(form, "note")?.trim() ?? "";

  if (
    name === "" ||
    [...name].length > GUEST_NAME_MAX_LENGTH ||
    !Number.isInteger(seats) ||
    seats < GUEST_SEATS_MIN ||
    seats > GUEST_SEATS_MAX ||
    [...phone].length > MAX_PHONE_TEXT_LENGTH ||
    [...note].length > GUEST_NOTE_MAX_LENGTH
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      name,
      seats,
      phone: phone === "" ? null : phone,
      note: note === "" ? null : note,
    },
  };
}

/**
 * What one guest write answers (S4). A plain redirect is one page to load; a link hand-off is the one-time personal
 * link, which the action stores in the flash and the attendance page shows once — never a URL, never a log.
 */
export type GuestOutcome =
  | { readonly kind: "redirect"; readonly target: string }
  | {
      readonly kind: "link";
      readonly target: string;
      readonly invitationId: string;
      readonly guestName: string;
      /** `/i/<slug>/g/<token>`: the token travels only inside this path, and only into the flash. */
      readonly personalPath: string;
    };

// The client calls these functions make, one type per action, so a test can hand a fake that answers only the call
// the function it exercises sends.

/** The call `createGuest` makes. */
export type GuestCreateClient = Pick<InvitationsClient, "createGuest">;
/** The call `updateGuestDetails` makes. */
export type GuestUpdateClient = Pick<InvitationsClient, "updateGuest">;
/** The call `removeGuestFromList` makes. */
export type GuestRemoveClient = Pick<InvitationsClient, "removeGuest">;
/** The call `rotateGuestLink` makes. */
export type GuestRotateClient = Pick<InvitationsClient, "rotateGuestToken">;

/** The invitation id one submitted guest form carries, or nothing when it cannot be one. */
function invitationIdOf(form: FormData): string | undefined {
  const id = text(form, "id");

  return id !== undefined && isInvitationId(id) ? id : undefined;
}

/** The slug one submitted guest form carries, or nothing when it could not name an invitation. */
function slugOf(form: FormData): string | undefined {
  const slug = text(form, "slug");

  return slug !== undefined && isInvitationSlug(slug) ? slug : undefined;
}

/** The list page of one invitation with one error code. */
function errorTarget(id: string, failure: Parameters<typeof invitationFailureTarget>[1]): string {
  return invitationFailureTarget(GUEST_PATHS.asistencia(id), failure);
}

/** Sends one guest write and answers the page it comes back to. */
async function send(
  id: string,
  call: () => Promise<InvitationResult<unknown>>,
): Promise<string | undefined> {
  const written = await sendInvitationCall(call);

  return written.ok ? undefined : errorTarget(id, written.failure);
}

/** Adds one guest and answers the one-time personal link, or the page with its error (S4). */
export async function createGuest(api: GuestCreateClient, form: FormData): Promise<GuestOutcome> {
  const id = invitationIdOf(form);
  const slug = slugOf(form);

  if (id === undefined) {
    return { kind: "redirect", target: invitationErrorTarget(INVITATION_PATHS.list, "not-found") };
  }

  const parsed = parseGuestForm(form);

  if (!parsed.ok || slug === undefined) {
    return {
      kind: "redirect",
      target: invitationErrorTarget(GUEST_PATHS.asistencia(id), "invalid-form"),
    };
  }

  const written = await sendInvitationCall(() => api.createGuest(id, parsed.value));

  if (!written.ok) {
    return { kind: "redirect", target: errorTarget(id, written.failure) };
  }

  return linkOutcome(id, slug, "guest-added", written.value);
}

/** Replaces one guest's fields; the token and the check-in state are untouched (S4). */
export async function updateGuestDetails(
  api: GuestUpdateClient,
  form: FormData,
): Promise<GuestOutcome> {
  const id = invitationIdOf(form);
  const guestId = text(form, "guestId");

  if (id === undefined || guestId === undefined || !isInvitationId(guestId)) {
    return { kind: "redirect", target: missingTarget(id, guestId) };
  }

  const parsed = parseGuestForm(form);

  if (!parsed.ok) {
    return {
      kind: "redirect",
      target: invitationErrorTarget(GUEST_PATHS.asistencia(id), "invalid-form"),
    };
  }

  const failure = await send(id, () => api.updateGuest(id, guestId, parsed.value));

  return {
    kind: "redirect",
    target: failure ?? invitationNoticeTarget(GUEST_PATHS.asistencia(id), "guest-saved"),
  };
}

/** Removes one guest and the answer they gave (S4). */
export async function removeGuestFromList(
  api: GuestRemoveClient,
  form: FormData,
): Promise<GuestOutcome> {
  const id = invitationIdOf(form);
  const guestId = text(form, "guestId");

  if (id === undefined || guestId === undefined || !isInvitationId(guestId)) {
    return { kind: "redirect", target: missingTarget(id, guestId) };
  }

  const failure = await send(id, () => api.removeGuest(id, guestId));

  return {
    kind: "redirect",
    target: failure ?? invitationNoticeTarget(GUEST_PATHS.asistencia(id), "guest-removed"),
  };
}

/**
 * Replaces one guest's personal link and answers the new one once (S4). The previous link stops resolving at the same
 * instant, which is what the page warns before the creator submits it; the answer and the check-in state stay.
 */
export async function rotateGuestLink(
  api: GuestRotateClient,
  form: FormData,
): Promise<GuestOutcome> {
  const id = invitationIdOf(form);
  const slug = slugOf(form);
  const guestId = text(form, "guestId");

  if (id === undefined || guestId === undefined || !isInvitationId(guestId)) {
    return { kind: "redirect", target: missingTarget(id, guestId) };
  }
  if (slug === undefined) {
    return {
      kind: "redirect",
      target: invitationErrorTarget(GUEST_PATHS.asistencia(id), "invalid-form"),
    };
  }

  const written = await sendInvitationCall(() => api.rotateGuestToken(id, guestId));

  if (!written.ok) {
    return { kind: "redirect", target: errorTarget(id, written.failure) };
  }

  return linkOutcome(id, slug, "link-rotated", written.value);
}

/** The one-time link hand-off of a creation or a rotation (S4). */
function linkOutcome(
  invitationId: string,
  slug: string,
  notice: "guest-added" | "link-rotated",
  written: GuestWithToken,
): GuestOutcome {
  const personalPath = personalGuestPath(slug, written.token);

  if (personalPath === undefined) {
    // The form's slug was checked before the call; a link this module cannot build is never shown.
    return {
      kind: "redirect",
      target: invitationErrorTarget(GUEST_PATHS.asistencia(invitationId), "invalid-form"),
    };
  }

  return {
    kind: "link",
    target: invitationNoticeTarget(GUEST_PATHS.asistencia(invitationId), notice),
    invitationId,
    guestName: written.guest.name,
    personalPath,
  };
}

/** Where a write goes when the form names no invitation or no guest of it. */
function missingTarget(id: string | undefined, guestId: string | undefined): string {
  if (id !== undefined && isInvitationId(id)) {
    return invitationErrorTarget(
      GUEST_PATHS.asistencia(id),
      guestId === undefined || !isInvitationId(guestId) ? "guest-not-found" : "not-found",
    );
  }
  return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
}
