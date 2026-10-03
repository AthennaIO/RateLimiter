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
    await Cache.store('memory').set(key, JSON.stringify({ '0': [], length: 2 }))

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
    await Cache.store('memory').set(key, JSON.stringify([[[now, 1]], null]))

    const buckets = await this.store.getOrInit(key, rules)

    assert.isTrue(Array.isArray(buckets))
    assert.equal(buckets.length, 2)
    assert.deepEqual(buckets[0], [[now, 1]])
    assert.deepEqual(buckets[1], [])
  }

  @Test()
  public async shouldDiscardLegacyTimestampBucketsAndPersistThemEmpty({ assert }: Context) {
    const key = 'test:legacy-buckets'
    const rules: RateLimitRule[] = [{ type: 'month', limit: 1_500_000 }]

    // Legacy format: one timestamp per request, the shape rebuildBucket used
    // to materialize from API headers.
    await Cache.store('memory').set(key, JSON.stringify([new Array(1_500_000).fill(Date.now() - 1000)]))

    const start = Date.now()
    const remaining = await this.store.getRemaining(key, 'month', rules)
    const resetAt = await this.store.getResetAt(key, 'month', rules)
    const stored = JSON.parse(await Cache.store('memory').get(key))

    assert.isBelow(Date.now() - start, 2000)
    assert.equal(remaining, 1_500_000)
    assert.isAtMost(resetAt, Date.now())
    assert.deepEqual(stored, [[]])
  }

  @Test()
  public async shouldKeepBucketSizeBoundedWhenRequestsGrow({ assert }: Context) {
    const key = 'test:bounded'
    const rules: RateLimitRule[] = [{ type: 'hour', limit: 1_000_000 }]

    for (let i = 0; i < 200; i++) {
      await this.store.tryReserve(key, rules)
    }

    const buckets = await this.store.getOrInit(key, rules)
    const used = buckets[0].reduce((total, [, count]) => total + count, 0)

    assert.equal(used, 200)
    assert.isAtMost(buckets[0].length, 2)
  }

  @Test()
  public async shouldSyncStateIntoASingleEntryInsteadOfOnePerRequest({ assert }: Context) {
    const key = 'test:sync-compact'
    const rules: RateLimitRule[] = [{ type: 'month', limit: 1_500_000 }]

    await this.store.syncState(key, 'month', { remaining: 0, secondsUntilReset: 86_400 }, rules)

    const stored = await Cache.store('memory').get(key)
    const remaining = await this.store.getRemaining(key, 'month', rules)
    const resetAt = await this.store.getResetAt(key, 'month', rules)

    assert.isBelow(stored.length, 100)
    assert.equal(remaining, 0)
    assert.closeTo(resetAt, Date.now() + 86_400_000, 5000)
  }

  @Test()
  public async shouldUseDefaultWindowForRuleTypesMissingFromCustomWindowMs({ assert }: Context) {
    const key = 'test:partial-window'
    const store = new RateLimitStore({ store: 'memory', windowMs: { second: 100 } })
    const rules: RateLimitRule[] = [{ type: 'minute', limit: 5 }]

    await store.tryReserve(key, rules)
    await store.tryReserve(key, rules)

    const remaining = await store.getRemaining(key, 'minute', rules)

    assert.equal(remaining, 3)
  }

  @Test()
  public async shouldDiscardLegacyTimestampsMixedWithEntries({ assert }: Context) {
    const key = 'test:mixed-format'
    const now = Date.now()
    const rules: RateLimitRule[] = [{ type: 'second', limit: 10 }]

    // An older process may still push raw timestamps into a new bucket
    // during a rolling deploy.
    await Cache.store('memory').set(key, JSON.stringify([[[now, 2], now, now]]))

    const remaining = await this.store.getRemaining(key, 'second', rules)

    assert.equal(remaining, 8)
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
    await Cache.store('memory').set(key, JSON.stringify({ '0': [], length: 2 }))

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
    await Cache.store('memory').set('test:schedule-corrupted', JSON.stringify({ '0': [], length: 2 }))

    const result = await limiter.schedule(() => 'ok')

    assert.equal(result, 'ok')
  }
}
