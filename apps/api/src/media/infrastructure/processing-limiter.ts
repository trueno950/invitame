// The in-process bound on image work (M8 S4, A2). One API process holds at most a couple of decoded images in
// memory at a time: a 8000 x 8000 input is 64 megapixels, so two of them decoded at once would already exceed a
// small container's memory. The limiter is a FIFO semaphore around the sharp adapter's two operations, so a second
// upload waits instead of decoding concurrently, and the queue is bounded by the requests the server already
// accepted rather than by anything this module allocates.

/**
 * How many image operations one API process runs at a time. One is deliberate: uploads are interactive but rare,
 * while the memory a decode needs is the largest the process will ever allocate.
 */
export const PROCESSING_CONCURRENCY = 1;

/**
 * A FIFO semaphore over one async operation. A task acquires a slot before it starts and releases it when it settles,
 * including when it throws, so a failed decode never leaks the only slot. Waiting tasks are served in the order they
 * asked, so no upload can starve behind a later one.
 */
export class ProcessingLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly concurrency: number = PROCESSING_CONCURRENCY) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("A processing limiter needs at least one slot.");
    }
  }

  /** Runs `task` once a slot is free, and answers exactly what the task answers, failure included. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiting.shift();

    if (next === undefined) {
      this.active -= 1;
      return;
    }

    // The slot passes straight to the next waiter, so `active` stays where it is.
    next();
  }
}
