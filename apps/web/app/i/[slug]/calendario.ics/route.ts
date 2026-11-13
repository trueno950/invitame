import { connection } from "next/server";

import { invitationCalendarFile } from "../../../../lib/public/invitation-features.ts";
import { loadPublicInvitation } from "../_lib/load.ts";

/**
 * `GET /i/[slug]/calendario.ics` (F3; S4): the calendar download of a published invitation, next to its page.
 * It reads the same public projection the page reads, through the same cookie-free client and the same
 * per-request cache, and builds the file from the invitation's own facts and stored zone. A slug that is not
 * public, a snapshot whose facts cannot be read, and a zone this runtime cannot format all answer the same
 * plain 404, so the download never confirms anything the page would not show.
 *
 * Nothing is logged here: the request carries no session, and the invitation's content is personal data. The
 * response is never stored, because the owner may change the date or the place at any time (A6).
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  await connection();
  const { slug } = await params;
  const loaded = await loadPublicInvitation(slug);

  if (loaded.status !== "ok") {
    return new Response(null, { status: 404 });
  }

  const file = invitationCalendarFile(loaded.invitation, new Date());

  if (file === undefined) {
    return new Response(null, { status: 404 });
  }

  return new Response(file.body, { status: 200, headers: file.headers });
}
