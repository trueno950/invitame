import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BIRTHDAY_MAP_COMPONENT_KEY,
  parseBirthdayMapConfiguration,
  parseBirthdayMapContent,
} from "./birthday-map-01.ts";
import { BIRTHDAY_THEMES } from "./birthday-themes.ts";
import { RendererPropsError } from "./renderer-props-error.ts";

// The props of the `birthday-map-01` renderer (T6b; S2, S7, S8): the layout is coded once and the theme is an
// allow-listed palette, font, and motif, so the configuration is exactly `{componentKey, theme}` and
// anything else is a drifted snapshot that must not render. Content is the shared eight fields.

function configuration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { componentKey: BIRTHDAY_MAP_COMPONENT_KEY, theme: "ice-kingdom", ...overrides };
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

describe("parseBirthdayMapConfiguration", () => {
  it("returns the theme of a valid configuration", () => {
    assert.deepEqual(parseBirthdayMapConfiguration(configuration()), {
      componentKey: BIRTHDAY_MAP_COMPONENT_KEY,
      theme: "ice-kingdom",
    });
  });

  it("accepts every theme the API allows", () => {
    for (const theme of BIRTHDAY_THEMES) {
      assert.equal(parseBirthdayMapConfiguration(configuration({ theme })).theme, theme, theme);
    }
    assert.equal(BIRTHDAY_THEMES.length, 8);
  });

  it("refuses a configuration that is not an object", () => {
    for (const value of [null, undefined, [], "ice-kingdom", 7]) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayMapConfiguration(value)),
        ["configuration must be a JSON object"],
      );
    }
  });

  it("requires both keys and no other key", () => {
    const { componentKey: _key, ...withoutKey } = configuration();

    assert.deepEqual(
      issuesOf(() => parseBirthdayMapConfiguration(withoutKey)),
      ["configuration.componentKey is required"],
    );
    assert.deepEqual(
      issuesOf(() => parseBirthdayMapConfiguration({ componentKey: BIRTHDAY_MAP_COMPONENT_KEY })),
      ["configuration.theme is required"],
    );
    assert.deepEqual(
      issuesOf(() => parseBirthdayMapConfiguration(configuration({ palette: "sunset" }))),
      ["configuration.palette is not allowed; allowed keys: componentKey, theme"],
    );
    assert.deepEqual(
      issuesOf(() => parseBirthdayMapConfiguration(configuration({ sectionOrder: ["hero"] }))),
      ["configuration.sectionOrder is not allowed; allowed keys: componentKey, theme"],
    );
  });

  it("refuses the key of another layout", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseBirthdayMapConfiguration(configuration({ componentKey: "birthday-adventure-01" })),
      ),
      ['configuration.componentKey must be "birthday-map-01"'],
    );
  });

  it("refuses an unknown or wrongly typed theme", () => {
    const allowed =
      "configuration.theme must be one of: ice-kingdom, rescue-team, spider-hero, classic-mouse, " +
      "dinosaurs, under-the-sea, fairytale-princess, blocks-and-pixels";

    for (const theme of [
      "neon",
      "ICE-KINGDOM",
      "__proto__",
      "constructor",
      "",
      7,
      null,
      ["ice-kingdom"],
    ]) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayMapConfiguration(configuration({ theme }))),
        [allowed],
        String(theme),
      );
    }
  });
});

describe("parseBirthdayMapContent", () => {
  it("accepts the shared eight fields", () => {
    assert.equal(parseBirthdayMapContent(content()).celebrantName, "Mateo");
  });

  it("refuses a snapshot that does not fit, naming this layout", () => {
    assert.throws(() => parseBirthdayMapContent(content({ age: 0 })), {
      name: "RendererPropsError",
      message: "Invalid birthday-map-01 content: content.age must be an integer from 1 to 120",
    });
  });
});
