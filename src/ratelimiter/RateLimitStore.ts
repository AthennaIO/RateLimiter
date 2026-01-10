/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { debug } from '#src/debug'
import { Cache } from '@athenna/cache'
import { Macroable } from '@athenna/common'
import { WINDOW_MS } from '#src/constants/window'
import type { Reserve, RateLimitRule, RateLimitStoreOptions } from '#src/types'

export class RateLimitStore extends Macroable {
  /**
   * Holds the options that will be used to build the rate limiter
   * store.
   */
  public options: RateLimitStoreOptions

  public constructor(options: RateLimitStoreOptions) {
    super()

    options.windowMs = options.windowMs ?? WINDOW_MS

    this.options = options
  }

  public async truncate() {
    await Cache.store(this.options.store).truncate()
  }

  /**
   * Get the rate limit buckets from the cache or initialize them.
   */
  public async getOrInit(key: string, rules: RateLimitRule[]) {
    const cache = Cache.store(this.options.store)

    let buckets = await cache.get(key)

    if (!buckets) {
      buckets = JSON.stringify(rules.map(() => []))

      await cache.set(key, buckets)
    }

    return JSON.parse(buckets) as number[][]
  }

  /**
   * Get the defined cooldown if it exists in the cache.
   * If it cannot be found, return 0.
   */
  public async getCooldown(key: string) {
    const cdKey = `${key}:cooldown`

    debug('getting cooldown in %s store for key %s', this.options.store, cdKey)

    const cooldown = await Cache.store(this.options.store).get(cdKey)

    if (!cooldown) {
      return 0
    }

    return Number(cooldown)
  }

  /**
   * Put the key in cooldown for some milliseconds. Also saves
   * the timestamp into the cache for when it will be available
   * again.
   */
  public async setCooldown(key: string, ms: number) {
    if (!ms || ms <= 0) {
      return
    }

    const cdKey = `${key}:cooldown`
    const cdMs = `${Date.now() + ms}`

    debug(
      'setting cooldown of %s ms in %s store for key %s',
      cdMs,
      this.options.store,
      cdKey
    )

    await Cache.store(this.options.store).set(cdKey, cdMs, { ttl: ms })
  }

  /**
   * Try to reserve a token for all rules of the key. If not
   * allowed to reserve, return the maximum waitMs necessary.
   */
  public async tryReserve(key: string, rules: RateLimitRule[]) {
    debug(
      'running %s store tryReserve for key %s with rules %o',
      this.options.store,
      key,
      rules
    )

    let wait = 0
    const now = Date.now()
    const cache = Cache.store(this.options.store)
    const cooldown = await this.getCooldown(key)

    if (Number.isFinite(cooldown) && cooldown > now) {
      return { allowed: false, waitMs: cooldown - now }
    }

    await cache.delete(`${key}:cooldown`)

    const buckets = await this.getOrInit(key, rules)

    for (let i = 0; i < rules.length; i++) {
      const bucket = buckets[i]
      const window = this.options.windowMs[rules[i].type]

      while (bucket.length && bucket[0] <= now - window) {
        bucket.shift()
      }

      if (bucket.length >= rules[i].limit) {
        const earliest = bucket[0]
        const rem = earliest + window - now

        if (rem > wait) {
          wait = rem
        }
      }
    }

    const reserve: Reserve = { allowed: false, waitMs: wait }

    if (wait > 0) {
      await cache.set(key, JSON.stringify(buckets))

      return reserve
    }

    for (let i = 0; i < rules.length; i++) {
      buckets[i].push(now)
    }

    await cache.set(key, JSON.stringify(buckets))

    reserve.waitMs = 0
    reserve.allowed = true

    return reserve
  }

  /**
   * Manually update the remaining request count for a specific rule type.
   * This allows syncing the internal rate limiter state with external API
   * rate limit headers.
   */
  public async setRemaining(
    key: string,
    ruleType: RateLimitRule['type'],
    remaining: number,
    rules: RateLimitRule[]
  ) {
    debug(
      'setting remaining to %d for rule type %s in %s store for key %s',
      remaining,
      ruleType,
      this.options.store,
      key
    )

    const now = Date.now()
    const cache = Cache.store(this.options.store)
    const buckets = await this.getOrInit(key, rules)
    const ruleIndex = rules.findIndex(rule => rule.type === ruleType)

    if (ruleIndex === -1) {
      debug('rule type %s not found for key %s', ruleType, key)
      return
    }

    const rule = rules[ruleIndex]
    const bucket = buckets[ruleIndex]
    const used = Math.max(0, rule.limit - remaining)

    bucket.length = 0

    for (let i = 0; i < used; i++) {
      bucket.push(now)
    }

    await cache.set(key, JSON.stringify(buckets))

    debug(
      'updated bucket for rule type %s: %d used, %d remaining',
      ruleType,
      used,
      remaining
    )
  }

  /**
   * Get the current number of remaining requests for a specific rule type.
   * This exposes the internal rate limiter state for comparison with API headers.
   */
  public async getRemaining(
    key: string,
    ruleType: RateLimitRule['type'],
    rules: RateLimitRule[]
  ) {
    debug(
      'getting remaining for rule type %s in %s store for key %s',
      ruleType,
      this.options.store,
      key
    )

    const now = Date.now()
    const buckets = await this.getOrInit(key, rules)
    const ruleIndex = rules.findIndex(rule => rule.type === ruleType)

    if (ruleIndex === -1) {
      debug('rule type %s not found for key %s', ruleType, key)
      return 0
    }

    const rule = rules[ruleIndex]
    const bucket = buckets[ruleIndex]
    const window = this.options.windowMs[rule.type]

    while (bucket.length && bucket[0] <= now - window) {
      bucket.shift()
    }

    const remaining = Math.max(0, rule.limit - bucket.length)

    debug('remaining for rule type %s: %d', ruleType, remaining)

    return remaining
  }

  /**
   * Get the timestamp when the rate limit will reset for a specific rule type.
   * This exposes the internal rate limiter state for comparison with API headers.
   * Returns the Unix timestamp in milliseconds when the oldest request expires.
   */
  public async getResetAt(
    key: string,
    ruleType: RateLimitRule['type'],
    rules: RateLimitRule[]
  ) {
    debug(
      'getting reset time for rule type %s in %s store for key %s',
      ruleType,
      this.options.store,
      key
    )

    const now = Date.now()
    const buckets = await this.getOrInit(key, rules)
    const ruleIndex = rules.findIndex(rule => rule.type === ruleType)

    if (ruleIndex === -1) {
      debug('rule type %s not found for key %s', ruleType, key)
      return now
    }

    const rule = rules[ruleIndex]
    const bucket = buckets[ruleIndex]
    const window = this.options.windowMs[rule.type]

    while (bucket.length && bucket[0] <= now - window) {
      bucket.shift()
    }

    if (bucket.length === 0) {
      debug('bucket empty, resets now')
      return now
    }

    const earliestTimestamp = bucket[0]
    const resetAt = earliestTimestamp + window

    debug('reset time for rule type %s: %d', ruleType, resetAt)

    return resetAt
  }

  /**
   * Manually update the reset time for a specific rule type based on API headers.
   * This shifts all timestamps in the bucket to align with the API's reset schedule.
   */
  public async setResetAt(
    key: string,
    ruleType: RateLimitRule['type'],
    secondsUntilReset: number,
    rules: RateLimitRule[]
  ) {
    debug(
      'setting reset time to %d seconds for rule type %s in %s store for key %s',
      secondsUntilReset,
      ruleType,
      this.options.store,
      key
    )

    const now = Date.now()
    const cache = Cache.store(this.options.store)
    const buckets = await this.getOrInit(key, rules)
    const ruleIndex = rules.findIndex(rule => rule.type === ruleType)

    if (ruleIndex === -1) {
      debug('rule type %s not found for key %s', ruleType, key)
      return
    }

    const rule = rules[ruleIndex]
    const bucket = buckets[ruleIndex]
    const window = this.options.windowMs[rule.type]

    while (bucket.length && bucket[0] <= now - window) {
      bucket.shift()
    }

    if (bucket.length === 0) {
      debug('bucket empty, nothing to shift')
      return
    }

    const targetResetAt = now + secondsUntilReset * 1000
    const earliestTimestamp = bucket[0]
    const currentResetAt = earliestTimestamp + window
    const timeDiff = targetResetAt - currentResetAt

    for (let i = 0; i < bucket.length; i++) {
      bucket[i] = bucket[i] + timeDiff
    }

    await cache.set(key, JSON.stringify(buckets))

    debug('shifted timestamps by %d ms for rule type %s', timeDiff, ruleType)
  }
}
