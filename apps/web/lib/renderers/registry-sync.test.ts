import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { listRendererKeys } from "./registry.ts";

// S6: "API valida, web renderiza ... Una prueba asegura que ambas listas coinciden." The API owns the
// allow-list of `componentKey` values and the web owns the componentKey -> component map. The web must
// never import API code at runtime, so this test reads the API registry source as TEXT and compares the
// keys it registers with `listRendererKeys()` of the web registry.
//
// Extraction contract, on `apps/api/src/catalog/domain/renderers/renderer-registry.ts`:
//   1. The registered keys are the first elements of the entries of the `new Map([ ... ])` literal, as in
//      `[BIRTHDAY_MAP_COMPONENT_KEY, birthdayMapRenderer],` (or `["literal-key", renderer],`).
//   2. An identifier key is resolved through the file's own `import { IDENT } from "./module"` to that
//      module's `export const IDENT = "literal-key";`.
// Anything the extractor cannot resolve, a missing `new Map([ ... ])`, or zero keys is an error and the
// test fails, so a refactor of the API registry cannot turn this check into a vacuous pass. If the API
// registry changes shape, update this extractor deliberately.

const API_RENDERERS_DIRECTORY = new URL(
  "../../../api/src/catalog/domain/renderers/",
  import.meta.url,
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function readModule(directory: URL, specifier: string): string {
  return stripComments(readFileSync(new URL(`${specifier}.ts`, directory), "utf8"));
}

/** The keys the registry `source` registers; `readImported` returns the source of a relative import. */
export function extractRegisteredKeys(
  source: string,
  readImported: (specifier: string) => string,
): string[] {
  const code = stripComments(source);
  const map = /new Map(?:<[^>]*>)?\(\s*\[([\s\S]*?)\]\s*\)\s*;/.exec(code);

  if (map === null) {
    throw new Error("no `new Map([ ... ])` literal found in the registry source");
  }

  const keys: string[] = [];

  for (const entry of (map[1] ?? "").matchAll(/\[\s*("[^"]*"|[A-Za-z_$][\w$]*)\s*,/g)) {
    const token = entry[1] as string;

    if (token.startsWith('"')) {
      keys.push(token.slice(1, -1));
      continue;
    }

    const importFrom = new RegExp(
      `import\\s*\\{[^}]*\\b${token.replace(/\$/g, "\\$")}\\b[^}]*\\}\\s*from\\s*"(\\./[^"]+)"`,
    ).exec(code);
    const literal = importFrom?.[1]
      ? new RegExp(`export const ${token.replace(/\$/g, "\\$")}\\s*=\\s*"([^"]*)"`).exec(
          readImported(importFrom[1]),
        )
      : null;

    if (!literal || literal[1] === undefined) {
      throw new Error(`cannot resolve the registered key ${token} to a string literal`);
    }
    keys.push(literal[1]);
  }

  if (keys.length === 0) {
    throw new Error("the registry source registers no keys");
  }
  return keys;
}

describe("extractRegisteredKeys", () => {
  const registry = `
    // new Map([["commented-out", x]]);
    import { KEY_ONE, thing } from "./one";
    const RENDERERS: ReadonlyMap<string, Contract> = new Map([
      [KEY_ONE, thing],
      ["literal-two", other],
    ]);
  `;
  const readImported = (specifier: string) => {
    assert.equal(specifier, "./one");
    return 'export const KEY_ONE = "key-one";';
  };

  it("reads identifier and literal keys, ignoring comments", () => {
    assert.deepEqual(extractRegisteredKeys(registry, readImported), ["key-one", "literal-two"]);
  });

  it("fails instead of returning an empty list", () => {
    assert.throws(() => extractRegisteredKeys("const RENDERERS = new Map([]);", readImported), {
      message: "the registry source registers no keys",
    });
    assert.throws(() => extractRegisteredKeys("export const nothing = 1;", readImported), {
      message: "no `new Map([ ... ])` literal found in the registry source",
    });
  });

  it("fails on a key it cannot resolve", () => {
    assert.throws(() => extractRegisteredKeys("const R = new Map([[UNKNOWN, x]]);", readImported), {
      message: "cannot resolve the registered key UNKNOWN to a string literal",
    });
  });
});

describe("web and API renderer registries", () => {
  it("register exactly the same componentKey values", () => {
    const apiKeys = extractRegisteredKeys(
      readFileSync(new URL("renderer-registry.ts", API_RENDERERS_DIRECTORY), "utf8"),
      (specifier) => readModule(API_RENDERERS_DIRECTORY, specifier),
    );

    assert.ok(apiKeys.length > 0, "the API registry must register at least one key");
    assert.equal(new Set(apiKeys).size, apiKeys.length, "the API registry has duplicate keys");
    assert.deepEqual([...apiKeys].sort(), [...listRendererKeys()].sort());
  });
});
