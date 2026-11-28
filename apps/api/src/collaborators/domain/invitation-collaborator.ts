/**
 * The co-host rules (F12; S2.12, L17.1, L17.2, L17.3). Three grantable permissions, one invited address, one
 * single-use acceptance window, and what a stored row means — decided here, where the domain owns the invariants, and
 * repeated by the database (migration `20261214120000_add_invitation_collaborators`) for a reader that does not go
 * through the API.
 *
 * Owner-only and never grantable, by construction: paying, checkout, refunds, archiving, renaming the public address
 * (F11), and managing collaborators. None of them is a permission, so none of them can be granted by a request body, a
 * catalog change, or a stored row.
 */

/** The three things a co-host may be allowed to do (L17.2), in the order the owner's screen shows them. */
export const INVITATION_PERMISSIONS = ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"] as const;

export type InvitationPermission = (typeof INVITATION_PERMISSIONS)[number];

/** How many non-revoked collaborators one invitation keeps (L17.1). The database refuses the sixth. */
export const MAX_INVITATION_COLLABORATORS = 5;

/** How long an emailed acceptance link works (L17.1, L17.3): seven days from the invitation. */
export const COLLABORATOR_INVITATION_TTL_DAYS = 7;

/** The width of `User.email` and of the stored invited address. */
export const COLLABORATOR_EMAIL_MAX_LENGTH = 320;

/** How long a minted acceptance token is, in base64url characters: 16 random bytes, like a guest's personal token. */
export const COLLABORATOR_TOKEN_LENGTH = 22;

/**
 * What an invited address that cannot be used is refused with. The message states the rule, never the offending value,
 * so a refusal can be logged and returned as is.
 */
export const COLLABORATOR_EMAIL_ISSUE = "email must be an email address of at most 320 characters";

/** What a permission set that cannot be stored is refused with (empty, unknown, repeated, or not a list). */
export const COLLABORATOR_PERMISSIONS_ISSUE =
  "permissions must be a non-empty list of EDIT_CONTENT, VIEW_ATTENDANCE, or PUBLISH, without repeats";

/** The lifecycle of one stored row as the owner's screen reads it (L17.3): revoked rows are not offered at all. */
export type InvitationCollaboratorStatus = "PENDING" | "ACTIVE" | "REVOKED";

/** The outcome of validating a value: the normalized one, or the rules it broke. */
export type CollaboratorValidation<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issues: readonly string[] };

/** Whether a value is one exact member of the permission allow-list; nothing is trimmed or case-folded. */
export function isInvitationPermission(value: unknown): value is InvitationPermission {
  return typeof value === "string" && (INVITATION_PERMISSIONS as readonly string[]).includes(value);
}

/** Whether a stored permission set grants this permission; a value outside the allow-list never does (L20). */
export function hasInvitationPermission(stored: readonly unknown[], required: string): boolean {
  return isInvitationPermission(required) && stored.includes(required);
}

/** Whether one of the route's permissions is granted: what a route declared as "any of these" reads. */
export function grantsInvitationPermission(
  granted: readonly InvitationPermission[],
  required: InvitationPermission,
): boolean {
  return granted.includes(required);
}

/**
 * The stored invited address (L17.1): trimmed and lower-cased, exactly as Better Auth stores an account's address, so
 * the acceptance compares two values normalized the same way. One address is refused for every shape an address must
 * not have, and the refusal names the rule and never the value.
 */
export function normalizeCollaboratorEmail(value: unknown): CollaboratorValidation<string> {
  if (typeof value !== "string") {
    return { ok: false, issues: [COLLABORATOR_EMAIL_ISSUE] };
  }
  const email = value.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > COLLABORATOR_EMAIL_MAX_LENGTH ||
    // The same shape the rest of the API accepts for an address (create-administrator): no whitespace on either side
    // of the single `@`. Anything stricter would refuse an address this product already stores.
    !/^[^\s@]+@[^\s@]+$/.test(email)
  ) {
    return { ok: false, issues: [COLLABORATOR_EMAIL_ISSUE] };
  }

  return { ok: true, value: email };
}

/**
 * The permission set a request asks for (L17.2): at least one of the three, no unknown value, no repeat, and answered
 * in the domain's canonical order so a stored row reads the same however the client ordered its list.
 */
export function normalizeInvitationPermissions(
  value: unknown,
): CollaboratorValidation<InvitationPermission[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, issues: [COLLABORATOR_PERMISSIONS_ISSUE] };
  }
  const requested = new Set<InvitationPermission>();

  for (const entry of value) {
    if (!isInvitationPermission(entry) || requested.has(entry)) {
      return { ok: false, issues: [COLLABORATOR_PERMISSIONS_ISSUE] };
    }
    requested.add(entry);
  }

  return {
    ok: true,
    value: INVITATION_PERMISSIONS.filter((permission) => requested.has(permission)),
  };
}

/** The permissions a stored row actually grants: what the allow-list knows, in the canonical order (L20). */
export function storedInvitationPermissions(stored: readonly unknown[]): InvitationPermission[] {
  return INVITATION_PERMISSIONS.filter((permission) => stored.includes(permission));
}

/** When an invitation sent at this instant stops being acceptable: seven days later (L17.1). */
export function collaboratorInvitationExpiresAt(invitedAt: Date): Date {
  return new Date(invitedAt.getTime() + COLLABORATOR_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * What one stored row means (L17.3): revoked first, because a revoked row stays history whatever else it holds;
 * then active once it was accepted; then pending, which is an invitation waiting for its account to accept it.
 */
export function collaboratorStatus(row: {
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}): InvitationCollaboratorStatus {
  if (row.revokedAt !== null) {
    return "REVOKED";
  }
  return row.acceptedAt === null ? "PENDING" : "ACTIVE";
}

/**
 * Whether an acceptance link is still usable at this instant. Expiry is exclusive: the link works up to the instant
 * seven days after the invitation and not at it, so one second of clock skew never extends a link.
 */
export function isCollaboratorInvitationExpired(tokenExpiresAt: Date | null, now: Date): boolean {
  return tokenExpiresAt === null || tokenExpiresAt.getTime() <= now.getTime();
}
