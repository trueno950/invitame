export const BACKGROUND_TASK_EVENT = {
  FAILED: "background_task_failed",
} as const;

/** Structured log event. It names the task and the error class only, never an error message. */
export interface BackgroundTaskEvent {
  event: typeof BACKGROUND_TASK_EVENT.FAILED;
  task: string;
  error: string;
}

export type BackgroundTaskLog = (event: BackgroundTaskEvent) => void;

/**
 * Runs work after the caller returns, such as delivering a sign-in code once the HTTP response is
 * on its way. A task can never crash the process: every rejection is caught and logged as a
 * structured event without personal data. `drain` awaits every pending task, including tasks
 * scheduled while draining, so tests and shutdown are deterministic.
 */
export class BackgroundTasks {
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly log: BackgroundTaskLog) {}

  get pending(): number {
    return this.running.size;
  }

  run(task: string, work: () => Promise<void>): void {
    const promise: Promise<void> = Promise.resolve()
      .then(work)
      .catch((error: unknown) => this.report(task, error))
      .finally(() => {
        this.running.delete(promise);
      });

    this.running.add(promise);
  }

  /**
   * Awaits work on the caller's path with the same guarantee: a failure is logged, never thrown.
   * For work that must cost the same on every path of a request.
   */
  async runInline(task: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.report(task, error);
    }
  }

  async drain(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.allSettled([...this.running]);
    }
  }

  private report(task: string, error: unknown): void {
    try {
      this.log({
        event: BACKGROUND_TASK_EVENT.FAILED,
        task,
        // The class name is safe to log; a message may carry an address or a provider payload.
        error: error instanceof Error ? error.name : "unknown",
      });
    } catch {
      // A failing log sink must not turn into an unhandled rejection.
    }
  }
}
