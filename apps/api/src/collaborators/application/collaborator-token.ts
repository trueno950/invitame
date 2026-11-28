import { createHash, randomBytes } from "node:crypto";

import { COLLABORATOR_TOKEN_LENGTH } from "../domain/invitation-collaborator";

// The co-host acceptance token (F12; L17.1, L17.3). The rule is the guest's personal token's rule — 128 bits from the
// platform's cryptographic random source, stored only as its SHA-256 hex digest — so the two features share one
// implementation instead of inventing a second one: these are the pure helpers of the invitations application layer,
// re-exported here under the names this module reads. Nothing is added, nothing is weakened, and no new dependency or
// home-made cryptography appears.
//
// - minting: `crypto.randomBytes(16)`, base64url without padding, 22 characters. The value travels only inside the
//   emailed link; no column, log, or response carries it.
// - hashing: the SHA-256 hex digest, which is what `InvitationCollaborator.tokenHash` holds behind its unique index. A
//   database reader therefore cannot replay a link, and the acceptance is an index probe on the digest — never a string
//   comparison of secrets in application code — so there is no timing oracle to defend against.

export {
  guestTokenHash as collaboratorTokenHash,
  mintGuestToken as mintCollaboratorToken,
} from "../../invitations/application/guest-token";

/** The shape a token in a link must have before it is worth hashing: 22 base64url characters (L17.3). */
const COLLABORATOR_TOKEN_SHAPE = new RegExp(`^[A-Za-z0-9_-]{${COLLABORATOR_TOKEN_LENGTH}}$`);

/**
 * Whether a value a link carried has the shape of a token. A value that does not is refused with the same refusal an
 * unusable link gets, so a malformed link and an expired one are indistinguishable (L17.3).
 */
export function isCollaboratorTokenShape(value: unknown): value is string {
  return typeof value === "string" && COLLABORATOR_TOKEN_SHAPE.test(value);
}

/** A fresh digest, for a caller that wants the stored form of a token it minted itself. */
export function digestCollaboratorToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The random source, injected by a test that wants to observe the exact bytes; production uses the platform's. */
export type CollaboratorRandomBytes = (size: number) => Buffer;

export const platformRandomBytes: CollaboratorRandomBytes = randomBytes;
