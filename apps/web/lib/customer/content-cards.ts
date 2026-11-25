import { EDITOR_COPY, INVITATION_COPY } from "./copy.ts";
import { missingRequiredNames } from "./editor-sections.ts";
import type { ContentField, ContentSection } from "./invitations.ts";

/**
 * The cards of the editor's «Contenido» tab (T2; S1-S4). A formal baptism declares fourteen fields and twelve of them
 * are required to publish, so the tab used to be one long column of inputs; here the template's own sections become a
 * short stack of cards, one open at a time, and each closed card says in one line what it already holds and in two or
 * three words what it still owes.
 *
 * Everything is decided from the pinned schema, never from the template's name:
 *
 * - the order and the meaning of a card are the sections `contentSections` already derives from the property names;
 * - the card's title is the section's own name, replaced only where one of `EDITOR_COPY.cards` reads better for the
 *   fields that section actually holds (a celebrant with parents becomes «Festejado y familia», a wedding's two names
 *   become «Pareja»);
 * - a date goes in the same row as its time, and a place in the same row as its address, detected from the property
 *   name (`date`/`time`, `ceremonyPlace`/`ceremonyAddress`) and from the control the schema asks for. Every other
 *   field gets a row of its own, so the grid always falls back to something readable;
 * - a card's state is the required fields of that card, counted by `missingRequiredNames` itself, so the sum of the
 *   cards is exactly the «N de M listos» the tab label and the first-steps card state; a card made only of optional
 *   fields says «Opcional · k de n» and never stops a publication;
 * - optional fields whose whole section is optional gather in one last «Extras opcionales» card, while an optional
 *   field that has a required sibling stays beside it, where the owner expects to find it.
 *
 * The summary is the filled values of the card joined in one line, and nothing else: a missing value is left out
 * instead of being replaced with a label, and the row is cut by the UI's own truncation, not by an invented ellipsis
 * here. This module is pure, so `node --test` proves every decision; the panel renders it.
 */

/** The role one property plays in the rows of its card, and the role it shares a row with. */
type RowRole = "place" | "address" | "date" | "time";

const PAIRED_WITH: Readonly<Record<RowRole, RowRole>> = {
  place: "address",
  address: "place",
  date: "time",
  time: "date",
};

/** The name endings that name a role, so `ceremonyPlace` and `ceremonyAddress` are the same pair (`ceremony`). */
const NAME_SUFFIX_ROLES: Readonly<Record<string, RowRole>> = {
  Address: "address",
  Place: "place",
  Date: "date",
  Time: "time",
};

/** The properties a celebration shares with the people it belongs to, which rename the celebrant's card. */
const FAMILY_FIELDS = [
  "parents",
  "godparents",
  "honorSponsors",
  "weddingSponsors",
  "firstFamilyParents",
  "secondFamilyParents",
  "chambelanes",
] as const;

/** The two names a wedding announces instead of one. */
const COUPLE_FIELDS = ["coupleNameOne", "coupleNameTwo"] as const;

/** The key of the last card, which is not a section of the template but the fields no section claims with a rule. */
export const EXTRAS_CARD_KEY = "extras";

/** One row of an open card: one field, or the two fields that share a row. */
export interface ContentCardRow {
  readonly fields: readonly ContentField[];
}

/** What a closed card says about itself. The optional one never counts as something that stops a publication. */
export type ContentCardState =
  | { readonly kind: "complete" }
  | { readonly kind: "missing"; readonly count: number; readonly names: readonly string[] }
  | { readonly kind: "optional"; readonly filled: number; readonly total: number };

/** One card of the «Contenido» tab: what it is called, what it holds, and what it still owes. */
export interface ContentCard {
  /** The section's own key, or `extras` for the last card. */
  readonly key: string;
  readonly title: string;
  readonly fields: readonly ContentField[];
  readonly rows: readonly ContentCardRow[];
  readonly summary: string;
  readonly state: ContentCardState;
}

interface FieldRole {
  readonly role: RowRole;
  readonly base: string;
}

/** The role of one field, from its name and from the control its schema property asks for. */
function roleOf(field: ContentField): FieldRole | undefined {
  for (const [suffix, role] of Object.entries(NAME_SUFFIX_ROLES)) {
    if (field.name.endsWith(suffix)) {
      return { role, base: field.name.slice(0, -suffix.length).toLowerCase() };
    }
  }
  if (field.name === "location") {
    return { role: "place", base: "" };
  }
  if (field.name === "address") {
    return { role: "address", base: "" };
  }
  if (field.input.kind === "date") {
    return { role: "date", base: "" };
  }

  return field.input.kind === "time" ? { role: "time", base: "" } : undefined;
}

/** The later field that shares this one's row, or -1 when it stands alone. Only a same-base partner pairs. */
function partnerOf(roles: readonly (FieldRole | undefined)[], index: number): number {
  const own = roles[index];

  if (own === undefined) {
    return -1;
  }

  const wanted = PAIRED_WITH[own.role];
  for (let candidate = index + 1; candidate < roles.length; candidate += 1) {
    const other = roles[candidate];

    if (other !== undefined && other.role === wanted && other.base === own.base) {
      return candidate;
    }
  }
  return -1;
}

/** The rows of one card: a date with its time, a place with its address, and every other field on its own. */
function rowsOf(fields: readonly ContentField[]): ContentCardRow[] {
  const roles = fields.map(roleOf);
  const paired = new Set<number>();
  const rows: ContentCardRow[] = [];

  for (const [index, field] of fields.entries()) {
    if (paired.has(index)) {
      continue;
    }

    const partner = partnerOf(roles, index);
    const match = partner === -1 ? undefined : fields[partner];

    if (match === undefined) {
      rows.push({ fields: [field] });
      continue;
    }
    paired.add(partner);
    rows.push({ fields: [field, match] });
  }
  return rows;
}

/**
 * Whether the owner already filled a field. The rule is `missingRequiredNames`'s own — a blank text is empty while a
 * `false` checkbox and a `0` are values — so it is asked there instead of being written a second time here.
 */
function isEmpty(field: ContentField, values: Readonly<Record<string, unknown>>): boolean {
  return missingRequiredNames([{ ...field, required: true }], values).length > 0;
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `15 de mayo de 2027` for a stored `2027-05-15`, and the text as typed when it is not a date. */
function readableDate(text: string): string {
  const match = ISO_DATE.exec(text);

  if (match === null) {
    return text;
  }

  const [, year, month, day] = match;
  const name = month === undefined ? undefined : MONTHS[Number(month) - 1];

  if (year === undefined || day === undefined || name === undefined) {
    return text;
  }
  return `${Number(day)} de ${name} de ${year}`;
}

/** The text one field contributes to its card's summary, or nothing while it is still empty. */
function summaryValue(
  field: ContentField,
  values: Readonly<Record<string, unknown>>,
): string | undefined {
  const value = values[field.name];

  // A checkbox has no text of its own: it says its label once it is on, and nothing while it is off.
  if (field.input.kind === "checkbox") {
    return value === true ? field.label : undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value).replace(/\s+/gu, " ").trim();

  if (text === "") {
    return undefined;
  }
  return field.input.kind === "date" ? readableDate(text) : text;
}

/** The one line a closed card shows: the values it already holds, and no word for the ones it does not. */
function summaryOf(
  fields: readonly ContentField[],
  values: Readonly<Record<string, unknown>>,
): string {
  const parts = fields
    .map((field) => summaryValue(field, values))
    .filter((part): part is string => part !== undefined);

  return parts.length === 0 ? EDITOR_COPY.cards.summaryEmpty : parts.join(" · ");
}

/** Whether one of the card's fields is required to publish, which is what makes its optional siblings stay. */
function holdsRequired(fields: readonly ContentField[]): boolean {
  return fields.some((field) => field.required);
}

function holds(fields: readonly ContentField[], name: string): boolean {
  return fields.some((field) => field.name === name);
}

function holdsRole(fields: readonly ContentField[], role: RowRole): boolean {
  return fields.some((field) => roleOf(field)?.role === role);
}

/** The card's title: the section's own name unless one of the copy's own reads better for what it holds. */
function cardTitle(section: ContentSection): string {
  const fields = section.fields;
  const family = FAMILY_FIELDS.some((name) => holds(fields, name));

  switch (section.key) {
    case "celebrant":
      if (COUPLE_FIELDS.some((name) => holds(fields, name))) {
        return family ? EDITOR_COPY.cards.coupleFamily : EDITOR_COPY.cards.couple;
      }
      if (holds(fields, "hosts")) {
        return EDITOR_COPY.cards.hosts;
      }
      return family ? EDITOR_COPY.cards.celebrantFamily : INVITATION_COPY.sectionCelebrant;
    case "when":
      return holdsRole(fields, "date") && holdsRole(fields, "time")
        ? EDITOR_COPY.cards.when
        : INVITATION_COPY.sectionWhen;
    case "where":
      return holdsRole(fields, "place") && holdsRole(fields, "address")
        ? EDITOR_COPY.cards.where
        : INVITATION_COPY.sectionWhere;
    case "ceremony":
      return INVITATION_COPY.sectionCeremony;
    case "reception":
      return INVITATION_COPY.sectionReception;
    case "content":
      if (!holds(fields, "message")) {
        return INVITATION_COPY.sectionContent;
      }
      if (holds(fields, "rsvpContact")) {
        return EDITOR_COPY.cards.contentContact;
      }
      return holds(fields, "mainPhoto")
        ? EDITOR_COPY.cards.contentPhoto
        : EDITOR_COPY.cards.contentMessage;
    default:
      return INVITATION_COPY.sectionOther;
  }
}

/** What a card owes: its own required fields by the tab label's rule, or its progress while it is all optional. */
function stateOf(
  fields: readonly ContentField[],
  values: Readonly<Record<string, unknown>>,
): ContentCardState {
  const required = fields.filter((field) => field.required);

  if (required.length === 0) {
    return {
      kind: "optional",
      filled: fields.filter((field) => !isEmpty(field, values)).length,
      total: fields.length,
    };
  }

  const names = missingRequiredNames(required, values);
  return names.length === 0
    ? { kind: "complete" }
    : { kind: "missing", count: names.length, names };
}

/** The words of a card's state, always written out so the state never depends on color alone. */
export function cardStateText(state: ContentCardState): string {
  switch (state.kind) {
    case "complete":
      return EDITOR_COPY.cards.stateComplete;
    case "missing":
      return state.count === 1
        ? EDITOR_COPY.cards.stateMissingOne
        : EDITOR_COPY.cards.stateMissing(state.count);
    case "optional":
      return EDITOR_COPY.cards.stateOptional(state.filled, state.total);
  }
}

function cardOf(
  key: string,
  title: string,
  fields: readonly ContentField[],
  rows: readonly ContentCardRow[],
  values: Readonly<Record<string, unknown>>,
): ContentCard {
  return {
    key,
    title,
    fields,
    rows,
    summary: summaryOf(fields, values),
    state: stateOf(fields, values),
  };
}

/**
 * The cards of «Contenido», in the order the sections appear. A section that requires nothing does not become a card
 * of its own: its fields gather in the last «Extras opcionales» card, because a card that cannot stop a publication
 * should not sit between the ones that can. A section with at least one required field keeps all of its own fields,
 * optional ones included, where the owner typed them.
 */
export function contentCards(
  sections: readonly ContentSection[],
  values: Readonly<Record<string, unknown>>,
): ContentCard[] {
  const cards: ContentCard[] = [];
  const extras: ContentField[] = [];
  const extrasRows: ContentCardRow[] = [];

  for (const section of sections) {
    if (holdsRequired(section.fields)) {
      cards.push(
        cardOf(section.key, cardTitle(section), section.fields, rowsOf(section.fields), values),
      );
      continue;
    }
    extras.push(...section.fields);
    extrasRows.push(...rowsOf(section.fields));
  }

  if (extras.length > 0) {
    cards.push(cardOf(EXTRAS_CARD_KEY, EDITOR_COPY.cards.extras, extras, extrasRows, values));
  }
  return cards;
}

/**
 * The card the tab opens with: the first one that still owes something, so the owner lands where the work is, and the
 * first card when the whole tab is complete. Nothing at all for a template that declares no field.
 */
export function defaultOpenCardKey(cards: readonly ContentCard[]): string | undefined {
  const missing = cards.find((card) => card.state.kind === "missing");

  return (missing ?? cards[0])?.key;
}

/**
 * The card that holds one field, which is the card a missing-field link opens (T1; S2.4). A field the template does not
 * declare, or a tab with no card at all, answers nothing instead of guessing a card to open.
 */
export function cardHoldingField(
  cards: readonly ContentCard[],
  name: string,
): ContentCard | undefined {
  return cards.find((card) => card.fields.some((field) => field.name === name));
}
