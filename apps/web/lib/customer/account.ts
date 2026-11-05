import {
  ApiClientError,
  type OwnProfile,
  type OwnProfileUpdate,
  type SessionResult,
} from "../server/api-client.ts";
import { ACCOUNT_COPY } from "./copy.ts";

/**
 * What `/cuenta` renders and how its display-name form answers (M2 T8c; S1, L29, L39). The API is the
 * authority on sessions and validation; these functions only map its outcomes to the page.
 */

export type AccountView =
  | { kind: "customer"; profile: OwnProfile }
  /** Administrators have their own pages (T8d); this page shows them nothing role-specific. */
  | { kind: "not-customer" }
  | { kind: "signed-out" }
  | { kind: "unavailable" };

export async function loadAccountView(
  read: () => Promise<SessionResult<OwnProfile>>,
): Promise<AccountView> {
  let result: SessionResult<OwnProfile>;

  try {
    result = await read();
  } catch {
    return { kind: "unavailable" };
  }

  if (!result.signedIn) {
    return { kind: "signed-out" };
  }

  return result.value.role === "CUSTOMER"
    ? { kind: "customer", profile: result.value }
    : { kind: "not-customer" };
}

export type DisplayNameFormState =
  | { status: "idle" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

export type DisplayNameResult = DisplayNameFormState | { status: "signed-out" };

/**
 * Sends the trimmed name, or `null` to clear it when the field is empty, through `PATCH /me` (L29).
 * The API trims again and enforces 1 to 120 characters; its 400 becomes the Spanish length message.
 */
export async function saveDisplayName(
  update: (next: OwnProfileUpdate) => Promise<SessionResult<OwnProfile>>,
  field: FormDataEntryValue | null,
): Promise<DisplayNameResult> {
  if (field !== null && typeof field !== "string") {
    return { status: "error", message: ACCOUNT_COPY.nameInvalid };
  }

  const trimmed = (field ?? "").trim();
  const displayName = trimmed.length > 0 ? trimmed : null;
  let result: SessionResult<OwnProfile>;

  try {
    result = await update({ displayName });
  } catch (error) {
    const invalid = error instanceof ApiClientError && error.status === 400;
    return {
      status: "error",
      message: invalid ? ACCOUNT_COPY.nameInvalid : ACCOUNT_COPY.nameFailed,
    };
  }

  if (!result.signedIn) {
    return { status: "signed-out" };
  }

  return {
    status: "saved",
    message: result.value.displayName === null ? ACCOUNT_COPY.nameCleared : ACCOUNT_COPY.nameSaved,
  };
}
