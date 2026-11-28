import { createHmac, timingSafeEqual } from "node:crypto";

// The access token of a password-protected invitation (F13; S2.13, L18.2). One mint and one check, both here in the
// application layer because they need the platform's crypto module while the domain stays free of a runtime dependency
// (AGENTS.md, module-template.md).
//
// The token is `invaccess1.<passwordVersion>.<expiry>.<mac>`, where `expiry` is a whole number of seconds since the Unix
// epoch and `mac` is the base64url HMAC-SHA256 of the invitation id, the password version, and that expiry, keyed with
// the deployment's own `INVITATION_ACCESS_SECRET`. Three properties follow from that shape:
//
//   * the invitation is never inside the token: the MAC is computed over the id of the invitation *the request names*, so
//     a token minted for one invitation cannot open another even if their password versions happen to match, and the
//     cookie the web stores carries no id of its own;
//   * a changed or removed password stops every old token, because the version is signed and the gate compares it with
//     the stored one (L18.2);
//   * the expiry is signed too, so a client cannot extend it: an edited expiry fails the MAC.
//
// The comparison is `crypto.timingSafeEqual` over two MACs of the same width, so no byte of a presented token is a timing
// oracle. The secret is never logged, echoed, or returned.

/** How long one minted token opens its invitation: 30 days (L18.2). */
export const INVITATION_ACCESS_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

/** The first field of every token; a value without it is not a token this deployment minted. */
export const INVITATION_ACCESS_TOKEN_PREFIX = "invaccess1";

/** One minted token and the instant it stops opening the invitation. */
export interface MintedInvitationAccessToken {
  /** The value the web stores in its `HttpOnly` cookie. Never logged. */
  readonly token: string;
  /** The instant the token stops opening the invitation, derived from the value it carries. */
  readonly expiresAt: Date;
}

/** Mints and checks the access tokens of the public invitation routes (L18.2). */
export interface InvitationAccessTokens {
  /** Mints one token for this invitation and this stored password version, valid for 30 days. */
  mint(invitationId: string, passwordVersion: number, issuedAt?: Date): MintedInvitationAccessToken;
  /**
   * Whether the presented value opens this invitation at this password version and this instant. False for every case
   * that must not open it: no token, a value of another shape, another invitation's token, an older password version, an
   * expired token, and a token whose fields were edited.
   */
  isValid(
    token: string | undefined,
    invitationId: string,
    passwordVersion: number,
    now?: Date,
  ): boolean;
}

/** The one message both of the token's fields are signed over; the invitation id is a field of its own. */
function signatureInput(invitationId: string, passwordVersion: number, expiresAt: number): string {
  return `${INVITATION_ACCESS_TOKEN_PREFIX}|${invitationId}|${passwordVersion}|${expiresAt}`;
}

/** The base64url MAC of one token's fields. */
function sign(
  secret: string,
  invitationId: string,
  passwordVersion: number,
  expiresAt: number,
): Buffer {
  return createHmac("sha256", secret)
    .update(signatureInput(invitationId, passwordVersion, expiresAt), "utf8")
    .digest();
}

/** A whole, non-negative decimal field of a presented token, or null when the text is not one. */
function readUnsignedInteger(value: string): number | null {
  return /^(0|[1-9][0-9]{0,15})$/u.test(value) ? Number(value) : null;
}

/**
 * The token service of one deployment, keyed with its own `INVITATION_ACCESS_SECRET`. The module binds it once at
 * startup from the validated environment, so no route reads the secret itself.
 */
export function createInvitationAccessTokens(secret: string): InvitationAccessTokens {
  if (secret.length === 0) {
    // The environment validation guarantees a long secret; this keeps the two from disagreeing silently.
    throw new Error("INVITATION_ACCESS_SECRET must be provided.");
  }

  return {
    mint(invitationId, passwordVersion, issuedAt = new Date()) {
      const expiresAt =
        Math.floor(issuedAt.getTime() / 1000) + INVITATION_ACCESS_TOKEN_LIFETIME_SECONDS;
      const mac = sign(secret, invitationId, passwordVersion, expiresAt).toString("base64url");

      return {
        token: `${INVITATION_ACCESS_TOKEN_PREFIX}.${passwordVersion}.${expiresAt}.${mac}`,
        expiresAt: new Date(expiresAt * 1000),
      };
    },

    isValid(token, invitationId, passwordVersion, now = new Date()) {
      if (typeof token !== "string") {
        return false;
      }
      const parts = token.split(".");

      if (parts.length !== 4 || parts[0] !== INVITATION_ACCESS_TOKEN_PREFIX) {
        return false;
      }
      const tokenVersion = readUnsignedInteger(parts[1] ?? "");
      const expiresAt = readUnsignedInteger(parts[2] ?? "");
      const presented = parts[3] ?? "";

      if (tokenVersion === null || expiresAt === null || !/^[A-Za-z0-9_-]+$/u.test(presented)) {
        return false;
      }
      // The stored version decides: a token of an older password answers false even before its expiry (L18.2).
      if (tokenVersion !== passwordVersion) {
        return false;
      }
      if (expiresAt * 1000 <= now.getTime()) {
        return false;
      }
      const expected = sign(secret, invitationId, passwordVersion, expiresAt);
      const received = Buffer.from(presented, "base64url");

      return received.length === expected.length && timingSafeEqual(received, expected);
    },
  };
}

/** The DI token of the one token service of the process (L18.2). */
export const INVITATION_ACCESS_TOKENS = Symbol("InvitationAccessTokens");
