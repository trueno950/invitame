import {
  deadlineInputValue,
  deadlineInstant,
  formatRsvpDeadline,
} from "../invitation-features/rsvp-deadline.ts";
import {
  type InvitationTimeZone,
  isInvitationTimeZone,
} from "../invitation-features/time-zones.ts";
import {
  type InvitationResult,
  type InvitationsClient,
  isInvitationId,
  type OwnedInvitation,
  RSVP_PARTY_LIMIT_MAX,
  RSVP_PARTY_LIMIT_MIN,
  type RsvpCsv,
  type RsvpRead,
  type RsvpSettings,
} from "../server/invitations-api.ts";
import {
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  invitationNoticeTarget,
  sendInvitationCall,
} from "./invitations.ts";
import {
  rsvpSettingsIssueCodes,
  rsvpSettingsIssueMessages,
  rsvpSettingsIssuesTarget,
} from "./rsvp-issue.ts";

/**
 * The creator's side of RSVP (M6 G3; S1, S4): the «Asistencia» section of a draft and the page that lists the
 * answers. The API owns the settings, the ownership boundary, and the CSV; these functions build what the pages
 * render, turn one submitted settings form into the API call and the redirect that follows it, and pass the
 * download's own headers through to the browser.
 */

/** The owner's RSVP paths, next to the invitation they belong to. */
export const RSVP_PATHS = {
  list: INVITATION_PATHS.list,
  detail: INVITATION_PATHS.detail,
  responses: (id: string) => `${INVITATION_PATHS.detail(id)}/asistencia`,
  csv: (id: string) => `${INVITATION_PATHS.detail(id)}/asistencia/csv`,
} as const;

/** The parties a settings form offers, from 1 to the API's own maximum (S4). */
export const RSVP_PARTY_LIMITS: readonly number[] = Array.from(
  { length: RSVP_PARTY_LIMIT_MAX - RSVP_PARTY_LIMIT_MIN + 1 },
  (_unused, index) => RSVP_PARTY_LIMIT_MIN + index,
);

/** Everything the «Asistencia» section renders for one invitation. */
export interface RsvpSettingsView {
  readonly id: string;
  /** False while the invitation is archived, like the content form's read-only state. */
  readonly editable: boolean;
  /** The stored deadline as the value of the `datetime-local` field, or "" when there is none. */
  readonly deadlineValue: string;
  /** The stored deadline as one Spanish sentence in the invitation's zone, or "" when there is none. */
  readonly deadlineText: string;
  readonly partyLimit: number;
  readonly partyLimits: readonly number[];
  /** The invitation's zone, carried by the form so the action reads the wall clock the creator saw. */
  readonly timeZone: string;
  /** The page that lists this invitation's answers and offers the CSV. */
  readonly responsesHref: string;
}

/**
 * The section of one invitation (S4). The deadline is read in the invitation's own zone, so the creator writes and
 * reads the same wall clock the guest sees, and every party from 1 to 10 is offered because the API accepts them
 * all.
 */
export function rsvpSettingsView(
  invitation: OwnedInvitation,
  settings: RsvpSettings,
): RsvpSettingsView {
  return {
    id: invitation.id,
    editable: invitation.status !== "ARCHIVED",
    deadlineValue:
      settings.deadline === null
        ? ""
        : (deadlineInputValue(settings.deadline, invitation.timeZone) ?? ""),
    deadlineText:
      settings.deadline === null
        ? ""
        : (formatRsvpDeadline(settings.deadline, invitation.timeZone) ?? ""),
    partyLimit: settings.partyLimit,
    partyLimits: RSVP_PARTY_LIMITS,
    timeZone: invitation.timeZone,
    responsesHref: RSVP_PATHS.responses(invitation.id),
  };
}

/** The settings a submitted form asks to save, or every issue that refuses it. */
export type RsvpSettingsParse =
  | {
      readonly ok: true;
      readonly deadline: string | null;
      readonly partyLimit: number;
      readonly timeZone: InvitationTimeZone;
    }
  | { readonly ok: false; readonly issues: readonly ("deadline" | "party" | "other")[] };

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/**
 * The settings one submitted form asks to save (S4). The deadline field is a wall clock in the invitation's zone,
 * which the form carries in its hidden `timeZone`, and the party limit is one of the offered numbers. The API
 * validates both again and refuses an archived invitation; this function only refuses what no request could fix.
 */
export function parseRsvpSettingsForm(form: FormData): RsvpSettingsParse {
  const submittedZone = text(form, "timeZone");
  const timeZone =
    submittedZone !== undefined && isInvitationTimeZone(submittedZone) ? submittedZone : undefined;

  if (timeZone === undefined) {
    // The hidden zone is written by the page itself; a form without it is not the form this page renders.
    return { ok: false, issues: ["other"] };
  }

  const issues: Array<"deadline" | "party"> = [];
  const submittedDeadline = text(form, "deadline") ?? "";
  let deadline: string | null = null;

  if (submittedDeadline.trim() !== "") {
    const instant = deadlineInstant(submittedDeadline.trim(), timeZone);

    if (instant === undefined) {
      issues.push("deadline");
    } else {
      deadline = instant;
    }
  }

  const submittedPartyLimit = text(form, "partyLimit") ?? "";
  const partyLimit = /^\d{1,2}$/.test(submittedPartyLimit)
    ? Number(submittedPartyLimit)
    : Number.NaN;

  if (
    !Number.isInteger(partyLimit) ||
    partyLimit < RSVP_PARTY_LIMIT_MIN ||
    partyLimit > RSVP_PARTY_LIMIT_MAX
  ) {
    issues.push("party");
  }

  if (issues.length > 0 || !Number.isInteger(partyLimit)) {
    return { ok: false, issues };
  }

  return { ok: true, deadline, partyLimit, timeZone };
}

/** The client calls this module makes, so a test can hand it a fake and see exactly what it sent. */
export type RsvpSettingsClient = Pick<InvitationsClient, "updateRsvpSettings">;

/**
 * Saves the deadline and the party limit through `PUT /invitations/:id/rsvp-settings` (S4). The API authorizes the
 * invitation, validates both values, and refuses an archived one; this function maps each outcome to the page's
 * query, with its own issue sentences for a refusal that names them.
 */
export async function saveRsvpSettings(api: RsvpSettingsClient, form: FormData): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const parsed = parseRsvpSettingsForm(form);

  if (!parsed.ok) {
    return rsvpSettingsIssuesTarget(path, parsed.issues);
  }

  const written = await sendInvitationCall(() =>
    api.updateRsvpSettings(id, { deadline: parsed.deadline, partyLimit: parsed.partyLimit }),
  );

  if (written.ok) {
    return invitationNoticeTarget(path, "rsvp-saved");
  }
  if (written.failure === "rsvp-settings-invalid") {
    return rsvpSettingsIssuesTarget(path, rsvpSettingsIssueCodes(written.issues ?? []));
  }
  return invitationFailureTarget(path, written.failure);
}

/** One answer of the responses page, as the page renders it. */
export interface RsvpResponseRow {
  readonly id: string;
  readonly name: string;
  readonly attending: boolean;
  readonly partySize: number;
  /** The stored phone, or "" when the guest left none. */
  readonly phone: string;
  /** The stored message, or "" when the guest left none. */
  readonly message: string;
  /** When the response arrived, on the invitation's clock. */
  readonly answeredAt: string;
  /** Whether the guest answered again, so the creator knows this row is the newer one. */
  readonly updated: boolean;
}

/** Everything the responses page renders for one invitation (S1, S4). */
export interface RsvpResponsesView {
  readonly invitationId: string;
  readonly totals: RsvpRead["totals"];
  /** The answers, newest first, in the API's own order. */
  readonly rows: readonly RsvpResponseRow[];
  /** The CSV download of the same rows and the same order. */
  readonly csvHref: string;
  readonly settings: RsvpSettingsView;
}

/**
 * The responses page of one invitation (S1, S4). The order is the API's — newest first — and it is the order the
 * CSV exports, so the file and the page always agree. Each time is read on the invitation's own clock, and a row
 * whose response was updated says so instead of hiding the second answer.
 */
export function rsvpResponsesView(invitation: OwnedInvitation, read: RsvpRead): RsvpResponsesView {
  return {
    invitationId: invitation.id,
    totals: read.totals,
    rows: read.responses.map((response) => ({
      id: response.id,
      name: response.name,
      attending: response.attending,
      partySize: response.partySize,
      phone: response.phone ?? "",
      message: response.message ?? "",
      answeredAt: formatRsvpDeadline(response.createdAt, invitation.timeZone) ?? response.createdAt,
      updated: response.updatedAt !== response.createdAt,
    })),
    csvHref: RSVP_PATHS.csv(invitation.id),
    settings: rsvpSettingsView(invitation, read.settings),
  };
}

/** The headers of the CSV download: never cached, because the answers change while the invitation is open. */
const RSVP_CSV_CACHE = "no-store";

/** A plain-text answer of the download route, when there is no file to send. */
function textAnswer(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": RSVP_CSV_CACHE,
      ...headers,
    },
  });
}

/**
 * The answer of `GET /cuenta/invitaciones/[id]/asistencia/csv` (S1, S4). A success passes the API's own file and
 * headers through, without caching; an ended session is sent to sign in; a missing or foreign invitation is the
 * same 404, and an outage is a 503 rather than an empty file a spreadsheet would import as "no answers".
 */
export function rsvpCsvResponse(result: InvitationResult<RsvpCsv> | "unavailable"): Response {
  if (result === "unavailable") {
    return textAnswer(503, "No pudimos descargar el archivo. Inténtalo de nuevo en unos minutos.");
  }
  if (result.ok) {
    return new Response(result.value.body, {
      status: 200,
      headers: {
        "content-type": result.value.contentType,
        "content-disposition": result.value.contentDisposition,
        "cache-control": RSVP_CSV_CACHE,
      },
    });
  }
  if (result.failure === "signed-out") {
    return textAnswer(307, "", { location: "/ingresar" });
  }
  if (result.failure === "not-found") {
    return textAnswer(404, "No encontramos esa invitación.");
  }
  return textAnswer(503, "No pudimos descargar el archivo. Inténtalo de nuevo en unos minutos.");
}

/** The Spanish sentences of a refused save, as the draft page shows them under its error. */
export { rsvpSettingsIssueMessages };
