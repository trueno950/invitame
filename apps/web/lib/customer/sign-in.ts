import { SIGN_IN_COPY } from "./copy.ts";

/**
 * Customer sign-in by email code from the browser (M2 T8c; S6, S24, L39). Every request goes to the
 * same-origin `/api/auth` proxy, so the browser receives any `Set-Cookie` directly and the session
 * cookie stays host-only on the web host (S14). Nothing here reads the API's error text: each answer
 * maps to one of three fixed failures with fixed Spanish copy.
 */

/** The `fetch` subset these requests need; the browser's `fetch` satisfies it. */
export type BrowserFetch = (input: string, init: RequestInit) => Promise<Response>;

export type SignInFailure = "invalid-code" | "too-many-attempts" | "unavailable";
export type SignInOutcome = { ok: true } | { ok: false; failure: SignInFailure };

const SEND_CODE_PATH = "/api/auth/email-otp/send-verification-otp";
const SIGN_IN_PATH = "/api/auth/sign-in/email-otp";
const SIGN_OUT_PATH = "/api/auth/sign-out";
const SESSION_PATH = "/api/auth/get-session";
/** Better Auth 1.7.16 email OTP error codes for a wrong and an expired code; both answer 400. */
const INVALID_CODE_ERRORS = new Set(["INVALID_OTP", "OTP_EXPIRED"]);
/** RFC 5321 caps a forward path at 256 octets, so an address has at most 254 characters. */
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A shape check for early feedback only; the API decides what an address may do. */
export function isPlausibleEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

/** Keeps ASCII digits only, so a pasted "123 456" or "123-456" still works. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const code = (body as Record<string, unknown>).code;
      return typeof code === "string" ? code : undefined;
    }
  } catch {
    // Not JSON: treated like any other unexpected answer.
  }
  return undefined;
}

/**
 * - 2xx: success.
 * - 400 with `INVALID_OTP` or `OTP_EXPIRED`: a wrong or expired code. The API answers an
 *   administrator's or disabled user's email the same way (S22, S24).
 * - 429: the per-IP rate limit.
 * - Anything else (a locked code's 403, other 4xx, 5xx, redirects): one generic retry failure.
 */
export async function classifyAuthResponse(response: Response): Promise<SignInOutcome> {
  if (response.status >= 200 && response.status < 300) {
    await response.body?.cancel();
    return { ok: true };
  }

  if (response.status === 429) {
    await response.body?.cancel();
    return { ok: false, failure: "too-many-attempts" };
  }

  if (response.status === 400 && INVALID_CODE_ERRORS.has((await errorCode(response)) ?? "")) {
    return { ok: false, failure: "invalid-code" };
  }

  return { ok: false, failure: "unavailable" };
}

export function signInFailureMessage(failure: SignInFailure): string {
  switch (failure) {
    case "invalid-code":
      return SIGN_IN_COPY.invalidCode;
    case "too-many-attempts":
      return SIGN_IN_COPY.tooManyAttempts;
    case "unavailable":
      return SIGN_IN_COPY.unavailable;
  }
}

function postJson(fetch: BrowserFetch, path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
}

async function send(fetch: BrowserFetch, path: string, body: unknown): Promise<SignInOutcome> {
  try {
    return await classifyAuthResponse(await postJson(fetch, path, body));
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}

/** Asks for a sign-in code; the API answers the same for every address (S24). */
export function requestSignInCode(fetch: BrowserFetch, email: string): Promise<SignInOutcome> {
  return send(fetch, SEND_CODE_PATH, { email, type: "sign-in" });
}

/** Exchanges the code for a session; on success the browser holds the session cookie. */
export function signInWithCode(
  fetch: BrowserFetch,
  email: string,
  otp: string,
): Promise<SignInOutcome> {
  return send(fetch, SIGN_IN_PATH, { email, otp });
}

/** Whether the browser's cookies still carry a session: `get-session` answers `200 null` without one. */
async function sessionIsGone(fetch: BrowserFetch): Promise<boolean> {
  try {
    const response = await fetch(SESSION_PATH, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    return response.status === 200 && (await response.json()) === null;
  } catch {
    return false;
  }
}

/**
 * Ends the session; the API deletes it and the proxy passes the cleared cookies back. Shared by the
 * customer and administrator pages (M2 T8d). When the sign-out request fails, a session that is
 * already gone (expired, revoked, or without a cookie) still counts as signed out, so the page can
 * move on to its sign-in page instead of offering a button that can never succeed (L40). It reports
 * failure only while a session is still there or the API cannot say.
 */
export async function signOut(fetch: BrowserFetch): Promise<boolean> {
  if ((await send(fetch, SIGN_OUT_PATH, {})).ok) {
    return true;
  }
  return sessionIsGone(fetch);
}
