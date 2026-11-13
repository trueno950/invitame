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
 * The creator's «Funcionalidades» section (F3; S3, S4). The feature data belongs to the invitation, not to
 * the template: this module builds the time zone select with Spanish labels, decides whether the WhatsApp
 * field is shown from the package's own included feature keys (never from `availableFeatures`, which hides
 * WhatsApp while no phone is stored), lists the automatic features the guests will see, and turns one
 * submitted form into the API call and the redirect that follows it.
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

/** The feature key that needs a stored phone, and the one that is not a catalog feature. */
const WHATSAPP_FEATURE_KEY = "WHATSAPP";
const CALENDAR_FEATURE_KEY = "CALENDAR";

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
  /** The automatic features the guests will see, with their Spanish labels. */
  readonly automaticFeatures: readonly string[];
}

/**
 * The included feature keys of the invitation's own package, or none when the catalog cannot answer for it.
 * A missing package fails closed: no WhatsApp field, and only the always-available calendar is promised.
 */
function includedFeatureKeys(
  invitation: OwnedInvitation,
  packages: readonly CreatorPackage[] | undefined,
): readonly string[] {
  return packages?.find((item) => item.id === invitation.packageId)?.includedFeatureKeys ?? [];
}

/**
 * The section of one invitation. `packages` is the creator catalog read the page already has; when it could
 * not be read, `undefined` hides the WhatsApp field rather than offering a field the package may not grant.
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
    automaticFeatures: AUTOMATIC_FEATURES.filter(
      (feature) => feature.key === CALENDAR_FEATURE_KEY || included.has(feature.key),
    ).map((feature) => feature.label),
  };
}

/** The most characters a submitted phone may carry, so a hostile form cannot grow the request. */
const MAX_PHONE_TEXT_LENGTH = 32;

export type FeatureSettingsParse =
  | {
      readonly ok: true;
      readonly timeZone: InvitationTimeZone;
      readonly whatsappPhone: string | null;
    }
  | { readonly ok: false; readonly issues: readonly FeatureIssueCode[] };

/**
 * The feature data a submitted form asks to save. The zone must be one the API accepts, so nothing is sent
 * when it is not; a blank phone means "no phone", which is how the creator clears it (S4). The phone text
 * travels as typed, because the API owns normalization and answers its own issue when it refuses.
 */
export function parseFeatureSettingsForm(form: FormData): FeatureSettingsParse {
  const submittedZone = form.get("timeZone");
  const zone =
    typeof submittedZone === "string" && isInvitationTimeZone(submittedZone)
      ? submittedZone
      : undefined;
  const submittedPhone = form.get("whatsappPhone");
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

  if (issues.length > 0 || zone === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, timeZone: zone, whatsappPhone };
}

/**
 * Saves the invitation's feature data through `PUT /invitations/:id/features` (S3, S4). The API authorizes
 * the invitation, validates the zone and the phone, and refuses an archived draft; this function only maps
 * each outcome to the page's query. An id that names nothing sends nothing, and a refusal that names issues
 * comes back as Spanish sentences through `featureIssueCodes`.
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
