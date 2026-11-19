import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTOSAVE_DEBOUNCE_MS,
  type AutosaveQueueState,
  type AutosaveSaveRequest,
  type AutosaveTimers,
  createAutosaveQueue,
  savedStatusLabel,
} from "./autosave-queue.ts";
import { AUTOSAVE_COPY } from "./copy.ts";
import type { AutosaveResult } from "./invitation-autosave.ts";

// The client save queue (T2a; S2, S4): a field change waits about 800 ms after the last keystroke and is saved at
// once on `flush()` (blur); pending changes coalesce per field; one save is in flight per channel; the latest value
// wins; a failed save keeps the pending changes and offers `retry()`; and the state the status line renders never
// says "saved" before the action answered ok.

/** A scheduler a test drives by hand: nothing runs until it calls `run`. */
function manualTimers() {
  let scheduled: Array<{ id: number; delay: number; run: () => void }> = [];
  let nextId = 1;

  const timers: AutosaveTimers = {
    schedule: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      scheduled.push({ id, delay: delayMs, run: callback });
      return id;
    },
    cancel: (handle) => {
      scheduled = scheduled.filter((entry) => entry.id !== handle);
    },
  };

  return {
    timers,
    pending: () => scheduled.length,
    delays: () => scheduled.map((entry) => entry.delay),
    run: () => {
      const due = scheduled;
      scheduled = [];
      for (const entry of due) {
        entry.run();
      }
    },
  };
}

interface Deferred {
  readonly request: AutosaveSaveRequest;
  readonly resolve: (result: AutosaveResult) => void;
}

/** A save stub that keeps every request and resolves only when the test says so. */
function deferredSave() {
  const started: Deferred[] = [];

  return {
    started,
    save: (request: AutosaveSaveRequest) =>
      new Promise<AutosaveResult>((resolve) => {
        started.push({ request, resolve });
      }),
  };
}

/** Lets every already-resolved promise chain run, so a test observes the settled state. */
async function settle(): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await Promise.resolve();
  }
}

const SAVED_AT = "2026-11-12T09:44:00.000Z";
const OK: AutosaveResult = { ok: true, savedAt: SAVED_AT };

function queueWith(save: (request: AutosaveSaveRequest) => Promise<AutosaveResult>) {
  const clock = manualTimers();
  const states: AutosaveQueueState[] = [];
  const queue = createAutosaveQueue({
    save,
    timers: clock.timers,
    onChange: (state) => states.push(state),
  });

  return { queue, clock, states };
}

describe("the autosave queue debounces a change (S2, S4)", () => {
  it("waits about 800 ms after the last keystroke and saves the field once", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "A" });
    assert.deepEqual(clock.delays(), [AUTOSAVE_DEBOUNCE_MS]);
    assert.equal(AUTOSAVE_DEBOUNCE_MS, 800);

    queue.change("content", { celebrantName: "Ana" });
    assert.deepEqual(clock.delays(), [AUTOSAVE_DEBOUNCE_MS]);
    assert.equal(clock.pending(), 1);
    assert.equal(deferred.started.length, 0);

    clock.run();
    assert.deepEqual(
      deferred.started.map((entry) => entry.request),
      [{ channel: "content", fields: { celebrantName: "Ana" } }],
    );
  });

  it("coalesces pending changes per field, and the latest value of a field wins", () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "A", date: "2026-12-05" });
    queue.change("content", { celebrantName: "Ana" });
    queue.change("content", { message: "Ven" });
    clock.run();

    assert.deepEqual(deferred.started[0]?.request.fields, {
      celebrantName: "Ana",
      date: "2026-12-05",
      message: "Ven",
    });
  });

  it("saves at once on flush, without waiting for the debounce", async () => {
    const deferred = deferredSave();
    const { queue } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    const flushed = queue.flush();
    deferred.started[0]?.resolve(OK);
    await flushed;

    assert.equal(deferred.started.length, 1);
    assert.equal(queue.state().kind, "saved");
  });

  it("resolves flush immediately when nothing is pending or in flight", async () => {
    const deferred = deferredSave();
    const { queue } = queueWith(deferred.save);

    await queue.flush();

    assert.equal(deferred.started.length, 0);
    assert.equal(queue.state().kind, "idle");
  });

  it("waits for a change made while flushing, so nothing is left pending", async () => {
    const deferred = deferredSave();
    const { queue } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    const flushed = queue.flush();
    queue.change("content", { celebrantName: "Ana María" });

    deferred.started[0]?.resolve(OK);
    await settle();

    assert.deepEqual(deferred.started[1]?.request.fields, { celebrantName: "Ana María" });

    deferred.started[1]?.resolve(OK);
    await flushed;

    assert.equal(queue.unsaved(), false);
    assert.equal(queue.state().kind, "saved");
  });

  it("sends what is pending or failed when the editor unmounts instead of dropping it (S2)", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);
    queue.change("content", { celebrantName: "Ana" });
    queue.dispose();
    assert.equal(clock.pending(), 0);
    assert.deepEqual(deferred.started[0]?.request.fields, { celebrantName: "Ana" });

    deferred.started[0]?.resolve({ ok: false, reason: "unavailable", message: "No disponible." });
    await settle();
    queue.dispose();
    assert.equal(deferred.started.length, 2);
  });

  it("stays usable after dispose, so a second mount of the editor keeps saving", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.dispose();
    queue.change("content", { celebrantName: "Ana" });
    clock.run();

    assert.equal(deferred.started.length, 1);

    deferred.started[0]?.resolve(OK);
    await settle();

    assert.equal(queue.state().kind, "saved");
  });
});

describe("the autosave queue keeps one save in flight per channel (S2, S4)", () => {
  it("holds the newer value while a save of the same channel is in flight, then saves it", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    clock.run();
    queue.change("content", { celebrantName: "Ana María" });
    clock.run();

    assert.equal(deferred.started.length, 1);

    deferred.started[0]?.resolve(OK);
    await settle();
    clock.run();

    assert.equal(deferred.started.length, 2);
    assert.deepEqual(deferred.started[1]?.request.fields, { celebrantName: "Ana María" });
  });

  it("saves two channels at the same time, because each one has its own in-flight slot", () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    queue.change("features", { whatsappPhone: "5512345678" });
    clock.run();

    assert.deepEqual(
      deferred.started.map((entry) => entry.request.channel),
      ["content", "features"],
    );

    // A third channel does not wait for the first two: every channel has its own slot.
    queue.change("rsvp", { partyLimit: 6 });
    clock.run();
    assert.deepEqual(
      deferred.started.map((entry) => entry.request.channel),
      ["content", "features", "rsvp"],
    );

    // The channel already in flight is not asked again while it saves.
    queue.change("content", { celebrantName: "Ana María" });
    clock.run();
    assert.equal(deferred.started.length, 3);
  });
});

describe("the autosave queue's state is what the status line shows (S4)", () => {
  it("goes idle, dirty, saving, and only then saved", async () => {
    const deferred = deferredSave();
    const { queue, clock, states } = queueWith(deferred.save);

    assert.deepEqual(queue.state(), { kind: "idle" });

    queue.change("content", { celebrantName: "Ana" });
    assert.deepEqual(queue.state(), { kind: "dirty" });

    clock.run();
    assert.deepEqual(queue.state(), { kind: "saving" });

    deferred.started[0]?.resolve(OK);
    await settle();

    assert.deepEqual(queue.state(), { kind: "saved", savedAt: SAVED_AT });
    assert.deepEqual(
      states.map((state) => state.kind),
      ["dirty", "saving", "saved"],
    );
  });

  it("never says saved before the action answered ok", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    clock.run();
    await settle();

    assert.deepEqual(queue.state(), { kind: "saving" });
    assert.equal(queue.unsaved(), true);

    deferred.started[0]?.resolve(OK);
    await settle();

    assert.equal(queue.state().kind, "saved");
    assert.equal(queue.unsaved(), false);
  });

  it("notifies only when the state changes, so an unchanged line is not re-announced", () => {
    const deferred = deferredSave();
    const { queue, states } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "A" });
    queue.change("content", { celebrantName: "An" });
    queue.change("content", { celebrantName: "Ana" });

    assert.deepEqual(
      states.map((state) => state.kind),
      ["dirty"],
    );
  });
});

describe("a failed autosave keeps the changes and offers retry (S2, S4)", () => {
  const FAILED: AutosaveResult = {
    ok: false,
    reason: "unavailable",
    message: AUTOSAVE_COPY.invalidPayload,
  };

  it("reports the failure with its message, keeps the pending changes and stays unsaved", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    clock.run();
    deferred.started[0]?.resolve(FAILED);
    await settle();

    assert.deepEqual(queue.state(), { kind: "error", failure: FAILED });
    assert.equal(queue.unsaved(), true);
  });

  it("retries the same changes, and saves them once the action answers ok", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    clock.run();
    deferred.started[0]?.resolve(FAILED);
    await settle();

    queue.retry();
    assert.equal(deferred.started.length, 2);
    assert.deepEqual(deferred.started[1]?.request.fields, { celebrantName: "Ana" });

    deferred.started[1]?.resolve(OK);
    await settle();

    assert.deepEqual(queue.state(), { kind: "saved", savedAt: SAVED_AT });
  });

  it("keeps the newer value the creator typed while the failed save was in flight", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    clock.run();
    queue.change("content", { celebrantName: "Ana María" });
    deferred.started[0]?.resolve(FAILED);
    await settle();

    queue.retry();

    assert.deepEqual(deferred.started[1]?.request.fields, { celebrantName: "Ana María" });
  });

  it("does not keep retrying a failing save on its own, so the retry stays the creator's", async () => {
    const deferred = deferredSave();
    const { queue, clock } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    clock.run();
    deferred.started[0]?.resolve(FAILED);
    await settle();

    clock.run();

    assert.equal(deferred.started.length, 1);
    assert.equal(queue.state().kind, "error");
  });

  it("resolves flush in the failed state instead of saving again by itself", async () => {
    const deferred = deferredSave();
    const { queue } = queueWith(deferred.save);

    queue.change("content", { celebrantName: "Ana" });
    const flushed = queue.flush();
    deferred.started[0]?.resolve(FAILED);
    await flushed;

    assert.equal(deferred.started.length, 1);
    assert.equal(queue.state().kind, "error");
  });
});

describe("the saved label of the status line (S4)", () => {
  const NOW = Date.parse(SAVED_AT);

  it("says «Guardado hace un momento» for the first seconds after a save", () => {
    assert.equal(savedStatusLabel(SAVED_AT, NOW), "Guardado hace un momento");
    assert.equal(savedStatusLabel(SAVED_AT, NOW + 4_999), "Guardado hace un momento");
  });

  it("settles on «Todo guardado» after that, with no time that ages", () => {
    assert.equal(savedStatusLabel(SAVED_AT, NOW + 5_000), "Todo guardado");
    assert.equal(savedStatusLabel(SAVED_AT, NOW + 3 * 60_000), "Todo guardado");
    assert.equal(savedStatusLabel(SAVED_AT, NOW + 48 * 60 * 60_000), "Todo guardado");
  });

  it("falls back to «un momento» for a value it cannot read or a clock that went back", () => {
    assert.equal(savedStatusLabel("not-a-date", NOW), AUTOSAVE_COPY.savedMoment);
    assert.equal(savedStatusLabel(SAVED_AT, NOW - 10_000), AUTOSAVE_COPY.savedMoment);
  });
});
