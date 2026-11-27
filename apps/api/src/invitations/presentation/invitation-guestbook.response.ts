import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";

import type { GuestbookRead } from "../application/invitation-guestbook.use-cases";
import {
  GuestbookClosedError,
  GuestbookRateLimitedError,
  InvalidGuestbookEntryError,
} from "../application/invitation-guestbook.errors";
import type { GuestbookEntryRecord } from "../domain/invitation-guestbook";
import { mapInvitationError } from "./invitation.response";

// The stable REST shapes of the guestbook routes (F7; S2.7, L10.3, L10.4, L10.6). The owner's read carries every entry
// of one invitation with its state and the two counts the screen's tabs show; the owner's write answers the entry it
// changed. The public submission answers one minimal body for every accepted attempt — stored or dropped by the
// honeypot — so a bot cannot tell a recorded signature from a discarded one, and no guest ever receives an entry of
// another invitation beyond the public wall the page renders anyway.
//
// Error codes: `INVALID_GUESTBOOK_ENTRY` carries the domain's issues (400), `GUESTBOOK_CLOSED` is 409 because the
// invitation is visible but its wall takes no signature, `GUESTBOOK_RATE_LIMITED` is 429, and an entry that names
// nothing of this invitation is `GUESTBOOK_ENTRY_NOT_FOUND` (404). An error this module does not own is mapped by the
// invitation error mapper, so a foreign invitation keeps its `INVITATION_NOT_FOUND` 404 (A4).

/** One entry in the owner's moderation read: its row, its text, its state, and when it was signed. */
export interface GuestbookEntryResponse {
  id: string;
  authorName: string;
  message: string;
  hidden: boolean;
  createdAt: string;
}

/** The owner's read: every entry newest first, and how many are visible and hidden (L10.6). */
export interface GuestbookReadResponse {
  entries: GuestbookEntryResponse[];
  visibleCount: number;
  hiddenCount: number;
}

/** The one public success body (L10.3): no id, no count, and nothing another guest could read. */
export interface GuestbookAcceptedResponse {
  status: "received";
}

export const GUESTBOOK_ACCEPTED_RESPONSE: GuestbookAcceptedResponse = { status: "received" };

/** One stored entry as the owner's screen reads it. */
export function toGuestbookEntryResponse(entry: GuestbookEntryRecord): GuestbookEntryResponse {
  return {
    id: entry.id,
    authorName: entry.authorName,
    message: entry.message,
    hidden: entry.hidden,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function toGuestbookReadResponse(read: GuestbookRead): GuestbookReadResponse {
  return {
    entries: read.entries.map(toGuestbookEntryResponse),
    visibleCount: read.visibleCount,
    hiddenCount: read.hiddenCount,
  };
}

/**
 * The answer for a read of an invitation the session user does not own, or of an unknown id (A4). One 404 body covers
 * every case, so nothing tells a foreign invitation apart from an unknown one.
 */
export function orGuestbookReadNotFound(stored: GuestbookRead | null): GuestbookReadResponse {
  if (stored === null) {
    guestbookInvitationNotFound();
  }
  return toGuestbookReadResponse(stored);
}

/** The single 404 of the guestbook reads: no row has this id, or another customer has it (A4). */
export function guestbookInvitationNotFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}

/** The 404 of an entry id that names nothing of this invitation (A4). */
export function guestbookEntryNotFound(): never {
  throw new NotFoundException({ code: "GUESTBOOK_ENTRY_NOT_FOUND" });
}

/** The first of the two 404s: a foreign or unknown invitation, then an entry that is not this invitation's. */
export function orGuestbookEntry(
  result:
    | { readonly status: "ok"; readonly entry: GuestbookEntryRecord }
    | { readonly status: "invitation-not-found" }
    | { readonly status: "entry-not-found" },
): GuestbookEntryResponse {
  if (result.status === "invitation-not-found") {
    guestbookInvitationNotFound();
  }
  if (result.status === "entry-not-found") {
    guestbookEntryNotFound();
  }
  return toGuestbookEntryResponse(result.entry);
}

/**
 * Maps a guestbook error to its HTTP outcome; an error this module does not own goes to the invitation mapper
 * unchanged, so an unknown id is still 404.
 */
export function mapGuestbookError(error: unknown): never {
  if (error instanceof InvalidGuestbookEntryError) {
    throw new BadRequestException({
      code: "INVALID_GUESTBOOK_ENTRY",
      issues: [...error.issues],
    });
  }
  if (error instanceof GuestbookClosedError) {
    throw new ConflictException({ code: "GUESTBOOK_CLOSED" });
  }
  if (error instanceof GuestbookRateLimitedError) {
    throw new HttpException({ code: "GUESTBOOK_RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
  }
  return mapInvitationError(error);
}
