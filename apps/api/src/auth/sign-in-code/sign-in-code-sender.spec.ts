import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../../email/application/email-delivery.service";
import type { EmailMessage } from "../../email/application/email-sender.port";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import {
  BACKGROUND_TASK_EVENT,
  type BackgroundTaskEvent,
  BackgroundTasks,
} from "./background-tasks";
import {
  SIGN_IN_CODE_DELIVERY_TASK,
  SIGN_IN_CODE_STAGE,
  type SignInCodeRequest,
  SignInCodeSender,
  type SignInCodeStore,
} from "./sign-in-code-sender";

// SignInCodeSender against a scripted store (M2 T5b; L24 findings R3-undelivered-code-on-lookup-failure,
// R4-silent-fail-closed-without-context, and R4-unbounded-background-delivery).

const EMAIL = "guest.person@example.test";
const CODE = "482913";
const SECRET_DETAIL = `relation "User" for ${EMAIL}`;
const REQUEST: SignInCodeRequest = { email: EMAIL, code: CODE, type: "sign-in" };

type StoreScript = Partial<Record<keyof SignInCodeStore, () => Promise<unknown>>>;

/** Records every store call; each method can be scripted to resolve or reject. */
function scriptedStore(script: StoreScript = {}) {
  const calls: string[] = [];
  const call = async <T>(name: keyof SignInCodeStore, fallback: T): Promise<T> => {
    calls.push(name);
    const scripted = script[name];
    return scripted ? ((await scripted()) as T) : fallback;
  };
  const store: SignInCodeStore = {
    consumeEmailQuota: () => call("consumeEmailQuota", true),
    findAccount: () => call("findAccount", { role: "CUSTOMER", status: "ACTIVE" }),
    invalidateCode: () => call("invalidateCode", undefined),
    discardCodes: () => call("discardCodes", undefined),
  };
  return { store, calls };
}

function createSender(options: { delivery?: EmailDeliveryService; maxPending?: number } = {}) {
  const emailSender = new InMemoryEmailSender();
  const events: BackgroundTaskEvent[] = [];
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks((event) => events.push(event), options.maxPending);
  const sender = new SignInCodeSender(
    options.delivery ?? new EmailDeliveryService(emailSender, runtime),
    tasks,
  );
  return { sender, tasks, events, emailSender };
}

function failing(): Promise<never> {
  return Promise.reject(new TypeError(SECRET_DETAIL));
}

function assertNoPersonalData(events: BackgroundTaskEvent[]): void {
  const logged = JSON.stringify(events);
  assert.ok(!logged.includes(EMAIL));
  assert.ok(!logged.includes(CODE));
  assert.ok(!logged.includes("relation"));
}

describe("SignInCodeSender before delivery (L24)", () => {
  it("counts the request against the per-email cap before it looks up the role", async () => {
    const { sender, tasks, emailSender } = createSender();
    const { store, calls } = scriptedStore();

    await sender.handle(REQUEST, store);
    await tasks.drain();

    assert.deepEqual(calls, ["consumeEmailQuota", "findAccount"]);
    assert.equal(emailSender.delivered.length, 1);
  });

  it("discards the code without sending it when the per-email cap is reached", async () => {
    const { sender, tasks, events, emailSender } = createSender();
    const { store, calls } = scriptedStore({ consumeEmailQuota: async () => false });

    await sender.handle(REQUEST, store);
    await tasks.drain();

    assert.deepEqual(calls, ["consumeEmailQuota", "invalidateCode"]);
    assert.equal(emailSender.attempts.length, 0);
    assert.deepEqual(events, []);
  });

  for (const account of [
    { role: "ADMIN", status: "ACTIVE" },
    { role: "CUSTOMER", status: "DISABLED" },
    { role: "CUSTOMER", status: null },
  ]) {
    it(`sends no code and removes it for an account with ${JSON.stringify(account)}`, async () => {
      const { sender, tasks, events, emailSender } = createSender();
      const { store, calls } = scriptedStore({ findAccount: async () => account });

      await sender.handle(REQUEST, store);
      await tasks.drain();

      assert.deepEqual(calls, ["consumeEmailQuota", "findAccount", "invalidateCode"]);
      assert.equal(emailSender.attempts.length, 0);
      assert.deepEqual(events, []);
    });
  }

  it("sends the code to an unknown address, which signs up as a customer", async () => {
    const { sender, tasks, emailSender } = createSender();
    const { store } = scriptedStore({ findAccount: async () => null });

    await sender.handle(REQUEST, store);
    await tasks.drain();

    assert.equal(emailSender.delivered.length, 1);
  });

  for (const [stage, script, expectedCalls] of [
    [SIGN_IN_CODE_STAGE.QUOTA, { consumeEmailQuota: failing }, ["consumeEmailQuota"]],
    [SIGN_IN_CODE_STAGE.LOOKUP, { findAccount: failing }, ["consumeEmailQuota", "findAccount"]],
  ] as const) {
    it(`invalidates the code and logs the ${stage} stage when it fails`, async () => {
      const { sender, tasks, events, emailSender } = createSender();
      const { store, calls } = scriptedStore(script);

      await sender.handle(REQUEST, store);
      await tasks.drain();

      assert.deepEqual(calls, [...expectedCalls, "invalidateCode"]);
      assert.equal(emailSender.attempts.length, 0);
      assert.deepEqual(events, [
        {
          event: BACKGROUND_TASK_EVENT.FAILED,
          task: SIGN_IN_CODE_DELIVERY_TASK,
          stage,
          error: "TypeError",
        },
      ]);
      assertNoPersonalData(events);
    });
  }

  it("logs the invalidation stage, and the stage before it, when the code cannot be removed", async () => {
    const { sender, tasks, events } = createSender();
    const { store } = scriptedStore({ findAccount: failing, invalidateCode: failing });

    await sender.handle(REQUEST, store);
    await tasks.drain();

    assert.deepEqual(events, [
      {
        event: BACKGROUND_TASK_EVENT.FAILED,
        task: SIGN_IN_CODE_DELIVERY_TASK,
        stage: SIGN_IN_CODE_STAGE.INVALIDATION,
        failedAfter: SIGN_IN_CODE_STAGE.LOOKUP,
        error: "TypeError",
      },
    ]);
    assertNoPersonalData(events);
  });

  it("logs the delivery stage for an unexpected delivery error and still invalidates the code", async () => {
    const delivery = {
      send: async (_message: EmailMessage) => failing(),
    } as unknown as EmailDeliveryService;
    const { sender, tasks, events } = createSender({ delivery });
    const { store, calls } = scriptedStore();

    await sender.handle(REQUEST, store);
    await tasks.drain();

    assert.deepEqual(calls, ["consumeEmailQuota", "findAccount", "invalidateCode"]);
    assert.deepEqual(events, [
      {
        event: BACKGROUND_TASK_EVENT.FAILED,
        task: SIGN_IN_CODE_DELIVERY_TASK,
        stage: SIGN_IN_CODE_STAGE.DELIVERY,
        error: "TypeError",
      },
    ]);
    assertNoPersonalData(events);
  });
});

describe("SignInCodeSender at background capacity (L24)", () => {
  it("discards a code instead of queueing it beyond the pending-task maximum", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sender, tasks, events, emailSender } = createSender({ maxPending: 1 });
    const held = scriptedStore({ consumeEmailQuota: () => gate.then(() => true) });
    const overflow = scriptedStore();

    await sender.handle(REQUEST, held.store);
    await sender.handle({ ...REQUEST, code: "135790" }, overflow.store);

    assert.deepEqual(overflow.calls, ["invalidateCode"], "discarded at once, never queued");
    release();
    await tasks.drain();

    assert.equal(emailSender.delivered.length, 1);
    assert.deepEqual(events, [
      { event: BACKGROUND_TASK_EVENT.REJECTED, task: SIGN_IN_CODE_DELIVERY_TASK, pending: 1 },
    ]);
    assertNoPersonalData(events);
  });

  it("discards a code inline once the shutdown drain starts and still delivers pending codes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sender, tasks, events, emailSender } = createSender();
    const pending = scriptedStore({ consumeEmailQuota: () => gate.then(() => true) });
    const late = scriptedStore();

    await sender.handle(REQUEST, pending.store);
    const shuttingDown = tasks.shutdown();
    await sender.handle({ ...REQUEST, code: "135790" }, late.store);

    assert.deepEqual(late.calls, ["invalidateCode"], "discarded at once, never scheduled");
    release();
    await shuttingDown;

    assert.deepEqual(pending.calls, ["consumeEmailQuota", "findAccount"]);
    assert.deepEqual(
      emailSender.delivered.map((message) => message.text.includes(CODE)),
      [true],
      "only the pending code was delivered",
    );
    assert.deepEqual(events, [
      { event: BACKGROUND_TASK_EVENT.REJECTED_SHUTTING_DOWN, task: SIGN_IN_CODE_DELIVERY_TASK },
    ]);
    assertNoPersonalData(events);
  });

  it("keeps discarding other OTP types inline without consuming the per-email cap", async () => {
    const { sender, tasks } = createSender();
    const { store, calls } = scriptedStore();

    await sender.handle({ ...REQUEST, type: "forget-password" }, store);
    await tasks.drain();

    assert.deepEqual(calls, ["discardCodes"]);
  });
});
