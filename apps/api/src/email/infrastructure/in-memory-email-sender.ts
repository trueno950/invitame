import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
} from "../application/email-sender.port";

export interface ScriptedFailure {
  transient: boolean;
}

/**
 * Test adapter: records every attempt and every delivered message in process memory, and can be
 * scripted to fail the next attempts. Bound only when `EMAIL_TRANSPORT` is `memory` (the test default).
 */
export class InMemoryEmailSender implements EmailSender {
  readonly attempts: EmailMessage[] = [];
  readonly delivered: EmailMessage[] = [];
  private readonly scriptedFailures: ScriptedFailure[] = [];

  /** Fails the next `count` attempts, transiently or permanently, before delivering again. */
  failNext(count: number, failure: ScriptedFailure): void {
    for (let index = 0; index < count; index += 1) {
      this.scriptedFailures.push(failure);
    }
  }

  clear(): void {
    this.attempts.length = 0;
    this.delivered.length = 0;
    this.scriptedFailures.length = 0;
  }

  async send(message: EmailMessage): Promise<void> {
    this.attempts.push(message);
    const failure = this.scriptedFailures.shift();

    if (failure) {
      throw failure.transient
        ? EmailSendError.transient("provider_unavailable")
        : EmailSendError.permanent("rejected");
    }

    this.delivered.push(message);
  }
}
