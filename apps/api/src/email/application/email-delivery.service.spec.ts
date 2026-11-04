import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryEmailSender } from "../infrastructure/in-memory-email-sender";
import {
  EMAIL_DELIVERY_BACKOFF_MULTIPLIER,
  EMAIL_DELIVERY_DEGRADED_THRESHOLD,
  EMAIL_DELIVERY_DEGRADED_WINDOW_MS,
  EMAIL_DELIVERY_EVENT,
  EMAIL_DELIVERY_INITIAL_BACKOFF_MS,
  EMAIL_DELIVERY_MAX_ATTEMPTS,
  type EmailDeliveryEvent,
  type EmailDeliveryRuntime,
  EmailDeliveryService,
  EmailDeliveryUnavailableError,
} from "./email-delivery.service";
import { EmailSendError, type EmailMessage, type EmailSender } from "./email-sender.port";

// Synthetic values; the assertions prove none of them reaches a log event.
const RECIPIENT = "guest.person@example.test";
const SIGN_IN_CODE = "482913";
const SUBJECT = `Tu código es ${SIGN_IN_CODE}`;

function message(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: RECIPIENT,
    subject: SUBJECT,
    text: `Código de acceso: ${SIGN_IN_CODE}`,
    html: `<p>Código de acceso: <strong>${SIGN_IN_CODE}</strong></p>`,
    idempotencyKey: "sign-in-code/verification-1",
    ...overrides,
  };
}

interface LoggedEvent {
  level: "warn" | "error";
  event: EmailDeliveryEvent;
}

class FakeRuntime implements EmailDeliveryRuntime {
  readonly sleeps: number[] = [];
  readonly events: LoggedEvent[] = [];
  currentTime = 1_000_000;

  now(): number {
    return this.currentTime;
  }

  async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.currentTime += milliseconds;
  }

  warn(event: EmailDeliveryEvent): void {
    this.events.push({ level: "warn", event });
  }

  error(event: EmailDeliveryEvent): void {
    this.events.push({ level: "error", event });
  }

  eventsNamed(name: string): LoggedEvent[] {
    return this.events.filter((entry) => entry.event.event === name);
  }
}

function setup(): {
  sender: InMemoryEmailSender;
  runtime: FakeRuntime;
  service: EmailDeliveryService;
} {
  const sender = new InMemoryEmailSender();
  const runtime = new FakeRuntime();
  return { sender, runtime, service: new EmailDeliveryService(sender, runtime) };
}

async function assertUnavailable(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof EmailDeliveryUnavailableError);
    assert.equal(error.retryable, true);
    assert.equal(error.message, "Email delivery is temporarily unavailable.");
    assert.equal(error.cause, undefined);
    return true;
  });
}

describe("EmailDeliveryService", () => {
  it("names a bounded policy: 3 attempts with exponential backoff from 250 ms", () => {
    assert.equal(EMAIL_DELIVERY_MAX_ATTEMPTS, 3);
    assert.equal(EMAIL_DELIVERY_INITIAL_BACKOFF_MS, 250);
    assert.equal(EMAIL_DELIVERY_BACKOFF_MULTIPLIER, 2);
    assert.equal(EMAIL_DELIVERY_DEGRADED_THRESHOLD, 5);
    assert.equal(EMAIL_DELIVERY_DEGRADED_WINDOW_MS, 5 * 60 * 1000);
  });

  it("delivers once and logs nothing when the first attempt succeeds", async () => {
    const { sender, runtime, service } = setup();

    await service.send(message());

    assert.equal(sender.attempts.length, 1);
    assert.deepEqual(sender.delivered, [message()]);
    assert.deepEqual(runtime.sleeps, []);
    assert.deepEqual(runtime.events, []);
  });

  it("retries transient failures with the same message and idempotency key, then delivers", async () => {
    const { sender, runtime, service } = setup();
    sender.failNext(2, { transient: true });

    await service.send(message());

    assert.equal(sender.attempts.length, 3);
    for (const attempt of sender.attempts) {
      assert.deepEqual(attempt, message());
      assert.equal(attempt.idempotencyKey, "sign-in-code/verification-1");
    }
    assert.deepEqual(sender.delivered, [message()]);
    assert.deepEqual(runtime.sleeps, [250, 500]);
    assert.deepEqual(runtime.events, []);
  });

  it("stops at the attempt limit and surfaces only the generic retryable error", async () => {
    const { sender, runtime, service } = setup();
    sender.failNext(10, { transient: true });

    await assertUnavailable(service.send(message()));

    assert.equal(sender.attempts.length, EMAIL_DELIVERY_MAX_ATTEMPTS);
    assert.equal(new Set(sender.attempts.map((attempt) => attempt.idempotencyKey)).size, 1);
    assert.deepEqual(sender.delivered, []);
    assert.deepEqual(runtime.sleeps, [250, 500]);
    assert.deepEqual(runtime.eventsNamed(EMAIL_DELIVERY_EVENT.FAILED), [
      {
        level: "warn",
        event: {
          event: EMAIL_DELIVERY_EVENT.FAILED,
          attempts: 3,
          reason: "provider_unavailable",
          transient: true,
        },
      },
    ]);
  });

  it("does not retry a permanent failure and still surfaces the generic error", async () => {
    const { sender, runtime, service } = setup();
    sender.failNext(1, { transient: false });

    await assertUnavailable(service.send(message()));

    assert.equal(sender.attempts.length, 1);
    assert.deepEqual(runtime.sleeps, []);
    assert.deepEqual(runtime.eventsNamed(EMAIL_DELIVERY_EVENT.FAILED), [
      {
        level: "warn",
        event: {
          event: EMAIL_DELIVERY_EVENT.FAILED,
          attempts: 1,
          reason: "rejected",
          transient: false,
        },
      },
    ]);
  });

  it("treats an unexpected adapter error as permanent without logging its message", async () => {
    const runtime = new FakeRuntime();
    let calls = 0;
    const sender: EmailSender = {
      async send(): Promise<void> {
        calls += 1;
        throw new Error(`boom for ${RECIPIENT}`);
      },
    };

    await assertUnavailable(new EmailDeliveryService(sender, runtime).send(message()));

    assert.equal(calls, 1);
    assert.deepEqual(runtime.events[0]?.event, {
      event: EMAIL_DELIVERY_EVENT.FAILED,
      attempts: 1,
      reason: "unexpected",
      transient: false,
    });
    assert.equal(JSON.stringify(runtime.events).includes(RECIPIENT), false);
  });

  it("never logs the recipient, subject, body, code, or idempotency key", async () => {
    const { sender, runtime, service } = setup();
    sender.failNext(EMAIL_DELIVERY_DEGRADED_THRESHOLD * EMAIL_DELIVERY_MAX_ATTEMPTS, {
      transient: true,
    });

    for (let index = 0; index < EMAIL_DELIVERY_DEGRADED_THRESHOLD; index += 1) {
      await assertUnavailable(service.send(message()));
    }

    const logged = JSON.stringify(runtime.events);
    assert.ok(runtime.events.length > 0);
    for (const secret of [RECIPIENT, "example.test", SIGN_IN_CODE, SUBJECT, "verification-1"]) {
      assert.equal(logged.includes(secret), false, `log leaked ${secret}`);
    }
  });

  it("emits one error-level degraded event when failures reach the threshold in the window", async () => {
    const { sender, runtime, service } = setup();
    sender.failNext(100, { transient: false });

    for (let index = 1; index < EMAIL_DELIVERY_DEGRADED_THRESHOLD; index += 1) {
      await assertUnavailable(service.send(message()));
    }
    assert.deepEqual(runtime.eventsNamed(EMAIL_DELIVERY_EVENT.DEGRADED), []);

    await assertUnavailable(service.send(message()));
    await assertUnavailable(service.send(message()));
    await assertUnavailable(service.send(message()));

    assert.deepEqual(runtime.eventsNamed(EMAIL_DELIVERY_EVENT.DEGRADED), [
      {
        level: "error",
        event: {
          event: EMAIL_DELIVERY_EVENT.DEGRADED,
          failures: EMAIL_DELIVERY_DEGRADED_THRESHOLD,
          windowMs: EMAIL_DELIVERY_DEGRADED_WINDOW_MS,
        },
      },
    ]);
  });

  it("does not alert when the failures are spread wider than the window", async () => {
    const { sender, runtime, service } = setup();
    sender.failNext(100, { transient: false });

    for (let index = 0; index < EMAIL_DELIVERY_DEGRADED_THRESHOLD * 2; index += 1) {
      await assertUnavailable(service.send(message()));
      // Five failures then span just over the window, so no five fall inside one window.
      runtime.currentTime +=
        EMAIL_DELIVERY_DEGRADED_WINDOW_MS / (EMAIL_DELIVERY_DEGRADED_THRESHOLD - 1) + 1;
    }

    assert.deepEqual(runtime.eventsNamed(EMAIL_DELIVERY_EVENT.DEGRADED), []);
  });

  it("re-arms the alert after the window drains, so a later outage alerts again", async () => {
    const { sender, runtime, service } = setup();
    sender.failNext(100, { transient: false });

    for (let index = 0; index < EMAIL_DELIVERY_DEGRADED_THRESHOLD; index += 1) {
      await assertUnavailable(service.send(message()));
    }
    runtime.currentTime += EMAIL_DELIVERY_DEGRADED_WINDOW_MS + 1;
    for (let index = 0; index < EMAIL_DELIVERY_DEGRADED_THRESHOLD; index += 1) {
      await assertUnavailable(service.send(message()));
    }

    assert.equal(runtime.eventsNamed(EMAIL_DELIVERY_EVENT.DEGRADED).length, 2);
  });

  it("rejects an idempotency key outside 1 to 256 characters before any attempt", async () => {
    const { sender, service } = setup();

    for (const idempotencyKey of ["", "k".repeat(257)]) {
      await assert.rejects(service.send(message({ idempotencyKey })), {
        message: "Email idempotency key must be between 1 and 256 characters.",
      });
    }
    assert.equal(sender.attempts.length, 0);
    await service.send(message({ idempotencyKey: "k".repeat(256) }));
    assert.equal(sender.delivered.length, 1);
  });

  it("exposes failures from the port as typed errors with a transient flag", () => {
    const transient = EmailSendError.transient("timeout");
    const permanent = EmailSendError.permanent("rejected", 422);

    assert.equal(transient.transient, true);
    assert.equal(transient.status, undefined);
    assert.equal(permanent.transient, false);
    assert.equal(permanent.status, 422);
    assert.equal(permanent.message, "Email provider request failed (rejected, status 422).");
  });
});
