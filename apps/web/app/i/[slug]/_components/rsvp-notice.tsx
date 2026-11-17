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
