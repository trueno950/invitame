import assert from "node:assert/strict";
import { it } from "node:test";

import {
  BIRTHDAY_ADVENTURE_CONFIGURATION,
  BIRTHDAY_ADVENTURE_SCHEMA,
} from "../../../../prisma/catalog-seed";
import { validateTemplateVersionContract } from "./renderer-registry";

// The seed's own constants, not a copy: a drift between the seeded version and the registry fails here.
it("the seeded birthday-adventure version satisfies the registry contract", () => {
  assert.deepEqual(
    validateTemplateVersionContract({
      componentKey: BIRTHDAY_ADVENTURE_CONFIGURATION.componentKey,
      schema: BIRTHDAY_ADVENTURE_SCHEMA,
      configuration: BIRTHDAY_ADVENTURE_CONFIGURATION,
    }),
    { ok: true },
  );
});
