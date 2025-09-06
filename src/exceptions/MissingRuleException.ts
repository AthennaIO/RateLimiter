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
  public constructor(apiTargets?: string[]) {
    let message = 'Missing rules value for rate limiter.'
    let help =
      'This error happens when you forget to define rules for your RateLimiter instance.'

    if (apiTargets) {
      message = `Missing rules value for your API Targets: ${apiTargets.join(
        ', '
      )}`
      help =
        'This error happens when you forget to define rules for you API Target or for your RateLimtier instance. You have two options, define a custom rule for all your API Targets or define a default rule in your RateLimiter to be used by default by API Targets.'
    }

    super({
      code: 'E_MISSING_RULE_ERROR',
      help,
      message
    })
  }
}
