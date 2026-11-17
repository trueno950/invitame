import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PROCESSING_CONCURRENCY, ProcessingLimiter } from "./processing-limiter";

// The in-process image bound (M8 S4, A2). The tasks are fakes with an explicit gate, so the test observes how many of
// them are inside the limiter at once and in which order they start: two 64-megapixel decodes must never overlap.

/** One task a test can hold open, so the limiter's queue is observable. */
function gated() {
  let open = (): void => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let started = (): void => {};
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });

  return {
    task: async (): Promise<void> => {
      started();
      await gate;
    },
    started: start,
    open: (): void => open(),
  };
}

describe("processing limiter (A2)", () => {
  it("runs one image operation at a time and serves the queue in order", async () => {
    const limiter = new ProcessingLimiter(1);
    const order: string[] = [];
    let running = 0;
    let peak = 0;

    const limit = (label: string) => async (): Promise<string> => {
      order.push(`start:${label}`);
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      order.push(`end:${label}`);
      return label;
    };

    const results = await Promise.all([
      limiter.run(limit("first")),
      limiter.run(limit("second")),
      limiter.run(limit("third")),
    ]);

    assert.deepEqual(results, ["first", "second", "third"]);
    assert.equal(peak, 1, "two decodes never run at once");
    assert.deepEqual(order, [
      "start:first",
      "end:first",
      "start:second",
      "end:second",
      "start:third",
      "end:third",
    ]);
  });

  it("holds a second task until the first releases its slot", async () => {
    const limiter = new ProcessingLimiter(1);
    const first = gated();
    const second = gated();

    const firstRun = limiter.run(first.task);
    const secondRun = limiter.run(second.task);

    await first.started;
    let secondStarted = false;
    void secondRun.then(() => {
      secondStarted = true;
    });
    await Promise.resolve();
    assert.equal(secondStarted, false, "the second task waits for the only slot");

    first.open();
    await firstRun;
    await second.started;
    second.open();
    await secondRun;
  });

  it("releases the slot of a task that throws, so the next one still runs", async () => {
    const limiter = new ProcessingLimiter(1);
    const after = gated();
    const failure = new Error("decode failed");

    const failing = limiter.run(async () => {
      throw failure;
    });
    const next = limiter.run(after.task);

    await assert.rejects(failing, /decode failed/);
    await after.started;
    after.open();
    await next;
  });

  it("runs more than one task at a time only when the limiter is built with more slots", async () => {
    const limiter = new ProcessingLimiter(2);
    const first = gated();
    const second = gated();

    const runs = [limiter.run(first.task), limiter.run(second.task)];

    await first.started;
    await second.started;
    first.open();
    second.open();
    await Promise.all(runs);
  });

  it("refuses a concurrency that would allow nothing to run", () => {
    for (const concurrency of [0, -1, 1.5]) {
      assert.throws(() => new ProcessingLimiter(concurrency), RangeError, String(concurrency));
    }
    assert.equal(PROCESSING_CONCURRENCY, 1);
  });
});
