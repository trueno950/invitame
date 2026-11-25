import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  accountAction,
  headingText,
  LANDING_COPY,
  LANDING_SECTION_IDS,
  landingPricing,
} from "./copy.ts";

/*
 * The launch landing (odd/tasks/launch-landing.md; S1-S6). The page sells the product that already
 * exists: the main action starts a new invitation, the gallery names the published occasion lines,
 * the pricing mirrors the seeded packages, the steps are written in the present tense, and the FAQ
 * answers the four owner questions. No copy may still present the product as coming soon.
 */

/** Every string of the landing copy, including the output of its few functions. */
function strings(value: unknown = LANDING_COPY): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value === "function") {
    return strings(value(2026));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => strings(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => strings(item));
  }
  return [];
}

type Node = Record<string, unknown>;

/** Every object of the landing copy, so actions are found wherever they sit. */
function objects(value: unknown = LANDING_COPY): Node[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => objects(item));
  }
  if (value && typeof value === "object") {
    return [value as Node, ...Object.values(value).flatMap((item) => objects(item))];
  }
  return [];
}

const ACTION_KINDS = new Set(["sign-in", "account", "create-invitation", "anchor"]);
const CREATE_HREF = "/cuenta/invitaciones/nueva";
const actions = () =>
  objects().filter((node) => "href" in node || ACTION_KINDS.has(node.kind as string));

const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ["handmade claim", /hech[ao]s? a mano/i],
  /* WhatsApp and Mercado Pago are real features of the product (`catalog-seed.ts`, `payments`). */
  [
    "unrelated brand name",
    /facebook|instagram|tiktok|telegram|messenger|google|apple|iphone|android|gmail|outlook/i,
  ],
  [
    "usage number",
    /confirmaron|\d+\s*(invitad|confirmad|cliente|usuari|persona|invitaci|celebraci|event)/i,
  ],
  ["waiting-room wording", /pr[oó]ximamente|muy pronto|estamos preparando|cuando abramos/i],
];

/** A verb in the simple future, such as «elegirás» or «estará»; `\b` would miss a final «á». */
const FUTURE_TENSE = /(?<!\p{L})\p{L}+(rás|rá|rán|remos)(?!\p{L})/u;

describe("landing copy", () => {
  it("never makes the forbidden claims", () => {
    const all = strings();
    assert.ok(all.length > 40, "expected the whole landing copy");
    for (const value of all) {
      for (const [reason, pattern] of FORBIDDEN) {
        assert.doesNotMatch(value, pattern, `${reason}: "${value}"`);
      }
    }
  });

  it("writes the whole landing in the present tense, without promising a future launch", () => {
    for (const value of strings()) {
      assert.doesNotMatch(value, FUTURE_TENSE, `not in the present tense: "${value}"`);
      assert.notEqual(value, "Próximamente");
    }
  });

  it("uses no em dash, no usted, and no empty string", () => {
    for (const value of strings()) {
      assert.ok(value.trim().length > 0, "empty string");
      assert.ok(!value.includes("—") && !value.includes("--"), value);
      assert.doesNotMatch(value, /\b(usted|ustedes|ingrese|elija|personalice)\b/i, value);
    }
  });

  it("sends the main action to the new-invitation form instead of a coming-soon label", () => {
    const { hero } = LANDING_COPY;
    assert.deepEqual(hero.primary, {
      kind: "create-invitation",
      label: "Crear mi invitación",
      href: CREATE_HREF,
    });
    assert.equal(headingText(hero.heading), "Invitaciones que enamoran desde el primer vistazo");
    assert.equal(hero.eyebrow, "Invitaciones digitales");
    assert.deepEqual(hero.secondary, {
      kind: "anchor",
      label: "Ver diseños",
      href: "#disenos",
    });
    assert.deepEqual(hero.notes, ["Sin contraseñas", "Pagas en pesos (MXN)", "Lista hoy mismo"]);
  });

  it("links every product action to a real destination", () => {
    const found = actions();
    assert.ok(found.length >= 5, "expected the landing actions");
    for (const action of found) {
      assert.ok(
        ACTION_KINDS.has(action.kind as string),
        `unknown action ${JSON.stringify(action)}`,
      );
      if (action.kind === "create-invitation") {
        assert.equal(action.href, CREATE_HREF);
        assert.ok(String(action.label).trim().length > 0, "an action without a label");
      } else if (action.kind === "sign-in") {
        assert.equal(action.label, "Ingresar");
        assert.equal(action.href, "/ingresar");
      } else if (action.kind === "anchor") {
        const target = String(action.href).slice(1);
        assert.ok(String(action.href).startsWith("#"), `anchor ${String(action.href)}`);
        assert.ok(
          (LANDING_SECTION_IDS as readonly string[]).includes(target),
          `anchor to a missing section: ${String(action.href)}`,
        );
      }
    }
  });

  it("offers the three navigation anchors and keeps «Ingresar» active", () => {
    const { nav, footer } = LANDING_COPY;
    assert.deepEqual(
      nav.links.map((link) => [link.label, link.href]),
      [
        ["Diseños", "#disenos"],
        ["Precios", "#precios"],
        ["Dudas", "#faq"],
      ],
    );
    assert.deepEqual(nav.signIn, { kind: "sign-in", label: "Ingresar", href: "/ingresar" });
    assert.deepEqual(
      footer.links.map((link) => link.href),
      nav.links.map((link) => link.href),
    );
  });

  it("names the five catalog occasions with their theme counts", () => {
    const { gallery } = LANDING_COPY;
    assert.equal(headingText(gallery.heading), "Diseños para cada celebración");
    assert.deepEqual(
      gallery.designs.map((design) => design.occasion),
      ["XV años", "Boda", "Cumpleaños", "Baby shower", "Bautizo"],
    );
    assert.deepEqual(
      gallery.designs.map((design) => [design.occasion, design.themeCount, design.detail]),
      [
        ["XV años", 8, "8 temas"],
        ["Boda", 8, "8 temas"],
        ["Cumpleaños", 8, "8 temas"],
        ["Baby shower", 8, "8 temas"],
        ["Bautizo", 6, "6 temas"],
      ],
    );
    for (const design of gallery.designs) {
      assert.deepEqual(
        design.action,
        { kind: "create-invitation", label: "Empezar", href: CREATE_HREF },
        `gallery action of ${design.occasion}`,
      );
    }
    for (const design of gallery.designs) {
      assert.ok(design.name.trim().length > 0, `a design without a name: ${design.occasion}`);
      if (design.occasion === "XV años" || design.occasion === "Boda") {
        assert.equal(design.name, "Línea elegante");
      }
    }
  });

  it("shows exactly the three seeded packages with their features and MXN prices", () => {
    const { pricing } = LANDING_COPY;
    assert.equal(headingText(pricing.heading), "Elige tu paquete");
    assert.deepEqual(
      pricing.packages.map((item) => [item.key, item.name, item.featured]),
      [
        ["basic", "Basic", false],
        ["premium", "Premium", true],
        ["deluxe", "Deluxe", false],
      ],
    );
    assert.deepEqual(
      pricing.packages.map((item) => item.features),
      [
        ["Cuenta regresiva", "Mapa", "Enlace de WhatsApp"],
        ["Todo lo de Basic", "Música", "Galería de fotos", "Confirmar asistencia (RSVP)"],
        ["Todo lo de Premium", "Mesa de regalos", "Lista de invitados", "Pase con código QR"],
      ],
    );
    for (const item of pricing.packages) {
      assert.deepEqual(item.action, {
        kind: "create-invitation",
        label: "Empezar",
        href: CREATE_HREF,
      });
    }
    assert.deepEqual(landingPricing, {
      basic: { price: "$199", currency: "MXN" },
      premium: { price: "$399", currency: "MXN" },
      deluxe: { price: "$599", currency: "MXN" },
    });
    assert.deepEqual(
      Object.keys(landingPricing).sort(),
      pricing.packages.map((item) => item.key).sort(),
      "every package needs a price",
    );
  });

  it("describes how it works in four present-tense steps", () => {
    const { steps } = LANDING_COPY;
    assert.equal(headingText(steps.heading), "Cómo funciona");
    assert.deepEqual(
      steps.items.map((item) => item.title),
      ["Elige un diseño", "Llena tus datos", "Paga y publica", "Comparte el enlace"],
    );
    for (const item of steps.items) {
      assert.ok(item.body.trim().length > 0, item.title);
    }
  });

  it("answers the four frequently asked questions", () => {
    const { faq } = LANDING_COPY;
    assert.equal(headingText(faq.heading), "Preguntas frecuentes");
    assert.deepEqual(
      faq.items.map((item) => item.question),
      [
        "¿Cuánto tiempo dura mi invitación?",
        "¿Cómo confirman mis invitados?",
        "¿Cómo pago?",
        "¿Puedo pedir un reembolso?",
      ],
    );
    const [duration, rsvp, payment, refund] = faq.items.map((item) => item.answer);
    assert.match(String(duration), /Basic 30 días/);
    assert.match(String(duration), /Premium 90 días/);
    assert.match(String(duration), /Deluxe 180 días/);
    assert.match(String(duration), /confirmación de asistencia/);
    assert.match(String(rsvp), /Premium y Deluxe/);
    assert.match(String(rsvp), /sin crear cuenta/);
    assert.match(String(payment), /tarjeta/);
    assert.match(String(payment), /Mercado Pago/);
    assert.match(String(payment), /pesos mexicanos/);
    assert.match(String(refund), /no es reembolsable/);
    assert.match(String(refund), /editarla o archivarla/);
  });
});

describe("landing account action", () => {
  it("offers «Ingresar» to /ingresar to a visitor without a session", () => {
    assert.deepEqual(accountAction(false), {
      kind: "sign-in",
      label: "Ingresar",
      href: "/ingresar",
    });
  });

  it("offers «Mi cuenta» to /cuenta to a signed-in customer instead of «Ingresar»", () => {
    assert.deepEqual(accountAction(true), { kind: "account", label: "Mi cuenta", href: "/cuenta" });
  });
});

describe("landing page source", () => {
  const files = [
    new URL("../../app/page.tsx", import.meta.url),
    ...readdirSync(new URL("../../app/_components/landing/", import.meta.url))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => new URL(`../../app/_components/landing/${name}`, import.meta.url)),
  ];

  it("takes every link target from the copy and renders no button", () => {
    assert.ok(files.length > 3, "expected the landing components");
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /href="/, `${file.pathname} has a literal link target`);
      assert.doesNotMatch(source, /<button\b/, `${file.pathname} renders a button`);
    }
  });

  it("renders every section that an anchor can scroll to", () => {
    const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const sections = readdirSync(new URL("../../app/_components/landing/", import.meta.url))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) =>
        readFileSync(new URL(`../../app/_components/landing/${name}`, import.meta.url), "utf8"),
      )
      .join("\n");
    for (const id of LANDING_SECTION_IDS) {
      assert.ok(
        page.includes(`id="${id}"`) || sections.includes(`id="${id}"`),
        `no element with id="${id}"`,
      );
    }
  });
});
