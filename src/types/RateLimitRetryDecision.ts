/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export type RateLimitRetryDecision =
  | {
      /**
       * Decide that RateLimtiter should fail the request. Use this when
       * you have already retried as much as possible and you want RateLimiter
       * to throw the exception.
       */
      type: 'fail'

      /**
       * Define for how long time your API Target will be blocked from usage.
       * This is a global state that will be respected by your store when
       * defining if it's allowed to run with that API Target or not.
       */
      cooldownMs?: number
    }
  | {
      /**
       * Decide that your next try should be with the same API Target.
       * Returning `retry_same` will basically avoid your RateLimiter
       * from using any other API Target until you decide something else.
       *
       * This decision works when using single API Targets or multiple.
       */
      type: 'retry_same'

      /**
       * Define for how long time your API Target will be blocked from usage.
       * This is a global state that will be respected by your store when
       * defining if it's allowed to run with that API Target or not.
       */
      cooldownMs?: number
    }
  | {
      /**
       * Decide that your next try should be with another API Target.
       * Returning `retry_other` will basically avoid your RateLimiter
       * from using the last API Target until you decide something else.
       *
       * This decision only takes effect when using multiple API Targets,
       * If using none or only one, it will use `retry_same` by default.
       */
      type: 'retry_other'

      /**
       * Define for how long time your API Target will be blocked from usage.
       * This is a global state that will be respected by your store when
       * defining if it's allowed to run with that API Target or not.
       */
      cooldownMs?: number
    }
