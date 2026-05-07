/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import type { RateLimitRule } from '#src/types'
import { RateLimiter, RateLimitStore } from '#src'
import { Cache, CacheProvider } from '@athenna/cache'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'

export class RateLimitStoreTest {
  private store: RateLimitStore

  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new CacheProvider().register()

    this.store = new RateLimitStore({ store: 'memory' })
  }

  @AfterEach()
  public async afterEach() {
    await Cache.store('memory').truncate()

    Config.clear()
    ioc.reconstruct()
  }

  @Test()
  public async shouldReturnFreshBucketsWhenCacheHasNonArrayObject({ assert }: Context) {
    const key = 'test:corrupted-object'
    const rules: RateLimitRule[] = [
      { type: 'minute', limit: 5 },
      { type: 'hour', limit: 10 }
    ]

    // Inject a plain object whose .length matches rules.length — the exact shape
    // that previously caused `buckets[i]` to return undefined and crash.
    await Cache.store('memory').set(
      key,
      JSON.stringify({ '0': [], length: 2 })
    )

    const buckets = await this.store.getOrInit(key, rules)

    assert.isTrue(Array.isArray(buckets))
    assert.equal(buckets.length, rules.length)
    buckets.forEach(bucket => assert.isTrue(Array.isArray(bucket)))
  }

  @Test()
  public async shouldReturnFreshBucketsWhenCacheHasNullEntries({ assert }: Context) {
    const key = 'test:null-entries'
    const rules: RateLimitRule[] = [
      { type: 'minute', limit: 5 },
      { type: 'hour', limit: 10 }
    ]

    // null is valid JSON but not a valid bucket — previously bypassed the
    // parsed.length check and reached tryReserve as undefined.
    await Cache.store('memory').set(key, JSON.stringify([null, null]))

    const buckets = await this.store.getOrInit(key, rules)

    assert.isTrue(Array.isArray(buckets))
    assert.equal(buckets.length, rules.length)
    buckets.forEach(bucket => assert.isTrue(Array.isArray(bucket)))
  }

  @Test()
  public async shouldReturnFreshBucketsWhenCacheHasScalarEntries({ assert }: Context) {
    const key = 'test:scalar-entries'
    const rules: RateLimitRule[] = [{ type: 'minute', limit: 5 }]

    // A flat array of timestamps (not nested arrays) — length matches but entries
    // are numbers, not arrays.
    await Cache.store('memory').set(key, JSON.stringify([Date.now()]))

    const buckets = await this.store.getOrInit(key, rules)

    assert.isTrue(Array.isArray(buckets))
    assert.equal(buckets.length, rules.length)
    buckets.forEach(bucket => assert.isTrue(Array.isArray(bucket)))
  }

  @Test()
  public async shouldReturnFreshBucketsWhenCacheHasNonArrayPrimitive({ assert }: Context) {
    const key = 'test:primitive'
    const rules: RateLimitRule[] = [{ type: 'second', limit: 3 }]

    // A JSON number — .length is undefined so reconcile is triggered
    await Cache.store('memory').set(key, JSON.stringify(42))

    const buckets = await this.store.getOrInit(key, rules)

    assert.isTrue(Array.isArray(buckets))
    assert.equal(buckets.length, rules.length)
    buckets.forEach(bucket => assert.isTrue(Array.isArray(bucket)))
  }

  @Test()
  public async shouldPreserveValidTimestampsWhenOnlySomeEntriesAreInvalid({ assert }: Context) {
    const key = 'test:mixed-entries'
    const now = Date.now()
    const rules: RateLimitRule[] = [
      { type: 'minute', limit: 5 },
      { type: 'hour', limit: 10 }
    ]

    // First bucket has valid timestamps, second is null — valid entries are kept.
    await Cache.store('memory').set(key, JSON.stringify([[now], null]))

    const buckets = await this.store.getOrInit(key, rules)

    assert.isTrue(Array.isArray(buckets))
    assert.equal(buckets.length, 2)
    assert.deepEqual(buckets[0], [now])
    assert.deepEqual(buckets[1], [])
  }

  @Test()
  public async shouldNotCrashInTryReserveWhenCacheHasCorruptedNonArrayObject({ assert }: Context) {
    const key = 'test:reserve-corrupted'
    const rules: RateLimitRule[] = [
      { type: 'minute', limit: 5 },
      { type: 'hour', limit: 10 }
    ]

    // Pre-populate the cache with the exact shape that caused the production crash:
    // a plain object with a `length` property equal to rules.length but missing
    // numeric-keyed entries, so property access returns undefined.
    await Cache.store('memory').set(
      key,
      JSON.stringify({ '0': [], length: 2 })
    )

    // tryReserve must not throw "Cannot read properties of undefined (reading 'length')"
    const result = await this.store.tryReserve(key, rules)

    assert.isObject(result)
    assert.isDefined(result.allowed)
    assert.isDefined(result.waitMs)
  }

  @Test()
  public async shouldNotCrashScheduleWhenCacheHasCorruptedData({ assert }: Context) {
    const limiter = RateLimiter.build()
      .key('test:schedule-corrupted')
      .store('memory', { windowMs: { minute: 500, hour: 1000 } })
      .addRule({ type: 'minute', limit: 5 })
      .addRule({ type: 'hour', limit: 10 })

    // Inject corrupted data directly to simulate what was seen in production.
    await Cache.store('memory').set(
      'test:schedule-corrupted',
      JSON.stringify({ '0': [], length: 2 })
    )

    const result = await limiter.schedule(() => 'ok')

    assert.equal(result, 'ok')
  }
}
