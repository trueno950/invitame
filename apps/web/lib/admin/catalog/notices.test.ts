import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogFailure } from "../../server/admin-catalog-client.ts";
import { CATALOG_ERROR_COPY, CATALOG_NOTICE_COPY } from "./copy.ts";
import { errorMessage, errorTarget, noticeTarget, pageNotices } from "./notices.ts";

// The outcome of a catalog action travels in the redirect's query (`?notice=` or `?error=`), so a form
// works without JavaScript (redirect after POST). The query holds only a code from a fixed list; the
// page never echoes it, and the Spanish message comes from the code (M3 T8a; S9).

const FAILURES: Record<CatalogFailure, string> = {
  "signed-out": "",
  forbidden: "Tu cuenta no tiene permiso para hacer esto.",
  "not-found": "No encontramos ese registro. Puede que ya no exista.",
  validation: "Revisa los datos",
  "feature-not-found": "Alguna de las funciones elegidas ya no existe",
  "key-taken": "Ya existe un registro con esa clave. Escribe otra.",
  "concurrent-update": "Otra persona cambió esto al mismo tiempo. Vuelve a intentarlo.",
  "category-not-found": "La categoría elegida ya no existe",
  "template-not-publishable": "No se pudo hacer: una plantilla solo está publicada",
  "transition-not-allowed": "Esa versión ya no está en un estado que permita esta acción",
  "contract-invalid": "El renderizador ya no acepta el contenido de esta versión",
};

describe("errorMessage", () => {
  it("maps every API failure the pages handle to a Spanish message", () => {
    for (const [failure, expected] of Object.entries(FAILURES)) {
      if (failure === "signed-out") {
        continue;
      }
      const message = errorMessage(failure as Exclude<CatalogFailure, "signed-out">);
      assert.ok(message.startsWith(expected), `${failure}: ${message}`);
    }
  });

  it("gives the three named API codes their own messages", () => {
    assert.match(errorMessage("key-taken"), /Ya existe un registro con esa clave/);
    assert.match(errorMessage("concurrent-update"), /Otra persona cambió esto/);
    assert.match(errorMessage("validation"), /Revisa los datos/);
  });

  it("names the largest price in the too-large message", () => {
    assert.match(errorMessage("price-too-large"), /\$21,474,836\.47/);
  });
});

describe("pageNotices", () => {
  it("reads a known notice or error code", () => {
    assert.deepEqual(pageNotices({ notice: "created" }), { notice: CATALOG_NOTICE_COPY.created });
    assert.deepEqual(pageNotices({ error: "key-taken" }), {
      error: { code: "key-taken", message: errorMessage("key-taken") },
    });
    assert.deepEqual(pageNotices({ notice: "price-saved", error: "validation" }), {
      notice: CATALOG_NOTICE_COPY["price-saved"],
      error: { code: "validation", message: errorMessage("validation") },
    });
  });

  it("ignores an unknown, repeated, or inherited code and never echoes it", () => {
    for (const value of [
      "<script>alert(1)</script>",
      "toString",
      "__proto__",
      "constructor",
      "",
      ["created", "saved"],
      undefined,
    ]) {
      assert.deepEqual(pageNotices({ notice: value, error: value }), {}, JSON.stringify(value));
    }
  });

  it("has a message for every error code and no empty text", () => {
    for (const code of Object.keys(CATALOG_ERROR_COPY)) {
      const message = errorMessage(code as keyof typeof CATALOG_ERROR_COPY);
      assert.ok(message.length > 0);
      assert.deepEqual(pageNotices({ error: code }), { error: { code, message } });
    }
  });
});

describe("targets", () => {
  it("builds the redirect with a code and keeps the path unchanged", () => {
    assert.equal(
      noticeTarget("/admin/catalogo/categorias", "created"),
      "/admin/catalogo/categorias?notice=created",
    );
    assert.equal(
      errorTarget("/admin/catalogo/paquetes/nuevo", "key-taken"),
      "/admin/catalogo/paquetes/nuevo?error=key-taken",
    );
  });
});
