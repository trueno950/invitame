import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",
  "docs/README.md",
  "docs/architecture/ai-operating-model.md",
  "docs/development/quality-gates.md",
];
const workflowHeadings = [
  "## Cycle at a glance",
  "## 1. Preflight and context loading",
  "## 2. Classify the request and set the boundary",
  "## 3. Resolve vocabulary and ambiguity",
  "## 4. Explore, design, and specify",
  "## 5. Implement one bounded slice",
  "## 6. Verify the observable outcome",
  "## 7. Synchronize documentation",
  "## 8. Review, approve, and hand off",
];

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (
      [".atl", ".codegraph", ".git", ".next", ".turbo", "dist", "node_modules"].includes(entry.name)
    ) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function localLinkPath(sourceFile, rawTarget) {
  let target = rawTarget.trim();

  if (target.startsWith("<") && target.includes(">")) {
    target = target.slice(1, target.indexOf(">"));
  } else {
    target = target.split(/\s+/, 1)[0];
  }

  if (
    target.length === 0 ||
    target.startsWith("#") ||
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:")
  ) {
    return null;
  }

  const withoutFragment = target.split(/[?#]/, 1)[0];
  return target.startsWith("/")
    ? path.resolve(root, `.${withoutFragment}`)
    : path.resolve(path.dirname(sourceFile), withoutFragment);
}

const failures = [];

for (const relativePath of requiredFiles) {
  if (!(await pathExists(path.join(root, relativePath)))) {
    failures.push(`Missing required documentation file: ${relativePath}`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.scripts?.["docs:check"] !== "node scripts/check-docs.mjs") {
  failures.push("package.json must expose docs:check as node scripts/check-docs.mjs");
}

const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
if (!workflow.includes("run: pnpm docs:check")) {
  failures.push(".github/workflows/ci.yml must run pnpm docs:check");
}

const operatingModelPath = path.join(root, "docs/architecture/ai-operating-model.md");
const operatingModel = await readFile(operatingModelPath, "utf8");
for (const heading of workflowHeadings) {
  if (!operatingModel.includes(heading)) {
    failures.push(`AI operating model is missing required section: ${heading}`);
  }
}

const markdownFiles = await collectMarkdownFiles(root);
for (const sourceFile of markdownFiles) {
  const content = await readFile(sourceFile, "utf8");
  const links = content.matchAll(/\[[^\]]+\]\(([^)\n]+)\)/g);

  for (const match of links) {
    const targetPath = localLinkPath(sourceFile, match[1]);
    if (targetPath && !(await pathExists(targetPath))) {
      failures.push(`Broken local link in ${path.relative(root, sourceFile)}: ${match[1].trim()}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Documentation consistency check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.info(
    `Documentation consistency check passed (${markdownFiles.length} Markdown files checked).`,
  );
}
