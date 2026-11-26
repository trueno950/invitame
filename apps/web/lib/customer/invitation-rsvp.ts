import { deadlineInputValue, formatRsvpDeadline } from "../invitation-features/rsvp-deadline.ts";
import type { RsvpCompanionValue } from "../public/rsvp-companions.ts";
import {
  type InvitationResult,
  type OwnedInvitation,
  RSVP_PARTY_LIMIT_MAX,
  RSVP_PARTY_LIMIT_MIN,
  type RsvpCsv,
  type RsvpRead,
  type RsvpSettings,
} from "../server/invitations-api.ts";
import { GUEST_COPY, RSVP_COPY } from "./copy.ts";
import { INVITATION_PATHS } from "./invitations.ts";
import { rsvpSettingsIssueMessages } from "./rsvp-issue.ts";

/**
 * The creator's side of RSVP (M6 G3; S1, S4): the «Asistencia» section of a draft and the page that lists the
 * answers. The API owns the settings, the ownership boundary, and the CSV; these functions build what the pages
 * render, and pass the download's own headers through to the browser. The settings themselves are written by the
 * editor's own autosave (T2a, T2c), which fills the field the owner did not touch from what is stored.
 */

/** The catalog key that decides whether the attendance page lists guests instead of open answers (M6 G4). */
const GUEST_LIST_FEATURE_KEY = "GUEST_LIST";

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
  /** What that page is called: the answers, or the guest list of a package that grants it (M6 G4; S4). */
  readonly responsesLabel: string;
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
    responsesLabel: invitation.availableFeatures.includes(GUEST_LIST_FEATURE_KEY)
      ? GUEST_COPY.responsesHeading
      : RSVP_COPY.responsesLink,
  };
}

/** One answer of the responses page, as the page renders it. */
export interface RsvpResponseRow {
  readonly id: string;
  readonly name: string;
  readonly attending: boolean;
  readonly partySize: number;
  /** The companion names the guest gave, joined for the row, or a dash when they named none (F3; L6.4). */
  readonly companions: string;
  /** How many companions are children, as the row shows it, or a dash when nobody confirmed (F3; L6.4). */
  readonly children: string;
  /** The dietary restrictions, or a dash when the guest named none (F3; L6.4). */
  readonly dietaryNotes: string;
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
      companions: companionNames(response.companions),
      children: response.attending ? String(childrenOf(response.companions)) : "—",
      dietaryNotes: response.dietaryNotes === null ? "—" : response.dietaryNotes,
      phone: response.phone ?? "",
      message: response.message ?? "",
      answeredAt: formatRsvpDeadline(response.createdAt, invitation.timeZone) ?? response.createdAt,
      updated: response.updatedAt !== response.createdAt,
    })),
    csvHref: RSVP_PATHS.csv(invitation.id),
    settings: rsvpSettingsView(invitation, read.settings),
  };
}

/**
 * The companion names of one answer, as the page shows them (F3; L6.4): in the guest's own order, joined by a comma, with
 * a blank name left out because a guest may confirm a count without every name. A dash is what the page shows when the
 * guest named nobody, and an answer stored before the companions existed reads the same way.
 */
function companionNames(companions: readonly RsvpCompanionValue[] | null): string {
  const named = (companions ?? []).map((companion) => companion.name).filter((name) => name !== "");

  return named.length === 0 ? "—" : named.join(", ");
}

/** How many of one answer's companions are children (F3; L6.4); an answer stored before them counts none. */
function childrenOf(companions: readonly RsvpCompanionValue[] | null): number {
  return (companions ?? []).filter((companion) => companion.child).length;
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

export { rsvpSettingsIssueMessages };
