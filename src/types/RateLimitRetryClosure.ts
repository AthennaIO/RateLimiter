/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { RateLimitRetryCtx, RateLimitRetryDecision } from '#src/types'

export type RateLimitRetryClosure = (
  ctx: RateLimitRetryCtx
) => RateLimitRetryDecision | Promise<RateLimitRetryDecision>
