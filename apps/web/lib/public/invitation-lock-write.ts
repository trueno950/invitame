import { LOCK_SCREEN_COPY } from "../customer/copy.ts";
import { GUEST_ALBUM_NOTICE_PARAM } from "./guest-album.ts";
import { GUESTBOOK_NOTICE_PARAM } from "./guestbook.ts";
import type { LockScreenNotice } from "./invitation-lock.ts";
import { RSVP_NOTICE_PARAM } from "./invitation-rsvp.ts";

/**
 * The notice a locked public write comes back with (F13; S2.13, L18.2).
 *
 * The API's gate refuses a write to an invitation that stores an access code before the route runs, so an answer, a
 * signature, or a photo never reaches it. The guest's action turns that refusal into its own notice and comes back to the
 * invitation page, which draws the lock screen; this module is what that screen reads out of the query: instead of the
 * write's generic failure sentence, the guest reads that the invitation asks for its password and that reopening it is
 * what to do next.
 *
 * It reads the three writes' own notice parameters, never the unlock screen's `acceso`: the lock screen keeps its two
 * neutral sentences for a refused code and a sentence of its own for a refused write.
 */

/** The one code a public write's notice carries when the access code refused it (F3, F7, F8). */
export const LOCKED_WRITE_NOTICE_CODE = "locked";

/**
 * The three query parameters the public writes come back with. A write that was not refused by the access code answers
 * a code of its own there, and this module says nothing about it.
 */
const WRITE_NOTICE_PARAMS = [RSVP_NOTICE_PARAM, GUESTBOOK_NOTICE_PARAM, GUEST_ALBUM_NOTICE_PARAM];

/**
 * The sentence the lock screen shows when a public write was refused because the invitation stores an access code, or
 * undefined when no write was refused. A repeated parameter is not a value this page may read, so it reads a single one
 * only, exactly as every other notice reader does.
 */
export function lockWriteNotice(
  parameters: Record<string, string | string[] | undefined> = {},
): LockScreenNotice | undefined {
  const refused = WRITE_NOTICE_PARAMS.some((name) => parameters[name] === LOCKED_WRITE_NOTICE_CODE);

  return refused
    ? { code: LOCKED_WRITE_NOTICE_CODE, message: LOCK_SCREEN_COPY.writeRefused }
    : undefined;
}
