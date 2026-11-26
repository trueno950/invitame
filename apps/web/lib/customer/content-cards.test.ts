import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ContentCard,
  cardHoldingField,
  cardStateText,
  contentCards,
  defaultOpenCardKey,
} from "./content-cards.ts";
import { missingRequiredNames } from "./editor-sections.ts";
import { contentFields, contentSections } from "./invitations.ts";
import { omittableSectionsOf, omittedSectionKeys, shownFieldsOf } from "./omittable-sections.ts";

// The cards of the editor's «Contenido» tab (S1-S4): the template's own sections become a short stack of cards, each
// one closed with a one-line summary and a state, one open at a time. Every decision here is pure, so `node --test`
// proves it against the real schemas the catalog seeds declare.

type Schema = Readonly<Record<string, unknown>>;

/** The cards one schema produces for the values the editor holds. */
function cardsOf(schema: Schema, values: Record<string, unknown> = {}): ContentCard[] {
  return contentCards(contentSections(contentFields(schema)), values, omittableSectionsOf(schema));
}

function titles(cards: readonly ContentCard[]): string[] {
  return cards.map((card) => card.title);
}

function namesOf(fields: readonly { name: string }[]): string[] {
  return fields.map((field) => field.name);
}

function rowsOf(card: ContentCard): string[][] {
  return card.rows.map((row) => namesOf(row.fields));
}

/** The required names one schema declares, as the editor groups them. */
function missingOf(schema: Schema, values: Record<string, unknown>): number {
  return missingRequiredNames(contentFields(schema), values).length;
}

/** The fields of a JSON Schema object, written the way the catalog seeds write them. */
function schema(required: readonly string[], properties: Schema): Schema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

/** The formal baptism every «Contenido» decision is measured against: 12 required fields, 2 optional ones (S2). */
const BAPTISM = schema(
  [
    "celebrantName",
    "date",
    "parents",
    "godparents",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "message",
    "rsvpContact",
  ],
  {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string", format: "date" },
    parents: { type: "string", maxLength: 160 },
    godparents: { type: "string", maxLength: 160 },
    ceremonyPlace: { type: "string", maxLength: 120 },
    ceremonyAddress: { type: "string", maxLength: 200 },
    ceremonyTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    receptionPlace: { type: "string", maxLength: 120 },
    receptionAddress: { type: "string", maxLength: 200 },
    receptionTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    message: { type: "string", maxLength: 500 },
    rsvpContact: { type: "string", maxLength: 120 },
    mainPhoto: { type: "string", format: "uri" },
    giftRegistry: { type: "string", maxLength: 200 },
  },
);

/** A birthday: one place, a date with its time, and every field required. */
const BIRTHDAY = schema(
  ["celebrantName", "age", "date", "time", "location", "address", "mainPhoto", "message"],
  {
    celebrantName: { type: "string", maxLength: 80 },
    age: { type: "integer", minimum: 1, maximum: 120 },
    date: { type: "string", format: "date" },
    time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    location: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 200 },
    mainPhoto: { type: "string", format: "uri" },
    message: { type: "string", maxLength: 500 },
  },
);

/** A baby shower: the hosts instead of a celebrant, and four optional fields beside required ones. */
const BABY_SHOWER = schema(
  ["hosts", "date", "time", "location", "address", "message", "rsvpContact"],
  {
    hosts: { type: "string", maxLength: 120 },
    date: { type: "string", format: "date" },
    time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    location: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 200 },
    message: { type: "string", maxLength: 500 },
    rsvpContact: { type: "string", maxLength: 120 },
    babyName: { type: "string", maxLength: 80 },
    genderReveal: { type: "boolean" },
    giftRegistry: { type: "string", maxLength: 200 },
    mainPhoto: { type: "string", format: "uri" },
  },
);

/** A schema whose whole «Contenido» group is optional: the only case that gathers a last extras card. */
const OPTIONAL_ONLY = schema(["celebrantName"], {
  celebrantName: { type: "string", maxLength: 80 },
  mainPhoto: { type: "string", format: "uri" },
  giftRegistry: { type: "string", maxLength: 200 },
  hashtag: { type: "string", maxLength: 60 },
});

describe("contentCards", () => {
  it("turns a baptism's sections into cards by meaning, in the template's own order", () => {
    const cards = cardsOf(BAPTISM);

    assert.deepEqual(titles(cards), [
      "Festejado y familia",
      "Cuándo",
      "Ceremonia",
      "Recepción",
      "Mensaje y contacto",
    ]);
    assert.deepEqual(
      cards.map((card) => card.key),
      ["celebrant", "when", "ceremony", "reception", "content"],
    );
    assert.deepEqual(namesOf(cards[0]?.fields ?? []), ["celebrantName", "parents", "godparents"]);
    assert.deepEqual(namesOf(cards[1]?.fields ?? []), ["date"]);
    // The two optional fields stay beside the required ones of their own section (S4).
    assert.deepEqual(namesOf(cards[4]?.fields ?? []), [
      "message",
      "rsvpContact",
      "mainPhoto",
      "giftRegistry",
    ]);
  });

  it("names each card from the section it comes from, and improves the titles that read poorly", () => {
    assert.deepEqual(titles(cardsOf(BIRTHDAY)), [
      "Festejado",
      "Fecha y hora",
      "Lugar y dirección",
      "Mensaje y foto",
    ]);
    // A baby shower has hosts instead of a celebrant, and its optional fields stay in that card.
    assert.deepEqual(titles(cardsOf(BABY_SHOWER)), [
      "Anfitriones",
      "Fecha y hora",
      "Lugar y dirección",
      "Mensaje y contacto",
    ]);
  });

  it("pairs a date with its time and a place with its address, and gives every other field its own row", () => {
    const cards = cardsOf(BAPTISM);
    const ceremony = cards.find((card) => card.key === "ceremony");
    const reception = cards.find((card) => card.key === "reception");
    const content = cards.find((card) => card.key === "content");

    assert.deepEqual(rowsOf(ceremony as ContentCard), [
      ["ceremonyPlace", "ceremonyAddress"],
      ["ceremonyTime"],
    ]);
    assert.deepEqual(rowsOf(reception as ContentCard), [
      ["receptionPlace", "receptionAddress"],
      ["receptionTime"],
    ]);
    assert.deepEqual(rowsOf(content as ContentCard), [
      ["message"],
      ["rsvpContact"],
      ["mainPhoto"],
      ["giftRegistry"],
    ]);

    const birthday = cardsOf(BIRTHDAY);
    assert.deepEqual(rowsOf(birthday.find((card) => card.key === "when") as ContentCard), [
      ["date", "time"],
    ]);
    assert.deepEqual(rowsOf(birthday.find((card) => card.key === "where") as ContentCard), [
      ["location", "address"],
    ]);
    // The celebrant's two fields share no role, so the grid falls back to one field per row.
    assert.deepEqual(rowsOf(birthday.find((card) => card.key === "celebrant") as ContentCard), [
      ["celebrantName"],
      ["age"],
    ]);
  });

  it("summarizes the filled values of a card in one line, and never invents one", () => {
    const cards = cardsOf(BIRTHDAY, {
      celebrantName: "Ana",
      age: 7,
      date: "2027-05-15",
      time: "18:00",
      message: "Hola,\n\n  familia  ",
    });

    assert.equal(cards[0]?.summary, "Ana · 7");
    assert.equal(cards[1]?.summary, "15 de mayo de 2027 · 18:00");
    // A card with nothing filled says so instead of showing a label the owner never wrote.
    assert.equal(cards[2]?.summary, "Aún sin datos");
    assert.equal(cards[3]?.summary, "Hola, familia");
  });

  it("names a filled checkbox with its label, and skips it while it is false", () => {
    const checked = cardsOf(BABY_SHOWER, {
      hosts: "Familia Ruiz",
      babyName: "Mateo",
      genderReveal: true,
    });
    const unchecked = cardsOf(BABY_SHOWER, { hosts: "Familia Ruiz", genderReveal: false });

    assert.equal(checked[0]?.summary, "Familia Ruiz · Mateo · Revelación de género");
    assert.equal(unchecked[0]?.summary, "Familia Ruiz");
  });

  it("states a card as complete, as the count it still owes, or as optional progress", () => {
    const empty = cardsOf(BAPTISM);
    assert.deepEqual(empty[0]?.state, {
      kind: "missing",
      count: 3,
      names: ["celebrantName", "parents", "godparents"],
    });
    assert.equal(cardStateText(empty[0]?.state ?? { kind: "complete" }), "Faltan 3");

    const oneLeft = cardsOf(BAPTISM, {
      celebrantName: "Mateo",
      parents: "Daniel y Lucía",
    });
    assert.deepEqual(oneLeft[0]?.state, { kind: "missing", count: 1, names: ["godparents"] });
    assert.equal(cardStateText(oneLeft[0]?.state ?? { kind: "complete" }), "Falta 1");

    const complete = cardsOf(BAPTISM, {
      celebrantName: "Mateo",
      parents: "Daniel y Lucía",
      godparents: "Jorge y Ana",
    });
    assert.deepEqual(complete[0]?.state, { kind: "complete" });
    assert.equal(
      cardStateText(complete[0]?.state ?? { kind: "missing", count: 0, names: [] }),
      "Completo",
    );

    // The optional fields of the content card are never counted as something missing.
    assert.deepEqual(empty[4]?.state, {
      kind: "missing",
      count: 2,
      names: ["message", "rsvpContact"],
    });
  });

  it("gathers the fields of a whole optional section into one last «Extras opcionales» card", () => {
    const cards = cardsOf(OPTIONAL_ONLY, { mainPhoto: "https://ejemplo.mx/foto.jpg" });

    assert.deepEqual(titles(cards), ["Festejado", "Extras opcionales"]);
    assert.equal(cards.at(-1)?.key, "extras");
    assert.deepEqual(namesOf(cards.at(-1)?.fields ?? []), ["mainPhoto", "giftRegistry", "hashtag"]);
    assert.deepEqual(cards.at(-1)?.state, { kind: "optional", filled: 1, total: 3 });
    assert.equal(cardStateText(cards.at(-1)?.state ?? { kind: "complete" }), "Opcional · 1 de 3");
    // An optional card never stops a publication, so it is never the card that opens by default.
    assert.equal(defaultOpenCardKey(cards), "celebrant");
  });

  it("counts exactly the required fields the tab label counts, card by card", () => {
    const cases: Array<[Schema, Record<string, unknown>]> = [
      [BAPTISM, {}],
      [
        BAPTISM,
        { celebrantName: "Mateo", message: "Te esperamos", rsvpContact: "Lucía 442 118 2043" },
      ],
      [BAPTISM, { date: "2027-05-15", ceremonyPlace: "Parroquia", ceremonyTime: "12:00" }],
      [BIRTHDAY, {}],
      [BIRTHDAY, { celebrantName: "Ana", age: 7, date: "2027-05-15" }],
      [BABY_SHOWER, { hosts: "Familia Ruiz", genderReveal: false }],
      [BABY_SHOWER, { hosts: "  " }],
    ];

    for (const [candidate, values] of cases) {
      const cards = cardsOf(candidate, values);
      const counted = cards.reduce(
        (total, card) => total + (card.state.kind === "missing" ? card.state.count : 0),
        0,
      );

      assert.equal(counted, missingOf(candidate, values));
      // The cards follow the sections' order, so the names are compared as the same set the tab label counts.
      assert.deepEqual(
        cards.flatMap((card) => (card.state.kind === "missing" ? card.state.names : [])).sort(),
        missingRequiredNames(contentFields(candidate), values).sort(),
      );
    }
  });

  it("opens the first card that still owes something, and the first card when none does", () => {
    assert.equal(defaultOpenCardKey(cardsOf(BAPTISM)), "celebrant");

    const later = cardsOf(BAPTISM, {
      celebrantName: "Mateo",
      parents: "Daniel y Lucía",
      godparents: "Jorge y Ana",
    });
    assert.equal(defaultOpenCardKey(later), "when");

    const everyRequired = cardsOf(BAPTISM, {
      celebrantName: "Mateo",
      parents: "Daniel y Lucía",
      godparents: "Jorge y Ana",
      date: "2027-05-15",
      ceremonyPlace: "Parroquia de San José",
      ceremonyAddress: "Av. Hidalgo 210",
      ceremonyTime: "12:00",
      receptionPlace: "Jardín Casa Herrera",
      receptionAddress: "Camino Real 8",
      receptionTime: "14:30",
      message: "Te esperamos",
      rsvpContact: "Lucía 442 118 2043",
    });
    assert.equal(defaultOpenCardKey(everyRequired), "celebrant");
    assert.equal(defaultOpenCardKey([]), undefined);
  });

  // The missing-field links of the publish panel and the first-steps card (T1; S2.4): a link names one field, and the
  // tab opens the card that holds it, so the owner lands on the input instead of on the top of the tab.
  it("finds the card that holds one field, whatever group the schema put it in", () => {
    const cards = cardsOf(BAPTISM);

    assert.equal(cardHoldingField(cards, "celebrantName")?.key, "celebrant");
    assert.equal(cardHoldingField(cards, "date")?.key, "when");
    assert.equal(cardHoldingField(cards, "ceremonyAddress")?.key, "ceremony");
    // A field no card of this template declares names no card, so a hand-edited query opens nothing.
    assert.equal(cardHoldingField(cards, "playlistUrl"), undefined);
    assert.equal(cardHoldingField([], "date"), undefined);
  });
});

// The switch of each card (T4; S3, S7, S8.1): a version that declares `x-omittable` gives every group its own card
// with its own switch, because a card is what the owner turns off. The fields no group covers keep their section's
// card and carry no switch, and the optional ones still gather in the last «Extras opcionales» card.

/** The groups and the sets a baptism version declares, exactly as the catalog writes them. */
const BAPTISM_SECTIONS = {
  "x-omittable": [
    { key: "parents", fields: ["parents"] },
    { key: "godparents", fields: ["godparents"] },
    { key: "ceremony", fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"] },
    { key: "reception", fields: ["receptionPlace", "receptionAddress", "receptionTime"] },
    { key: "message", fields: ["message"] },
    { key: "rsvpContact", fields: ["rsvpContact"] },
  ],
  "x-require-one": [["ceremony", "reception"]],
};

const OMITTABLE_BAPTISM: Schema = { ...BAPTISM, ...BAPTISM_SECTIONS };

const OMITTABLE_BIRTHDAY: Schema = {
  ...BIRTHDAY,
  "x-omittable": [
    { key: "age", fields: ["age"] },
    { key: "mainPhoto", fields: ["mainPhoto"] },
    { key: "message", fields: ["message"] },
  ],
  "x-require-one": [],
};

describe("contentCards with omittable sections", () => {
  it("gives every group its own card, in the order of the fields it covers", () => {
    const cards = cardsOf(OMITTABLE_BAPTISM);

    assert.deepEqual(titles(cards), [
      "Festejado",
      "Padres",
      "Padrinos",
      "Cuándo",
      "Ceremonia",
      "Recepción",
      "Mensaje",
      "Confirmar asistencia",
      "Extras opcionales",
    ]);
    assert.deepEqual(
      cards.map((card) => card.section?.key),
      [
        undefined,
        "parents",
        "godparents",
        undefined,
        "ceremony",
        "reception",
        "message",
        "rsvpContact",
        undefined,
      ],
    );
    // A card that is exactly one group keeps the group's fields whole, so its switch hides all of them.
    assert.deepEqual(namesOf(cards[4]?.fields ?? []), [
      "ceremonyPlace",
      "ceremonyAddress",
      "ceremonyTime",
    ]);
    assert.deepEqual(rowsOf(cards[4] as ContentCard), [
      ["ceremonyPlace", "ceremonyAddress"],
      ["ceremonyTime"],
    ]);
    // The fields no group covers stay in their own card, and the optional ones still gather at the end.
    assert.deepEqual(namesOf(cards[0]?.fields ?? []), ["celebrantName"]);
    assert.deepEqual(namesOf(cards[8]?.fields ?? []), ["mainPhoto", "giftRegistry"]);
  });

  it("reads the omitted keys of the content and folds the card they name", () => {
    const cards = cardsOf(OMITTABLE_BAPTISM, {
      celebrantName: "Mateo",
      omittedSections: ["ceremony"],
    });
    const ceremony = cards[4] as ContentCard;
    const reception = cards[5] as ContentCard;

    assert.equal(ceremony.omitted, true);
    assert.deepEqual(ceremony.state, { kind: "hidden" });
    assert.equal(ceremony.summary, "No se mostrará en tu invitación");
    // A section that is still shown reads exactly as it did before the switch existed.
    assert.equal(reception.omitted, false);
    assert.equal(reception.state.kind, "missing");

    // The essentials never carry a group, so no stored key can fold them.
    assert.equal(
      cardsOf(OMITTABLE_BAPTISM, { omittedSections: ["celebrant", "date"] })[0]?.omitted,
      false,
    );
  });

  it("stops counting the required fields of an omitted card, card by card", () => {
    const values = { celebrantName: "Mateo", parents: "Daniel y Lucía" };
    const shown = cardsOf(OMITTABLE_BAPTISM, values);
    const hidden = cardsOf(OMITTABLE_BAPTISM, {
      ...values,
      omittedSections: ["godparents", "ceremony", "message"],
    });
    const counted = (cards: readonly ContentCard[]) =>
      cards.reduce(
        (total, card) => total + (card.state.kind === "missing" ? card.state.count : 0),
        0,
      );

    // The cards' own counts are exactly the count of the fields still shown, which is what the tab label states.
    assert.equal(counted(shown), missingOf(OMITTABLE_BAPTISM, values));
    assert.equal(counted(hidden), 5);
    assert.equal(
      counted(hidden),
      missingRequiredNames(
        shownFieldsOf(
          contentFields(OMITTABLE_BAPTISM),
          omittableSectionsOf(OMITTABLE_BAPTISM),
          omittedSectionKeys({ omittedSections: ["godparents", "ceremony", "message"] }),
        ),
        { ...values, omittedSections: ["godparents", "ceremony", "message"] },
      ).length,
    );
    // An omitted card is never the one the tab opens on, because it owes nothing any more.
    assert.equal(defaultOpenCardKey(hidden), "when");
  });

  it("keeps a birthday's essentials in their own cards beside the groups of the same section", () => {
    const cards = cardsOf(OMITTABLE_BIRTHDAY);

    assert.deepEqual(titles(cards), [
      "Festejado",
      "Edad",
      "Fecha y hora",
      "Lugar y dirección",
      "Foto principal",
      "Mensaje",
    ]);
    assert.deepEqual(
      cards.map((card) => card.section?.key),
      [undefined, "age", undefined, undefined, "mainPhoto", "message"],
    );
    // A group card never gathers into «Extras opcionales», because it cannot be switched off from there.
    assert.equal(
      cards.some((card) => card.key === "extras"),
      false,
    );
  });
});
