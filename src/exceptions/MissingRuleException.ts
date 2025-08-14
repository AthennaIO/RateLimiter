/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class MissingRuleException extends Exception {
  public constructor() {
    super({
      code: 'E_MISSING_RULE_ERROR',
      help: 'This errors happens when you forget to define rules for your RateLimiter instance.',
      message: 'Missing rules value for rate limiter.'
    })
  }
}
