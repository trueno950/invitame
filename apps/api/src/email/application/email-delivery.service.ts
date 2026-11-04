import { Inject, Injectable } from "@nestjs/common";

import {
  EMAIL_SENDER,
  EmailSendError,
  type EmailMessage,
  type EmailSendFailureReason,
  type EmailSender,
} from "./email-sender.port";

/**
 * Retry policy (ADR 0004 decision 8): 3 attempts in total, waiting 250 ms and then 500 ms between them.
 * With the adapters' 4 s request timeout, a failing send is bounded at about 13 s, which background
 * sign-in code delivery absorbs, while two quick retries cover the brief provider errors worth retrying.
 */
export const EMAIL_DELIVERY_MAX_ATTEMPTS = 3;
export const EMAIL_DELIVERY_INITIAL_BACKOFF_MS = 250;
export const EMAIL_DELIVERY_BACKOFF_MULTIPLIER = 2;

/**
 * Alert policy: 5 failed deliveries within a sliding 5-minute window emit one `email_delivery_degraded`
 * event. A single failure is noise; five in five minutes means customers cannot sign in. The alert
 * re-arms only after a full window passes with no failure, so one ongoing outage raises one alert.
 */
export const EMAIL_DELIVERY_DEGRADED_THRESHOLD = 5;
export const EMAIL_DELIVERY_DEGRADED_WINDOW_MS = 5 * 60 * 1000;

const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export const EMAIL_DELIVERY_EVENT = {
  FAILED: "email_delivery_failed",
  DEGRADED: "email_delivery_degraded",
} as const;

/** Structured log events. By construction they hold no recipient, subject, body, code, or key. */
export type EmailDeliveryEvent =
  | {
      event: typeof EMAIL_DELIVERY_EVENT.FAILED;
      attempts: number;
      reason: EmailSendFailureReason;
      transient: boolean;
    }
  | { event: typeof EMAIL_DELIVERY_EVENT.DEGRADED; failures: number; windowMs: number };

/** Clock, timer, and log sink, injected so the policy is deterministic under test. */
export interface EmailDeliveryRuntime {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
  warn(event: EmailDeliveryEvent): void;
  error(event: EmailDeliveryEvent): void;
}

export const EMAIL_DELIVERY_RUNTIME = Symbol("EMAIL_DELIVERY_RUNTIME");

/**
 * The only error callers see when a message could not be delivered, whatever the cause, so the
 * response never reveals anything about the recipient or the provider. The sign-in code sender
 * catches it in the background and invalidates the undelivered code (ADR 0004 decision 8, as amended).
 */
export class EmailDeliveryUnavailableError extends Error {
  override readonly name = "EmailDeliveryUnavailableError";
  readonly retryable = true;

  constructor() {
    super("Email delivery is temporarily unavailable.");
  }
}

function toSendError(error: unknown): EmailSendError {
  // An unknown error is a defect, not a provider outage: do not retry it, and do not keep its message.
  return error instanceof EmailSendError ? error : EmailSendError.permanent("unexpected");
}

function assertValidMessage(message: EmailMessage): void {
  const keyLength = message.idempotencyKey.length;

  if (keyLength < 1 || keyLength > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error(
      `Email idempotency key must be between 1 and ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
    );
  }
}

/** Entry point for every email: bounded retries, privacy-safe failure logs, and the degraded alert. */
@Injectable()
export class EmailDeliveryService {
  /** Timestamps of the most recent failed deliveries, at most `EMAIL_DELIVERY_DEGRADED_THRESHOLD`. */
  private readonly recentFailures: number[] = [];
  private degradedAlertRaised = false;

  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(EMAIL_DELIVERY_RUNTIME) private readonly runtime: EmailDeliveryRuntime,
  ) {}

  /**
   * Sends one message. Every attempt passes the same frozen message, so the idempotency key and the
   * content never change between retries. Throws `EmailDeliveryUnavailableError` when it gives up.
   */
  async send(message: EmailMessage): Promise<void> {
    assertValidMessage(message);
    const frozenMessage: EmailMessage = Object.freeze({ ...message });
    let attempts = 0;
    let failure: EmailSendError;

    for (;;) {
      attempts += 1;

      try {
        await this.sender.send(frozenMessage);
        return;
      } catch (error) {
        failure = toSendError(error);
      }

      if (!failure.transient || attempts >= EMAIL_DELIVERY_MAX_ATTEMPTS) {
        break;
      }

      await this.runtime.sleep(
        EMAIL_DELIVERY_INITIAL_BACKOFF_MS * EMAIL_DELIVERY_BACKOFF_MULTIPLIER ** (attempts - 1),
      );
    }

    this.runtime.warn({
      event: EMAIL_DELIVERY_EVENT.FAILED,
      attempts,
      reason: failure.reason,
      transient: failure.transient,
    });
    this.recordFailure();
    throw new EmailDeliveryUnavailableError();
  }

  private recordFailure(): void {
    const now = this.runtime.now();
    const windowStart = now - EMAIL_DELIVERY_DEGRADED_WINDOW_MS;

    while (this.recentFailures.length > 0 && (this.recentFailures[0] ?? now) <= windowStart) {
      this.recentFailures.shift();
    }

    if (this.recentFailures.length === 0) {
      this.degradedAlertRaised = false;
    }

    this.recentFailures.push(now);

    if (this.recentFailures.length > EMAIL_DELIVERY_DEGRADED_THRESHOLD) {
      this.recentFailures.shift();
    }

    if (
      this.recentFailures.length >= EMAIL_DELIVERY_DEGRADED_THRESHOLD &&
      !this.degradedAlertRaised
    ) {
      this.degradedAlertRaised = true;
      this.runtime.error({
        event: EMAIL_DELIVERY_EVENT.DEGRADED,
        failures: EMAIL_DELIVERY_DEGRADED_THRESHOLD,
        windowMs: EMAIL_DELIVERY_DEGRADED_WINDOW_MS,
      });
    }
  }
}
