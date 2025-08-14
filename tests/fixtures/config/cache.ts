/**
 * @athenna/queue
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Env } from '@athenna/config'

export default {
  /*
  |--------------------------------------------------------------------------
  | Default Cache Store Name
  |--------------------------------------------------------------------------
  |
  | Athenna's cache API supports an assortment of back-ends via a single
  | API, giving you convenient access to each back-end using the same
  | syntax for every one. Here you may define a default store.
  |
  */

  default: Env('CACHE_STORE', 'memory'),

  /*
   |--------------------------------------------------------------------------
   | Cache Stores
   |--------------------------------------------------------------------------
   |
   | Here you may configure the store connection information for each server that
   | is used by your application. A default configuration has been added
   | for each back-end shipped with Athenna. You are free to add more.
   |
   | Drivers: "memory"
   |
   */

  stores: {
    memory: {
      driver: 'memory',
      ttl: 1000
    }
  }
}
