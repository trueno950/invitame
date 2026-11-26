import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GuestWithResponse } from "./guest.repository";
import type { RsvpResponseRecord } from "./rsvp.repository";
import { GUEST_CSV_HEADER, toGuestCsv, toRsvpCsv } from "./rsvp-csv";

// The creator's CSV export (M6 G1, G2; S1, S4): a spreadsheet-safe file. Every cell is quoted when it holds a
// comma, a quote, or a line break, quotes are doubled, and a cell that a spreadsheet would read as a formula is
// prefixed with an apostrophe so it stays text (CSV injection). No other rule is applied: the values are the
// stored ones. The open form exports one line per response (G1); a guest list exports one line per guest, with the
// pending guests and the check-in time the door needs (G2).

const HEADER =
  "Nombre,Asistencia,Personas,Acompañantes,Niños,Restricciones alimentarias,Teléfono,Mensaje,Primera respuesta,Última actualización";

function record(overrides: Partial<RsvpResponseRecord> = {}): RsvpResponseRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    invitationId: "22222222-2222-4222-8222-222222222222",
    name: "Ana Pérez",
    dedupeKey: "ana perez|+525512345678",
    attending: true,
    partySize: 2,
    companions: [],
    dietaryNotes: null,
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
      `${HEADER}\r\nAna Pérez,Sí,2,,0,,'+525512345678,¡Con gusto!,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z\r\n`,
    );
  });

  it("writes an empty file with only the header when there are no responses", () => {
    assert.equal(toRsvpCsv([]), `${HEADER}\r\n`);
  });

  it("writes Sí and No, and leaves a missing phone or message as an empty cell", () => {
    assert.equal(
      dataLine(record({ attending: false, partySize: 0, phone: null, message: null })),
      "Ana Pérez,No,0,,0,,,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
    );
  });

  it("quotes a cell with a comma, doubles a quote, and keeps a line break inside quotes", () => {
    assert.equal(dataLine(record({ name: "Pérez, Ana" })).startsWith('"Pérez, Ana",Sí'), true);
    assert.equal(dataLine(record({ name: 'Ana "Anita"' })).startsWith('"Ana ""Anita""",Sí'), true);
    assert.equal(
      dataLine(record({ message: "Hola,\n¿cómo están?" })),
      'Ana Pérez,Sí,2,,0,,\'+525512345678,"Hola,\n¿cómo están?",2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
    assert.equal(
      dataLine(record({ message: 'Dijo: "sí", y "no"' })),
      'Ana Pérez,Sí,2,,0,,\'+525512345678,"Dijo: ""sí"", y ""no""",2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
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
      'Ana Pérez,Sí,2,,0,,\'+525512345678,"\'=HYPERLINK(""http://x"",""click"")",2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
    // A cell that already starts with an apostrophe is text, so it is left as it is.
    assert.equal(dataLine(record({ name: "'=1+1" })).startsWith("'=1+1,Sí"), true);
    // A leading space does not make a formula, and a value that merely contains `=` is text.
    assert.equal(dataLine(record({ name: "Ana = 1" })).startsWith("Ana = 1,Sí"), true);
  });

  it("writes the companion names, the number of children, and the dietary notes (F3; L6.4)", () => {
    assert.equal(
      dataLine(
        record({
          partySize: 3,
          companions: [
            { name: "Jorge Gómez", child: false },
            { name: "Sofía Gómez", child: true },
          ],
          dietaryNotes: "Sofía es alérgica a la nuez",
        }),
      ),
      'Ana Pérez,Sí,3,"Jorge Gómez, Sofía Gómez",1,Sofía es alérgica a la nuez,\'+525512345678,¡Con gusto!,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
    // A guest who confirmed a count without every name leaves the names the guest did give, and a legacy answer names
    // nobody: its whole party is adult, so the children cell is 0.
    assert.equal(
      dataLine(record({ partySize: 2, companions: [{ name: "", child: false }] })).split(",")[3],
      "",
    );
  });

  it("neutralizes a formula in a companion name and in the dietary notes (S4, F3)", () => {
    const line = dataLine(
      record({
        partySize: 2,
        companions: [{ name: '=HYPERLINK("http://x","y")', child: true }],
        dietaryNotes: "@SUM(A1)",
      }),
    );

    assert.equal(
      line,
      'Ana Pérez,Sí,2,"\'=HYPERLINK(""http://x"",""y"")",1,\'@SUM(A1),\'+525512345678,¡Con gusto!,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
  });

  it("keeps the order it is given, which is the creator read's newest first", () => {
    // The guest export keeps its own order the same way, and is proved below.

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

/** The guest-list export of M6 G2: one line per guest, pending ones included, with the check-in time. */
function guest(overrides: Partial<GuestWithResponse> = {}): GuestWithResponse {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    invitationId: "22222222-2222-4222-8222-222222222222",
    name: "Ana Pérez",
    seats: 3,
    tableLabel: "7",
    phone: "+525512345678",
    note: "Mesa 4",
    tokenIssuedAt: new Date("2026-11-19T10:00:00.000Z"),
    checkedInAt: null,
    createdAt: new Date("2026-11-19T10:00:00.000Z"),
    updatedAt: new Date("2026-11-20T10:00:00.000Z"),
    response: {
      attending: true,
      partySize: 2,
      companions: [],
      dietaryNotes: null,
      message: "¡Con gusto!",
      createdAt: new Date("2026-11-20T10:00:00.000Z"),
      updatedAt: new Date("2026-11-20T10:00:00.000Z"),
    },
    ...overrides,
  };
}

describe("guest list CSV export (M6 G2; S1, S4)", () => {
  const HEADER = GUEST_CSV_HEADER.join(",");

  it("writes a Spanish header and one line per guest, ending each line with CRLF", () => {
    assert.deepEqual(GUEST_CSV_HEADER, [
      "Nombre",
      "Lugares",
      "Mesa",
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
    ]);
    assert.equal(
      toGuestCsv([guest()]),
      `${HEADER}\r\n` +
        "Ana Pérez,3,7,Sí,2,,0,,'+525512345678,Mesa 4,¡Con gusto!,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z\r\n",
    );
    assert.equal(toGuestCsv([]), `${HEADER}\r\n`);
  });

  it("marks a declined guest and a pending guest, and leaves their answers empty", () => {
    assert.deepEqual(
      toGuestCsv([
        guest({
          name: "Beto",
          seats: 1,
          tableLabel: "2",
          phone: null,
          note: null,
          response: {
            attending: false,
            partySize: 0,
            companions: [],
            dietaryNotes: null,
            message: null,
            createdAt: new Date("2026-11-20T10:00:00.000Z"),
            updatedAt: new Date("2026-11-20T10:00:00.000Z"),
          },
        }),
        guest({
          name: "Carla",
          seats: 2,
          tableLabel: null,
          phone: null,
          note: null,
          updatedAt: new Date("2026-11-19T10:00:00.000Z"),
          response: null,
        }),
      ]).split("\r\n"),
      [
        HEADER,
        "Beto,1,2,No,0,,0,,,,,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
        "Carla,2,,Pendiente,,,,,,,,,,2026-11-19T10:00:00.000Z",
        "",
      ],
    );
  });

  it("writes the first check-in instant, and neutralizes a cell a spreadsheet would run", () => {
    const csv = toGuestCsv([
      guest({
        name: "=Ana",
        note: "=1+1",
        checkedInAt: new Date("2026-11-21T20:00:00.000Z"),
      }),
    ]);

    assert.equal(
      csv.split("\r\n")[1],
      "'=Ana,3,7,Sí,2,,0,,'+525512345678,'=1+1,¡Con gusto!,2026-11-21T20:00:00.000Z,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
    );
  });

  it("writes the companion columns of a guest answer (F3; L6.4)", () => {
    const csv = toGuestCsv([
      guest({
        response: {
          attending: true,
          partySize: 3,
          companions: [
            { name: "Jorge", child: false },
            { name: "Sofía", child: true },
          ],
          dietaryNotes: "Sin gluten",
          message: null,
          createdAt: new Date("2026-11-20T10:00:00.000Z"),
          updatedAt: new Date("2026-11-20T10:00:00.000Z"),
        },
      }),
    ]);

    assert.equal(
      csv.split("\r\n")[1],
      'Ana Pérez,3,7,Sí,3,"Jorge, Sofía",1,Sin gluten,\'+525512345678,Mesa 4,,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
  });

  it("writes the table the owner assigned to each guest, and an empty cell when there is none (F5; L8.3)", () => {
    const csv = toGuestCsv([
      guest({ name: "Ana", tableLabel: "Principal" }),
      guest({ name: "Beto", tableLabel: null }),
      // A table that starts with a spreadsheet formula character stays text, like every other cell.
      guest({ name: "Carla", tableLabel: "=Mesa" }),
    ]);

    assert.deepEqual(csv.split("\r\n").slice(1, 4), [
      "Ana,3,Principal,Sí,2,,0,,'+525512345678,Mesa 4,¡Con gusto!,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
      "Beto,3,,Sí,2,,0,,'+525512345678,Mesa 4,¡Con gusto!,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
      "Carla,3,'=Mesa,Sí,2,,0,,'+525512345678,Mesa 4,¡Con gusto!,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
    ]);
  });

  it("keeps the order it is given (F5; M6 G2)", () => {
    const lines = toGuestCsv([guest({ name: "Primera" }), guest({ name: "Segunda" })]).split(
      "\r\n",
    );

    assert.equal(lines[1]?.startsWith("Primera,"), true);
    assert.equal(lines[2]?.startsWith("Segunda,"), true);
  });
});
