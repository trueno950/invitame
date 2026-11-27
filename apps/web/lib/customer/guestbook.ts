import { GUESTBOOK_OWNER_COPY } from "./copy.ts";
import {
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  sendInvitationCall,
} from "./invitations.ts";
import type {
  GuestbookEntry,
  GuestbookRead,
  InvitationsClient,
} from "../server/invitations-api.ts";

/**
 * The owner's «Libro de firmas» screen (F7; L10.6): one invitation's messages, split into the two tabs the design shows
 * — «Visibles» and «Ocultos» — with the one action of each row, hiding it or showing it again. Nothing is deleted:
 * hiding is the owner's only moderation, and it is always reversible, so the guest never loses what they wrote.
 *
 * Ownership is never checked here: the page and the actions call the API with the session cookie, and the API answers
 * 404 for an invitation this customer does not own (A4) and 404 for an entry that is not this invitation's.
 */

/** The screen's own path, next to the invitation it belongs to (F7; L10.6). */
export const GUESTBOOK_OWNER_PATHS = {
  page: (id: string) => `${INVITATION_PATHS.detail(id)}/libro-de-firmas`,
} as const;

/** The query parameter that names the open tab. */
export const GUESTBOOK_TAB_PARAM = "ver";

/** The two tabs of the screen, in the order the design shows them. */
export const GUESTBOOK_TABS = ["visibles", "ocultos"] as const;
export type GuestbookTab = (typeof GUESTBOOK_TABS)[number];

/** One message as the screen's card renders it. */
export interface GuestbookRow {
  readonly id: string;
  readonly authorName: string;
  readonly message: string;
  /** The relative date of the signature, as the card's small line shows it. */
  readonly signedAt: string;
}

/** Everything the screen renders for one invitation. */
export interface GuestbookModerationView {
  /** The tab the query asked for, defaulting to the visible messages. */
  readonly tab: GuestbookTab;
  readonly visibleTab: string;
  readonly hiddenTab: string;
  /** The messages of the visible tab, newest first, as the API answered them. */
  readonly visible: readonly GuestbookRow[];
  /** The messages of the hidden tab, newest first. */
  readonly hidden: readonly GuestbookRow[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The relative date of one signature (F7; L10.6): the artboard's «hace 2 h», «ayer». A date this runtime cannot read,
 * or one that is somehow in the future, reads as «hace unos minutos» instead of a negative sentence or an invalid date.
 */
export function signedAtLabel(createdAt: string, now: Date): string {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) {
    return GUESTBOOK_OWNER_COPY.signedNow;
  }
  const elapsed = now.getTime() - at;

  if (elapsed < HOUR_MS) {
    return GUESTBOOK_OWNER_COPY.signedNow;
  }
  if (elapsed < DAY_MS) {
    return GUESTBOOK_OWNER_COPY.signedHours(Math.floor(elapsed / HOUR_MS));
  }
  const days = Math.floor(elapsed / DAY_MS);

  return days === 1 ? GUESTBOOK_OWNER_COPY.signedYesterday : GUESTBOOK_OWNER_COPY.signedDays(days);
}

function rowsOf(entries: readonly GuestbookEntry[], now: Date): GuestbookRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    authorName: entry.authorName,
    message: entry.message,
    signedAt: signedAtLabel(entry.createdAt, now),
  }));
}

/**
 * The screen's view of one read (F7; L10.6). The two lists keep the API's order — newest first — and each tab states its
 * own count, so the owner sees how many messages they hid without opening that tab. A query naming another tab falls
 * back to the visible messages, which is what an owner expects to find first.
 */
export function guestbookModerationView(
  read: GuestbookRead,
  parameters: Record<string, string | string[] | undefined> = {},
  now: Date = new Date(),
): GuestbookModerationView {
  const asked = parameters[GUESTBOOK_TAB_PARAM];
  const tab: GuestbookTab =
    typeof asked === "string" && (GUESTBOOK_TABS as readonly string[]).includes(asked)
      ? (asked as GuestbookTab)
      : "visibles";
  const visible = rowsOf(
    read.entries.filter((entry) => !entry.hidden),
    now,
  );
  const hidden = rowsOf(
    read.entries.filter((entry) => entry.hidden),
    now,
  );

  return {
    tab,
    visibleTab: GUESTBOOK_OWNER_COPY.visibleTab(read.visibleCount),
    hiddenTab: GUESTBOOK_OWNER_COPY.hiddenTab(read.hiddenCount),
    visible,
    hidden,
  };
}

/** The call the two moderation writes make. */
export type GuestbookModerationClient = Pick<InvitationsClient, "setGuestbookEntryHidden">;

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** The invitation id and the entry id one submitted moderation form carries. */
function idsOf(form: FormData): { id: string; entryId: string } {
  return { id: text(form, "id") ?? "", entryId: text(form, "entryId") ?? "" };
}

/**
 * Hides one entry, or shows it again (F7; L10.6), and answers the page the form comes back to: the hidden tab after
 * hiding, the visible one after showing, because that is where the owner finds the message they just changed. A refused
 * write comes back with the page's own error code, and a session that ended goes to sign-in.
 */
export async function setGuestbookEntryHidden(
  api: GuestbookModerationClient,
  form: FormData,
  hidden: boolean,
): Promise<string> {
  const { id, entryId } = idsOf(form);

  if (!isUuid(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }
  if (!isUuid(entryId)) {
    return invitationErrorTarget(GUESTBOOK_OWNER_PATHS.page(id), "guestbook-entry-not-found");
  }

  const written = await sendInvitationCall(() => api.setGuestbookEntryHidden(id, entryId, hidden));

  if (!written.ok) {
    return invitationFailureTarget(GUESTBOOK_OWNER_PATHS.page(id), written.failure);
  }

  return hidden
    ? `${GUESTBOOK_OWNER_PATHS.page(id)}?${GUESTBOOK_TAB_PARAM}=ocultos`
    : GUESTBOOK_OWNER_PATHS.page(id);
}

/** The button of a visible message: it hides the entry and comes back to the hidden tab (F7; L10.6). */
export async function hideGuestbookEntry(
  api: GuestbookModerationClient,
  form: FormData,
): Promise<string> {
  return setGuestbookEntryHidden(api, form, true);
}

/** The button of a hidden message: it shows the entry again and comes back to the visible tab (F7; L10.6). */
export async function showGuestbookEntry(
  api: GuestbookModerationClient,
  form: FormData,
): Promise<string> {
  return setGuestbookEntryHidden(api, form, false);
}

/** Whether a value can name a stored row: an id that cannot be one never becomes a request path. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
