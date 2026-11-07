import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

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
      ["fonts/cormorant-garamond", "fonts/great-vibes", "fonts/jost"],
    );
    for (const family of families) {
      const license = readFileSync(join(family, "OFL.txt"), "utf8");
      assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    }
  });
});
