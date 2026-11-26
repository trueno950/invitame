import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BabyShowerClassicRenderer } from "../../app/_components/renderers/baby-shower-classic-01/baby-shower-classic-renderer.ts";
import { BaptismArchRenderer } from "../../app/_components/renderers/baptism-arch-01/baptism-arch-renderer.ts";
import { BaptismClassicRenderer } from "../../app/_components/renderers/baptism-classic-01/baptism-classic-renderer.ts";
import { BaptismOrnamentalRenderer } from "../../app/_components/renderers/baptism-ornamental-01/baptism-ornamental-renderer.ts";
import { BirthdayMapRenderer } from "../../app/_components/renderers/birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "../../app/_components/renderers/birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "../../app/_components/renderers/birthday-story-01/birthday-story-renderer.ts";
import { WeddingArchRenderer } from "../../app/_components/renderers/wedding-arch-01/wedding-arch-renderer.ts";
import { WeddingOrnamentalRenderer } from "../../app/_components/renderers/wedding-ornamental-01/wedding-ornamental-renderer.ts";
import { XVArchRenderer } from "../../app/_components/renderers/xv-arch-01/xv-arch-renderer.ts";
import { XVOrnamentalRenderer } from "../../app/_components/renderers/xv-ornamental-01/xv-ornamental-renderer.ts";
import { rendererAcceptsProps } from "../public/invitation-render.ts";
import { parseBabyShowerClassicContent } from "./baby-shower-classic-01.ts";
import { parseBirthdayMapContent } from "./birthday-map-01.ts";
import { hiddenFieldsOf } from "./hidden-fields.ts";
import { RendererPropsError } from "./renderer-props-error.ts";
import { parseWeddingArchContent, WEDDING_ARCH_COMPONENT_KEY } from "./wedding-arch-01.ts";

/*
 * Omitted sections in the layouts (S3, S4, S8.2, S8.3). The API computes `hiddenFields` from the pinned
 * schema and sends it with the public read; the reader treats a hidden field as absent, so a required value
 * the customer switched off never becomes a `RendererPropsError`, and each layout skips the block whose
 * fields are hidden. A field that stays shown keeps today's rule: blank still refuses the snapshot.
 */

/** The eight seeded fields of a birthday, and the three groups its line may switch off. */
const BIRTHDAY = {
  celebrantName: "Mateo",
  age: 7,
  date: "2026-12-05",
  time: "16:30",
  location: "Jardín Los Pinos",
  address: "Calle Reforma 123, Guadalajara",
  mainPhoto: "https://example.com/mateo.jpg",
  message: "Ven a celebrar conmigo.",
};

const BABY_SHOWER = {
  hosts: "Mariana y Lucía Ruiz",
  babyName: "Sofía",
  date: "2027-03-13",
  time: "12:00",
  location: "Jardín Las Palmas",
  address: "Av. de los Cedros 88, Ciudad de México",
  message: "¡Te esperamos para celebrar a Sofía!",
  rsvpContact: "Confirma con Mariana al 55 1234 5678",
};

const BAPTISM = {
  celebrantName: "Emilia",
  date: "2027-04-18",
  parents: "Lucía y Andrés Herrera",
  godparents: "Rosa y Miguel Duarte",
  ceremonyPlace: "Parroquia de San José",
  ceremonyAddress: "Calle Hidalgo 45, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Salón Aurora",
  receptionAddress: "Av. Constituyentes 210, Querétaro",
  receptionTime: "13:30",
  message: "Acompáñanos a celebrar su bautizo.",
  rsvpContact: "Confirma con Lucía al 55 8765 4321",
};

const XV = {
  celebrantName: "Valentina Ramírez",
  date: "2026-08-15",
  parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
  honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
  ceremonyPlace: "Parroquia de San Agustín",
  ceremonyAddress: "Calle de los Fresnos 132, Ciudad de México",
  ceremonyTime: "18:00",
  receptionPlace: "Jardín de los Olivos",
  receptionAddress: "Camino Real a Santa Fe 41, Ciudad de México",
  receptionTime: "20:30",
  dressCode: "Formal · etiqueta",
  message: "Hay días que se esperan toda una vida.",
  rsvpContact: "Adriana Solís · 55 8120 4471",
};

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
  dressCode: "Formal de etiqueta",
  message: "Nos encantaría celebrar contigo.",
  rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
};

/** One omittable group of a layout: the fields the API hides and the text that must then disappear. */
interface HiddenGroup {
  readonly group: string;
  readonly fields: readonly string[];
  readonly marker: RegExp;
  /** The `data-section` the block carries, when it has one. */
  readonly section?: string;
}

interface LayoutCase {
  readonly key: string;
  readonly Renderer: (props: {
    configuration: unknown;
    content: unknown;
    hiddenFields?: readonly string[];
  }) => ReactElement;
  readonly theme: string;
  readonly content: Record<string, unknown>;
  /** The essential text that must survive every omission: who celebrates, and the date. */
  readonly identity: readonly RegExp[];
  readonly groups: readonly HiddenGroup[];
}

const PLACES: HiddenGroup[] = [
  {
    group: "ceremony",
    fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"],
    marker: /Parroquia de San/,
    section: "ceremony",
  },
  {
    group: "reception",
    fields: ["receptionPlace", "receptionAddress", "receptionTime"],
    marker: /(Jardín de los Olivos|Hacienda San Gabriel|Salón Aurora)/,
    section: "reception",
  },
];

const LAYOUTS: readonly LayoutCase[] = [
  {
    key: "birthday-map-01",
    Renderer: BirthdayMapRenderer,
    theme: "dinosaurs",
    content: BIRTHDAY,
    identity: [/Mateo/, /5 de diciembre de 2026/],
    groups: [
      { group: "age", fields: ["age"], marker: /7 años/ },
      { group: "mainPhoto", fields: ["mainPhoto"], marker: /<img/ },
      {
        group: "message",
        fields: ["message"],
        marker: /Ven a celebrar conmigo/,
        section: "message",
      },
    ],
  },
  {
    key: "birthday-poster-01",
    Renderer: BirthdayPosterRenderer,
    theme: "dinosaurs",
    content: BIRTHDAY,
    identity: [/Mateo/, /5 de diciembre de 2026/],
    groups: [
      { group: "age", fields: ["age"], marker: /7 años/ },
      { group: "mainPhoto", fields: ["mainPhoto"], marker: /<img/ },
      {
        group: "message",
        fields: ["message"],
        marker: /Ven a celebrar conmigo/,
        section: "message",
      },
    ],
  },
  {
    key: "birthday-story-01",
    Renderer: BirthdayStoryRenderer,
    theme: "dinosaurs",
    content: BIRTHDAY,
    identity: [/Mateo/, /5 de diciembre de 2026/],
    groups: [
      { group: "age", fields: ["age"], marker: /7 años/ },
      { group: "mainPhoto", fields: ["mainPhoto"], marker: /<img/ },
      {
        group: "message",
        fields: ["message"],
        marker: /Ven a celebrar conmigo/,
        section: "message",
      },
    ],
  },
  {
    key: "baby-shower-classic-01",
    Renderer: BabyShowerClassicRenderer,
    theme: "teddy-honey",
    content: BABY_SHOWER,
    identity: [/Sofía/, /13 de marzo de 2027/],
    groups: [
      {
        group: "message",
        fields: ["message"],
        marker: /Te esperamos para celebrar a Sofía/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Confirma con Mariana/,
        section: "rsvp",
      },
    ],
  },
  {
    key: "baptism-classic-01",
    Renderer: BaptismClassicRenderer,
    theme: "dove-olive",
    content: BAPTISM,
    identity: [/Emilia/, /18 de abril de 2027/],
    groups: [
      { group: "parents", fields: ["parents"], marker: /Lucía y Andrés Herrera/ },
      { group: "godparents", fields: ["godparents"], marker: /Rosa y Miguel Duarte/ },
      ...PLACES,
      {
        group: "message",
        fields: ["message"],
        marker: /Acompáñanos a celebrar su bautizo/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Confirma con Lucía/,
        section: "rsvp",
      },
    ],
  },
  {
    key: "baptism-arch-01",
    Renderer: BaptismArchRenderer,
    theme: "blush-gold",
    content: BAPTISM,
    identity: [/Emilia/, /18 de abril de 2027/],
    groups: [
      { group: "parents", fields: ["parents"], marker: /Lucía y Andrés Herrera/ },
      { group: "godparents", fields: ["godparents"], marker: /Rosa y Miguel Duarte/ },
      ...PLACES,
      {
        group: "message",
        fields: ["message"],
        marker: /Acompáñanos a celebrar su bautizo/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Confirma con Lucía/,
        section: "rsvp",
      },
    ],
  },
  {
    key: "baptism-ornamental-01",
    Renderer: BaptismOrnamentalRenderer,
    theme: "blush-gold",
    content: BAPTISM,
    identity: [/Emilia/, /18 de abril de 2027/],
    groups: [
      { group: "parents", fields: ["parents"], marker: /Lucía y Andrés Herrera/ },
      { group: "godparents", fields: ["godparents"], marker: /Rosa y Miguel Duarte/ },
      ...PLACES,
      {
        group: "message",
        fields: ["message"],
        marker: /Acompáñanos a celebrar su bautizo/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Confirma con Lucía/,
        section: "rsvp",
      },
    ],
  },
  {
    key: "xv-arch-01",
    Renderer: XVArchRenderer,
    theme: "blush-gold",
    content: XV,
    identity: [/Valentina Ramírez/, /15 de agosto de 2026/],
    groups: [
      { group: "parents", fields: ["parents"], marker: /Miguel Ramírez Alcántara/ },
      { group: "honorSponsors", fields: ["honorSponsors"], marker: /Joaquín Esquivel del Valle/ },
      ...PLACES,
      { group: "dressCode", fields: ["dressCode"], marker: /Formal · etiqueta/ },
      {
        group: "message",
        fields: ["message"],
        marker: /Hay días que se esperan toda una vida/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Adriana Solís · 55 8120 4471/,
        section: "rsvp",
      },
    ],
  },
  {
    key: "xv-ornamental-01",
    Renderer: XVOrnamentalRenderer,
    theme: "blush-gold",
    content: XV,
    identity: [/Valentina Ramírez/, /15 de agosto de 2026/],
    groups: [
      { group: "parents", fields: ["parents"], marker: /Miguel Ramírez Alcántara/ },
      { group: "honorSponsors", fields: ["honorSponsors"], marker: /Joaquín Esquivel del Valle/ },
      ...PLACES,
      { group: "dressCode", fields: ["dressCode"], marker: /Formal · etiqueta/ },
      {
        group: "message",
        fields: ["message"],
        marker: /Hay días que se esperan toda una vida/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Adriana Solís · 55 8120 4471/,
        section: "rsvp",
      },
    ],
  },
  {
    key: "wedding-arch-01",
    Renderer: WeddingArchRenderer,
    theme: "blush-gold",
    content: WEDDING,
    identity: [/Ana Sofía/, /12 de septiembre de 2026/],
    groups: [
      ...PLACES,
      { group: "dressCode", fields: ["dressCode"], marker: /Formal de etiqueta/ },
      {
        group: "message",
        fields: ["message"],
        marker: /Nos encantaría celebrar contigo/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Confirma con Ana Sofía/,
        section: "rsvp",
      },
    ],
  },
  {
    key: "wedding-ornamental-01",
    Renderer: WeddingOrnamentalRenderer,
    theme: "blush-gold",
    content: WEDDING,
    identity: [/Ana Sofía/, /12 de septiembre de 2026/],
    groups: [
      ...PLACES,
      { group: "dressCode", fields: ["dressCode"], marker: /Formal de etiqueta/ },
      {
        group: "message",
        fields: ["message"],
        marker: /Nos encantaría celebrar contigo/,
        section: "message",
      },
      {
        group: "rsvpContact",
        fields: ["rsvpContact"],
        marker: /Confirma con Ana Sofía/,
        section: "rsvp",
      },
    ],
  },
];

/** The content without the fields of one hidden group, as the API's projection sends it. */
function omitted(
  content: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const copy = { ...content };
  for (const field of fields) {
    delete copy[field];
  }
  return copy;
}

function render(layout: LayoutCase, hiddenFields: readonly string[] = []): string {
  const props = {
    configuration: { componentKey: layout.key, theme: layout.theme },
    content: omitted(
      layout.content,
      layout.groups
        .filter((group) => group.fields.every((field) => hiddenFields.includes(field)))
        .flatMap((group) => group.fields),
    ),
    ...(hiddenFields.length === 0 ? {} : { hiddenFields }),
  };

  return renderToStaticMarkup(createElement(layout.Renderer, props));
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

describe("hiddenFieldsOf", () => {
  /** The omittable groups of each seeded line (S8.4), repeated here as literals on purpose. */
  const FAMILIES = [
    {
      family: "birthday",
      groups: [
        ["age", ["age"]],
        ["mainPhoto", ["mainPhoto"]],
        ["message", ["message"]],
      ],
    },
    {
      family: "babyShower",
      groups: [
        ["message", ["message"]],
        ["rsvpContact", ["rsvpContact"]],
      ],
    },
    {
      family: "baptism",
      groups: [
        ["parents", ["parents"]],
        ["godparents", ["godparents"]],
        ["ceremony", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
        ["reception", ["receptionPlace", "receptionAddress", "receptionTime"]],
        ["message", ["message"]],
        ["rsvpContact", ["rsvpContact"]],
      ],
    },
    {
      family: "xv",
      groups: [
        ["parents", ["parents"]],
        ["honorSponsors", ["honorSponsors"]],
        ["ceremony", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
        ["reception", ["receptionPlace", "receptionAddress", "receptionTime"]],
        ["dressCode", ["dressCode"]],
        ["message", ["message"]],
        ["rsvpContact", ["rsvpContact"]],
      ],
    },
    {
      family: "wedding",
      groups: [
        ["ceremony", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
        ["reception", ["receptionPlace", "receptionAddress", "receptionTime"]],
        ["dressCode", ["dressCode"]],
        ["message", ["message"]],
        ["rsvpContact", ["rsvpContact"]],
      ],
    },
  ] as const;

  it("mirrors the API rule on the seeded groups, in the schema's order", () => {
    for (const { family, groups } of FAMILIES) {
      const schema = {
        "x-omittable": groups.map(([key, fields]) => ({ key, fields: [...fields] })),
        "x-require-one": [],
      };
      const omitted = groups.map(([key]) => key);
      const lastGroup = groups[groups.length - 1];

      assert.deepEqual(
        hiddenFieldsOf(schema, { omittedSections: omitted }),
        groups.flatMap(([, fields]) => [...fields]),
        family,
      );
      // The last group alone: its own fields, and nothing else.
      assert.ok(lastGroup, family);
      assert.deepEqual(
        hiddenFieldsOf(schema, { omittedSections: [lastGroup[0]] }),
        [...lastGroup[1]],
        family,
      );
    }
  });

  it("answers nothing for a version without the extension, a list without keys, or an unknown key", () => {
    const schema = { properties: {} };

    assert.deepEqual(hiddenFieldsOf(schema, { omittedSections: ["message"] }), []);
    assert.deepEqual(hiddenFieldsOf({ "x-omittable": [] }, { omittedSections: ["message"] }), []);
    assert.deepEqual(
      hiddenFieldsOf({ "x-omittable": [{ key: "message", fields: ["message"] }] }, {}),
      [],
    );
    assert.deepEqual(
      hiddenFieldsOf(
        { "x-omittable": [{ key: "message", fields: ["message"] }] },
        {
          omittedSections: ["godparents", 7],
        },
      ),
      [],
    );
  });

  it("names a field once even when the list repeats its key", () => {
    assert.deepEqual(
      hiddenFieldsOf(
        { "x-omittable": [{ key: "message", fields: ["message"] }] },
        {
          omittedSections: ["message", "message"],
        },
      ),
      ["message"],
    );
  });
});

describe("the content reader with a hidden field", () => {
  const { message: _message, ...withoutMessage } = WEDDING;

  it("reads a hidden required field as absent instead of refusing the snapshot (S8.3)", () => {
    const parsed = parseWeddingArchContent(withoutMessage, WEDDING_ARCH_COMPONENT_KEY, ["message"]);

    assert.equal(parsed.message, "");
    assert.equal(parsed.coupleNameOne, "Ana Sofía");
  });

  it("keeps refusing a missing field the hidden list does not cover (S8.3)", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseWeddingArchContent(withoutMessage, WEDDING_ARCH_COMPONENT_KEY, ["dressCode"]),
      ),
      ["content.message must be a non-empty string"],
    );
    assert.deepEqual(
      issuesOf(() => parseWeddingArchContent(withoutMessage)),
      ["content.message must be a non-empty string"],
    );
  });

  it("reads a hidden number and photo as absent for a birthday", () => {
    const { age: _age, mainPhoto: _mainPhoto, ...rest } = BIRTHDAY;

    const parsed = parseBirthdayMapContent(rest, ["age", "mainPhoto"]);

    assert.equal(parsed.age, undefined);
    assert.equal(parsed.mainPhoto, undefined);
    assert.deepEqual(
      issuesOf(() => parseBirthdayMapContent(rest, ["message"])),
      [
        "content.age must be an integer from 1 to 120",
        "content.mainPhoto must be an http or https URL",
      ],
    );
  });
});

describe("every layout skips an omitted section", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} draws every block when nothing is omitted`, () => {
      const html = render(layout);

      for (const group of layout.groups) {
        assert.match(html, group.marker, `${layout.key}/${group.group}`);
      }
      for (const essential of layout.identity) {
        assert.match(html, essential, layout.key);
      }
    });

    for (const group of layout.groups) {
      it(`${layout.key} hides the ${group.group} block and keeps the rest`, () => {
        const html = render(layout, group.fields);

        assert.doesNotMatch(html, group.marker, `${layout.key}/${group.group}`);
        if (group.section !== undefined) {
          assert.equal(
            html.includes(`data-section="${group.section}"`),
            false,
            `${layout.key}/${group.group} section`,
          );
        }
        for (const essential of layout.identity) {
          assert.match(html, essential, `${layout.key}/${group.group}`);
        }
        // Every other block the layout draws is still there.
        for (const other of layout.groups) {
          if (other.group === group.group) {
            continue;
          }
          assert.match(
            html,
            other.marker,
            `${layout.key}/${other.group} after omitting ${group.group}`,
          );
        }
      });
    }

    it(`${layout.key} refuses a required field that stays shown and blank (S3)`, () => {
      // A blank message is refused, never silently hidden: only an omitted section may be empty.
      const issues = issuesOf(() =>
        renderToStaticMarkup(
          createElement(layout.Renderer, {
            configuration: { componentKey: layout.key, theme: layout.theme },
            content: { ...layout.content, message: "   " },
            hiddenFields: [],
          }),
        ),
      );

      assert.ok(
        issues.includes("content.message must be a non-empty string"),
        `${layout.key}: ${JSON.stringify(issues)}`,
      );
    });
  }
});

describe("the props check with hidden fields", () => {
  it("accepts a snapshot whose omitted section is hidden, and refuses it without the list", () => {
    const layout = LAYOUTS.find((entry) => entry.key === "wedding-arch-01");
    assert.ok(layout);
    const ceremony = layout.groups.find((group) => group.group === "ceremony");
    assert.ok(ceremony);
    const props = {
      configuration: { componentKey: layout.key, theme: layout.theme },
      content: omitted(layout.content, ceremony.fields),
    };

    assert.equal(rendererAcceptsProps(layout.key, props), false);
    assert.equal(
      rendererAcceptsProps(layout.key, { ...props, hiddenFields: ceremony.fields }),
      true,
    );
  });

  it("accepts a baby shower whose message is omitted", () => {
    const parsed = parseBabyShowerClassicContent(omitted(BABY_SHOWER, ["message"]), ["message"]);

    assert.equal(parsed.message, "");
    assert.equal(parsed.rsvpContact, BABY_SHOWER.rsvpContact);
  });
});
