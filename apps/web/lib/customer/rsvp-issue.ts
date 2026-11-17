import { RSVP_SETTINGS_ISSUE_COPY } from "./copy.ts";

/**
 * Why the API refused an RSVP settings save, and how it reaches the creator in Spanish (M6 G3; S4). The API answers
 * deterministic English issues (`deadline must be an ISO 8601 instant with an offset, or null`, ...); the save
 * action turns each one into a small code in the page's query, and the page turns the code back into one of these
 * sentences. Raw English never reaches a customer, a repeated issue is named once, and an issue this module does not
 * recognize becomes the generic `other` instead of being guessed at.
 *
 * This module imports nothing from the invitation actions, so both the action and the page notices can use it
 * without a cycle — the same shape `feature-issues.ts` has.
 */

/** The notice/error code of a refused RSVP settings save, shared by the action and the page. */
export const RSVP_SETTINGS_ERROR_CODE = "rsvp-settings-invalid";

/** The small codes one refusal can carry; `other` covers every issue this module does not know. */
export const RSVP_SETTINGS_ISSUE_CODES = ["deadline", "party", "other"] as const;
export type RsvpSettingsIssueCode = (typeof RSVP_SETTINGS_ISSUE_CODES)[number];

/**
 * The API's own sentences, mirrored by hand: the web never imports API code, so these strings are the contract.
 * `apps/api/src/invitations/domain/invitation-rsvp.ts` writes them, and a change there is a change to this map.
 */
const DEADLINE_ISSUE = "deadline must be an ISO 8601 instant with an offset, or null";
const PARTY_TYPE_ISSUE = "partyLimit must be an integer";
const PARTY_RANGE_ISSUE = "partyLimit must be between 1 and 10";

const CODE_BY_ISSUE: Readonly<Record<string, RsvpSettingsIssueCode>> = {
  [DEADLINE_ISSUE]: "deadline",
  // Every refusal of the party field is one sentence for the creator: the field, not the reason, is what they
  // have to change.
  [PARTY_TYPE_ISSUE]: "party",
  [PARTY_RANGE_ISSUE]: "party",
};

/** One code per distinct issue, and `other` when the refusal named none this module knows. */
export function rsvpSettingsIssueCodes(issues: readonly string[]): RsvpSettingsIssueCode[] {
  const codes: RsvpSettingsIssueCode[] = [];

  for (const issue of issues) {
    const code = Object.hasOwn(CODE_BY_ISSUE, issue)
      ? (CODE_BY_ISSUE[issue] as RsvpSettingsIssueCode)
      : "other";

    if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes.length === 0 ? ["other"] : codes;
}

/** The target a refused settings save comes back to: its error code and the issue codes it named. */
export function rsvpSettingsIssuesTarget(
  path: string,
  codes: readonly RsvpSettingsIssueCode[],
): string {
  return `${path}?error=${RSVP_SETTINGS_ERROR_CODE}&issues=${codes.join(",")}`;
}

const ISSUE_CODE = /^(?:deadline|party|other)$/;

/** The Spanish sentence of one code; nothing at all for a code this page does not know. */
function issueMessage(code: string): string | undefined {
  return Object.hasOwn(RSVP_SETTINGS_ISSUE_COPY, code)
    ? RSVP_SETTINGS_ISSUE_COPY[code as RsvpSettingsIssueCode]
    : undefined;
}

/**
 * The Spanish sentences of an `issues` query value. Only a comma-separated list of known codes is read, so a
 * hand-edited or invented value shows nothing instead of echoing text.
 */
export function rsvpSettingsIssueMessages(value: string | string[] | undefined): string[] {
  const entries = typeof value === "string" ? value.split(",") : value;

  if (!Array.isArray(entries)) {
    return [];
  }

  const messages: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !ISSUE_CODE.test(entry)) {
      continue;
    }
    const message = issueMessage(entry);
    if (message !== undefined && !messages.includes(message)) {
      messages.push(message);
    }
  }
  return messages;
}
