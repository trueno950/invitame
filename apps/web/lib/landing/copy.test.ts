import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { headingText, LANDING_COPY, LANDING_SECTION_IDS } from "./copy.ts";

/*
 * The landing is an honest pre-launch page (M2 T8l; S37, L45): no copy claims a feature that does not
 * exist yet, «Ingresar» is the only active product action, and every other product action is
 * labeled «Próximamente» without going anywhere. In-page anchors are allowed.
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

const ACTION_KINDS = new Set(["sign-in", "coming-soon", "anchor"]);
const actions = () =>
  objects().filter((node) => "href" in node || ACTION_KINDS.has(node.kind as string));

const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ["handmade claim", /hech[ao]s? a mano/i],
  [
    "brand name",
    /whats\s?app|facebook|instagram|tiktok|telegram|messenger|google|apple|iphone|android|gmail|outlook/i,
  ],
  [
    "usage number",
    /confirmaron|\d+\s*(invitad|confirmad|cliente|usuari|persona|invitaci|celebraci|event)/i,
  ],
  ["active creation action", /crear mi invitaci[oó]n/i],
  ["active design action", /^ver diseños?$/i],
];

/** A verb in the simple future, such as «elegirás» or «estará»; `\b` would miss a final «á». */
const FUTURE_TENSE = /(?<!\p{L})\p{L}+(rás|rá|rán|remos)(?!\p{L})/u;

/** An in-page anchor only scrolls; its label must not pose as a product action. */
const PRODUCT_VERB = /^(ver diseños?$|crear|personaliza|comparte|confirma|env[ií]a)/i;

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

  it("uses no em dash, no usted, and no empty string", () => {
    for (const value of strings()) {
      assert.ok(value.trim().length > 0, "empty string");
      assert.ok(!value.includes("—") && !value.includes("--"), value);
      assert.doesNotMatch(value, /\b(usted|ustedes|ingrese|elija|personalice)\b/i, value);
    }
  });

  it("labels every product action other than «Ingresar» as «Próximamente», with nowhere to go", () => {
    const found = actions();
    const comingSoon = found.filter((action) => action.kind === "coming-soon");
    assert.ok(comingSoon.length >= 4, "expected the sample designs to be coming soon");
    for (const action of found) {
      assert.ok(
        ACTION_KINDS.has(action.kind as string),
        `unknown action ${JSON.stringify(action)}`,
      );
      if (action.kind === "coming-soon") {
        assert.equal(action.label, "Próximamente");
        assert.ok(
          !("href" in action),
          `a coming-soon action must not link: ${JSON.stringify(action)}`,
        );
      }
    }
  });

  it("links product actions only to /ingresar, and anchors only to sections of the page", () => {
    const found = actions();
    const signIn = found.filter((action) => action.kind === "sign-in");
    assert.ok(signIn.length >= 1, "expected «Ingresar»");
    for (const action of found) {
      if (action.kind === "anchor") {
        const target = String(action.href).slice(1);
        assert.doesNotMatch(String(action.label), PRODUCT_VERB, `anchor posing as an action`);
        assert.ok(String(action.href).startsWith("#"), `anchor ${String(action.href)}`);
        assert.ok(
          (LANDING_SECTION_IDS as readonly string[]).includes(target),
          `anchor to a missing section: ${String(action.href)}`,
        );
      } else if (action.kind === "sign-in") {
        assert.equal(action.label, "Ingresar");
        assert.equal(action.href, "/ingresar");
      } else {
        assert.ok(!("href" in action));
      }
    }
  });

  it("presents the gallery as sample designs that are coming soon", () => {
    const { gallery } = LANDING_COPY;
    assert.equal(headingText(gallery.heading), "Diseños de muestra");
    assert.equal(gallery.badge, "Próximamente");
    assert.equal(gallery.designs.length, 4);
    for (const design of gallery.designs) {
      assert.deepEqual(design.action, { kind: "coming-soon", label: "Próximamente" });
    }
  });

  it("describes the steps in the future tense under «Así funcionará»", () => {
    const { steps } = LANDING_COPY;
    assert.equal(headingText(steps.heading), "Así funcionará");
    for (const value of [steps.intro, ...steps.items.flatMap((step) => [step.title, step.body])]) {
      assert.match(value, FUTURE_TENSE, `not in the future tense: "${value}"`);
    }
  });

  it("labels the guest phone and its features as an example of what is coming", () => {
    const { experience } = LANDING_COPY;
    assert.match(experience.phoneLabel, /^Ejemplo/);
    assert.match(experience.phoneBadge, /Ejemplo/);
    for (const perk of experience.perks) {
      assert.match(perk.body, FUTURE_TENSE, perk.body);
    }
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
});
