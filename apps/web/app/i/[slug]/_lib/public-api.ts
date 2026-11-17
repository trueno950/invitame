import "server-only";

import { ApiClientError } from "../../../../lib/server/api-client.ts";
import { getWebServerConfig } from "../../../../lib/server/config.ts";
import {
  createPublicInvitationsClient,
  type PublicGuestResult,
  type PublicGuestRsvpSubmission,
  type PublicGuestRsvpSubmitResult,
  type PublicInvitationsClient,
  type PublicRsvpSubmission,
  type PublicRsvpSubmitResult,
} from "../../../../lib/server/public-invitations-api.ts";
import { errorClass } from "../../../../lib/server/server-log.ts";

/**
 * The public invitation API for the guest's page under `/i` (M5 T5; S1, S5, A3, A6). One stateless client
 * per server process, created on first use. It never reads a cookie: a guest has no session, and the page
 * must not forward one even when a signed-in owner opens their own invitation. `server-only` keeps the
 * proxy secret out of every browser bundle; the client itself has no marker so `node --test` can prove it.
 */
let client: PublicInvitationsClient | undefined;

function publicInvitationsClient(): PublicInvitationsClient {
  client ??= createPublicInvitationsClient({ config: getWebServerConfig() });
  return client;
}

/** The operational events of a public page: a failed read, or a snapshot this deployment cannot render. */
export const PUBLIC_INVITATION_LOG_EVENT = {
  READ_FAILED: "public_invitation_read_failed",
  RENDERER_UNKNOWN: "public_invitation_renderer_unknown",
  RENDERER_PROPS_REFUSED: "public_invitation_renderer_props_refused",
  RSVP_SUBMIT_FAILED: "public_rsvp_submit_failed",
  GUEST_READ_FAILED: "public_guest_read_failed",
  GUEST_RSVP_SUBMIT_FAILED: "public_guest_rsvp_submit_failed",
} as const;

export type PublicInvitationLogEvent =
  (typeof PUBLIC_INVITATION_LOG_EVENT)[keyof typeof PUBLIC_INVITATION_LOG_EVENT];

/**
 * One JSON line: the event, the error class and the client's fixed failure kind, and the class of the
 * cause. Never a message, a slug, a cookie, or a response body, because any of them could carry personal
 * data; a renderer key is allow-listed catalog data and is the one value worth naming. This is an
 * operational log, not an audit trail.
 */
export function publicInvitationLogLine(
  event: PublicInvitationLogEvent,
  details: { error?: unknown; componentKey?: string } = {},
): string {
  const { error, componentKey } = details;

  return JSON.stringify({
    event,
    ...(error === undefined ? {} : { error: errorClass(error) }),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
    ...(componentKey === undefined ? {} : { componentKey }),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a guest's page. */
export function logPublicInvitation(
  event: PublicInvitationLogEvent,
  details: { error?: unknown; componentKey?: string } = {},
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(publicInvitationLogLine(event, details));
  } catch {
    // A failing sink must not change the response.
  }
}

/** The public read, logged once when it fails; the caller decides what the guest then sees. */
export async function readPublicInvitation(
  slug: string,
): Promise<Awaited<ReturnType<PublicInvitationsClient["getBySlug"]>>> {
  try {
    return await publicInvitationsClient().getBySlug(slug);
  } catch (error) {
    logPublicInvitation(PUBLIC_INVITATION_LOG_EVENT.READ_FAILED, { error });
    throw error;
  }
}

/**
 * One guest's open RSVP answer through the anonymous client (M6 G3; S4). A failure this deployment could not map is
 * logged once as its class and kind and rethrown, so the action can answer the guest one sentence instead of an
 * error page. Nothing logged names a guest, a phone, a message, or your invitation's content: this is an
 * operational line, not an audit trail.
 */
export async function submitPublicRsvp(
  slug: string,
  submission: PublicRsvpSubmission,
  options?: { clientAddress?: string },
): Promise<PublicRsvpSubmitResult> {
  try {
    return await publicInvitationsClient().submitRsvp(slug, submission, options);
  } catch (error) {
    logPublicInvitation(PUBLIC_INVITATION_LOG_EVENT.RSVP_SUBMIT_FAILED, { error });
    throw error;
  }
}

/**
 * One guest's personal read through the anonymous client (M6 G4; S4). A failure this deployment could not map is
 * logged once as its class and kind and rethrown, so the page shows its own friendly 404 or outage notice. Nothing
 * logged names a guest, a token, a slug, or the invitation's content.
 */
export async function readPublicGuestInvitation(
  slug: string,
  token: string,
): Promise<PublicGuestResult> {
  try {
    return await publicInvitationsClient().getGuest(slug, token);
  } catch (error) {
    logPublicInvitation(PUBLIC_INVITATION_LOG_EVENT.GUEST_READ_FAILED, { error });
    throw error;
  }
}

/**
 * One guest's personal answer through the anonymous client (M6 G4; S4): the same mapping, and the same promise that
 * nothing logged names the guest or what they wrote.
 */
export async function submitPublicGuestRsvp(
  slug: string,
  token: string,
  submission: PublicGuestRsvpSubmission,
  options?: { clientAddress?: string },
): Promise<PublicGuestRsvpSubmitResult> {
  try {
    return await publicInvitationsClient().submitGuestRsvp(slug, token, submission, options);
  } catch (error) {
    logPublicInvitation(PUBLIC_INVITATION_LOG_EVENT.GUEST_RSVP_SUBMIT_FAILED, { error });
    throw error;
  }
}
