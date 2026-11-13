import assert from "node:assert/strict";
import { it } from "node:test";

import {
  BABY_SHOWER_TEMPLATE_SEEDS,
  BAPTISM_TEMPLATE_SEEDS,
  BIRTHDAY_LAYOUT_TEMPLATE_SEEDS,
} from "../../../../prisma/catalog-seed";
import { BABY_SHOWER_THEMES } from "./baby-shower-themes";
import { BAPTISM_THEMES } from "./baptism-themes";
import { BIRTHDAY_THEMES } from "./birthday-themes";
import { validateTemplateVersionContract } from "./renderer-registry";

// The seed's own constants, not a copy: a drift between a seeded version and the registry fails here. Every
// template the seed creates — 24 birthday, eight baby shower, and six themed baptism (S8, S13) — must satisfy
// the renderer contract of the key it names.

const SEEDED_TEMPLATE_SEEDS = [
  ...BIRTHDAY_LAYOUT_TEMPLATE_SEEDS,
  ...BABY_SHOWER_TEMPLATE_SEEDS,
  ...BAPTISM_TEMPLATE_SEEDS,
];

it("every seeded template version satisfies the registry contract", () => {
  for (const seed of SEEDED_TEMPLATE_SEEDS) {
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

it("seeds 38 templates: 24 birthday, eight baby shower, and six themed baptism", () => {
  assert.equal(BIRTHDAY_LAYOUT_TEMPLATE_SEEDS.length, 24);
  assert.equal(BABY_SHOWER_TEMPLATE_SEEDS.length, 8);
  assert.equal(BAPTISM_TEMPLATE_SEEDS.length, 6);
  assert.equal(SEEDED_TEMPLATE_SEEDS.length, 38);
});

it("seeds one template for every layout and theme, with unique keys", () => {
  const keys = SEEDED_TEMPLATE_SEEDS.map((seed) => seed.key);

  assert.equal(new Set(keys).size, keys.length, "template keys must be unique");
  for (const seed of SEEDED_TEMPLATE_SEEDS) {
    assert.ok(seed.key.length > 0, seed.key);
  }

  const themesOf = (seeds: readonly { componentKey: string; theme: string }[], layout: string) =>
    seeds.filter((seed) => seed.componentKey === layout).map((seed) => seed.theme);

  for (const [layout, slug] of [
    ["birthday-map-01", "map"],
    ["birthday-poster-01", "poster"],
    ["birthday-story-01", "story"],
  ] as const) {
    assert.deepEqual(
      themesOf(BIRTHDAY_LAYOUT_TEMPLATE_SEEDS, layout),
      [...BIRTHDAY_THEMES],
      layout,
    );
    for (const theme of BIRTHDAY_THEMES) {
      assert.ok(keys.includes(`birthday-${slug}-${theme}`), `${slug}/${theme}`);
    }
  }

  assert.deepEqual(themesOf(BABY_SHOWER_TEMPLATE_SEEDS, "baby-shower-classic-01"), [
    ...BABY_SHOWER_THEMES,
  ]);
  for (const theme of BABY_SHOWER_THEMES) {
    assert.ok(keys.includes(`baby-shower-classic-${theme}`), `baby shower/${theme}`);
  }

  assert.deepEqual(themesOf(BAPTISM_TEMPLATE_SEEDS, "baptism-classic-01"), [...BAPTISM_THEMES]);
  for (const theme of BAPTISM_THEMES) {
    assert.ok(keys.includes(`baptism-classic-${theme}`), `baptism/${theme}`);
  }

  for (const seed of BABY_SHOWER_TEMPLATE_SEEDS) {
    assert.match(seed.key, /^baby-shower-classic-[a-z]+(-[a-z]+)*$/, seed.key);
  }
  for (const seed of BAPTISM_TEMPLATE_SEEDS) {
    assert.match(seed.key, /^baptism-classic-[a-z]+(-[a-z]+)*$/, seed.key);
  }
});

it("names each template with its layout and theme and a short neutral description", () => {
  for (const seed of BIRTHDAY_LAYOUT_TEMPLATE_SEEDS) {
    assert.match(seed.name, /^(Mapa|Cartel|Cuento) · \S/, seed.key);
  }
  for (const seed of [...BABY_SHOWER_TEMPLATE_SEEDS, ...BAPTISM_TEMPLATE_SEEDS]) {
    assert.match(seed.name, /^Clásica · \S/, seed.key);
  }
  for (const seed of SEEDED_TEMPLATE_SEEDS) {
    assert.ok(seed.name.length <= 120, seed.key);
    assert.ok(seed.description.length > 0 && seed.description.length <= 1000, seed.key);
    assert.ok(!seed.description.includes("·"), `${seed.key} has one neutral description`);
  }
});

it("validates every seeded template configuration against its renderer", () => {
  for (const seed of SEEDED_TEMPLATE_SEEDS) {
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
