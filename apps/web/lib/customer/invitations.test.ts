import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  CreatorPackage,
  CreatorTemplate,
  InvitationResult,
  InvitationSummary,
  InvitationsClient,
  OwnedInvitation,
} from "../server/invitations-api.ts";
import {
  INVITATION_COPY,
  INVITATION_ERROR_COPY,
  INVITATION_FIELD_LABELS,
  INVITATION_NOTICE_COPY,
  INVITATION_STATUS_LABELS,
} from "./copy.ts";
import {
  archiveInvitation,
  contentFields,
  contentSections,
  createInvitation,
  fieldValue,
  invitationErrorTarget,
  invitationFieldsFor,
  invitationNoticeTarget,
  invitationPageNotices,
  invitationRows,
  missingFieldsMessage,
  packageChoices,
  parseContentForm,
  publishInvitation,
  publishIssueCodes,
  publishIssueMessages,
  saveInvitationContent,
  unpublishInvitation,
} from "./invitations.ts";
import { templateChoiceCards } from "./template-preview.ts";
import { chooserOccasions, resolveChooserStep, stepHref } from "./template-steps.ts";

// The invitation pages of `/cuenta` (M4 T5; S1, S6, S7): how the pinned schema becomes a form, how the
// form becomes the JSON the API validates, and how each outcome of the server actions reaches a page as
// a code in its query. The API stays the authority on ownership, validation, and lifecycle.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const VERSION_ID = "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";
const PACKAGE_ID = "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15";
const AT = "2026-11-11T12:00:00.000Z";

/** The shape of the seeded birthday content schema, as the creator catalog returns it. */
const BIRTHDAY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["celebrantName", "age", "date", "time", "location", "address", "mainPhoto", "message"],
  properties: {
    celebrantName: { type: "string", title: "Nombre de la persona festejada", maxLength: 80 },
    age: { type: "integer", title: "Edad", minimum: 1, maximum: 120 },
    date: { type: "string", title: "Fecha", format: "date" },
    time: { type: "string", title: "Hora", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    location: { type: "string", title: "Lugar", maxLength: 120 },
    address: { type: "string", title: "Dirección", maxLength: 200 },
    mainPhoto: { type: "string", title: "Foto principal", format: "uri" },
    message: { type: "string", title: "Mensaje", maxLength: 500 },
  },
};

/** The baby shower content schema T7a publishes, with the fields the owner approved (S13). */
const BABY_SHOWER_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["hosts", "date", "time", "location", "address", "message", "rsvpContact"],
  properties: {
    hosts: { type: "string", maxLength: 120 },
    babyName: { type: "string", maxLength: 80 },
    genderReveal: { type: "boolean" },
    date: { type: "string", format: "date" },
    time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    location: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 200 },
    giftRegistry: { type: "string", maxLength: 120 },
    rsvpContact: { type: "string", maxLength: 120 },
    message: { type: "string", maxLength: 500 },
    mainPhoto: { type: "string", format: "uri" },
  },
};

/** The themed baptism content schema T7a publishes: ceremony and reception are two blocks (S13). */
const BAPTISM_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
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
  properties: {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string", format: "date" },
    parents: { type: "string", maxLength: 120 },
    godparents: { type: "string", maxLength: 120 },
    ceremonyPlace: { type: "string", maxLength: 120 },
    ceremonyAddress: { type: "string", maxLength: 200 },
    ceremonyTime: { type: "string", format: "time" },
    receptionPlace: { type: "string", maxLength: 120 },
    receptionAddress: { type: "string", maxLength: 200 },
    receptionTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    giftRegistry: { type: "string", maxLength: 120 },
    rsvpContact: { type: "string", maxLength: 120 },
    message: { type: "string", maxLength: 500 },
    mainPhoto: { type: "string", format: "uri" },
  },
};

/** The XV años schema E3a publishes for `xv-arch-01` (S4). */
const XV_ARCH_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "celebrantName",
    "date",
    "parents",
    "honorSponsors",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "dressCode",
    "message",
    "rsvpContact",
  ],
  properties: {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string", format: "date" },
    parents: { type: "string", maxLength: 400 },
    honorSponsors: { type: "string", maxLength: 400 },
    chambelanes: { type: "string", maxLength: 400 },
    ceremonyPlace: { type: "string", maxLength: 120 },
    ceremonyAddress: { type: "string", maxLength: 200 },
    ceremonyTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    receptionPlace: { type: "string", maxLength: 120 },
    receptionAddress: { type: "string", maxLength: 200 },
    receptionTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    dressCode: { type: "string", maxLength: 120 },
    message: { type: "string", maxLength: 500 },
    giftRegistry: { type: "string", maxLength: 200 },
    rsvpContact: { type: "string", maxLength: 120 },
    mainPhoto: { type: "string", format: "uri" },
  },
};

/** The wedding schema E3a publishes for `wedding-arch-01` (S4). */
const WEDDING_ARCH_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "coupleNameOne",
    "coupleNameTwo",
    "date",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "dressCode",
    "message",
    "rsvpContact",
  ],
  properties: {
    coupleNameOne: { type: "string", maxLength: 80 },
    coupleNameTwo: { type: "string", maxLength: 80 },
    date: { type: "string", format: "date" },
    firstFamilyParents: { type: "string", maxLength: 400 },
    secondFamilyParents: { type: "string", maxLength: 400 },
    weddingSponsors: { type: "string", maxLength: 400 },
    ceremonyPlace: { type: "string", maxLength: 120 },
    ceremonyAddress: { type: "string", maxLength: 200 },
    ceremonyTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    receptionPlace: { type: "string", maxLength: 120 },
    receptionAddress: { type: "string", maxLength: 200 },
    receptionTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    dressCode: { type: "string", maxLength: 120 },
    message: { type: "string", maxLength: 500 },
    giftRegistry: { type: "string", maxLength: 200 },
    hashtag: { type: "string", maxLength: 60 },
    rsvpContact: { type: "string", maxLength: 120 },
    mainPhoto: { type: "string", format: "uri" },
  },
};

const SUMMARY: InvitationSummary = {
  id: ID,
  templateVersionId: VERSION_ID,
  packageId: PACKAGE_ID,
  slug: "invitacion-k7m2qx",
  status: "DRAFT",
  publishedAt: null,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
};

const OWNED: OwnedInvitation = {
  ...SUMMARY,
  content: { celebrantName: "Ana" },
  missingRequiredFields: ["age", "date", "time", "location", "address", "mainPhoto", "message"],
  timeZone: "America/Mexico_City",
  featureSettings: { whatsappPhone: null, playlistUrl: null },
  availableFeatures: ["COUNTDOWN", "MAP", "CALENDAR"],
};

const TEMPLATE: CreatorTemplate = {
  id: PACKAGE_ID,
  key: "cumpleanos",
  name: "Cumpleaños",
  description: null,
  category: { key: "cumpleanos", name: "Cumpleaños" },
  publishedVersion: {
    id: VERSION_ID,
    version: 2,
    componentKey: "birthday-poster-01",
    configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
    schema: BIRTHDAY_SCHEMA,
  },
};

const PACKAGE: CreatorPackage = {
  id: PACKAGE_ID,
  key: "basic",
  name: "Basic",
  description: null,
  currentPrice: { amountMinor: 150000, currency: "MXN" },
  includedFeatureKeys: ["COUNTDOWN"],
};

describe("contentFields", () => {
  it("turns the pinned birthday schema into its eight fields, labelled in Spanish", () => {
    assert.deepEqual(contentFields(BIRTHDAY_SCHEMA), [
      {
        name: "celebrantName",
        type: "string",
        label: "Nombre del festejado",
        required: true,
        input: { kind: "text", maxLength: 80 },
      },
      {
        name: "age",
        type: "integer",
        label: "Edad",
        required: true,
        input: { kind: "number", min: 1, max: 120, step: "1" },
      },
      { name: "date", type: "string", label: "Fecha", required: true, input: { kind: "date" } },
      { name: "time", type: "string", label: "Hora", required: true, input: { kind: "time" } },
      {
        name: "location",
        type: "string",
        label: "Lugar",
        required: true,
        input: { kind: "text", maxLength: 120 },
      },
      {
        name: "address",
        type: "string",
        label: "Dirección",
        required: true,
        input: { kind: "text", maxLength: 200 },
      },
      {
        name: "mainPhoto",
        type: "string",
        label: "Foto principal (URL)",
        required: true,
        input: { kind: "url" },
      },
      {
        name: "message",
        type: "string",
        label: "Mensaje",
        required: true,
        input: { kind: "textarea", maxLength: 500, rows: 5 },
      },
    ]);
  });

  it("follows the schema's required order, then the properties it does not require", () => {
    const fields = contentFields({
      properties: { first: { type: "string" }, second: { type: "string" } },
      required: ["second"],
    });

    assert.deepEqual(
      fields.map((field) => field.name),
      ["second", "first"],
    );
  });

  it("falls back to the property name and skips a property it cannot render", () => {
    const fields = contentFields({
      properties: {
        cake: { type: "string" },
        guests: { type: "integer" },
        playlist: { type: "object" },
        nothing: {},
      },
      required: [],
    });

    assert.deepEqual(fields, [
      { name: "cake", type: "string", label: "cake", required: false, input: { kind: "text" } },
      {
        name: "guests",
        type: "integer",
        label: "guests",
        required: false,
        input: { kind: "number", step: "1" },
      },
    ]);
  });

  it("reports no field when the schema is missing, unreadable, or empty", () => {
    for (const schema of [
      undefined,
      null,
      "object",
      [],
      {},
      { properties: [] },
      { properties: null },
    ]) {
      assert.deepEqual(contentFields(schema), [], JSON.stringify(schema) ?? "undefined");
    }
  });
});

describe("content field inputs", () => {
  /** The single input a one-property schema declares, so a case reads as the property it maps. */
  function inputOf(definition: Record<string, unknown>): unknown {
    return contentFields({ properties: { field: definition }, required: [] })[0]?.input;
  }

  it("keeps a short string single-line, bounded by the maxLength the schema declares", () => {
    assert.deepEqual(inputOf({ type: "string", maxLength: 120 }), {
      kind: "text",
      maxLength: 120,
    });
    assert.deepEqual(inputOf({ type: "string" }), { kind: "text" });
  });

  it("asks for a multi-line field only above the textarea threshold of 200 characters", () => {
    assert.deepEqual(inputOf({ type: "string", maxLength: 200 }), {
      kind: "text",
      maxLength: 200,
    });
    assert.deepEqual(inputOf({ type: "string", maxLength: 201 }), {
      kind: "textarea",
      maxLength: 201,
      rows: 3,
    });
    assert.deepEqual(inputOf({ type: "string", maxLength: 2000 }), {
      kind: "textarea",
      maxLength: 2000,
      rows: 6,
    });
  });

  it("recognizes a time from its format or from a HH:MM pattern, and leaves any other pattern text", () => {
    assert.deepEqual(inputOf({ type: "string", format: "time" }), { kind: "time" });
    assert.deepEqual(inputOf({ type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }), {
      kind: "time",
    });
    assert.deepEqual(inputOf({ type: "string", pattern: "^[0-9]{3}$" }), { kind: "text" });
    assert.deepEqual(inputOf({ type: "string", pattern: "([" }), { kind: "text" });
  });

  it("reads a date and a URI from the schema's own format", () => {
    assert.deepEqual(inputOf({ type: "string", format: "date" }), { kind: "date" });
    assert.deepEqual(inputOf({ type: "string", format: "uri" }), { kind: "url" });
    assert.deepEqual(inputOf({ type: "string", format: "uri", maxLength: 300 }), {
      kind: "url",
      maxLength: 300,
    });
  });

  it("bounds a number by the schema's minimum and maximum, stepping integers by one", () => {
    assert.deepEqual(inputOf({ type: "integer", minimum: 1, maximum: 120 }), {
      kind: "number",
      min: 1,
      max: 120,
      step: "1",
    });
    assert.deepEqual(inputOf({ type: "number", minimum: 0, maximum: 1.5 }), {
      kind: "number",
      min: 0,
      max: 1.5,
      step: "any",
    });
    assert.deepEqual(inputOf({ type: "integer" }), { kind: "number", step: "1" });
  });

  it("reads a boolean as a checkbox", () => {
    assert.deepEqual(inputOf({ type: "boolean" }), { kind: "checkbox" });
  });
});

describe("contentSections", () => {
  it("groups the birthday fields into the four short sections of the editor", () => {
    const sections = contentSections(contentFields(BIRTHDAY_SCHEMA));

    assert.deepEqual(
      sections.map((section) => ({
        title: section.title,
        fields: section.fields.map((field) => field.name),
      })),
      [
        { title: "Festejado", fields: ["celebrantName", "age"] },
        { title: "Cuándo", fields: ["date", "time"] },
        { title: "Dónde", fields: ["location", "address"] },
        { title: "Contenido", fields: ["mainPhoto", "message"] },
      ],
    );
  });

  it("keeps a property no section names in one last section, in schema order", () => {
    const fields = contentFields({
      properties: {
        cake: { type: "string" },
        date: { type: "string", format: "date" },
        guests: { type: "integer" },
      },
      required: [],
    });

    assert.deepEqual(
      contentSections(fields).map((section) => [
        section.title,
        section.fields.map((field) => field.name),
      ]),
      [
        ["Cuándo", ["date"]],
        ["Otros datos", ["cake", "guests"]],
      ],
    );
  });

  it("has no section for a schema that declares no field", () => {
    assert.deepEqual(contentSections([]), []);
  });
});

describe("the elegant fields in the editor", () => {
  it("labels every new XV años and wedding field in Spanish", () => {
    assert.deepEqual(
      [
        "honorSponsors",
        "chambelanes",
        "coupleNameOne",
        "coupleNameTwo",
        "firstFamilyParents",
        "secondFamilyParents",
        "weddingSponsors",
        "dressCode",
        "hashtag",
      ].map((name) => [name, INVITATION_FIELD_LABELS[name]]),
      [
        ["honorSponsors", "Padrinos de honor"],
        ["chambelanes", "Chambelanes (opcional)"],
        ["coupleNameOne", "Primer nombre de la pareja"],
        ["coupleNameTwo", "Segundo nombre de la pareja"],
        ["firstFamilyParents", "Padres de una parte (opcional)"],
        ["secondFamilyParents", "Padres de la otra parte (opcional)"],
        ["weddingSponsors", "Padrinos de la boda (opcional)"],
        ["dressCode", "Código de vestimenta"],
        ["hashtag", "Hashtag (opcional)"],
      ],
    );
  });

  it("groups the XV años fields into the short sections of the editor", () => {
    assert.deepEqual(
      contentSections(contentFields(XV_ARCH_SCHEMA)).map((section) => [
        section.title,
        section.fields.map((field) => field.name),
      ]),
      [
        ["Festejado", ["celebrantName", "parents", "honorSponsors", "chambelanes"]],
        ["Cuándo", ["date"]],
        ["Ceremonia", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
        ["Recepción", ["receptionPlace", "receptionAddress", "receptionTime"]],
        ["Contenido", ["dressCode", "message", "rsvpContact", "giftRegistry", "mainPhoto"]],
      ],
    );
  });

  it("groups the wedding fields into the short sections of the editor", () => {
    assert.deepEqual(
      contentSections(contentFields(WEDDING_ARCH_SCHEMA)).map((section) => [
        section.title,
        section.fields.map((field) => field.name),
      ]),
      [
        [
          "Festejado",
          [
            "coupleNameOne",
            "coupleNameTwo",
            "firstFamilyParents",
            "secondFamilyParents",
            "weddingSponsors",
          ],
        ],
        ["Cuándo", ["date"]],
        ["Ceremonia", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
        ["Recepción", ["receptionPlace", "receptionAddress", "receptionTime"]],
        [
          "Contenido",
          ["dressCode", "message", "rsvpContact", "giftRegistry", "hashtag", "mainPhoto"],
        ],
      ],
    );
  });

  it("edits every list with a multi-line field and every time with a time input", () => {
    const fields = contentFields(WEDDING_ARCH_SCHEMA);
    const inputOf = (name: string) => fields.find((field) => field.name === name)?.input;

    for (const name of ["firstFamilyParents", "secondFamilyParents", "weddingSponsors"]) {
      assert.equal(inputOf(name)?.kind, "textarea", name);
    }
    assert.equal(inputOf("ceremonyTime")?.kind, "time");
    assert.equal(inputOf("receptionTime")?.kind, "time");
    // A single-line field of the same schema stays single-line.
    assert.equal(inputOf("dressCode")?.kind, "text");
  });

  it("marks a list optional in its label, not with the HTML required attribute", () => {
    const fields = contentFields(XV_ARCH_SCHEMA);
    const chambelanes = fields.find((field) => field.name === "chambelanes");

    assert.equal(chambelanes?.required, false);
    assert.equal(chambelanes?.label.endsWith("(opcional)"), true);
    assert.equal(fields.find((field) => field.name === "honorSponsors")?.required, true);
  });

  it("saves a multi-line list exactly as typed, one name per line", () => {
    const fields = contentFields(XV_ARCH_SCHEMA);
    const form = new FormData();

    form.set("celebrantName", "Valentina Ramírez");
    form.set("parents", "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez");
    form.set("honorSponsors", "Joaquín Esquivel del Valle\nMariana Robles de Esquivel");
    form.set("chambelanes", "Diego Fuentes\nRodrigo Salas");
    form.set("date", "2026-08-15");
    form.set("ceremonyPlace", "Parroquia de San Agustín");
    form.set("ceremonyAddress", "Calle de los Fresnos 132");
    form.set("ceremonyTime", "18:00");
    form.set("receptionPlace", "Jardín de los Olivos");
    form.set("receptionAddress", "Camino Real a Santa Fe 41");
    form.set("receptionTime", "20:30");
    form.set("dressCode", "Formal · etiqueta");
    form.set("message", "Hay días que se esperan toda una vida.");
    form.set("rsvpContact", "Adriana Solís · 55 8120 4471");

    const parsed = parseContentForm(fields, form);

    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.content.chambelanes : "", "Diego Fuentes\nRodrigo Salas");
    assert.deepEqual(
      parsed.ok ? parsed.content.parents : "",
      "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
    );
    assert.equal(parsed.ok ? Object.hasOwn(parsed.content, "giftRegistry") : true, false);
  });
});

describe("parseContentForm", () => {
  const fields = contentFields(BIRTHDAY_SCHEMA);

  function form(entries: Record<string, string> = {}): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries(entries)) {
      data.set(name, value);
    }
    return data;
  }

  it("keeps the typed values, with integers as integers and strings trimmed", () => {
    assert.deepEqual(parseContentForm(fields, form({ celebrantName: "  Ana  ", age: "7" })), {
      ok: true,
      content: { celebrantName: "Ana", age: 7 },
    });
  });

  it("omits every empty field, so a partial draft stays partial", () => {
    assert.deepEqual(parseContentForm(fields, form({ age: "", message: "   " })), {
      ok: true,
      content: {},
    });
    assert.deepEqual(parseContentForm(fields, form()), { ok: true, content: {} });
  });

  it("refuses an integer that is not a whole number instead of guessing", () => {
    for (const age of ["7.5", "siete", "7 años", "1e2", "0x10", "Infinity"]) {
      assert.deepEqual(parseContentForm(fields, form({ age })), { ok: false }, age);
    }
    assert.deepEqual(parseContentForm(fields, form({ age: " -7 " })), { ok: false });
  });

  it("refuses an age outside the schema's range before it reaches the API", () => {
    for (const age of ["-1", "0", "121", "-7"]) {
      assert.deepEqual(parseContentForm(fields, form({ age })), { ok: false }, age);
    }
    assert.deepEqual(parseContentForm(fields, form({ age: "1" })), {
      ok: true,
      content: { age: 1 },
    });
    assert.deepEqual(parseContentForm(fields, form({ age: "120" })), {
      ok: true,
      content: { age: 120 },
    });
  });

  it("refuses a date that is not a real calendar day in the schema's format", () => {
    for (const date of ["2026-02-30", "2026-2-3", "11/11/2026", "mañana", "2026-13-01"]) {
      assert.deepEqual(parseContentForm(fields, form({ date })), { ok: false }, date);
    }
    assert.deepEqual(parseContentForm(fields, form({ date: "2026-11-11" })), {
      ok: true,
      content: { date: "2026-11-11" },
    });
  });

  it("refuses a time that is not a 24-hour HH:MM value", () => {
    for (const time of ["24:00", "25:00", "9:5", "19:60", "7 pm", "19:30:00"]) {
      assert.deepEqual(parseContentForm(fields, form({ time })), { ok: false }, time);
    }
    assert.deepEqual(parseContentForm(fields, form({ time: "19:30" })), {
      ok: true,
      content: { time: "19:30" },
    });
    assert.deepEqual(parseContentForm(fields, form({ time: "00:00" })), {
      ok: true,
      content: { time: "00:00" },
    });
  });

  it("refuses text longer than the schema's maxLength", () => {
    assert.deepEqual(parseContentForm(fields, form({ celebrantName: "a".repeat(81) })), {
      ok: false,
    });
    assert.deepEqual(parseContentForm(fields, form({ message: "a".repeat(500) })), {
      ok: true,
      content: { message: "a".repeat(500) },
    });
    assert.deepEqual(parseContentForm(fields, form({ message: "a".repeat(501) })), { ok: false });
  });

  it("reads a number field as a decimal and refuses what is not one", () => {
    const numeric = contentFields({ properties: { ratio: { type: "number" } }, required: [] });

    assert.deepEqual(parseContentForm(numeric, form({ ratio: "1.5" })), {
      ok: true,
      content: { ratio: 1.5 },
    });
    assert.deepEqual(parseContentForm(numeric, form({ ratio: "1,5" })), { ok: false });
  });

  it("reads a boolean field from its checkbox, false when it is not checked", () => {
    const flags = contentFields({ properties: { open: { type: "boolean" } }, required: [] });

    assert.deepEqual(parseContentForm(flags, form({ open: "true" })), {
      ok: true,
      content: { open: true },
    });
    assert.deepEqual(parseContentForm(flags, form()), { ok: true, content: { open: false } });
  });

  it("never sends a submitted key the pinned schema does not declare", () => {
    assert.deepEqual(
      parseContentForm(fields, form({ celebrantName: "Ana", ownerId: ID, status: "ARCHIVED" })),
      { ok: true, content: { celebrantName: "Ana" } },
    );
  });

  it("refuses a value that is not text instead of dropping it silently", () => {
    const data = new FormData();
    data.set("celebrantName", new File(["x"], "name.txt"));

    assert.deepEqual(parseContentForm(fields, data), { ok: false });
  });
});

describe("fieldValue", () => {
  it("shows the stored value in a field, and nothing when the draft does not have it", () => {
    const [celebrantName, age] = contentFields(BIRTHDAY_SCHEMA);
    const content = { celebrantName: "Ana", age: 7 };

    assert.ok(celebrantName && age);
    assert.equal(fieldValue(celebrantName, content), "Ana");
    assert.equal(fieldValue(age, content), "7");
    assert.equal(fieldValue(age, {}), "");
    assert.equal(fieldValue(age, { age: 0 }), "0");
  });
});

describe("missingFieldsMessage", () => {
  it("names the fields the draft still lacks, using the Spanish labels", () => {
    assert.equal(missingFieldsMessage(["age", "date"]), "Faltan: Edad, Fecha.");
  });

  it("shows nothing when no field is missing", () => {
    assert.equal(missingFieldsMessage([]), null);
  });

  it("uses the property name for a field the copy does not label", () => {
    assert.equal(missingFieldsMessage(["cake"]), "Faltan: cake.");
  });
});

describe("invitationRows", () => {
  it("maps each invitation to a row of the list with its status and creation date", () => {
    assert.deepEqual(
      invitationRows([
        SUMMARY,
        { ...SUMMARY, status: "PUBLISHED", publishedAt: AT },
        { ...SUMMARY, status: "ARCHIVED", archivedAt: AT },
      ]),
      [
        {
          id: ID,
          href: `/cuenta/invitaciones/${ID}`,
          slug: "invitacion-k7m2qx",
          statusLabel: "Borrador",
          publicHref: null,
          createdOn: "11 nov 2026",
        },
        {
          id: ID,
          href: `/cuenta/invitaciones/${ID}`,
          slug: "invitacion-k7m2qx",
          statusLabel: "Publicada",
          publicHref: "/i/invitacion-k7m2qx",
          createdOn: "11 nov 2026",
        },
        {
          id: ID,
          href: `/cuenta/invitaciones/${ID}`,
          slug: "invitacion-k7m2qx",
          statusLabel: "Archivada",
          publicHref: null,
          createdOn: "11 nov 2026",
        },
      ],
    );
  });
});

describe("invitationFieldsFor", () => {
  it("finds the fields of the version the invitation is pinned to", () => {
    assert.deepEqual(invitationFieldsFor([TEMPLATE], VERSION_ID)?.fields.length, 8);
    assert.equal(invitationFieldsFor([TEMPLATE], VERSION_ID)?.template, TEMPLATE);
  });

  it("reports nothing when the version is no longer in the creator catalog", () => {
    assert.equal(invitationFieldsFor([TEMPLATE], PACKAGE_ID), undefined);
    assert.equal(invitationFieldsFor([], VERSION_ID), undefined);
  });
});

describe("creation choices", () => {
  it("offers each package as a card with its price", () => {
    // The templates are the chooser's preview cards (`template-preview.ts`); the packages keep this card.
    assert.deepEqual(packageChoices([PACKAGE]), [
      { value: PACKAGE_ID, name: "Basic", meta: "$1,500.00 MXN", description: null },
    ]);
  });

  it("says a package has no price instead of showing zero", () => {
    assert.deepEqual(packageChoices([{ ...PACKAGE, currentPrice: null }]), [
      { value: PACKAGE_ID, name: "Basic", meta: INVITATION_COPY.priceMissing, description: null },
    ]);
  });
});

describe("invitation copy", () => {
  it("labels the three statuses of an invitation", () => {
    assert.deepEqual(INVITATION_STATUS_LABELS, {
      DRAFT: "Borrador",
      PUBLISHED: "Publicada",
      ARCHIVED: "Archivada",
    });
  });

  it("names the field sections and marks the fields that publication needs", () => {
    assert.deepEqual(
      [
        INVITATION_COPY.sectionCelebrant,
        INVITATION_COPY.sectionWhen,
        INVITATION_COPY.sectionWhere,
        INVITATION_COPY.sectionContent,
        INVITATION_COPY.sectionOther,
      ],
      ["Festejado", "Cuándo", "Dónde", "Contenido", "Otros datos"],
    );
    assert.equal(INVITATION_COPY.fieldRequired, "Necesario para publicar");
  });

  it("labels every field of the birthday template", () => {
    for (const field of contentFields(BIRTHDAY_SCHEMA)) {
      assert.notEqual(field.label, field.name, field.name);
    }
    assert.deepEqual(INVITATION_FIELD_LABELS.celebrantName, "Nombre del festejado");
  });

  it("has a Spanish message for every action outcome the API documents", () => {
    const codes = [
      "invalid-form",
      "validation",
      "package-does-not-fit",
      "version-not-published",
      "package-not-found",
      "not-found",
      "not-editable",
      "already-archived",
      "already-published",
      "not-published",
      "not-publishable",
      "payment-required",
      "content-invalid",
      "content-unavailable",
      "unavailable",
    ] as const;

    for (const code of codes) {
      assert.ok(INVITATION_ERROR_COPY[code].length > 0, code);
    }
    for (const value of Object.values(INVITATION_NOTICE_COPY)) {
      assert.ok(value.trim().length > 0);
    }
  });
});

describe("query codes", () => {
  it("builds a notice and an error target from a fixed code only", () => {
    assert.equal(
      invitationNoticeTarget("/cuenta/invitaciones", "saved"),
      "/cuenta/invitaciones?notice=saved",
    );
    assert.equal(
      invitationErrorTarget("/cuenta/invitaciones/nueva", "package-does-not-fit"),
      "/cuenta/invitaciones/nueva?error=package-does-not-fit",
    );
  });

  it("shows a message only for a code of its own table", () => {
    assert.deepEqual(invitationPageNotices({ notice: "saved", error: "not-found" }), {
      notice: INVITATION_NOTICE_COPY.saved,
      error: INVITATION_ERROR_COPY["not-found"],
    });
    assert.deepEqual(invitationPageNotices({}), {});
    for (const parameters of [
      { notice: "invented" },
      { error: "invented" },
      { error: ["saved", "saved"] },
      { notice: "<script>" },
    ]) {
      assert.deepEqual(invitationPageNotices(parameters), {}, JSON.stringify(parameters));
    }
  });
});

interface Answers {
  list?: () => Promise<InvitationResult<InvitationSummary[]>>;
  get?: () => Promise<InvitationResult<OwnedInvitation>>;
  create?: () => Promise<InvitationResult<OwnedInvitation>>;
  replaceContent?: () => Promise<InvitationResult<OwnedInvitation>>;
  archive?: () => Promise<InvitationResult<InvitationSummary>>;
  publish?: () => Promise<InvitationResult<OwnedInvitation>>;
  unpublish?: () => Promise<InvitationResult<InvitationSummary>>;
  templates?: () => Promise<InvitationResult<CreatorTemplate[]>>;
  packages?: () => Promise<InvitationResult<CreatorPackage[]>>;
}

interface Stub {
  api: InvitationsClient;
  calls: string[];
}

function unexpected(name: string): Promise<never> {
  return Promise.reject(new Error(`unexpected ${name}`));
}

/** An API client whose every method answers what the test decides, and records what it was asked. */
function stub(answers: Answers = {}): Stub {
  const calls: string[] = [];
  const api: InvitationsClient = {
    list: () => {
      calls.push("list");
      return answers.list?.() ?? unexpected("list");
    },
    get: (id) => {
      calls.push(`get:${id}`);
      return answers.get?.() ?? unexpected("get");
    },
    create: (input) => {
      calls.push(`create:${input.templateVersionId}:${input.packageId}`);
      return answers.create?.() ?? unexpected("create");
    },
    replaceContent: (id, content) => {
      calls.push(`replaceContent:${id}:${JSON.stringify(content)}`);
      return answers.replaceContent?.() ?? unexpected("replaceContent");
    },
    updateInvitationFeatures: (id, features) => {
      calls.push(`updateInvitationFeatures:${id}:${JSON.stringify(features)}`);
      return unexpected("updateInvitationFeatures");
    },
    archive: (id) => {
      calls.push(`archive:${id}`);
      return answers.archive?.() ?? unexpected("archive");
    },
    publish: (id) => {
      calls.push(`publish:${id}`);
      return answers.publish?.() ?? unexpected("publish");
    },
    unpublish: (id) => {
      calls.push(`unpublish:${id}`);
      return answers.unpublish?.() ?? unexpected("unpublish");
    },
    templates: () => {
      calls.push("templates");
      return answers.templates?.() ?? unexpected("templates");
    },
    packages: () => {
      calls.push("packages");
      return answers.packages?.() ?? unexpected("packages");
    },
    readRsvp: () => {
      calls.push("readRsvp");
      return unexpected("readRsvp");
    },
    updateRsvpSettings: () => {
      calls.push("updateRsvpSettings");
      return unexpected("updateRsvpSettings");
    },
    rsvpCsv: () => {
      calls.push("rsvpCsv");
      return unexpected("rsvpCsv");
    },
    guests: (id) => {
      calls.push(`guests:${id}`);
      return unexpected("guests");
    },
    createGuest: () => {
      calls.push("createGuest");
      return unexpected("createGuest");
    },
    updateGuest: () => {
      calls.push("updateGuest");
      return unexpected("updateGuest");
    },
    removeGuest: () => {
      calls.push("removeGuest");
      return unexpected("removeGuest");
    },
    rotateGuestToken: () => {
      calls.push("rotateGuestToken");
      return unexpected("rotateGuestToken");
    },
    checkInGuest: () => {
      calls.push("checkInGuest");
      return unexpected("checkInGuest");
    },
  };
  return { api, calls };
}

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

describe("createInvitation", () => {
  it("creates the draft and goes to it with the confirmation", async () => {
    const { api, calls } = stub({ create: async () => ({ ok: true, value: OWNED }) });

    const target = await createInvitation(
      api,
      formData({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
    );

    assert.equal(target, `/cuenta/invitaciones/${ID}?notice=created`);
    assert.deepEqual(calls, [`create:${VERSION_ID}:${PACKAGE_ID}`]);
  });

  it("returns to step 3 with the selection kept and the reason the API refused the package", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "package-does-not-fit" }) });

    assert.equal(
      await createInvitation(
        api,
        formData({
          templateVersionId: VERSION_ID,
          packageId: PACKAGE_ID,
          ocasion: "birthday",
          diseno: "birthday-poster-01",
        }),
      ),
      `/cuenta/invitaciones/nueva?paso=3&ocasion=birthday&diseno=birthday-poster-01&tema=${VERSION_ID}&paquete=${PACKAGE_ID}&error=package-does-not-fit`,
    );
  });

  it("carries the theme and the package from the values the command already validated", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "validation" }) });
    // The same version and package the API refused: the selection the URL keeps is the one that was posted.
    const posted = { templateVersionId: VERSION_ID, packageId: PACKAGE_ID };

    const target = await createInvitation(api, formData(posted));

    assert.equal(
      target,
      `/cuenta/invitaciones/nueva?paso=3&tema=${VERSION_ID}&paquete=${PACKAGE_ID}&error=validation`,
    );
  });

  it("drops a carried selection value that is not shaped like a catalog id", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "package-not-found" }) });

    // The URL the step still answers: the code, the theme, and the package, plus each carried value only when
    // it is shaped like a catalog key. A slash, a space, a colon, or 65 characters is not one.
    const kept = (ocasion?: string, diseno?: string) =>
      `/cuenta/invitaciones/nueva?paso=3${ocasion === undefined ? "" : `&ocasion=${ocasion}`}${diseno === undefined ? "" : `&diseno=${diseno}`}&tema=${VERSION_ID}&paquete=${PACKAGE_ID}&error=package-not-found`;

    for (const [ocasion, diseno, keptOcasion, keptDiseno] of [
      ["../../etc/passwd", "birthday-poster-01&error=not-found", undefined, undefined],
      ["birthday", "javascript:alert(1)", "birthday", undefined],
      ["", "   ", undefined, undefined],
      ["x".repeat(65), "birthday-poster-01", undefined, "birthday-poster-01"],
      ["ocasion con espacio", "birthday/poster", undefined, undefined],
    ] as const) {
      assert.equal(
        await createInvitation(
          api,
          formData({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID, ocasion, diseno }),
        ),
        kept(keptOcasion, keptDiseno),
        `${ocasion} ${diseno}`,
      );
    }
  });

  it("carries a well-shaped but stale selection the chooser resolves safely", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "version-not-published" }) });
    const stale = "0b6f3e0e-8c1e-4b8e-9a51-000000000000";

    const target = await createInvitation(
      api,
      formData({
        templateVersionId: stale,
        packageId: PACKAGE_ID,
        ocasion: "no-such-occasion",
        diseno: "birthday-nope-01",
      }),
    );

    assert.equal(
      target,
      `/cuenta/invitaciones/nueva?paso=3&ocasion=no-such-occasion&diseno=birthday-nope-01&tema=${stale}&paquete=${PACKAGE_ID}&error=version-not-published`,
    );

    // The page re-reads every parameter against the creator catalog, so a stale or tampered one only loses
    // the selection: it lands on step 1 of the first occasion, never on an error page.
    const occasions = chooserOccasions(templateChoiceCards([TEMPLATE], "https://invitame.test"));
    const query = Object.fromEntries(new URLSearchParams(target.split("?")[1] ?? ""));
    const state = resolveChooserStep(occasions, [], query);

    assert.equal(state.step, 1);
    assert.equal(state.occasion?.key, "cumpleanos");
    assert.equal(state.design, undefined);
    assert.equal(state.style, undefined);
  });

  it("answers signed-out at the form itself and sends the visitor to sign in", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "signed-out" }) });

    assert.equal(
      await createInvitation(
        api,
        formData({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
      ),
      "/ingresar",
    );
  });

  it("refuses an incomplete form, and an unreachable API, without guessing", async () => {
    const incomplete = stub();
    assert.equal(
      await createInvitation(incomplete.api, formData({ templateVersionId: VERSION_ID })),
      `/cuenta/invitaciones/nueva?paso=3&tema=${VERSION_ID}&error=invalid-form`,
    );
    assert.deepEqual(incomplete.calls, []);

    const failing = stub({
      create: async () => {
        throw new Error("unreachable");
      },
    });
    assert.equal(
      await createInvitation(
        failing.api,
        formData({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
      ),
      `/cuenta/invitaciones/nueva?paso=3&tema=${VERSION_ID}&paquete=${PACKAGE_ID}&error=unavailable`,
    );
  });
});

describe("saveInvitationContent", () => {
  function answers(version = VERSION_ID) {
    return {
      get: async (): Promise<InvitationResult<OwnedInvitation>> => ({
        ok: true,
        value: { ...OWNED, templateVersionId: version },
      }),
      templates: async (): Promise<InvitationResult<CreatorTemplate[]>> => ({
        ok: true,
        value: [TEMPLATE],
      }),
      replaceContent: async (): Promise<InvitationResult<OwnedInvitation>> => ({
        ok: true,
        value: OWNED,
      }),
    };
  }

  it("saves the parsed content of the form and reports it", async () => {
    const { api, calls } = stub(answers());

    const target = await saveInvitationContent(
      api,
      formData({ id: ID, celebrantName: " Ana ", age: "7", message: "" }),
    );

    assert.equal(target, `/cuenta/invitaciones/${ID}?notice=saved`);
    assert.deepEqual(calls, [
      `get:${ID}`,
      "templates",
      `replaceContent:${ID}:${JSON.stringify({ celebrantName: "Ana", age: 7 })}`,
    ]);
  });

  it("keeps the draft as it is when the version is no longer in the catalog", async () => {
    const { api, calls } = stub(answers(PACKAGE_ID));

    assert.equal(
      await saveInvitationContent(api, formData({ id: ID, celebrantName: "Ana" })),
      `/cuenta/invitaciones/${ID}?error=content-unavailable`,
    );
    assert.equal(calls.includes("replaceContent"), false);
  });

  it("refuses an unreadable value instead of sending it", async () => {
    for (const invalid of [
      { age: "siete" },
      { age: "-1" },
      { age: "0" },
      { age: "121" },
      { date: "2026-02-30" },
      { time: "25:00" },
      { message: "a".repeat(501) },
    ]) {
      const { api, calls } = stub(answers());

      assert.equal(
        await saveInvitationContent(api, formData({ id: ID, ...invalid })),
        `/cuenta/invitaciones/${ID}?error=invalid-form`,
        JSON.stringify(invalid),
      );
      assert.equal(calls.includes("replaceContent"), false, JSON.stringify(invalid));
    }
  });

  it("maps an archived draft, a foreign id, and an ended session", async () => {
    const archived = stub({
      ...answers(),
      replaceContent: async () => ({ ok: false, failure: "not-editable" }),
    });
    assert.equal(
      await saveInvitationContent(archived.api, formData({ id: ID, celebrantName: "Ana" })),
      `/cuenta/invitaciones/${ID}?error=not-editable`,
    );

    const foreign = stub({ get: async () => ({ ok: false, failure: "not-found" }) });
    assert.equal(
      await saveInvitationContent(foreign.api, formData({ id: ID, celebrantName: "Ana" })),
      `/cuenta/invitaciones/${ID}?error=not-found`,
    );

    const ended = stub({ get: async () => ({ ok: false, failure: "signed-out" }) });
    assert.equal(
      await saveInvitationContent(ended.api, formData({ id: ID, celebrantName: "Ana" })),
      "/ingresar",
    );
  });

  it("sends an id that is not a UUID back to the list without calling the API", async () => {
    const { api, calls } = stub();

    assert.equal(
      await saveInvitationContent(api, formData({ id: "1", celebrantName: "Ana" })),
      "/cuenta/invitaciones?error=not-found",
    );
    assert.deepEqual(calls, []);
  });
});

describe("archiveInvitation", () => {
  it("archives the draft and returns to it with the confirmation", async () => {
    const { api, calls } = stub({
      archive: async () => ({
        ok: true,
        value: { ...SUMMARY, status: "ARCHIVED", archivedAt: AT },
      }),
    });

    assert.equal(
      await archiveInvitation(api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?notice=archived`,
    );
    assert.deepEqual(calls, [`archive:${ID}`]);
  });

  it("reports a draft that was already archived", async () => {
    const { api } = stub({ archive: async () => ({ ok: false, failure: "already-archived" }) });

    assert.equal(
      await archiveInvitation(api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?error=already-archived`,
    );
  });

  it("answers an unreachable API with the unavailable message", async () => {
    const { api } = stub({
      archive: async () => {
        throw new Error("unreachable");
      },
    });

    assert.equal(
      await archiveInvitation(api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?error=unavailable`,
    );
  });
});

const PUBLISHED: OwnedInvitation = { ...OWNED, status: "PUBLISHED", publishedAt: AT };

describe("publishInvitation", () => {
  it("publishes the draft and returns to it with the confirmation", async () => {
    const { api, calls } = stub({ publish: async () => ({ ok: true, value: PUBLISHED }) });

    assert.equal(
      await publishInvitation(api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?notice=published`,
    );
    assert.deepEqual(calls, [`publish:${ID}`]);
  });

  it("comes back with the readiness issues as codes the page turns into Spanish", async () => {
    const { api } = stub({
      publish: async () => ({
        ok: false,
        failure: "not-publishable",
        issues: [
          "content.date is required to publish",
          "content.time is required to publish",
          "package does not include the template's required features",
        ],
      }),
    });

    assert.equal(
      await publishInvitation(api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?error=not-publishable&issues=field:date,field:time,package`,
    );
  });

  it("comes back with the generic issue when the API names none", async () => {
    const { api } = stub({
      publish: async () => ({ ok: false, failure: "not-publishable" }),
    });

    assert.equal(
      await publishInvitation(api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?error=not-publishable&issues=other`,
    );
  });

  it("reports a repeated publication, the payment gate, and an ended session", async () => {
    for (const [failure, code] of [
      ["already-published", "already-published"],
      ["payment-required", "payment-required"],
      ["not-found", "not-found"],
    ] as const) {
      const { api } = stub({ publish: async () => ({ ok: false, failure }) });

      assert.equal(
        await publishInvitation(api, formData({ id: ID })),
        `/cuenta/invitaciones/${ID}?error=${code}`,
        failure,
      );
    }

    const ended = stub({ publish: async () => ({ ok: false, failure: "signed-out" }) });
    assert.equal(await publishInvitation(ended.api, formData({ id: ID })), "/ingresar");
  });

  it("refuses an id that is not a UUID, and an unreachable API, without guessing", async () => {
    const { api, calls } = stub();

    assert.equal(
      await publishInvitation(api, formData({ id: "1" })),
      "/cuenta/invitaciones?error=not-found",
    );
    assert.deepEqual(calls, []);

    const failing = stub({
      publish: async () => {
        throw new Error("unreachable");
      },
    });
    assert.equal(
      await publishInvitation(failing.api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?error=unavailable`,
    );
  });
});

describe("unpublishInvitation", () => {
  it("returns the invitation to draft and confirms it", async () => {
    const { api, calls } = stub({ unpublish: async () => ({ ok: true, value: SUMMARY }) });

    assert.equal(
      await unpublishInvitation(api, formData({ id: ID })),
      `/cuenta/invitaciones/${ID}?notice=unpublished`,
    );
    assert.deepEqual(calls, [`unpublish:${ID}`]);
  });

  it("reports a draft that is not published, an archived one, and an ended session", async () => {
    for (const [failure, code] of [
      ["not-published", "not-published"],
      ["already-archived", "already-archived"],
    ] as const) {
      const { api } = stub({ unpublish: async () => ({ ok: false, failure }) });

      assert.equal(
        await unpublishInvitation(api, formData({ id: ID })),
        `/cuenta/invitaciones/${ID}?error=${code}`,
        failure,
      );
    }

    const ended = stub({ unpublish: async () => ({ ok: false, failure: "signed-out" }) });
    assert.equal(await unpublishInvitation(ended.api, formData({ id: ID })), "/ingresar");
  });
});

describe("publication issues", () => {
  it("turns each known API issue into its own small code, and any other into one generic code", () => {
    assert.deepEqual(publishIssueCodes(["content.date is required to publish"]), ["field:date"]);
    assert.deepEqual(
      publishIssueCodes([
        "content.celebrantName is required to publish",
        "content.celebrantName is required to publish",
        "package does not include the template's required features",
      ]),
      ["field:celebrantName", "package"],
    );
    assert.deepEqual(publishIssueCodes(["template version is no longer published"]), ["version"]);
    assert.deepEqual(
      publishIssueCodes([
        "content.age must be an integer from 1 to 120",
        "content.date must be a calendar date as YYYY-MM-DD",
      ]),
      ["other"],
    );
    assert.deepEqual(publishIssueCodes([]), ["other"]);
  });

  it("bounds the codes it puts in a query", () => {
    const many = Array.from(
      { length: 20 },
      (_, index) => `content.field${index} is required to publish`,
    );

    assert.equal(publishIssueCodes(many).length, 8);
    assert.equal(
      publishIssueMessages(Array.from({ length: 20 }, (_, index) => `field:field${index}`)).length,
      10,
    );
  });

  it("writes each code as a Spanish sentence and never echoes English", () => {
    assert.deepEqual(publishIssueMessages("field:date,package"), [
      "Falta: Fecha.",
      "El paquete que elegiste ya no incluye lo que necesita esta plantilla. Elige otro paquete.",
    ]);
    assert.deepEqual(publishIssueMessages(["field:date", "field:date"]), ["Falta: Fecha."]);
    assert.deepEqual(publishIssueMessages("version"), [
      "La versión de la plantilla de esta invitación ya no está publicada.",
    ]);
    assert.deepEqual(publishIssueMessages("other"), [
      "Hay un dato que no cumple lo que pide la plantilla. Revísalo y vuelve a intentarlo.",
    ]);
  });

  it("ignores a code it does not know, a repeated parameter, and anything that is not a string list", () => {
    for (const value of [
      undefined,
      "",
      "invented",
      "content.date is required to publish",
      ["invented"],
      ["field:date", 7],
      ["field:", "field:date,package"],
    ]) {
      assert.deepEqual(
        publishIssueMessages(value as string | string[] | undefined),
        [],
        JSON.stringify(value),
      );
    }
  });

  it("is what the page reads back from its own query", () => {
    assert.deepEqual(
      invitationPageNotices({
        error: "not-publishable",
        issues: "field:date,package",
      }),
      {
        error: INVITATION_ERROR_COPY["not-publishable"],
        issues: [
          "Falta: Fecha.",
          "El paquete que elegiste ya no incluye lo que necesita esta plantilla. Elige otro paquete.",
        ],
      },
    );
    assert.deepEqual(invitationPageNotices({ error: "already-published", issues: "package" }), {
      error: INVITATION_ERROR_COPY["already-published"],
    });
    assert.deepEqual(invitationPageNotices({ issues: "package" }), {});
  });
});

// The baby shower and themed baptism draft forms (T7c; S13): every new field gets a Spanish label, its own
// section (ceremony and reception apart), and the control its schema declares, so the customer can fill an
// invitation of either occasion without a second form.

/** A form the browser would submit for a schema, with only the controls that were filled. */
function contentForm(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

describe("celebration occasion forms", () => {
  it("gives every baby shower field a Spanish label and the right control", () => {
    const fields = contentFields(BABY_SHOWER_SCHEMA);
    const byName = new Map(fields.map((field) => [field.name, field]));

    for (const field of fields) {
      assert.notEqual(field.label, field.name, `${field.name} has a Spanish label`);
      assert.ok(field.label.trim().length > 0, `${field.name} label is not empty`);
    }
    assert.equal(byName.get("hosts")?.label, "Anfitriones");
    assert.equal(byName.get("babyName")?.label, "Nombre del bebé (opcional)");
    assert.equal(byName.get("genderReveal")?.input.kind, "checkbox");
    assert.equal(byName.get("date")?.input.kind, "date");
    assert.equal(byName.get("time")?.input.kind, "time");
    assert.equal(byName.get("giftRegistry")?.label, "Mesa de regalos");
    assert.equal(byName.get("giftRegistry")?.input.kind, "text");
    assert.equal(byName.get("rsvpContact")?.label, "Confirmación de asistencia");
  });

  it("marks only the fields the baby shower schema requires", () => {
    const fields = contentFields(BABY_SHOWER_SCHEMA);

    assert.deepEqual(
      fields.filter((field) => field.required).map((field) => field.name),
      ["hosts", "date", "time", "location", "address", "message", "rsvpContact"],
    );
    for (const name of ["babyName", "genderReveal", "giftRegistry", "mainPhoto"]) {
      assert.equal(
        fields.find((field) => field.name === name)?.required,
        false,
        `${name} is optional`,
      );
    }
  });

  it("groups the baby shower fields into short sections", () => {
    assert.deepEqual(
      contentSections(contentFields(BABY_SHOWER_SCHEMA)).map((section) => [
        section.title,
        section.fields.map((field) => field.name),
      ]),
      [
        ["Festejado", ["hosts", "babyName", "genderReveal"]],
        ["Cuándo", ["date", "time"]],
        ["Dónde", ["location", "address"]],
        ["Contenido", ["message", "rsvpContact", "giftRegistry", "mainPhoto"]],
      ],
    );
  });

  it("gives every baptism field a Spanish label, its own ceremony and reception groups", () => {
    const fields = contentFields(BAPTISM_SCHEMA);
    const byName = new Map(fields.map((field) => [field.name, field]));

    for (const field of fields) {
      assert.notEqual(field.label, field.name, `${field.name} has a Spanish label`);
      assert.ok(field.label.trim().length > 0, `${field.name} label is not empty`);
    }
    assert.equal(byName.get("parents")?.label, "Padres");
    assert.equal(byName.get("godparents")?.label, "Padrinos");
    assert.equal(byName.get("ceremonyPlace")?.input.kind, "text");
    assert.equal(byName.get("ceremonyTime")?.input.kind, "time");
    assert.equal(byName.get("ceremonyTime")?.required, true);
    assert.equal(byName.get("receptionTime")?.input.kind, "time");
    assert.equal(byName.get("giftRegistry")?.input.kind, "text");
    assert.equal(byName.get("giftRegistry")?.required, false);

    assert.deepEqual(
      contentSections(fields).map((section) => [
        section.title,
        section.fields.map((field) => field.name),
      ]),
      [
        ["Festejado", ["celebrantName", "parents", "godparents"]],
        ["Cuándo", ["date"]],
        ["Ceremonia", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
        ["Recepción", ["receptionPlace", "receptionAddress", "receptionTime"]],
        ["Contenido", ["message", "rsvpContact", "giftRegistry", "mainPhoto"]],
      ],
    );
  });

  it("reads a baby shower form, including its optional checkbox and gift registry", () => {
    const fields = contentFields(BABY_SHOWER_SCHEMA);

    assert.deepEqual(
      parseContentForm(
        fields,
        contentForm({
          hosts: " Mariana y Lucía ",
          babyName: "Sofía",
          genderReveal: "true",
          date: "2027-03-13",
          time: "12:00",
          giftRegistry: "Mesa de regalos · Código 5123 4471",
          message: "¡Te esperamos!",
          rsvpContact: "Mariana 55 1234 5678",
        }),
      ),
      {
        ok: true,
        content: {
          hosts: "Mariana y Lucía",
          date: "2027-03-13",
          time: "12:00",
          message: "¡Te esperamos!",
          rsvpContact: "Mariana 55 1234 5678",
          babyName: "Sofía",
          genderReveal: true,
          giftRegistry: "Mesa de regalos · Código 5123 4471",
        },
      },
    );

    assert.deepEqual(parseContentForm(fields, contentForm({ hosts: "Mariana" })), {
      ok: true,
      content: { hosts: "Mariana", genderReveal: false },
    });
  });

  it("never posts an empty optional photo, which the API would refuse as a URI", () => {
    // The API keeps `format: "uri"` on the optional photo, so an empty string is not a valid value: the form
    // omits it and the invitation simply has no photo (S13).
    for (const [schema, required] of [
      [
        BABY_SHOWER_SCHEMA,
        {
          hosts: "Mariana",
          date: "2027-03-13",
          time: "12:00",
          location: "Jardín Las Palmas",
          address: "Av. de los Cedros 88",
          message: "¡Te esperamos!",
          rsvpContact: "Mariana 55 1234 5678",
        },
      ],
      [
        BAPTISM_SCHEMA,
        {
          celebrantName: "Emilia",
          date: "2027-04-11",
          parents: "Diego y Valentina Ortiz",
          godparents: "Andrés Ortiz y Camila Reyes",
          ceremonyPlace: "Parroquia San Miguel",
          ceremonyAddress: "Calle Hidalgo 45",
          ceremonyTime: "11:00",
          receptionPlace: "Casa de los abuelos",
          receptionAddress: "Av. de los Fresnos 210",
          receptionTime: "13:30",
          message: "Acompáñanos.",
          rsvpContact: "Valentina 55 9876 5432",
        },
      ],
    ] as const) {
      const parsed = parseContentForm(
        contentFields(schema),
        contentForm({ ...required, mainPhoto: "  ", giftRegistry: "" }),
      );

      assert.equal(parsed.ok, true);
      if (!parsed.ok) {
        return;
      }
      assert.equal(Object.hasOwn(parsed.content, "mainPhoto"), false);
      assert.equal(Object.hasOwn(parsed.content, "giftRegistry"), false);
    }
  });

  it("reads a baptism form with both times and refuses a malformed one", () => {
    const fields = contentFields(BAPTISM_SCHEMA);
    const complete = {
      celebrantName: "Emilia",
      date: "2027-04-11",
      parents: "Diego y Valentina Ortiz",
      godparents: "Andrés Ortiz y Camila Reyes",
      ceremonyPlace: "Parroquia San Miguel",
      ceremonyAddress: "Calle Hidalgo 45",
      ceremonyTime: "11:00",
      receptionPlace: "Casa de los abuelos",
      receptionAddress: "Av. de los Fresnos 210",
      receptionTime: "13:30",
      message: "Acompáñanos.",
      rsvpContact: "Valentina 55 9876 5432",
    };

    assert.deepEqual(parseContentForm(fields, contentForm(complete)), {
      ok: true,
      content: complete,
    });
    for (const [name, value] of [
      ["ceremonyTime", "11 h"],
      ["receptionTime", "25:00"],
      ["date", "2027-04-31"],
    ] as const) {
      assert.deepEqual(
        parseContentForm(fields, contentForm({ ...complete, [name]: value })),
        { ok: false },
        name,
      );
    }
  });
});

describe("refused create keeps the selection", () => {
  it("never leaves the create page or the site for a tampered theme or package (S12)", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "validation" }) });

    for (const posted of [
      { templateVersionId: "https://evil.test/x", packageId: "//evil.test" },
      { templateVersionId: "x\r\nLocation: https://evil.test", packageId: "a&error=not-found" },
      { templateVersionId: "javascript:alert(1)", packageId: "?paso=1" },
      { templateVersionId: "../../etc/passwd", packageId: "\\evil.test" },
    ]) {
      const target = await createInvitation(
        api,
        formData({
          ...posted,
          ocasion: "birthday",
          diseno: "birthday-poster-01",
        }),
      );
      const resolved = new URL(target, "https://invitame.test");

      assert.equal(resolved.origin, "https://invitame.test", target);
      assert.equal(resolved.pathname, "/cuenta/invitaciones/nueva", target);
      assert.equal(resolved.searchParams.get("paso"), "3", target);
      assert.equal(resolved.searchParams.get("tema"), posted.templateVersionId, target);
      assert.equal(resolved.searchParams.get("paquete"), posted.packageId, target);
      assert.equal(resolved.searchParams.get("error"), "validation", target);
      assert.doesNotMatch(target, /[\r\n]/, target);
    }
  });

  it("resolves the refused-create URL back to step 3 with the whole selection (S12)", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "package-does-not-fit" }) });
    const target = await createInvitation(
      api,
      formData({
        templateVersionId: VERSION_ID,
        packageId: PACKAGE_ID,
        ocasion: TEMPLATE.category.key,
        diseno: TEMPLATE.publishedVersion.componentKey,
      }),
    );
    const occasions = chooserOccasions(templateChoiceCards([TEMPLATE], "https://invitame.test"));
    const packages = packageChoices([PACKAGE]);
    const query = Object.fromEntries(new URLSearchParams(target.split("?")[1] ?? ""));
    const state = resolveChooserStep(occasions, packages, query);

    assert.equal(state.step, 3);
    assert.equal(state.occasion?.key, TEMPLATE.category.key);
    assert.equal(state.design?.componentKey, TEMPLATE.publishedVersion.componentKey);
    assert.equal(state.style?.versionId, VERSION_ID);
    assert.equal(state.package?.value, PACKAGE_ID);
    assert.equal(target, `${stepHref(state, 3)}&error=package-does-not-fit`);
  });
});
