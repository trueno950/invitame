import { EDITOR_COPY } from "./copy.ts";
import type { ContentField } from "./invitations.ts";

/**
 * The tab model of the invitation editor (T2c; S1-S4). The draft is edited in five tabs on one page instead of one
 * long column of independent forms, so nothing typed in one tab is lost by saving another one, and the owner needs
 * noticeably less scrolling to fill and publish an invitation.
 *
 * Everything here is pure, so `node --test` proves it: which tabs exist, which one the URL names (and which one a
 * hand-edited or stale value falls back to), where a navigation comes back to, how much of the content a tab still
 * owes, and the key that tells the browser whether the stored draft it renders is the one the server just read.
 *
 * The tab is client state, never a navigation: the editor mirrors it into `?seccion=` with `history.replaceState`, and
 * every server action that redirects to the editor carries it back through `editorSectionTarget`, so an upload, a
 * checkout, a publish, an archive, or a guest write lands on the tab it came from.
 */

/** The five tabs, in the order the rail and the phone row show them. */
export const EDITOR_SECTIONS = [
  "contenido",
  "fotos",
  "funciones",
  "asistencia",
  "publicar",
] as const;

export type EditorSection = (typeof EDITOR_SECTIONS)[number];

/** The query parameter the editor mirrors its active tab into, and the one its redirects carry. */
export const EDITOR_SECTION_PARAM = "seccion";

/** The tab a URL that names none opens: the fields, which is where the invitation is filled. */
export const DEFAULT_EDITOR_SECTION: EditorSection = "contenido";

/**
 * Where a session that ended is sent. It repeats `CUSTOMER_SIGN_IN_PATH` (`invitations.ts`) rather than importing the
 * module that owns it, because this one is also compiled for the browser and that module belongs to the server.
 */
const SIGN_IN_PATH = "/ingresar";

/** Whether a value names a tab the editor has. */
export function isEditorSection(value: unknown): value is EditorSection {
  return typeof value === "string" && EDITOR_SECTIONS.some((section) => section === value);
}

/**
 * The tab a page's search parameter names. An absent value, a repeated one, and one this deployment does not know
 * (a hand-edited URL, a tab removed from the editor) all open the default tab instead of an empty page.
 */
export function parseEditorSection(value: string | string[] | undefined): EditorSection {
  return isEditorSection(value) ? value : DEFAULT_EDITOR_SECTION;
}

/** The tab of one query string, as the browser renders it on the first render of the editor. */
export function sectionFromSearch(search: string): EditorSection {
  return parseEditorSection(new URLSearchParams(search).get(EDITOR_SECTION_PARAM) ?? undefined);
}

/**
 * The tab a submitted editor form carried, or nothing when it carried none. A form outside the editor (the guest
 * list's own page, the preview) has no tab, so its redirect stays exactly what it was.
 */
export function sectionFromForm(form: FormData): EditorSection | undefined {
  const value = form.get(EDITOR_SECTION_PARAM);

  return isEditorSection(value) ? value : undefined;
}

/**
 * A redirect target with the tab the form came from appended. The sign-in page reads no tab, and a target that came
 * without one (a form outside the editor) is returned untouched, so no unrelated URL grows a parameter.
 */
export function editorSectionTarget(path: string, section: EditorSection | undefined): string {
  if (section === undefined || path === SIGN_IN_PATH) {
    return path;
  }

  const fragment = path.indexOf("#");
  const base = fragment === -1 ? path : path.slice(0, fragment);
  const hash = fragment === -1 ? "" : path.slice(fragment);
  const separator = base.includes("?") ? "&" : "?";

  // Built by hand instead of through `URLSearchParams`, so the parameters the target already carried stay exactly as
  // the page wrote them (an issue list such as `field:date` included) and only the tab is added.
  return `${base}${separator}${EDITOR_SECTION_PARAM}=${section}${hash}`;
}

/** What the «Asistencia» tab offers: the settings, the guest list, or neither. */
export type AttendanceTab = "settings" | "guest-list" | "none";

/**
 * The attendance tab of one invitation, read from the gated keys the owner read answered (S4). A package that grants
 * RSVP configures the deadline and the party limit; a package that grants only the guest list opens it, because each
 * guest answers from their own personal link; a package with neither shows a note instead of an empty tab, so the five
 * tabs never change shape under the owner's hands.
 */
export function attendanceTab(availableFeatures: readonly string[]): AttendanceTab {
  if (availableFeatures.includes("RSVP")) {
    return "settings";
  }

  return availableFeatures.includes("GUEST_LIST") ? "guest-list" : "none";
}

/** Whether a stored or typed value says something: a blank text and a missing value say nothing. */
function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }

  // A checkbox's `false` and a number's `0` are values the creator chose, not empty fields.
  return false;
}

/**
 * The required fields of the pinned template the draft still has empty, in the schema's own order. The count is
 * computed from the values the browser holds, so the «Contenido» tab says «faltan 3» while the owner types and
 * reaches zero without a reload. An optional field left empty is never counted.
 */
export function missingRequiredNames(
  fields: readonly ContentField[],
  values: Readonly<Record<string, unknown>>,
): string[] {
  return fields
    .filter((field) => field.required && isMissing(values[field.name]))
    .map((field) => field.name);
}

/** «falta 1», «faltan 3», and nothing at all when the tab owes nothing. */
export function missingMeta(count: number): string {
  if (count <= 0) {
    return "";
  }

  return count === 1 ? "falta 1" : `faltan ${count}`;
}

/** The tab's label with what it still owes after it: «Contenido · faltan 3», or just «Contenido». */
export function sectionTabLabel(section: EditorSection, meta: string): string {
  const label = EDITOR_COPY.tabs[section];

  return meta === "" ? label : `${label} · ${meta}`;
}

/**
 * The identity of the stored draft a client render started from. The editor mounts its fields from the server's
 * props once, and mounts them again only when a navigation answered a different stored draft (the main photo an
 * upload wrote into the content, for one): a save in flight never produces this key, so it never resets what the
 * owner is typing.
 */
export function editorSnapshotKey(input: unknown): string {
  return JSON.stringify(input);
}
