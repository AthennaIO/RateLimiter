/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitRule } from '#src/types'
import type { RateLimitStore } from '#src/ratelimiter/stores/RateLimitStore'

export type RateLimiterOptions = {
  /**
   * The rate limit rules.
   */
  rules?: RateLimitRule[]

  /**
   * The logical key that will be used by store to save buckets.
   */
  key?: string

  /**
   * The store responsible to save the rate limit buckets.
   */
  store?: RateLimitStore

  /**
   * Max number of tasks that could run concurrently.
   */
  maxConcurrent?: number

  /**
   * Random jitter in milliseconds to avoid thundering herd in distributed envs.
   */
  jitterMs?: number
}
