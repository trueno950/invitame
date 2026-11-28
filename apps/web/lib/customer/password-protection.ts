import { PASSWORD_COPY } from "./copy.ts";
import { absolutePublicUrl } from "./invitation-share.ts";
import {
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  invitationNoticeTarget,
  sendInvitationCall,
} from "./invitations.ts";
import { publicInvitationPath } from "../public/invitation-page.ts";
import { isInvitationId, type InvitationsClient } from "../server/invitations-api.ts";

/**
 * The owner's «Pedir contraseña» block of the «Publicar» tab (F13; S2.13, L18.1, L18.5).
 *
 * The API owns everything that matters: it hashes the code with `crypto.scrypt`, stores only the hash, owns the gate on
 * every public route, and raises a version on every write so an older token stops opening the invitation. This module
 * owns the three things a form can get wrong without any judgement, and the state the block renders:
 *
 * - the local rules of the code — 4 to 40 trimmed characters with no control character, which are the domain's own rules
 *   mirrored so a refused value never becomes a request;
 * - whether the block is offered at all (`PASSWORD_PROTECTION` in the package), and which of its two states it draws;
 * - the ready-to-share message, built from the value the owner just typed, which is the only place that value is ever
 *   readable: the API answers whether a code is set and never the code itself.
 *
 * Nothing here logs the code, and no path this module builds ever carries it.
 */

/** The catalog key that gates the capability (L18.5): a package that does not grant it stores no code. */
export const PASSWORD_PROTECTION_FEATURE_KEY = "PASSWORD_PROTECTION";

/** The shortest and longest code the API accepts, mirrored so the field states the rule it enforces (L18.1). */
export const INVITATION_PASSWORD_MIN_LENGTH = 4;
export const INVITATION_PASSWORD_MAX_LENGTH = 40;

/**
 * C0 and C1 control characters, the same rule the API states: a code carrying one cannot be typed from a message and
 * would make two values that look identical open different invitations.
 */
const CONTROL_CHARACTERS = /\p{Cc}/u;

/** What one typed code is: the value to send, or the reason the field refuses it. */
export type InvitationPasswordParse =
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly failure: "missing" | "too-short" | "too-long" | "control" };

/**
 * Validates one typed code exactly as the API's domain does (L18.1): a string of 4 to 40 characters once the surrounding
 * whitespace is removed, with no control character. Whitespace inside the code is kept as typed, so a two-word code stays
 * one code.
 */
export function parseInvitationPassword(value: unknown): InvitationPasswordParse {
  if (typeof value !== "string") {
    return { ok: false, failure: "missing" };
  }
  const password = value.trim();

  if (password.length < INVITATION_PASSWORD_MIN_LENGTH) {
    return { ok: false, failure: "too-short" };
  }
  if (password.length > INVITATION_PASSWORD_MAX_LENGTH) {
    return { ok: false, failure: "too-long" };
  }
  if (CONTROL_CHARACTERS.test(password)) {
    return { ok: false, failure: "control" };
  }

  return { ok: true, password };
}

/** What the block draws of one invitation. */
export interface PasswordProtectionView {
  /** Whether the pinned package grants the capability, which is the only reason the block offers a code. */
  readonly show: boolean;
  /** Whether a code is stored. The value itself is never answered by the API, so the block never has it. */
  readonly protected: boolean;
}

/**
 * The state of the block. A stored code stays readable to its owner after the package withdrew the key — she can remove
 * it, which is an explicit act, and the API still lets her (L18.5) — so the block is offered whenever either side is true.
 */
export function passwordProtectionView(invitation: {
  readonly availableFeatures: readonly string[];
  readonly passwordProtected: boolean;
}): PasswordProtectionView {
  return {
    show: invitation.availableFeatures.includes(PASSWORD_PROTECTION_FEATURE_KEY),
    protected: invitation.passwordProtected,
  };
}

/**
 * The ready-to-share line of a saved code (L18.1): the public link and the value the owner just typed, so she can paste it
 * into the message she sends with the invitation. It is shown once, and the value never becomes a stored fact.
 */
export function passwordShareMessage(publicUrl: string, password: string): string {
  return PASSWORD_COPY.shareMessage(publicUrl, password);
}

/** The client calls this module needs, so a test can hand it fakes and see exactly what it sent. */
export type PasswordActionsApi = Pick<InvitationsClient, "get" | "setPassword" | "clearPassword">;

/** What one save or removal became: where the action comes back to, and the message a save shows once. */
export type PasswordSaveOutcome =
  | {
      readonly kind: "saved";
      readonly target: string;
      /** The ready-to-share line, absent only when the invitation could not be re-read to build its address. */
      readonly message?: string;
    }
  | { readonly kind: "refused"; readonly target: string };

export type PasswordRemoveOutcome =
  | { readonly kind: "removed"; readonly target: string }
  | { readonly kind: "refused"; readonly target: string };

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** The invitation a submitted form names, or nothing when the field is missing or is not an id. */
function invitationIdOf(form: FormData): string | undefined {
  const id = text(form, "id");

  return isInvitationId(id) ? id : undefined;
}

/** Where a form that names no invitation comes back to: the list, which is the page that lists them. */
const LIST_REFUSED = invitationErrorTarget(INVITATION_PATHS.list, "not-found");

/**
 * Saves the code the owner typed (L18.1): the write goes to the API, which hashes it and raises the version so every
 * token minted before it stops opening the invitation. A value the domain would refuse never becomes a request, and every
 * refusal comes back to the invitation with its own sentence. On success the block is answered with the ready-to-share
 * message, built here from the typed value and the invitation's own public address.
 */
export async function saveInvitationPassword(
  api: PasswordActionsApi,
  form: FormData,
  options: { readonly origin: string | undefined },
): Promise<PasswordSaveOutcome> {
  const id = invitationIdOf(form);

  if (id === undefined) {
    return { kind: "refused", target: LIST_REFUSED };
  }

  const path = INVITATION_PATHS.detail(id);
  const parsed = parseInvitationPassword(text(form, "password"));

  if (!parsed.ok) {
    return { kind: "refused", target: invitationErrorTarget(path, "password-invalid") };
  }

  const saved = await sendInvitationCall(() => api.setPassword(id, parsed.password));

  if (!saved.ok) {
    return { kind: "refused", target: invitationFailureTarget(path, saved.failure) };
  }

  // The address the message carries is the invitation's own, read back from the API rather than taken from the form, so a
  // hand-edited body can never put another invitation's link in front of the owner's code.
  const read = await sendInvitationCall(() => api.get(id));
  const publicUrl = read.ok
    ? absolutePublicUrl(options.origin, publicInvitationPath(read.value.slug))
    : undefined;

  return {
    kind: "saved",
    target: path,
    ...(publicUrl === undefined
      ? {}
      : { message: passwordShareMessage(publicUrl, parsed.password) }),
  };
}

/**
 * Removes the stored code (L18.1): the invitation opens again to whoever holds the link, and every token minted while it
 * was protected stops opening it, because the API raises the version on the removal too.
 */
export async function removeInvitationPassword(
  api: PasswordActionsApi,
  form: FormData,
): Promise<PasswordRemoveOutcome> {
  const id = invitationIdOf(form);

  if (id === undefined) {
    return { kind: "refused", target: LIST_REFUSED };
  }

  const path = INVITATION_PATHS.detail(id);
  const removed = await sendInvitationCall(() => api.clearPassword(id));

  return removed.ok
    ? { kind: "removed", target: invitationNoticeTarget(path, "password-removed") }
    : { kind: "refused", target: invitationFailureTarget(path, removed.failure) };
}
