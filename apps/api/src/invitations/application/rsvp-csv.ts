import type { RsvpCompanion } from "../domain/invitation-rsvp";
import type { GuestWithResponse } from "./guest.repository";
import type { RsvpResponseRecord } from "./rsvp.repository";

// The creator's CSV export (M6 G1, G2; S1, S4). It is a pure function so the escaping is proved without a database
// or an HTTP request. Two rules keep the file safe at the spreadsheet:
//
// - RFC 4180 structure: CRLF line breaks, a cell quoted when it holds a comma, a quote, or a line break, and a
//   quote doubled inside a quoted cell;
// - CSV injection: a cell a spreadsheet would evaluate as a formula (starting with `=`, `+`, `-`, `@`, a tab, or a
//   carriage return) is prefixed with an apostrophe, so it stays text. The apostrophe becomes part of the cell's
//   content, and a cell that already starts with one is left alone.
//
// The open form exports one line per response (G1). A guest list exports one line per guest (G2), pending guests
// included, because the door needs the whole list and not only the answers already received. The companion columns of
// F3 travel the same way: their names, how many of them are children, and the dietary notes the guest named, so the
// same escaping rules apply to them as to every other cell. The header is Spanish because the file is product copy for
// the creator; the values are the stored ones, and the columns stay in one fixed order.

/** The header of the response export, in the order every row follows. */
export const RSVP_CSV_HEADER = [
  "Nombre",
  "Asistencia",
  "Personas",
  "Acompañantes",
  "Niños",
  "Restricciones alimentarias",
  "Teléfono",
  "Mensaje",
  "Primera respuesta",
  "Última actualización",
] as const;

/** The header of the guest-list export, in the order every row follows (M6 G2, F3). */
export const GUEST_CSV_HEADER = [
  "Nombre",
  "Lugares",
  "Asistencia",
  "Personas",
  "Acompañantes",
  "Niños",
  "Restricciones alimentarias",
  "Teléfono",
  "Nota",
  "Mensaje",
  "Primer check-in",
  "Primera respuesta",
  "Última actualización",
] as const;

/** The first character of a cell a spreadsheet would run as a formula (OWASP CSV injection list). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** What forces a cell into quotes under RFC 4180. */
const NEEDS_QUOTES = /[",\r\n]/;

/** One cell: neutralized if it could be a formula, then quoted and escaped when it must be. */
function cell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The values of one response, in the header's order. An absent phone or message is an empty cell. */
function cellsOf(response: RsvpResponseRecord): string[] {
  return [
    response.name,
    response.attending ? "Sí" : "No",
    String(response.partySize),
    companionNames(response.companions),
    String(childrenOf(response.companions)),
    response.dietaryNotes ?? "",
    response.phone ?? "",
    response.message ?? "",
    response.createdAt.toISOString(),
    response.updatedAt.toISOString(),
  ];
}

/**
 * The companion names of one answer, as the creator reads them (F3; L6.4): one per extra person, in the order the guest
 * gave them, joined by a comma and a space, with a blank name left out because a guest may confirm a count without
 * every name. A legacy answer names none, so the cell is empty rather than invented.
 */
function companionNames(companions: readonly RsvpCompanion[] | null): string {
  return (companions ?? [])
    .map((companion) => companion.name)
    .filter((name) => name !== "")
    .join(", ");
}

/** How many companion entries of one answer are marked as a child (F3; L6.4); a legacy answer counts none. */
function childrenOf(companions: readonly RsvpCompanion[] | null): number {
  return (companions ?? []).filter((companion) => companion.child).length;
}

/**
 * The CSV text of the responses, in the order given (the creator read's newest first), ending every line with CRLF.
 * An invitation with no responses exports the header alone.
 */
export function toRsvpCsv(responses: readonly RsvpResponseRecord[]): string {
  const lines = [RSVP_CSV_HEADER.map(cell).join(",")];

  for (const response of responses) {
    lines.push(cellsOf(response).map(cell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** The attendance cell of one guest: confirmed, declined, or still unanswered. */
function guestAttendance(guest: GuestWithResponse): string {
  if (guest.response === null) {
    return "Pendiente";
  }
  return guest.response.attending ? "Sí" : "No";
}

/**
 * The values of one guest, in the guest header's order. A guest who has not answered leaves the answer cells empty;
 * the last-update cell falls back to the guest's own timestamp, so every line names when it last changed.
 */
function guestCellsOf(guest: GuestWithResponse): string[] {
  return [
    guest.name,
    String(guest.seats),
    guestAttendance(guest),
    guest.response === null ? "" : String(guest.response.partySize),
    guest.response === null ? "" : companionNames(guest.response.companions),
    guest.response === null ? "" : String(childrenOf(guest.response.companions)),
    guest.response?.dietaryNotes ?? "",
    guest.phone ?? "",
    guest.note ?? "",
    guest.response?.message ?? "",
    guest.checkedInAt?.toISOString() ?? "",
    guest.response?.createdAt.toISOString() ?? "",
    (guest.response?.updatedAt ?? guest.updatedAt).toISOString(),
  ];
}

/**
 * The CSV text of a guest list, in the order given (the creator read's newest first), ending every line with CRLF.
 * A guest who has not answered is exported too, so the file is the list the door needs. An invitation with no
 * guests exports the header alone.
 */
export function toGuestCsv(guests: readonly GuestWithResponse[]): string {
  const lines = [GUEST_CSV_HEADER.map(cell).join(",")];

  for (const guest of guests) {
    lines.push(guestCellsOf(guest).map(cell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
