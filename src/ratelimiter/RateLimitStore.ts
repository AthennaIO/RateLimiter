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
}
