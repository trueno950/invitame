import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BAPTISM_ARCH_COMPONENT_KEY,
  parseBaptismArchConfiguration,
  parseBaptismArchContent,
} from "./baptism-arch-01.ts";
import {
  BAPTISM_ORNAMENTAL_COMPONENT_KEY,
  parseBaptismOrnamentalConfiguration,
  parseBaptismOrnamentalContent,
} from "./baptism-ornamental-01.ts";
import { ELEGANT_THEMES } from "./elegant-themes.ts";
import { RendererPropsError } from "./renderer-props-error.ts";
import {
  parseWeddingArchConfiguration,
  parseWeddingArchContent,
  WEDDING_ARCH_COMPONENT_KEY,
} from "./wedding-arch-01.ts";
import {
  parseWeddingOrnamentalConfiguration,
  parseWeddingOrnamentalContent,
  WEDDING_ORNAMENTAL_COMPONENT_KEY,
} from "./wedding-ornamental-01.ts";
import {
  parseXVArchConfiguration,
  parseXVArchContent,
  XV_ARCH_COMPONENT_KEY,
} from "./xv-arch-01.ts";
import {
  parseXVOrnamentalConfiguration,
  parseXVOrnamentalContent,
  XV_ORNAMENTAL_COMPONENT_KEY,
} from "./xv-ornamental-01.ts";

// The three ornamental layouts of the elegant line (E4b; S5). «Ornamental» is a second visual direction
// over the content contracts the owner already approved for «Arco y foto» (S4): the ornamental renderers
// share their arch siblings' parsers instead of declaring a second schema, so an invitation that renders in
// one elegant layout renders in the other, and a schema change cannot reach one and miss the other. These
// tests pin that equality by differential: for every input, the ornamental parser answers exactly what the
// arch parser answers, defect for defect.

interface Occasion {
  readonly archKey: string;
  readonly ornamentalKey: string;
  readonly parseArchConfiguration: (value: unknown) => unknown;
  readonly parseOrnamentalConfiguration: (value: unknown) => unknown;
  readonly parseArchContent: (value: unknown) => unknown;
  readonly parseOrnamentalContent: (value: unknown) => unknown;
  readonly valid: Record<string, unknown>;
  /** Fields whose validation is the arch's, probed with one bad value at a time. */
  readonly badValues: readonly Record<string, unknown>[];
}

const XV = {
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
};

const XV_FULL = {
  ...XV,
  chambelanes: "Diego Fuentes\nRodrigo Salas",
  giftRegistry: "Liverpool 50894421",
  mainPhoto: "https://example.com/valentina.jpg",
};

const XV_BAD: readonly Record<string, unknown>[] = [
  {},
  { ...XV, celebrantName: "" },
  { ...XV, date: "2027-02-30" },
  { ...XV, ceremonyTime: "18 h" },
  { ...XV, receptionTime: "25:00" },
  { ...XV, dressCode: 7 },
  { ...XV, chambelanes: 3 },
  { ...XV, giftRegistry: " " },
  { ...XV, mainPhoto: "javascript:alert(1)" },
  { ...XV, extra: true },
];

const WEDDING = {
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
};

const WEDDING_FULL = {
  ...WEDDING,
  firstFamilyParents: "Roberto Sánchez y Elena Vargas",
  secondFamilyParents: "Jorge Medina y Lucía Peña",
  weddingSponsors: "Andrés Reyes\nCamila Reyes",
  giftRegistry: "Mesa de regalos · Código 4471 2205",
  hashtag: "#AnaYDaniel",
  mainPhoto: "https://example.com/ana-y-daniel.jpg",
};

const WEDDING_BAD: readonly Record<string, unknown>[] = [
  {},
  { ...WEDDING, coupleNameOne: "" },
  { ...WEDDING, coupleNameTwo: 7 },
  { ...WEDDING, date: "12-09-2026" },
  { ...WEDDING, ceremonyAddress: " " },
  { ...WEDDING, ceremonyTime: "5 pm" },
  { ...WEDDING, firstFamilyParents: 7 },
  { ...WEDDING, weddingSponsors: null },
  { ...WEDDING, hashtag: ["#AnaYDaniel"] },
  { ...WEDDING, mainPhoto: "ftp://example.com/photo.jpg" },
];

const BAPTISM = {
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
};

const BAPTISM_FULL = {
  ...BAPTISM,
  giftRegistry: "Mesa de regalos · Código 7781 2205",
  mainPhoto: "https://example.com/emilia.jpg",
};

const BAPTISM_BAD: readonly Record<string, unknown>[] = [
  {},
  { ...BAPTISM, celebrantName: " " },
  { ...BAPTISM, godparents: 7 },
  { ...BAPTISM, ceremonyTime: "25:00" },
  { ...BAPTISM, giftRegistry: null },
  { ...BAPTISM, mainPhoto: "javascript:alert(1)" },
];

const OCCASIONS: readonly Occasion[] = [
  {
    archKey: XV_ARCH_COMPONENT_KEY,
    ornamentalKey: XV_ORNAMENTAL_COMPONENT_KEY,
    parseArchConfiguration: parseXVArchConfiguration,
    parseOrnamentalConfiguration: parseXVOrnamentalConfiguration,
    parseArchContent: parseXVArchContent,
    parseOrnamentalContent: parseXVOrnamentalContent,
    valid: XV,
    badValues: XV_BAD,
  },
  {
    archKey: WEDDING_ARCH_COMPONENT_KEY,
    ornamentalKey: WEDDING_ORNAMENTAL_COMPONENT_KEY,
    parseArchConfiguration: parseWeddingArchConfiguration,
    parseOrnamentalConfiguration: parseWeddingOrnamentalConfiguration,
    parseArchContent: parseWeddingArchContent,
    parseOrnamentalContent: parseWeddingOrnamentalContent,
    valid: WEDDING,
    badValues: WEDDING_BAD,
  },
  {
    archKey: BAPTISM_ARCH_COMPONENT_KEY,
    ornamentalKey: BAPTISM_ORNAMENTAL_COMPONENT_KEY,
    parseArchConfiguration: parseBaptismArchConfiguration,
    parseOrnamentalConfiguration: parseBaptismOrnamentalConfiguration,
    parseArchContent: parseBaptismArchContent,
    parseOrnamentalContent: parseBaptismOrnamentalContent,
    valid: BAPTISM,
    badValues: BAPTISM_BAD,
  },
];

/** The defects a parser names, or the value it answered when it accepted the input. */
function outcome(run: () => unknown): { issues: string[] } | { value: unknown } {
  try {
    return { value: run() };
  } catch (error) {
    assert.ok(error instanceof RendererPropsError, `unexpected error: ${String(error)}`);
    return { issues: error.issues };
  }
}

const VALID_CONTENT = [XV, XV_FULL, WEDDING, WEDDING_FULL, BAPTISM, BAPTISM_FULL];

describe("the ornamental configurations", () => {
  it("names its own layout key and takes exactly the eight elegant themes", () => {
    for (const occasion of OCCASIONS) {
      for (const theme of ELEGANT_THEMES) {
        assert.deepEqual(
          occasion.parseOrnamentalConfiguration({
            componentKey: occasion.ornamentalKey,
            theme,
          }),
          { componentKey: occasion.ornamentalKey, theme },
          `${occasion.ornamentalKey} ${theme}`,
        );
      }
    }
  });

  it("refuses every configuration its arch sibling refuses, and nothing else", () => {
    // The same shapes for both layouts, with the key the layout owns spliced in: the only acceptable
    // difference between the two parsers is the key itself.
    const shapes: ReadonlyArray<(key: string) => unknown> = [
      (key) => ({ componentKey: key, theme: "blush-gold" }),
      (key) => ({ componentKey: key }),
      (key) => ({ componentKey: key, theme: 7 }),
      (key) => ({ componentKey: key, theme: "no-such-theme" }),
      (key) => ({ componentKey: key, theme: "dove-olive" }),
      (key) => ({ componentKey: key, theme: "BLUSH-GOLD" }),
      (key) => ({ componentKey: key, theme: "blush-gold", palette: "sunset" }),
      (key) => ({ theme: "blush-gold", key }),
      () => null,
      () => ["blush-gold"],
      () => "blush-gold",
    ];

    for (const occasion of OCCASIONS) {
      for (const theme of ELEGANT_THEMES) {
        // The one difference the two parsers may have is the key each layout owns.
        assert.deepEqual(
          outcome(() =>
            occasion.parseOrnamentalConfiguration({ componentKey: occasion.ornamentalKey, theme }),
          ),
          { value: { componentKey: occasion.ornamentalKey, theme } },
          `${occasion.ornamentalKey} ${theme}`,
        );
        assert.deepEqual(
          outcome(() => occasion.parseArchConfiguration({ componentKey: occasion.archKey, theme })),
          { value: { componentKey: occasion.archKey, theme } },
          `${occasion.archKey} ${theme}`,
        );
      }

      for (const shape of shapes) {
        const ornamental = outcome(() =>
          occasion.parseOrnamentalConfiguration(shape(occasion.ornamentalKey)),
        );
        const arch = outcome(() => occasion.parseArchConfiguration(shape(occasion.archKey)));

        assert.equal(
          "issues" in ornamental,
          "issues" in arch,
          `${occasion.ornamentalKey} ${JSON.stringify(shape(occasion.ornamentalKey))}`,
        );
      }
    }
  });

  it("refuses a configuration that carries another layout's key", () => {
    for (const occasion of OCCASIONS) {
      for (const key of [occasion.archKey, "baptism-classic-01", "__proto__", "constructor", ""]) {
        assert.equal(
          "issues" in
            outcome(() =>
              occasion.parseOrnamentalConfiguration({ componentKey: key, theme: "blush-gold" }),
            ),
          true,
          `${occasion.ornamentalKey} refuses ${key}`,
        );
      }
    }
  });

  it("names the ornamental layout it refused, never its arch sibling", () => {
    for (const occasion of OCCASIONS) {
      assert.throws(() => occasion.parseOrnamentalConfiguration({ theme: "blush-gold" }), {
        name: "RendererPropsError",
        message: new RegExp(`^Invalid ${occasion.ornamentalKey} configuration: `),
      });
      assert.throws(
        () =>
          occasion.parseOrnamentalConfiguration({
            componentKey: occasion.ornamentalKey,
            theme: "dove-olive",
          }),
        { name: "RendererPropsError", message: new RegExp(occasion.ornamentalKey) },
      );
    }
  });
});

describe("the ornamental content", () => {
  it("accepts exactly the content its arch sibling accepts, field for field", () => {
    for (const occasion of OCCASIONS) {
      for (const content of [...VALID_CONTENT, ...occasion.badValues]) {
        assert.deepEqual(
          outcome(() => occasion.parseOrnamentalContent(content)),
          outcome(() => occasion.parseArchContent(content)),
          `${occasion.ornamentalKey} ${JSON.stringify(content)}`,
        );
      }
    }
  });

  it("returns the arch's own view of the optional fields an invitation lacks", () => {
    for (const occasion of OCCASIONS) {
      const parsed = occasion.parseOrnamentalContent(occasion.valid) as Record<string, unknown>;

      for (const name of ["chambelanes", "giftRegistry", "mainPhoto", "hashtag"]) {
        assert.equal(Object.hasOwn(parsed, name), false, `${occasion.ornamentalKey} ${name}`);
      }
    }
  });

  it("names every defect in one error, with the ornamental layout's key", () => {
    for (const occasion of OCCASIONS) {
      assert.throws(() => occasion.parseOrnamentalContent({}), {
        name: "RendererPropsError",
        message: new RegExp(`^Invalid ${occasion.ornamentalKey} content: `),
      });
    }
  });

  it("refuses a snapshot that is not a JSON object, like its arch sibling", () => {
    for (const occasion of OCCASIONS) {
      for (const value of [null, "texto", 7, ["Valentina"]]) {
        assert.deepEqual(
          outcome(() => occasion.parseOrnamentalContent(value)),
          {
            issues: ["content must be a JSON object"],
          },
        );
      }
    }
  });
});
