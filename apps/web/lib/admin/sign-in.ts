import { type BrowserFetch, normalizeCode } from "../customer/sign-in.ts";
import { ADMIN_SIGN_IN_COPY } from "./copy.ts";

/**
 * Administrator sign-in from the browser (M2 T8d; S6, S20, S22, S36). Every request goes to the
 * same-origin `/api/auth` proxy, so the browser receives the challenge and session cookies itself.
 * Nothing here shows the API's error text: each answer maps to a fixed failure with fixed Spanish
 * copy. The API decides who may sign in; these functions only describe its answers.
 *
 * Better Auth 1.7.16 answers, as configured by the API (`apps/api/src/auth`):
 * - `POST /sign-in/email` `{ email, password }`: an enrolled administrator gets
 *   `200 { twoFactorRedirect: true, twoFactorMethods: ["totp"] }` and a challenge cookie (600 s); a
 *   pending administrator gets `200 { redirect, token, user }` and a session. A wrong address or
 *   password, a customer, a disabled user, and an expired initial password all get
 *   `401 INVALID_EMAIL_OR_PASSWORD`; the rate limit answers `429`.
 * - `POST /two-factor/verify-totp` `{ code }` and `POST /two-factor/verify-backup-code` `{ code }`:
 *   `200 { token, user }` and a session; `401 INVALID_CODE` or `INVALID_BACKUP_CODE` for a wrong code;
 *   `401 INVALID_TWO_FACTOR_COOKIE` when the challenge is missing or expired;
 *   `400 TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` after 5 wrong codes in one challenge;
 *   `429 ACCOUNT_TEMPORARILY_LOCKED` for 15 minutes after 10 failures; `429` for the rate limit.
 *   The API forces `trustDevice: false`, so the browser never sends it.
 */

export type AdminSignInFailure = "invalid-credentials" | "too-many-attempts" | "unavailable";
export type PasswordStepOutcome =
  | { ok: true; next: "second-factor" | "signed-in" }
  | { ok: false; failure: AdminSignInFailure };

export type SecondFactorFailure =
  | "invalid-code"
  | "invalid-backup-code"
  | "challenge-expired"
  | "attempts-exhausted"
  | "locked"
  | "too-many-attempts"
  | "unavailable";
export type SecondFactorOutcome = { ok: true } | { ok: false; failure: SecondFactorFailure };

const PASSWORD_SIGN_IN_PATH = "/api/auth/sign-in/email";
const VERIFY_TOTP_PATH = "/api/auth/two-factor/verify-totp";
const VERIFY_BACKUP_CODE_PATH = "/api/auth/two-factor/verify-backup-code";
const BACKUP_CODE_PATTERN = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;

/** Keeps ASCII digits only, at most 6, so a pasted "123 456" still works. */
export function normalizeAuthenticatorCode(raw: string): string {
  return normalizeCode(raw);
}

export function isCompleteAuthenticatorCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

/**
 * Removes whitespace and adds the middle dash when it is missing. The case is kept: Better Auth
 * generates backup codes from upper- and lower-case letters and digits and compares them exactly.
 */
export function normalizeBackupCode(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  return /^[A-Za-z0-9]{10}$/.test(compact) ? `${compact.slice(0, 5)}-${compact.slice(5)}` : compact;
}

/** A shape check for early feedback only; the API decides whether the code is valid. */
export function isPlausibleBackupCode(code: string): boolean {
  return BACKUP_CODE_PATTERN.test(code);
}

/** The body of an answer, or undefined when it is not JSON. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** The `code` field of a Better Auth error body, or undefined. */
export async function errorCode(response: Response): Promise<string | undefined> {
  const body = await readJson(response);
  if (typeof body === "object" && body !== null) {
    const code = (body as Record<string, unknown>).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function postJson(fetch: BrowserFetch, path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
}

/**
 * - 200 with `twoFactorRedirect: true`: the second factor comes next.
 * - 200 with a `user`: a pending administrator is signed in; the server sends it to enrollment.
 * - 400 or 401, whatever the code: one generic credentials failure (S20, S22).
 * - 429: the rate limit. Anything else: unavailable.
 */
export async function classifyPasswordResponse(response: Response): Promise<PasswordStepOutcome> {
  if (response.status === 200) {
    const body = await readJson(response);
    const fields =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

    if (fields.twoFactorRedirect === true) {
      return { ok: true, next: "second-factor" };
    }
    if (typeof fields.user === "object" && fields.user !== null) {
      return { ok: true, next: "signed-in" };
    }
    return { ok: false, failure: "unavailable" };
  }

  await response.body?.cancel();

  if (response.status === 400 || response.status === 401) {
    return { ok: false, failure: "invalid-credentials" };
  }
  if (response.status === 429) {
    return { ok: false, failure: "too-many-attempts" };
  }
  return { ok: false, failure: "unavailable" };
}

const SECOND_FACTOR_ERRORS: Readonly<Record<string, SecondFactorFailure>> = {
  INVALID_CODE: "invalid-code",
  INVALID_BACKUP_CODE: "invalid-backup-code",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "attempts-exhausted",
  ACCOUNT_TEMPORARILY_LOCKED: "locked",
};

/**
 * Maps the answer of either second-factor endpoint during sign-in. Any other 401 means the challenge
 * cookie is missing or expired; any other 429 is the rate limit.
 */
export async function classifySecondFactorResponse(
  response: Response,
): Promise<SecondFactorOutcome> {
  if (response.status >= 200 && response.status < 300) {
    await response.body?.cancel();
    return { ok: true };
  }

  const code = await errorCode(response);
  const known = code === undefined ? undefined : SECOND_FACTOR_ERRORS[code];

  if (response.status === 401) {
    return {
      ok: false,
      failure:
        known === "invalid-code" || known === "invalid-backup-code" ? known : "challenge-expired",
    };
  }
  if (response.status === 400 && known === "attempts-exhausted") {
    return { ok: false, failure: known };
  }
  if (response.status === 429) {
    return { ok: false, failure: known === "locked" ? known : "too-many-attempts" };
  }
  return { ok: false, failure: "unavailable" };
}

export async function signInWithPassword(
  fetch: BrowserFetch,
  email: string,
  password: string,
): Promise<PasswordStepOutcome> {
  try {
    return await classifyPasswordResponse(
      await postJson(fetch, PASSWORD_SIGN_IN_PATH, { email, password }),
    );
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}

async function sendSecondFactor(
  fetch: BrowserFetch,
  path: string,
  code: string,
): Promise<SecondFactorOutcome> {
  try {
    return await classifySecondFactorResponse(await postJson(fetch, path, { code }));
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}

/** Completes sign-in with the 6-digit code of the authenticator app. */
export function verifyAuthenticatorCode(
  fetch: BrowserFetch,
  code: string,
): Promise<SecondFactorOutcome> {
  return sendSecondFactor(fetch, VERIFY_TOTP_PATH, code);
}

/** Completes sign-in with one of the backup codes; each works once. */
export function verifyBackupCode(fetch: BrowserFetch, code: string): Promise<SecondFactorOutcome> {
  return sendSecondFactor(fetch, VERIFY_BACKUP_CODE_PATH, code);
}

export function adminSignInFailureMessage(failure: AdminSignInFailure): string {
  switch (failure) {
    case "invalid-credentials":
      return ADMIN_SIGN_IN_COPY.invalidCredentials;
    case "too-many-attempts":
      return ADMIN_SIGN_IN_COPY.tooManyAttempts;
    case "unavailable":
      return ADMIN_SIGN_IN_COPY.unavailable;
  }
}

export function secondFactorFailureMessage(failure: SecondFactorFailure): string {
  switch (failure) {
    case "invalid-code":
      return ADMIN_SIGN_IN_COPY.invalidCode;
    case "invalid-backup-code":
      return ADMIN_SIGN_IN_COPY.invalidBackupCode;
    case "challenge-expired":
      return ADMIN_SIGN_IN_COPY.challengeExpired;
    case "attempts-exhausted":
      return ADMIN_SIGN_IN_COPY.attemptsExhausted;
    case "locked":
      return ADMIN_SIGN_IN_COPY.locked;
    case "too-many-attempts":
      return ADMIN_SIGN_IN_COPY.tooManyAttempts;
    case "unavailable":
      return ADMIN_SIGN_IN_COPY.unavailable;
  }
}
