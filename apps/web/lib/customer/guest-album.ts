import { GUEST_ALBUM_OWNER_COPY } from "./copy.ts";
import {
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  sendInvitationCall,
} from "./invitations.ts";
import { guestAlbumPhotoAlt } from "../invitation-features/guest-album.ts";
import type {
  GuestAlbumRead,
  GuestPhotoItem,
  GuestPhotoStatus,
  InvitationsClient,
} from "../server/invitations-api.ts";

/**
 * The owner's album screen (F8; L11.6): one invitation's photos split into the three tabs the design shows — «Por
 * revisar», «Publicadas», and «Ocultas» — with the one action each tab offers. Nothing is deleted: publishing shows a
 * photo to the guests, hiding takes it down again, and both are reversible, so a guest never loses what they uploaded
 * to a mis-tap.
 *
 * Ownership is never checked here: the page and the actions call the API with the session cookie, and the API answers
 * 404 for an invitation this customer does not own (A4) and 404 for a photo that is not this invitation's.
 */

/** The screen's own path, next to the invitation it belongs to (F8; L11.6). */
export const GUEST_ALBUM_OWNER_PATHS = {
  page: (id: string) => `${INVITATION_PATHS.detail(id)}/album`,
} as const;

/** The query parameter that names the open tab. */
export const GUEST_ALBUM_TAB_PARAM = "ver";

/** The three tabs of the screen, in the order the design shows them. */
export const GUEST_ALBUM_TABS = ["por-revisar", "publicadas", "ocultas"] as const;
export type GuestAlbumTab = (typeof GUEST_ALBUM_TABS)[number];

/** The one moderation write a row offers. */
export type GuestAlbumActionKind = "publish" | "hide" | "show";

/** One photo as the screen's card renders it. */
export interface GuestAlbumRow {
  readonly id: string;
  /** The absolute API URL of the image, which the card shows. */
  readonly url: string;
  /** The uploader's name as plain text, or the screen's own word for a photo nobody signed. */
  readonly uploaderName: string;
  /** The image's alt text, built from the same name. */
  readonly alt: string;
  /** The relative date the photo arrived. */
  readonly receivedAt: string;
}

/** The one action every row of the open tab offers, so the screen states it once. */
export interface GuestAlbumRowAction {
  readonly kind: GuestAlbumActionKind;
  readonly label: string;
}

/** Everything the screen renders for one invitation. */
export interface GuestAlbumModerationView {
  /** The tab the query asked for, defaulting to the photos waiting for review. */
  readonly tab: GuestAlbumTab;
  readonly reviewTab: string;
  readonly publishedTab: string;
  readonly hiddenTab: string;
  /** The photos of the open tab, newest first, as the API answered them. */
  readonly rows: readonly GuestAlbumRow[];
  /** The action of every row of the open tab. */
  readonly action: GuestAlbumRowAction;
  /** The screen's own note for the open tab when it holds no photo. */
  readonly emptyNote: string;
  /** The retention of the photos nobody published or the owner took down again, in words (L11.6). */
  readonly retentionNote: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The relative date of one uploaded photo (F8; L11.6): the artboard's «hace 2 h», «ayer». A date this runtime cannot
 * read, or one that is somehow in the future, reads as «hace unos minutos» instead of a negative sentence or an
 * invalid date.
 */
export function receivedAtLabel(createdAt: string, now: Date): string {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) {
    return GUEST_ALBUM_OWNER_COPY.receivedNow;
  }
  const elapsed = now.getTime() - at;

  if (elapsed < HOUR_MS) {
    return GUEST_ALBUM_OWNER_COPY.receivedNow;
  }
  if (elapsed < DAY_MS) {
    return GUEST_ALBUM_OWNER_COPY.receivedHours(Math.floor(elapsed / HOUR_MS));
  }
  const days = Math.floor(elapsed / DAY_MS);

  return days === 1
    ? GUEST_ALBUM_OWNER_COPY.receivedYesterday
    : GUEST_ALBUM_OWNER_COPY.receivedDays(days);
}

/** The action and the empty note of each tab, as the screen shows them. */
const TAB_ACTIONS: Readonly<Record<GuestAlbumTab, GuestAlbumRowAction>> = {
  "por-revisar": { kind: "publish", label: GUEST_ALBUM_OWNER_COPY.publishAction },
  publicadas: { kind: "hide", label: GUEST_ALBUM_OWNER_COPY.hideAction },
  ocultas: { kind: "show", label: GUEST_ALBUM_OWNER_COPY.showAction },
};

const TAB_EMPTY_NOTES: Readonly<Record<GuestAlbumTab, string>> = {
  "por-revisar": GUEST_ALBUM_OWNER_COPY.emptyReview,
  publicadas: GUEST_ALBUM_OWNER_COPY.emptyPublished,
  ocultas: GUEST_ALBUM_OWNER_COPY.emptyHidden,
};

/** The stored state each tab lists. */
const TAB_STATUSES: Readonly<Record<GuestAlbumTab, GuestPhotoStatus>> = {
  "por-revisar": "PENDING",
  publicadas: "PUBLISHED",
  ocultas: "HIDDEN",
};

function rowOf(photo: GuestPhotoItem, now: Date): GuestAlbumRow {
  return {
    id: photo.id,
    url: photo.url,
    uploaderName: photo.uploaderName ?? GUEST_ALBUM_OWNER_COPY.anonymous,
    alt: guestAlbumPhotoAlt(photo.uploaderName),
    receivedAt: receivedAtLabel(photo.createdAt, now),
  };
}

/**
 * The screen's view of one read (F8; L11.6). The rows keep the API's order — newest first — and each tab states its own
 * count, so the owner sees how many photos wait for review without opening that tab. A query naming another tab falls
 * back to the photos waiting for review, which is what the owner comes to the screen to do.
 */
export function guestAlbumModerationView(
  read: GuestAlbumRead,
  parameters: Record<string, string | string[] | undefined> = {},
  now: Date = new Date(),
): GuestAlbumModerationView {
  const asked = parameters[GUEST_ALBUM_TAB_PARAM];
  const tab: GuestAlbumTab =
    typeof asked === "string" && (GUEST_ALBUM_TABS as readonly string[]).includes(asked)
      ? (asked as GuestAlbumTab)
      : "por-revisar";
  const status = TAB_STATUSES[tab];

  return {
    tab,
    reviewTab: GUEST_ALBUM_OWNER_COPY.reviewTab(read.pendingCount),
    publishedTab: GUEST_ALBUM_OWNER_COPY.publishedTab(read.publishedCount),
    hiddenTab: GUEST_ALBUM_OWNER_COPY.hiddenTab(read.hiddenCount),
    rows: read.photos.filter((photo) => photo.status === status).map((photo) => rowOf(photo, now)),
    action: TAB_ACTIONS[tab],
    emptyNote: TAB_EMPTY_NOTES[tab],
    retentionNote: GUEST_ALBUM_OWNER_COPY.retentionNote,
  };
}

/** The call the three moderation writes make. */
export type GuestAlbumModerationClient = Pick<InvitationsClient, "reviewGuestPhoto">;

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** The invitation id and the photo id one submitted moderation form carries. */
function idsOf(form: FormData): { id: string; photoId: string } {
  return { id: text(form, "id") ?? "", photoId: text(form, "photoId") ?? "" };
}

/**
 * Sets one photo's state (F8; L11.6) and answers the page the form comes back to: the published tab after publishing or
 * showing again, the hidden one after hiding, because that is where the owner finds the photo they just changed. A
 * refused write comes back with the page's own error code, and a session that ended goes to sign-in.
 */
export async function reviewGuestPhoto(
  api: GuestAlbumModerationClient,
  form: FormData,
  status: "PUBLISHED" | "HIDDEN",
): Promise<string> {
  const { id, photoId } = idsOf(form);

  if (!isUuid(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }
  if (!isUuid(photoId)) {
    return invitationErrorTarget(GUEST_ALBUM_OWNER_PATHS.page(id), "guest-photo-not-found");
  }

  const written = await sendInvitationCall(() => api.reviewGuestPhoto(id, photoId, status));

  if (!written.ok) {
    return invitationFailureTarget(GUEST_ALBUM_OWNER_PATHS.page(id), written.failure);
  }

  return status === "HIDDEN"
    ? `${GUEST_ALBUM_OWNER_PATHS.page(id)}?${GUEST_ALBUM_TAB_PARAM}=ocultas`
    : `${GUEST_ALBUM_OWNER_PATHS.page(id)}?${GUEST_ALBUM_TAB_PARAM}=publicadas`;
}

/** The button of a pending photo: it publishes the photo and comes back to the published tab (F8; L11.6). */
export async function publishGuestPhoto(
  api: GuestAlbumModerationClient,
  form: FormData,
): Promise<string> {
  return reviewGuestPhoto(api, form, "PUBLISHED");
}

/** The button of a published photo: it hides the photo and comes back to the hidden tab (F8; L11.6). */
export async function hideGuestPhoto(
  api: GuestAlbumModerationClient,
  form: FormData,
): Promise<string> {
  return reviewGuestPhoto(api, form, "HIDDEN");
}

/** The button of a hidden photo: it publishes it again and comes back to the published tab (F8; L11.6). */
export async function showGuestPhoto(
  api: GuestAlbumModerationClient,
  form: FormData,
): Promise<string> {
  return reviewGuestPhoto(api, form, "PUBLISHED");
}

/** Whether a value can name a stored row: an id that cannot be one never becomes a request path. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
