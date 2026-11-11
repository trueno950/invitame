import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { adminButtonVariant } from "../../app/admin/_components/admin-ui.ts";

/** Each Tailwind class of a class string, for checking which sizing utilities it carries. */
const classes = (value: string) => new Set(value.split(/\s+/).filter((entry) => entry !== ""));

describe("admin button sizes", () => {
  for (const variant of ["solid", "outline", "ghost"] as const) {
    it(`gives the small ${variant} button only the small sizing, never both sizes`, () => {
      const small = classes(adminButtonVariant(variant, "small"));
      for (const expected of ["h-8", "px-3", "text-xs"]) {
        assert.ok(small.has(expected), `${variant} small has ${expected}`);
      }
      for (const conflicting of ["h-9", "px-4", "text-sm"]) {
        assert.ok(!small.has(conflicting), `${variant} small has no ${conflicting}`);
      }
    });

    it(`keeps the default ${variant} button at the default sizing`, () => {
      const regular = classes(adminButtonVariant(variant));
      for (const expected of ["h-9", "px-4", "text-sm"]) {
        assert.ok(regular.has(expected), `${variant} default has ${expected}`);
      }
      for (const conflicting of ["h-8", "px-3", "text-xs"]) {
        assert.ok(!regular.has(conflicting), `${variant} default has no ${conflicting}`);
      }
    });
  }
});
