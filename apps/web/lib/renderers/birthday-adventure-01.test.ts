import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { contrastRatio } from "../theme/contrast.ts";
import {
  BIRTHDAY_ADVENTURE_COMPONENT_KEY,
  type BirthdayAdventureContent,
  formatAgeLabel,
  formatLongDate,
  PALETTE_COLORS,
  PALETTES,
  parseBirthdayAdventureConfiguration,
  parseBirthdayAdventureContent,
  RendererPropsError,
} from "./birthday-adventure-01.ts";

// Defensive parsing of the props the `birthday-adventure-01` component receives (M3 T7; S2, S6). The API
// validates a version before publication, so a failure here is an operational error (a drifted or
// hand-edited snapshot), never user input: it throws a `RendererPropsError` that names every defect.

function configuration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    componentKey: BIRTHDAY_ADVENTURE_COMPONENT_KEY,
    layout: "adventure",
    palette: "sunset",
    typography: "rounded",
    sectionOrder: ["hero", "details", "message"],
    ...overrides,
  };
}

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    celebrantName: "Mateo",
    age: 7,
    date: "2026-12-05",
    time: "16:30",
    location: "Jardín Los Pinos",
    address: "Calle Reforma 123, Guadalajara",
    mainPhoto: "https://example.com/mateo.jpg",
    message: "Ven a celebrar conmigo.",
    ...overrides,
  };
}

function issuesOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof RendererPropsError, `unexpected error: ${String(error)}`);
    return error.issues;
  }
  assert.fail("expected a RendererPropsError");
}

describe("parseBirthdayAdventureConfiguration", () => {
  it("returns the palette and the section order of a valid configuration", () => {
    assert.deepEqual(parseBirthdayAdventureConfiguration(configuration()), {
      palette: "sunset",
      sectionOrder: ["hero", "details", "message"],
    });
  });

  it("accepts every palette and reordered or shortened section lists that include hero", () => {
    for (const palette of ["sunset", "ocean", "forest"]) {
      assert.equal(
        parseBirthdayAdventureConfiguration(configuration({ palette })).palette,
        palette,
      );
    }
    for (const sectionOrder of [["message", "hero", "details"], ["hero"], ["details", "hero"]]) {
      assert.deepEqual(
        parseBirthdayAdventureConfiguration(configuration({ sectionOrder })).sectionOrder,
        sectionOrder,
      );
    }
  });

  it("throws a clear error for an unknown palette", () => {
    for (const palette of ["neon", "", 1, null, "__proto__", "toString"]) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayAdventureConfiguration(configuration({ palette }))),
        ["configuration.palette must be one of: sunset, ocean, forest"],
        String(palette),
      );
    }
    assert.throws(() => parseBirthdayAdventureConfiguration(configuration({ palette: "neon" })), {
      name: "RendererPropsError",
      message:
        "Invalid birthday-adventure-01 configuration: configuration.palette must be one of: sunset, ocean, forest",
    });
  });

  it("throws a clear error for an unknown, duplicated, or missing section", () => {
    const cases: [unknown, string[]][] = [
      [[], ["configuration.sectionOrder must be a non-empty array"]],
      ["hero", ["configuration.sectionOrder must be a non-empty array"]],
      [
        ["hero", "footer"],
        ["configuration.sectionOrder[1] must be one of: hero, details, message"],
      ],
      [
        ["hero", "__proto__"],
        ["configuration.sectionOrder[1] must be one of: hero, details, message"],
      ],
      [["hero", "hero"], ["configuration.sectionOrder must not contain duplicates"]],
      [["details", "message"], ['configuration.sectionOrder must include "hero"']],
    ];

    for (const [sectionOrder, expected] of cases) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayAdventureConfiguration(configuration({ sectionOrder }))),
        expected,
        JSON.stringify(sectionOrder),
      );
    }
  });

  it("refuses a configuration that is not an object, with wrong constants, or with unknown keys", () => {
    for (const value of [null, undefined, "text", 1, []]) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayAdventureConfiguration(value)),
        ["configuration must be a JSON object"],
      );
    }
    assert.deepEqual(
      issuesOf(() =>
        parseBirthdayAdventureConfiguration(
          configuration({ componentKey: "other", layout: "grid", typography: "serif" }),
        ),
      ),
      [
        'configuration.componentKey must be "birthday-adventure-01"',
        'configuration.layout must be "adventure"',
        'configuration.typography must be "rounded"',
      ],
    );
    assert.deepEqual(
      issuesOf(() => parseBirthdayAdventureConfiguration(configuration({ script: "alert(1)" }))),
      [
        "configuration.script is not allowed; allowed keys: componentKey, layout, palette, typography, sectionOrder",
      ],
    );

    const missing = configuration();
    delete missing.palette;
    assert.deepEqual(
      issuesOf(() => parseBirthdayAdventureConfiguration(missing)),
      ["configuration.palette is required"],
    );
  });
});

describe("parseBirthdayAdventureContent", () => {
  it("returns the typed content of a valid invitation", () => {
    const expected: BirthdayAdventureContent = {
      celebrantName: "Mateo",
      age: 7,
      date: "2026-12-05",
      time: "16:30",
      location: "Jardín Los Pinos",
      address: "Calle Reforma 123, Guadalajara",
      mainPhoto: "https://example.com/mateo.jpg",
      message: "Ven a celebrar conmigo.",
    };
    assert.deepEqual(parseBirthdayAdventureContent(content()), expected);
  });

  it("names every defective field", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseBirthdayAdventureContent(
          content({ celebrantName: "", age: 7.5, date: "2026-02-30", time: "25:00", message: 3 }),
        ),
      ),
      [
        "content.celebrantName must be a non-empty string",
        "content.age must be an integer from 1 to 120",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.time must be a time as HH:MM",
        "content.message must be a non-empty string",
      ],
    );
  });

  it("refuses missing fields, non-objects, and photo URLs that are not http or https", () => {
    for (const value of [null, undefined, "text", []]) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayAdventureContent(value)),
        ["content must be a JSON object"],
      );
    }
    assert.deepEqual(
      issuesOf(() => parseBirthdayAdventureContent({})).length,
      8,
      "every field is required",
    );
    for (const mainPhoto of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/foto.jpg",
      "",
    ]) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayAdventureContent(content({ mainPhoto }))),
        ["content.mainPhoto must be an http or https URL"],
        mainPhoto,
      );
    }
  });

  it("does not read inherited keys as content", () => {
    const inherited = Object.create(content());
    assert.equal(issuesOf(() => parseBirthdayAdventureContent(inherited)).length, 8);
  });
});

describe("Spanish formatting", () => {
  it("writes the date in long form and the age with its singular", () => {
    assert.equal(formatLongDate("2026-12-05"), "5 de diciembre de 2026");
    assert.equal(formatLongDate("2027-01-31"), "31 de enero de 2027");
    assert.equal(formatAgeLabel(7), "Cumple 7 años");
    assert.equal(formatAgeLabel(1), "Cumple 1 año");
  });
});

describe("palettes", () => {
  it("defines colors for exactly the palettes the API allows", () => {
    const registry = readFileSync(
      new URL(
        "../../../api/src/catalog/domain/renderers/birthday-adventure-01.renderer.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const declared = /const PALETTES = \[([^\]]*)\] as const;/.exec(registry)?.[1];

    assert.ok(declared, "the API renderer declares PALETTES");
    assert.deepEqual(
      [...declared.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
      [...PALETTES],
    );
    assert.deepEqual(Object.keys(PALETTE_COLORS).sort(), [...PALETTES].sort());
  });

  it("keeps text on every surface at 4.5:1", () => {
    for (const [name, colors] of Object.entries(PALETTE_COLORS)) {
      for (const text of [colors.ink, colors.accent]) {
        for (const surface of [colors.background, colors.surface, colors.soft]) {
          assert.ok(
            contrastRatio(text, surface) >= 4.5,
            `${name}: ${text} on ${surface} is ${contrastRatio(text, surface).toFixed(2)}`,
          );
        }
      }
    }
  });
});
