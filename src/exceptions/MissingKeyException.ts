/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Exception } from '@athenna/common'

export class MissingKeyException extends Exception {
  public constructor() {
    super({
      code: 'E_MISSING_KEY_ERROR',
      help: 'This errors happens when you forget to define a key for your RateLimiter instance.',
      message: 'Missing key value for rate limiter.'
    })
  }
}
