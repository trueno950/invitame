import assert from "node:assert/strict";
import { it } from "node:test";

import {
  BABY_SHOWER_TEMPLATE_SEEDS,
  BAPTISM_ARCH_TEMPLATE_SEEDS,
  BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS,
  BAPTISM_TEMPLATE_SEEDS,
  BIRTHDAY_LAYOUT_TEMPLATE_SEEDS,
  ELEGANT_ARCH_TEMPLATE_SEEDS,
  ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS,
  WEDDING_ARCH_TEMPLATE_SEEDS,
  WEDDING_ORNAMENTAL_TEMPLATE_SEEDS,
  XV_ARCH_TEMPLATE_SEEDS,
  XV_ORNAMENTAL_TEMPLATE_SEEDS,
} from "../../../../prisma/catalog-seed";
import { BABY_SHOWER_THEMES } from "./baby-shower-themes";
import { BAPTISM_THEMES } from "./baptism-themes";
import { BIRTHDAY_THEMES } from "./birthday-themes";
import { ELEGANT_THEMES } from "./elegant-themes";
import { validateTemplateVersionContract } from "./renderer-registry";

// The seed's own constants, not a copy: a drift between a seeded version and the registry fails here. Every
// template the seed creates — 24 birthday, eight baby shower, six themed baptism (S8, S13), the 24 elegant
// arch templates (S4) and the 24 elegant ornamental templates (S5) — must satisfy the renderer contract of
// the key it names.

const SEEDED_TEMPLATE_SEEDS = [
  ...BIRTHDAY_LAYOUT_TEMPLATE_SEEDS,
  ...BABY_SHOWER_TEMPLATE_SEEDS,
  ...BAPTISM_TEMPLATE_SEEDS,
  ...ELEGANT_ARCH_TEMPLATE_SEEDS,
  ...ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS,
];

/** The Spanish display name of each elegant theme, in the board's order (S4). */
const ELEGANT_THEME_NAMES: Readonly<Record<string, string>> = {
  "blush-gold": "Rosa empolvado y oro",
  "ivory-black": "Marfil y negro",
  "midnight-gold": "Azul medianoche y oro",
  "olive-cream": "Verde olivo y crema",
  champagne: "Champaña",
  "lavender-silver": "Lavanda y plata",
  "terracotta-sage": "Terracota y salvia",
  "burgundy-gold": "Borgoña y oro",
};

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

it("seeds 86 templates: 24 birthday, eight baby shower, six themed baptism, and the two elegant lines", () => {
  assert.equal(BIRTHDAY_LAYOUT_TEMPLATE_SEEDS.length, 24);
  assert.equal(BABY_SHOWER_TEMPLATE_SEEDS.length, 8);
  assert.equal(BAPTISM_TEMPLATE_SEEDS.length, 6);
  assert.equal(XV_ARCH_TEMPLATE_SEEDS.length, 8);
  assert.equal(WEDDING_ARCH_TEMPLATE_SEEDS.length, 8);
  assert.equal(BAPTISM_ARCH_TEMPLATE_SEEDS.length, 8);
  assert.equal(ELEGANT_ARCH_TEMPLATE_SEEDS.length, 24);
  assert.equal(XV_ORNAMENTAL_TEMPLATE_SEEDS.length, 8);
  assert.equal(WEDDING_ORNAMENTAL_TEMPLATE_SEEDS.length, 8);
  assert.equal(BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS.length, 8);
  assert.equal(ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS.length, 24);
  assert.equal(SEEDED_TEMPLATE_SEEDS.length, 86);
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

  // The elegant line: one layout per occasion, each with the shared eight-theme allow-list (S4).
  for (const [layout, slug] of [
    ["xv-arch-01", "xv-arch"],
    ["wedding-arch-01", "wedding-arch"],
    ["baptism-arch-01", "baptism-arch"],
  ] as const) {
    assert.deepEqual(themesOf(ELEGANT_ARCH_TEMPLATE_SEEDS, layout), [...ELEGANT_THEMES], layout);
    for (const theme of ELEGANT_THEMES) {
      assert.ok(keys.includes(`${slug}-${theme}`), `${slug}/${theme}`);
    }
  }

  // The ornamental line: the same eight themes and the same occasions as «Arco y foto» (S5).
  for (const [layout, slug] of [
    ["xv-ornamental-01", "xv-ornamental"],
    ["wedding-ornamental-01", "wedding-ornamental"],
    ["baptism-ornamental-01", "baptism-ornamental"],
  ] as const) {
    assert.deepEqual(
      themesOf(ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS, layout),
      [...ELEGANT_THEMES],
      layout,
    );
    for (const theme of ELEGANT_THEMES) {
      assert.ok(keys.includes(`${slug}-${theme}`), `${slug}/${theme}`);
    }
  }

  for (const seed of BABY_SHOWER_TEMPLATE_SEEDS) {
    assert.match(seed.key, /^baby-shower-classic-[a-z]+(-[a-z]+)*$/, seed.key);
  }
  for (const seed of BAPTISM_TEMPLATE_SEEDS) {
    assert.match(seed.key, /^baptism-classic-[a-z]+(-[a-z]+)*$/, seed.key);
  }
  for (const seed of ELEGANT_ARCH_TEMPLATE_SEEDS) {
    assert.match(seed.key, /^(xv|wedding|baptism)-arch-[a-z]+(-[a-z]+)*$/, seed.key);
  }
  for (const seed of ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS) {
    assert.match(seed.key, /^(xv|wedding|baptism)-ornamental-[a-z]+(-[a-z]+)*$/, seed.key);
  }
});

it("names each template with its layout and theme and a short neutral description", () => {
  for (const seed of BIRTHDAY_LAYOUT_TEMPLATE_SEEDS) {
    assert.match(seed.name, /^(Mapa|Cartel|Cuento) · \S/, seed.key);
  }
  for (const seed of [...BABY_SHOWER_TEMPLATE_SEEDS, ...BAPTISM_TEMPLATE_SEEDS]) {
    assert.match(seed.name, /^Clásica · \S/, seed.key);
  }
  // Every elegant template carries the Spanish theme name the owner approved, never the key (S4).
  for (const seed of ELEGANT_ARCH_TEMPLATE_SEEDS) {
    assert.equal(seed.name, `Arco y foto · ${ELEGANT_THEME_NAMES[seed.theme]}`, seed.key);
  }
  for (const seed of ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS) {
    assert.equal(seed.name, `Ornamental · ${ELEGANT_THEME_NAMES[seed.theme]}`, seed.key);
  }
  for (const seed of SEEDED_TEMPLATE_SEEDS) {
    assert.ok(seed.name.length <= 120, seed.key);
    assert.ok(seed.description.length > 0 && seed.description.length <= 1000, seed.key);
    assert.ok(!seed.description.includes("·"), `${seed.key} has one neutral description`);
  }
});

it("ships one explicit schema per elegant occasion, shared by its eight themes (S4)", () => {
  for (const seeds of [
    XV_ARCH_TEMPLATE_SEEDS,
    WEDDING_ARCH_TEMPLATE_SEEDS,
    BAPTISM_ARCH_TEMPLATE_SEEDS,
    XV_ORNAMENTAL_TEMPLATE_SEEDS,
    WEDDING_ORNAMENTAL_TEMPLATE_SEEDS,
    BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS,
  ]) {
    const schemas = new Set(seeds.map((seed) => JSON.stringify(seed.schema)));

    assert.equal(schemas.size, 1, "one schema per occasion");
  }

  const schemasOf = (seeds: readonly { schema: unknown }[]) =>
    JSON.stringify(seeds[0]?.schema ?? null);

  assert.notEqual(
    schemasOf(XV_ARCH_TEMPLATE_SEEDS),
    schemasOf(WEDDING_ARCH_TEMPLATE_SEEDS),
    "XV años and weddings have their own content schema",
  );
  assert.equal(
    schemasOf(BAPTISM_ARCH_TEMPLATE_SEEDS),
    schemasOf(BAPTISM_TEMPLATE_SEEDS),
    "the formal baptism reuses the themed baptism schema exactly",
  );

  // The two elegant layouts of an occasion share one content contract, so no invitation migrates (S5).
  for (const [arch, ornamental] of [
    [XV_ARCH_TEMPLATE_SEEDS, XV_ORNAMENTAL_TEMPLATE_SEEDS],
    [WEDDING_ARCH_TEMPLATE_SEEDS, WEDDING_ORNAMENTAL_TEMPLATE_SEEDS],
    [BAPTISM_ARCH_TEMPLATE_SEEDS, BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS],
  ] as const) {
    assert.equal(
      schemasOf(ornamental),
      schemasOf(arch),
      "the ornamental layout reuses its arch sibling's schema exactly",
    );
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
