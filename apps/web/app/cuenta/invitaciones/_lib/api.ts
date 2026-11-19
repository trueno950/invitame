import "server-only";

import { cookies } from "next/headers";

import { ApiClientError } from "../../../../lib/server/api-client.ts";
import { getWebServerConfig } from "../../../../lib/server/config.ts";
import {
  createInvitationsClient,
  type InvitationsClient,
} from "../../../../lib/server/invitations-api.ts";
import { errorClass } from "../../../../lib/server/server-log.ts";

/**
 * The invitation and creator-catalog API for the customer pages and their server actions (M4 T5; S1, S6,
 * S7). One stateless client per server process, created on first use; each call reads the current
 * request's cookies and keeps nothing, and `server-only` keeps the cookie and the proxy secret out of
 * every browser bundle. The client itself has no marker so `node --test` can prove its mapping.
 */
let client: InvitationsClient | undefined;

function invitationsClient(): InvitationsClient {
  client ??= createInvitationsClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

/**
 * The operational log of an unexpected failure of a call (one JSON line): the event, the error class, the
 * client's fixed failure kind, and the class of its cause. Never a message, a cookie, a body, or a value
 * someone typed, because any of them could carry personal data. It is an operational log, not an audit
 * trail. The event name lives here, as `admin-catalog-log.ts` does for the catalog, because the names of
 * `server-log.ts` are the closed list of the session calls.
 */
export const INVITATION_CALL_FAILED_EVENT = "invitation_call_failed";

export function invitationFailureLine(error: unknown): string {
  return JSON.stringify({
    event: INVITATION_CALL_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logInvitationFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(invitationFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}

async function logged<T>(call: (api: InvitationsClient) => Promise<T>): Promise<T> {
  try {
    return await call(invitationsClient());
  } catch (error) {
    logInvitationFailure(error);
    throw error;
  }
}

/** The same shape as `InvitationsClient`, so the logic in `lib/customer/invitations.ts` accepts it. */
export const invitations = {
  list: () => logged((api) => api.list()),
  get: (id: string) => logged((api) => api.get(id)),
  create: (input: Parameters<InvitationsClient["create"]>[0]) => logged((api) => api.create(input)),
  replaceContent: (id: string, content: Record<string, unknown>, expectedUpdatedAt?: string) =>
    logged((api) => api.replaceContent(id, content, expectedUpdatedAt)),
  searchPlaces: (id: string, query: string) => logged((api) => api.searchPlaces(id, query)),
  savePlace: (id: string, field: string, point: Parameters<InvitationsClient["savePlace"]>[2]) =>
    logged((api) => api.savePlace(id, field, point)),
  clearPlace: (id: string, field: string) => logged((api) => api.clearPlace(id, field)),
  updateInvitationFeatures: (
    id: string,
    features: Parameters<InvitationsClient["updateInvitationFeatures"]>[1],
  ) => logged((api) => api.updateInvitationFeatures(id, features)),
  readRsvp: (id: string) => logged((api) => api.readRsvp(id)),
  updateRsvpSettings: (
    id: string,
    settings: Parameters<InvitationsClient["updateRsvpSettings"]>[1],
  ) => logged((api) => api.updateRsvpSettings(id, settings)),
  rsvpCsv: (id: string) => logged((api) => api.rsvpCsv(id)),
  guests: (id: string) => logged((api) => api.guests(id)),
  createGuest: (id: string, guest: Parameters<InvitationsClient["createGuest"]>[1]) =>
    logged((api) => api.createGuest(id, guest)),
  updateGuest: (
    id: string,
    guestId: string,
    guest: Parameters<InvitationsClient["updateGuest"]>[2],
  ) => logged((api) => api.updateGuest(id, guestId, guest)),
  removeGuest: (id: string, guestId: string) => logged((api) => api.removeGuest(id, guestId)),
  rotateGuestToken: (id: string, guestId: string) =>
    logged((api) => api.rotateGuestToken(id, guestId)),
  checkInGuest: (id: string, token: string) => logged((api) => api.checkInGuest(id, token)),
  archive: (id: string) => logged((api) => api.archive(id)),
  publish: (id: string) => logged((api) => api.publish(id)),
  unpublish: (id: string) => logged((api) => api.unpublish(id)),
  checkout: (id: string) => logged((api) => api.checkout(id)),
  payment: (id: string) => logged((api) => api.payment(id)),
  emitSimulatedPayment: (paymentId: string, outcome: "paid" | "failed") =>
    logged((api) => api.emitSimulatedPayment(paymentId, outcome)),
  templates: () => logged((api) => api.templates()),
  packages: () => logged((api) => api.packages()),
};
