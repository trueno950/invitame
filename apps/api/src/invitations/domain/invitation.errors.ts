import type { InvitationStatus } from "./invitation-lifecycle";

/**
 * A randomness source handed to the slug generator did not return a number in `[0, 1)`. Refusing is
 * better than emitting a slug the database CHECK constraint would reject.
 */
export class InvalidInvitationSlugRandomnessError extends Error {
  constructor(readonly value: unknown) {
    super(`Invalid slug randomness value: ${describeRandomness(value)}`);
    this.name = "InvalidInvitationSlugRandomnessError";
  }
}

function describeRandomness(value: unknown): string {
  return typeof value === "number" ? String(value) : String(JSON.stringify(value));
}

/** A full slug equal to a reserved word would collide with a route or a future product page. */
export class ReservedInvitationSlugError extends Error {
  constructor(readonly slug: string) {
    super(`The slug ${JSON.stringify(slug)} is reserved.`);
    this.name = "ReservedInvitationSlugError";
  }
}

/**
 * A DRAFT or a PUBLISHED invitation accepts content changes; a published one changes live (S7). An archived
 * invitation is read-only (A2).
 */
export class InvitationNotEditableError extends Error {
  constructor(readonly status: InvitationStatus) {
    super(`An invitation with status ${status} is read-only.`);
    this.name = "InvitationNotEditableError";
  }
}

/** Archiving an already archived invitation is refused; an archived invitation is never deleted. */
export class InvitationAlreadyArchivedError extends Error {
  constructor() {
    super("The invitation is already archived.");
    this.name = "InvitationAlreadyArchivedError";
  }
}

/** Publishing an already published invitation is refused, so no repeated publish looks successful (S7). */
export class InvitationAlreadyPublishedError extends Error {
  constructor() {
    super("The invitation is already published.");
    this.name = "InvitationAlreadyPublishedError";
  }
}

/** Unpublishing an invitation that is not published is refused; only a PUBLISHED one returns to DRAFT (S7). */
export class InvitationNotPublishedError extends Error {
  constructor() {
    super("The invitation is not published.");
    this.name = "InvitationNotPublishedError";
  }
}

/**
 * The invitation is not ready to publish: its content is incomplete or invalid against the pinned schema,
 * its package no longer fits, or the pinned template version is no longer published (A1). `issues` are the
 * deterministic English explanations `publicationIssues` produced; nothing was stored.
 */
export class InvitationNotPublishableError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The invitation is not ready to publish.");
    this.name = "InvitationNotPublishableError";
  }
}
