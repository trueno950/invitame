import type { RsvpResponseRecord } from "./rsvp.repository";

// The creator's CSV export (M6 G1; S1, S4). It is a pure function so the escaping is proved without a database or
// an HTTP request. Two rules keep the file safe at the spreadsheet:
//
// - RFC 4180 structure: CRLF line breaks, a cell quoted when it holds a comma, a quote, or a line break, and a
//   quote doubled inside a quoted cell;
// - CSV injection: a cell a spreadsheet would evaluate as a formula (starting with `=`, `+`, `-`, `@`, a tab, or a
//   carriage return) is prefixed with an apostrophe, so it stays text. The apostrophe becomes part of the cell's
//   content, and a cell that already starts with one is left alone.
//
// The header is Spanish because the file is product copy for the creator; the values are the stored ones, and the
// columns stay in one fixed order.

/** The header of the export, in the order every row follows. */
export const RSVP_CSV_HEADER = [
  "Nombre",
  "Asistencia",
  "Personas",
  "Teléfono",
  "Mensaje",
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
    response.phone ?? "",
    response.message ?? "",
    response.createdAt.toISOString(),
    response.updatedAt.toISOString(),
  ];
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
