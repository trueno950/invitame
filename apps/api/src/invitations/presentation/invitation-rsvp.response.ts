import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";

import {
  InvalidRsvpResponseError,
  InvalidRsvpSettingsError,
  RsvpNotOpenError,
  RsvpRateLimitedError,
} from "../application/invitation-rsvp.errors";
import type { RsvpRead } from "../application/invitation-rsvp.use-cases";
import type { RsvpResponseRecord } from "../application/rsvp.repository";
import type { RsvpSettings } from "../domain/invitation-rsvp";
import { mapInvitationError } from "./invitation.response";

// The stable REST shapes of the RSVP routes (M6 G1; S1, S4). The creator's read carries the settings, the
// responses, and the totals; the CSV export carries the same rows in the same order. The public submission answers
// one minimal body for every accepted attempt — stored, updated, or dropped by the honeypot — so a bot cannot tell
// a recorded response from a discarded one, and no guest ever receives another guest's data.
//
// Error codes: `INVALID_RSVP_SETTINGS` and `INVALID_RSVP` carry the domain's issues (400), `RSVP_NOT_OPEN` is 409
// because the invitation is visible but its state does not accept responses, and `RSVP_RATE_LIMITED` is 429. An
// error this module does not own is mapped by the invitation error mapper, so the archived refusal keeps its
// `INVITATION_NOT_EDITABLE` code and a foreign invitation keeps its `INVITATION_NOT_FOUND` 404 (A4).

/** The creator's view of the settings: the deadline as an ISO instant, or null. */
export interface RsvpSettingsResponse {
  deadline: string | null;
  partyLimit: number;
}

/** One response in the creator's read. `dedupeKey` is deliberately absent: it is internal (S4). */
export interface RsvpResponseItemResponse {
  id: string;
  name: string;
  attending: boolean;
  partySize: number;
  phone: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The creator's read: settings, responses newest first, and the totals of the page (S1, S4). */
export interface RsvpReadResponse {
  settings: RsvpSettingsResponse;
  responses: RsvpResponseItemResponse[];
  totals: { attendingPeople: number; declinedCount: number; responses: number };
}

/** The one public success body (S4): no id, no count, and nothing another guest could read. */
export interface RsvpAcceptedResponse {
  status: "received";
}

export const RSVP_ACCEPTED_RESPONSE: RsvpAcceptedResponse = { status: "received" };

export function toRsvpSettingsResponse(settings: RsvpSettings): RsvpSettingsResponse {
  return {
    deadline: settings.deadline?.toISOString() ?? null,
    partyLimit: settings.partyLimit,
  };
}

function toRsvpResponseItem(stored: RsvpResponseRecord): RsvpResponseItemResponse {
  return {
    id: stored.id,
    name: stored.name,
    attending: stored.attending,
    partySize: stored.partySize,
    phone: stored.phone,
    message: stored.message,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

export function toRsvpReadResponse(read: RsvpRead): RsvpReadResponse {
  return {
    settings: toRsvpSettingsResponse(read.settings),
    responses: read.responses.map(toRsvpResponseItem),
    totals: { ...read.totals },
  };
}

/**
 * The answer for a missing settings save, an invitation the session user does not own, or a malformed id (A4).
 * One 404 body covers every case, so nothing tells a foreign invitation apart from an unknown one.
 */
export function orRsvpSettingsNotFound(stored: RsvpSettings | null): RsvpSettingsResponse {
  if (stored === null) {
    rsvpInvitationNotFound();
  }
  return toRsvpSettingsResponse(stored);
}

/** The single 404 of the RSVP reads: no row has this id, or another customer has it (A4). */
export function rsvpInvitationNotFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}

/** The answer for a read of an invitation the session user does not own, or of an unknown id (A4). */
export function orRsvpReadNotFound(stored: RsvpRead | null): RsvpReadResponse {
  if (stored === null) {
    rsvpInvitationNotFound();
  }
  return toRsvpReadResponse(stored);
}

/**
 * Maps an RSVP error to its HTTP outcome; an error this module does not own goes to the invitation mapper
 * unchanged, so an archived save is still 409 `INVITATION_NOT_EDITABLE` and an unknown id is still 404.
 */
export function mapRsvpError(error: unknown): never {
  if (error instanceof InvalidRsvpSettingsError) {
    throw new BadRequestException({
      code: "INVALID_RSVP_SETTINGS",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvalidRsvpResponseError) {
    throw new BadRequestException({ code: "INVALID_RSVP", issues: [...error.issues] });
  }
  if (error instanceof RsvpNotOpenError) {
    throw new ConflictException({ code: "RSVP_NOT_OPEN" });
  }
  if (error instanceof RsvpRateLimitedError) {
    throw new HttpException({ code: "RSVP_RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
  }
  return mapInvitationError(error);
}
