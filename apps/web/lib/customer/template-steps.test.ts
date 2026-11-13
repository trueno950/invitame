import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BIRTHDAY_THEME,
  BIRTHDAY_THEMES,
  THEMED_LAYOUT_KEYS,
} from "../renderers/birthday-themes.ts";
import type { CreatorPackage, CreatorTemplate } from "../server/invitations-api.ts";
import { type ChoiceCard, packageChoices } from "./invitations.ts";
import { templateChoiceCards } from "./template-preview.ts";
import {
  backHref,
  type ChooserQuery,
  type ChooserState,
  chooserOccasions,
  continueHref,
  DESIGN_PARAM,
  draftChoice,
  OCCASION_PARAM,
  PACKAGE_PARAM,
  resolveChooserStep,
  STEP_PARAM,
  selectionSummary,
  stepHref,
  THEME_PARAM,
  themeStepPath,
} from "./template-steps.ts";

// The «Paso a paso» template chooser (T10b; S9, S10). Every step is a server URL with no client script:
// the design, the theme, and the package travel in the query, and the page resolves what it can trust out
// of the creator catalog. An unknown or stale value never renders an error page; it falls back to the
// nearest step that still holds, and the submitted value is still the published version id.

const ORIGIN = "https://invitame.test";
const BIRTHDAY = { key: "birthday", name: "Cumpleaños" };
const WEDDING = { key: "wedding", name: "Boda" };

const VERSION_IDS = new Map<string, string>();
let versionCounter = 0;

/** A canonical UUID per test case, so the submitted value looks like the id the API publishes. */
function versionId(label: string): string {
  const known = VERSION_IDS.get(label);
  if (known !== undefined) {
    return known;
  }
  versionCounter += 1;
  const created = `0b6f3e0e-8c1e-4b8e-9a51-${String(versionCounter).padStart(12, "0")}`;
  VERSION_IDS.set(label, created);
  return created;
}

interface TemplateOptions {
  name?: string;
  category?: { key: string; name: string };
  description?: string | null;
  configuration?: unknown;
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
    category: options.category ?? BIRTHDAY,
    publishedVersion: {
      id: versionId(`version-${key}`),
      version: 1,
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
      // The catalog name carries the theme; the chooser reads the configuration instead.
      name: `${componentKey} ${theme}`,
      configuration: { componentKey, theme },
    }),
  ),
).sort((left, right) => left.key.localeCompare(right.key));

/** A template of another occasion: its own card, its own single style, and no themed miniature. */
const WEDDING_STORY = template("boda-cuento", "wedding-story-01", {
  name: "Boda · Cuento",
  category: WEDDING,
  description: "Un cuento para una boda.",
});

const CATALOG = [ADVENTURE, ...SEEDED];

function packagesFixture(): ChoiceCard[] {
  const stored: CreatorPackage[] = [
    {
      id: "3f0b8a1e-6f3d-4c56-9a10-000000000001",
      key: "basic",
      name: "../packages/basic",
      description: "Una selección inicial para empezar a planificar.",
      currentPrice: { amountMinor: 10000, currency: "MXN" },
      includedFeatureKeys: [],
    },
    {
      id: "3f0b8a1e-6f3d-4c56-9a10-000000000002",
      key: "deluxe",
      name: "Deluxe",
      description: "El catálogo más amplio para celebraciones con más necesidades.",
      currentPrice: { amountMinor: 20000, currency: "MXN" },
      includedFeatureKeys: [],
    },
    {
      id: "3f0b8a1e-6f3d-4c56-9a10-000000000003",
      key: "premium",
      name: "Premium",
      description: "Más recursos para una experiencia visual completa.",
      currentPrice: { amountMinor: 30000, currency: "MXN" },
      includedFeatureKeys: [],
    },
  ];

  return packageChoices(stored);
}

const PACKAGES = packagesFixture();

function occasionsOf(catalog: readonly CreatorTemplate[] = CATALOG) {
  return chooserOccasions(templateChoiceCards(catalog, ORIGIN));
}

const OCCASIONS = occasionsOf();

function resolve(
  query: ChooserQuery,
  options: { occasions?: ReturnType<typeof occasionsOf>; packages?: ChoiceCard[] } = {},
): ChooserState {
  return resolveChooserStep(options.occasions ?? OCCASIONS, options.packages ?? PACKAGES, query);
}

/** The published version id of one seeded theme of one layout, as the catalog answers it. */
function themeVersion(componentKey: string, theme: string): string {
  const stored = SEEDED.find(
    (candidate) =>
      candidate.publishedVersion.componentKey === componentKey &&
      (candidate.publishedVersion.configuration as { theme: string }).theme === theme,
  );

  assert.notEqual(stored, undefined, `${componentKey} ${theme}`);
  return (stored as CreatorTemplate).publishedVersion.id;
}

describe("chooserOccasions", () => {
  it("keeps one occasion with the four designs in catalog order", () => {
    assert.equal(OCCASIONS.length, 1);
    const [birthday] = OCCASIONS;
    assert.equal(birthday?.key, "birthday");
    assert.equal(birthday?.name, "Cumpleaños");
    assert.deepEqual(
      birthday?.designs.map((design) => design.componentKey),
      ["birthday-adventure-01", ...THEMED_LAYOUT_KEYS],
    );
    assert.deepEqual(
      birthday?.designs.map((design) => design.title),
      ["Birthday Adventure", "Mapa", "Cartel", "Cuento"],
    );
  });

  it("gives every layout its eight styles, labelled and ordered by the theme board", () => {
    const designs = OCCASIONS[0]?.designs ?? [];

    for (const design of designs.filter(
      (candidate) => candidate.componentKey !== "birthday-adventure-01",
    )) {
      assert.equal(design.styles.length, 8, design.componentKey);
      assert.deepEqual(
        design.styles.map((style) => style.label),
        BIRTHDAY_THEMES.map((theme) => BIRTHDAY_THEME[theme].displayName),
        design.componentKey,
      );
      assert.equal(new Set(design.styles.map((style) => style.versionId)).size, 8);
      // A comparable miniature needs the real renderer's props for each style.
      assert.equal(
        design.styles.every((style) => style.sample !== undefined),
        true,
        design.componentKey,
      );
    }
  });

  it("gives a design without themes a single style and its own miniature", () => {
    const adventure = OCCASIONS[0]?.designs[0];

    assert.equal(adventure?.styles.length, 1);
    assert.equal(adventure?.styles[0]?.label, "Estilo único");
    assert.equal(adventure?.styles[0]?.versionId, ADVENTURE.publishedVersion.id);
    assert.notEqual(adventure?.styles[0]?.sample, undefined);
  });

  it("groups by the version's category, never by a catalog name", () => {
    const occasions = occasionsOf([ADVENTURE, WEDDING_STORY, ...SEEDED]);

    assert.deepEqual(
      occasions.map((occasion) => [occasion.key, occasion.name]),
      [
        ["birthday", "Cumpleaños"],
        ["wedding", "Boda"],
      ],
    );
    assert.deepEqual(
      occasions[1]?.designs.map((design) => design.componentKey),
      ["wedding-story-01"],
    );
    // A renderer this catalog has no sample for keeps its style, without a miniature.
    assert.equal(occasions[1]?.designs[0]?.styles[0]?.sample, undefined);
  });

  it("answers no occasion when nothing is published", () => {
    assert.deepEqual(chooserOccasions([]), []);
  });
});

describe("resolveChooserStep", () => {
  it("opens on step 1 with the first occasion and the first package, and nothing chosen", () => {
    const state = resolve({});

    assert.equal(state.step, 1);
    assert.equal(state.occasion, OCCASIONS[0]);
    assert.equal(state.design, undefined);
    assert.equal(state.style, undefined);
    assert.equal(state.package, PACKAGES[0]);
  });

  it("moves to step 2 with the design the query names and its first style", () => {
    const state = resolve({ [DESIGN_PARAM]: "birthday-poster-01" });

    assert.equal(state.step, 2);
    assert.equal(state.design?.componentKey, "birthday-poster-01");
    assert.equal(state.style?.versionId, themeVersion("birthday-poster-01", BIRTHDAY_THEMES[0]));
  });

  it("reads the design and the theme out of the published version id", () => {
    const version = themeVersion("birthday-story-01", "dinosaurs");
    const state = resolve({ [THEME_PARAM]: version });

    assert.equal(state.step, 2);
    assert.equal(state.design?.componentKey, "birthday-story-01");
    assert.equal(state.style?.versionId, version);
    assert.equal(state.style?.label, "Dinosaurios");
  });

  it("keeps the design and the theme when the query goes back to step 1", () => {
    const version = themeVersion("birthday-map-01", "under-the-sea");
    const state = resolve({ [STEP_PARAM]: "1", [THEME_PARAM]: version });

    assert.equal(state.step, 1);
    assert.equal(state.design?.componentKey, "birthday-map-01");
    assert.equal(state.style?.label, "Bajo el mar");
  });

  it("opens step 3 only when a published version is chosen", () => {
    const version = themeVersion("birthday-poster-01", "fairytale-princess");
    const chosen = PACKAGES[2];

    assert.equal(resolve({ [STEP_PARAM]: "3" }).step, 1);
    assert.equal(resolve({ [STEP_PARAM]: "3", [DESIGN_PARAM]: "birthday-poster-01" }).step, 2);

    const state = resolve({
      [STEP_PARAM]: "3",
      [THEME_PARAM]: version,
      [PACKAGE_PARAM]: chosen?.value ?? "",
    });
    assert.equal(state.step, 3);
    assert.equal(state.package, chosen);
  });

  it("falls back to the nearest step for an unknown or stale design and version", () => {
    const stale = "0b6f3e0e-8c1e-4b8e-9a51-000000000000";

    assert.equal(resolve({ [DESIGN_PARAM]: "no-such-layout" }).step, 1);
    assert.equal(resolve({ [DESIGN_PARAM]: "no-such-layout" }).design, undefined);
    assert.equal(resolve({ [THEME_PARAM]: stale }).step, 1);
    assert.equal(resolve({ [THEME_PARAM]: stale }).style, undefined);
    // A stale version next to a valid design only loses the version, never the step the design allows.
    const keptDesign = resolve({ [DESIGN_PARAM]: "birthday-map-01", [THEME_PARAM]: stale });
    assert.equal(keptDesign.step, 2);
    assert.equal(keptDesign.style?.versionId, themeVersion("birthday-map-01", BIRTHDAY_THEMES[0]));
    // The opposite way: a stale design next to a valid version keeps the version's own design.
    const keptVersion = resolve({
      [DESIGN_PARAM]: "no-such-layout",
      [THEME_PARAM]: themeVersion("birthday-story-01", "rescue-team"),
    });
    assert.equal(keptVersion.step, 2);
    assert.equal(keptVersion.design?.componentKey, "birthday-story-01");
  });

  it("drops a version that belongs to another design than the one the query names", () => {
    const version = themeVersion("birthday-map-01", "ice-kingdom");
    const state = resolve({ [DESIGN_PARAM]: "birthday-poster-01", [THEME_PARAM]: version });

    assert.equal(state.step, 2);
    assert.equal(state.design?.componentKey, "birthday-poster-01");
    assert.equal(state.style?.versionId, themeVersion("birthday-poster-01", BIRTHDAY_THEMES[0]));
  });

  it("refuses a step number it does not know and a repeated parameter", () => {
    for (const step of ["0", "4", "abc", "", "-1", "2.5"]) {
      assert.equal(resolve({ [STEP_PARAM]: step }).step, 1, step);
      assert.equal(
        resolve({ [STEP_PARAM]: step, [DESIGN_PARAM]: "birthday-map-01" }).step,
        2,
        step,
      );
    }
    assert.equal(resolve({ [STEP_PARAM]: ["2", "3"] }).step, 1);
    assert.equal(resolve({ [THEME_PARAM]: ["a", "b"] }).style, undefined);
  });

  it("keeps the first package for an unknown package id", () => {
    const state = resolve({
      [STEP_PARAM]: "3",
      [THEME_PARAM]: themeVersion("birthday-map-01", "dinosaurs"),
      [PACKAGE_PARAM]: "3f0b8a1e-6f3d-4c56-9a10-0000000000ff",
    });

    assert.equal(state.step, 3);
    assert.equal(state.package, PACKAGES[0]);
  });

  it("follows the occasion of the published version, and never mixes two occasions", () => {
    const occasions = occasionsOf([ADVENTURE, WEDDING_STORY, ...SEEDED]);
    const version = themeVersion("birthday-map-01", "classic-mouse");

    const wedding = resolve({ [OCCASION_PARAM]: "wedding" }, { occasions });
    assert.equal(wedding.occasion?.key, "wedding");
    assert.equal(wedding.design, undefined);
    assert.equal(wedding.step, 1);

    const keptVersion = resolve({ [THEME_PARAM]: version }, { occasions });
    assert.equal(keptVersion.occasion?.key, "birthday");

    const conflict = resolve(
      { [OCCASION_PARAM]: "wedding", [THEME_PARAM]: version },
      { occasions },
    );
    assert.equal(conflict.occasion?.key, "wedding");
    assert.equal(conflict.style, undefined);
    assert.equal(conflict.step, 1);

    const unknown = resolve({ [OCCASION_PARAM]: "no-such-occasion" }, { occasions });
    assert.equal(unknown.occasion?.key, "birthday");
  });

  it("answers step 1 with no design when the catalog is empty", () => {
    const empty = resolve(
      { [THEME_PARAM]: "0b6f3e0e-8c1e-4b8e-9a51-000000000000" },
      {
        occasions: [],
        packages: [],
      },
    );

    assert.equal(empty.step, 1);
    assert.equal(empty.occasion, undefined);
    assert.equal(empty.design, undefined);
    assert.equal(empty.package, undefined);
    assert.equal(continueHref(empty), undefined);
    assert.equal(draftChoice(empty), undefined);
    assert.equal(selectionSummary(empty), undefined);
  });
});

describe("step-2 theme list", () => {
  it("offers the eight themes of the chosen layout, each with its own sample", () => {
    for (const componentKey of THEMED_LAYOUT_KEYS) {
      const state = resolve({ [DESIGN_PARAM]: componentKey });
      const styles = state.design?.styles ?? [];

      assert.equal(styles.length, 8, componentKey);
      assert.deepEqual(
        styles.map((style) => style.label),
        BIRTHDAY_THEMES.map((theme) => BIRTHDAY_THEME[theme].displayName),
        componentKey,
      );
      for (const style of styles) {
        assert.notEqual(style.sample, undefined, `${componentKey} ${style.label}`);
      }
    }
  });

  it("offers the single style of a design without themes, and stays on that step", () => {
    const state = resolve({ [DESIGN_PARAM]: "birthday-adventure-01" });

    assert.equal(state.step, 2);
    assert.equal(state.design?.styles.length, 1);
    assert.equal(state.style?.label, "Estilo único");
    assert.equal(state.style?.versionId, ADVENTURE.publishedVersion.id);
  });
});

describe("stepHref", () => {
  it("keeps every selection in a stable order", () => {
    const state = resolve({
      [OCCASION_PARAM]: "birthday",
      [THEME_PARAM]: themeVersion("birthday-map-01", "blocks-and-pixels"),
      [PACKAGE_PARAM]: PACKAGES[1]?.value ?? "",
    });

    assert.equal(
      stepHref(state, 3),
      `/cuenta/invitaciones/nueva?paso=3&ocasion=birthday&diseno=birthday-map-01&tema=${themeVersion("birthday-map-01", "blocks-and-pixels")}&paquete=${PACKAGES[1]?.value ?? ""}`,
    );
    // A hand-made selection with no occasion still answers a usable URL.
    assert.equal(
      stepHref({ design: state.design }, 2),
      `/cuenta/invitaciones/nueva?paso=2&diseno=birthday-map-01`,
    );
  });

  it("goes back one step with the selection kept, and offers no back link on step 1", () => {
    const third = resolve({
      [STEP_PARAM]: "3",
      [THEME_PARAM]: themeVersion("birthday-poster-01", "dinosaurs"),
      [PACKAGE_PARAM]: PACKAGES[2]?.value ?? "",
    });
    const second = resolve({ [THEME_PARAM]: themeVersion("birthday-poster-01", "dinosaurs") });

    assert.equal(backHref(third), stepHref(third, 2));
    assert.ok(backHref(third)?.includes(`tema=${themeVersion("birthday-poster-01", "dinosaurs")}`));
    assert.ok(backHref(third)?.includes(`paquete=${PACKAGES[2]?.value ?? ""}`));
    assert.equal(backHref(second), stepHref(second, 1));
    assert.ok(backHref(second)?.includes("diseno=birthday-poster-01"));
    assert.equal(backHref(resolve({ [STEP_PARAM]: "1" })), undefined);
  });

  it("goes forward with one choice made, so a step is never a dead end", () => {
    const continueToTheme = continueHref(resolve({}));

    assert.equal(
      continueToTheme,
      `/cuenta/invitaciones/nueva?paso=2&ocasion=birthday&diseno=birthday-adventure-01&tema=${ADVENTURE.publishedVersion.id}&paquete=${PACKAGES[0]?.value ?? ""}`,
    );
    assert.equal(resolve({}).style, undefined);

    const second = resolve({ [DESIGN_PARAM]: "birthday-map-01" });
    assert.ok(continueHref(second)?.startsWith("/cuenta/invitaciones/nueva?paso=3&"));
    assert.ok(continueHref(second)?.includes(`tema=${second.style?.versionId ?? ""}`));
    // Step 3 is the form itself: the page renders the submit button, not a link.
    assert.equal(
      continueHref(resolve({ [STEP_PARAM]: "3", [THEME_PARAM]: second.style?.versionId ?? "" })),
      undefined,
    );
  });

  it("builds the way back from the full preview to the theme step", () => {
    const version = themeVersion("birthday-map-01", "spider-hero");
    const state = resolve({ [THEME_PARAM]: version });

    assert.equal(themeStepPath(version), stepHref({ style: state.style }, 2));
    assert.equal(themeStepPath(version), `/cuenta/invitaciones/nueva?paso=2&tema=${version}`);
  });
});

describe("draftChoice", () => {
  it("posts the published version id and the chosen package", () => {
    const version = themeVersion("birthday-poster-01", "rescue-team");
    const state = resolve({
      [STEP_PARAM]: "3",
      [THEME_PARAM]: version,
      [PACKAGE_PARAM]: PACKAGES[1]?.value ?? "",
    });

    assert.deepEqual(draftChoice(state), {
      templateVersionId: version,
      packageId: PACKAGES[1]?.value,
    });
    // The submitted value is a version id, never a template id, a key, or a catalog name.
    assert.notEqual(draftChoice(state)?.templateVersionId, SEEDED[0]?.id);
  });

  it("answers nothing without a style or a package", () => {
    assert.equal(draftChoice(resolve({})), undefined);
    assert.equal(
      draftChoice(
        resolve({ [THEME_PARAM]: themeVersion("birthday-map-01", "dinosaurs") }, { packages: [] }),
      ),
      undefined,
    );
  });
});

describe("selectionSummary", () => {
  it("names the design, the theme, and the package the way the artboard does", () => {
    const version = themeVersion("birthday-poster-01", "dinosaurs");

    assert.equal(selectionSummary(resolve({ [THEME_PARAM]: version })), "Cartel · Dinosaurios");
    assert.equal(
      selectionSummary(
        resolve({
          [STEP_PARAM]: "3",
          [THEME_PARAM]: version,
          [PACKAGE_PARAM]: PACKAGES[1]?.value ?? "",
        }),
      ),
      "Cartel · Dinosaurios · Deluxe",
    );
    assert.equal(
      selectionSummary(resolve({ [STEP_PARAM]: "1", [DESIGN_PARAM]: "birthday-map-01" })),
      "Mapa",
    );
  });
});

describe("the chooser renders without client script", () => {
  const chooser = new URL("../../app/cuenta/invitaciones/", import.meta.url);
  const sources = [
    ...directorySources(new URL("nueva/", chooser)),
    fileURLToPath(new URL("_components/template-choice-card.tsx", chooser)),
    fileURLToPath(new URL("_components/chooser-stepper.tsx", chooser)),
  ];

  it("reads the page and its step components", () => {
    assert.ok(sources.length >= 4, sources.join(", "));
    assert.ok(sources.some((path) => path.endsWith("nueva/page.tsx")));
  });

  it("uses no client component, no script tag, and no inline event handler", () => {
    for (const path of sources) {
      const text = readFileSync(path, "utf8");

      assert.doesNotMatch(text, /^\s*["']use client["']/m, path);
      assert.doesNotMatch(text, /<script/, path);
      assert.doesNotMatch(text, /\son[A-Z][a-zA-Z]*=/, path);
    }
  });

  it("posts the two fields the create action already validates", () => {
    const text = readFileSync(fileURLToPath(new URL("nueva/page.tsx", chooser)), "utf8");

    assert.match(text, /action=\{createInvitationAction\}/);
    assert.match(text, /name=\{TEMPLATE_FIELD_NAME\}/);
    assert.match(text, /value=\{draft\.templateVersionId\}/);
    assert.match(text, /name="packageId"/);
  });

  it("keeps the empty-catalog, missing-package, and unavailable states", () => {
    const text = readFileSync(fileURLToPath(new URL("nueva/page.tsx", chooser)), "utf8");

    // The notice of the last action still comes from the shared query parser and renders server-side.
    assert.match(text, /invitationPageNotices\(parameters\)/);
    assert.match(text, /<Notices error=\{notices\.error\} notice=\{notices\.notice\} \/>/);
    assert.match(text, /INVITATION_COPY\.noTemplates/);
    assert.match(text, /INVITATION_COPY\.noPackages/);
    assert.match(text, /INVITATION_COPY\.unavailableBody/);
    assert.match(text, /INVITATION_COPY\.retry/);
  });
});

/** Every TypeScript source under one directory, recursively, in a stable order. */
function directorySources(directory: URL): string[] {
  return readdirSync(directory, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith(".tsx") || entry.endsWith(".ts"))
    .sort()
    .map((entry) => fileURLToPath(new URL(entry, directory)));
}
