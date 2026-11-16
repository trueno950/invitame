import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BAPTISM_ARCH_COMPONENT_KEY,
  parseBaptismArchConfiguration,
  parseBaptismArchContent,
} from "./baptism-arch-01.ts";
import { ELEGANT_THEMES } from "./elegant-themes.ts";
import { RendererPropsError } from "./renderer-props-error.ts";
import {
  parseWeddingArchConfiguration,
  parseWeddingArchContent,
  WEDDING_ARCH_COMPONENT_KEY,
  type WeddingArchContent,
} from "./wedding-arch-01.ts";
import {
  parseXVArchConfiguration,
  parseXVArchContent,
  XV_ARCH_COMPONENT_KEY,
  type XVArchContent,
} from "./xv-arch-01.ts";

// The three arch layouts of the elegant line (E3c; S3, S4). Each occasion keeps its own content schema, so
// each has its own parser: XV años, wedding, and the formal baptism, which reuses the themed baptism content
// unchanged. A parser collects every defect in one `RendererPropsError` naming the layout it refused.

function xvContent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    celebrantName: "Valentina Ramírez",
    date: "2026-08-15",
    parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
    honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
    ceremonyPlace: "Parroquia de San Agustín",
    ceremonyAddress: "Calle de los Fresnos 132, San Pedro de los Pinos, Ciudad de México",
    ceremonyTime: "18:00",
    receptionPlace: "Jardín de los Olivos",
    receptionAddress: "Camino Real a Santa Fe 41, Santa Fe, Ciudad de México",
    receptionTime: "20:30",
    dressCode: "Formal · etiqueta",
    message: "Hay días que se esperan toda una vida.",
    rsvpContact: "Adriana Solís · 55 8120 4471",
    ...overrides,
  };
}

function weddingContent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    coupleNameOne: "Ana Sofía",
    coupleNameTwo: "Daniel",
    date: "2026-09-12",
    ceremonyPlace: "Parroquia de Santa Ana",
    ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
    ceremonyTime: "17:00",
    receptionPlace: "Hacienda San Gabriel",
    receptionAddress: "Camino a la Hacienda 8, Querétaro",
    receptionTime: "19:30",
    dressCode: "Formal",
    message: "Nos encantaría celebrar contigo.",
    rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
    ...overrides,
  };
}

function baptismContent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    celebrantName: "Emilia",
    date: "2027-04-11",
    parents: "Diego y Valentina Ortiz",
    godparents: "Andrés Ortiz y Camila Reyes",
    ceremonyPlace: "Parroquia San Miguel",
    ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
    ceremonyTime: "11:00",
    receptionPlace: "Casa de los abuelos",
    receptionAddress: "Av. de los Fresnos 210, Col. Álamos, Querétaro",
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

describe("the arch configurations", () => {
  const cases = [
    { key: XV_ARCH_COMPONENT_KEY, parse: parseXVArchConfiguration },
    { key: WEDDING_ARCH_COMPONENT_KEY, parse: parseWeddingArchConfiguration },
    { key: BAPTISM_ARCH_COMPONENT_KEY, parse: parseBaptismArchConfiguration },
  ] as const;

  it("accepts exactly one of the eight elegant themes with the layout's own key", () => {
    for (const { key, parse } of cases) {
      for (const theme of ELEGANT_THEMES) {
        assert.deepEqual(parse({ componentKey: key, theme }), { componentKey: key, theme });
      }
    }
  });

  it("names the layout whose snapshot it refused", () => {
    for (const { key, parse } of cases) {
      assert.throws(() => parse({ componentKey: key }), {
        name: "RendererPropsError",
        message: new RegExp(`^Invalid ${key} configuration: `),
      });
    }
  });

  it("refuses a missing theme, a wrong type, an unknown theme, and an extra key", () => {
    for (const { key, parse } of cases) {
      for (const configuration of [
        {},
        { theme: "blush-gold" },
        { componentKey: key, theme: 7 },
        { componentKey: key, theme: "no-such-theme" },
        { componentKey: key, theme: "dove-olive" },
        { componentKey: key, theme: "blush-gold", palette: "sunset" },
        { componentKey: "baptism-classic-01", theme: "blush-gold" },
        null,
        ["blush-gold"],
      ]) {
        assert.equal(
          issuesOf(() => parse(configuration)).length > 0,
          true,
          `${key} ${JSON.stringify(configuration)}`,
        );
      }
    }
  });
});

describe("parseXVArchContent", () => {
  it("returns the required fields with no optional key when the optional fields are absent", () => {
    const parsed: XVArchContent = parseXVArchContent(xvContent());

    assert.deepEqual(parsed, xvContent() as unknown as XVArchContent);
    assert.equal(Object.hasOwn(parsed, "chambelanes"), false);
    assert.equal(Object.hasOwn(parsed, "giftRegistry"), false);
    assert.equal(Object.hasOwn(parsed, "mainPhoto"), false);
  });

  it("keeps the optional fields when the invitation has them", () => {
    assert.deepEqual(
      parseXVArchContent(
        xvContent({
          chambelanes: "Diego Fuentes\nRodrigo Salas",
          giftRegistry: "Liverpool 50894421",
          mainPhoto: "https://example.com/valentina.jpg",
        }),
      ),
      {
        ...xvContent(),
        chambelanes: "Diego Fuentes\nRodrigo Salas",
        giftRegistry: "Liverpool 50894421",
        mainPhoto: "https://example.com/valentina.jpg",
      } as unknown as XVArchContent,
    );
  });

  it("treats an empty optional field as absent", () => {
    assert.deepEqual(
      parseXVArchContent(xvContent({ chambelanes: " ", giftRegistry: null, mainPhoto: "" })),
      xvContent() as unknown as XVArchContent,
    );
  });

  it("names every missing required field", () => {
    assert.deepEqual(
      issuesOf(() => parseXVArchContent({})),
      [
        "content.celebrantName must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.parents must be a non-empty string",
        "content.honorSponsors must be a non-empty string",
        "content.ceremonyPlace must be a non-empty string",
        "content.ceremonyAddress must be a non-empty string",
        "content.ceremonyTime must be a time as HH:MM",
        "content.receptionPlace must be a non-empty string",
        "content.receptionAddress must be a non-empty string",
        "content.receptionTime must be a time as HH:MM",
        "content.dressCode must be a non-empty string",
        "content.message must be a non-empty string",
        "content.rsvpContact must be a non-empty string",
      ],
    );
  });

  it("refuses wrong types and malformed values instead of guessing", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseXVArchContent(
          xvContent({
            celebrantName: 7,
            date: "2026-02-30",
            parents: "",
            honorSponsors: ["Joaquín"],
            ceremonyPlace: null,
            ceremonyAddress: "Calle de los Fresnos 132",
            ceremonyTime: "18 h",
            receptionPlace: "Jardín de los Olivos",
            receptionAddress: 7,
            receptionTime: "25:00",
            dressCode: " ",
            message: "Hay días",
            rsvpContact: " ",
            chambelanes: 3,
            giftRegistry: 50894421,
            mainPhoto: "javascript:alert(1)",
          }),
        ),
      ),
      [
        "content.celebrantName must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.parents must be a non-empty string",
        "content.honorSponsors must be a non-empty string",
        "content.ceremonyPlace must be a non-empty string",
        "content.ceremonyTime must be a time as HH:MM",
        "content.receptionAddress must be a non-empty string",
        "content.receptionTime must be a time as HH:MM",
        "content.dressCode must be a non-empty string",
        "content.rsvpContact must be a non-empty string",
        "content.chambelanes must be a non-empty string",
        "content.giftRegistry must be a non-empty string",
        "content.mainPhoto must be an http or https URL",
      ],
    );
  });

  it("ignores a key the schema does not declare, without resolving it through a prototype", () => {
    const parsed = parseXVArchContent(xvContent({ age: 15, constructor: "x", extra: true }));

    assert.equal(parsed.celebrantName, "Valentina Ramírez");
    assert.equal(Object.hasOwn(parsed, "age"), false);
    assert.equal(Object.hasOwn(parsed, "extra"), false);
    assert.deepEqual(parseXVArchContent(xvContent({ extra: true })), xvContent());
  });

  it("refuses a content snapshot that is not a JSON object", () => {
    for (const value of [null, "text", 7, ["Valentina"]]) {
      assert.deepEqual(
        issuesOf(() => parseXVArchContent(value)),
        ["content must be a JSON object"],
      );
    }
  });
});

describe("parseWeddingArchContent", () => {
  it("returns the required fields and keeps the optional ones it has", () => {
    const parsed: WeddingArchContent = parseWeddingArchContent(
      weddingContent({
        firstFamilyParents: "Roberto Sánchez y Elena Vargas",
        secondFamilyParents: "Jorge Medina y Lucía Peña",
        weddingSponsors: "Andrés Reyes\nCamila Reyes",
        giftRegistry: "Mesa de regalos · Código 4471 2205",
        hashtag: "#AnaYDaniel",
        mainPhoto: "https://example.com/ana-y-daniel.jpg",
      }),
    );

    assert.equal(parsed.coupleNameOne, "Ana Sofía");
    assert.equal(parsed.coupleNameTwo, "Daniel");
    assert.equal(parsed.weddingSponsors, "Andrés Reyes\nCamila Reyes");
    assert.equal(parsed.hashtag, "#AnaYDaniel");
  });

  it("omits every optional key when the wedding has none", () => {
    const parsed = parseWeddingArchContent(weddingContent());

    for (const name of [
      "firstFamilyParents",
      "secondFamilyParents",
      "weddingSponsors",
      "giftRegistry",
      "hashtag",
      "mainPhoto",
    ]) {
      assert.equal(Object.hasOwn(parsed, name), false, name);
    }
    assert.deepEqual(parsed, weddingContent() as unknown as WeddingArchContent);
  });

  it("names every missing required field", () => {
    assert.deepEqual(
      issuesOf(() => parseWeddingArchContent({})),
      [
        "content.coupleNameOne must be a non-empty string",
        "content.coupleNameTwo must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.ceremonyPlace must be a non-empty string",
        "content.ceremonyAddress must be a non-empty string",
        "content.ceremonyTime must be a time as HH:MM",
        "content.receptionPlace must be a non-empty string",
        "content.receptionAddress must be a non-empty string",
        "content.receptionTime must be a time as HH:MM",
        "content.dressCode must be a non-empty string",
        "content.message must be a non-empty string",
        "content.rsvpContact must be a non-empty string",
      ],
    );
  });

  it("refuses wrong types, malformed values, and a bad optional value", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseWeddingArchContent(
          weddingContent({
            coupleNameOne: "",
            coupleNameTwo: 7,
            date: "12-09-2026",
            ceremonyPlace: "Parroquia de Santa Ana",
            ceremonyAddress: " ",
            ceremonyTime: "5 pm",
            receptionPlace: "Hacienda San Gabriel",
            receptionAddress: "Camino a la Hacienda 8",
            receptionTime: "19:30",
            dressCode: "Formal",
            message: "Nos encantaría",
            rsvpContact: "Confirma con Ana Sofía",
            firstFamilyParents: 7,
            secondFamilyParents: "",
            weddingSponsors: null,
            giftRegistry: "Mesa de regalos",
            hashtag: ["#AnaYDaniel"],
            mainPhoto: "ftp://example.com/photo.jpg",
          }),
        ),
      ),
      [
        "content.coupleNameOne must be a non-empty string",
        "content.coupleNameTwo must be a non-empty string",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.ceremonyAddress must be a non-empty string",
        "content.ceremonyTime must be a time as HH:MM",
        "content.firstFamilyParents must be a non-empty string",
        "content.hashtag must be a non-empty string",
        "content.mainPhoto must be an http or https URL",
      ],
    );
  });

  it("ignores an undeclared key and refuses a snapshot that is not an object", () => {
    assert.deepEqual(parseWeddingArchContent(weddingContent({ age: 30 })), weddingContent());
    for (const value of [undefined, null, "boda", []]) {
      assert.deepEqual(
        issuesOf(() => parseWeddingArchContent(value)),
        ["content must be a JSON object"],
      );
    }
  });
});

describe("the formal baptism content", () => {
  it("reuses the themed baptism schema exactly", () => {
    const parsed = parseBaptismArchContent(baptismContent());

    assert.deepEqual(parsed, baptismContent());
    assert.deepEqual(
      parseBaptismArchContent(
        baptismContent({ giftRegistry: "Mesa 7781", mainPhoto: "https://e.test/a.jpg" }),
      ),
      baptismContent({ giftRegistry: "Mesa 7781", mainPhoto: "https://e.test/a.jpg" }),
    );
  });

  it("refuses an incomplete baptism and names the arch layout it refused", () => {
    assert.throws(() => parseBaptismArchContent({}), {
      name: "RendererPropsError",
      message: /^Invalid baptism-arch-01 content: /,
    });
    assert.deepEqual(
      issuesOf(() => parseBaptismArchContent(baptismContent({ ceremonyTime: "25:00" }))),
      ["content.ceremonyTime must be a time as HH:MM"],
    );
  });
});
