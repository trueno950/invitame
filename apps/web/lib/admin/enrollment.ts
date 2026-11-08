import type { BrowserFetch } from "../customer/sign-in.ts";
import { ENROLLMENT_COPY } from "./enrollment-copy.ts";
import { errorCode, postJson, readJson } from "./sign-in.ts";

/**
 * Enrollment of the authenticator app from the browser (M2 T8d; S6, S21, S36, L42). A pending
 * administrator confirms the password (`POST /api/auth/two-factor/enable`), adds InvitaMe to the app
 * with the QR code or the setup key, and confirms with the first code
 * (`POST /api/auth/two-factor/verify-totp` with the session), which replaces the session with an
 * enrolled one. Requests go to the same-origin proxy.
 *
 * The TOTP URI, its setup key, and the backup codes are secrets. They exist only in the memory of
 * the enrollment client component: never in a URL, a log, web storage, a cookie, a server action
 * argument, or a third-party service. The API shows them once; `/two-factor/get-totp-uri` is
 * disabled, and a second enable replaces an unconfirmed enrollment.
 *
 * Better Auth 1.7.16 answers, as configured by the API:
 * - enable: `200 { method: "totp", totpURI, backupCodes }` (10 codes); `400 INVALID_PASSWORD`;
 *   `400 TOTP_ALREADY_ENABLED` once enrolled; `401` when the session is gone, including after the
 *   24-hour window of the initial password; `429` for the rate limit.
 * - verify-totp: `200 { token, user }` and a new session cookie; `401 INVALID_CODE`;
 *   `401 ENROLLMENT_SUPERSEDED` when the API refuses a first confirmation that lost a race to another
 *   confirmation, an `admin:create` reissue, a `user:disable`, or a sign-out (S39, S40, S45); any
 *   other `401` when the session is gone; `429` for the rate limit.
 */

export interface Enrollment {
  totpURI: string;
  /** The base32 secret of the URI, for manual entry. */
  setupKey: string;
  backupCodes: readonly string[];
}

export type EnableFailure =
  | "invalid-password"
  | "already-enrolled"
  | "session-ended"
  | "too-many-attempts"
  | "unavailable";
export type EnableOutcome =
  | { ok: true; enrollment: Enrollment }
  | { ok: false; failure: EnableFailure };

export type ConfirmFailure =
  | "invalid-code"
  | "session-ended"
  | "enrollment-superseded"
  | "too-many-attempts"
  | "unavailable";
export type ConfirmOutcome = { ok: true } | { ok: false; failure: ConfirmFailure };

const ENABLE_PATH = "/api/auth/two-factor/enable";
const VERIFY_TOTP_PATH = "/api/auth/two-factor/verify-totp";
const BASE32_PATTERN = /^[A-Z2-7]+$/;
const SETUP_KEY_GROUP = 4;

/** The base32 secret of an `otpauth://totp/` URI, upper-cased and without padding. */
export function setupKeyFromUri(uri: string): string | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }

  if (url.protocol !== "otpauth:" || url.host !== "totp") {
    return undefined;
  }

  const secret = (url.searchParams.get("secret") ?? "").toUpperCase().replace(/=+$/, "");
  return BASE32_PATTERN.test(secret) ? secret : undefined;
}

/** "JBSWY3DPEHPK3PXP" becomes "JBSW Y3DP EHPK 3PXP". */
export function groupSetupKey(key: string): string {
  const groups: string[] = [];
  for (let index = 0; index < key.length; index += SETUP_KEY_GROUP) {
    groups.push(key.slice(index, index + SETUP_KEY_GROUP));
  }
  return groups.join(" ");
}

function parseEnrollment(body: unknown): Enrollment | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const { totpURI, backupCodes } = body as Record<string, unknown>;
  const setupKey = typeof totpURI === "string" ? setupKeyFromUri(totpURI) : undefined;

  if (
    typeof totpURI !== "string" ||
    setupKey === undefined ||
    !Array.isArray(backupCodes) ||
    backupCodes.length === 0 ||
    !backupCodes.every((code) => typeof code === "string" && code.length > 0)
  ) {
    return undefined;
  }

  return { totpURI, setupKey, backupCodes: [...backupCodes] as string[] };
}

export async function classifyEnableResponse(response: Response): Promise<EnableOutcome> {
  if (response.status === 200) {
    const enrollment = parseEnrollment(await readJson(response));
    return enrollment ? { ok: true, enrollment } : { ok: false, failure: "unavailable" };
  }

  if (response.status === 400) {
    const code = await errorCode(response);
    if (code === "INVALID_PASSWORD") {
      return { ok: false, failure: "invalid-password" };
    }
    if (code === "TOTP_ALREADY_ENABLED") {
      return { ok: false, failure: "already-enrolled" };
    }
    return { ok: false, failure: "unavailable" };
  }

  await response.body?.cancel();

  if (response.status === 401) {
    return { ok: false, failure: "session-ended" };
  }
  if (response.status === 429) {
    return { ok: false, failure: "too-many-attempts" };
  }
  return { ok: false, failure: "unavailable" };
}

export async function classifyConfirmResponse(response: Response): Promise<ConfirmOutcome> {
  if (response.status >= 200 && response.status < 300) {
    await response.body?.cancel();
    return { ok: true };
  }

  if (response.status === 401) {
    const code = await errorCode(response);
    if (code === "INVALID_CODE") {
      return { ok: false, failure: "invalid-code" };
    }
    if (code === "ENROLLMENT_SUPERSEDED") {
      return { ok: false, failure: "enrollment-superseded" };
    }
    return { ok: false, failure: "session-ended" };
  }

  await response.body?.cancel();
  return { ok: false, failure: response.status === 429 ? "too-many-attempts" : "unavailable" };
}

/** Starts enrollment with the password; the answer holds the secrets, kept only in memory. */
export async function startEnrollment(
  fetch: BrowserFetch,
  password: string,
): Promise<EnableOutcome> {
  try {
    return await classifyEnableResponse(await postJson(fetch, ENABLE_PATH, { password }));
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}

/** Confirms enrollment with the first code; only the code is sent. */
export async function confirmEnrollment(
  fetch: BrowserFetch,
  code: string,
): Promise<ConfirmOutcome> {
  try {
    return await classifyConfirmResponse(await postJson(fetch, VERIFY_TOTP_PATH, { code }));
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}

export function enableFailureMessage(failure: EnableFailure): string {
  switch (failure) {
    case "invalid-password":
      return ENROLLMENT_COPY.invalidPassword;
    case "already-enrolled":
      return ENROLLMENT_COPY.alreadyEnrolled;
    case "session-ended":
      return ENROLLMENT_COPY.sessionEnded;
    case "too-many-attempts":
      return ENROLLMENT_COPY.tooManyAttempts;
    case "unavailable":
      return ENROLLMENT_COPY.unavailable;
  }
}

/**
 * Whether the activation cannot go on in this page, so it offers signing in again: the session is
 * gone, or the API refused a superseded first confirmation (S45). Only the message tells them apart.
 */
export function offersSignInAgain(failure: EnableFailure | ConfirmFailure): boolean {
  return failure === "session-ended" || failure === "enrollment-superseded";
}

export function confirmFailureMessage(failure: ConfirmFailure): string {
  switch (failure) {
    case "invalid-code":
      return ENROLLMENT_COPY.invalidCode;
    case "session-ended":
      return ENROLLMENT_COPY.sessionEnded;
    case "enrollment-superseded":
      return ENROLLMENT_COPY.enrollmentSuperseded;
    case "too-many-attempts":
      return ENROLLMENT_COPY.tooManyAttempts;
    case "unavailable":
      return ENROLLMENT_COPY.unavailable;
  }
}
