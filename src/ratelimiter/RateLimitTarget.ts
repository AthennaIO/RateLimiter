/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type {
  RateLimitRule,
  RateLimitRawTarget,
  RateLimiterOptions
} from '#src/types'

import { Config } from '@athenna/config'
import { Json, String, Macroable } from '@athenna/common'

export class RateLimitTarget extends Macroable {
  /**
   * The rate limit target ID. By default this will be created by creating
   * a hash from the target metadata object, but you can also define your
   * own ID.
   */
  public id?: string

  /**
   * Define all the metadata for this target to function. Metadata
   * is required because we are going to create a hash from this object
   * to store the rules inside the cache by Target. With this
   * implementation you can create not only API rotations but also API
   * Keys rotations at the same time.
   */
  public metadata: Record<string, any>

  /**
   * The options that were used to create the rate limiter.
   */
  public options: RateLimiterOptions

  /**
   * Custom rate limit rules for this target. If not defined,
   * the default defined in RateLimiter will be used.
   */
  public rules?: RateLimitRule[]

  public constructor(raw: RateLimitRawTarget, options: RateLimiterOptions) {
    super()

    this.options = options
    this.metadata = raw.metadata || {}
    this.rules = raw.rules?.length ? raw.rules : options.rules

    this.id =
      raw.id ||
      String.hash(JSON.stringify(Json.sort(this.metadata)), {
        key: Config.get('app.key', 'ratelimiter')
      })
  }

  /**
   * Create a custom key for an target to be used to map the
   * target rules into the cache.
   */
  public getKey() {
    if (this.id === '__implicit__') {
      return this.options.key
    }

    return `${this.options.key}:${this.id}`
  }

  /**
   * Get the current number of remaining requests for a specific rule type.
   * This exposes the internal rate limiter state for comparison with API headers.
   */
  public async getRemaining(type: RateLimitRule['type']) {
    return this.options.store!.getRemaining(this.getKey(), type, this.rules)
  }

  /**
   * Get the timestamp when the rate limit will reset for a specific rule type.
   * This exposes the internal rate limiter state for comparison with API headers.
   */
  public async getResetAt(type: RateLimitRule['type']) {
    return this.options.store!.getResetAt(this.getKey(), type, this.rules)
  }

  /**
   * Manually update the remaining request count for a specific rule type.
   * This allows syncing the internal rate limiter state with external API
   * rate limit headers.
   */
  public async updateRemaining(remaining: number, type: RateLimitRule['type']) {
    await this.options.store!.setRemaining(
      this.getKey(),
      type,
      remaining,
      this.rules
    )
  }

  /**
   * Manually update the reset time for a specific rule type based on API headers.
   * This shifts all timestamps in the bucket to align with the API's reset schedule.
   */
  public async updateResetAt(seconds: number, type: RateLimitRule['type']) {
    await this.options.store!.setResetAt(
      this.getKey(),
      type,
      seconds,
      this.rules
    )
  }
}
