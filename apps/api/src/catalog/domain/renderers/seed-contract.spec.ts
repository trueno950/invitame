import assert from "node:assert/strict";
import { it } from "node:test";

import {
  BIRTHDAY_ADVENTURE_CONFIGURATION,
  BIRTHDAY_ADVENTURE_SCHEMA,
  BIRTHDAY_LAYOUT_TEMPLATE_SEEDS,
} from "../../../../prisma/catalog-seed";
import { BIRTHDAY_THEMES } from "./birthday-themes";
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

it("seeds one template for every layout and theme, with unique keys", () => {
  assert.equal(BIRTHDAY_LAYOUT_TEMPLATE_SEEDS.length, 24);

  const keys = BIRTHDAY_LAYOUT_TEMPLATE_SEEDS.map((seed) => seed.key);

  assert.equal(new Set(keys).size, keys.length, "template keys must be unique");
  for (const seed of BIRTHDAY_LAYOUT_TEMPLATE_SEEDS) {
    assert.match(seed.key, /^birthday-(map|poster|story)-[a-z]+(-[a-z]+)*$/, seed.key);
  }

  const themesOf = (layout: string) =>
    BIRTHDAY_LAYOUT_TEMPLATE_SEEDS.filter((seed) => seed.componentKey === layout).map(
      (seed) => seed.theme,
    );

  for (const [layout, slug] of [
    ["birthday-map-01", "map"],
    ["birthday-poster-01", "poster"],
    ["birthday-story-01", "story"],
  ] as const) {
    assert.deepEqual(themesOf(layout), [...BIRTHDAY_THEMES], layout);
    for (const theme of BIRTHDAY_THEMES) {
      assert.ok(keys.includes(`birthday-${slug}-${theme}`), `${slug}/${theme}`);
    }
  }
});

it("names each template with its layout and theme and a short neutral description", () => {
  for (const seed of BIRTHDAY_LAYOUT_TEMPLATE_SEEDS) {
    assert.match(seed.name, /^(Mapa|Cartel|Cuento) · \S/, seed.key);
    assert.ok(seed.name.length <= 120, seed.key);
    assert.ok(seed.description.length > 0 && seed.description.length <= 1000, seed.key);
    assert.ok(!seed.description.includes("·"), `${seed.key} has one neutral description`);
  }
});

it("validates every seeded template configuration against its renderer", () => {
  for (const seed of BIRTHDAY_LAYOUT_TEMPLATE_SEEDS) {
    assert.deepEqual(
      validateTemplateVersionContract({
        componentKey: seed.componentKey,
        schema: seed.schema,
        configuration: seed.configuration,
      }),
      { ok: true },
      seed.key,
    );
  }
});
