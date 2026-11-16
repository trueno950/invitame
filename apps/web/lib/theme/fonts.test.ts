import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

/**
 * Theme fonts without the network (M2 T8f; S43, L57): the web build must fetch no font, so no source
 * file loads fonts through Google's loader, and `app/layout.tsx` loads committed woff2 files through
 * `next/font/local`, each family next to its SIL Open Font License.
 */
const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const appDirectory = join(webRoot, "app");
const layoutSource = readFileSync(join(appDirectory, "layout.tsx"), "utf8");

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next"]);
// Built from parts so this file never holds the import it forbids.
const GOOGLE_FONT_LOADER = ["next", "font", "google"].join("/");
const googleLoaderImport = new RegExp(
  String.raw`(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']` +
    GOOGLE_FONT_LOADER.replaceAll("/", String.raw`\/`) +
    `["']`,
);

/** Every source file under `apps/web`, outside `node_modules` and `.next`, relative to it. */
function sourceFiles(directory: string = webRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(path);
    }
    return SOURCE_EXTENSIONS.test(entry.name) ? [relative(webRoot, path).split(sep).join("/")] : [];
  });
}

/** The relative woff2 paths that `app/layout.tsx` hands to `next/font/local`. */
function layoutFontPaths(): string[] {
  return [...layoutSource.matchAll(/path:\s*"(\.\/fonts\/[^"]+)"/g)].map(([, path]) => path ?? "");
}

/** Each font file of the layout with its declared weight: one ("400") or a range ("500 600"). */
function layoutFontWeights(): Array<{ path: string; weight: [number, number] }> {
  return [
    ...layoutSource.matchAll(/path:\s*"(\.\/fonts\/[^"]+)",\s*weight:\s*"(\d+)(?: (\d+))?"/g),
  ].map(([, path = "", low = "", high = low]) => ({ path, weight: [Number(low), Number(high)] }));
}

// The WOFF2 known-table tags, by the index a table directory entry stores (WOFF2 §5.1).
const WOFF2_KNOWN_TAGS = (
  "cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp hdmx kern " +
  "LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG_ sbix acnt avar " +
  "bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat " +
  "Gloc Feat Sill"
)
  .split(" ")
  .map((tag) => tag.replace("_", " "));

/** The decompressed tables of a single-font woff2 file, by tag (WOFF2 §4 to §5). */
function woff2Tables(font: Buffer): Map<string, Buffer> {
  const tableCount = font.readUInt16BE(12);
  let offset = 48;
  const base128 = () => {
    let value = 0;
    for (let byte = 0; byte < 5; byte += 1) {
      const next = font.readUInt8(offset++);
      value = value * 128 + (next & 0x7f);
      if ((next & 0x80) === 0) {
        return value;
      }
    }
    throw new Error("UIntBase128 longer than 5 bytes");
  };
  const directory: Array<{ tag: string; length: number }> = [];
  for (let index = 0; index < tableCount; index += 1) {
    const flags = font.readUInt8(offset++);
    let tag = WOFF2_KNOWN_TAGS[flags & 0x3f] ?? "";
    if ((flags & 0x3f) === 63) {
      tag = font.toString("latin1", offset, offset + 4);
      offset += 4;
    }
    const version = flags >> 6;
    const originalLength = base128();
    // glyf and loca are transformed unless their version is 3; every other table unless it is 0.
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    directory.push({ tag, length: transformed ? base128() : originalLength });
  }
  const data = brotliDecompressSync(font.subarray(offset, offset + font.readUInt32BE(20)));
  const tables = new Map<string, Buffer>();
  let start = 0;
  for (const { tag, length } of directory) {
    tables.set(tag, data.subarray(start, start + length));
    start += length;
  }
  assert.equal(start, data.length, "the table lengths add up to the decompressed stream");
  return tables;
}

/** The weights a font file can draw: its `wght` axis if it is variable, else its OS/2 weight class. */
function drawableWeights(font: Buffer): [number, number] {
  const tables = woff2Tables(font);
  const fvar = tables.get("fvar");
  if (fvar) {
    const axesOffset = fvar.readUInt16BE(4);
    const axisSize = fvar.readUInt16BE(10);
    for (let axis = 0; axis < fvar.readUInt16BE(8); axis += 1) {
      const record = axesOffset + axis * axisSize;
      if (fvar.toString("latin1", record, record + 4) === "wght") {
        return [fvar.readInt32BE(record + 4) / 65536, fvar.readInt32BE(record + 12) / 65536];
      }
    }
  }
  const os2 = tables.get("OS/2");
  assert.ok(os2, "a font without a wght axis has an OS/2 table");
  const weightClass = os2.readUInt16BE(4);
  return [weightClass, weightClass];
}

function covers([low, high]: [number, number], [declaredLow, declaredHigh]: [number, number]) {
  return low <= declaredLow && declaredHigh <= high;
}

/**
 * Each family folder with the license file google/fonts ships for it: `OFL.txt` for the SIL Open Font
 * License 1.1 families and `LICENSE.txt` for the Apache License 2.0 ones (T6b, T7b; S5, S8, S13).
 */
const FAMILY_LICENSES: ReadonlyArray<{
  folder: string;
  license: "OFL.txt" | "LICENSE.txt";
  text: RegExp;
}> = [
  { folder: "baloo-2", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "bangers", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "caveat", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "chewy", license: "LICENSE.txt", text: /Apache License/ },
  { folder: "cinzel-decorative", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "cormorant-garamond", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "fredoka", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "fraunces", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "great-vibes", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "josefin-sans", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "jost", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "lilita-one", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "lora", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "luckiest-guy", license: "LICENSE.txt", text: /Apache License/ },
  { folder: "nunito", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "pacifico", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "playfair-display", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "press-start-2p", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
  { folder: "quicksand", license: "OFL.txt", text: /SIL OPEN FONT LICENSE Version 1\.1/ },
];

/**
 * The guest theme display fonts (S8, S13): Latin woff2 files loaded without preloading. The nine faces of
 * T7b are the baby shower and themed baptism titles of `design/celebration-themes/`.
 */
const THEME_FONT_VARIABLES = [
  "--font-baloo-2",
  "--font-bangers",
  "--font-caveat",
  "--font-chewy",
  "--font-cinzel-decorative",
  "--font-fredoka",
  "--font-fraunces",
  "--font-josefin-sans",
  "--font-lilita-one",
  "--font-lora",
  "--font-luckiest-guy",
  "--font-nunito",
  "--font-pacifico",
  "--font-playfair-display",
  "--font-press-start-2p",
  "--font-quicksand",
] as const;

describe("theme font loading (S43)", () => {
  test("the import guard recognizes every form of the Google font loader import", () => {
    for (const statement of [
      `import { Jost } from "${GOOGLE_FONT_LOADER}";`,
      `import {Jost} from '${GOOGLE_FONT_LOADER}'`,
      `const fonts = await import("${GOOGLE_FONT_LOADER}");`,
      `const fonts = require("${GOOGLE_FONT_LOADER}");`,
    ]) {
      assert.match(statement, googleLoaderImport, statement);
    }
    assert.doesNotMatch(`import localFont from "next/font/local";`, googleLoaderImport);
  });

  test("no source file under apps/web imports the Google font loader", () => {
    const files = sourceFiles();
    assert.ok(files.includes("app/layout.tsx"), "the scan must reach app/layout.tsx");
    const offenders = files.filter((file) =>
      googleLoaderImport.test(readFileSync(join(webRoot, file), "utf8")),
    );
    assert.deepEqual(offenders, []);
  });

  test("the layout loads the theme fonts through next/font/local", () => {
    assert.match(layoutSource, /import localFont from "next\/font\/local";/);
    const css = readFileSync(join(appDirectory, "globals.css"), "utf8");
    for (const variable of ["--font-cormorant-garamond", "--font-great-vibes", "--font-jost"]) {
      assert.ok(css.includes(`var(${variable})`), `globals.css reads ${variable}`);
      assert.ok(layoutSource.includes(`variable: "${variable}"`), `the layout sets ${variable}`);
    }
  });

  test("the layout loads every guest theme display font without preloading it", () => {
    for (const variable of THEME_FONT_VARIABLES) {
      assert.ok(layoutSource.includes(`variable: "${variable}"`), `the layout sets ${variable}`);
    }
    assert.equal(
      [...layoutSource.matchAll(/preload:\s*false/g)].length,
      THEME_FONT_VARIABLES.length,
      "each theme display font is not preloaded",
    );
  });

  test("every font file the layout names is a committed woff2 file next to its license", () => {
    const paths = layoutFontPaths();
    assert.ok(paths.length > 0, "the layout names its font files");
    const families = new Set<string>();
    for (const path of paths) {
      assert.match(path, /^\.\/fonts\/[a-z0-9-]+\/[A-Za-z0-9-]+\.woff2$/);
      const file = join(appDirectory, path);
      assert.ok(existsSync(file), `${path} exists`);
      assert.equal(
        readFileSync(file).subarray(0, 4).toString("latin1"),
        "wOF2",
        `${path} is woff2`,
      );
      families.add(dirname(file));
    }
    assert.deepEqual(
      [...families].map((family) => relative(appDirectory, family).split(sep).join("/")).sort(),
      FAMILY_LICENSES.map(({ folder }) => `fonts/${folder}`).sort(),
      "the family folders are exactly the documented ones",
    );
    for (const family of families) {
      const folder = relative(appDirectory, family)
        .split(sep)
        .join("/")
        .replace(/^fonts\//, "");
      const expected = FAMILY_LICENSES.find(({ folder: name }) => name === folder);

      assert.ok(expected, `${folder} is a documented family`);
      const license = readFileSync(join(family, expected.license), "utf8");
      assert.match(license, expected.text, `${folder} ships its ${expected.license}`);
    }
  });

  test("every font file draws the whole weight range the layout declares for it", () => {
    const entries = layoutFontWeights();
    assert.deepEqual(
      entries.map(({ path }) => path),
      layoutFontPaths(),
      "every font file names its weight",
    );
    for (const { path, weight } of entries) {
      const drawable = drawableWeights(readFileSync(join(appDirectory, path)));
      assert.ok(
        covers(drawable, weight),
        `${path} draws ${drawable.join("-")}, declares ${weight.join("-")}`,
      );
    }
  });

  test("the weight check refuses a range or a weight that a file cannot draw", () => {
    const read = (path: string) => drawableWeights(readFileSync(join(appDirectory, "fonts", path)));
    const cormorant = read("cormorant-garamond/cormorant-garamond-latin-normal.woff2");
    const greatVibes = read("great-vibes/great-vibes-latin-normal.woff2");
    assert.ok(covers(cormorant, [500, 600]));
    assert.ok(!covers(cormorant, [200, 600]), "below the wght axis");
    assert.ok(!covers(cormorant, [500, 800]), "above the wght axis");
    assert.ok(covers(greatVibes, [400, 400]));
    assert.ok(!covers(greatVibes, [400, 500]), "a static file draws one weight only");
  });
});
