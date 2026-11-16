import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BAPTISM_CLASSIC_COMPONENT_KEY,
  type BaptismContent,
  parseBaptismClassicConfiguration,
  parseBaptismClassicContent,
} from "./baptism-classic-01.ts";
import { BAPTISM_THEMES } from "./baptism-themes.ts";
import { RendererPropsError } from "./renderer-props-error.ts";

// The `baptism-classic-01` layout (T7c; S13): one coded layout for the six themed baptism themes. Required:
// the child's name and date, the parents and godparents, the ceremony and the reception — each with its own
// place, address, and time — the message, and an RSVP contact. Optional: mainPhoto and giftRegistry.

const KEY = BAPTISM_CLASSIC_COMPONENT_KEY;

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    celebrantName: "Emilia",
    date: "2027-04-11",
    parents: "Diego y Valentina Ortiz",
    godparents: "Andrés Ortiz y Camila Reyes",
    ceremonyPlace: "Parroquia San Miguel",
    ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
    ceremonyTime: "11:00",
    receptionPlace: "Casa de los abuelos",
    receptionAddress: "Av. de los Fresnos 210, Querétaro",
    receptionTime: "13:30",
    message: "Acompáñanos a dar la bienvenida a Emilia.",
    rsvpContact: "Confirma con Valentina al 55 9876 5432",
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

describe("parseBaptismClassicConfiguration", () => {
  it("accepts exactly one of the six themes with the layout's own key", () => {
    for (const theme of BAPTISM_THEMES) {
      assert.deepEqual(parseBaptismClassicConfiguration({ componentKey: KEY, theme }), {
        componentKey: KEY,
        theme,
      });
    }
  });

  it("names the layout whose snapshot it refused", () => {
    assert.throws(() => parseBaptismClassicConfiguration({ componentKey: KEY }), {
      name: "RendererPropsError",
      message: /^Invalid baptism-classic-01 configuration: /,
    });
  });

  it("refuses a missing theme, a wrong type, an unknown theme, and an extra key", () => {
    for (const configuration of [
      {},
      { theme: "dove-olive" },
      { componentKey: KEY, theme: 7 },
      { componentKey: KEY, theme: "no-such-theme" },
      { componentKey: KEY, theme: "teddy-honey" },
      { componentKey: KEY, theme: "dove-olive", palette: "sunset" },
      { componentKey: "baby-shower-classic-01", theme: "dove-olive" },
      null,
      ["dove-olive"],
    ]) {
      assert.equal(
        issuesOf(() => parseBaptismClassicConfiguration(configuration)).length > 0,
        true,
        JSON.stringify(configuration),
      );
    }
  });

  it("names the allowed themes in its issues", () => {
    assert.deepEqual(
      issuesOf(() => parseBaptismClassicConfiguration({ componentKey: KEY, theme: "neon" })),
      [`configuration.theme must be one of: ${BAPTISM_THEMES.join(", ")}`],
    );
  });
});

describe("parseBaptismClassicContent", () => {
  it("returns the required fields with no optional key when the optional fields are absent", () => {
    const parsed: BaptismContent = parseBaptismClassicContent(content());

    assert.deepEqual(parsed, content() as unknown as BaptismContent);
    assert.equal(Object.hasOwn(parsed, "mainPhoto"), false);
    assert.equal(Object.hasOwn(parsed, "giftRegistry"), false);
  });

  it("keeps the optional fields when the invitation has them", () => {
    assert.deepEqual(
      parseBaptismClassicContent(
        content({
          mainPhoto: "https://example.com/emilia.jpg",
          giftRegistry: "Mesa de regalos · Código 7781 2205",
        }),
      ),
      {
        ...content(),
        mainPhoto: "https://example.com/emilia.jpg",
        giftRegistry: "Mesa de regalos · Código 7781 2205",
      } as unknown as BaptismContent,
    );
  });

  it("treats an empty optional field as absent", () => {
    assert.deepEqual(
      parseBaptismClassicContent(content({ mainPhoto: " ", giftRegistry: null })),
      content() as unknown as BaptismContent,
    );
  });

  it("names every missing required field", () => {
    assert.deepEqual(
      issuesOf(() => parseBaptismClassicContent({})),
      [
        "content.celebrantName must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.parents must be a non-empty string",
        "content.godparents must be a non-empty string",
        "content.ceremonyPlace must be a non-empty string",
        "content.ceremonyAddress must be a non-empty string",
        "content.ceremonyTime must be a time as HH:MM",
        "content.receptionPlace must be a non-empty string",
        "content.receptionAddress must be a non-empty string",
        "content.receptionTime must be a time as HH:MM",
        "content.message must be a non-empty string",
        "content.rsvpContact must be a non-empty string",
      ],
    );

    for (const name of [
      "celebrantName",
      "date",
      "parents",
      "godparents",
      "ceremonyPlace",
      "ceremonyAddress",
      "ceremonyTime",
      "receptionPlace",
      "receptionAddress",
      "receptionTime",
      "message",
      "rsvpContact",
    ]) {
      const { [name]: _removed, ...rest } = content();
      assert.equal(
        issuesOf(() => parseBaptismClassicContent(rest)).length,
        1,
        `a missing ${name} is refused`,
      );
    }
  });

  it("refuses wrong types and malformed values instead of guessing", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseBaptismClassicContent(
          content({
            celebrantName: 7,
            date: "2027-04-31",
            parents: "",
            godparents: ["Andrés"],
            ceremonyPlace: null,
            ceremonyAddress: "Calle Hidalgo 45",
            ceremonyTime: "11 h",
            receptionPlace: "Casa de los abuelos",
            receptionAddress: 7,
            receptionTime: "25:00",
            message: "Acompáñanos",
            rsvpContact: " ",
            mainPhoto: "javascript:alert(1)",
            giftRegistry: 7781,
          }),
        ),
      ),
      [
        "content.celebrantName must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.parents must be a non-empty string",
        "content.godparents must be a non-empty string",
        "content.ceremonyPlace must be a non-empty string",
        "content.ceremonyTime must be a time as HH:MM",
        "content.receptionAddress must be a non-empty string",
        "content.receptionTime must be a time as HH:MM",
        "content.rsvpContact must be a non-empty string",
        "content.giftRegistry must be a non-empty string",
        "content.mainPhoto must be an http or https URL",
      ],
    );
  });

  it("refuses a non-object and does not read inherited keys as content", () => {
    for (const value of [null, ["Emilia"], "Emilia"]) {
      assert.deepEqual(
        issuesOf(() => parseBaptismClassicContent(value)),
        ["content must be a JSON object"],
      );
    }

    const inherited = Object.create(content()) as Record<string, unknown>;
    assert.ok(issuesOf(() => parseBaptismClassicContent(inherited)).length > 0);
  });

  it("ignores a key this layout does not declare", () => {
    const parsed = parseBaptismClassicContent(content({ age: 1, hosts: "Diego" }));

    assert.deepEqual(parsed, content() as unknown as BaptismContent);
  });
});
