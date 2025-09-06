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
   * The rate limit target ID. Useful for logs and metrics
   * and to create a unique key in your store only for this
   * API Target.
   */
  id: string

  /**
   * API target base URL that will be used to fetch the request.
   */
  baseUrl: string

  /**
   * Custom rate limit rules for this API target. If not defined,
   * the default defined in RateLimiter will be used.
   */
  rules?: RateLimitRule[]

  /**
   * Define any kind of metadata for this API target. Metadata is
   * useful to define informations such as API Keys to not only
   * create API rotations but API Keys rotations at the same time.
   */
  metadata?: Record<string, any>
}
