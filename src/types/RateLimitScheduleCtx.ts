/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitApiTarget } from '#src/types'

export type RateLimitScheduleCtx = {
  /**
   * The abort signal to abort the entire process when needed.
   */
  signal?: AbortSignal

  /**
   * The API Target that this retry is currently using.
   */
  apiTarget?: RateLimitApiTarget
}
