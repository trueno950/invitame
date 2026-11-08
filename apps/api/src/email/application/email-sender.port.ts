/** DI token for the configured `EmailSender` adapter; bound in `EmailModule`. */
export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

/** One message to one recipient. The sender address is adapter configuration (`EMAIL_FROM`). */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  /**
   * Stable for every attempt of the same logical message, so a provider that supports idempotency
   * delivers it at most once. 1 to 256 characters (Resend's documented limit); never log it, since a
   * caller may derive it from a verification record.
   */
  readonly idempotencyKey: string;
}

/**
 * Bounded failure categories. They never carry the provider response, the recipient, or the content,
 * so an `EmailSendError` is safe to log.
 */
export type EmailSendFailureReason =
  | "timeout"
  | "network"
  | "rate_limited"
  | "provider_unavailable"
  | "idempotent_request_in_progress"
  | "rejected"
  | "unexpected";

/** Typed adapter failure: `transient` failures may succeed when retried with the same message. */
export class EmailSendError extends Error {
  override readonly name = "EmailSendError";

  private constructor(
    readonly reason: EmailSendFailureReason,
    readonly transient: boolean,
    readonly status: number | undefined,
  ) {
    super(
      `Email provider request failed (${reason}${status === undefined ? "" : `, status ${status}`}).`,
    );
  }

  static transient(reason: EmailSendFailureReason, status?: number): EmailSendError {
    return new EmailSendError(reason, true, status);
  }

  static permanent(reason: EmailSendFailureReason, status?: number): EmailSendError {
    return new EmailSendError(reason, false, status);
  }
}

/** Application port: send one message or throw an `EmailSendError`. Adapters do not retry. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
