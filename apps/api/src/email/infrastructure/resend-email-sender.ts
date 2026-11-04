import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
} from "../application/email-sender.port";
import {
  discardBody,
  EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
  failureForStatus,
  postJson,
  readJsonBody,
} from "./http-email-request";

const RESEND_BASE_URL = "https://api.resend.com";
const HTTP_CONFLICT = 409;
/** Resend's 409 while a request with the same key is still being processed; "try again later". */
const RESEND_CONCURRENT_IDEMPOTENT_REQUEST = "concurrent_idempotent_requests";

export interface ResendEmailSenderOptions {
  /** Resend API key; sent only in the `Authorization` header and never logged or echoed. */
  apiKey: string;
  from: string;
  /** Overridable only so tests can target a local imitation of the API. */
  baseUrl?: string;
  timeoutMs?: number;
}

function errorName(body: unknown): unknown {
  return typeof body === "object" && body !== null ? (body as { name?: unknown }).name : undefined;
}

/**
 * Production adapter for Resend's Send Email API (`POST /emails`, Bearer auth, `Idempotency-Key`
 * header). Sources: https://resend.com/docs/api-reference/emails/send-email,
 * https://resend.com/docs/dashboard/emails/idempotency-keys, and
 * https://resend.com/docs/api-reference/errors (checked 2026-11-04).
 */
export class ResendEmailSender implements EmailSender {
  readonly endpoint: string;
  readonly #apiKey: string;
  readonly #from: string;
  readonly #timeoutMs: number;

  constructor(options: ResendEmailSenderOptions) {
    this.endpoint = `${options.baseUrl ?? RESEND_BASE_URL}/emails`;
    this.#apiKey = options.apiKey;
    this.#from = options.from;
    this.#timeoutMs = options.timeoutMs ?? EMAIL_PROVIDER_REQUEST_TIMEOUT_MS;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await postJson(
      this.endpoint,
      {
        Authorization: `Bearer ${this.#apiKey}`,
        "Idempotency-Key": message.idempotencyKey,
      },
      {
        from: this.#from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
      },
      this.#timeoutMs,
    );

    if (response.ok) {
      await discardBody(response);
      return;
    }

    if (response.status === HTTP_CONFLICT) {
      // A retry after a timeout can meet the first request still in flight: retry it later with the
      // same key. Any other conflict (a reused key with a different body) is permanent.
      const isInProgress =
        errorName(await readJsonBody(response)) === RESEND_CONCURRENT_IDEMPOTENT_REQUEST;
      throw isInProgress
        ? EmailSendError.transient("idempotent_request_in_progress", response.status)
        : EmailSendError.permanent("rejected", response.status);
    }

    await discardBody(response);
    throw failureForStatus(response.status);
  }
}
