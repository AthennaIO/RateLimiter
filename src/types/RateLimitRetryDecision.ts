/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export type RateLimitRetryDecision = {
  /**
   * `fail`: Decide that RateLimtiter should fail the request. Use this when
   * you have already retried as much as possible and you want RateLimiter
   * to throw the exception.
   * 
   * `retry_same`: Decide that your next try should be with the same target.
   * Returning `retry_same` will basically avoid your RateLimiter
   * from using any other target until you decide something else. This d
   * ecision works when using single targets or multiple.
   * 
   * `retry_other`: Decide that your next try should be with another target.
   * Returning `retry_other` will basically avoid your RateLimiter
   * from using the last target until you decide something else. This decision 
   * only takes effect when using multiple targets, if using none or only one, 
   * it will use `retry_same` by default.
   */
  type: 'fail' | 'retry_same' | 'retry_other'

  /**
   * Define for how long time your target will be blocked from usage.
   * This is a global state that will be respected by your store when
   * defining if it's allowed to run with that target or not.
   */
  currentTargetCooldownMs?: number
}
