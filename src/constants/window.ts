/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitRule } from '#src/types'

export const WINDOW_MS: Record<RateLimitRule['type'], number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  month: 30 * 86_400_000
}

/**
 * The number of time slots a window is split into. Requests that land
 * in the same slot share one bucket entry, so a bucket never holds more
 * than roughly this many entries regardless of the rule limit.
 */
export const WINDOW_SLOTS = 1_000
