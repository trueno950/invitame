"use server";

import { type AddressCheckState, addressCheckState } from "../../../lib/customer/address.ts";
import { ADDRESS_COPY } from "../../../lib/customer/copy.ts";
import { sendInvitationCall } from "../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../lib/server/invitations-api.ts";
import { invitations } from "./_lib/api.ts";

/**
 * The custom address of one invitation (F11; S2.11, L15.3, L15.4). The browser cannot reach the API — no `PUT` is
 * allowed across origins — so the address block of the «Publicar» tab talks to these two actions instead, and each one
 * answers a small serializable result rather than redirecting: the owner keeps typing, keeps the answers they already
 * have, and keeps their scroll position.
 *
 * The text the browser sends is untrusted here too: it is normalized the same way the block normalizes it before
 * anything is sent, and an invitation id that cannot be one names nothing, so no request is made. Nothing typed is
 * logged, and no answer names another owner or another invitation: the API decides everything, this layer only maps.
 */

/** What one check answers: the state the block renders. */
export interface AddressCheckResult {
  state: AddressCheckState;
}

/** What one save answers: the stored address, or the sentence under the field. */
export type AddressSaveResult =
  | { ok: true; slug: string; renamesRemaining: number }
  | { ok: false; message: string };

/** The text an action works with: the owner's input normalized once, bounded, and otherwise untouched. */
function addressOf(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 80) : "";
}

/** The sentence for a save the API refused: every refusal says what the owner has to do about it. */
function saveFailure(failure: string): string {
  switch (failure) {
    case "slug-taken":
      return ADDRESS_COPY.taken;
    case "slug-reserved":
      return ADDRESS_COPY.reserved;
    case "slug-invalid":
      return ADDRESS_COPY.invalid;
    case "slug-rename-limit":
      return ADDRESS_COPY.noRenamesLeft;
    case "slug-rate-limited":
      return ADDRESS_COPY.rateLimited;
    case "not-editable":
      return ADDRESS_COPY.archiveNote;
    case "not-found":
    case "signed-out":
      return ADDRESS_COPY.notFound;
    default:
      return ADDRESS_COPY.saveFailed;
  }
}

/**
 * `GET /invitations/:id/slug-availability?slug=`: whether the owner may save the typed address. The editor calls it
 * after the debounce, never per keystroke, and an empty field is answered without a request because there is nothing to
 * check yet. A refused call is a state the block explains under the field, never an error the page shows loudly.
 */
export async function checkAddressAction(id: string, slug: unknown): Promise<AddressCheckResult> {
  const text = addressOf(slug);

  if (!isInvitationId(id)) {
    return { state: "unavailable" };
  }
  if (text === "") {
    return { state: "idle" };
  }

  const checked = await sendInvitationCall(() => invitations.checkSlugAvailability(id, text));

  return {
    state: checked.ok
      ? addressCheckState(checked.value.status)
      : addressCheckState(checked.failure),
  };
}

/**
 * `PUT /invitations/:id/slug`: saves the address. The API stores the previous one as an alias in the same transaction,
 * so every link already shared keeps working, and the answer carries the address it stored and how many renames the
 * owner still has left.
 */
export async function saveAddressAction(id: string, slug: unknown): Promise<AddressSaveResult> {
  const text = addressOf(slug);

  if (!isInvitationId(id)) {
    return { ok: false, message: ADDRESS_COPY.notFound };
  }

  const saved = await sendInvitationCall(() => invitations.renameSlug(id, text));

  return saved.ok
    ? {
        ok: true,
        slug: saved.value.slug,
        renamesRemaining: saved.value.slugRenamesRemaining,
      }
    : { ok: false, message: saveFailure(saved.failure) };
}
