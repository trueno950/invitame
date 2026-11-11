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

/** Only a DRAFT accepts content changes; an archived invitation is read-only (S7, A3). */
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
