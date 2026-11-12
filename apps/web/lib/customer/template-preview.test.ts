import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BIRTHDAY_THEME,
  BIRTHDAY_THEMES,
  THEMED_LAYOUT_KEYS,
} from "../renderers/birthday-themes.ts";
import type { CreatorTemplate } from "../server/invitations-api.ts";
import {
  checkedVersionId,
  findPreviewTarget,
  type LayoutCardView,
  previewPath,
  previewSwitchCss,
  type TemplateCardView,
  templateChoiceCards,
} from "./template-preview.ts";

// The chooser's cards (T9; S9): one card per themed layout with one theme switch per published version,
// grouped by the version's `componentKey` and labelled from its own `configuration.theme`, and a card of its
// own for every template without themes. The submitted value stays the published version id.

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

const ADVENTURE = template("birthday-adventure", "birthday-adventure-01", {
  name: "Birthday Adventure",
  configuration: {
    componentKey: "birthday-adventure-01",
    layout: "adventure",
    palette: "sunset",
    typography: "rounded",
    sectionOrder: ["hero", "details", "message"],
  },
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
    const cards = templateChoiceCards([ADVENTURE, ...SEEDED], ORIGIN);

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
      assert.equal(card.meta, "Cumpleaños");
      assert.notEqual(card.description.length, 0);
      assert.equal(new Set(card.options.map((option) => option.versionId)).size, 8);
    }
  });

  it("labels each switch with its own configuration theme, in the owner's theme order", () => {
    const layouts = layoutCards(templateChoiceCards([ADVENTURE, ...SEEDED], ORIGIN));

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
    const cards = templateChoiceCards([ADVENTURE, ...SEEDED], ORIGIN);
    const submitted = cards.flatMap((card) =>
      card.kind === "layout" ? card.options.map((option) => option.versionId) : [card.versionId],
    );
    const published = [ADVENTURE, ...SEEDED].map((stored) => stored.publishedVersion.id);

    assert.deepEqual([...submitted].sort(), [...published].sort());
    assert.equal(new Set(submitted).size, submitted.length);
  });

  it("gives a template without themes its own card with its own miniature", () => {
    const cards = templateChoiceCards([ADVENTURE, ...SEEDED], ORIGIN);
    const [first] = cards;

    assert.equal(first?.kind, "template");
    assert.equal(first?.kind === "template" ? first.versionId : "", ADVENTURE.publishedVersion.id);
    assert.equal(first?.kind === "template" ? first.title : "", "Birthday Adventure");
    assert.notEqual(first?.kind === "template" ? first.sample : undefined, undefined);
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
    assert.equal(card?.kind === "template" ? card.meta : "", "Boda");
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

describe("checkedVersionId", () => {
  const cards = templateChoiceCards([ADVENTURE, ...SEEDED], ORIGIN);

  it("selects the first template of the first card by default, as the chooser always did", () => {
    assert.equal(checkedVersionId(cards), ADVENTURE.publishedVersion.id);
  });

  it("selects the requested version when the form was sent back with one", () => {
    const [mapCard] = layoutCards(cards);
    const wanted = mapCard?.options[3]?.versionId;

    assert.notEqual(wanted, undefined);
    assert.equal(checkedVersionId(cards, wanted), wanted);
  });

  it("falls back to the default for a version the catalog does not publish", () => {
    assert.equal(
      checkedVersionId(cards, "0b6f3e0e-8c1e-4b8e-9a51-000000000000"),
      ADVENTURE.publishedVersion.id,
    );
    assert.equal(checkedVersionId([], undefined), undefined);
  });
});

describe("previewSwitchCss", () => {
  const [mapCard] = layoutCards(templateChoiceCards([ADVENTURE, ...SEEDED], ORIGIN));

  it("hides every miniature and shows the one of the checked theme", () => {
    assert.notEqual(mapCard, undefined);
    const css = previewSwitchCss(mapCard as LayoutCardView);
    const [hidden, ...switches] = css.split("\n");

    // One rule hides every miniature and every link of the card; then each theme shows its own.
    assert.match(hidden ?? "", /\{display:none\}$/);
    assert.ok((hidden ?? "").includes('[data-miniature="'));
    assert.ok((hidden ?? "").includes('[data-preview-link="'));
    // One rule per theme and element, plus the fallback of the first theme while the card is unchosen.
    assert.equal(switches.length, (mapCard as LayoutCardView).options.length * 2 + 2);
    const first = (mapCard as LayoutCardView).options[0];
    assert.ok(
      css.includes(
        `:not(:has([data-theme-choice]:checked)) [data-miniature="${first?.versionId}"]{display:block}`,
      ),
    );

    for (const option of (mapCard as LayoutCardView).options) {
      assert.ok(
        css.includes(
          `:has([data-theme-choice="${option.versionId}"]:checked) [data-miniature="${option.versionId}"]{display:block}`,
        ),
        option.versionId,
      );
      assert.ok(
        css.includes(
          `:has([data-theme-choice="${option.versionId}"]:checked) [data-preview-link="${option.versionId}"]{display:inline-flex}`,
        ),
        option.versionId,
      );
    }
  });

  it("scopes every rule to its own card, so two cards never switch each other", () => {
    const layouts = layoutCards(templateChoiceCards([ADVENTURE, ...SEEDED], ORIGIN));

    for (const card of layouts) {
      const css = previewSwitchCss(card);
      const selectors = css.split("\n").filter((line) => line.includes(":has("));

      assert.notEqual(selectors.length, 0);
      for (const selector of selectors) {
        assert.ok(
          selector.startsWith(`[data-preview-group="${card.groupId}"]`),
          `${card.componentKey}: ${selector}`,
        );
      }
    }
    assert.equal(new Set(layouts.map((card) => card.groupId)).size, layouts.length);
  });
});

describe("findPreviewTarget", () => {
  const templates = [ADVENTURE, ...SEEDED];

  it("finds the template and the sample of a published version", () => {
    const target = findPreviewTarget(templates, ADVENTURE.publishedVersion.id, ORIGIN);

    assert.equal(target?.template, ADVENTURE);
    assert.notEqual(target?.sample, undefined);
  });

  it("answers nothing for an id the creator catalog does not publish", () => {
    for (const id of [
      "",
      "no-es-un-id",
      "0b6f3e0e-8c1e-4b8e-9a51-000000000000",
      ADVENTURE.id,
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
    assert.equal(
      previewPath(ADVENTURE.publishedVersion.id),
      `/cuenta/invitaciones/nueva/vista/${ADVENTURE.publishedVersion.id}`,
    );
    assert.equal(previewPath("a/b?c"), "/cuenta/invitaciones/nueva/vista/a%2Fb%3Fc");
  });
});

describe("the chooser renders without client script", () => {
  const sources = [
    new URL("../../app/cuenta/invitaciones/nueva/page.tsx", import.meta.url),
    new URL("../../app/cuenta/invitaciones/nueva/vista/[versionId]/page.tsx", import.meta.url),
    new URL("../../app/cuenta/invitaciones/_components/template-choice-card.tsx", import.meta.url),
  ];

  it("uses no client component and no inline event handler", () => {
    for (const source of sources) {
      const text = readFileSync(source, "utf8");

      assert.doesNotMatch(text, /^\s*["']use client["']/m, source.pathname);
      assert.doesNotMatch(text, /\son[A-Z][a-zA-Z]*=/, source.pathname);
    }
  });
});
