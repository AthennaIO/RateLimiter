/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitApiTarget } from '#src/types'

export type RateLimitRetryCtx = {
  /**
   * The error that has happened while trying to make the request.
   */
  error: Error

  /**
   * The abort signal to abort the entire process when needed.
   */
  signal?: AbortSignal

  /**
   * The cache key that was used to store the rate limit rules.
   */
  key: string

  /**
   * Define the number of attempts that have run so far.
   */
  attempt: number

  /**
   * The API Target that this retry is currently using.
   */
  apiTarget?: RateLimitApiTarget
}
