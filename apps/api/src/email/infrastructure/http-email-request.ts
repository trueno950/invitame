import { EmailSendError } from "../application/email-sender.port";

/** Per-request timeout for provider HTTP calls; the delivery policy bounds the number of attempts. */
export const EMAIL_PROVIDER_REQUEST_TIMEOUT_MS = 4_000;

/** Identifies the API to providers; Resend rejects requests without a `User-Agent` header. */
export const EMAIL_PROVIDER_USER_AGENT = "invitame-api/0.1.0";

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Posts JSON with a hard timeout. Network errors and timeouts become transient `EmailSendError`s; the
 * original error is dropped because its message may include the request URL or headers.
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": EMAIL_PROVIDER_USER_AGENT,
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw EmailSendError.transient(isTimeout(error) ? "timeout" : "network");
  }
}

/** Reads a small JSON error body, or `undefined`; a body that cannot be read is not an error here. */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Releases the connection without reading a body the adapter does not need. */
export async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already settled; nothing to release.
  }
}

/** Shared status policy: 429 and 5xx are transient; any other non-2xx status is permanent. */
export function failureForStatus(status: number): EmailSendError {
  if (status === HTTP_TOO_MANY_REQUESTS) {
    return EmailSendError.transient("rate_limited", status);
  }

  if (status >= HTTP_SERVER_ERROR) {
    return EmailSendError.transient("provider_unavailable", status);
  }

  return EmailSendError.permanent("rejected", status);
}
