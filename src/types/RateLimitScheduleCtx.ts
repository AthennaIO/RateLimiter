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
  signal?: AbortSignal
  apiTarget?: RateLimitApiTarget
}
