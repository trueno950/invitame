import { LOCK_SCREEN_COPY } from "../customer/copy.ts";
import { isInvitationSlug } from "../server/invitations-api.ts";
import type { PublicInvitationsClient } from "../server/public-invitations-api.ts";
import { publicInvitationPath } from "./invitation-page.ts";

/**
 * The lock screen of a password-protected invitation (F13; S2.13, L18.1, L18.2, L18.3).
 *
 * The API owns the gate: while an invitation stores an access code, every public read and write answers 423
 * `INVITATION_LOCKED` with one display name and no invitation data at all, and a correct code answers a token the web
 * stores in its own `HttpOnly` cookie. So this module only decides four things:
 *
 * - what a locked answer carries, read strictly: the lock state and the display name, nothing else;
 * - what the guest's screen draws, in the words of the artboard
 *   `design/password-invitation/01-pantalla-con-candado.html`, mapped to the app's own tokens;
 * - which of the two neutral sentences the page shows after a refused attempt, and nowhere for it to say why;
 * - what the submitted form becomes, and which page the action comes back to.
 *
 * Nothing here logs, and nothing here ever holds the code beyond the request that carried it.
 */

/** The exact code of the locked answer (L18.2). */
export const INVITATION_LOCK_CODE = "INVITATION_LOCKED";

/** The longest display name a locked answer may carry; the API cuts its own to the same width (L18.3). */
export const LOCK_SCREEN_DISPLAY_NAME_MAX_LENGTH = 80;

/**
 * The widest code a guest may type: no invitation stores one longer than 40 characters (L18.1), so a wider value is not a
 * code and never becomes a request. The API's own body bound is wider, so nothing it would accept is refused here.
 */
export const UNLOCK_PASSWORD_MAX_LENGTH = 40;

/** What a locked answer tells the page: who is celebrating, or null when the stored content names nobody (L18.3). */
export interface InvitationLock {
  readonly displayName: string | null;
  /**
   * The current address a previous one must move to before the lock screen (F11; L15.3), or null when the request already
   * names the current address. A locked guest who followed a renamed link is sent to the address the invitation is served
   * from first, because the cookie this device sets for it is scoped to that address (L18.2).
   */
  readonly redirectTo: string | null;
}

/**
 * The lock state of a 423 body, or `undefined` when the body is not the documented locked answer. Only the display name and
 * the current address are kept: a body that grew a date, a place, or an id never passes one of those facts to a locked
 * page.
 */
export function parseInvitationLockedBody(value: unknown): InvitationLock | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const body = value as Record<string, unknown>;

  if (body.code !== INVITATION_LOCK_CODE) {
    return undefined;
  }

  // An absent field is an API written before F13 carried it, and means "no redirect"; a value that is not a slug is not
  // this contract, so the whole body is refused instead of being followed (L20).
  const redirectTo = body.redirectTo === undefined ? null : body.redirectTo;

  if (!(redirectTo === null || isInvitationSlug(redirectTo))) {
    return undefined;
  }
  const displayName = body.displayName;

  if (displayName === null) {
    return { displayName: null, redirectTo };
  }
  if (
    typeof displayName !== "string" ||
    displayName.trim() === "" ||
    [...displayName].length > LOCK_SCREEN_DISPLAY_NAME_MAX_LENGTH
  ) {
    return undefined;
  }

  return { displayName, redirectTo };
}

/**
 * The current address a locked request must move to before anything is drawn (F13; L18.2), or undefined when there is
 * nothing to move to. The page answers it with a permanent redirect and the calendar file with a 308, exactly as the
 * unlocked alias redirect does, so the lock screen and the cookie the guest sets from it both live at the address the
 * invitation is served from. A target that is not a slug, or the address the request already names, answers no redirect:
 * an invitation never sends a guest in a circle.
 */
export function lockedRedirectSlug(slug: string, redirectTo: string | null): string | undefined {
  if (redirectTo === null || redirectTo === slug || !isInvitationSlug(redirectTo)) {
    return undefined;
  }

  return redirectTo;
}

/** The one query parameter of the lock screen, and the closed set of codes it may carry (L18.3). */
export const LOCK_NOTICE_PARAM = "acceso";
export const LOCK_NOTICE_CODES = ["rejected", "limited"] as const;
export type LockNoticeCode = (typeof LOCK_NOTICE_CODES)[number];

/**
 * The two refusals of an unlock, as the one sentence the page shows (L18.3): a wrong code and an attempt over the limit
 * say the same small amount — the guest has to try again, or wait — and never which of the two happened.
 */
const LOCK_NOTICE_MESSAGES: Readonly<Record<LockNoticeCode, string>> = {
  rejected: LOCK_SCREEN_COPY.rejected,
  limited: LOCK_SCREEN_COPY.limited,
};

/** The sentence the page renders, with the code it came from. */
export interface LockNotice {
  readonly code: LockNoticeCode;
  readonly message: string;
}

/**
 * Every sentence the lock screen can show: the two refusals of an unlock attempt and the one of a public write refused
 * because the invitation is still locked (L18.2). They share the screen's alert region and nothing else.
 */
export interface LockScreenNotice {
  readonly code: LockNoticeCode | "locked";
  readonly message: string;
}

function isLockNoticeCode(value: unknown): value is LockNoticeCode {
  return typeof value === "string" && (LOCK_NOTICE_CODES as readonly string[]).includes(value);
}

/** The Spanish sentence of the notice the page's query carries, or undefined for anything the page does not know. */
export function lockNotice(
  parameters: Record<string, string | string[] | undefined> = {},
): LockNotice | undefined {
  const code = parameters[LOCK_NOTICE_PARAM];

  return isLockNoticeCode(code) ? { code, message: LOCK_NOTICE_MESSAGES[code] } : undefined;
}

/** The lock screen of one invitation with one notice, which is the page the refused unlock comes back to. */
export function lockNoticeTarget(slug: string, code: LockNoticeCode): string {
  return `${publicInvitationPath(slug)}?${LOCK_NOTICE_PARAM}=${code}`;
}

/** What the lock screen draws of one invitation: the artboard's four lines and the celebration it may name. */
export interface LockScreenView {
  readonly slug: string;
  /** The celebration's name, or the screen's generic line for an invitation that names nobody (L18.3). */
  readonly subject: string;
  readonly privateLine: string;
  readonly fieldLabel: string;
  readonly submit: string;
  readonly hint: string;
  /** The one sentence of a refused attempt, or of a refused write, absent while nothing was refused. */
  readonly notice?: LockScreenNotice;
}

/**
 * The screen the guest reads while the invitation is locked. The artboard's script line is the subject, which is the one
 * fact the API answered; when the content names nobody the screen says «Invitación privada» instead of inventing a name.
 * A slug that cannot be one names no invitation, so the page has nothing to draw.
 */
export function lockScreenView(input: {
  readonly slug: string;
  readonly displayName: string | null;
  readonly notice?: LockScreenNotice;
}): LockScreenView | undefined {
  if (!isInvitationSlug(input.slug)) {
    return undefined;
  }

  return {
    slug: input.slug,
    subject: input.displayName ?? LOCK_SCREEN_COPY.privateTitle,
    privateLine: LOCK_SCREEN_COPY.privateLine,
    fieldLabel: LOCK_SCREEN_COPY.fieldLabel,
    submit: LOCK_SCREEN_COPY.submit,
    hint: LOCK_SCREEN_COPY.hint,
    ...(input.notice === undefined ? {} : { notice: input.notice }),
  };
}

/** One submitted lock screen: the invitation it names and the code the guest typed. */
export type UnlockFormParse =
  | { readonly ok: true; readonly slug: string; readonly password: string }
  | { readonly ok: false };

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/**
 * One submitted lock screen. The local rules are only the ones a form can get wrong without any judgement — a missing
 * slug, a missing code, and a code wider than any code — so the API stays the authority on the gate, the version, and the
 * rate limit. The surrounding spaces are trimmed exactly as the API trims before hashing and verifying, so a code copied
 * out of a message with a trailing space still opens the invitation.
 */
export function parseUnlockForm(form: FormData): UnlockFormParse {
  const slug = text(form, "slug");
  const password = text(form, "password")?.trim() ?? "";

  if (slug === undefined || !isInvitationSlug(slug)) {
    return { ok: false };
  }
  if (password === "" || [...password].length > UNLOCK_PASSWORD_MAX_LENGTH) {
    return { ok: false };
  }

  return { ok: true, slug, password };
}

/** The client call this module needs, so a test can hand it a fake and see exactly what it sent. */
export type UnlockClient = Pick<PublicInvitationsClient, "unlock">;

/**
 * What one attempt became: the token to store, the page to come back to, or a form the page cannot read. The token is
 * never part of a URL and never logged; the caller stores it in the invitation's own `HttpOnly` cookie.
 */
export type UnlockOutcome =
  | { readonly kind: "unlocked"; readonly slug: string; readonly accessToken: string }
  | { readonly kind: "refused"; readonly target: string }
  | { readonly kind: "invalid" };

/**
 * Sends one attempt and answers what the action does next (L18.2, L18.3). The guest's address is the one the caller read
 * from the incoming request's headers — never the form — and it is what the API's rate limit counts against. Every
 * refusal becomes one of the two sentences of the lock screen, so the guest never reads an API body and an outage never
 * breaks the page.
 */
export async function unlockInvitationWith(
  client: UnlockClient,
  form: FormData,
  request: { readonly clientAddress: string | undefined },
): Promise<UnlockOutcome> {
  const parsed = parseUnlockForm(form);

  if (!parsed.ok) {
    return { kind: "invalid" };
  }

  const unlocked = await client.unlock(parsed.slug, parsed.password, {
    ...(request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress }),
  });

  if (unlocked.ok) {
    return { kind: "unlocked", slug: parsed.slug, accessToken: unlocked.accessToken };
  }

  // Both refusals come back to the same screen; only the sentence changes, and it never says why.
  return {
    kind: "refused",
    target: lockNoticeTarget(
      parsed.slug,
      unlocked.failure === "rate-limited" ? "limited" : "rejected",
    ),
  };
}
