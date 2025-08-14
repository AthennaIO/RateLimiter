/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { RateLimiterBuilder } from '#src/ratelimiter/RateLimiterBuilder'

export class RateLimiter {
  /**
   * Build a new instance of rate limiter.
   */
  public static build() {
    return new RateLimiterBuilder()
  }
}
