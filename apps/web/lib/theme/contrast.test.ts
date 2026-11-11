import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { errorNote, statusNote } from "../../app/_components/ui.ts";
import { adminErrorNote, adminStatusNote } from "../../app/admin/_components/admin-ui.ts";
import { contrastRatio, themeColor, themeColors } from "./contrast.ts";

/**
 * Contrast of the S35 theme tokens (M2 T8t; L41): text meets WCAG AA (4.5:1) and component borders
 * reach 3:1. The tokens are read from the `@theme` block of `app/globals.css`, the single source of
 * every color, so a token change that breaks a pair fails here.
 */
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const colors = themeColors(css);
const color = (name: string) => themeColor(colors, name);

const TEXT_MINIMUM = 4.5;
const BORDER_MINIMUM = 3;

/** The `text-*` and `bg-*` color tokens of a class list, such as a note in `ui.ts`. */
function noteColors(classes: string) {
  const tokens = (prefix: string) =>
    classes
      .split(/\s+/)
      .filter((name) => name.startsWith(prefix))
      .map((name) => name.slice(prefix.length))
      .filter((name) => colors.has(name));
  const [text, ...extraText] = tokens("text-");
  const [background, ...extraBackground] = tokens("bg-");
  assert.ok(text && extraText.length === 0, `expected one text color token in "${classes}"`);
  assert.ok(
    background && extraBackground.length === 0,
    `expected one background color token in "${classes}"`,
  );
  return { text, background };
}

describe("contrastRatio", () => {
  test("follows the WCAG relative-luminance formula", () => {
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
    assert.equal(contrastRatio("#fff", "#000"), 21);
    // #767676 is the lightest gray that passes AA on white; #777777 just fails.
    assert.ok(contrastRatio("#767676", "#ffffff") >= TEXT_MINIMUM);
    assert.ok(contrastRatio("#777777", "#ffffff") < TEXT_MINIMUM);
  });

  test("is symmetric", () => {
    assert.equal(contrastRatio("#3b1424", "#fff7f5"), contrastRatio("#fff7f5", "#3b1424"));
  });

  test("rejects a value that is not a hex color", () => {
    assert.throws(
      () => contrastRatio("rebeccapurple", "#ffffff"),
      /Not a hex color: rebeccapurple/,
    );
  });
});

describe("theme tokens", () => {
  test("a missing token fails instead of passing silently", () => {
    const partial = themeColors("@theme {\n  --color-surface: #ffffff;\n}\n");
    assert.throws(
      () => themeColor(partial, "background"),
      /Missing theme color token --color-background/,
    );
  });

  test("only the @theme block counts", () => {
    const outside = themeColors(":root {\n  --color-background: #ffffff;\n}\n");
    assert.equal(outside.size, 0);
  });

  test("every theme color is a hex value", () => {
    assert.ok(colors.size > 0, "expected color tokens in the @theme block of app/globals.css");
    for (const [name, value] of colors) {
      assert.match(value, /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, `--color-${name} must be a hex color`);
    }
  });

  test("the S35 tokens keep their approved values", () => {
    assert.deepEqual(
      {
        background: color("background"),
        surface: color("surface"),
        ink: color("ink"),
        muted: color("muted"),
        primary: color("primary"),
        primaryDeep: color("primary-deep"),
        rose: color("rose"),
        rose50: color("rose-50"),
        rose100: color("rose-100"),
        gold: color("gold"),
        leaf: color("leaf"),
      },
      {
        background: "#fff7f5",
        surface: "#ffffff",
        ink: "#3b1424",
        muted: "#6b3a4c",
        primary: "#8c1c3a",
        primaryDeep: "#6e1530",
        rose: "#e9a3b5",
        rose50: "#fdeef2",
        rose100: "#f8d7e0",
        gold: "#c29a54",
        leaf: "#8faf8c",
      },
    );
  });
});

describe("text contrast is at least 4.5:1 (WCAG AA)", () => {
  const pairs: [label: string, foreground: string, background: string][] = [
    ["text on background", "ink", "background"],
    ["text on surface", "ink", "surface"],
    ["muted text on background", "muted", "background"],
    ["muted text on surface", "muted", "surface"],
    ["white on primary", "on-primary", "primary"],
    ["white on deep primary (pressed button)", "on-primary", "primary-deep"],
    ["primary on background", "primary", "background"],
    ["primary on surface", "primary", "surface"],
    ["placeholder on a field", "placeholder", "surface"],
    ["placeholder on an invalid field", "placeholder", "rose-50"],
    ["text on an invalid field", "ink", "rose-50"],
    ["pale pink on deep wine (landing card)", "rose-100", "primary-deep"],
    ["palest pink on deep wine (landing card)", "rose-50", "primary-deep"],
  ];

  for (const [label, foreground, background] of pairs) {
    test(label, () => {
      const ratio = contrastRatio(color(foreground), color(background));
      assert.ok(ratio >= TEXT_MINIMUM, `${label}: ${ratio.toFixed(2)}:1`);
    });
  }

  test("the on-primary token is white", () => {
    assert.equal(color("on-primary"), "#ffffff");
  });

  for (const [label, classes] of [
    ["status note", statusNote],
    ["error note", errorNote],
  ] as const) {
    test(`${label} text on its background`, () => {
      const { text, background } = noteColors(classes);
      const ratio = contrastRatio(color(text), color(background));
      assert.ok(
        ratio >= TEXT_MINIMUM,
        `${label} (${text} on ${background}): ${ratio.toFixed(2)}:1`,
      );
    });
  }
});

describe("administration tokens: text contrast is at least 4.5:1 (WCAG AA)", () => {
  const pairs: [label: string, foreground: string, background: string][] = [
    ["text on background", "admin-ink", "admin-background"],
    ["text on surface", "admin-ink", "admin-surface"],
    ["text on a subtle row", "admin-ink", "admin-subtle"],
    ["muted text on background", "admin-muted", "admin-background"],
    ["muted text on surface", "admin-muted", "admin-surface"],
    ["muted text on a subtle row", "admin-muted", "admin-subtle"],
    ["placeholder on a field", "admin-placeholder", "admin-surface"],
    ["placeholder on an invalid field", "admin-placeholder", "admin-danger-subtle"],
    ["button text on primary", "admin-on-primary", "admin-primary"],
    ["button text on pressed primary", "admin-on-primary", "admin-primary-deep"],
    ["danger badge", "admin-danger", "admin-danger-subtle"],
    ["danger text on surface", "admin-danger", "admin-surface"],
    ["success badge", "admin-success", "admin-success-subtle"],
    ["warning badge", "admin-warning", "admin-warning-subtle"],
  ];

  for (const [label, foreground, background] of pairs) {
    test(label, () => {
      const ratio = contrastRatio(color(foreground), color(background));
      assert.ok(ratio >= TEXT_MINIMUM, `${label}: ${ratio.toFixed(2)}:1`);
    });
  }

  for (const [label, classes] of [
    ["status note", adminStatusNote],
    ["error note", adminErrorNote],
  ] as const) {
    test(`${label} text on its background`, () => {
      const { text, background } = noteColors(classes);
      const ratio = contrastRatio(color(text), color(background));
      assert.ok(
        ratio >= TEXT_MINIMUM,
        `${label} (${text} on ${background}): ${ratio.toFixed(2)}:1`,
      );
    });
  }

  for (const background of ["admin-surface", "admin-background"]) {
    test(`field border on ${background} reaches 3:1`, () => {
      const ratio = contrastRatio(color("admin-input"), color(background));
      assert.ok(ratio >= BORDER_MINIMUM, `field border on ${background}: ${ratio.toFixed(2)}:1`);
    });
  }
});

describe("component borders reach 3:1", () => {
  for (const background of ["surface", "background"]) {
    test(`field border on ${background}`, () => {
      const ratio = contrastRatio(color("field-border"), color(background));
      assert.ok(ratio >= BORDER_MINIMUM, `field border on ${background}: ${ratio.toFixed(2)}:1`);
    });
  }
});
