import {
  ApiClientError,
  type ApiClientOptions,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the administrator settings API (M9 T14; S5, S8, L15). `/admin/configuracion` reads the
 * operational settings and, with one form, saves all seven of them; the browser is never the guard, so every call runs
 * here, on the web server, with the session cookie and the shared secret, like `admin-analytics-client.ts`, whose
 * request primitive and outcome shape this client reuses. The API authorizes every call (`@AdminOnly()`), applies the
 * bounds and the cross-field rules, writes the audit row, and is the only guard: this client decides nothing about a
 * limit, it maps answers.
 *
 * The contract mirrors `GET /admin/settings` and `PUT /admin/settings` of the S5/S8 design in
 * `odd/tasks/m9-admin-operations.md`:
 *
 * - `GET /admin/settings` → 200 `{ settings, bounds, updatedAt }`;
 * - `PUT /admin/settings` with all seven fields plus an optional `note` (at most 200 characters) → 200 with the same
 *   shape, or 400 `INVALID_SETTINGS` with `issues: [{ field, rule }]`.
 *
 * The values are validated strictly, because the page shows them as the numbers of a form: the seven settings are
 * integers, the `bounds` map names exactly those seven fields with `min <= max`, and `updatedAt` is an ISO-8601 instant.
 * A body outside that fails closed with an `ApiClientError` (`invalid-response`) that never carries the response, and so
 * does an unexpected status (`rejected`); neither the cookie nor a body is logged or kept.
 *
 * A lowered limit only stops new additions: nothing existing is deleted, hidden, or rewritten (S8, L15). That rule is
 * the API's and the page states it; the client never enforces it.
 */

/**
 * The seven settings, in the order of the design's table: RSVP party limits, gallery and stored assets, upload size,
 * place search, and the analytics window. The order keeps a request body and a form stable.
 */
export const SETTINGS_FIELDS = [
  "rsvpDefaultPartyLimit",
  "rsvpMaxPartyLimit",
  "galleryPhotoLimit",
  "storedAssetLimit",
  "maxUploadMegabytes",
  "placeSearchResultLimit",
  "analyticsDefaultWindowDays",
] as const;

export type SettingsField = (typeof SETTINGS_FIELDS)[number];

/** The seven values the API stores, each an integer inside its own bound. */
export type OperationalSettings = Readonly<Record<SettingsField, number>>;

/** The safe range of one setting, as the API's own CHECK constraint holds it (S5). */
export interface SettingsBound {
  readonly min: number;
  readonly max: number;
}

/** One bound per setting, for exactly the seven fields. */
export type SettingsBounds = Readonly<Record<SettingsField, SettingsBound>>;

/**
 * `GET /admin/settings` and the answer of a save: the stored values, the bounds the form shows, and when the row last
 * changed. `updatedAt` is the API's own instant, never a date the page invented.
 */
export interface SettingsView {
  readonly settings: OperationalSettings;
  readonly bounds: SettingsBounds;
  readonly updatedAt: string;
}

/** One refused field of a save: the API's own `issues` entry, `{ field, rule }`. */
export interface SettingsIssue {
  readonly field: SettingsField;
  readonly rule: string;
}

/**
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `forbidden`: 403, the stored role is not ADMIN;
 * - `unavailable`: the API failed (5xx) or could not be reached.
 *
 * A read has no `validation`: it names no input, so a 400 is a contract mismatch and fails closed.
 */
export type SettingsReadFailure = "signed-out" | "forbidden" | "unavailable";

/**
 * A save can also be refused with `validation`: a 400 `INVALID_SETTINGS`, whose `issues` name the fields the API
 * refused, or a body this client refused before sending, which names none.
 */
export type SettingsSaveFailure = SettingsReadFailure | "validation";

export type SettingsReadResult =
  | { ok: true; value: SettingsView }
  | { ok: false; failure: SettingsReadFailure };

export type SettingsSaveResult =
  | { ok: true; value: SettingsView }
  | { ok: false; failure: SettingsReadFailure }
  | { ok: false; failure: "validation"; issues: readonly SettingsIssue[] };

/** The API's only settings route, for both calls. */
export const ADMIN_SETTINGS_PATH = "/admin/settings";

/** The API's own note bound: at most 200 characters, and it is part of the audit note (S5, L15). */
export const SETTINGS_NOTE_MAX_LENGTH = 200;

/** The longest rule name an issue may carry (`VARCHAR`-free, but a bound keeps a forged body out of the page). */
const MAX_RULE_LENGTH = 40;

/** An ISO-8601 instant, `Z` or a numeric offset: the only shape the API serializes `updatedAt` in. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

const SIGNED_OUT: SettingsReadResult = { ok: false, failure: "signed-out" };
const UNAVAILABLE: SettingsReadResult = { ok: false, failure: "unavailable" };
const LOCAL_VALIDATION: SettingsSaveResult = { ok: false, failure: "validation", issues: [] };

/** The statuses whose body the client reads: the successes and the one refusal that can carry `issues`. */
const REFUSAL_STATUSES: readonly number[] = [400, 401, 403];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** An integer of the settings: a safe, non-negative one, since a limit is never negative. */
function isSettingValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSettingField(value: unknown): value is SettingsField {
  return typeof value === "string" && SETTINGS_FIELDS.some((field) => field === value);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

/** The seven values, each an integer; a value outside the contract refuses the whole answer. */
function parseSettings(value: unknown): OperationalSettings | undefined {
  const settings = record(value);

  if (settings === undefined) {
    return undefined;
  }

  const parsed = {} as Record<SettingsField, number>;
  for (const field of SETTINGS_FIELDS) {
    const setting = settings[field];
    if (!isSettingValue(setting)) {
      return undefined;
    }
    parsed[field] = setting;
  }

  return parsed;
}

/**
 * The bounds, for exactly the seven fields: a missing bound, an extra one, or a `min` above its `max` refuses the
 * answer, because the form would then show a range the API does not hold.
 */
function parseBounds(value: unknown): SettingsBounds | undefined {
  const bounds = record(value);

  if (bounds === undefined || Object.keys(bounds).length !== SETTINGS_FIELDS.length) {
    return undefined;
  }

  const parsed = {} as Record<SettingsField, SettingsBound>;
  for (const field of SETTINGS_FIELDS) {
    const bound = record(bounds[field]);
    const min = bound?.min;
    const max = bound?.max;

    if (!isSettingValue(min) || !isSettingValue(max) || min > max) {
      return undefined;
    }
    parsed[field] = { min, max };
  }

  return parsed;
}

/**
 * One answer of the settings routes, refused whole when a value, a bound, or the instant is outside the contract. Only
 * the three documented members are kept, so a field the API adds later cannot reach a page through this object.
 */
export function parseSettingsView(value: unknown): SettingsView | undefined {
  const view = record(value);

  if (view === undefined) {
    return undefined;
  }

  const settings = parseSettings(view.settings);
  const bounds = parseBounds(view.bounds);

  if (settings === undefined || bounds === undefined || !isInstant(view.updatedAt)) {
    return undefined;
  }

  return { settings, bounds, updatedAt: view.updatedAt };
}

/** One issue's field must be one of the seven and its rule must be a short non-empty text. */
function parseIssue(value: unknown): SettingsIssue | undefined {
  const issue = record(value);

  return issue !== undefined &&
    isSettingField(issue.field) &&
    typeof issue.rule === "string" &&
    issue.rule.length > 0 &&
    issue.rule.length <= MAX_RULE_LENGTH
    ? { field: issue.field, rule: issue.rule }
    : undefined;
}

/**
 * The `issues` of a 400 `INVALID_SETTINGS`. A body that carries none, or one whose issues cannot all be read, is a
 * refusal the page still shows, with the generic message and no field named: never a success.
 */
function issuesOf(text: string | undefined): readonly SettingsIssue[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text ?? "");
  } catch {
    return [];
  }

  const issues = record(payload)?.issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  const parsed: SettingsIssue[] = [];
  for (const issue of issues) {
    const value = parseIssue(issue);
    if (value === undefined) {
      return [];
    }
    parsed.push(value);
  }

  return parsed;
}

/** The body of a save: all seven fields, then the note only when there is one. */
function saveBody(
  settings: OperationalSettings,
  note: string | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of SETTINGS_FIELDS) {
    body[field] = settings[field];
  }
  if (note !== undefined) {
    body.note = note;
  }

  return body;
}

/** Whether the caller handed this client a save it can send at all; the API still owns every bound. */
function isSavable(settings: unknown, note: unknown): boolean {
  if (record(settings) === undefined) {
    return false;
  }
  for (const field of SETTINGS_FIELDS) {
    const setting = (settings as Record<string, unknown>)[field];
    if (!isSettingValue(setting)) {
      return false;
    }
  }

  return (
    note === undefined || (typeof note === "string" && note.length <= SETTINGS_NOTE_MAX_LENGTH)
  );
}

/** The client reads a body for a success (to parse it) and for the statuses that can carry a refusal. */
const readsBody = (status: number): boolean =>
  (status >= 200 && status < 300) || REFUSAL_STATUSES.includes(status);

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps nothing between
 * calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createAdminSettingsClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  /**
   * One call to the settings route. The refusal statuses are mapped to outcomes; the caller decides what a `400` means
   * for its own method.
   */
  async function call(
    method: "GET" | "PUT",
    body: Record<string, unknown> | undefined,
  ): Promise<
    | { kind: "ok"; value: SettingsView }
    | { kind: "refused"; status: number; text: string | undefined }
    | { kind: "outcome"; result: SettingsReadResult }
  > {
    const cookie = sessionCookieHeader(await readCookieHeader());

    if (cookie === undefined) {
      return { kind: "outcome", result: SIGNED_OUT };
    }

    let status: number;
    let text: string | undefined;

    try {
      ({ status, text } = await sendApiRequest(
        options,
        { cookie, method, path: ADMIN_SETTINGS_PATH, ...(body === undefined ? {} : { body }) },
        readsBody,
      ));
    } catch (error) {
      // The request never reached a working API: an outage the page handles as a retry, not a contract failure.
      if (error instanceof ApiClientError && error.kind === "unavailable") {
        return { kind: "outcome", result: UNAVAILABLE };
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

      const value = parseSettingsView(payload);
      if (value === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { kind: "ok", value };
    }

    if (status === 401) {
      return { kind: "outcome", result: SIGNED_OUT };
    }
    if (status === 403) {
      return { kind: "outcome", result: { ok: false, failure: "forbidden" } };
    }
    if (status >= 500) {
      return { kind: "outcome", result: UNAVAILABLE };
    }
    if (REFUSAL_STATUSES.includes(status)) {
      return { kind: "refused", status, text };
    }

    throw new ApiClientError("rejected", status);
  }

  return {
    /**
     * `GET /admin/settings`: the seven stored values, the bounds the form shows, and the last update instant (S5). A
     * 400 names no input this method sent, so it fails closed like any other unexpected status.
     */
    async read(): Promise<SettingsReadResult> {
      const answer = await call("GET", undefined);

      if (answer.kind === "ok") {
        return { ok: true, value: answer.value };
      }
      if (answer.kind === "outcome") {
        return answer.result;
      }

      throw new ApiClientError("rejected", answer.status);
    },

    /**
     * `PUT /admin/settings`: all seven fields plus the optional note (S5). A save that changes nothing writes nothing
     * and answers 200, so the same success arrives either way. A `400` is the API's `INVALID_SETTINGS`: its `issues`
     * name the refused fields, and a body this client refused before sending names none.
     */
    async update(settings: OperationalSettings, note?: string): Promise<SettingsSaveResult> {
      if (!isSavable(settings, note)) {
        return LOCAL_VALIDATION;
      }

      const answer = await call("PUT", saveBody(settings, note));

      if (answer.kind === "ok") {
        return { ok: true, value: answer.value };
      }
      if (answer.kind === "outcome") {
        return answer.result;
      }

      return { ok: false, failure: "validation", issues: issuesOf(answer.text) };
    },
  };
}

export type AdminSettingsClient = ReturnType<typeof createAdminSettingsClient>;
