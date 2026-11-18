import { AUTOSAVE_COPY, INVITATION_ERROR_COPY } from "./copy.ts";
import type { AutosaveChannel, AutosaveRefused, AutosaveResult } from "./invitation-autosave.ts";

/**
 * The client save queue of the invitation editor (T2a; S2, S4). One keystroke is not one request: a change waits
 * about 800 ms after the last one and is saved at once on `flush()` (a blur, or the moment before a navigation), the
 * pending changes of a channel coalesce per field with the latest value winning, and a channel never has more than
 * one save in flight, so a slow save cannot answer out of order and overwrite a newer one.
 *
 * The state is exactly what the status line renders: `idle`, `dirty`, `saving`, `saved(at)`, or `error(message)`.
 * `saved` is only ever reached from an answer that said `ok: true`, and a failed save keeps its changes pending for
 * `retry()` instead of discarding them, so nothing the creator typed is ever dropped silently.
 *
 * The queue holds no timer of its own: `timers` is injected, so a test drives it by hand and the same code runs on
 * the browser's clock. It has no React dependency, so the hook that wraps it is a thin adapter.
 */

/** How long a change waits after the last keystroke before it is saved. */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/** What the status line renders, and what the navigation guard reads. */
export type AutosaveQueueState =
  | { readonly kind: "idle" }
  | { readonly kind: "dirty" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly savedAt: string }
  | { readonly kind: "error"; readonly failure: AutosaveRefused };

/** One channel and the fields it has to save. */
export interface AutosaveSaveRequest {
  readonly channel: AutosaveChannel;
  readonly fields: Readonly<Record<string, unknown>>;
}

/** One save, as the hook binds it to its server action. It never throws: a failure is an `AutosaveResult`. */
export type AutosaveSave = (request: AutosaveSaveRequest) => Promise<AutosaveResult>;

/** The scheduler the queue waits on; the browser's own `setTimeout` by default. */
export interface AutosaveTimers {
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
}

export interface AutosaveQueueOptions {
  readonly save: AutosaveSave;
  readonly debounceMs?: number;
  readonly timers?: AutosaveTimers;
  /** Notified once per state change, and never twice for the same state. */
  readonly onChange?: (state: AutosaveQueueState) => void;
}

export interface AutosaveQueue {
  /** Records the fields the creator changed; a field with no later change keeps the value it was given here. */
  change(channel: AutosaveChannel, fields: Readonly<Record<string, unknown>>): void;
  /**
   * Saves everything pending at once, without waiting for the debounce, and resolves once nothing is scheduled or in
   * flight. A save that failed leaves its changes pending and the state in `error`, so the promise still resolves and
   * `retry()` stays the way to try again: flushing is never a silent second attempt in a loop.
   */
  flush(): Promise<void>;
  /** Tries the pending changes of every failed channel again, at once. */
  retry(): void;
  /** Whether anything is pending or in flight, which is what the browser's leave guard reads. */
  unsaved(): boolean;
  /** The current state; the same object while nothing changed, so it is safe to read on every render. */
  state(): AutosaveQueueState;
  subscribe(listener: (state: AutosaveQueueState) => void): () => void;
  /**
   * Sends what is still pending or failed and drops every listener, which is what the editor does when it unmounts:
   * a debounced or failed change is not dropped by a client-side navigation (S2). The saves are already on their way,
   * and the queue stays usable afterwards, so a second mount of the same editor keeps saving.
   */
  dispose(): void;
}

/** One channel's slot: its pending fields, whether it is saving, and the last answer it has to show. */
interface ChannelSlot {
  pending: Map<string, unknown>;
  saving: boolean;
  savingPromise: Promise<void> | undefined;
  failure: AutosaveRefused | undefined;
}

const CHANNELS: readonly AutosaveChannel[] = ["content", "features", "rsvp"];

const BROWSER_TIMERS: AutosaveTimers = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/** The label of a saved state: «Guardado hace un momento» in the first minute, then minutes, hours, and days. */
export function savedStatusLabel(savedAt: string, now: number): string {
  const at = Date.parse(savedAt);
  const elapsed = Number.isNaN(at) ? 0 : now - at;

  if (elapsed < 60_000) {
    return AUTOSAVE_COPY.savedMoment;
  }
  if (elapsed < 3_600_000) {
    return AUTOSAVE_COPY.savedMinutes(Math.floor(elapsed / 60_000));
  }
  if (elapsed < 86_400_000) {
    return AUTOSAVE_COPY.savedHours(Math.floor(elapsed / 3_600_000));
  }
  return AUTOSAVE_COPY.savedDays(Math.floor(elapsed / 86_400_000));
}

function emptySlot(): ChannelSlot {
  return { pending: new Map(), saving: false, savingPromise: undefined, failure: undefined };
}

/** Whether two states render the same line, so an unchanged one is never notified again. */
function sameState(left: AutosaveQueueState, right: AutosaveQueueState): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "saved" && right.kind === "saved") {
    return left.savedAt === right.savedAt;
  }
  if (left.kind === "error" && right.kind === "error") {
    return left.failure === right.failure;
  }
  return true;
}

/** The state of a queue nothing was typed into: the same object every time, so it is safe as a server snapshot. */
const IDLE_STATE: AutosaveQueueState = { kind: "idle" };

export function createAutosaveQueue(options: AutosaveQueueOptions): AutosaveQueue {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const timers = options.timers ?? BROWSER_TIMERS;
  const slots: Record<AutosaveChannel, ChannelSlot> = {
    content: emptySlot(),
    features: emptySlot(),
    rsvp: emptySlot(),
  };
  const listeners = new Set<(state: AutosaveQueueState) => void>();

  let savedAt: string | undefined;
  let timer: { handle: unknown } | undefined;
  let drain: Promise<void> | undefined;
  let cached: AutosaveQueueState = IDLE_STATE;

  function computeState(): AutosaveQueueState {
    if (CHANNELS.some((channel) => slots[channel].saving)) {
      return { kind: "saving" };
    }
    for (const channel of CHANNELS) {
      const failure = slots[channel].failure;

      if (failure !== undefined) {
        return { kind: "error", failure };
      }
    }
    if (CHANNELS.some((channel) => slots[channel].pending.size > 0)) {
      return { kind: "dirty" };
    }
    return savedAt === undefined ? IDLE_STATE : { kind: "saved", savedAt };
  }

  function emit(): void {
    const next = computeState();

    if (sameState(cached, next)) {
      return;
    }
    cached = next;
    options.onChange?.(next);
    for (const listener of listeners) {
      listener(next);
    }
  }

  function cancelTimer(): void {
    if (timer !== undefined) {
      timers.cancel(timer.handle);
      timer = undefined;
    }
  }

  function schedule(): void {
    cancelTimer();
    const entry: { handle: unknown } = { handle: undefined };
    timer = entry;
    entry.handle = timers.schedule(() => {
      timer = undefined;
      void sendPending();
    }, debounceMs);
  }

  /** Starts one save of one channel, unless it is already saving or has nothing to save. */
  function send(channel: AutosaveChannel): Promise<void> {
    const slot = slots[channel];

    if (slot.saving) {
      return slot.savingPromise ?? Promise.resolve();
    }
    if (slot.pending.size === 0) {
      return Promise.resolve();
    }

    const fields = Object.fromEntries(slot.pending);
    slot.pending.clear();
    slot.saving = true;

    const run = (async () => {
      let result: AutosaveResult;

      try {
        result = await options.save({ channel, fields });
      } catch {
        // A server action that could not be reached fails like an outage: the changes stay, and retry is offered.
        result = { ok: false, reason: "unavailable", message: INVITATION_ERROR_COPY.unavailable };
      }

      slot.saving = false;
      slot.savingPromise = undefined;

      if (result.ok) {
        slot.failure = undefined;
        savedAt = result.savedAt;

        if (slot.pending.size > 0) {
          // The creator kept typing while this save was on its way: those fields wait for their own debounce.
          schedule();
        }
      } else {
        // The changes that were sent stay pending, and a newer value typed meanwhile wins over them.
        for (const [name, value] of Object.entries(fields)) {
          if (!slot.pending.has(name)) {
            slot.pending.set(name, value);
          }
        }
        slot.failure = result;
      }
      emit();
    })();

    slot.savingPromise = run;
    emit();
    return run;
  }

  function sendPending(): Promise<void> {
    return Promise.all(
      CHANNELS.map((channel) =>
        slots[channel].pending.size > 0 ? send(channel) : undefined,
      ).filter((entry): entry is Promise<void> => entry !== undefined),
    ).then(() => undefined);
  }

  /** Whether a channel still has to be saved by the queue itself, rather than by a `retry()`. */
  function waiting(channel: AutosaveChannel): boolean {
    const slot = slots[channel];

    return slot.failure === undefined && slot.pending.size > 0;
  }

  function change(channel: AutosaveChannel, fields: Readonly<Record<string, unknown>>): void {
    const slot = slots[channel];

    for (const [name, value] of Object.entries(fields)) {
      slot.pending.set(name, value);
    }
    emit();

    if (slot.pending.size > 0) {
      schedule();
    }
  }

  function flush(): Promise<void> {
    cancelTimer();

    if (drain !== undefined) {
      return drain;
    }

    const run = (async () => {
      for (;;) {
        const running = CHANNELS.map((channel) => slots[channel].savingPromise).filter(
          (entry): entry is Promise<void> => entry !== undefined,
        );
        const toStart = CHANNELS.filter((channel) => waiting(channel));

        if (toStart.length === 0 && running.length === 0) {
          return;
        }
        await Promise.all([...running, ...toStart.map((channel) => send(channel))]);
      }
    })();

    drain = run.finally(() => {
      drain = undefined;
    });
    return drain;
  }

  function retry(): void {
    let cleared = false;

    for (const channel of CHANNELS) {
      if (slots[channel].failure !== undefined) {
        slots[channel].failure = undefined;
        cleared = true;
      }
    }
    if (cleared) {
      emit();
    }
    // The retried channels are sent at once, not after a debounce. `send` refuses to start a channel that is already
    // saving, so asking again here cannot duplicate a request; it only makes sure a drain that was already finishing
    // when the failure cleared does not swallow the retry.
    void flush();
    void sendPending();
  }

  function unsaved(): boolean {
    return CHANNELS.some((channel) => slots[channel].saving || slots[channel].pending.size > 0);
  }

  return {
    change,
    flush,
    retry,
    unsaved,
    state: () => cached,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      // A failed channel keeps its changes pending, so clearing the failure is what makes the unmount send them.
      for (const channel of CHANNELS) {
        slots[channel].failure = undefined;
      }
      void flush();
      listeners.clear();
    },
  };
}
