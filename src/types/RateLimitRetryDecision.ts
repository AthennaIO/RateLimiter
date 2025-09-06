/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export type RateLimitRetryDecision =
  | { type: 'fail' }
  | { type: 'retry_same'; delayMs?: number }
  | { type: 'retry_other'; delayMs?: number; cooldownMs?: number }
  | {
      type: 'cooldown'
      cooldownMs: number
      then?: 'fail' | 'retry_same' | 'retry_other'
    }
