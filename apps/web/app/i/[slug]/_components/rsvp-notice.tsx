import type { GuestAlbumNotice } from "../../../../lib/public/guest-album.ts";
import type { GuestbookNotice } from "../../../../lib/public/guestbook.ts";
import type { RsvpNotice } from "../../../../lib/public/invitation-rsvp.ts";
import { errorNote, statusNote } from "../../../_components/ui.ts";

/**
 * The notice of the guest's answer, read from the page's own query and rendered on the server (M6 G3; S4). A
 * received answer is a confirmation and a refusal is an alert, so the news never relies on color alone, and the
 * copy is one of the page's own Spanish sentences — no API text ever reaches a guest.
 */
export function RsvpNoticeNote({ notice }: { notice: RsvpNotice }) {
  return notice.code === "received" ? (
    <p className={statusNote} role="status">
      {notice.message}
    </p>
  ) : (
    <p className={errorNote} role="alert">
      {notice.message}
    </p>
  );
}

/**
 * The notice of a signature, read from the page's own query and rendered on the server (F7; L10.3). A signed wall is a
 * confirmation and a refusal is an alert, so the news never relies on color alone, and the copy is one of the page's
 * own Spanish sentences — no API text ever reaches a guest.
 */
export function GuestbookNoticeNote({ notice }: { notice: GuestbookNotice }) {
  return notice.code === "signed" ? (
    <p className={statusNote} role="status">
      {notice.message}
    </p>
  ) : (
    <p className={errorNote} role="alert">
      {notice.message}
    </p>
  );
}

/**
 * The notice of an uploaded photo, read from the page's own query and rendered on the server (F8; L11.5). A stored photo
 * is a confirmation — it appears once the owner approves it — and a refusal is an alert, so the news never relies on
 * color alone, and the copy is one of the page's own Spanish sentences.
 */
export function GuestAlbumNoticeNote({ notice }: { notice: GuestAlbumNotice }) {
  return notice.code === "uploaded" ? (
    <p className={statusNote} role="status">
      {notice.message}
    </p>
  ) : (
    <p className={errorNote} role="alert">
      {notice.message}
    </p>
  );
}
