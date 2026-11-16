// The renderer registry is the API's explicit, compile-time allow-list of `componentKey` values. A
// published `TemplateVersion` may only name a key listed here, so the database never selects code: no
// dynamic import, no lookup by name, and no key is resolved from a catalog string. Adding a renderer
// means adding reviewed code in this directory, the matching web component in `apps/web`, and a new
// `TemplateVersion` that references the key; an existing version is never edited (AGENTS.md).
import {
  BABY_SHOWER_CLASSIC_COMPONENT_KEY,
  babyShowerClassicRenderer,
} from "./baby-shower-classic-01.renderer";
import {
  BAPTISM_CLASSIC_COMPONENT_KEY,
  baptismClassicRenderer,
} from "./baptism-classic-01.renderer";
import { BIRTHDAY_MAP_COMPONENT_KEY, birthdayMapRenderer } from "./birthday-map-01.renderer";
import {
  BIRTHDAY_POSTER_COMPONENT_KEY,
  birthdayPosterRenderer,
} from "./birthday-poster-01.renderer";
import { BIRTHDAY_STORY_COMPONENT_KEY, birthdayStoryRenderer } from "./birthday-story-01.renderer";
import type { RendererContract } from "./renderer-contract";

const RENDERERS: ReadonlyMap<string, RendererContract> = new Map([
  [BIRTHDAY_MAP_COMPONENT_KEY, birthdayMapRenderer],
  [BIRTHDAY_POSTER_COMPONENT_KEY, birthdayPosterRenderer],
  [BIRTHDAY_STORY_COMPONENT_KEY, birthdayStoryRenderer],
  [BABY_SHOWER_CLASSIC_COMPONENT_KEY, babyShowerClassicRenderer],
  [BAPTISM_CLASSIC_COMPONENT_KEY, baptismClassicRenderer],
]);

export function listRendererKeys(): readonly string[] {
  return [...RENDERERS.keys()];
}

/** Returns the contract for a registered key, or undefined. `Map` has no prototype lookups. */
export function findRenderer(key: string): RendererContract | undefined {
  return RENDERERS.get(key);
}

export interface TemplateVersionContractInput {
  readonly componentKey: unknown;
  readonly schema: unknown;
  readonly configuration: unknown;
}

export type TemplateVersionContractResult = { ok: true } | { ok: false; issues: string[] };

/** Checks that a version names a registered renderer and that its schema and configuration fit it. */
export function validateTemplateVersionContract(
  input: TemplateVersionContractInput,
): TemplateVersionContractResult {
  const { componentKey, schema, configuration } = input;

  if (typeof componentKey !== "string") {
    return { ok: false, issues: ["componentKey must be a string"] };
  }

  const renderer = findRenderer(componentKey);

  if (renderer === undefined) {
    return {
      ok: false,
      issues: [`componentKey ${JSON.stringify(componentKey)} is not a registered renderer`],
    };
  }

  const issues = [
    ...renderer.validateSchema(schema),
    ...renderer.validateConfiguration(configuration, componentKey),
  ];

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
