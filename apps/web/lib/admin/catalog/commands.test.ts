import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AdminCatalogClient,
  CatalogFailure,
  CatalogResult,
} from "../../server/admin-catalog-client.ts";
import { ApiClientError } from "../../server/api-client.ts";
import {
  createEntry,
  createPackage,
  createTemplate,
  createTemplateVersion,
  publishTemplateVersion,
  retireTemplateVersion,
  SIGN_IN_PATH,
  setPackageFeatures,
  setPackagePrice,
  updateEntry,
  updatePackage,
  updateTemplate,
} from "./commands.ts";
import { MAX_SNAPSHOT_BYTES } from "./versions.ts";

// The server actions' logic (M3 T8a and T8b; S1, S4, S5, S8, S9): read the form, call the API client once, and answer
// the path to redirect to (redirect after POST). The API stays the authority on every field; a refused
// write redirects to the form with an error code and changes nothing.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const FEATURE_A = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const FEATURE_B = "2b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e12";
const OK = { ok: true, value: {} } as unknown as CatalogResult<never>;

type Call = { method: string; args: unknown[] };

function stub(answer: CatalogResult<unknown> | Error = OK) {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    };
  const entries = (name: string) => ({
    list: record(`${name}.list`),
    create: record(`${name}.create`),
    update: record(`${name}.update`),
  });
  const api = {
    categories: entries("categories"),
    features: entries("features"),
    packages: {
      list: record("packages.list"),
      create: record("packages.create"),
      update: record("packages.update"),
      setFeatures: record("packages.setFeatures"),
      setPrice: record("packages.setPrice"),
      priceHistory: record("packages.priceHistory"),
    },
    templates: {
      list: record("templates.list"),
      create: record("templates.create"),
      update: record("templates.update"),
      versions: record("templates.versions"),
      createVersion: record("templates.createVersion"),
      publishVersion: record("templates.publishVersion"),
      retireVersion: record("templates.retireVersion"),
    },
    renderers: { list: record("renderers.list") },
  } as unknown as AdminCatalogClient;
  return { api, calls };
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(name, item);
    }
  }
  return data;
}

const failure = (value: CatalogFailure): CatalogResult<never> => ({ ok: false, failure: value });

describe("createEntry", () => {
  it("creates a category with a trimmed key and name and redirects to the list", async () => {
    const { api, calls } = stub();
    const target = await createEntry(
      api,
      "categories",
      form({ key: " baby-shower ", name: "  Baby shower ", description: "  " }),
    );

    assert.equal(target, "/admin/catalogo/categorias?notice=created");
    assert.deepEqual(calls, [
      {
        method: "categories.create",
        args: [{ key: "baby-shower", name: "Baby shower", description: null }],
      },
    ]);
  });

  it("creates a feature with its description", async () => {
    const { api, calls } = stub();
    const target = await createEntry(
      api,
      "features",
      form({ key: "RSVP", name: "Confirmar asistencia", description: "Los invitados responden." }),
    );

    assert.equal(target, "/admin/catalogo/funciones?notice=created");
    assert.deepEqual(calls[0], {
      method: "features.create",
      args: [
        { key: "RSVP", name: "Confirmar asistencia", description: "Los invitados responden." },
      ],
    });
  });

  it("returns to the form with the error code of each refusal", async () => {
    const cases: Array<[CatalogResult<never>, string]> = [
      [failure("key-taken"), "/admin/catalogo/categorias/nueva?error=key-taken"],
      [failure("validation"), "/admin/catalogo/categorias/nueva?error=validation"],
      [failure("forbidden"), "/admin/catalogo/categorias/nueva?error=forbidden"],
      [failure("signed-out"), SIGN_IN_PATH],
    ];

    for (const [result, expected] of cases) {
      const { api } = stub(result);
      assert.equal(
        await createEntry(api, "categories", form({ key: "a", name: "A" })),
        expected,
        JSON.stringify(result),
      );
    }
  });

  it("answers unavailable when the API fails, without leaking its error", async () => {
    const { api } = stub(new ApiClientError("unavailable", 503));
    const target = await createEntry(api, "features", form({ key: "A", name: "A" }));
    assert.equal(target, "/admin/catalogo/funciones/nueva?error=unavailable");
  });

  it("refuses a form without a key or a name before calling the API", async () => {
    for (const fields of [{ name: "A" }, { key: "a" }, {}]) {
      const { api, calls } = stub();
      const target = await createEntry(api, "categories", form(fields));
      assert.equal(target, "/admin/catalogo/categorias/nueva?error=invalid-form");
      assert.deepEqual(calls, []);
    }
  });

  it("refuses a file where a text field belongs", async () => {
    const { api, calls } = stub();
    const data = form({ key: "a" });
    data.append("name", new Blob(["x"]), "name.txt");
    assert.equal(
      await createEntry(api, "categories", data),
      "/admin/catalogo/categorias/nueva?error=invalid-form",
    );
    assert.deepEqual(calls, []);
  });
});

describe("updateEntry", () => {
  it("sends the whole form, with an unchecked box as inactive and an empty description as null", async () => {
    const { api, calls } = stub();
    const target = await updateEntry(
      api,
      "categories",
      form({ id: ID, name: " Cumpleaños ", description: "" }),
    );

    assert.equal(target, `/admin/catalogo/categorias/${ID}?notice=saved`);
    assert.deepEqual(calls, [
      {
        method: "categories.update",
        args: [ID, { name: "Cumpleaños", description: null, isActive: false }],
      },
    ]);
  });

  it("sends a checked box as active", async () => {
    const { api, calls } = stub();
    await updateEntry(
      api,
      "features",
      form({ id: ID, name: "RSVP", description: "x", isActive: "true" }),
    );
    assert.deepEqual(calls[0]?.args, [ID, { name: "RSVP", description: "x", isActive: true }]);
  });

  it("returns to the edit page on a refusal, and to the list when the record is gone", async () => {
    const cases: Array<[CatalogResult<never>, string]> = [
      [failure("validation"), `/admin/catalogo/funciones/${ID}?error=validation`],
      [failure("not-found"), "/admin/catalogo/funciones?error=not-found"],
      [failure("signed-out"), SIGN_IN_PATH],
    ];

    for (const [result, expected] of cases) {
      const { api } = stub(result);
      assert.equal(await updateEntry(api, "features", form({ id: ID, name: "A" })), expected);
    }
  });

  it("refuses an id that is not a UUID without calling the API", async () => {
    for (const id of ["", "../packages", "1", `${ID}/x`]) {
      const { api, calls } = stub();
      const target = await updateEntry(api, "categories", form({ id, name: "A" }));
      assert.equal(target, "/admin/catalogo/categorias?error=not-found", id);
      assert.deepEqual(calls, []);
    }
  });
});

describe("createPackage and updatePackage", () => {
  it("creates a package and redirects to the list", async () => {
    const { api, calls } = stub();
    const target = await createPackage(
      api,
      form({ key: "basico", name: "Básico", description: "" }),
    );

    assert.equal(target, "/admin/catalogo/paquetes?notice=created");
    assert.deepEqual(calls, [
      {
        method: "packages.create",
        args: [{ key: "basico", name: "Básico", description: null }],
      },
    ]);
  });

  it("returns to the new-package form when the key is taken", async () => {
    const { api } = stub(failure("key-taken"));
    assert.equal(
      await createPackage(api, form({ key: "basico", name: "Básico" })),
      "/admin/catalogo/paquetes/nuevo?error=key-taken",
    );
  });

  it("updates name, description, and status", async () => {
    const { api, calls } = stub();
    const target = await updatePackage(
      api,
      form({ id: ID, name: "Básico", description: "Lo esencial", status: "ACTIVE" }),
    );

    assert.equal(target, `/admin/catalogo/paquetes/${ID}?notice=saved`);
    assert.deepEqual(calls, [
      {
        method: "packages.update",
        args: [ID, { name: "Básico", description: "Lo esencial", status: "ACTIVE" }],
      },
    ]);
  });

  it("refuses a status outside the list before calling the API", async () => {
    for (const status of ["", "active", "DELETED", "toString"]) {
      const { api, calls } = stub();
      assert.equal(
        await updatePackage(api, form({ id: ID, name: "A", status })),
        `/admin/catalogo/paquetes/${ID}?error=invalid-form`,
        status,
      );
      assert.deepEqual(calls, []);
    }
  });

  it("reports a concurrent update on the edit page", async () => {
    const { api } = stub(failure("concurrent-update"));
    assert.equal(
      await updatePackage(api, form({ id: ID, name: "A", status: "DRAFT" })),
      `/admin/catalogo/paquetes/${ID}?error=concurrent-update`,
    );
  });
});

describe("setPackageFeatures", () => {
  it("sends the checked features, once each, and may send none", async () => {
    const { api, calls } = stub();
    const target = await setPackageFeatures(
      api,
      form({ id: ID, featureId: [FEATURE_A, FEATURE_B, FEATURE_A.toUpperCase()] }),
    );

    assert.equal(target, `/admin/catalogo/paquetes/${ID}?notice=features-saved`);
    assert.deepEqual(calls[0], {
      method: "packages.setFeatures",
      args: [ID, [FEATURE_A, FEATURE_B]],
    });

    const empty = stub();
    await setPackageFeatures(empty.api, form({ id: ID }));
    assert.deepEqual(empty.calls[0]?.args, [ID, []]);
  });

  it("refuses a feature id that is not a UUID before calling the API", async () => {
    const { api, calls } = stub();
    assert.equal(
      await setPackageFeatures(api, form({ id: ID, featureId: [FEATURE_A, "nope"] })),
      `/admin/catalogo/paquetes/${ID}?error=invalid-form`,
    );
    assert.deepEqual(calls, []);
  });

  it("reports a feature that no longer exists", async () => {
    const { api } = stub(failure("feature-not-found"));
    assert.equal(
      await setPackageFeatures(api, form({ id: ID, featureId: FEATURE_A })),
      `/admin/catalogo/paquetes/${ID}?error=feature-not-found`,
    );
  });
});

describe("setPackagePrice", () => {
  it("sends the price in centavos", async () => {
    const { api, calls } = stub();
    const target = await setPackagePrice(api, form({ id: ID, price: "1500.5" }));

    assert.equal(target, `/admin/catalogo/paquetes/${ID}?notice=price-saved`);
    assert.deepEqual(calls, [{ method: "packages.setPrice", args: [ID, 150050] }]);
  });

  it("accepts zero", async () => {
    const { api, calls } = stub();
    await setPackagePrice(api, form({ id: ID, price: "0" }));
    assert.deepEqual(calls[0]?.args, [ID, 0]);
  });

  it("refuses a bad price without calling the API", async () => {
    const cases: Array<[string, string]> = [
      ["", "price-empty"],
      ["1,000", "price-format"],
      ["-5", "price-format"],
      ["10.999", "price-format"],
      ["$10", "price-format"],
      ["21474836.48", "price-too-large"],
    ];

    for (const [price, code] of cases) {
      const { api, calls } = stub();
      assert.equal(
        await setPackagePrice(api, form({ id: ID, price })),
        `/admin/catalogo/paquetes/${ID}?error=${code}`,
        price,
      );
      assert.deepEqual(calls, [], price);
    }
  });

  it("refuses a missing price field", async () => {
    const { api, calls } = stub();
    assert.equal(
      await setPackagePrice(api, form({ id: ID })),
      `/admin/catalogo/paquetes/${ID}?error=invalid-form`,
    );
    assert.deepEqual(calls, []);
  });

  it("reports an API refusal and a signed-out session", async () => {
    assert.equal(
      await setPackagePrice(stub(failure("validation")).api, form({ id: ID, price: "10" })),
      `/admin/catalogo/paquetes/${ID}?error=validation`,
    );
    assert.equal(
      await setPackagePrice(stub(failure("signed-out")).api, form({ id: ID, price: "10" })),
      SIGN_IN_PATH,
    );
    assert.equal(
      await setPackagePrice(stub(failure("not-found")).api, form({ id: ID, price: "10" })),
      "/admin/catalogo/paquetes?error=not-found",
    );
  });
});

const CATEGORY = "3b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e13";
const VERSION = "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";
const TEMPLATE_PATH = `/admin/catalogo/plantillas/${ID}`;

describe("createTemplate", () => {
  it("creates a template with trimmed text and opens its edit page, where versions are made", async () => {
    const { api, calls } = stub({ ok: true, value: { id: ID } } as unknown as CatalogResult<never>);
    const target = await createTemplate(
      api,
      form({
        key: " aventura ",
        name: " Aventura ",
        description: " ",
        categoryId: CATEGORY,
      }),
    );

    assert.equal(target, `${TEMPLATE_PATH}?notice=created`);
    assert.deepEqual(calls, [
      {
        method: "templates.create",
        args: [{ key: "aventura", name: "Aventura", description: null, categoryId: CATEGORY }],
      },
    ]);
  });

  it("returns to the form with the code of each refusal", async () => {
    const cases: Array<[CatalogResult<never>, string]> = [
      [failure("key-taken"), "/admin/catalogo/plantillas/nueva?error=key-taken"],
      [failure("category-not-found"), "/admin/catalogo/plantillas/nueva?error=category-not-found"],
      [failure("validation"), "/admin/catalogo/plantillas/nueva?error=validation"],
      [failure("signed-out"), SIGN_IN_PATH],
    ];

    for (const [result, expected] of cases) {
      const { api } = stub(result);
      const fields = { key: "a", name: "A", categoryId: CATEGORY };
      assert.equal(await createTemplate(api, form(fields)), expected);
    }
  });

  it("refuses a missing field or a category that is not a UUID without calling the API", async () => {
    const complete = { key: "a", name: "A", categoryId: CATEGORY };
    const broken = [
      { ...complete, categoryId: "../categories" },
      { ...complete, categoryId: "" },
      { key: "a", name: "A" },
      { name: "A", categoryId: CATEGORY },
      { key: "a", categoryId: CATEGORY },
    ];

    for (const fields of broken) {
      const { api, calls } = stub();
      assert.equal(
        await createTemplate(api, form(fields)),
        "/admin/catalogo/plantillas/nueva?error=invalid-form",
      );
      assert.deepEqual(calls, []);
    }
  });

  it("answers unavailable when the API fails, without leaking its error", async () => {
    const { api } = stub(new ApiClientError("unavailable", 503));
    assert.equal(
      await createTemplate(api, form({ key: "a", name: "A", categoryId: CATEGORY })),
      "/admin/catalogo/plantillas/nueva?error=unavailable",
    );
  });
});

describe("updateTemplate", () => {
  const fields = {
    id: ID,
    name: " Aventura ",
    description: "",
    categoryId: CATEGORY,
    status: "ARCHIVED",
  };

  it("sends name, description, category, and status", async () => {
    const { api, calls } = stub();
    const target = await updateTemplate(api, form(fields));

    assert.equal(target, `${TEMPLATE_PATH}?notice=saved`);
    assert.deepEqual(calls, [
      {
        method: "templates.update",
        args: [
          ID,
          { name: "Aventura", description: null, categoryId: CATEGORY, status: "ARCHIVED" },
        ],
      },
    ]);
  });

  it("returns to the edit page with each refusal's code, and to the list when it is gone", async () => {
    const cases: Array<[CatalogResult<never>, string]> = [
      [failure("template-not-publishable"), `${TEMPLATE_PATH}?error=template-not-publishable`],
      [failure("category-not-found"), `${TEMPLATE_PATH}?error=category-not-found`],
      [failure("concurrent-update"), `${TEMPLATE_PATH}?error=concurrent-update`],
      [failure("not-found"), "/admin/catalogo/plantillas?error=not-found"],
      [failure("signed-out"), SIGN_IN_PATH],
    ];

    for (const [result, expected] of cases) {
      const { api } = stub(result);
      assert.equal(await updateTemplate(api, form(fields)), expected);
    }
  });

  it("refuses a status outside the list, a bad category, or a bad id without calling the API", async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ ...fields, status: "RETIRED" }, `${TEMPLATE_PATH}?error=invalid-form`],
      [{ ...fields, status: "draft" }, `${TEMPLATE_PATH}?error=invalid-form`],
      [{ ...fields, categoryId: "x" }, `${TEMPLATE_PATH}?error=invalid-form`],
      [{ ...fields, id: "../x" }, "/admin/catalogo/plantillas?error=not-found"],
    ];

    for (const [input, expected] of cases) {
      const { api, calls } = stub();
      assert.equal(await updateTemplate(api, form(input)), expected);
      assert.deepEqual(calls, []);
    }
  });
});

describe("publishTemplateVersion and retireTemplateVersion", () => {
  const commands = [
    [publishTemplateVersion, "templates.publishVersion", "version-published"],
    [retireTemplateVersion, "templates.retireVersion", "version-retired"],
  ] as const;

  it("calls the matching transition once and returns to the template with its notice", async () => {
    for (const [command, method, notice] of commands) {
      const { api, calls } = stub();
      const target = await command(api, form({ id: ID, versionId: VERSION }));

      assert.equal(target, `${TEMPLATE_PATH}?notice=${notice}`);
      assert.deepEqual(calls, [{ method, args: [ID, VERSION] }]);
    }
  });

  it("returns to the template with the code of each refusal", async () => {
    const cases: Array<[CatalogResult<never>, string]> = [
      [failure("transition-not-allowed"), `${TEMPLATE_PATH}?error=transition-not-allowed`],
      [failure("template-not-publishable"), `${TEMPLATE_PATH}?error=template-not-publishable`],
      [
        { ok: false, failure: "contract-invalid", issues: ["secret detail"] },
        `${TEMPLATE_PATH}?error=contract-invalid`,
      ],
      [failure("concurrent-update"), `${TEMPLATE_PATH}?error=concurrent-update`],
      [failure("not-found"), "/admin/catalogo/plantillas?error=not-found"],
      [failure("signed-out"), SIGN_IN_PATH],
    ];

    for (const [command] of commands) {
      for (const [result, expected] of cases) {
        const { api } = stub(result);
        assert.equal(await command(api, form({ id: ID, versionId: VERSION })), expected);
      }
    }
  });

  it("never puts an API issue in the redirect", async () => {
    const { api } = stub({ ok: false, failure: "contract-invalid", issues: ["a b c"] });
    const target = await publishTemplateVersion(api, form({ id: ID, versionId: VERSION }));
    assert.ok(!target.includes("a%20b") && !target.includes("a b c"));
  });

  it("refuses ids that are not UUIDs without calling the API", async () => {
    for (const [command] of commands) {
      for (const [input, expected] of [
        [{ id: ID, versionId: "../publish" }, `${TEMPLATE_PATH}?error=invalid-form`],
        [{ id: ID }, `${TEMPLATE_PATH}?error=invalid-form`],
        [{ id: "x", versionId: VERSION }, "/admin/catalogo/plantillas?error=not-found"],
        [{ versionId: VERSION }, "/admin/catalogo/plantillas?error=not-found"],
      ] as const) {
        const { api, calls } = stub();
        assert.equal(await command(api, form(input)), expected);
        assert.deepEqual(calls, []);
      }
    }
  });

  it("answers unavailable when the API fails", async () => {
    const { api } = stub(new ApiClientError("unavailable", 502));
    assert.equal(
      await publishTemplateVersion(api, form({ id: ID, versionId: VERSION })),
      `${TEMPLATE_PATH}?error=unavailable`,
    );
  });
});

describe("createTemplateVersion", () => {
  const input = {
    id: ID,
    componentKey: "birthday-adventure-01",
    schema: '{ "fields": ["name"] }',
    configuration: '{"palette":"ocean"}',
  };

  it("parses both JSON texts on the server and sends them as values, then returns to the template", async () => {
    const { api, calls } = stub();
    const outcome = await createTemplateVersion(api, form(input));

    assert.deepEqual(outcome, {
      kind: "redirect",
      target: `${TEMPLATE_PATH}?notice=version-created`,
    });
    assert.deepEqual(calls, [
      {
        method: "templates.createVersion",
        args: [
          ID,
          {
            componentKey: "birthday-adventure-01",
            schema: { fields: ["name"] },
            configuration: { palette: "ocean" },
          },
        ],
      },
    ]);
  });

  it("answers a Spanish error without calling the API for empty or invalid JSON, keeping what was typed", async () => {
    const cases: Array<[Record<string, string>, RegExp]> = [
      [{ ...input, schema: "{ not json" }, /^El esquema no es un JSON válido/],
      [
        { ...input, configuration: "{'palette': 'ocean'}" },
        /^La configuración no es un JSON válido/,
      ],
      [{ ...input, schema: "   " }, /^El esquema no puede estar en blanco/],
      [{ ...input, configuration: "" }, /^La configuración no puede estar en blanco/],
    ];

    for (const [fields, message] of cases) {
      const { api, calls } = stub();
      const outcome = await createTemplateVersion(api, form(fields));

      assert.equal(outcome.kind, "state");
      assert.ok(outcome.kind === "state");
      assert.match(outcome.state.message, message);
      assert.deepEqual(outcome.state.issues, []);
      assert.deepEqual(outcome.state.values, {
        componentKey: fields.componentKey,
        schema: fields.schema,
        configuration: fields.configuration,
      });
      assert.deepEqual(calls, []);
    }
  });

  it("refuses a part over 64 KiB without calling the API", async () => {
    const big = JSON.stringify({ text: "a".repeat(MAX_SNAPSHOT_BYTES) });
    const { api, calls } = stub();
    const outcome = await createTemplateVersion(api, form({ ...input, configuration: big }));

    assert.ok(outcome.kind === "state");
    assert.match(
      outcome.state.message,
      /^La configuración es demasiado grande: el máximo es 64 KiB/,
    );
    assert.deepEqual(calls, []);
  });

  it("shows the API's bounded contract issues in the state and never in a redirect", async () => {
    const issues = ["configuration.palette must be one of: sunset, ocean, forest"];
    const { api, calls } = stub({ ok: false, failure: "contract-invalid", issues });
    const outcome = await createTemplateVersion(api, form(input));

    assert.ok(outcome.kind === "state");
    assert.match(outcome.state.message, /El renderizador no aceptó/);
    assert.deepEqual(outcome.state.issues, issues);
    assert.equal(outcome.state.values.schema, input.schema);
    assert.equal(calls.length, 1);
  });

  it("stays on the form for the other refusals and redirects only when the session or template is gone", async () => {
    const stays: Array<[CatalogFailure, RegExp]> = [
      ["validation", /JSON de hasta 64 KiB/],
      ["concurrent-update", /Otra persona cambió esto/],
      ["forbidden", /no tiene permiso/],
    ];
    for (const [value, message] of stays) {
      const { api } = stub(failure(value));
      const outcome = await createTemplateVersion(api, form(input));
      assert.ok(outcome.kind === "state", value);
      assert.match(outcome.state.message, message);
      assert.deepEqual(outcome.state.issues, []);
    }

    assert.deepEqual(await createTemplateVersion(stub(failure("signed-out")).api, form(input)), {
      kind: "redirect",
      target: SIGN_IN_PATH,
    });
    assert.deepEqual(await createTemplateVersion(stub(failure("not-found")).api, form(input)), {
      kind: "redirect",
      target: "/admin/catalogo/plantillas?error=not-found",
    });
  });

  it("answers unavailable on the form when the API fails, without leaking its error", async () => {
    const { api } = stub(new ApiClientError("unavailable", 503));
    const outcome = await createTemplateVersion(api, form(input));

    assert.ok(outcome.kind === "state");
    assert.match(outcome.state.message, /No pudimos completar la acción/);
    assert.deepEqual(outcome.state.issues, []);
  });

  it("refuses a bad template id or a missing field before anything else", async () => {
    for (const [fields, expected] of [
      [{ ...input, id: "../x" }, "/admin/catalogo/plantillas?error=not-found"],
      [
        { schema: input.schema, id: ID, configuration: input.configuration },
        `${TEMPLATE_PATH}?error=invalid-form`,
      ],
    ] as const) {
      const { api, calls } = stub();
      assert.deepEqual(await createTemplateVersion(api, form(fields)), {
        kind: "redirect",
        target: expected,
      });
      assert.deepEqual(calls, []);
    }
  });
});
