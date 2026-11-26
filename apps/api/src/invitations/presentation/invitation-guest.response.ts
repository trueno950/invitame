import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import type {
  GuestCheckIn,
  GuestRecord,
  GuestResponseSummary,
  GuestWithResponse,
} from "../application/guest.repository";
import type { RsvpCompanion } from "../domain/invitation-rsvp";
import {
  GuestListNotAvailableError,
  GuestNotConfirmedError,
  GuestNotFoundError,
  GuestSeatsBelowConfirmedPartyError,
  InvalidGuestError,
  QrPassNotAvailableError,
} from "../application/invitation-guest.errors";
import type {
  GuestListRead,
  GuestWithToken,
  PublicGuestInvitation,
} from "../application/invitation-guest.use-cases";
import type { GuestTotals } from "../domain/invitation-guest";
import { type PublicInvitationResponse, toPublicInvitationResponse } from "./invitation.response";
import { mapRsvpError } from "./invitation-rsvp.response";

// The stable REST shapes of the guest-list routes (M6 G2; S1, S3, S4). The creator's read carries the guests, each
// one's answer, the check-in state, and the totals; creation and rotation answer the plain personal token once, and
// no other route ever returns it, nor its digest. The guest's personal page is the published invitation's public
// read plus one `guest` block, so a guest page and the open invitation page share one allow-listed projection and no
// other guest's data can arrive by accident.
//
// Error codes: `INVALID_GUEST` carries the domain's issues (400), `GUEST_LIST_NOT_AVAILABLE` and
// `QR_PASS_NOT_AVAILABLE` are 409 because the package, not the request, refuses the call (S3, S4),
// `GUEST_NOT_CONFIRMED` is 409 because the guest exists but has no party to admit, and `GUEST_SEATS_BELOW_RESPONSE`
// is 409 with the confirmed party, because an edit would otherwise leave an answer naming more people than the seats
// allow. `GUEST_NOT_FOUND` is the creator's 404 for a guest that is not part of this invitation; a foreign
// invitation keeps `INVITATION_NOT_FOUND` (A4). The guest's own routes answer the one public 404 (A3).

/** A guest as the creator's read renders it, with the answer when the caller read one. */
export type GuestView = GuestRecord & { response?: GuestResponseSummary | null };

/** One guest in the creator's read: the stored fields, the answer, and the check-in state, never the token. */
export interface GuestResponseItem {
  id: string;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  /** The assigned table, or null when the owner left none (F5; L8.3). */
  tableLabel: string | null;
  tokenIssuedAt: string;
  checkedInAt: string | null;
  response: {
    attending: boolean;
    partySize: number;
    /** The companions of the party, or null for an answer stored before they existed (F3; L6.1). */
    companions: RsvpCompanion[] | null;
    dietaryNotes: string | null;
    message: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/** The creator's guest list: the guests and the totals of the page (S1, S4). */
export interface GuestListResponse {
  guests: GuestResponseItem[];
  totals: GuestTotals;
}

/** The answer of a creation or a rotation: the guest plus the plain token, which is shown once (S4). */
export interface GuestWithTokenResponse {
  guest: GuestResponseItem;
  token: string;
}

/** The answer of a removal (S4): nothing about the guest that was removed is echoed back. */
export interface DeletedGuestResponse {
  status: "deleted";
}

/** The answer of one check-in (S4): the guest, the seats, the confirmed party, and the first check-in instant. */
export interface GuestCheckInResponse {
  guestId: string;
  name: string;
  seats: number;
  attendingPartySize: number;
  checkedInAt: string;
}

/** The guest block of a personal page: this guest only, with their last answer and whether the QR is offered. */
export interface PublicGuestResponse {
  name: string;
  seats: number;
  /** The assigned table, or null: only this guest's block carries it, never the open public read (F5; L8.4). */
  tableLabel: string | null;
  response: {
    attending: boolean;
    partySize: number;
    companions: RsvpCompanion[] | null;
    dietaryNotes: string | null;
    message: string | null;
  } | null;
  qrPass: boolean;
}

/** The personal page: the published invitation's public read plus one guest block (S4). */
export interface PublicGuestInvitationResponse extends PublicInvitationResponse {
  guest: PublicGuestResponse;
}

export function toGuestResponseItem(guest: GuestView): GuestResponseItem {
  const response = guest.response ?? null;

  return {
    id: guest.id,
    name: guest.name,
    seats: guest.seats,
    phone: guest.phone,
    note: guest.note,
    tableLabel: guest.tableLabel,
    tokenIssuedAt: guest.tokenIssuedAt.toISOString(),
    checkedInAt: guest.checkedInAt?.toISOString() ?? null,
    response:
      response === null
        ? null
        : {
            attending: response.attending,
            partySize: response.partySize,
            companions: response.companions,
            dietaryNotes: response.dietaryNotes,
            message: response.message,
            createdAt: response.createdAt.toISOString(),
            updatedAt: response.updatedAt.toISOString(),
          },
    createdAt: guest.createdAt.toISOString(),
    updatedAt: guest.updatedAt.toISOString(),
  };
}

export function toGuestListResponse(read: GuestListRead): GuestListResponse {
  return {
    guests: read.guests.map((guest) => toGuestResponseItem(guest)),
    totals: { ...read.totals },
  };
}

export function toGuestWithTokenResponse(stored: GuestWithToken): GuestWithTokenResponse {
  return { guest: toGuestResponseItem(stored.guest), token: stored.token };
}

export function toGuestCheckInResponse(stored: GuestCheckIn): GuestCheckInResponse {
  return {
    guestId: stored.id,
    name: stored.name,
    seats: stored.seats,
    attendingPartySize: stored.partySize,
    checkedInAt: stored.checkedInAt.toISOString(),
  };
}

export function toPublicGuestInvitationResponse(
  read: PublicGuestInvitation,
): PublicGuestInvitationResponse {
  return {
    ...toPublicInvitationResponse(read.page),
    guest: {
      name: read.guest.name,
      seats: read.guest.seats,
      tableLabel: read.guest.tableLabel,
      response: read.guest.response === null ? null : { ...read.guest.response },
      qrPass: read.guest.qrPass,
    },
  };
}

/** The creator's 404 for a guest that is not part of the named invitation (A4). */
export function guestNotFound(): never {
  throw new NotFoundException({ code: "GUEST_NOT_FOUND" });
}

/** The creator's 404 for an invitation that is missing or another customer's: one body for both (A4). */
function invitationNotFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}

/** The answer for a missing guest read of this owner, or for a guest that is not part of the invitation (A4). */
export function orGuestListNotFound(stored: GuestListRead | null): GuestListResponse {
  if (stored === null) {
    // No row has this id, or another customer has it: the same 404 the invitation routes answer (A4).
    invitationNotFound();
  }
  return toGuestListResponse(stored);
}

/** The answer of a creation or a rotation, or the invitation 404 when the write named no owned invitation. */
export function orGuestWithTokenResponse(stored: GuestWithToken | null): GuestWithTokenResponse {
  if (stored === null) {
    invitationNotFound();
  }
  return toGuestWithTokenResponse(stored);
}

/** The answer of an edit, or the invitation 404 when the write named no owned invitation (A4). */
export function orGuestResponseItem(stored: GuestWithResponse | null): GuestResponseItem {
  if (stored === null) {
    invitationNotFound();
  }
  return toGuestResponseItem(stored);
}

/** The answer of a removal, or the invitation 404 when the invitation is missing or another owner's (A4). */
export function orDeletedGuestResponse(deleted: boolean): DeletedGuestResponse {
  return deleted ? { status: "deleted" } : invitationNotFound();
}

/** The answer of a check-in, or the invitation 404 when the invitation is missing or another owner's (S4). */
export function orGuestCheckInResponse(stored: GuestCheckIn | null): GuestCheckInResponse {
  return stored === null ? invitationNotFound() : toGuestCheckInResponse(stored);
}

/**
 * Maps a guest-list error to its HTTP outcome; an error this module does not own goes to the RSVP mapper (which
 * keeps `INVALID_RSVP`, `RSVP_NOT_OPEN`, and `RSVP_RATE_LIMITED`) and then to the invitation mapper, so an archived
 * invitation keeps `INVITATION_NOT_EDITABLE` and a foreign one keeps its 404 (A4).
 */
export function mapGuestError(error: unknown): never {
  if (error instanceof GuestNotFoundError) {
    guestNotFound();
  }
  if (error instanceof InvalidGuestError) {
    throw new BadRequestException({ code: "INVALID_GUEST", issues: [...error.issues] });
  }
  if (error instanceof GuestListNotAvailableError) {
    throw new ConflictException({ code: "GUEST_LIST_NOT_AVAILABLE" });
  }
  if (error instanceof QrPassNotAvailableError) {
    throw new ConflictException({ code: "QR_PASS_NOT_AVAILABLE" });
  }
  if (error instanceof GuestNotConfirmedError) {
    throw new ConflictException({ code: "GUEST_NOT_CONFIRMED" });
  }
  if (error instanceof GuestSeatsBelowConfirmedPartyError) {
    throw new ConflictException({
      code: "GUEST_SEATS_BELOW_RESPONSE",
      partySize: error.partySize,
    });
  }
  return mapRsvpError(error);
}
