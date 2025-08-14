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
import { Options } from '@athenna/common'
import { RateLimitStore } from '#src/ratelimiter/stores/RateLimitStore'
import type { Reserve, RateLimitRule, RateLimitStoreOptions } from '#src/types'

export class MemoryStore extends RateLimitStore {
  public constructor(options: RateLimitStoreOptions = {}) {
    options = Options.create(options, {
      store: 'memory'
    })

    super(options)
  }

  private async getOrInit(key: string, rules: RateLimitRule[]) {
    const cache = Cache.store(this.options.store)

    let buckets = await cache.get(key)

    if (!buckets) {
      buckets = JSON.stringify(rules.map(() => []))

      await cache.set(key, buckets)
    }

    return JSON.parse(buckets) as number[][]
  }

  /**
   * Try to reserve a token for all rules of the key. If not
   * allowed to reserve, return the maximum waitMs necessary.
   */
  public async tryReserve(key: string, rules: RateLimitRule[]) {
    debug(
      'running memory store tryReserve for key %s with rules %o',
      key,
      rules
    )

    let wait = 0
    const now = Date.now()
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
      await Cache.store(this.options.store).set(key, JSON.stringify(buckets))

      return reserve
    }

    for (let i = 0; i < rules.length; i++) {
      buckets[i].push(now)
    }

    await Cache.store(this.options.store).set(key, JSON.stringify(buckets))

    reserve.waitMs = 0
    reserve.allowed = true

    return reserve
  }
}
