import { rsvpCsvResponse } from "../../../../../../lib/customer/invitation-rsvp.ts";
import { invitations } from "../../../_lib/api.ts";
import { attempt } from "../../../_lib/load.ts";

/**
 * `GET /cuenta/invitaciones/[id]/asistencia/csv` (M6 G3; S1, S4): the owner's answers as a downloadable file. The
 * handler is the smallest possible adapter: it reads the same RSVP route as the page, with the session cookie the
 * client already forwards, and passes the API's own file, content type, and attachment filename through with
 * `Cache-Control: no-store`. An ended session goes to sign-in, a missing or foreign invitation is 404, and an
 * outage is 503 — never an empty file a spreadsheet would import as "no answers".
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  return rsvpCsvResponse(await attempt(() => invitations.rsvpCsv(id)));
}
