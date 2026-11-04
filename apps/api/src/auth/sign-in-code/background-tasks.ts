export const BACKGROUND_TASK_EVENT = {
  FAILED: "background_task_failed",
  REJECTED: "background_task_rejected",
} as const;

/** Default bound on queued work; beyond it a task is refused instead of piling up in memory. */
export const MAX_PENDING_BACKGROUND_TASKS = 100;

/**
 * Structured log event. It names the task, the failed stage, and the error class only, never an
 * error message.
 */
export type BackgroundTaskEvent =
  | {
      event: typeof BACKGROUND_TASK_EVENT.FAILED;
      task: string;
      error: string;
      stage?: string;
      /** The stage whose failure led to the failed one, such as an invalidation after a lookup. */
      failedAfter?: string;
    }
  | { event: typeof BACKGROUND_TASK_EVENT.REJECTED; task: string; pending: number };

export type BackgroundTaskLog = (event: BackgroundTaskEvent) => void;

/** Tags a failure with the stage of the task where it happened; only the cause's class is logged. */
export class BackgroundTaskStageError extends Error {
  constructor(
    readonly stage: string,
    override readonly cause: unknown,
    readonly failedAfter?: string,
  ) {
    super(`Background task stage failed: ${stage}`);
    this.name = "BackgroundTaskStageError";
  }
}

function errorClass(error: unknown): string {
  // The class name is safe to log; a message may carry an address or a provider payload.
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Runs work after the caller returns, such as delivering a sign-in code once the HTTP response is
 * on its way. A task can never crash the process: every rejection is caught and logged as a
 * structured event without personal data. At most `maxPending` tasks run at once; `run` refuses
 * more and reports it. `drain` awaits every pending task, including tasks scheduled while draining,
 * so tests and shutdown are deterministic.
 */
export class BackgroundTasks {
  private readonly running = new Set<Promise<void>>();

  constructor(
    private readonly log: BackgroundTaskLog,
    private readonly maxPending: number = MAX_PENDING_BACKGROUND_TASKS,
  ) {}

  get pending(): number {
    return this.running.size;
  }

  /** Schedules the task and returns true, or returns false without running it when at capacity. */
  run(task: string, work: () => Promise<void>): boolean {
    if (this.running.size >= this.maxPending) {
      this.emit({ event: BACKGROUND_TASK_EVENT.REJECTED, task, pending: this.running.size });
      return false;
    }

    const promise: Promise<void> = Promise.resolve()
      .then(work)
      .catch((error: unknown) => this.report(task, error))
      .finally(() => {
        this.running.delete(promise);
      });

    this.running.add(promise);
    return true;
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
    if (!(error instanceof BackgroundTaskStageError)) {
      this.emit({ event: BACKGROUND_TASK_EVENT.FAILED, task, error: errorClass(error) });
      return;
    }

    this.emit({
      event: BACKGROUND_TASK_EVENT.FAILED,
      task,
      stage: error.stage,
      ...(error.failedAfter ? { failedAfter: error.failedAfter } : {}),
      error: errorClass(error.cause),
    });
  }

  private emit(event: BackgroundTaskEvent): void {
    try {
      this.log(event);
    } catch {
      // A failing log sink must not turn into an unhandled rejection.
    }
  }
}
