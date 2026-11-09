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
  SIGN_IN_PATH,
  setPackageFeatures,
  setPackagePrice,
  updateEntry,
  updatePackage,
} from "./commands.ts";

// The server actions' logic (M3 T8a; S1, S4, S9): read the form, call the API client once, and answer
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
