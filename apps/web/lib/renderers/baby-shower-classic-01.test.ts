import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BABY_SHOWER_CLASSIC_COMPONENT_KEY,
  type BabyShowerContent,
  parseBabyShowerClassicConfiguration,
  parseBabyShowerClassicContent,
} from "./baby-shower-classic-01.ts";
import { BABY_SHOWER_THEMES } from "./baby-shower-themes.ts";
import { RendererPropsError } from "./renderer-props-error.ts";

// The `baby-shower-classic-01` layout (T7c; S13): one coded layout for the eight baby shower themes, with
// the configuration exactly `{componentKey, theme}` and the content fields the owner approved. Required:
// hosts, date, time, location, address, message, and rsvpContact. Optional: babyName, genderReveal (boolean),
// giftRegistry, and mainPhoto; an optional field that is empty renders nothing.

const KEY = BABY_SHOWER_CLASSIC_COMPONENT_KEY;

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hosts: "Mariana y Lucía Ruiz",
    date: "2027-03-13",
    time: "12:00",
    location: "Jardín Las Palmas",
    address: "Av. de los Cedros 88, Ciudad de México",
    message: "¡Te esperamos para celebrar!",
    rsvpContact: "Confirma con Mariana al 55 1234 5678",
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

describe("parseBabyShowerClassicConfiguration", () => {
  it("accepts exactly one of the eight themes with the layout's own key", () => {
    for (const theme of BABY_SHOWER_THEMES) {
      assert.deepEqual(parseBabyShowerClassicConfiguration({ componentKey: KEY, theme }), {
        componentKey: KEY,
        theme,
      });
    }
  });

  it("names the layout whose snapshot it refused", () => {
    assert.throws(() => parseBabyShowerClassicConfiguration({ componentKey: KEY }), {
      name: "RendererPropsError",
      message: /^Invalid baby-shower-classic-01 configuration: /,
    });
  });

  it("refuses a missing theme, a wrong type, and an unknown theme", () => {
    for (const configuration of [
      {},
      { theme: "teddy-honey" },
      { componentKey: KEY },
      { componentKey: KEY, theme: 7 },
      { componentKey: KEY, theme: "no-such-theme" },
      { componentKey: KEY, theme: "TEDDY-HONEY" },
      { componentKey: KEY, theme: "__proto__" },
      { componentKey: KEY, theme: ["teddy-honey"] },
    ]) {
      assert.equal(
        issuesOf(() => parseBabyShowerClassicConfiguration(configuration)).length > 0,
        true,
        JSON.stringify(configuration),
      );
    }
  });

  it("refuses an extra key, another layout's key, and a non-object", () => {
    for (const configuration of [
      { componentKey: KEY, theme: "teddy-honey", palette: "sunset" },
      { componentKey: "baptism-classic-01", theme: "teddy-honey" },
      { componentKey: "birthday-map-01", theme: "teddy-honey" },
      null,
      ["teddy-honey"],
      "teddy-honey",
      7,
    ]) {
      assert.equal(
        issuesOf(() => parseBabyShowerClassicConfiguration(configuration)).length > 0,
        true,
        JSON.stringify(configuration),
      );
    }
  });

  it("names the allowed themes and keys in its issues", () => {
    assert.deepEqual(
      issuesOf(() => parseBabyShowerClassicConfiguration({ theme: "neon" })),
      [
        `configuration.componentKey is required`,
        `configuration.theme must be one of: ${BABY_SHOWER_THEMES.join(", ")}`,
      ],
    );
    assert.deepEqual(
      issuesOf(() =>
        parseBabyShowerClassicConfiguration({ componentKey: KEY, theme: "neon", extra: 1 }),
      ),
      [
        "configuration.extra is not allowed; allowed keys: componentKey, theme",
        `configuration.theme must be one of: ${BABY_SHOWER_THEMES.join(", ")}`,
      ],
    );
  });
});

describe("parseBabyShowerClassicContent", () => {
  it("returns the required fields with no optional key when the optional fields are absent", () => {
    const parsed: BabyShowerContent = parseBabyShowerClassicContent(content());

    assert.deepEqual(parsed, content() as unknown as BabyShowerContent);
    assert.equal(Object.hasOwn(parsed, "babyName"), false);
    assert.equal(Object.hasOwn(parsed, "genderReveal"), false);
    assert.equal(Object.hasOwn(parsed, "giftRegistry"), false);
    assert.equal(Object.hasOwn(parsed, "mainPhoto"), false);
  });

  it("keeps every optional field when the invitation has it", () => {
    assert.deepEqual(
      parseBabyShowerClassicContent(
        content({
          babyName: "Sofía",
          genderReveal: true,
          giftRegistry: "Mesa de regalos · Código 5123 4471",
          mainPhoto: "https://example.com/sofia.jpg",
        }),
      ),
      {
        ...content(),
        babyName: "Sofía",
        genderReveal: true,
        giftRegistry: "Mesa de regalos · Código 5123 4471",
        mainPhoto: "https://example.com/sofia.jpg",
      } as unknown as BabyShowerContent,
    );
    assert.equal(
      parseBabyShowerClassicContent(content({ genderReveal: false })).genderReveal,
      false,
    );
  });

  it("treats an empty optional field as absent, so nothing renders for it", () => {
    const parsed = parseBabyShowerClassicContent(
      content({ babyName: "  ", giftRegistry: "", mainPhoto: null, genderReveal: undefined }),
    );

    assert.deepEqual(parsed, content() as unknown as BabyShowerContent);
  });

  it("names every missing required field", () => {
    assert.deepEqual(
      issuesOf(() => parseBabyShowerClassicContent({})),
      [
        "content.hosts must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.time must be a time as HH:MM",
        "content.location must be a non-empty string",
        "content.address must be a non-empty string",
        "content.message must be a non-empty string",
        "content.rsvpContact must be a non-empty string",
      ],
    );

    for (const name of ["hosts", "date", "time", "location", "address", "message", "rsvpContact"]) {
      const { [name]: _removed, ...rest } = content();
      assert.equal(
        issuesOf(() => parseBabyShowerClassicContent(rest)).length,
        1,
        `a missing ${name} is refused`,
      );
    }
  });

  it("refuses wrong types and malformed values instead of guessing", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseBabyShowerClassicContent(
          content({
            hosts: 7,
            date: "2027-02-30",
            time: "25:00",
            location: " ".repeat(3),
            babyName: 7,
            genderReveal: "sí",
            giftRegistry: { code: 5123 },
            mainPhoto: "ftp://example.com/baby.jpg",
          }),
        ),
      ),
      [
        "content.hosts must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.time must be a time as HH:MM",
        "content.location must be a non-empty string",
        "content.babyName must be a non-empty string",
        "content.genderReveal must be a boolean",
        "content.giftRegistry must be a non-empty string",
        "content.mainPhoto must be an http or https URL",
      ],
    );
  });

  it("refuses a non-object and does not read inherited keys as content", () => {
    for (const value of [null, ["Mariana"], "Mariana", 7]) {
      assert.deepEqual(
        issuesOf(() => parseBabyShowerClassicContent(value)),
        ["content must be a JSON object"],
      );
    }

    const inherited = Object.create(content()) as Record<string, unknown>;
    assert.ok(issuesOf(() => parseBabyShowerClassicContent(inherited)).length > 0);
  });

  it("ignores a key this layout does not declare, so it never reaches the markup", () => {
    const parsed = parseBabyShowerClassicContent(content({ age: 7, celebrantName: "Sofía" }));

    assert.deepEqual(parsed, content() as unknown as BabyShowerContent);
    assert.equal(Object.hasOwn(parsed, "age"), false);
  });
});
