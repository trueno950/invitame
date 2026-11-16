import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BABY_SHOWER_THEME, BABY_SHOWER_THEMES } from "../renderers/baby-shower-themes.ts";
import { BAPTISM_THEME, BAPTISM_THEMES } from "../renderers/baptism-themes.ts";
import {
  BIRTHDAY_THEME,
  BIRTHDAY_THEMES,
  THEMED_LAYOUT_KEYS,
} from "../renderers/birthday-themes.ts";
import { ELEGANT_THEME, ELEGANT_THEMES } from "../renderers/elegant-themes.ts";
import type { CreatorTemplate } from "../server/invitations-api.ts";
import {
  findPreviewTarget,
  type LayoutCardView,
  previewPath,
  type TemplateCardView,
  templateChoiceCards,
} from "./template-preview.ts";

// The cards the chooser is built from (T9; S9, S10): one design per themed layout with one style per
// published version, grouped by the version's `componentKey` and labelled from its own
// `configuration.theme`, and a design of its own for every template without themes. The value the create
// form posts stays the published version id.

const ORIGIN = "https://invitame.test";
const VERSION_IDS = new Map<string, string>();
let versionCounter = 0;

/** A canonical UUID per test case, so the submitted value looks like the id the API publishes. */
function versionId(label: string): string {
  const known = VERSION_IDS.get(label);
  if (known !== undefined) {
    return known;
  }
  versionCounter += 1;
  const suffix = String(versionCounter).padStart(12, "0");
  const created = `0b6f3e0e-8c1e-4b8e-9a51-${suffix}`;
  VERSION_IDS.set(label, created);
  return created;
}

interface TemplateOptions {
  name?: string;
  category?: { key: string; name: string };
  description?: string | null;
  configuration?: unknown;
  version?: number;
}

function template(
  key: string,
  componentKey: string,
  options: TemplateOptions = {},
): CreatorTemplate {
  return {
    id: versionId(`template-${key}`),
    key,
    name: options.name ?? key,
    description: options.description ?? "Una plantilla",
    category: options.category ?? { key: "birthday", name: "Cumpleaños" },
    publishedVersion: {
      id: versionId(`version-${key}`),
      version: options.version ?? 1,
      componentKey,
      schema: { type: "object", required: [], properties: {} },
      configuration: options.configuration,
    },
  };
}

/** A template without themes: a renderer this catalog has no sample for, in another occasion. */
const WEDDING_STORY = template("boda-cuento", "wedding-story-01", {
  name: "Boda · Cuento",
  category: { key: "wedding", name: "Boda" },
  description: "Un cuento para una boda.",
});

/** The 24 seeded templates: three layouts times eight themes, as the seed creates them (S8). */
const SEEDED: CreatorTemplate[] = THEMED_LAYOUT_KEYS.flatMap((componentKey) =>
  BIRTHDAY_THEMES.map((theme) =>
    template(`birthday-${componentKey}-${theme}`, componentKey, {
      // A catalog name that agrees with nothing: the label must come from the configuration.
      name: `Plantilla ${theme}`,
      configuration: { componentKey, theme },
    }),
  ),
).sort((left, right) => left.key.localeCompare(right.key));

function layoutCards(cards: readonly TemplateCardView[]): LayoutCardView[] {
  return cards.filter((card): card is LayoutCardView => card.kind === "layout");
}

describe("templateChoiceCards", () => {
  it("groups the seeded catalog into one card per layout with one switch per theme", () => {
    const cards = templateChoiceCards([WEDDING_STORY, ...SEEDED], ORIGIN);

    assert.equal(cards.length, 4);
    assert.equal(cards[0]?.kind, "template");

    const layouts = layoutCards(cards);
    assert.deepEqual(
      layouts.map((card) => [card.componentKey, card.title]),
      [
        ["birthday-map-01", "Mapa"],
        ["birthday-poster-01", "Cartel"],
        ["birthday-story-01", "Cuento"],
      ],
    );
    for (const card of layouts) {
      assert.equal(card.options.length, 8, card.componentKey);
      assert.deepEqual(card.category, { key: "birthday", name: "Cumpleaños" });
      assert.notEqual(card.description.length, 0);
      assert.equal(new Set(card.options.map((option) => option.versionId)).size, 8);
    }
  });

  it("labels each switch with its own configuration theme, in the owner's theme order", () => {
    const layouts = layoutCards(templateChoiceCards([WEDDING_STORY, ...SEEDED], ORIGIN));

    for (const card of layouts) {
      assert.deepEqual(
        card.options.map((option) => option.label),
        BIRTHDAY_THEMES.map((theme) => BIRTHDAY_THEME[theme].displayName),
        card.componentKey,
      );
    }
  });

  it("takes the label from the configuration, never from the catalog name", () => {
    const cards = templateChoiceCards(
      [
        template("birthday-map-custom", "birthday-map-01", {
          name: "Mapa · Dinosaurios",
          configuration: { componentKey: "birthday-map-01", theme: "ice-kingdom" },
        }),
      ],
      ORIGIN,
    );

    const [card] = layoutCards(cards);
    assert.deepEqual(
      card?.options.map((option) => option.label),
      ["Reino de hielo"],
    );
  });

  it("submits the published version id of every choice", () => {
    const cards = templateChoiceCards([WEDDING_STORY, ...SEEDED], ORIGIN);
    const submitted = cards.flatMap((card) =>
      card.kind === "layout" ? card.options.map((option) => option.versionId) : [card.versionId],
    );
    const published = [WEDDING_STORY, ...SEEDED].map((stored) => stored.publishedVersion.id);

    assert.deepEqual([...submitted].sort(), [...published].sort());
    assert.equal(new Set(submitted).size, submitted.length);
  });

  it("gives a template without themes its own card, without a miniature its renderer cannot draw", () => {
    const cards = templateChoiceCards([WEDDING_STORY, ...SEEDED], ORIGIN);
    const [first] = cards;

    assert.equal(first?.kind, "template");
    assert.equal(
      first?.kind === "template" ? first.versionId : "",
      WEDDING_STORY.publishedVersion.id,
    );
    assert.equal(first?.kind === "template" ? first.title : "", "Boda · Cuento");
    // A design without themes keeps its own card; the sample it has no content for is simply absent.
    assert.equal(first?.kind === "template" ? first.sample : "unexpected", undefined);
  });

  it("gives a template of another category its own card, with a miniature only when its renderer takes the sample", () => {
    const cards = templateChoiceCards(
      [
        template("boda-cuento", "wedding-story-01", {
          name: "Boda · Cuento",
          category: { key: "wedding", name: "Boda" },
        }),
      ],
      ORIGIN,
    );

    assert.equal(cards.length, 1);
    const [card] = cards;
    assert.equal(card?.kind, "template");
    // Another renderer with another content shape: the card stays, without a miniature.
    assert.equal(card?.kind === "template" ? card.sample : "unexpected", undefined);
    assert.deepEqual(card?.kind === "template" ? card.category : undefined, {
      key: "wedding",
      name: "Boda",
    });
  });

  it("degrades safely for an unknown key or a drifted configuration", () => {
    const cards = templateChoiceCards(
      [
        template("plantilla-rara", "birthday-future-01"),
        template("mapa-sin-tema", "birthday-map-01", {
          configuration: { componentKey: "birthday-map-01", theme: "no-such-theme" },
        }),
        template("mapa-roto", "birthday-map-01"),
      ],
      ORIGIN,
    );

    assert.equal(cards.length, 3);
    assert.equal(layoutCards(cards).length, 0);
    for (const card of cards) {
      assert.equal(card.kind, "template");
      assert.equal(card.kind === "template" ? card.sample : "unexpected", undefined);
    }
  });

  it("groups every option by its own component key, never by a catalog name", () => {
    const cards = templateChoiceCards(SEEDED, ORIGIN);
    const byVersion = new Map(
      SEEDED.map((stored) => [stored.publishedVersion.id, stored.publishedVersion.componentKey]),
    );

    assert.equal(cards.length, 3);
    for (const card of layoutCards(cards)) {
      assert.deepEqual(
        [...new Set(card.options.map((option) => byVersion.get(option.versionId)))],
        [card.componentKey],
      );
    }
  });
});

describe("findPreviewTarget", () => {
  const templates = [WEDDING_STORY, ...SEEDED];

  it("finds the template and the sample of a published version", () => {
    const themed = SEEDED[0] as CreatorTemplate;
    const target = findPreviewTarget(templates, themed.publishedVersion.id, ORIGIN);

    assert.equal(target?.template, themed);
    assert.notEqual(target?.sample, undefined);
  });

  it("answers nothing for an id the creator catalog does not publish", () => {
    for (const id of [
      "",
      "no-es-un-id",
      "0b6f3e0e-8c1e-4b8e-9a51-000000000000",
      WEDDING_STORY.id,
      "constructor",
      "__proto__",
    ]) {
      assert.equal(findPreviewTarget(templates, id, ORIGIN), undefined, id);
    }
  });

  it("answers nothing when the renderer refuses the sample", () => {
    const drifted = template("boda-cuento", "wedding-story-01", {
      category: { key: "wedding", name: "Boda" },
    });

    assert.equal(findPreviewTarget([drifted], drifted.publishedVersion.id, ORIGIN), undefined);
  });
});

describe("previewPath", () => {
  it("builds the signed-in preview page of a version", () => {
    const version = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";

    assert.equal(previewPath(version), `/cuenta/invitaciones/nueva/vista/${version}`);
    assert.equal(previewPath("a/b?c"), "/cuenta/invitaciones/nueva/vista/a%2Fb%3Fc");
  });
});

// A second occasion (T7c; S13): its one layout groups by `componentKey` exactly like the birthday ones, so the
// chooser never needs a name or a key written into it for a new occasion.

const BABY_SHOWER_CATEGORY = { key: "baby-shower", name: "Baby shower" };
const BAPTISM_CATEGORY = { key: "baptism", name: "Bautizo" };

const BABY_SHOWER_SEEDED: CreatorTemplate[] = BABY_SHOWER_THEMES.map((theme) =>
  template(`baby-shower-classic-01-${theme}`, "baby-shower-classic-01", {
    name: `Clásica · ${BABY_SHOWER_THEME[theme].displayName}`,
    category: BABY_SHOWER_CATEGORY,
    configuration: { componentKey: "baby-shower-classic-01", theme },
  }),
);

const QUINCEANERA_CATEGORY = { key: "quinceanera", name: "XV años" };
const WEDDING_CATEGORY = { key: "wedding", name: "Boda" };

/** The 24 elegant templates: three arch layouts times eight themes (E3c; S4). */
function elegantSeed(
  componentKey: "xv-arch-01" | "wedding-arch-01" | "baptism-arch-01",
  category: { key: string; name: string },
): CreatorTemplate[] {
  return ELEGANT_THEMES.map((theme) =>
    template(`${componentKey}-${theme}`, componentKey, {
      name: `Arco y foto · ${ELEGANT_THEME[theme].displayName}`,
      category,
      configuration: { componentKey, theme },
    }),
  );
}

describe("elegant occasion cards", () => {
  it("groups each arch layout into one card titled «Arco y foto» with its eight themes", () => {
    for (const [componentKey, seed, category] of [
      ["xv-arch-01", elegantSeed("xv-arch-01", QUINCEANERA_CATEGORY), QUINCEANERA_CATEGORY],
      ["wedding-arch-01", elegantSeed("wedding-arch-01", WEDDING_CATEGORY), WEDDING_CATEGORY],
      ["baptism-arch-01", elegantSeed("baptism-arch-01", BAPTISM_CATEGORY), BAPTISM_CATEGORY],
    ] as const) {
      const cards = templateChoiceCards(seed, ORIGIN);

      assert.equal(cards.length, 1, componentKey);
      const [card] = cards;

      assert.equal(card?.kind, "layout");
      if (card?.kind !== "layout") {
        continue;
      }
      assert.equal(card.componentKey, componentKey);
      assert.equal(card.title, "Arco y foto");
      assert.notEqual(card.description.length, 0);
      assert.deepEqual(card.category, category);
      assert.deepEqual(
        card.options.map((option) => option.label),
        ELEGANT_THEMES.map((theme) => ELEGANT_THEME[theme].displayName),
      );
      assert.equal(
        card.options.every((option) => option.sample !== undefined),
        true,
      );
    }
  });

  it("shows two baptism designs: the themed Clásica and the elegant Arco y foto", () => {
    const seeds = [
      ...BAPTISM_THEMES.map((theme) =>
        template(`baptism-classic-01-${theme}`, "baptism-classic-01", {
          name: `Clásica · ${BAPTISM_THEME[theme].displayName}`,
          category: BAPTISM_CATEGORY,
          configuration: { componentKey: "baptism-classic-01", theme },
        }),
      ),
      ...elegantSeed("baptism-arch-01", BAPTISM_CATEGORY),
    ];

    const cards = templateChoiceCards(seeds, ORIGIN);

    assert.deepEqual(
      cards.map((card) => [
        card.kind,
        card.kind === "layout" ? card.componentKey : "",
        card.kind === "layout" ? card.title : "",
      ]),
      [
        ["layout", "baptism-classic-01", "Clásica"],
        ["layout", "baptism-arch-01", "Arco y foto"],
      ],
    );
    assert.deepEqual(
      cards.map((card) => (card.kind === "layout" ? card.options.length : 0)),
      [BAPTISM_THEMES.length, ELEGANT_THEMES.length],
    );
  });
});

describe("celebration occasion cards", () => {
  it("groups the single baby shower layout into one card with its eight themes", () => {
    const cards = templateChoiceCards(BABY_SHOWER_SEEDED, ORIGIN);

    assert.equal(cards.length, 1);
    const [card] = cards;

    assert.equal(card?.kind, "layout");
    if (card?.kind !== "layout") {
      return;
    }
    assert.equal(card.componentKey, "baby-shower-classic-01");
    assert.equal(card.title, "Clásica");
    assert.notEqual(card.description.length, 0);
    assert.deepEqual(card.category, BABY_SHOWER_CATEGORY);
    assert.deepEqual(
      card.options.map((option) => option.label),
      BABY_SHOWER_THEMES.map((theme) => BABY_SHOWER_THEME[theme].displayName),
    );
    for (const option of card.options) {
      assert.notEqual(option.sample, undefined, option.label);
    }
  });
});
