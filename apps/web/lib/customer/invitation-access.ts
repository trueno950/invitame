/**
 * Who the caller is on one invitation, and what that means (F12; S2.12, L17.2, L17.4). The API answers `role` and
 * `permissions` beside every invitation it serves, and these are the only values it can answer: two roles and three
 * grantable capabilities. It is pure and imports nothing, so both the API client (which parses the fields) and the
 * customer pages (which decide which tabs and actions to offer) read one vocabulary.
 *
 * Owner-only capabilities are absent by construction (L17.2): paying, refunds, archiving, renaming the address, and
 * managing collaborators are not permissions, so no request body, stored row, or catalog change can grant them.
 */

/** The two roles the API's reads answer (L17.4). */
export const INVITATION_ROLES = ["OWNER", "COLLABORATOR"] as const;
export type InvitationRole = (typeof INVITATION_ROLES)[number];

/** The three capabilities a co-host may be granted, in the order the owner's screen shows them (L17.2). */
export const INVITATION_PERMISSIONS = ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"] as const;
export type InvitationPermission = (typeof INVITATION_PERMISSIONS)[number];

/** Who the caller is on one invitation, and what it may do there. */
export interface InvitationAccess {
  readonly role: InvitationRole;
  readonly permissions: readonly InvitationPermission[];
}

/** The owner's own access: every capability, and an empty permission set because ownership is not one. */
export const OWNER_ACCESS: InvitationAccess = { role: "OWNER", permissions: [] };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isInvitationRole(value: unknown): value is InvitationRole {
  return typeof value === "string" && (INVITATION_ROLES as readonly string[]).includes(value);
}

function isInvitationPermission(value: unknown): value is InvitationPermission {
  return typeof value === "string" && (INVITATION_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * The caller's access as one API body states it (L17.4, L17.5, L20). A body written before F12 carries neither field,
 * and it read everyone as the owner, so it still reads as the owner here. Anything else is strict: the role must be one
 * of the two, a collaborator's set must hold at least one allow-listed permission with no repeat, and an owner's set is
 * empty — a value the contract does not have refuses the whole body instead of quietly widening or narrowing access.
 *
 * The permissions come back in the domain's canonical order, so a screen, a chip row, and a test never disagree about
 * how a stored set is written down.
 */
export function parseInvitationAccess(value: unknown): InvitationAccess | undefined {
  const body = record(value);

  if (body === undefined) {
    return undefined;
  }

  const hasRole = Object.hasOwn(body, "role");
  const hasPermissions = Object.hasOwn(body, "permissions");

  // The pre-F12 body: no role and no set, which was the owner's own answer to its own invitation (L20).
  if (!hasRole && !hasPermissions) {
    return OWNER_ACCESS;
  }

  const role = body.role;
  const permissions = body.permissions;

  if (!isInvitationRole(role) || !Array.isArray(permissions)) {
    return undefined;
  }

  if (role === "OWNER") {
    return permissions.length === 0 ? OWNER_ACCESS : undefined;
  }

  if (permissions.length === 0) {
    return undefined;
  }

  const granted = new Set<InvitationPermission>();
  for (const entry of permissions) {
    if (!isInvitationPermission(entry) || granted.has(entry)) {
      return undefined;
    }
    granted.add(entry);
  }

  return { role, permissions: INVITATION_PERMISSIONS.filter((entry) => granted.has(entry)) };
}

/** Whether this caller owns the invitation and therefore holds every capability (L17.2). */
export function isInvitationOwner(access: InvitationAccess): boolean {
  return access.role === "OWNER";
}

/** Whether the caller may do one thing here: the owner always may, a collaborator only when it was granted. */
export function grantsInvitationPermission(
  access: InvitationAccess,
  permission: InvitationPermission,
): boolean {
  return isInvitationOwner(access) || access.permissions.includes(permission);
}
