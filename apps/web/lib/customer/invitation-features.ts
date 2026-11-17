import {
  INVITATION_TIME_ZONES,
  type InvitationTimeZone,
  isInvitationTimeZone,
} from "../invitation-features/time-zones.ts";
import {
  type CreatorPackage,
  type InvitationsClient,
  isInvitationId,
  type OwnedInvitation,
} from "../server/invitations-api.ts";
import { FEATURE_COPY, INVITATION_TIME_ZONE_LABELS } from "./copy.ts";
import { type FeatureIssueCode, featureIssueCodes, featureIssuesTarget } from "./feature-issues.ts";
import {
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  invitationNoticeTarget,
  sendInvitationCall,
} from "./invitations.ts";

/**
 * The creator's «Funcionalidades» section (F3, F6, F7; S3, S4, S7). The feature data belongs to the invitation,
 * not to the template: this module builds the time zone select with Spanish labels, decides whether the WhatsApp
 * and playlist fields are shown from the package's own included feature keys (never from `availableFeatures`,
 * which hides WhatsApp while no phone is stored and music while no link is stored), explains the gift registry of
 * a package that does not grant it, lists the automatic features the guests will see, and turns one submitted
 * form into the API call and the redirect that follows it.
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
    showRsvp: included.has(RSVP_FEATURE_KEY),
    giftRegistryNote: giftRegistryNote(packages, included),
    automaticFeatures: AUTOMATIC_FEATURES.filter(
      (feature) => feature.key === CALENDAR_FEATURE_KEY || included.has(feature.key),
    ).map((feature) => feature.label),
  };
}

/** The most characters a submitted phone may carry, so a hostile form cannot grow the request. */
const MAX_PHONE_TEXT_LENGTH = 32;

/** The contract's own bound on a playlist link, mirrored so an oversized paste never reaches the API (S7). */
const MAX_PLAYLIST_TEXT_LENGTH = 500;

export type FeatureSettingsParse =
  | {
      readonly ok: true;
      readonly timeZone: InvitationTimeZone;
      readonly whatsappPhone: string | null;
      readonly playlistUrl: string | null;
    }
  | { readonly ok: false; readonly issues: readonly FeatureIssueCode[] };

/**
 * The feature data a submitted form asks to save. The zone must be one the API accepts, so nothing is sent
 * when it is not; a blank phone or link means "none", which is how the creator clears it (S4, S7). The phone
 * and the link travel as typed, because the API owns normalization and answers its own issue when it refuses.
 */
export function parseFeatureSettingsForm(form: FormData): FeatureSettingsParse {
  const submittedZone = form.get("timeZone");
  const zone =
    typeof submittedZone === "string" && isInvitationTimeZone(submittedZone)
      ? submittedZone
      : undefined;
  const submittedPhone = form.get("whatsappPhone");
  const submittedPlaylist = form.get("playlistUrl");
  const issues: FeatureIssueCode[] = [];

  if (zone === undefined) {
    issues.push("timezone");
  }

  let whatsappPhone: string | null = null;

  if (typeof submittedPhone === "string") {
    const trimmed = submittedPhone.trim();
    if ([...trimmed].length > MAX_PHONE_TEXT_LENGTH) {
      issues.push("phone");
    }
    whatsappPhone = trimmed === "" ? null : trimmed;
  } else if (submittedPhone !== null) {
    issues.push("phone");
  }

  let playlistUrl: string | null = null;

  if (typeof submittedPlaylist === "string") {
    const trimmed = submittedPlaylist.trim();
    if ([...trimmed].length > MAX_PLAYLIST_TEXT_LENGTH) {
      issues.push("playlist");
    }
    playlistUrl = trimmed === "" ? null : trimmed;
  } else if (submittedPlaylist !== null) {
    issues.push("playlist");
  }

  if (issues.length > 0 || zone === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, timeZone: zone, whatsappPhone, playlistUrl };
}

/**
 * Saves the invitation's feature data through `PUT /invitations/:id/features` (S3, S4, S7). The API authorizes
 * the invitation, validates the zone, the phone, and the playlist link, and refuses an archived draft; this
 * function only maps each outcome to the page's query. An id that names nothing sends nothing, and a refusal that
 * names issues comes back as Spanish sentences through `featureIssueCodes`.
 */
export async function saveInvitationFeatures(
  api: InvitationsClient,
  form: FormData,
): Promise<string> {
  const id = form.get("id");

  if (typeof id !== "string" || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const parsed = parseFeatureSettingsForm(form);

  if (!parsed.ok) {
    return featureIssuesTarget(path, parsed.issues);
  }

  const written = await sendInvitationCall(() =>
    api.updateInvitationFeatures(id, {
      timeZone: parsed.timeZone,
      whatsappPhone: parsed.whatsappPhone,
      playlistUrl: parsed.playlistUrl,
    }),
  );

  if (written.ok) {
    return invitationNoticeTarget(path, "features-saved");
  }
  if (written.failure === "features-invalid") {
    return featureIssuesTarget(path, featureIssueCodes(written.issues ?? []));
  }
  return invitationFailureTarget(path, written.failure);
}
