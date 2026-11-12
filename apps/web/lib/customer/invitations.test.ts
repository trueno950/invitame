import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  CreatorPackage,
  CreatorTemplate,
  InvitationResult,
  InvitationsClient,
  InvitationSummary,
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
  createInvitation,
  fieldValue,
  invitationErrorTarget,
  invitationFieldsFor,
  invitationNoticeTarget,
  invitationPageNotices,
  invitationRows,
  missingFieldsMessage,
  packageOptions,
  parseContentForm,
  saveInvitationContent,
  templateOptions,
} from "./invitations.ts";

// The invitation pages of `/cuenta` (M4 T5; S1, S6, S7): how the pinned schema becomes a form, how the
// form becomes the JSON the API validates, and how each outcome of the server actions reaches a page as
// a code in its query. The API stays the authority on ownership, validation, and lifecycle.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const VERSION_ID = "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";
const PACKAGE_ID = "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15";
const AT = "2026-11-11T12:00:00.000Z";

/** The shape of the seeded `birthday-adventure-01` schema, as the creator catalog returns it. */
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

const SUMMARY: InvitationSummary = {
  id: ID,
  templateVersionId: VERSION_ID,
  packageId: PACKAGE_ID,
  slug: "invitacion-k7m2qx",
  status: "DRAFT",
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
};

const OWNED: OwnedInvitation = {
  ...SUMMARY,
  content: { celebrantName: "Ana" },
  missingRequiredFields: ["age", "date", "time", "location", "address", "mainPhoto", "message"],
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
    componentKey: "birthday-adventure-01",
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
      { name: "celebrantName", type: "string", label: "Nombre del festejado" },
      { name: "age", type: "integer", label: "Edad" },
      { name: "date", type: "string", label: "Fecha" },
      { name: "time", type: "string", label: "Hora" },
      { name: "location", type: "string", label: "Lugar" },
      { name: "address", type: "string", label: "Dirección" },
      { name: "mainPhoto", type: "string", label: "Foto principal (URL)" },
      { name: "message", type: "string", label: "Mensaje" },
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
      { name: "cake", type: "string", label: "cake" },
      { name: "guests", type: "integer", label: "guests" },
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
    assert.deepEqual(parseContentForm(fields, form({ age: " -7 " })), {
      ok: true,
      content: { age: -7 },
    });
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
  it("maps each draft to a row of the list with its status and creation date", () => {
    assert.deepEqual(
      invitationRows([SUMMARY, { ...SUMMARY, status: "ARCHIVED", archivedAt: AT }]),
      [
        {
          id: ID,
          href: `/cuenta/invitaciones/${ID}`,
          slug: "invitacion-k7m2qx",
          statusLabel: "Borrador",
          createdOn: "11 nov 2026",
        },
        {
          id: ID,
          href: `/cuenta/invitaciones/${ID}`,
          slug: "invitacion-k7m2qx",
          statusLabel: "Archivada",
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

describe("select options", () => {
  it("offers each template with its category, and each package with its price in pesos", () => {
    assert.deepEqual(templateOptions([TEMPLATE]), [
      { value: VERSION_ID, label: "Cumpleaños (Cumpleaños)" },
    ]);
    assert.deepEqual(packageOptions([PACKAGE]), [{ value: PACKAGE_ID, label: "Basic: $1,500.00" }]);
  });

  it("says a package has no price instead of showing zero", () => {
    assert.deepEqual(packageOptions([{ ...PACKAGE, currentPrice: null }]), [
      { value: PACKAGE_ID, label: `Basic: ${INVITATION_COPY.priceMissing}` },
    ]);
  });
});

describe("invitation copy", () => {
  it("labels the two statuses of a draft", () => {
    assert.deepEqual(INVITATION_STATUS_LABELS, { DRAFT: "Borrador", ARCHIVED: "Archivada" });
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
    archive: (id) => {
      calls.push(`archive:${id}`);
      return answers.archive?.() ?? unexpected("archive");
    },
    templates: () => {
      calls.push("templates");
      return answers.templates?.() ?? unexpected("templates");
    },
    packages: () => {
      calls.push("packages");
      return answers.packages?.() ?? unexpected("packages");
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

  it("returns to the form with the reason the API refused the package", async () => {
    const { api } = stub({ create: async () => ({ ok: false, failure: "package-does-not-fit" }) });

    assert.equal(
      await createInvitation(
        api,
        formData({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
      ),
      "/cuenta/invitaciones/nueva?error=package-does-not-fit",
    );
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
      "/cuenta/invitaciones/nueva?error=invalid-form",
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
      "/cuenta/invitaciones/nueva?error=unavailable",
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
    const { api, calls } = stub(answers());

    assert.equal(
      await saveInvitationContent(api, formData({ id: ID, age: "siete" })),
      `/cuenta/invitaciones/${ID}?error=invalid-form`,
    );
    assert.equal(calls.includes("replaceContent"), false);
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
