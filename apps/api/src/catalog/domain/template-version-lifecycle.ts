/** The lifecycle states of a `TemplateVersion`, spelled as the database enum (S5, L4). */
export const TEMPLATE_VERSION_STATUSES = ["DRAFT", "PUBLISHED", "RETIRED"] as const;

export type TemplateVersionStatus = (typeof TEMPLATE_VERSION_STATUSES)[number];

// DRAFT -> PUBLISHED -> RETIRED and nothing else: a retired version never returns, and a published one
// never goes back to draft. The `TemplateVersion_status_transition` trigger repeats this table.
const LEGAL_TRANSITIONS: ReadonlyArray<readonly [TemplateVersionStatus, TemplateVersionStatus]> = [
  ["DRAFT", "PUBLISHED"],
  ["PUBLISHED", "RETIRED"],
];

/** The largest value of the `TemplateVersion.version` column (PostgreSQL `INTEGER`). */
const MAX_VERSION_NUMBER = 2_147_483_647;

export class IllegalTemplateVersionTransitionError extends Error {
  constructor(
    readonly from: TemplateVersionStatus,
    readonly to: TemplateVersionStatus,
  ) {
    super(`Illegal template version transition from ${from} to ${to}`);
    this.name = "IllegalTemplateVersionTransitionError";
  }
}

export class InvalidTemplateVersionNumberError extends Error {
  constructor(readonly value: number) {
    super(`Invalid template version number: ${String(value)}`);
    this.name = "InvalidTemplateVersionNumberError";
  }
}

/** Whether a version may change from `from` to `to`; staying in the same status is not a transition. */
export function canTransitionTemplateVersion(
  from: TemplateVersionStatus,
  to: TemplateVersionStatus,
): boolean {
  return LEGAL_TRANSITIONS.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);
}

export function assertTemplateVersionTransition(
  from: TemplateVersionStatus,
  to: TemplateVersionStatus,
): void {
  if (!canTransitionTemplateVersion(from, to)) {
    throw new IllegalTemplateVersionTransitionError(from, to);
  }
}

/**
 * The number of the next version of a template: the highest existing number plus one, or 1 when the
 * template has none. A number that is not a positive integer below the column's limit cannot be a
 * stored version, and the next one would not fit, so it is refused.
 */
export function nextTemplateVersionNumber(existing: readonly number[]): number {
  let highest = 0;
  for (const value of existing) {
    if (!Number.isInteger(value) || value < 1 || value >= MAX_VERSION_NUMBER) {
      throw new InvalidTemplateVersionNumberError(value);
    }
    highest = Math.max(highest, value);
  }
  return highest + 1;
}
