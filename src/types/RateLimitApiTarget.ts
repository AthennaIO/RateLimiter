/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitRule } from '#src/types'

export type RateLimitApiTarget = {
  /**
   * The rate limit target ID. By default this will be created by creating
   * a hash from the API Target metadata object, but you can also define your
   * own ID.
   */
  id?: string

  /**
   * Define all the metadata for this API target to function. Metadata
   * is required because we are going to create a hash from this object
   * to store the rules inside the cache by ApiTarget. With this
   * implementation you can create not only API rotations but also API
   * Keys rotations at the same time.
   */
  metadata: Record<string, any>

  /**
   * Custom rate limit rules for this API target. If not defined,
   * the default defined in RateLimiter will be used.
   */
  rules?: RateLimitRule[]
}
