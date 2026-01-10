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
  RateLimitTarget,
  RateLimitRetryCtx,
  RateLimiterOptions,
  RateLimitScheduleCtx,
  RateLimitStoreOptions,
  RateLimitRetryDecision,
  RateLimitPendingCtx
} from '#src/types'

import { debug } from '#src/debug'
import { Config } from '@athenna/config'
import { RateLimitStore } from '#src/ratelimiter/RateLimitStore'
import { Json, String, Macroable, Options } from '@athenna/common'
import { MissingKeyException } from '#src/exceptions/MissingKeyException'
import { MissingRuleException } from '#src/exceptions/MissingRuleException'
import { MissingStoreException } from '#src/exceptions/MissingStoreException'

export class RateLimiterBuilder extends Macroable {
  /**
   * Holds the options that will be used to build the rate limiter.
   */
  private options: RateLimiterOptions = {
    jitterMs: 0,
    maxConcurrent: 1,
    targetSelectionStrategy: 'first_available'
  }

  /**
   * Holds the pending closure that will run when schedule is pending
   * for some reason.
   */
  private onPendingClosure: (ctx: RateLimitPendingCtx) => void = null

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
   * Logical key that will be used by store to save buckets.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .addRule({ type: 'second', limit: 1 })
   *   .key('request:/profile')
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public key(value: string) {
    this.options.key = value

    return this
  }

  /**
   * Define the store that will be responsible to save the
   * rate limit buckets.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *   .store('memory')
   *
   * await limiter.schedule(() => {...})
   * ```
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
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *   .maxConcurrent(10)
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public maxConcurrent(value: number) {
    this.options.maxConcurrent = Math.max(1, value ?? 1)

    return this
  }

  /**
   * Random jitter in milliseconds to avoid thundering herd in
   * distributed environments.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *   .randomJitter(1000)
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public jitterMs(value: number) {
    this.options.jitterMs = Math.max(0, value ?? 0)

    return this
  }

  /**
   * Define a closure that will run everytime rate limiter
   * keep on pending state because it is respecting the rate
   * limit rules defined.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .onPending(() => {
   *     console.log('request to /profile pending')
   *   })
   *   .addRule({ type: 'second', limit: 1 })
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public onPending(closure: (ctx: RateLimitPendingCtx) => void) {
    this.onPendingClosure = closure

    return this
  }

  /**
   * Add a new rate limit rule.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public addRule(rule: RateLimitRule) {
    if (!this.options.rules) {
      this.options.rules = []
    }

    this.options.rules.push(rule)

    return this
  }

  /**
   * Add a new rate limit target.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *   .addTarget({ metadata: { baseUrl: 'http://example.com' } })
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public addTarget(target: RateLimitTarget) {
    if (!this.options.targets) {
      this.options.targets = []
    }

    if (!target.id) {
      target.id = this.getTargetId(target)
    }

    this.options.targets.push(target)

    return this
  }

  /**
   * Set multiple rate limit rules with one method call.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .setRules([{ type: 'second', limit: 1 }])
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public setRules(rules: RateLimitRule[]) {
    rules.forEach(rule => this.addRule(rule))

    return this
  }

  /**
   * Set multiple rate limit targets with one method call.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *   .setTargets([{ metadata: { baseUrl: 'http://example.com' } }])
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public setTargets(targets: RateLimitTarget[]) {
    targets.forEach(target => this.addTarget(target))

    return this
  }

  /**
   * Define the target selection strategy that will be used
   * to select the next one when an target fails.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *   .addTarget({ metadata: { baseUrl: 'http://example.com' } })
   *   .targetSelectionStrategy('round_robin')
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public targetSelectionStrategy(value: 'first_available' | 'round_robin') {
    this.options.targetSelectionStrategy = value

    return this
  }

  /**
   * Define the RateLimiter retry strategy. This is useful to control
   * when and how we should proceed with the retry of tasks that failed
   * to execute.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *   .retryStrategy(({ attempt }) => {
   *     const decision = { type: 'fail' }
   *
   *     if (attempt === 3) {
   *       return decision
   *     }
   *
   *     decision.type = 'retry_same'
   *
   *     return decision
   *   })
   *
   * await limiter.schedule(() => {...})
   * ```
   */
  public retryStrategy(
    fn: (
      ctx?: RateLimitRetryCtx
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
   * Drop all the tasks that are in the queue and clear
   * store.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *
   * await limiter.truncate()
   * ```
   */
  public async truncate() {
    this.queue = []
    this.active = 0
    this.nextWakeUpAt = 0
    this.storeErrorCount = 0

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    await this.options.store.truncate()

    return this
  }

  /**
   * Schedule the execution of an async function respecting
   * the rate limit rules and the targets.
   *
   * @example
   * ```ts
   * const limiter = RateLimiter.build()
   *   .store('memory')
   *   .key('request:/profile')
   *   .addRule({ type: 'second', limit: 1 })
   *
   * const response = await limiter.schedule(() => {
   *   return fetch('http://example.com')
   * })
   * ```
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
      if (!this.options.targets?.length) {
        throw new MissingRuleException()
      }

      const missingRuleTargets = this.options.targets.filter(
        target => !target.rules
      )

      if (missingRuleTargets.length) {
        throw new MissingRuleException()
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

      this.scheduleQueueItemRun()
    })
  }

  /**
   * Create a custom id for an target by reading the metadata object.
   * The object will always be sorted by keys.
   */
  public getTargetId(target: RateLimitTarget) {
    return String.hash(JSON.stringify(Json.sort(target.metadata)), {
      key: Config.get('app.key', 'ratelimiter')
    })
  }

  /**
   * Create a custom key for an target to be used to map the
   * target rules into the cache.
   */
  public createTargetKey(target: RateLimitTarget) {
    return `${this.options.key}:${this.getTargetId(target)}`
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
   * Read the target selection strategy and defines which is
   * going to be used.
   */
  private createIdxBySelectionStrategy(item: QueueItem<any>) {
    if (item.pinnedTargetId) {
      const i = this.options.targets.findIndex(
        a => a.id === item.pinnedTargetId
      )

      if (i >= 0) {
        return [i]
      }
    }

    let indexes = []

    switch (this.options.targetSelectionStrategy) {
      case 'round_robin':
        indexes = this.createRoundRobinIdx()
        break
      case 'first_available':
      default:
        indexes = this.createFirstAvailableIdx()
    }

    if (item.avoidTargetId) {
      const i = this.options.targets.findIndex(a => a.id === item.avoidTargetId)

      return indexes.filter(idx => idx !== i)
    }

    return indexes
  }

  /**
   * Create the indexes for when using round_robin selection strategy.
   */
  private createRoundRobinIdx() {
    return Array.from(
      { length: this.options.targets.length },
      (_, k) => (this.rrIndex + k) % this.options.targets.length
    )
  }

  /**
   * Create the indexes for when using first_available selection strategy.
   */
  private createFirstAvailableIdx() {
    return Array.from({ length: this.options.targets.length }, (_, k) => k)
  }

  /**
   * Release the rate limit task.
   */
  private releaseTask(options: { isToScheduleTick: boolean }) {
    this.active--

    if (options.isToScheduleTick) {
      if (this.timer) {
        clearTimeout(this.timer)

        this.timer = null
      }

      this.scheduleQueueItemRun()
    }
  }

  /**
   * Try process an item from the queue of tasks.
   */
  private tryToRunQueueItem = async () => {
    this.timer = null

    if (this.active >= this.options.maxConcurrent) {
      this.emitPending({ reason: 'concurrency', delay: 0 })

      return
    }

    if (this.queue.length === 0) {
      return
    }

    const now = Date.now()

    if (this.options.targets?.length) {
      let minWait = Number.POSITIVE_INFINITY
      let target: RateLimitTarget = null

      const nextItem = this.queue[0]

      for (const i of this.createIdxBySelectionStrategy(nextItem)) {
        const key = this.createTargetKey(this.options.targets[i])

        const rules = this.options.targets[i].rules?.length
          ? this.options.targets[i].rules
          : this.options.rules

        try {
          const res = await this.options.store.tryReserve(key, rules)

          this.storeErrorCount = 0

          if (res.allowed) {
            target = this.options.targets[i]

            if (this.options.targetSelectionStrategy === 'round_robin') {
              this.rrIndex = (i + 1) % this.options.targets.length
            }

            break
          }

          minWait = Math.min(minWait, res.waitMs)
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

      if (!target) {
        const delay = (isFinite(minWait) ? minWait : 100) + this.randomJitter()

        this.nextWakeUpAt = now + delay
        this.emitPending({ reason: 'rate_limit', delay })
        this.scheduleQueueItemRun({ delay })

        return
      }

      const item = this.queue.shift()

      if (item.signal?.aborted) {
        item.reject(new DOMException('Aborted', 'AbortError'))

        this.scheduleQueueItemRun()

        return
      }

      item.started = true

      if (item.signal && item.abortHandler) {
        item.signal.removeEventListener('abort', item.abortHandler)
        item.abortHandler = undefined
      }

      this.active++

      const targetKey = this.createTargetKey(target)
      const rules = target.rules?.length ? target.rules : this.options.rules

      const enrichedTarget = {
        ...target,
        getRemaining: async (ruleType: RateLimitRule['type']) => {
          return this.options.store!.getRemaining(targetKey, ruleType, rules)
        },
        getResetAt: async (ruleType: RateLimitRule['type']) => {
          return this.options.store!.getResetAt(targetKey, ruleType, rules)
        },
        updateRemaining: async (
          remaining: number,
          ruleType: RateLimitRule['type']
        ) => {
          await this.options.store!.setRemaining(
            targetKey,
            ruleType,
            remaining,
            rules
          )
        },
        updateResetAt: async (
          secondsUntilReset: number,
          ruleType: RateLimitRule['type']
        ) => {
          await this.options.store!.setResetAt(
            targetKey,
            ruleType,
            secondsUntilReset,
            rules
          )
        }
      }

      Promise.resolve()
        .then(() => item.run({ signal: item.signal, target: enrichedTarget }))
        .then(result => {
          this.releaseTask({ isToScheduleTick: true })

          item.resolve(result)
        })
        .catch(error => this.onFailInMultiMode({ error, item, target }))

      if (this.active < this.options.maxConcurrent) {
        this.scheduleQueueItemRun()
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
      this.emitPending({ reason: 'rate_limit', delay })
      this.scheduleQueueItemRun({ delay })

      return
    }

    const item = this.queue.shift()

    if (item.signal?.aborted) {
      item.reject(new DOMException('Aborted', 'AbortError'))

      this.scheduleQueueItemRun()

      return
    }

    item.started = true

    if (item.signal && item.abortHandler) {
      item.signal.removeEventListener('abort', item.abortHandler)
      item.abortHandler = undefined
    }

    this.active++

    const implicitTarget = {
      id: '__implicit__',
      metadata: {},
      getRemaining: async (ruleType: RateLimitRule['type']) => {
        return this.options.store!.getRemaining(
          this.options.key,
          ruleType,
          this.options.rules
        )
      },
      getResetAt: async (ruleType: RateLimitRule['type']) => {
        return this.options.store!.getResetAt(
          this.options.key,
          ruleType,
          this.options.rules
        )
      },
      updateRemaining: async (
        remaining: number,
        ruleType: RateLimitRule['type']
      ) => {
        await this.options.store!.setRemaining(
          this.options.key,
          ruleType,
          remaining,
          this.options.rules
        )
      },
      updateResetAt: async (
        secondsUntilReset: number,
        ruleType: RateLimitRule['type']
      ) => {
        await this.options.store!.setResetAt(
          this.options.key,
          ruleType,
          secondsUntilReset,
          this.options.rules
        )
      }
    }

    Promise.resolve()
      .then(() => item.run({ signal: item.signal, target: implicitTarget }))
      .then(result => {
        this.releaseTask({ isToScheduleTick: true })

        item.resolve(result)
      })
      .catch(error => this.onFailInSingleMode({ error, item }))

    if (this.active < this.options.maxConcurrent) {
      this.scheduleQueueItemRun()
    }
  }

  /**
   * Schedule to run another queue item.
   */
  private scheduleQueueItemRun = (options?: { delay?: number }) => {
    options = Options.create(options, {
      delay: 0
    })

    if (this.timer) {
      return
    }

    const fire = async () => {
      this.timer = null

      await this.tryToRunQueueItem()
    }

    this.timer = setTimeout(fire, options.delay)
  }

  /**
   * Closure that deals with all the errors that happens when when running
   * RateLimiter in single-mode.
   */
  private onFailInSingleMode = async (options: {
    error: Error
    item: QueueItem<any>
  }) => {
    if (!this.options.retryStrategy) {
      this.releaseTask({ isToScheduleTick: true })

      options.item.reject(options.error)

      return
    }

    const ctx: RateLimitRetryCtx = {
      error: options.error,
      key: this.options.key,
      attempt: options.item.attempt
    }

    const decision = await this.options.retryStrategy(ctx)
    const cooldown = Math.max(0, decision.currentTargetCooldownMs ?? 0)

    if (cooldown > 0) {
      await this.options
        .store!.setCooldown(this.options.key, cooldown)
        .catch(() => {
          debug('failed to set cooldown in cache for key %s', this.options.key)
        })

      this.emitPending({
        reason: 'cooldown',
        delay: cooldown,
        attempt: options.item.attempt,
        nextWakeUpAt: Date.now() + cooldown
      })
    }

    switch (decision.type) {
      case 'retry_other':
      case 'retry_same':
        this.releaseTask({ isToScheduleTick: false })

        options.item.attempt++
        options.item.started = false
        options.item.avoidTargetId = undefined
        options.item.pinnedTargetId = undefined

        if (options.item.signal?.aborted) {
          options.item.reject(new DOMException('Aborted', 'AbortError'))

          break
        }

        this.queue.unshift(options.item)

        const delay = cooldown

        this.nextWakeUpAt = Date.now() + cooldown
        this.scheduleQueueItemRun({ delay })

        return

      default:
        this.releaseTask({ isToScheduleTick: true })

        options.item.reject(options.error)
    }
  }

  /**
   * Closure that deals with all the errors that happens when when running
   * RateLimiter in multi-mode.
   */
  private onFailInMultiMode = async (options: {
    error: Error
    item: QueueItem<any>
    target: RateLimitTarget
  }) => {
    if (!this.options.retryStrategy) {
      this.releaseTask({ isToScheduleTick: true })

      options.item.reject(options.error)

      return
    }

    const key = this.createTargetKey(options.target)

    const ctx: RateLimitRetryCtx = {
      key,
      error: options.error,
      signal: options.item.signal,
      attempt: options.item.attempt,
      target: options.target,
      targets: this.options.targets
    }

    const decision = await this.options.retryStrategy(ctx)
    const cooldown = Math.max(0, decision.currentTargetCooldownMs ?? 0)

    if (cooldown > 0) {
      await this.options.store!.setCooldown(key, cooldown).catch(() => {
        debug('failed to set cooldown in cache for key %s', key)
      })

      this.emitPending({
        reason: 'cooldown',
        key,
        delay: cooldown,
        targetId: options.target.id,
        attempt: options.item.attempt,
        nextWakeUpAt: Date.now() + cooldown
      })
    }

    switch (decision.type) {
      case 'retry_same':
        this.releaseTask({ isToScheduleTick: false })

        options.item.attempt++
        options.item.started = false
        options.item.avoidTargetId = undefined
        options.item.pinnedTargetId = options.target.id

        if (options.item.signal?.aborted) {
          options.item.reject(new DOMException('Aborted', 'AbortError'))

          break
        }

        this.queue.unshift(options.item)

        const delay = cooldown

        this.nextWakeUpAt = Date.now() + delay
        this.scheduleQueueItemRun({ delay })

        return

      case 'retry_other':
        this.releaseTask({ isToScheduleTick: false })

        options.item.attempt++
        options.item.started = false
        options.item.avoidTargetId = options.target.id
        options.item.pinnedTargetId = undefined

        if (options.item.signal?.aborted) {
          options.item.reject(new DOMException('Aborted', 'AbortError'))

          break
        }

        this.queue.unshift(options.item)

        this.nextWakeUpAt = Date.now()
        this.scheduleQueueItemRun()

        return

      default:
        this.releaseTask({ isToScheduleTick: true })

        options.item.reject(options.error)
    }
  }

  /**
   * Run the pending closure defined by user.
   */
  private emitPending(input: Partial<RateLimitPendingCtx>) {
    if (!this.onPendingClosure) {
      return
    }

    const delay = Math.max(0, input.delay || 0)
    const nextWakeUpAt = this.nextWakeUpAt ?? Date.now() + delay

    const ctx: RateLimitPendingCtx = {
      reason: input.reason,
      delay,
      key: this.options.key,
      targetId: input.targetId,
      attempt: input.attempt,
      queued: this.queue.length,
      active: this.active,
      nextWakeUpAt
    }

    Promise.resolve().then(() => this.onPendingClosure(ctx))
  }
}
