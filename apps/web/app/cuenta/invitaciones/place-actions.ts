"use server";

import { PLACE_PICKER_COPY } from "../../../lib/customer/copy.ts";
import { sendInvitationCall } from "../../../lib/customer/invitations.ts";
import type {
  PlaceSearchFailure,
  PlaceSearchResult,
  PlaceWriteResult,
} from "../../../lib/customer/place-search.ts";
import {
  isAddressFieldName,
  isLatitude,
  isLongitude,
  type PlacePoint,
} from "../../../lib/invitation-features/place-point.ts";
import { isInvitationId } from "../../../lib/server/invitations-api.ts";
import { invitations } from "./_lib/api.ts";

/**
 * The place actions of the invitation editor (S1, S2, S3). The browser cannot reach the API — no `PUT` is allowed
 * across origins — so the combobox of an address field talks to these three actions instead, and each one answers a
 * small serializable result rather than redirecting: the owner keeps typing, keeps the selection, and keeps their
 * scroll position whatever the geocoder says.
 *
 * The browser sends text and a point, both untrusted: a query is normalized and length-checked by the pure rule the
 * combobox also uses, a field must be an address field name, and a point must satisfy the bounds of the columns
 * before anything is sent. A search that fails is never an error the page shows loudly — the field still accepts
 * free text, which is what the invitation keeps — and nothing typed is ever logged.
 */

/** The message a point that could not be stored leaves under its field (S2). */
const SAVE_FAILED = PLACE_PICKER_COPY.saveFailed;

const NOT_FOUND = PLACE_PICKER_COPY.notFound;

/** The failure a refused search maps to, keeping the rate limit apart from every other refusal. */
function searchFailureOf(failure: string): PlaceSearchFailure {
  switch (failure) {
    case "place-query-invalid":
      return "invalid-query";
    case "place-search-rate-limited":
      return "rate-limited";
    case "not-found":
    case "signed-out":
      return "not-found";
    default:
      return "unavailable";
  }
}

/**
 * `GET /invitations/:id/places/search`: at most five points the typed text matches (S1, S2). The editor calls it after
 * the debounce, never per keystroke, and a text shorter than three characters never leaves the browser.
 */
export async function searchPlacesAction(id: string, query: unknown): Promise<PlaceSearchResult> {
  if (!isInvitationId(id)) {
    return { ok: false, failure: "not-found" };
  }

  const read = await sendInvitationCall(() =>
    invitations.searchPlaces(id, typeof query === "string" ? query : ""),
  );

  return read.ok
    ? { ok: true, suggestions: read.value }
    : { ok: false, failure: searchFailureOf(read.failure) };
}

/** Whether a value is a point the API would store: the same bounds its own domain checks. */
function isPoint(value: unknown): value is PlacePoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const point = value as Record<string, unknown>;

  return (
    typeof point.label === "string" &&
    point.label.trim().length > 0 &&
    isLatitude(point.lat) &&
    isLongitude(point.lng)
  );
}

/**
 * `PUT /invitations/:id/places/:field`: stores the point the owner chose (S1, S2). The address text travels through
 * the content autosave, so this action writes only the coordinates and answers the invitation's stored points, which
 * is what the field's note reads back.
 */
export async function savePlaceAction(
  id: string,
  field: unknown,
  point: unknown,
): Promise<PlaceWriteResult> {
  if (!isInvitationId(id) || !isAddressFieldName(field) || !isPoint(point)) {
    return { ok: false, message: SAVE_FAILED };
  }

  const written = await sendInvitationCall(() => invitations.savePlace(id, field, point));

  return written.ok
    ? { ok: true, places: written.value.places }
    : {
        ok: false,
        message: written.failure === "not-found" ? NOT_FOUND : SAVE_FAILED,
      };
}

/**
 * `DELETE /invitations/:id/places/:field`: clears the point of one address field and keeps the words the owner typed
 * (S2). The field then shows the invitation to pick a suggestion again.
 */
export async function clearPlaceAction(id: string, field: unknown): Promise<PlaceWriteResult> {
  if (!isInvitationId(id) || !isAddressFieldName(field)) {
    return { ok: false, message: SAVE_FAILED };
  }

  const cleared = await sendInvitationCall(() => invitations.clearPlace(id, field));

  return cleared.ok
    ? { ok: true, places: cleared.value.places }
    : {
        ok: false,
        message: cleared.failure === "not-found" ? NOT_FOUND : SAVE_FAILED,
      };
}
