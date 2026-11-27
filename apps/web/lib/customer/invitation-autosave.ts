import { ITINERARY_MAX_ITEMS } from "../invitation-features/itinerary.ts";
import { deadlineInstant } from "../invitation-features/rsvp-deadline.ts";
import { isInvitationTimeZone } from "../invitation-features/time-zones.ts";
import { isCalendarDate, isClockTime, isPlainObject } from "../renderers/invitation-fields.ts";
import {
  type InvitationFailure,
  type InvitationFeatureInput,
  RSVP_PARTY_LIMIT_MAX,
  RSVP_PARTY_LIMIT_MIN,
  type RsvpSettings,
} from "../server/invitations-api.ts";
import {
  AUTOSAVE_COPY,
  FEATURE_ISSUE_COPY,
  INVITATION_ERROR_COPY,
  RSVP_SETTINGS_ISSUE_COPY,
} from "./copy.ts";
import { featureIssueCodes } from "./feature-issues.ts";
import { type ContentField, fieldLabel } from "./invitations.ts";
import { GIFT_REGISTRY_MAX_STORES } from "../invitation-features/gift-registry.ts";
import { LODGING_MAX_HOTELS } from "../invitation-features/lodging.ts";
import {
  type GiftRegistryDraft,
  giftRegistryDraftOf,
  giftRegistryPayloadOf,
} from "./gift-registry.ts";
import { type ItineraryDraftMoment, itineraryPayloadOf } from "./itinerary.ts";
import { type LivestreamDraft, livestreamPayloadOf } from "./livestream.ts";
import {
  type LodgingDraft,
  type LodgingDraftHotel,
  lodgingDraftOf,
  lodgingPayloadOf,
} from "./lodging.ts";
import { EMPTY_REMINDERS, type RemindersDraft, remindersPayloadOf } from "./reminders.ts";
import { OMITTED_SECTIONS_PROPERTY, parseOmittedSections } from "./omittable-sections.ts";
import { rsvpSettingsIssueCodes } from "./rsvp-issue.ts";

/**
 * The autosave of the invitation editor (T2a; S2, S4). The editor saves one field at a time, so a content save may
 * never replace the whole stored content: the action reads the content the API has at that instant, merges only the
 * fields the creator changed, and writes the result. That is how an autosave of the message never drops the photo
 * URL the upload wrote into the same content, and how a field written from another section survives.
 *
 * Everything here is pure: the merge, the validation of an untrusted payload, and the mapping of a refusal to the
 * Spanish result the status line shows. The server action that reads and writes lives in
 * `app/cuenta/invitaciones/autosave-actions.ts`, and the queue that debounces the changes lives in
 * `autosave-queue.ts`. Nothing in this module logs a value, and no payload text ever reaches a customer.
 */

/** The three independent save channels of the editor: each one has its own request and its own in-flight slot. */
export const AUTOSAVE_CHANNELS = ["content", "features", "rsvp"] as const;
export type AutosaveChannel = (typeof AUTOSAVE_CHANNELS)[number];

/** One field of a refused payload, named as the request named it, with the Spanish sentence to show. */
export interface AutosaveFieldIssue {
  readonly field: string;
  readonly message: string;
}

/**
 * Why a save did not happen:
 *
 * - `signed-out`: the session ended, so the UI offers a sign-in link instead of a retry;
 * - `invalid`: the payload or the API's validation refused a value, and `fieldIssues` names what to review;
 * - `unavailable`: the API could not be reached, or the template's fields could not be read, so a retry can work;
 * - `refused`: the API refused the write itself (an archived invitation, an invitation that is not this owner's).
 */
export type AutosaveFailureReason = "signed-out" | "invalid" | "unavailable" | "refused";

/** A save the API accepted: the instant this server saw it accepted, as the status line reads it. */
export interface AutosaveSaved {
  readonly ok: true;
  readonly savedAt: string;
}

/** A save that did not happen, with the Spanish message the status line shows. */
export interface AutosaveRefused {
  readonly ok: false;
  readonly reason: AutosaveFailureReason;
  readonly message: string;
  readonly fieldIssues?: readonly AutosaveFieldIssue[];
}

/** What one autosave action answers: a plain, serializable value the client can render. */
export type AutosaveResult = AutosaveSaved | AutosaveRefused;

/** The failure names the API answers for a value it refuses, which the editor shows field by field. */
const INVALID_FAILURES: ReadonlySet<string> = new Set([
  "validation",
  "content-invalid",
  "features-invalid",
  "rsvp-settings-invalid",
  "invalid-guest",
]);

/** The most fields one refusal is reported with, so a hostile body cannot grow the list. */
const MAX_FIELD_ISSUES = 8;

// The content side (S2, S4). A change names one field of the pinned template; `null` means the creator cleared it,
// so the merged content drops the key instead of keeping an empty value the guest would render.

/** One field the creator changed, as the payload asked to store it; `null` means "cleared". */
export interface ContentChange {
  readonly name: string;
  readonly value: unknown;
}

export type ContentChangesParse =
  | { readonly ok: true; readonly changes: readonly ContentChange[] }
  | { readonly ok: false; readonly fieldIssues: readonly AutosaveFieldIssue[] };

/** Whether a number is one the field's declared bounds accept. */
function withinBounds(field: ContentField, value: number): boolean {
  if (field.input.kind !== "number") {
    return true;
  }
  return (
    (field.input.min === undefined || value >= field.input.min) &&
    (field.input.max === undefined || value <= field.input.max)
  );
}

/** Whether a text is one the field's own control would accept: its bound, and its date or time shape. */
function readableText(field: ContentField, text: string): boolean {
  const { input } = field;

  if (input.kind === "date") {
    return isCalendarDate(text);
  }
  if (input.kind === "time") {
    return isClockTime(text);
  }
  if (input.kind === "text" || input.kind === "textarea" || input.kind === "url") {
    return input.maxLength === undefined || [...text].length <= input.maxLength;
  }
  return true;
}

/** The text a number control submits, which is the number it holds: the same shapes the content form reads. */
const INTEGER_TEXT = /^-?\d+$/;
const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/;

/** The number a numeric field's payload value names, or undefined when it names none. */
function readNumber(field: ContentField, value: unknown): number | undefined {
  const text = typeof value === "string" ? value.trim() : undefined;
  const numeric =
    typeof value === "number"
      ? value
      : text !== undefined && (field.type === "integer" ? INTEGER_TEXT : NUMBER_TEXT).test(text)
        ? Number(text)
        : undefined;

  if (numeric === undefined) {
    return undefined;
  }
  if (field.type === "integer" ? !Number.isSafeInteger(numeric) : !Number.isFinite(numeric)) {
    return undefined;
  }
  return withinBounds(field, numeric) ? numeric : undefined;
}

/** One value of a content payload, or nothing when no value of that field could look like it. */
function readContentValue(
  field: ContentField,
  value: unknown,
): { ok: true; value: unknown } | undefined {
  if (value === null) {
    return { ok: true, value: null };
  }
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean" ? { ok: true, value } : undefined;
    case "integer":
    case "number": {
      // A number control submits its value as text, so the number it names is what is stored; anything else is refused.
      const numeric = readNumber(field, value);
      return numeric === undefined ? undefined : { ok: true, value: numeric };
    }
    case "string": {
      if (typeof value !== "string") {
        return undefined;
      }
      const text = value.trim();
      if (text === "") {
        // An emptied control is a cleared field, not a field left out: the stored value must go.
        return { ok: true, value: null };
      }
      return readableText(field, text) ? { ok: true, value: text } : undefined;
    }
  }
}

/**
 * The content changes one autosave asks to store, read from an untrusted payload. Only the fields the pinned
 * version declares are accepted, because a key this deployment does not know could only be a stale page or a
 * tampered request; a value of the wrong type, outside the field's own bounds, or in a shape its control could not
 * have written refuses that field. A refused payload is refused whole, so one bad value never stores the rest.
 *
 * The one property that is not a field of the schema is `omittedSections` (T4; S8.2): the switch of a card writes the
 * list of the section keys it hides, never a text, and the whole stored list is replaced so showing a section again
 * takes its key out. Which keys exist is the pinned schema's own declaration, so the API remains the authority that
 * refuses one it does not publish.
 */
export function parseContentChanges(
  fields: readonly ContentField[],
  payload: unknown,
): ContentChangesParse {
  if (!isPlainObject(payload)) {
    return { ok: false, fieldIssues: [] };
  }

  const issues: AutosaveFieldIssue[] = [];
  const changes: ContentChange[] = [];
  const declared = new Map(fields.map((field) => [field.name, field]));

  for (const [name, value] of Object.entries(payload)) {
    if (name === OMITTED_SECTIONS_PROPERTY) {
      const omittedSections = parseOmittedSections(value);

      if (omittedSections === undefined) {
        issues.push({ field: name, message: AUTOSAVE_COPY.omittedSections });
        continue;
      }
      changes.push({ name, value: omittedSections });
      continue;
    }

    const field = declared.get(name);

    if (field === undefined) {
      issues.push({ field: name, message: AUTOSAVE_COPY.unknownField });
      continue;
    }

    const read = readContentValue(field, value);

    if (read === undefined) {
      issues.push({ field: name, message: AUTOSAVE_COPY.fieldIssue(field.label) });
      continue;
    }
    changes.push({ name, value: read.value });
  }

  return issues.length === 0 ? { ok: true, changes } : { ok: false, fieldIssues: issues };
}

/**
 * The content to write: the content the API has at this instant with only the changed fields applied. A cleared
 * field is removed, so a guest never renders an empty value; every other key of the stored content travels
 * unchanged, which is what keeps a field written elsewhere (the uploaded main photo, for one) from being lost.
 * The result is built with `Object.fromEntries`, so a stored `__proto__` key stays a plain property.
 */
export function mergeContent(
  stored: Record<string, unknown>,
  changes: readonly ContentChange[],
): Record<string, unknown> {
  const merged = new Map(Object.entries(stored));

  for (const change of changes) {
    if (change.value === null) {
      merged.delete(change.name);
    } else {
      merged.set(change.name, change.value);
    }
  }
  return Object.fromEntries(merged);
}

// The feature side (T2a; S2, S4). The API replaces the three feature fields as one trio, so an autosave of one
// field fills the other two from the stored invitation: a save never clears a datum written elsewhere.

/** The feature fields one autosave may change, and the only keys its payload may name. */
export const FEATURE_CHANGE_FIELDS = [
  "timeZone",
  "whatsappPhone",
  "playlistUrl",
  "itinerary",
  "giftRegistry",
  "lodging",
  "livestream",
  "openingAnimation",
] as const;

/** The feature data one autosave asks to change; a key left out is a field the creator did not touch. */
export interface FeatureChanges {
  readonly timeZone?: string;
  readonly whatsappPhone?: string | null;
  readonly playlistUrl?: string | null;
  /** The moments of the day as the editor holds them, or null when the owner removed them all (F1; L3.4). */
  readonly itinerary?: readonly ItineraryDraftMoment[] | null;
  /** The gift registry as the editor holds it, or null when the owner cleared it (F2; L4.4). */
  readonly giftRegistry?: GiftRegistryDraft | null;
  /** The lodging as the editor holds it, or null when the owner cleared it (F4; L7.4). */
  readonly lodging?: LodgingDraft | null;
  /** The livestream as the editor holds it, or null when the owner cleared it (F9; L12.1). */
  readonly livestream?: LivestreamDraft | null;
  /** The opening animation switch the owner flipped (F10; L14.3). */
  readonly openingAnimation?: boolean;
  /** The reminder switches as the editor holds them (F6; L9.1). */
  readonly reminders?: RemindersDraft;
}

export type FeatureChangesParse =
  | { readonly ok: true; readonly changes: FeatureChanges }
  | { readonly ok: false; readonly fieldIssues: readonly AutosaveFieldIssue[] };

/**
 * The moments the editor sent, read from an untrusted payload (F1; L3.4): the four texts of every row, `null` for a
 * list the owner emptied, or `undefined` when a row is not four texts, the list outgrew its bound, or a complete moment
 * is outside its bounds. A row still being written is accepted — it stays in the browser and the save carries the
 * complete moments (see `itineraryPayloadOf`) — so adding an empty moment never refuses a save.
 */
function readItineraryDrafts(value: unknown): readonly ItineraryDraftMoment[] | null | undefined {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length > ITINERARY_MAX_ITEMS) {
    return undefined;
  }

  const drafts: ItineraryDraftMoment[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) {
      return undefined;
    }

    const time = item.time;
    const title = item.title;
    const place = item.place;
    const address = item.address;

    if (
      typeof time !== "string" ||
      typeof title !== "string" ||
      typeof place !== "string" ||
      typeof address !== "string"
    ) {
      return undefined;
    }
    drafts.push({ time, title, place, address });
  }

  // Only a complete moment outside its bounds is refused here; the one the owner is still writing is not an error.
  return itineraryPayloadOf(drafts) === undefined ? undefined : drafts;
}

/**
 * The gift registry the editor sent, read from an untrusted payload (F2; L4.4): the four texts of every store, the
 * three of the transfer, the envelopes flag, and the note; `null` for a registry the owner cleared, or `undefined`
 * when the body is not this shape or a complete value is outside its bounds. A store still being written is accepted —
 * it stays in the browser and the save carries the complete stores (see `giftRegistryPayloadOf`).
 */
function readGiftRegistryDraft(value: unknown): GiftRegistryDraft | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (
    Object.keys(value).some((key) => !["stores", "transfer", "envelopes", "note"].includes(key))
  ) {
    return undefined;
  }
  if (typeof value.envelopes !== "boolean" || typeof value.note !== "string") {
    return undefined;
  }

  const stores = value.stores;
  const transfer = value.transfer;

  if (
    !Array.isArray(stores) ||
    stores.length > GIFT_REGISTRY_MAX_STORES ||
    !isPlainObject(transfer)
  ) {
    return undefined;
  }

  const drafts: { name: string; reference: string; url: string }[] = [];
  for (const item of stores) {
    if (!isPlainObject(item)) {
      return undefined;
    }
    const name = item.name;
    const reference = item.reference;
    const url = item.url;

    if (typeof name !== "string" || typeof reference !== "string" || typeof url !== "string") {
      return undefined;
    }
    drafts.push({ name, reference, url });
  }

  const bank = transfer.bank;
  const holder = transfer.holder;
  const clabe = transfer.clabe;

  if (typeof bank !== "string" || typeof holder !== "string" || typeof clabe !== "string") {
    return undefined;
  }

  const draft: GiftRegistryDraft = {
    stores: drafts,
    transfer: { bank, holder, clabe },
    envelopes: value.envelopes,
    note: value.note,
  };

  // Only a complete store, transfer, or note outside its bounds is refused here; the one the owner is still writing is
  // not an error, so adding an empty row never refuses a save (F2; L4.4).
  return giftRegistryPayloadOf(draft) === undefined ? undefined : draft;
}

/**
 * The lodging the editor sent, read from an untrusted payload (F4; L7.4): the six texts of every hotel and the
 * transport note; `null` for a lodging the owner cleared, or `undefined` when the body is not this shape or a complete
 * value is outside its bounds. A hotel still being written is accepted — it stays in the browser and the save carries
 * the complete hotels (see `lodgingPayloadOf`).
 */
function readLodgingDraft(value: unknown): LodgingDraft | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (Object.keys(value).some((key) => !["hotels", "transport"].includes(key))) {
    return undefined;
  }
  if (typeof value.transport !== "string") {
    return undefined;
  }

  const hotels = value.hotels;

  if (!Array.isArray(hotels) || hotels.length > LODGING_MAX_HOTELS) {
    return undefined;
  }

  const drafts: LodgingDraftHotel[] = [];
  for (const item of hotels) {
    if (!isPlainObject(item)) {
      return undefined;
    }

    const name = item.name;
    const distance = item.distance;
    const price = item.price;
    const groupCode = item.groupCode;
    const bookingUrl = item.bookingUrl;
    const address = item.address;

    if (
      typeof name !== "string" ||
      typeof distance !== "string" ||
      typeof price !== "string" ||
      typeof groupCode !== "string" ||
      typeof bookingUrl !== "string" ||
      typeof address !== "string"
    ) {
      return undefined;
    }
    drafts.push({ name, distance, price, groupCode, bookingUrl, address });
  }

  const draft: LodgingDraft = { hotels: drafts, transport: value.transport };

  // Only a complete hotel or transport note outside its bounds is refused here; the one the owner is still writing is
  // not an error, so adding an empty row never refuses a save (F4; L7.4).
  return lodgingPayloadOf(draft) === undefined ? undefined : draft;
}

/**
 * The livestream the editor sent, read from an untrusted payload (F9; L12.1): the link and the note; `null` for a link
 * the owner cleared, or `undefined` when the body is not this shape or a value is outside its bounds. A link still being
 * written never reaches here: `livestreamNeedsSave` keeps it in the browser.
 */
function readLivestreamDraft(value: unknown): LivestreamDraft | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (Object.keys(value).some((key) => key !== "url" && key !== "note")) {
    return undefined;
  }
  if (typeof value.url !== "string" || typeof value.note !== "string") {
    return undefined;
  }

  const draft: LivestreamDraft = { url: value.url, note: value.note };

  return livestreamPayloadOf(draft) === undefined ? undefined : draft;
}

/**
 * The reminder switches the editor sent, read from an untrusted payload (F6; L9.1): the pair of booleans, or `undefined`
 * when the body is not this shape. There is no half-written switch — a control is on or off — so a value that is not one
 * of the two states refuses the payload instead of being guessed at.
 */
function readRemindersDraft(value: unknown): RemindersDraft | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (Object.keys(value).some((key) => key !== "pendingRsvp" && key !== "eventEve")) {
    return undefined;
  }

  const { pendingRsvp, eventEve } = value;

  if (typeof pendingRsvp !== "boolean" || typeof eventEve !== "boolean") {
    return undefined;
  }
  return { pendingRsvp, eventEve };
}

/** The most characters a submitted phone may carry, as the feature form already bounds it (S4). */
const MAX_PHONE_TEXT_LENGTH = 32;

/** The contract's own bound on a playlist link, mirrored so an oversized paste never reaches the API (S7). */
const MAX_PLAYLIST_TEXT_LENGTH = 500;

/** One optional text, trimmed; an emptied field is `null`, which is how the API clears it. */
function readOptionalText(
  value: unknown,
  maxLength: number,
): { ok: true; value: string | null } | undefined {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim();

  if (text === "") {
    return { ok: true, value: null };
  }
  return [...text].length <= maxLength ? { ok: true, value: text } : undefined;
}

/**
 * The feature changes one autosave asks to store, read from an untrusted payload: a zone the API accepts, and the
 * phone and the playlist link as typed (the API normalizes and refuses what it cannot store) or `null` to clear
 * them. A key that is not one of the three fields is refused, and so is a value no control could have written.
 */
export function parseFeatureChanges(payload: unknown): FeatureChangesParse {
  if (!isPlainObject(payload)) {
    return { ok: false, fieldIssues: [] };
  }

  const issues: AutosaveFieldIssue[] = [];
  const changes: {
    timeZone?: string;
    whatsappPhone?: string | null;
    playlistUrl?: string | null;
    itinerary?: readonly ItineraryDraftMoment[] | null;
    giftRegistry?: GiftRegistryDraft | null;
    lodging?: LodgingDraft | null;
    livestream?: LivestreamDraft | null;
    openingAnimation?: boolean;
    reminders?: RemindersDraft;
  } = {};

  for (const [name, value] of Object.entries(payload)) {
    if (name === "timeZone") {
      if (typeof value === "string" && isInvitationTimeZone(value)) {
        changes.timeZone = value;
        continue;
      }
      issues.push({ field: name, message: FEATURE_ISSUE_COPY.timezone });
      continue;
    }
    if (name === "whatsappPhone") {
      const phone = readOptionalText(value, MAX_PHONE_TEXT_LENGTH);
      if (phone === undefined) {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY.phone });
        continue;
      }
      changes.whatsappPhone = phone.value;
      continue;
    }
    if (name === "playlistUrl") {
      const playlist = readOptionalText(value, MAX_PLAYLIST_TEXT_LENGTH);
      if (playlist === undefined) {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY.playlist });
        continue;
      }
      changes.playlistUrl = playlist.value;
      continue;
    }
    if (name === "itinerary") {
      const itinerary = readItineraryDrafts(value);
      if (itinerary === undefined) {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY.itinerary });
        continue;
      }
      changes.itinerary = itinerary;
      continue;
    }
    if (name === "giftRegistry") {
      const giftRegistry = readGiftRegistryDraft(value);
      if (giftRegistry === undefined) {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY["gift-registry"] });
        continue;
      }
      changes.giftRegistry = giftRegistry;
      continue;
    }
    if (name === "lodging") {
      const lodging = readLodgingDraft(value);
      if (lodging === undefined) {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY.lodging });
        continue;
      }
      changes.lodging = lodging;
      continue;
    }
    if (name === "livestream") {
      const livestream = readLivestreamDraft(value);
      if (livestream === undefined) {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY.livestream });
        continue;
      }
      changes.livestream = livestream;
      continue;
    }
    if (name === "openingAnimation") {
      // A switch only holds a boolean, so a value no switch could have written is refused with the generic sentence
      // instead of guessing a state (F10; L14.3).
      if (typeof value !== "boolean") {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY.other });
        continue;
      }
      changes.openingAnimation = value;
      continue;
    }
    if (name === "reminders") {
      const reminders = readRemindersDraft(value);
      if (reminders === undefined) {
        issues.push({ field: name, message: FEATURE_ISSUE_COPY.reminders });
        continue;
      }
      changes.reminders = reminders;
      continue;
    }
    issues.push({ field: name, message: AUTOSAVE_COPY.unknownField });
  }

  return issues.length === 0 ? { ok: true, changes } : { ok: false, fieldIssues: issues };
}

/**
 * The feature data to write: the whole set the API replaces, with every field the creator did not change filled from
 * the stored invitation. A field the creator cleared travels as `null`, so it is cleared instead of kept. The itinerary
 * is the one field the editor sends as the moments it holds, so it is turned into the payload here; a list the
 * contract refuses is left out of the change instead of clearing what is stored, and a moment the owner is retyping
 * keeps the version this invitation already stored (F1; L3.4).
 */
export function mergeFeatureChanges(
  stored: InvitationFeatureInput,
  changes: FeatureChanges,
): InvitationFeatureInput {
  let itinerary = stored.itinerary;
  let giftRegistry = stored.giftRegistry;
  let lodging = stored.lodging;
  let livestream = stored.livestream;
  let reminders = stored.reminders ?? null;
  // The opening animation switch follows the same rule (F10; L14.3): a save of another field carries the stored one, and a
  // body that never carried it — an API written before the column existed — keeps it out of the write, which the API
  // reads as "keep the stored one".
  const openingAnimation = changes.openingAnimation ?? stored.openingAnimation;

  if (Object.hasOwn(changes, "livestream")) {
    // A livestream the contract refuses is left out of the change instead of clearing what is stored (F9; L12.1).
    const payload = livestreamPayloadOf(changes.livestream ?? { url: "", note: "" });

    if (payload !== undefined) {
      livestream = payload;
    }
  }

  if (Object.hasOwn(changes, "lodging")) {
    // A lodging the contract refuses is left out of the change instead of clearing what is stored, and a hotel the
    // owner is retyping keeps the version this invitation already stored (F4; L7.4).
    const payload = lodgingPayloadOf(changes.lodging ?? lodgingDraftOf(null), stored.lodging);

    if (payload !== undefined) {
      lodging = payload;
    }
  }

  if (Object.hasOwn(changes, "giftRegistry")) {
    // A registry the contract refuses is left out of the change instead of clearing what is stored, and a store the
    // owner is retyping keeps the version this invitation already stored (F2; L4.4).
    const payload = giftRegistryPayloadOf(
      changes.giftRegistry ?? giftRegistryDraftOf(null),
      stored.giftRegistry,
    );

    if (payload !== undefined) {
      giftRegistry = payload;
    }
  }

  if (Object.hasOwn(changes, "reminders")) {
    // Both switches off stores no reminder settings, which is the same value the API normalizes the pair to (F6; L9.1).
    reminders = remindersPayloadOf(changes.reminders ?? EMPTY_REMINDERS);
  }

  if (Object.hasOwn(changes, "itinerary")) {
    const payload = itineraryPayloadOf(changes.itinerary ?? [], stored.itinerary);

    // `undefined` is a list still being written, and no request is sent for it (see `parseFeatureChanges`).
    if (payload !== undefined) {
      itinerary = payload;
    }
  }

  return {
    timeZone: changes.timeZone ?? stored.timeZone,
    whatsappPhone: Object.hasOwn(changes, "whatsappPhone")
      ? (changes.whatsappPhone ?? null)
      : stored.whatsappPhone,
    playlistUrl: Object.hasOwn(changes, "playlistUrl")
      ? (changes.playlistUrl ?? null)
      : stored.playlistUrl,
    itinerary,
    giftRegistry,
    ...(lodging === undefined ? {} : { lodging }),
    ...(livestream === undefined ? {} : { livestream }),
    ...(openingAnimation === undefined ? {} : { openingAnimation }),
    reminders,
  };
}

// The RSVP side (T2a; S2, S4). The settings are one pair the API replaces together, so an autosave of one fills the
// other from what is stored. The deadline is written as the wall clock of the invitation's own zone, the same
// reading the settings form does, so the creator's clock is the clock that is stored.

/** The datetime-local shape of the deadline control, in the invitation's own zone. */
const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** The settings one autosave asks to change; a key left out is a field the creator did not touch. */
export interface RsvpChanges {
  /** The wall clock the `datetime-local` control shows, or `null` to clear the deadline. */
  readonly deadline?: string | null;
  readonly partyLimit?: number;
}

export type RsvpChangesParse =
  | { readonly ok: true; readonly changes: RsvpChanges }
  | { readonly ok: false; readonly fieldIssues: readonly AutosaveFieldIssue[] };

/**
 * The RSVP changes one autosave asks to store, read from an untrusted payload: a deadline the control could have
 * written or `null` to clear it, and a party limit the API accepts. Nothing else is read, and a refused value is
 * named with the sentence the settings form already uses.
 */
export function parseRsvpChanges(payload: unknown): RsvpChangesParse {
  if (!isPlainObject(payload)) {
    return { ok: false, fieldIssues: [] };
  }

  const issues: AutosaveFieldIssue[] = [];
  const changes: { deadline?: string | null; partyLimit?: number } = {};

  for (const [name, value] of Object.entries(payload)) {
    if (name === "deadline") {
      if (value === null) {
        changes.deadline = null;
        continue;
      }
      const match = typeof value === "string" ? WALL_CLOCK.exec(value) : null;

      if (match !== null && isCalendarDate(match[1] as string) && isClockTime(match[2] as string)) {
        changes.deadline = value as string;
        continue;
      }
      issues.push({ field: name, message: RSVP_SETTINGS_ISSUE_COPY.deadline });
      continue;
    }
    if (name === "partyLimit") {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= RSVP_PARTY_LIMIT_MIN &&
        value <= RSVP_PARTY_LIMIT_MAX
      ) {
        changes.partyLimit = value;
        continue;
      }
      issues.push({ field: name, message: RSVP_SETTINGS_ISSUE_COPY.party });
      continue;
    }
    issues.push({ field: name, message: AUTOSAVE_COPY.unknownField });
  }

  return issues.length === 0 ? { ok: true, changes } : { ok: false, fieldIssues: issues };
}

export type RsvpSettingsMerge =
  | { readonly ok: true; readonly settings: RsvpSettings }
  | { readonly ok: false; readonly fieldIssues: readonly AutosaveFieldIssue[] };

/**
 * The settings to write: the pair the API replaces, with the field the creator did not change filled from what is
 * stored, and the wall clock of the deadline read in the invitation's own zone. A wall clock this runtime cannot
 * read is refused instead of being stored as another instant.
 */
export function mergeRsvpChanges(
  stored: RsvpSettings,
  changes: RsvpChanges,
  timeZone: string,
): RsvpSettingsMerge {
  let deadline = stored.deadline;

  if (Object.hasOwn(changes, "deadline")) {
    deadline = null;

    if (changes.deadline !== null && changes.deadline !== undefined) {
      const instant = deadlineInstant(changes.deadline, timeZone);

      if (instant === undefined) {
        return {
          ok: false,
          fieldIssues: [{ field: "deadline", message: RSVP_SETTINGS_ISSUE_COPY.deadline }],
        };
      }
      deadline = instant;
    }
  }

  return { ok: true, settings: { deadline, partyLimit: changes.partyLimit ?? stored.partyLimit } };
}

// The answer of a save (T2a; S4). The status line renders one of these; raw English from the API never reaches it.

/** The accepted answer: the instant this server saw the write accepted. */
export function savedResult(savedAt: string): AutosaveSaved {
  return { ok: true, savedAt };
}

/** The fields a refusal of one channel names, with the sentence the page already has for each of them. */
function fieldIssuesOf(channel: AutosaveChannel, issues: readonly string[]): AutosaveFieldIssue[] {
  const named: AutosaveFieldIssue[] = [];

  if (channel === "content") {
    for (const issue of issues) {
      const name = /^content\.([A-Za-z0-9_]+)(?:\s|$)/.exec(issue)?.[1];

      if (name !== undefined) {
        named.push({ field: name, message: AUTOSAVE_COPY.fieldIssue(fieldLabel(name)) });
      }
    }
  } else if (channel === "features") {
    const fieldOf: Readonly<Record<string, string>> = {
      timezone: "timeZone",
      phone: "whatsappPhone",
      "phone-type": "whatsappPhone",
      playlist: "playlistUrl",
      itinerary: "itinerary",
      "gift-registry": "giftRegistry",
      lodging: "lodging",
      livestream: "livestream",
      reminders: "reminders",
    };
    for (const code of featureIssueCodes(issues)) {
      const field = Object.hasOwn(fieldOf, code) ? fieldOf[code] : undefined;

      if (field !== undefined) {
        named.push({ field, message: FEATURE_ISSUE_COPY[code] });
      }
    }
  } else {
    const fieldOf: Readonly<Record<string, string>> = {
      deadline: "deadline",
      party: "partyLimit",
    };
    for (const code of rsvpSettingsIssueCodes(issues)) {
      const field = Object.hasOwn(fieldOf, code) ? fieldOf[code] : undefined;

      if (field !== undefined) {
        named.push({ field, message: RSVP_SETTINGS_ISSUE_COPY[code] });
      }
    }
  }

  const unique: AutosaveFieldIssue[] = [];
  for (const issue of named) {
    if (!unique.some((kept) => kept.field === issue.field)) {
      unique.push(issue);
    }
    if (unique.length === MAX_FIELD_ISSUES) {
      break;
    }
  }
  return unique;
}

/**
 * A refusal of the API as the status line shows it: an ended session has its own reason so the UI offers a sign-in
 * link, a refusal of a value is `invalid` with the fields it named, an outage is retryable, and any other refusal
 * keeps the API's own Spanish sentence.
 */
export function refusal(
  channel: AutosaveChannel,
  failure: InvitationFailure | "unavailable",
  issues?: readonly string[],
): AutosaveRefused {
  if (failure === "signed-out") {
    return { ok: false, reason: "signed-out", message: AUTOSAVE_COPY.signedOut };
  }
  if (failure === "unavailable") {
    return { ok: false, reason: "unavailable", message: INVITATION_ERROR_COPY.unavailable };
  }

  const fieldIssues = fieldIssuesOf(channel, issues ?? []);
  const reason: AutosaveFailureReason =
    INVALID_FAILURES.has(failure) || fieldIssues.length > 0 ? "invalid" : "refused";

  return {
    ok: false,
    reason,
    message: INVITATION_ERROR_COPY[failure],
    ...(fieldIssues.length === 0 ? {} : { fieldIssues }),
  };
}

/**
 * A payload this server could not read, with the fields it refused; nothing of it is sent to the API. The status line
 * keeps the generic sentence, as before, and each field shows its own issue under it. The itinerary is the one
 * exception (F1; L3.4): a complete moment out of bounds names what to fix in the status line too, because its rows
 * have no single field the generic sentence could point at.
 */
export function invalidPayload(fieldIssues: readonly AutosaveFieldIssue[]): AutosaveRefused {
  const itinerary = fieldIssues.find((issue) => issue.field === "itinerary");

  return {
    ok: false,
    reason: "invalid",
    message: itinerary?.message ?? AUTOSAVE_COPY.invalidPayload,
    ...(fieldIssues.length === 0 ? {} : { fieldIssues }),
  };
}

/** Why no autosave of a draft can check its fields: the template's published version could not be read. */
export function catalogUnavailable(): AutosaveRefused {
  return {
    ok: false,
    reason: "unavailable",
    message: AUTOSAVE_COPY.catalogUnavailable,
  };
}
