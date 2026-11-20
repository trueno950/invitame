import {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASONS,
  type AccountStatus,
  type AdminActionReason,
} from "./admin-invitations-client.ts";
import {
  ApiClientError,
  type ApiClientOptions,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the administrator account support API (M9 T9; S4, S6, L8, L9). Disabling, reactivating,
 * and resending a sign-in code are admin-only and each one is audited on the API; the browser is never the guard, so
 * every call runs here, on the web server, with the session cookie and the shared secret, like
 * `admin-invitations-client.ts`, whose request primitive and outcome shape this client reuses.
 *
 * The reason set and the note bound are the API audit's own closed rule, mirrored once on the web by the invitation
 * client that first needed them (`./admin-invitations-client.ts`) and imported here, so both support cards state one
 * rule instead of two copies of it.
 *
 * Outcomes the pages handle come back as an `AccountResult` value. A body that fails its validator fails closed with an
 * `ApiClientError` (`invalid-response`) that never carries the response, and so does an unexpected status or code
 * (`rejected`); neither the cookie nor a body is logged or kept. An outage is an outcome too (`unavailable`).
 *
 * The contracts mirror `POST /admin/users/:userId/disable`, `/reactivate`, and `/sign-in-code` of the S4 design in
 * `odd/tasks/m9-admin-operations.md`; the web never imports API code, so they are kept equal by hand.
 */

/** One command of an account support action (S6): why the administrator acts, and the optional note. */
export interface AdminUserActionCommand {
  readonly reason: AdminActionReason;
  /**
   * The optional note, at most 500 characters. The API trims it, and requires one — non-blank — while the reason is
   * `OTHER`; the command module repeats that rule before a request is sent, so the page explains it first.
   */
  readonly note: string | null;
}

/** `POST /admin/users/:userId/disable`: the new status and the sessions revoked with it (S4). */
export interface AdminAccountDisabled {
  readonly status: "DISABLED";
  readonly revokedSessions: number;
}

/** `POST /admin/users/:userId/reactivate`: the new status (L9). */
export interface AdminAccountReactivated {
  readonly status: "ACTIVE";
}

/**
 * `POST /admin/users/:userId/sign-in-code`: the code was requested. It deliberately says nothing about delivery,
 * which is the API's own background task.
 */
export interface AdminSignInCodeRequested {
  readonly outcome: "requested";
}

/**
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `forbidden`: 403, the stored role is not ADMIN;
 * - `validation`: 400, the API refused the body;
 * - `not-found`: 404 `USER_NOT_FOUND`, or an id that is not a UUID, so nothing was sent;
 * - `admin-protected`: 409 `ADMIN_ACCOUNT_PROTECTED`, the account is an administrator's;
 * - `already-disabled`: 409 `ACCOUNT_ALREADY_DISABLED`;
 * - `already-active`: 409 `ACCOUNT_ALREADY_ACTIVE`;
 * - `cannot-sign-in-by-code`: 409 `USER_CANNOT_SIGN_IN_BY_CODE`, a disabled account or an administrator's;
 * - `unavailable`: the API failed (5xx) or could not be reached.
 */
export type AccountFailure =
  | "signed-out"
  | "forbidden"
  | "validation"
  | "not-found"
  | "admin-protected"
  | "already-disabled"
  | "already-active"
  | "cannot-sign-in-by-code"
  | "unavailable";

export type AccountResult<T> = { ok: true; value: T } | { ok: false; failure: AccountFailure };

const NOT_FOUND: AccountResult<never> = { ok: false, failure: "not-found" };
const SIGNED_OUT: AccountResult<never> = { ok: false, failure: "signed-out" };
const UNAVAILABLE: AccountResult<never> = { ok: false, failure: "unavailable" };

/**
 * The refusal codes the API answers, each with the outcome the page handles. An unknown code is no outcome here, so
 * the caller classifies the status itself and an unexpected 409 stays an `ApiClientError`.
 */
const CODE_FAILURES: Readonly<Record<string, AccountFailure>> = {
  USER_NOT_FOUND: "not-found",
  ADMIN_ACCOUNT_PROTECTED: "admin-protected",
  ACCOUNT_ALREADY_DISABLED: "already-disabled",
  ACCOUNT_ALREADY_ACTIVE: "already-active",
  USER_CANNOT_SIGN_IN_BY_CODE: "cannot-sign-in-by-code",
};

/** The statuses whose body the client reads: the successes and the refusals it maps. */
const REFUSAL_STATUSES: readonly number[] = [400, 401, 403, 404, 409];

/** The client reads a body for a success (to parse it) and for the statuses that can carry a refusal. */
const readsBody = (status: number): boolean =>
  (status >= 200 && status < 300) || REFUSAL_STATUSES.includes(status);

/** The one shape every id has; an id that is not a UUID names no account, so no request is sent. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the value could be the id of an account or of an invitation. */
export function isAccountId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** The disable answer, or nothing when a field is outside the contract. */
export function parseAdminAccountDisabled(value: unknown): AdminAccountDisabled | undefined {
  const body = record(value);

  return body !== undefined && body.status === "DISABLED" && isCount(body.revokedSessions)
    ? { status: "DISABLED", revokedSessions: body.revokedSessions }
    : undefined;
}

/** The reactivate answer, or nothing when a field is outside the contract. */
export function parseAdminAccountReactivated(value: unknown): AdminAccountReactivated | undefined {
  const body = record(value);

  return body !== undefined && body.status === "ACTIVE" ? { status: "ACTIVE" } : undefined;
}

/** The sign-in-code answer: the request was made, whatever delivery does. */
export function parseAdminSignInCodeRequested(
  value: unknown,
): AdminSignInCodeRequested | undefined {
  const body = record(value);

  return body !== undefined && body.outcome === "requested" ? { outcome: "requested" } : undefined;
}

/**
 * The refusal of one call: only a `code` from the fixed set is read, so a message the API wrote can never reach a page,
 * and a code this client does not know is no outcome — the caller then classifies the status itself.
 */
function failureOf(text: string | undefined): AccountResult<never> | undefined {
  try {
    const body = JSON.parse(text ?? "") as { code?: unknown } | null;
    const code = body?.code;

    return typeof code === "string" && Object.hasOwn(CODE_FAILURES, code)
      ? { ok: false, failure: CODE_FAILURES[code] as AccountFailure }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps nothing between
 * calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createAdminUsersClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  async function call<T>(
    path: string,
    parse: (value: unknown) => T | undefined,
    command: AdminUserActionCommand,
  ): Promise<AccountResult<T>> {
    const cookie = sessionCookieHeader(await readCookieHeader());

    if (cookie === undefined) {
      return SIGNED_OUT;
    }

    let status: number;
    let text: string | undefined;

    try {
      ({ status, text } = await sendApiRequest(
        options,
        {
          cookie,
          method: "POST",
          path,
          // The note is only sent when the administrator wrote one: the API's DTO treats an absent note as none.
          body:
            command.note === null || command.note === ""
              ? { reason: command.reason }
              : { reason: command.reason, note: command.note },
        },
        readsBody,
      ));
    } catch (error) {
      // The request never reached a working API: an outage the page handles as a retry, not a contract failure.
      if (error instanceof ApiClientError && error.kind === "unavailable") {
        return UNAVAILABLE;
      }
      throw error;
    }

    if (status >= 200 && status < 300) {
      let payload: unknown;
      try {
        payload = JSON.parse(text ?? "");
      } catch {
        payload = undefined;
      }

      const value = parse(payload);
      if (value === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { ok: true, value };
    }

    if (status === 401) {
      return SIGNED_OUT;
    }
    if (status === 403) {
      return { ok: false, failure: "forbidden" };
    }

    const failure = failureOf(text);
    if (failure !== undefined) {
      return failure;
    }
    if (status === 404) {
      return NOT_FOUND;
    }
    if (status === 400) {
      return { ok: false, failure: "validation" };
    }
    if (status >= 500) {
      return UNAVAILABLE;
    }

    throw new ApiClientError("rejected", status);
  }

  return {
    /**
     * `POST /admin/users/:userId/disable`: ACTIVE → DISABLED with the account's sessions revoked and the audit row
     * written in the same transaction (S4). An id that is not a UUID names no account, so no request is sent.
     */
    disable: (
      userId: string,
      command: AdminUserActionCommand,
    ): Promise<AccountResult<AdminAccountDisabled>> =>
      isAccountId(userId)
        ? call(`/admin/users/${userId}/disable`, parseAdminAccountDisabled, command)
        : Promise.resolve(NOT_FOUND),
    /**
     * `POST /admin/users/:userId/reactivate`: DISABLED → ACTIVE with its audit row (L9). An id that is not a UUID names
     * no account, so no request is sent.
     */
    reactivate: (
      userId: string,
      command: AdminUserActionCommand,
    ): Promise<AccountResult<AdminAccountReactivated>> =>
      isAccountId(userId)
        ? call(`/admin/users/${userId}/reactivate`, parseAdminAccountReactivated, command)
        : Promise.resolve(NOT_FOUND),
    /**
     * `POST /admin/users/:userId/sign-in-code`: records the request and asks Better Auth's own endpoint for a code
     * (S4). The answer is `outcome: "requested"`, never a delivery, and the API's existing limits decide what happens
     * next. An id that is not a UUID names no account, so no request is sent.
     */
    resendSignInCode: (
      userId: string,
      command: AdminUserActionCommand,
    ): Promise<AccountResult<AdminSignInCodeRequested>> =>
      isAccountId(userId)
        ? call(`/admin/users/${userId}/sign-in-code`, parseAdminSignInCodeRequested, command)
        : Promise.resolve(NOT_FOUND),
  };
}

export type AdminUsersClient = ReturnType<typeof createAdminUsersClient>;

// The audit vocabulary this client's commands post is the invitation client's, re-exported so a page or a command
// module imports one module for the account actions and never restates the closed set.
export {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASONS,
  type AccountStatus,
  type AdminActionReason,
};
