/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type {
  QueueItem,
  RateLimitRule,
  ScheduleOptions,
  RateLimiterOptions
} from '#src/types'

import { MissingKeyException } from '#src/exceptions/MissingKeyException'
import { MissingRuleException } from '#src/exceptions/MissingRuleException'
import type { RateLimitStore } from '#src/ratelimiter/stores/RateLimitStore'
import { MissingStoreException } from '#src/exceptions/MissingStoreException'

export class RateLimiterBuilder {
  /**
   * Holds the options that will be used to build the rate limiter.
   */
  private options: RateLimiterOptions = {
    maxConcurrent: 1,
    jitterMs: 0
  }

  /**
   * Holds the number of times the store has failed. Important
   * to avoid infinite loop when the store is not available or
   * is not working for some reason.
   */
  private storeErrorCount = 0

  /**
   * Holds the current number of active tasks.
   */
  private active = 0

  /**
   * Holds the queue instance that will be used to
   * process the requests.
   */
  private queue: QueueItem<any>[] = []

  /**
   * Holds the setTimeout id to be able to disable it
   * later on.
   */
  private timer: NodeJS.Timeout | null = null

  /**
   * Define when the next retry will happen in milliseconds.
   */
  private nextWakeUpAt: number = 0

  /**
   * Logical key that will be used by store to save buckets.
   */
  public key(value: string) {
    this.options.key = value

    return this
  }

  /**
   * Define the store that will be responsible to save the
   * rate limit buckets.
   */
  public store(value: RateLimitStore) {
    this.options.store = value

    return this
  }

  /**
   * Set the max number of tasks that could run concurrently.
   */
  public maxConcurrent(value: number) {
    this.options.maxConcurrent = Math.max(1, value ?? 1)

    return this
  }

  /**
   * Random jitter in milliseconds to avoid thundering herd in
   * distributed environments.
   */
  public jitterMs(value: number) {
    this.options.jitterMs = Math.max(0, value ?? 0)

    return this
  }

  /**
   * Add a new rate limit rule.
   */
  public addRule(rule: RateLimitRule) {
    if (!this.options.rules) {
      this.options.rules = []
    }

    this.options.rules.push(rule)

    return this
  }

  /**
   * Return the current number of active tasks.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store(new MemoryStore())
   *   .key('request:api-key:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *
   * limiter.getActiveCount() // 0
   * ```
   */
  public getActiveCount() {
    return this.active
  }

  /**
   * Return the current number of tasks enqueued to be
   * processed.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store(new MemoryStore())
   *   .key('request:api-key:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *
   * limiter.getQueuedCount() // 0
   * ```
   */
  public getQueuedCount() {
    return this.queue.length
  }

  /**
   * Stimate when the next slot will be available based on the
   * next retry defined.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store(new MemoryStore())
   *   .key('request:api-key:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *
   * limiter.getAvailableInMs() // 0
   * ```
   */
  public getAvailableInMs() {
    const now = Date.now()

    return Math.max(0, this.nextWakeUpAt > now ? this.nextWakeUpAt - now : 0)
  }

  /**
   * Drop all the tasks that are in the queue.
   */
  public truncate() {
    this.queue = []
    this.active = 0
    this.nextWakeUpAt = 0
    this.storeErrorCount = 0

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    return this
  }

  /**
   * Schedule the execution of an async function respecting
   * the rate limit rules.
   */
  public schedule<T = any>(
    fn: (signal?: AbortSignal) => T | Promise<T>,
    opts: ScheduleOptions = {}
  ): Promise<T> {
    if (!this.options.key) {
      throw new MissingKeyException()
    }

    if (!this.options.store) {
      throw new MissingStoreException()
    }

    if (!this.options.rules?.length) {
      throw new MissingRuleException()
    }

    if (opts.signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        run: fn,
        resolve,
        reject,
        started: false,
        opts
      }

      this.queue.push(item)

      if (opts.signal) {
        const onAbort = () => {
          /**
           * If the task has already started, we can't abort it. The
           * only way to abort in this case is if the handler defined
           * by the user abort the task.
           */
          if (item.started) {
            return
          }

          const index = this.queue.indexOf(item)

          if (index >= 0) {
            this.queue.splice(index, 1)
          }

          reject(new DOMException('Aborted', 'AbortError'))
        }

        opts.signal.addEventListener('abort', onAbort, { once: true })
        item.abortHandler = onAbort
      }

      this.pump()
    })
  }

  /**
   * Process the queue of tasks.
   */
  private pump() {
    if (this.timer) {
      return
    }

    const tryRun = async () => {
      this.timer = null

      if (this.active >= this.options.maxConcurrent) {
        return
      }

      if (this.queue.length === 0) {
        return
      }

      const now = Date.now()

      let waitMs = 0
      let allowed = false

      try {
        const res = await this.options.store.tryReserve(
          this.options.key,
          this.options.rules
        )

        this.storeErrorCount = 0
        allowed = res.allowed
        waitMs = res.waitMs
      } catch (error) {
        this.storeErrorCount++

        /**
         * If the store failed 10 times it means it is not working for some
         * reason, in this case we can reject all the requests that are in
         * the queue.
         */
        if (this.storeErrorCount > 10) {
          while (this.queue.length) {
            const item = this.queue.shift()!

            item.reject(error)
          }

          throw error
        }

        allowed = false
        waitMs = 100
      }

      if (!allowed) {
        const delay = waitMs + this.randomJitter()

        this.nextWakeUpAt = now + delay
        this.timer = setTimeout(tryRun, delay)

        return
      }

      const item = this.queue.shift()!

      if (item.opts.signal?.aborted) {
        item.reject(new DOMException('Aborted', 'AbortError'))

        this.pump()

        return
      }

      item.started = true

      if (item.opts.signal && item.abortHandler) {
        item.opts.signal.removeEventListener('abort', item.abortHandler)
        item.abortHandler = undefined
      }

      this.active++

      Promise.resolve()
        .then(() => item.run(item.opts.signal))
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active--
          this.pump()
        })

      if (this.active < this.options.maxConcurrent) {
        this.timer = setTimeout(tryRun, 0)
      }
    }

    this.timer = setTimeout(tryRun, 0)
  }

  /**
   * Get a random jitter or return 0 if user has not
   * defined one.
   */
  private randomJitter(): number {
    if (!this.options.jitterMs) {
      return 0
    }

    return Math.floor(Math.random() * this.options.jitterMs)
  }
}
