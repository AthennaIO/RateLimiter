/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitTarget, RateLimitRule } from '#src/types'

export type RateLimitScheduleCtx = {
  /**
   * The abort signal to abort the entire process when needed.
   */
  signal?: AbortSignal

  /**
   * The target that this schedule is currently using. This will always
   * be present, even in single mode where an implicit target is created.
   */
  target: RateLimitTarget & {
    /**
     * Get the current number of remaining requests for a specific rule type.
     * This exposes the internal rate limiter state for comparison with API headers.
     *
     * @param ruleType The type of rule to query ('second', 'minute', etc.)
     * @returns The number of remaining requests
     */
    getRemaining: (ruleType: RateLimitRule['type']) => Promise<number>

    /**
     * Get the timestamp when the rate limit will reset for a specific rule type.
     * This exposes the internal rate limiter state for comparison with API headers.
     *
     * @param ruleType The type of rule to query ('second', 'minute', etc.)
     * @returns Unix timestamp in milliseconds when the oldest request expires
     */
    getResetAt: (ruleType: RateLimitRule['type']) => Promise<number>

    /**
     * Manually update the remaining request count for a specific rule type.
     * This allows syncing the internal rate limiter state with external API
     * rate limit headers.
     *
     * @param remaining The number of remaining requests
     * @param ruleType The type of rule to update ('second', 'minute', etc.)
     */
    updateRemaining: (
      remaining: number,
      ruleType: RateLimitRule['type']
    ) => Promise<void>

    /**
     * Manually update the reset time for a specific rule type based on API headers.
     * This shifts all timestamps in the bucket to align with the API's reset schedule.
     *
     * @param secondsUntilReset Number of seconds until the rate limit resets (from API header)
     * @param ruleType The type of rule to update ('second', 'minute', etc.)
     */
    updateResetAt: (
      secondsUntilReset: number,
      ruleType: RateLimitRule['type']
    ) => Promise<void>
  }
}
