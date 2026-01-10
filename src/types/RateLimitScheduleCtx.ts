/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitTarget } from '#src/ratelimiter/RateLimitTarget'

export type RateLimitScheduleCtx = {
  /**
   * The abort signal to abort the entire process when needed.
   */
  signal?: AbortSignal

  /**
   * The target that this schedule is currently using. This will always
   * be present, even in single mode where an implicit target is created.
   */
  target: RateLimitTarget
}
