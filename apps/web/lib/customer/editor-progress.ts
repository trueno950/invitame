import { EDITOR_COPY, INVITATION_COPY } from "./copy.ts";
import { EDITOR_SECTION_PARAM, type EditorSection } from "./editor-sections.ts";

/**
 * The guidance of the invitation editor (T1; S2.1, S2.4, S2.5, S3): the three first steps with their progress, the next
 * step the phone's fixed bar offers, the name of the invitation in the editor's heading, and the link that opens one
 * missing field.
 *
 * Everything here is pure, so `node --test` proves it without a browser. The count of «N de M listos» is the count
 * `missingRequiredNames` already produces for the tab label, so the progress and the «faltan N» it replaces can never
 * disagree: `done` is the required fields that are filled, and `total` is the required fields the pinned schema
 * declares. The steps are the owner's own itinerary — the data, the photos, and the publication — and each one states
 * whether it is done, current, or still ahead in words, so nothing here depends on a color.
 */

/** The query parameter a missing-field link carries: the property name of the field it opens. */
export const EDITOR_FIELD_PARAM = "campo";

/** A property name of a template schema: a letter first, then letters, digits, and underscores. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * The field a page's search parameter names, or nothing. A repeated parameter, a hand-edited value, and one that is not
 * a property name all open no field at all, so a query never decides where the browser puts the focus beyond a field
 * the schema could declare.
 */
export function parseEditorField(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && FIELD_NAME.test(value) ? value : undefined;
}

/** The field of one query string, as the editor reads it on its first render. */
export function fieldFromSearch(search: string): string | undefined {
  return parseEditorField(new URLSearchParams(search).get(EDITOR_FIELD_PARAM) ?? undefined);
}

/**
 * The link of one missing field (S2.4): the editor's «Contenido» tab, with the parameter that opens the card holding
 * that field and focuses it. The parameters the page already carried and its fragment are kept, so a link built from a
 * page that arrived with a notice comes back to that page exactly as it was.
 */
export function missingFieldHref(detailPath: string, fieldName: string): string {
  const fragment = detailPath.indexOf("#");
  const base = fragment === -1 ? detailPath : detailPath.slice(0, fragment);
  const hash = fragment === -1 ? "" : detailPath.slice(fragment);
  const separator = base.includes("?") ? "&" : "?";

  return `${base}${separator}${EDITOR_SECTION_PARAM}=contenido&${EDITOR_FIELD_PARAM}=${encodeURIComponent(fieldName)}${hash}`;
}

/** What one first step says about itself, always in words as well as in tone (`stepStateLabel`). */
export type FirstStepState = "done" | "current" | "pending";

/** The three first steps of the editor, in the order they happen. */
export const FIRST_STEP_KEYS = ["datos", "fotos", "publicar"] as const;

export type FirstStepKey = (typeof FIRST_STEP_KEYS)[number];

/** One first step: what it is called, the tab it opens, and where it stands. */
export interface FirstStep {
  readonly key: FirstStepKey;
  readonly title: string;
  readonly section: EditorSection;
  readonly state: FirstStepState;
}

/** The progress of the editor, from the required fields of the pinned schema and the steps they belong to. */
export interface EditorProgress {
  /** The required fields already filled. */
  readonly done: number;
  /** The required fields the pinned schema declares. */
  readonly total: number;
  /** The bar's width, from 0 to 100; a template that requires nothing is complete, not empty. */
  readonly percent: number;
  /** «3 de 16 listos», or the whole sentence of a template that requires no field. */
  readonly label: string;
  readonly steps: readonly FirstStep[];
  /** The first step still ahead, which the phone's bar offers; nothing once it is published. */
  readonly next: FirstStep | undefined;
}

/** The inputs of `editorProgress`: the counts the page already reads, and the two facts the steps need. */
export interface EditorProgressInput {
  /** How many fields the pinned schema requires to publish. */
  readonly required: number;
  /** How many of them the values in the browser still leave empty. */
  readonly missing: number;
  /** The stored photos: the main photo and the gallery, counted together. */
  readonly photoCount: number;
  readonly published: boolean;
}

/** A count kept inside its own range, so a page can never state a negative or over-full progress. */
function clamp(value: number, total: number): number {
  return Math.min(Math.max(value, 0), total);
}

/** «4 de 12» beside the «Contenido» tab, and nothing when the template requires no field (T1; S2.1). */
export function progressMeta(done: number, total: number): string {
  return total <= 0 ? "" : `${clamp(done, total)} de ${total}`;
}

/** The words of a step's state, so the state is never only a color (S3). */
export function stepStateLabel(state: FirstStepState): string {
  switch (state) {
    case "done":
      return EDITOR_COPY.firstSteps.stateDone;
    case "current":
      return EDITOR_COPY.firstSteps.stateCurrent;
    case "pending":
      return EDITOR_COPY.firstSteps.statePending;
  }
}

/** The label of the phone's next-step action: the tab it opens, and «Publicar» for the publication itself (S2.5). */
export function nextStepLabel(section: EditorSection): string {
  return section === "publicar"
    ? EDITOR_COPY.tabs.publicar
    : EDITOR_COPY.firstSteps.next(EDITOR_COPY.tabs[section]);
}

/**
 * The three first steps and the progress above them (S2.1). The data step is done when the tab owes no required field,
 * the photo step when the invitation holds one photo, and the publication step when the invitation is published; the
 * first step that is not done is the current one, and everything after it is still ahead.
 */
export function editorProgress(input: EditorProgressInput): EditorProgress {
  const total = Math.max(input.required, 0);
  const done = clamp(total - input.missing, total);
  const pending: readonly FirstStepState[] = [
    input.missing <= 0 ? "done" : "pending",
    input.photoCount > 0 ? "done" : "pending",
    input.published ? "done" : "pending",
  ];
  const current = pending.indexOf("pending");
  const titles: Readonly<Record<FirstStepKey, string>> = {
    datos: EDITOR_COPY.firstSteps.content,
    fotos: EDITOR_COPY.firstSteps.photos,
    publicar: EDITOR_COPY.firstSteps.publish,
  };
  const sections: Readonly<Record<FirstStepKey, EditorSection>> = {
    datos: "contenido",
    fotos: "fotos",
    publicar: "publicar",
  };
  const steps: FirstStep[] = FIRST_STEP_KEYS.map((key, index) => {
    const state = pending[index] ?? "pending";

    return {
      key,
      title: titles[key],
      section: sections[key],
      state: state === "done" ? "done" : index === current ? "current" : "pending",
    };
  });

  return {
    done,
    total,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    label:
      total === 0
        ? EDITOR_COPY.firstSteps.progressEmpty
        : EDITOR_COPY.firstSteps.progress(done, total),
    steps,
    next: current === -1 ? undefined : steps[current],
  };
}

/**
 * One request to open a field: the field's name and a nonce, so asking for the same field twice focuses it twice. A
 * count instead of a flag keeps the request itself in the editor's state, where a second click is a new fact.
 */
export interface FieldFocusRequest {
  readonly field: string;
  readonly nonce: number;
}

/** The next request to focus `field`, counted from the previous one when it named the same field. */
export function fieldFocus(field: string, previous?: FieldFocusRequest): FieldFocusRequest {
  return { field, nonce: previous?.field === field ? previous.nonce + 1 : 0 };
}

/** The content properties that name the celebration in one line, in the order the heading prefers them. */
const NAMED_FIELDS = ["celebrantName", "babyName", "hosts"] as const;

/** A stored text value as one readable line, or nothing while it says nothing. */
function textOf(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.replace(/\s+/gu, " ").trim();

  return text === "" ? undefined : text;
}

/**
 * The heading of the editor (S2.1): the name the invitation announces — the celebrant, the baby, the couple, or the
 * hosts — and, while the content names nobody, «Tu invitación de <ocasión>`. The template's name is secondary and is
 * rendered above the heading by the page, so this never repeats it.
 */
export function invitationHeading(
  content: Readonly<Record<string, unknown>>,
  occasion: string | undefined,
  fallback: string = INVITATION_COPY.detailHeading,
): string {
  for (const name of NAMED_FIELDS) {
    const text = textOf(content[name]);

    if (text !== undefined) {
      return text;
    }
  }

  const one = textOf(content.coupleNameOne);
  const two = textOf(content.coupleNameTwo);

  if (one !== undefined && two !== undefined) {
    return `${one} y ${two}`;
  }

  const party = textOf(occasion);

  if (party === undefined) {
    return fallback;
  }
  // Lower only a capitalized ordinary word («Boda» → «boda»); an initialism such as «XV años» keeps its capitals.
  const firstWord = party.split(" ")[0] ?? party;
  const initialism = firstWord.length > 1 && firstWord === firstWord.toLocaleUpperCase("es-MX");

  return INVITATION_COPY.invitationOf(
    initialism ? party : `${party.charAt(0).toLocaleLowerCase("es-MX")}${party.slice(1)}`,
  );
}
