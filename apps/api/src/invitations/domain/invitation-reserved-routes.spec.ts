import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ownerSlugChoice, RESERVED_INVITATION_SLUGS } from "./invitation-slug";

// Every top-level route of the web app and every API path prefix must stay reserved, so a custom address can never
// shadow a real page (F11; S2.11, L15.1). The lists are read from the code, so a new route that is not reserved fails
// here instead of being claimable by an owner.
const ROOT = join(__dirname, "../../../../..");
const NOT_ROUTES = new Set(["_components"]);
const RESERVED: readonly string[] = RESERVED_INVITATION_SLUGS;

function webSegments(): string[] {
  const directory = join(ROOT, "apps/web/app");

  return readdirSync(directory).filter(
    (entry) => !NOT_ROUTES.has(entry) && statSync(join(directory, entry)).isDirectory(),
  );
}

function apiPrefixes(): string[] {
  const found = new Set<string>();
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);

      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry.endsWith(".controller.ts")) {
        for (const match of readFileSync(path, "utf8").matchAll(/@Controller\("([^"]+)"\)/g)) {
          const prefix = match[1]?.split("/")[0];

          if (prefix !== undefined && prefix !== "") {
            found.add(prefix);
          }
        }
      }
    }
  };

  walk(join(ROOT, "apps/api/src"));

  return [...found];
}

describe("reserved invitation addresses (F11; S2.11, L15.1)", () => {
  it("reserves every top-level route segment of the web app", () => {
    const segments = webSegments();

    assert.ok(segments.length > 0);
    for (const segment of segments) {
      assert.ok(RESERVED.includes(segment), `/${segment} is a web route but not reserved`);
    }
  });

  it("reserves every API path prefix", () => {
    const prefixes = apiPrefixes();

    assert.ok(prefixes.includes("invitations"));
    for (const prefix of prefixes) {
      assert.ok(RESERVED.includes(prefix), `/${prefix} is an API prefix but not reserved`);
    }
  });

  it("never offers a reserved word as an available address", () => {
    for (const word of RESERVED) {
      assert.notEqual(ownerSlugChoice(word), "available", word);
    }
  });
});
