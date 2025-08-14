/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { WINDOW_MS } from '#src/constants/window'

export type RateLimitStoreOptions = {
  /**
   * The @athenna/cache store connection that will be used to save the rate limit buckets.
   */
  store?: string

  /**
   * Override the default window in milliseconds. Useful for testing purposes when you want
   * to test the rate limiter rules but don't want to wait for the default window.
   */
  windowMs?: Partial<typeof WINDOW_MS>
}
