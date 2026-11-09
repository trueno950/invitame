import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CATALOG_ERROR_COPY,
  CATALOG_FIELD_COPY,
  CATALOG_INDEX_COPY,
  CATALOG_NOTICE_COPY,
  CATALOG_PATHS,
  CATALOG_UNAVAILABLE_COPY,
  ENTRY_COPY,
  PACKAGE_COPY,
  PACKAGE_STATUS_LABELS,
  TEMPLATE_COPY,
  TEMPLATE_STATUS_LABELS,
  VERSION_COPY,
  VERSION_STATUS_LABELS,
} from "./copy.ts";

// Catalog product copy (M3 T8a): neutral professional Spanish addressed with "tú", in one reviewable
// module, and "Funciones" is the label of what the code calls features.

function strings(): string[] {
  const values: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      values.push(value);
    } else if (typeof value === "function") {
      // The messages built from a name or a number: judged by one sample output.
      values.push(String(value("El esquema", "Publicada")));
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(visit);
    }
  };
  for (const copy of [
    CATALOG_ERROR_COPY,
    CATALOG_FIELD_COPY,
    CATALOG_INDEX_COPY,
    CATALOG_NOTICE_COPY,
    CATALOG_UNAVAILABLE_COPY,
    ENTRY_COPY,
    PACKAGE_COPY,
    PACKAGE_STATUS_LABELS,
    TEMPLATE_COPY,
    TEMPLATE_STATUS_LABELS,
    VERSION_COPY,
    VERSION_STATUS_LABELS,
  ]) {
    visit(copy);
  }
  return values;
}

describe("catalog copy", () => {
  it("builds the version messages from the name of the field, in Spanish", () => {
    assert.match(
      VERSION_COPY.jsonEmpty(VERSION_COPY.schemaName),
      /^El esquema no puede estar en blanco/,
    );
    assert.match(
      VERSION_COPY.jsonSyntax(VERSION_COPY.configurationName),
      /^La configuración no es/,
    );
    assert.match(VERSION_COPY.jsonTooLarge(VERSION_COPY.schemaName), /64 KiB/);
    assert.match(VERSION_COPY.prefilled(3, "Publicada"), /versión 3 \(publicada\)/);
  });

  it("never addresses the administrator with usted", () => {
    const formal =
      /\b(usted|ustedes|su correo|su cuenta|su contraseña|ingrese|escriba|revise|intente|espere|vuelva|elija|marque)\b/i;
    for (const value of strings()) {
      assert.doesNotMatch(value, formal, value);
    }
  });

  it("uses no em dash and no empty string", () => {
    for (const value of strings()) {
      assert.ok(value.trim().length > 0);
      assert.ok(!value.includes("—") && !value.includes("--"), value);
    }
  });

  it("labels features as Funciones and never shows the English word to the administrator", () => {
    assert.equal(CATALOG_INDEX_COPY.sections[1].title, "Funciones");
    assert.equal(ENTRY_COPY.features.heading, "Funciones");
    for (const value of strings()) {
      assert.doesNotMatch(value, /\bfeatures?\b/i, value);
    }
  });

  it("links the four areas under /admin/catalogo", () => {
    assert.deepEqual(
      CATALOG_INDEX_COPY.sections.map((section) => section.path),
      [
        CATALOG_PATHS.categories,
        CATALOG_PATHS.features,
        CATALOG_PATHS.packages,
        CATALOG_PATHS.templates,
      ],
    );
    for (const path of Object.values(CATALOG_PATHS).slice(1)) {
      assert.ok(path.startsWith("/admin/catalogo"), path);
    }
  });
});
