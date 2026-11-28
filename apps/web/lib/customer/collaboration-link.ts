/**
 * The acceptance link the co-host invitation email carries (F12; S2.12, L17.3). The API builds the address from
 * `COLLABORATOR_ACCEPTANCE_PATH` in `collaborator-invitation-message.ts`, and the token inside it is a single-use,
 * seven-day secret. These helpers are pure and import nothing, so the API client (which refuses a token that cannot be
 * one before spending a request) and the pages (which say where the link lands) agree on one shape.
 */

/**
 * The path of the acceptance, exactly as the API's message builds it: `/colaboraciones/aceptar`. Nothing here may
 * disagree with that constant, because the emailed link is the only way a person reaches the screen.
 */
export const COLLABORATION_ACCEPT_PATH = "/colaboraciones/aceptar";

/** The route that remembers the acceptance across the sign-in and sends the visitor back to it. */
export const COLLABORATION_ACCEPT_SIGN_IN_PATH = "/colaboraciones/aceptar/ingresar";

/** The two addresses of the acceptance, so a command and its page never build a path differently. */
export const COLLABORATION_PATHS = {
  accept: COLLABORATION_ACCEPT_PATH,
  acceptSignIn: COLLABORATION_ACCEPT_SIGN_IN_PATH,
} as const;

/**
 * The exact width of an acceptance token: 16 random bytes as base64url characters, the shape the API mints. A value of
 * another shape names no collaboration, so nothing sends it.
 */
export const COLLABORATOR_TOKEN_LENGTH = 22;
const COLLABORATOR_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** Whether a value can be an acceptance token this product minted; anything else names nothing. */
export function isCollaborationToken(value: unknown): value is string {
  return typeof value === "string" && COLLABORATOR_TOKEN.test(value);
}

/** The acceptance page's address for one token: the same path and parameter the email's link carries. */
export function collaborationAcceptPath(token: string): string {
  return `${COLLABORATION_ACCEPT_PATH}?token=${encodeURIComponent(token)}`;
}

/**
 * Whether a stored return path is the acceptance page with one well-formed token. The after-sign-in hand-off answers a
 * value it kept in this process's memory, and it is validated again when it is read, so a return can never leave the
 * page it names.
 */
export function isCollaborationAcceptPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(`${COLLABORATION_ACCEPT_PATH}?`)) {
    return false;
  }

  const parameters = new URLSearchParams(value.slice(value.indexOf("?") + 1));
  const tokens = parameters.getAll("token");

  return (
    tokens.length === 1 &&
    [...parameters.keys()].every((key) => key === "token") &&
    isCollaborationToken(tokens[0])
  );
}
