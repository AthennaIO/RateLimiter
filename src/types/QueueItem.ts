/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { ScheduleOptions } from '#src/types'

export type QueueItem<T> = {
  run: (signal?: AbortSignal) => Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
  abortHandler?: () => void
  started: boolean
  opts: ScheduleOptions
}
