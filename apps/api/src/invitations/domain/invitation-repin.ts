import { type JsonObject, validateDraftContent } from "./invitation-content";
import type { InvitationStatus } from "./invitation-lifecycle";

// Re-pinning an existing draft (S5, S8.6): the owner approved moving the drafts that already exist to the version
// their template publishes now, so a customer who has not published yet gets the omittable-section switch. The rule
// is deliberately narrow and pure: only a DRAFT that stays DRAFT moves, only to the PUBLISHED version of the same
// template, and only when the stored content still validates against that version — the new version only adds the
// `x-omittable`/`x-require-one` extensions and the optional `omittedSections` property, so nothing typed is lost, and
// a value the new snapshot would refuse skips the draft with the schema's own issues instead of storing it (S8.2).
// A PUBLISHED or ARCHIVED invitation keeps the version it pinned, exactly as before. The database states the same
// three conditions in the `Invitation_pinned_fields_immutable` trigger (migration 20261201120000), and the
// repository re-states them in the `WHERE` of the write, so this rule is the readable statement of an invariant the
// database also enforces.

/** Why one invitation was not moved; each reason is one bucket of the operator's report. */
export const REPIN_SKIP_REASONS = [
  /** The pinned version cannot be read, so its template is unknown. Foreign keys make this unreachable. */
  "PINNED_VERSION_MISSING",
  /** The template has no published version a creator may pin, so there is nothing to move to. */
  "NO_PUBLISHED_VERSION",
  /** The invitation already pins the template's current published version. */
  "ALREADY_CURRENT",
  /** The invitation is PUBLISHED or ARCHIVED: S5 moves drafts only. */
  "NOT_DRAFT",
  /** The target version belongs to another template. */
  "OTHER_TEMPLATE",
  /** The target version is DRAFT or RETIRED, never a version a draft may pin. */
  "TARGET_NOT_PUBLISHED",
  /** The stored content does not validate against the target version's schema. */
  "CONTENT_INVALID",
] as const;

export type RepinSkipReason = (typeof REPIN_SKIP_REASONS)[number];

/** The version a draft would move to: the template's PUBLISHED snapshot, as the catalog answers it. */
export interface RepinTargetVersion {
  readonly id: string;
  readonly templateId: string;
  /** The stored `TemplateVersionStatus`; only `PUBLISHED` is accepted, everything else is refused by its name. */
  readonly status: string;
  /** The target version's schema: the content must validate against it before the move. */
  readonly schema: unknown;
}

/** What the rule reads: the stored invitation and the version its template publishes now, if any. */
export interface DraftRepinInput {
  readonly status: InvitationStatus;
  /** The version the invitation pins today. */
  readonly pinnedVersionId: string;
  /** The template of `pinnedVersionId`, or null when that version cannot be read. */
  readonly pinnedTemplateId: string | null;
  /** The stored content, validated against the target schema; it is never transformed. */
  readonly content: unknown;
  /** The template's current published version, or null when the template has none. */
  readonly target: RepinTargetVersion | null;
}

/** The decision: the one version to move to, or the reason nothing moved and the issues behind it. */
export type DraftRepinDecision =
  | { readonly move: true; readonly toVersionId: string }
  | {
      readonly move: false;
      readonly reason: RepinSkipReason;
      readonly issues: readonly string[];
    };

/** The content of the invitation as the validator reads it; a column that is not an object is refused there. */
function storedContent(content: unknown): unknown {
  return content as JsonObject;
}

/**
 * Decides whether one invitation moves, in a fixed order so the report is stable: an unreadable pinned version, then
 * a template without a published version, then an invitation that is already current, then a status other than
 * DRAFT, then a target of another template, then a target that is not PUBLISHED, and finally the content. The
 * decision carries no content: the move writes only `templateVersionId`, so what the customer typed stays stored
 * (S8.2).
 */
export function decideDraftRepin(input: DraftRepinInput): DraftRepinDecision {
  if (input.pinnedTemplateId === null) {
    return { move: false, reason: "PINNED_VERSION_MISSING", issues: [] };
  }
  if (input.target === null) {
    return { move: false, reason: "NO_PUBLISHED_VERSION", issues: [] };
  }
  // Nothing to move: the invitation already renders the version its template publishes now, in any status.
  if (input.target.id === input.pinnedVersionId) {
    return { move: false, reason: "ALREADY_CURRENT", issues: [] };
  }
  // S5: drafts move, published invitations do not change, and archiving is terminal.
  if (input.status !== "DRAFT") {
    return { move: false, reason: "NOT_DRAFT", issues: [] };
  }
  if (input.target.templateId !== input.pinnedTemplateId) {
    return { move: false, reason: "OTHER_TEMPLATE", issues: [] };
  }
  if (input.target.status !== "PUBLISHED") {
    return { move: false, reason: "TARGET_NOT_PUBLISHED", issues: [] };
  }

  const validation = validateDraftContent(input.target.schema, storedContent(input.content));

  if (!validation.ok) {
    return { move: false, reason: "CONTENT_INVALID", issues: [...validation.issues] };
  }

  return { move: true, toVersionId: input.target.id };
}
