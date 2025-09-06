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
  RateLimitRetryCtx,
  RateLimiterOptions,
  RateLimitApiTarget,
  RateLimitScheduleCtx,
  RateLimitStoreOptions,
  RateLimitRetryDecision
} from '#src/types'

import { Macroable } from '@athenna/common'
import { RateLimitStore } from '#src/ratelimiter/RateLimitStore'
import { MissingKeyException } from '#src/exceptions/MissingKeyException'
import { MissingRuleException } from '#src/exceptions/MissingRuleException'
import { MissingStoreException } from '#src/exceptions/MissingStoreException'

export class RateLimiterBuilder extends Macroable {
  /**
   * Holds the options that will be used to build the rate limiter.
   */
  private options: RateLimiterOptions = {
    maxConcurrent: 1,
    jitterMs: 0,
    apiTargetSelectionStrategy: 'first_available'
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
   * Index for when using round_robin selection strategy.
   */
  private rrIndex = 0

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
   * Cooldown per API Target for when an error happens.
   */
  private cooldownUntil = new Map<string, number>()

  /**
   * Map the key inside the store.
   */
  private createApiTargetKey(apiTarget: RateLimitApiTarget) {
    let host = ''

    try {
      host = new URL(apiTarget.baseUrl).host
    } catch {
      host = apiTarget.baseUrl
    }

    return `${this.options.key}:${host}:${apiTarget.id}`
  }

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
  public store(
    store: 'memory' | 'redis' | string,
    options: Omit<RateLimitStoreOptions, 'store'> = {}
  ) {
    // eslint-disable-next-line
    // @ts-ignore
    options.store = store

    this.options.store = new RateLimitStore(options)

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
   * Add a new rate limit API target.
   */
  public addApiTarget(apiTarget: RateLimitApiTarget) {
    if (!this.options.apiTargets) {
      this.options.apiTargets = []
    }

    this.options.apiTargets.push(apiTarget)

    return this
  }

  /**
   * Set multiple rate limit rules with one method call.
   */
  public setRules(rules: RateLimitRule[]) {
    rules.forEach(rule => this.addRule(rule))

    return this
  }

  /**
   * Set multiple rate limit API targets with one method call.
   */
  public setApiTargets(apiTargets: RateLimitApiTarget[]) {
    apiTargets.forEach(apiTarget => this.addApiTarget(apiTarget))

    return this
  }

  /**
   * Define the API target selection strategy that will be used
   * to select the next one when an API fails.
   */
  public apiTargetSelectionStrategy(value: 'first_available' | 'round_robin') {
    this.options.apiTargetSelectionStrategy = value

    return this
  }

  public retryStrategy(
    fn: (
      ctx: RateLimitRetryCtx
    ) => RateLimitRetryDecision | Promise<RateLimitRetryDecision>
  ) {
    this.options.retryStrategy = fn

    return this
  }

  /**
   * Return the current number of active tasks.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
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
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *
   * limiter.getQueuedCount() // 0
   * ```
   */
  public getQueuedCount() {
    return this.queue.length
  }

  /**
   * Estimate when the next slot will be available based on the
   * next retry defined.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
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
    this.cooldownUntil.clear()

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
    closure: (ctx: RateLimitScheduleCtx) => T | Promise<T>,
    opts: ScheduleOptions = {}
  ): Promise<T> {
    if (!this.options.key) {
      throw new MissingKeyException()
    }

    if (!this.options.store) {
      throw new MissingStoreException()
    }

    if (!this.options.rules?.length) {
      if (!this.options.apiTargets?.length) {
        throw new MissingRuleException()
      }

      const missingRuleApiTargets = this.options.apiTargets.filter(
        apiTarget => !apiTarget.rules
      )

      if (missingRuleApiTargets.length) {
        throw new MissingRuleException(
          missingRuleApiTargets.map(t => t.baseUrl)
        )
      }
    }

    if (opts.signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        run: closure,
        resolve,
        reject,
        started: false,
        signal: opts.signal,
        attempt: 1
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

      if (this.options.apiTargets?.length) {
        let minWait = Number.POSITIVE_INFINITY
        let apiTargetChosen: RateLimitApiTarget = null

        const nextItem = this.queue[0]
        const pinnedApiTargetId = nextItem?.pinnedApiTargetId

        for (const i of this.createIdxBySelectionStrategy(pinnedApiTargetId)) {
          const apiTarget = this.options.apiTargets[i]
          const cooldown = this.cooldownUntil.get(apiTarget.id)

          if (cooldown && cooldown > now) {
            minWait = Math.min(minWait, cooldown - now)
            continue
          }

          const key = this.createApiTargetKey(apiTarget)
          const rules = apiTarget.rules?.length
            ? apiTarget.rules
            : this.options.rules

          try {
            const res = await this.options.store.tryReserve(key, rules)

            this.storeErrorCount = 0

            if (res.allowed) {
              apiTargetChosen = apiTarget

              if (this.options.apiTargetSelectionStrategy === 'round_robin') {
                this.rrIndex = (i + 1) % this.options.apiTargets.length
              }

              break
            } else {
              minWait = Math.min(minWait, res.waitMs)
            }
          } catch (error) {
            this.storeErrorCount++

            if (this.storeErrorCount > 10) {
              while (this.queue.length) {
                this.queue.shift().reject(error)
              }

              throw error
            }

            minWait = Math.min(minWait, 100)
          }
        }

        if (!apiTargetChosen) {
          const delay =
            (isFinite(minWait) ? minWait : 100) + this.randomJitter()

          this.nextWakeUpAt = now + delay
          this.timer = setTimeout(tryRun, delay)

          return
        }

        const item = this.queue.shift()

        if (item.signal?.aborted) {
          item.reject(new DOMException('Aborted', 'AbortError'))
          this.pump()
          return
        }

        item.started = true

        if (item.signal && item.abortHandler) {
          item.signal.removeEventListener('abort', item.abortHandler)
          item.abortHandler = undefined
        }

        this.active++

        Promise.resolve()
          .then(() =>
            item.run({ signal: item.signal, apiTarget: apiTargetChosen })
          )
          .then(result => {
            this.release({ isToPump: true })

            item.resolve(result)
          })
          .catch(async error => {
            if (!this.options.retryStrategy) {
              this.release({ isToPump: true })

              item.reject(error)

              return
            }

            const key = this.createApiTargetKey(apiTargetChosen)

            const ctx: RateLimitRetryCtx = {
              key,
              error,
              attempt: item.attempt,
              apiTarget: apiTargetChosen
            }

            const decision = await this.options.retryStrategy(ctx)

            switch (decision.type) {
              case 'retry_same':
                this.release({ isToPump: false })

                item.attempt++
                item.started = false
                item.pinnedApiTargetId = apiTargetChosen.id

                if (item.signal?.aborted) {
                  item.reject(new DOMException('Aborted', 'AbortError'))
                  break
                }

                this.queue.unshift(item)

                const delay = Math.max(0, decision.delayMs ?? 0)

                if (delay > 0) {
                  this.nextWakeUpAt = Date.now() + delay
                  this.timer = setTimeout(() => this.pump(), delay)
                } else {
                  this.pump()
                }

                return

              case 'retry_other': {
                if (decision.cooldownMs > 0) {
                  await this.options.store!.setCooldown(
                    key,
                    decision.cooldownMs
                  )
                }

                this.release({ isToPump: false })

                item.attempt++
                item.started = false
                item.pinnedApiTargetId = undefined

                if (item.signal?.aborted) {
                  item.reject(new DOMException('Aborted', 'AbortError'))
                  break
                }

                this.queue.unshift(item)

                const delay = Math.max(0, decision.delayMs ?? 0)

                if (delay > 0) {
                  this.nextWakeUpAt = Date.now() + delay
                  this.timer = setTimeout(() => this.pump(), delay)
                } else {
                  this.pump()
                }

                return
              }

              case 'cooldown':
                await this.options.store!.setCooldown(
                  key,
                  Math.max(0, decision.cooldownMs)
                )

                if (
                  decision.then === 'retry_same' ||
                  decision.then === 'retry_other'
                ) {
                  this.release({ isToPump: false })

                  item.attempt++
                  item.started = false
                  item.pinnedApiTargetId =
                    decision.then === 'retry_same'
                      ? apiTargetChosen.id
                      : undefined

                  if (item.signal?.aborted) {
                    item.reject(new DOMException('Aborted', 'AbortError'))

                    break
                  }

                  this.queue.unshift(item)

                  const delay = decision.cooldownMs

                  this.nextWakeUpAt = Date.now() + delay
                  this.timer = setTimeout(() => this.pump(), delay)

                  return
                }

                this.release({ isToPump: true })
                item.reject(error)
                break
              default:
                this.release({ isToPump: true })

                item.reject(error)
            }
          })

        if (this.active < this.options.maxConcurrent) {
          this.timer = setTimeout(tryRun, 0)
        }

        return
      }

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
            this.queue.shift().reject(error)
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

      const item = this.queue.shift()

      if (item.signal?.aborted) {
        item.reject(new DOMException('Aborted', 'AbortError'))

        this.pump()

        return
      }

      item.started = true

      if (item.signal && item.abortHandler) {
        item.signal.removeEventListener('abort', item.abortHandler)
        item.abortHandler = undefined
      }

      this.active++

      Promise.resolve()
        .then(() => item.run({ signal: item.signal }))
        .then(result => {
          this.release({ isToPump: true })

          item.resolve(result)
        })
        .catch(async error => {
          if (!this.options.retryStrategy) {
            this.release({ isToPump: true })

            item.reject(error)

            return
          }

          const ctx: RateLimitRetryCtx = {
            error,
            key: this.options.key,
            attempt: item.attempt
          }

          const decision = await this.options.retryStrategy(ctx)

          switch (decision.type) {
            case 'retry_same':
            case 'retry_other':
              const delay = Math.max(0, decision.delayMs ?? 0)

              this.release({ isToPump: false })

              item.attempt++
              item.started = false

              if (item.signal?.aborted) {
                item.reject(new DOMException('Aborted', 'AbortError'))
                break
              }

              this.queue.unshift(item)

              if (delay > 0) {
                this.nextWakeUpAt = Date.now() + delay
                this.timer = setTimeout(() => this.pump(), delay)
              } else {
                this.pump()
              }

              return

            case 'cooldown': {
              await this.options.store!.setCooldown(
                this.options.key,
                Math.max(0, decision.cooldownMs)
              )

              if (
                decision.then === 'retry_same' ||
                decision.then === 'retry_other'
              ) {
                const delay = decision.cooldownMs

                this.release({ isToPump: false })

                item.attempt++
                item.started = false

                if (item.signal?.aborted) {
                  item.reject(new DOMException('Aborted', 'AbortError'))

                  break
                }

                this.queue.unshift(item)
                this.nextWakeUpAt = Date.now() + delay
                this.timer = setTimeout(() => this.pump(), delay)

                return
              }

              this.release({ isToPump: true })

              item.reject(error)

              break
            }

            default:
              this.release({ isToPump: true })

              item.reject(error)
          }
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

  /**
   * Read the API Target selection strategy and defines which is
   * going to be used.
   */
  private createIdxBySelectionStrategy(pinnedApiTargetId?: string) {
    let indexes = []

    switch (this.options.apiTargetSelectionStrategy) {
      case 'round_robin':
        indexes = this.createRoundRobinIdx()
        break
      case 'first_available':
        indexes = this.createFirstAvailableIdx()
        break
      default:
        indexes = this.createFirstAvailableIdx()
    }

    if (pinnedApiTargetId) {
      const i = this.options.apiTargets.findIndex(
        a => a.id === pinnedApiTargetId
      )

      if (i >= 0) {
        indexes = [i, ...indexes.filter(x => x !== i)]
      }
    }

    return indexes
  }

  /**
   * Create the indexes for when using round_robin selection strategy.
   */
  private createRoundRobinIdx() {
    return Array.from(
      { length: this.options.apiTargets.length },
      (_, k) => (this.rrIndex + k) % this.options.apiTargets.length
    )
  }

  /**
   * Create the indexes for when using first_available selection strategy.
   */
  private createFirstAvailableIdx() {
    return Array.from({ length: this.options.apiTargets.length }, (_, k) => k)
  }

  /**
   * Release the rate limit task.
   */
  private release(options: { isToPump: boolean }) {
    this.active--

    if (options.isToPump) {
      this.pump()
    }
  }
}
