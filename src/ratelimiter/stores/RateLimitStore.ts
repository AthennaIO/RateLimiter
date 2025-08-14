/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { WINDOW_MS } from '#src/constants/window'
import type { Reserve, RateLimitRule, RateLimitStoreOptions } from '#src/types'

export abstract class RateLimitStore {
  /**
   * Holds the options that will be used to build the rate limiter
   * store.
   */
  public options: RateLimitStoreOptions

  public constructor(options: RateLimitStoreOptions = {}) {
    options.windowMs = options.windowMs ?? WINDOW_MS

    this.options = options
  }

  /**
   * Try to reserve a token para all rules of the key.
   * If allowed is false, return the maximum waitMs necessary.
   */
  public abstract tryReserve(
    key: string,
    rules: RateLimitRule[]
  ): Promise<Reserve>
}
