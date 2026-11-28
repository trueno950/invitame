import { INVITATION_TIME_ZONES, isInvitationTimeZone } from "../invitation-features/time-zones.ts";
import {
  type InvitationLanguage,
  INVITATION_LANGUAGES,
  storedInvitationLanguage,
} from "../i18n/invitation-language.ts";
import type { CreatorPackage, OwnedInvitation } from "../server/invitations-api.ts";
import { FEATURE_COPY, INVITATION_TIME_ZONE_LABELS } from "./copy.ts";
import { type GiftRegistryDraft, giftRegistryDraftOf } from "./gift-registry.ts";
import { type ItineraryDraftMoment, itineraryDraftsOf } from "./itinerary.ts";
import { type LivestreamDraft, livestreamDraftOf } from "./livestream.ts";
import { type LodgingDraft, lodgingDraftOf } from "./lodging.ts";
import { type RemindersDraft, remindersDraftOf } from "./reminders.ts";

/**
 * The creator's «Funcionalidades» section (F3, F6, F7; S3, S4, S7). The feature data belongs to the invitation,
 * not to the template: this module builds the time zone select with Spanish labels, decides whether the WhatsApp
 * and playlist fields are shown from the package's own included feature keys (never from `availableFeatures`,
 * which hides WhatsApp while no phone is stored and music while no link is stored), explains the gift registry of
 * a package that does not grant it, and lists the automatic features the guests will see. The writes moved to the
 * editor's own autosave (T2a, T2c), which fills the fields the owner did not touch from what is stored.
 */

/** One option of the time zone select: the stored IANA id and the Spanish label of the place. */
export interface TimeZoneChoice {
  readonly value: string;
  readonly label: string;
}

/** The select's choices, in the API's order: one per zone the contract accepts. */
export const TIME_ZONE_CHOICES: readonly TimeZoneChoice[] = INVITATION_TIME_ZONES.map((value) => ({
  value,
  label: INVITATION_TIME_ZONE_LABELS[value],
}));

/** The Spanish label of a zone; a stored value outside the list is shown as it is, never guessed into one. */
export function timeZoneLabel(value: string): string {
  return isInvitationTimeZone(value) ? INVITATION_TIME_ZONE_LABELS[value] : value;
}

/** One option of the language block: the stored value, its label, and the one line that explains it (F14; L19.1). */
export interface InvitationLanguageChoice {
  readonly value: InvitationLanguage;
  readonly label: string;
  readonly hint: string;
}

/**
 * The three options of «Idioma de tu invitación», in the artboard's order (F14; L19.1), with the owner's own Spanish:
 * what the guest reads is the dictionary's, never this copy. They are always all three, because the choice is stored
 * with the invitation and changing the package never rewrites it.
 */
export const INVITATION_LANGUAGE_CHOICES: readonly InvitationLanguageChoice[] =
  INVITATION_LANGUAGES.map((value) => ({ value, ...FEATURE_COPY.languageChoice[value] }));

/** The automatic features a guest sees, in the order the features block shows them (S4). */
const AUTOMATIC_FEATURES = [
  { key: "COUNTDOWN", label: FEATURE_COPY.automaticCountdown },
  { key: "MAP", label: FEATURE_COPY.automaticMap },
  { key: "CALENDAR", label: FEATURE_COPY.automaticCalendar },
] as const;

/** The feature keys that need a stored value, the ones that are not catalog features, and the gift registry. */
const WHATSAPP_FEATURE_KEY = "WHATSAPP";
const CALENDAR_FEATURE_KEY = "CALENDAR";
const MUSIC_FEATURE_KEY = "MUSIC";
const RSVP_FEATURE_KEY = "RSVP";
const GIFT_REGISTRY_FEATURE_KEY = "GIFT_REGISTRY";
const ITINERARY_FEATURE_KEY = "ITINERARY";
const LODGING_FEATURE_KEY = "LODGING";
/** The catalog key that grants the livestream (F9; L12.2), granted by Premium and Deluxe. */
const LIVESTREAM_FEATURE_KEY = "LIVESTREAM";
/** The catalog key that grants WhatsApp reminders (F6; L9.2), granted by Deluxe. */
const WHATSAPP_REMINDERS_FEATURE_KEY = "WHATSAPP_REMINDERS";
/** The catalog key that grants the guestbook (F7; L10.2), granted by Premium and Deluxe. */
const GUESTBOOK_FEATURE_KEY = "GUESTBOOK";
/** The catalog key that grants the album of the guests' photos (F8; L11.2), granted by Deluxe. */
const GUEST_ALBUM_FEATURE_KEY = "GUEST_ALBUM";
/** The catalog key that grants the opening animation (F10; L14.4), granted by every seeded package. */
const OPENING_ANIMATION_FEATURE_KEY = "OPENING_ANIMATION";
/** The catalog key that lets the stored language reach a guest (F14; L19.4), granted by every seeded package. */
const ENGLISH_INVITATION_FEATURE_KEY = "ENGLISH_INVITATION";

/** Everything the section renders for one draft. */
export interface FeatureSettingsView {
  readonly id: string;
  /** False while the invitation is archived, like the content form's read-only state. */
  readonly editable: boolean;
  /** The stored zone. */
  readonly timeZone: string;
  /** The options of the select; the stored zone is always among them. */
  readonly timeZones: readonly TimeZoneChoice[];
  /** The stored E.164 phone, or "" when the invitation has none. */
  readonly whatsappPhone: string;
  /** Whether the package includes WhatsApp, which is the only reason the phone field is shown (S4). */
  readonly showWhatsapp: boolean;
  /** The stored playlist link, or "" when the invitation has none (S7). */
  readonly playlistUrl: string;
  /** Whether the package includes MUSIC, which is the only reason the link field is shown (S7). */
  readonly showMusic: boolean;
  /**
   * Whether the package includes ITINERARY, which is the only reason the «Itinerario» block is shown (F1; L3.2,
   * L3.4). A package without the key keeps a stored plan private instead of offering an editor nobody can publish.
   */
  readonly showItinerary: boolean;
  /** The stored moments as the editor holds them: four texts per row, in the owner's order (F1; L3.4). */
  readonly itinerary: readonly ItineraryDraftMoment[];
  /**
   * Whether the package includes GIFT_REGISTRY, which is the only reason the «Mesa de regalos» block is shown (F2;
   * L4.2, L4.4). A package without the key keeps a stored registry private instead of offering an editor nobody can
   * publish.
   */
  readonly showGiftRegistry: boolean;
  /** The stored registry as the editor holds it: three texts per store, the transfer, the switch, and the note (F2). */
  readonly giftRegistry: GiftRegistryDraft;
  /**
   * Whether the package includes LODGING, which is the only reason the «Hospedaje y transporte» block is shown (F4;
   * L7.2, L7.4). A package without the key keeps stored cards private instead of offering an editor nobody can
   * publish.
   */
  readonly showLodging: boolean;
  /** The stored lodging as the editor holds it: six texts per hotel, and the transport note (F4). */
  readonly lodging: LodgingDraft;
  /**
   * Whether the package includes LIVESTREAM, which is the only reason the «Transmisión en vivo» block is shown (F9;
   * L12.2, L12.4). A package without the key keeps a stored link private instead of offering an editor nobody can
   * publish.
   */
  readonly showLivestream: boolean;
  /** The stored livestream as the editor holds it: the link and its note (F9). */
  readonly livestream: LivestreamDraft;
  /**
   * Whether the package includes WHATSAPP_REMINDERS, which is the only reason the «Recordatorios por WhatsApp» block
   * is shown (F6; L9.2, L9.5). A package without the key keeps stored switches private instead of offering an editor
   * nobody can use.
   */
  readonly showReminders: boolean;
  /** The stored reminder switches, both off while the invitation has none (F6; L9.1). */
  readonly reminders: RemindersDraft;
  /**
   * Whether this deployment can deliver a reminder at all (F6; S6, L9.5): a capability, never a secret. False is what
   * the block shows as «Aún no está activo», and it never hides the switches, because they are stored and take effect
   * the moment a sender is configured.
   */
  readonly remindersConfigured: boolean;
  /**
   * Whether the package includes OPENING_ANIMATION, which is the only reason the «Animación de apertura» switch is shown
   * (F10; L14.3, L14.4). A package without the key keeps a stored switch private instead of offering a control whose
   * effect a guest would never see.
   */
  readonly showOpeningAnimation: boolean;
  /**
   * The stored opening animation switch (F10; L14.3), on unless the owner turned it off. A body written before the column
   * existed carries no switch, and the column's own default is what the switch then shows.
   */
  readonly openingAnimation: boolean;
  /**
   * Whether the package includes ENGLISH_INVITATION, which is the only reason the «Idioma de tu invitación» block is
   * shown (F14; L19.1, L19.4). A package without the key keeps the stored choice private instead of offering an editor
   * that would not reach a guest.
   */
  readonly showLanguage: boolean;
  /**
   * The stored language (F14; L19.1), Spanish unless the owner chose another. A body written before the column existed
   * carries no language, and the column's own default is what the block then shows (L19.5).
   */
  readonly language: InvitationLanguage;
  /** The three options of the block, with their labels and one-line explanations (F14; L19.1). */
  readonly languages: readonly InvitationLanguageChoice[];
  /**
   * Whether the package includes GUESTBOOK, which is the only reason the «Funciones» tab links to the invitation's
   * «Libro de firmas» screen (F7; L10.2, L10.6). A package without the key keeps a stored book private instead of
   * offering a moderation screen nobody can publish.
   */
  readonly showGuestbook: boolean;
  /**
   * Whether the package includes GUEST_ALBUM, which is the only reason the «Funciones» tab links to the invitation's
   * album screen (F8; L11.2, L11.6). A package without the key keeps the photos a guest uploaded private instead of
   * offering a moderation screen nobody can publish.
   */
  readonly showGuestAlbum: boolean;
  /**
   * Whether the package includes RSVP, which is the only reason the draft offers its «Asistencia» section
   * (M6 G3; S4). A package with the guest list instead keeps that section for the guest-list tools (G4).
   */
  readonly showRsvp: boolean;
  /**
   * Why the gift registry block does not show, naming the packages that include it, or "" when this package
   * grants it or when the catalog could not be read and no package can be named (F7; S7).
   */
  readonly giftRegistryNote: string;
  /** The automatic features the guests will see, with their Spanish labels. */
  readonly automaticFeatures: readonly string[];
}

/**
 * The included feature keys of the invitation's own package, or none when the catalog cannot answer for it.
 * A missing package fails closed: no WhatsApp or playlist field, and only the always-available calendar is
 * promised.
 */
function includedFeatureKeys(
  invitation: OwnedInvitation,
  packages: readonly CreatorPackage[] | undefined,
): readonly string[] {
  return packages?.find((item) => item.id === invitation.packageId)?.includedFeatureKeys ?? [];
}

/** «A», «A y B», «A, B y C»: the names of the packages a note lists, as Spanish joins them. */
function joinPackageNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * The note of the gift registry when the invitation's own package does not grant it (F7; S7): the packages that
 * do are named, in the catalog's order. A catalog that could not be read names none, so the page promises
 * nothing instead of guessing.
 */
function giftRegistryNote(
  packages: readonly CreatorPackage[] | undefined,
  included: ReadonlySet<string>,
): string {
  if (included.has(GIFT_REGISTRY_FEATURE_KEY)) {
    return "";
  }
  if (packages === undefined) {
    return "";
  }

  const names = packages
    .filter((item) => item.includedFeatureKeys.includes(GIFT_REGISTRY_FEATURE_KEY))
    .map((item) => item.name);

  if (names.length === 0) {
    return FEATURE_COPY.giftRegistryNoteAny;
  }
  return names.length === 1
    ? FEATURE_COPY.giftRegistryNoteOne(names[0] as string)
    : FEATURE_COPY.giftRegistryNoteMany(joinPackageNames(names));
}

/**
 * The section of one invitation. `packages` is the creator catalog read the page already has; when it could
 * not be read, `undefined` hides the fields the package may not grant rather than offering them.
 */
export function featureSettingsView(
  invitation: OwnedInvitation,
  packages: readonly CreatorPackage[] | undefined,
): FeatureSettingsView {
  const included = new Set(includedFeatureKeys(invitation, packages));
  const timeZones = isInvitationTimeZone(invitation.timeZone)
    ? TIME_ZONE_CHOICES
    : [...TIME_ZONE_CHOICES, { value: invitation.timeZone, label: invitation.timeZone }];

  return {
    id: invitation.id,
    editable: invitation.status !== "ARCHIVED",
    timeZone: invitation.timeZone,
    timeZones,
    whatsappPhone: invitation.featureSettings.whatsappPhone ?? "",
    showWhatsapp: included.has(WHATSAPP_FEATURE_KEY),
    playlistUrl: invitation.featureSettings.playlistUrl ?? "",
    showMusic: included.has(MUSIC_FEATURE_KEY),
    showItinerary: included.has(ITINERARY_FEATURE_KEY),
    itinerary: itineraryDraftsOf(invitation.featureSettings.itinerary),
    showGiftRegistry: included.has(GIFT_REGISTRY_FEATURE_KEY),
    giftRegistry: giftRegistryDraftOf(invitation.featureSettings.giftRegistry),
    showLodging: included.has(LODGING_FEATURE_KEY),
    lodging: lodgingDraftOf(invitation.featureSettings.lodging),
    showLivestream: included.has(LIVESTREAM_FEATURE_KEY),
    livestream: livestreamDraftOf(invitation.featureSettings.livestream),
    showReminders: included.has(WHATSAPP_REMINDERS_FEATURE_KEY),
    reminders: remindersDraftOf(invitation.featureSettings.reminders),
    remindersConfigured: invitation.remindersConfigured === true,
    showOpeningAnimation: included.has(OPENING_ANIMATION_FEATURE_KEY),
    openingAnimation: invitation.featureSettings.openingAnimation ?? true,
    showLanguage: included.has(ENGLISH_INVITATION_FEATURE_KEY),
    language: storedInvitationLanguage(invitation.featureSettings.language),
    languages: INVITATION_LANGUAGE_CHOICES,
    showGuestbook: included.has(GUESTBOOK_FEATURE_KEY),
    showGuestAlbum: included.has(GUEST_ALBUM_FEATURE_KEY),
    showRsvp: included.has(RSVP_FEATURE_KEY),
    giftRegistryNote: giftRegistryNote(packages, included),
    automaticFeatures: AUTOMATIC_FEATURES.filter(
      (feature) => feature.key === CALENDAR_FEATURE_KEY || included.has(feature.key),
    ).map((feature) => feature.label),
  };
}
