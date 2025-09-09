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
    const message = 'Missing rules value for rate limiter and targets.'
    const help =
      'This error happens when you forget to define default rules for your RateLimiter instance and custom rules by target. You has two options, define a default rule in your RateLimiter that will be used by targets that does not have a rule or define a custom rule for all your targets.'

    super({
      code: 'E_MISSING_RULE_ERROR',
      help,
      message
    })
  }
}
