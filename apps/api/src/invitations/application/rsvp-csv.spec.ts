import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RsvpResponseRecord } from "./rsvp.repository";
import { toRsvpCsv } from "./rsvp-csv";

// The creator's CSV export (M6 G1; S1, S4): a spreadsheet-safe file. Every cell is quoted when it holds a comma, a
// quote, or a line break, quotes are doubled, and a cell that a spreadsheet would read as a formula is prefixed
// with an apostrophe so it stays text (CSV injection). No other rule is applied: the values are the stored ones.

const HEADER = "Nombre,Asistencia,Personas,Teléfono,Mensaje,Primera respuesta,Última actualización";

function record(overrides: Partial<RsvpResponseRecord> = {}): RsvpResponseRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    invitationId: "22222222-2222-4222-8222-222222222222",
    name: "Ana Pérez",
    dedupeKey: "ana perez|+525512345678",
    attending: true,
    partySize: 2,
    phone: "+525512345678",
    message: "¡Con gusto!",
    createdAt: new Date("2026-11-20T10:00:00.000Z"),
    updatedAt: new Date("2026-11-20T10:00:00.000Z"),
    ...overrides,
  };
}

/** The one data line of a single-row export, without the header and without the trailing line break. */
function dataLine(row: RsvpResponseRecord): string {
  return toRsvpCsv([row]).split("\r\n")[1] ?? "";
}

describe("RSVP CSV export (S1, S4)", () => {
  it("writes a Spanish header and one line per response, ending each line with CRLF", () => {
    const csv = toRsvpCsv([record()]);

    assert.equal(
      csv,
      `${HEADER}\r\nAna Pérez,Sí,2,'+525512345678,¡Con gusto!,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z\r\n`,
    );
  });

  it("writes an empty file with only the header when there are no responses", () => {
    assert.equal(toRsvpCsv([]), `${HEADER}\r\n`);
  });

  it("writes Sí and No, and leaves a missing phone or message as an empty cell", () => {
    assert.equal(
      dataLine(record({ attending: false, partySize: 0, phone: null, message: null })),
      "Ana Pérez,No,0,,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
    );
  });

  it("quotes a cell with a comma, doubles a quote, and keeps a line break inside quotes", () => {
    assert.equal(dataLine(record({ name: "Pérez, Ana" })).startsWith('"Pérez, Ana",Sí'), true);
    assert.equal(dataLine(record({ name: 'Ana "Anita"' })).startsWith('"Ana ""Anita""",Sí'), true);
    assert.equal(
      dataLine(record({ message: "Hola,\n¿cómo están?" })),
      'Ana Pérez,Sí,2,\'+525512345678,"Hola,\n¿cómo están?",2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
    assert.equal(
      dataLine(record({ message: 'Dijo: "sí", y "no"' })),
      'Ana Pérez,Sí,2,\'+525512345678,"Dijo: ""sí"", y ""no""",2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
  });

  it("neutralizes a cell a spreadsheet would run as a formula", () => {
    for (const name of ["=1+1", "+52 55 1234 5678", "-Ana", "@SUM(A1)", "\tTabbed"]) {
      assert.equal(dataLine(record({ name })).startsWith(`'${name}`), true, JSON.stringify(name));
    }
    // A carriage return is a line break, so a cell starting with one is prefixed and then quoted.
    assert.equal(dataLine(record({ name: "\rCarriage" })).startsWith('"\'\rCarriage"'), true);
    // A message is a formula carrier too, so the rule is not only about the name.
    assert.equal(
      dataLine(record({ message: '=HYPERLINK("http://x","click")' })),
      'Ana Pérez,Sí,2,\'+525512345678,"\'=HYPERLINK(""http://x"",""click"")",2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
    // A cell that already starts with an apostrophe is text, so it is left as it is.
    assert.equal(dataLine(record({ name: "'=1+1" })).startsWith("'=1+1,Sí"), true);
    // A leading space does not make a formula, and a value that merely contains `=` is text.
    assert.equal(dataLine(record({ name: "Ana = 1" })).startsWith("Ana = 1,Sí"), true);
  });

  it("keeps the order it is given, which is the creator read's newest first", () => {
    const csv = toRsvpCsv([
      record({
        name: "Nueva",
        createdAt: new Date("2026-11-21T10:00:00.000Z"),
        updatedAt: new Date("2026-11-21T10:00:00.000Z"),
      }),
      record({
        name: "Vieja",
        createdAt: new Date("2026-11-20T10:00:00.000Z"),
        updatedAt: new Date("2026-11-20T10:00:00.000Z"),
      }),
    ]);

    const lines = csv.split("\r\n");
    assert.equal(lines[1]?.startsWith("Nueva,"), true);
    assert.equal(lines[2]?.startsWith("Vieja,"), true);
  });
});
