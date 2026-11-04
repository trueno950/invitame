import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BACKGROUND_TASK_EVENT,
  type BackgroundTaskEvent,
  BackgroundTasks,
} from "./background-tasks";

describe("BackgroundTasks", () => {
  it("runs a task off the caller's path and lets a test await it deterministically", async () => {
    const tasks = new BackgroundTasks(() => {});
    let finished = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    tasks.run("held", async () => {
      await gate;
      finished = true;
    });

    assert.equal(finished, false);
    assert.equal(tasks.pending, 1);

    const drained = tasks.drain();
    release();
    await drained;

    assert.equal(finished, true);
    assert.equal(tasks.pending, 0);
  });

  it("also awaits tasks scheduled by a task that is being drained", async () => {
    const tasks = new BackgroundTasks(() => {});
    const order: string[] = [];

    tasks.run("outer", async () => {
      order.push("outer");
      tasks.run("inner", async () => {
        order.push("inner");
      });
    });

    await tasks.drain();
    assert.deepEqual(order, ["outer", "inner"]);
  });

  it("catches every failure and logs only the task name and the error class", async () => {
    const events: BackgroundTaskEvent[] = [];
    const tasks = new BackgroundTasks((event) => events.push(event));
    const secret = "guest.person@example.test 482913";

    tasks.run("rejects", async () => {
      throw new TypeError(secret);
    });
    tasks.run("throws-non-error", async () => {
      throw secret;
    });

    await tasks.drain();

    assert.deepEqual(events, [
      { event: BACKGROUND_TASK_EVENT.FAILED, task: "rejects", error: "TypeError" },
      { event: BACKGROUND_TASK_EVENT.FAILED, task: "throws-non-error", error: "unknown" },
    ]);
    assert.ok(!JSON.stringify(events).includes("482913"));
  });

  it("survives a log sink that throws", async () => {
    const tasks = new BackgroundTasks(() => {
      throw new Error("log sink down");
    });

    tasks.run("rejects", async () => {
      throw new Error("boom");
    });

    await tasks.drain();
    assert.equal(tasks.pending, 0);
  });
});
