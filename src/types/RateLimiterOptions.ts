/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type {
  RateLimitRule,
  RateLimitTarget,
  RateLimitRetryClosure
} from '#src/types'
import type { RateLimitStore } from '#src/ratelimiter/RateLimitStore'

export type RateLimiterOptions = {
  /**
   * The rate limit rules.
   */
  rules?: RateLimitRule[]

  /**
   * The logical key that will be used by store to save buckets.
   * If API Targers are defined, it will be used as a prefix from
   * a hash created from targets metadata object: `${key}:${hash}`.
   */
  key?: string

  /**
   * The api targets that will be used to create API rotations when
   * some of them fails.
   */
  targets?: RateLimitTarget[]

  /**
   * The retry strategy for this rate limiter. This is useful to
   * give the power to the user when and how we should proceed with
   * the retry of failed executions.
   */
  retryStrategy?: RateLimitRetryClosure

  /**
   * The store responsible to save the rate limit buckets.
   */
  store?: RateLimitStore

  /**
   * Max number of tasks that could run concurrently.
   *
   * @default 1
   */
  maxConcurrent?: number

  /**
   * Random jitter in milliseconds to avoid thundering herd in distributed envs.
   *
   * @default 0
   */
  jitterMs?: number

  /**
   * Define the selection strategy that will be used to select which target
   * will be used next when some of them fails.
   *
   * @default 'first_available'
   */
  targetSelectionStrategy: 'first_available' | 'round_robin'
}
