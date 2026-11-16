/**
 * Concurrency Pool with Pause, Resume, and Cancellation support
 */

export interface ConcurrencyPoolOptions {
  concurrency?: number; // default: 3, max: 5
}

export type Task<T> = (signal: AbortSignal) => Promise<T>;

export class ConcurrencyPool {
  private concurrency: number;
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private isPaused = false;
  private isCancelled = false;
  private abortController: AbortController = new AbortController();

  constructor(options?: ConcurrencyPoolOptions) {
    this.concurrency = Math.min(Math.max(options?.concurrency ?? 3, 1), 5);
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get cancelled(): boolean {
    return this.isCancelled;
  }

  get active(): number {
    return this.activeCount;
  }

  get queued(): number {
    return this.queue.length;
  }

  /**
   * Schedules a task to be executed within the pool
   */
  run<T>(task: Task<T>): Promise<T> {
    if (this.isCancelled) {
      return Promise.reject(new Error('Pool execution has been cancelled'));
    }

    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        if (this.isCancelled) {
          reject(new Error('Task cancelled'));
          return;
        }

        this.activeCount++;
        try {
          const result = await task(this.abortController.signal);
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.pump();
        }
      };

      this.queue.push(execute);
      this.pump();
    });
  }

  private pump() {
    if (this.isPaused || this.isCancelled) {
      return;
    }

    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        nextTask();
      }
    }
  }

  /**
   * Pauses the queue (in-flight tasks finish, queued tasks wait)
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resumes a paused queue
   */
  resume() {
    if (!this.isCancelled) {
      this.isPaused = false;
      this.pump();
    }
  }

  /**
   * Cancels all remaining queued tasks and signals in-flight tasks to abort
   */
  cancel() {
    this.isCancelled = true;
    this.isPaused = false;
    this.queue = [];
    this.abortController.abort('Audit cancelled by user');
  }

  /**
   * Resets the pool for a new run
   */
  reset(concurrency?: number) {
    this.cancel();
    this.isCancelled = false;
    this.isPaused = false;
    this.abortController = new AbortController();
    if (concurrency) {
      this.concurrency = Math.min(Math.max(concurrency, 1), 5);
    }
  }
}
