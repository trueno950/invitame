/**
 * An audit entry the domain refuses before it reaches a statement: a value outside the two closed sets, a note that
 * `OTHER` requires and does not have, or a target that is missing, doubled, or not the one the action names.
 * `issue` is the domain's own sentence, so a caller can map it without reading the entry again.
 */
export class InvalidAdminActionError extends Error {
  constructor(readonly issue: string) {
    super(`Invalid administrator audit entry: ${issue}`);
    this.name = "InvalidAdminActionError";
  }
}
