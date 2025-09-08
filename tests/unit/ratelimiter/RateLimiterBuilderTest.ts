/**
 * @athenna/ratelimiter
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { RateLimiter } from '#src'
import { Path, Sleep } from '@athenna/common'
import { Cache, CacheProvider } from '@athenna/cache'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'
import { MissingKeyException } from '#src/exceptions/MissingKeyException'
import { MissingRuleException } from '#src/exceptions/MissingRuleException'
import { MissingStoreException } from '#src/exceptions/MissingStoreException'

export class RateLimiterBuilderTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    new CacheProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    await Cache.store('memory').truncate()

    Config.clear()
    ioc.reconstruct()
  }

  private createBarrier() {
    let release!: () => void

    const wait = new Promise<void>(resolve => (release = resolve))

    return { wait: () => wait, release: () => release() }
  }

  private cancellableSleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null

      const clear = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }

        if (signal) {
          signal.removeEventListener('abort', onAbort)
        }
      }

      const onAbort = () => {
        clear()
        reject(new DOMException('Aborted', 'AbortError'))
      }

      if (signal) {
        if (signal.aborted) {
          return onAbort()
        }

        signal.addEventListener('abort', onAbort, { once: true })
      }

      timer = setTimeout(() => {
        clear()
        resolve()
      }, ms)
    })
  }

  private async waitUntil(pred: () => boolean, intervalMs = 5, timeoutMs = 500) {
    const start = Date.now()

    while (!pred()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('waitUntil timeout')
      }

      // eslint-disable-next-line promise/param-names
      await new Promise<void>(r => setTimeout(r, intervalMs))
    }
  }

  @Test()
  public async shouldThrowAMissingKeyExceptionWhenBuildingARateLimiterWithoutKey({ assert }: Context) {
    assert.throws(
      () =>
        RateLimiter.build()
          .store('memory')
          .addRule({ type: 'second', limit: 1 })
          .schedule(() => {}),
      MissingKeyException
    )
  }

  @Test()
  public async shouldThrowAMissingRuleExceptionWhenBuildingARateLimiterWithoutRule({ assert }: Context) {
    assert.throws(
      () =>
        RateLimiter.build()
          .key('request:api-key:/profile')
          .store('memory')
          .schedule(() => {}),
      MissingRuleException
    )
  }

  @Test()
  public async shouldThrowAMissingStoreExceptionWhenBuildingARateLimiterWithoutStore({ assert }: Context) {
    assert.throws(
      () =>
        RateLimiter.build()
          .key('request:api-key:/profile')
          .addRule({ type: 'second', limit: 1 })
          .schedule(() => {}),
      MissingStoreException
    )
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerSecond({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(() => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithSettingMultipleRules({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .setRules([{ type: 'second', limit: 1 }])

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(() => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToHaveErrorsHappeningInsideTheRateLimiterHandler({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    await assert.rejects(() => {
      return limiter.schedule(() => {
        throw new Error('failed')
      })
    })
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerMinute({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { minute: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'minute', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(() => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerHour({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { hour: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'hour', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(() => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerDay({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { day: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'day', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(() => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerMonth({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { month: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'month', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(() => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithSecondAndMinutesRules({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 300, minute: 400 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })
      .addRule({ type: 'minute', limit: 2 })

    const starts = []
    const promises = []
    const numberOfRequests = 6

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(
        limiter.schedule(() => {
          starts.push(Date.now())
          return 'ok' + i
        })
      )
    }

    await Promise.all(promises)

    const total = starts[starts.length - 1] - starts[0]

    /**
     * Second request after 100ms
     */
    assert.isAtLeast(starts[1] - starts[0], 200)
    /**
     * Third one only after releasing the 300ms window (rule minute)
     */
    assert.isAtLeast(starts[2] - starts[1], 300)
    assert.isAtLeast(starts[3] - starts[2], 200)
    assert.isAtLeast(starts[4] - starts[3], 300)
    assert.isAtLeast(starts[5] - starts[4], 200)
    assert.isAtLeast(total, 800)
  }

  @Test()
  public async shouldBeAbleToCleanTheLimiterExecutionByTruncatingIt({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const numberOfRequests = 10

    for (let i = 0; i < numberOfRequests; i++) {
      limiter.schedule(() => 'ok' + i)
    }

    limiter.truncate()

    assert.equal(limiter.getActiveCount(), 0)
    assert.equal(limiter.getQueuedCount(), 0)
  }

  @Test()
  public async shouldBeAbleToGetTheQueuedCountOfTheLimiter({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const promises = []
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(() => 'ok' + i))
    }

    assert.equal(limiter.getQueuedCount(), 5)

    limiter.truncate()
  }

  @Test()
  public async shouldBeAbleToGetTheActiveCountOfTheLimiter({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const barrier = this.createBarrier()

    const promises = []
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(
        limiter.schedule(async () => {
          await barrier.wait()
          return 'ok' + i
        })
      )
    }

    await Sleep.for(5).milliseconds().wait()
    await Sleep.for(500).milliseconds().wait()

    barrier.release()

    const responses = await Promise.all(promises)

    assert.deepEqual(responses, ['ok0', 'ok1', 'ok2', 'ok3', 'ok4'])
    assert.equal(limiter.getActiveCount(), 0)
  }

  @Test()
  public async shouldBeAbleToGetTheActiveCountOfTheLimiterWithConcurrentRequests({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .jitterMs(0)
      .maxConcurrent(5)
      .addRule({ type: 'second', limit: 1 })

    const barrier = this.createBarrier()

    const promises = []
    const numberOfRequests = 8

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(
        limiter.schedule(async () => {
          await barrier.wait()
          return 'ok' + i
        })
      )
    }

    await Sleep.for(5).milliseconds().wait()
    await Sleep.for(500).milliseconds().wait()

    assert.equal(limiter.getActiveCount(), 5)

    barrier.release()

    const responses = await Promise.all(promises)

    assert.deepEqual(responses, ['ok0', 'ok1', 'ok2', 'ok3', 'ok4', 'ok5', 'ok6', 'ok7'])
    assert.equal(limiter.getActiveCount(), 0)
  }

  @Test()
  public async shouldBeAbleToGetWhenTheRateLimiterWillBeAvailable({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .jitterMs(0)
      .maxConcurrent(10)
      .addRule({ type: 'second', limit: 1 })

    limiter.schedule(() => new Promise<void>(() => {}))
    limiter.schedule(() => 'ok')

    await this.waitUntil(() => limiter.getAvailableInMs() > 0, 10, 200)

    const availableInMs = limiter.getAvailableInMs()

    assert.isAtLeast(availableInMs, 50)
    assert.isAtMost(availableInMs, 120)

    await this.waitUntil(() => limiter.getAvailableInMs() === 0, 10, 300)

    assert.equal(limiter.getAvailableInMs(), 0)
  }

  @Test()
  public async shouldBeAbleToAbortARateLimiterTaskThatIsEnqueuedUsingAnAbortController({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const barrier = this.createBarrier()
    const abortController = new AbortController()

    const p0 = limiter.schedule(async () => {
      await barrier.wait()
      return 'ok0'
    })

    const p1 = limiter.schedule(() => 'ok1', { signal: abortController.signal }).catch(err => err)
    const p2 = limiter.schedule(() => 'ok2')

    abortController.abort('testing')
    await Sleep.for(30).milliseconds().wait()

    assert.equal(limiter.getQueuedCount(), 1)

    barrier.release()

    const [r0, r1, r2] = await Promise.all([p0, p1, p2])

    assert.equal(r0, 'ok0')
    assert.equal(r2, 'ok2')
    assert.equal(r1?.name, 'AbortError')
  }

  @Test()
  public async shouldNotBeAbleToCancelAlreadyStartedRateLimiterTask({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const started = this.createBarrier()
    const release = this.createBarrier()
    const abortController = new AbortController()

    const p = limiter.schedule(
      async () => {
        started.release()
        await release.wait()

        return 'ok'
      },
      { signal: abortController.signal }
    )

    await started.wait()

    abortController.abort('testing')

    await Sleep.for(20).milliseconds().wait()

    release.release()

    const result = await p

    assert.equal(result, 'ok')
  }

  @Test()
  public async shouldBeAbleToCancelAlreadyStartedRateLimiterTaskIfUserUsesTheAbortController({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    let started = false
    const abortController = new AbortController()

    const p = limiter.schedule(
      async ctx => {
        started = true

        await this.cancellableSleep(1_000, ctx.signal)

        return 'ok'
      },
      { signal: abortController.signal }
    )

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!started) {
      await Sleep.for(1).milliseconds().wait()
    }

    abortController.abort('testing')

    let caught: any

    try {
      await p
    } catch (e) {
      caught = e
    }

    assert.ok(caught)
    assert.equal(caught?.name, 'AbortError')
  }

  @Test()
  public async shouldBeAbleToAbortARateLimiterTaskBeforeItEvenStarts({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const abortController = new AbortController()

    abortController.abort('testing')

    const p = limiter.schedule(() => 'ok', { signal: abortController.signal })

    await assert.rejects(() => p, 'Aborted')
  }

  @Test()
  public async shouldNotBeAbleToAbortTheTaskIfItHasAlreadyStartedRunning({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const abortController = new AbortController()

    const p = limiter.schedule(() => 'ok', { signal: abortController.signal })

    await Sleep.for(900).milliseconds().wait()

    abortController.abort('testing')

    await assert.doesNotReject(() => p)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerSecondWithAnApiTarget({ assert }: Context) {
    assert.plan(6)

    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })
      .addApiTarget({ metadata: { baseUrl: 'http://api1.com' } })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(
        limiter.schedule(({ apiTarget }) => {
          assert.isDefined(apiTarget)

          return 'ok' + i
        })
      )
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerSecondSettingMultipleApiTargets({
    assert
  }: Context) {
    assert.plan(6)

    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })
      .setApiTargets([{ metadata: { baseUrl: 'http://api1.com' } }])

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(
        limiter.schedule(({ apiTarget }) => {
          assert.isDefined(apiTarget)

          return 'ok' + i
        })
      )
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToHaveErrorsHappeningInsideTheRateLimiterHandlerEvenWithAnApiTargetSet({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })
      .addApiTarget({ metadata: { baseUrl: 'http://api1.com' } })

    await assert.rejects(() => {
      return limiter.schedule(() => {
        throw new Error('failed')
      })
    })
  }

  @Test()
  public async shouldBeAbleToTryWithTheSecondApiTargetIfTheFirstApiTargetIsAtFullCapacityInASequentialScenario({
    assert
  }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })
      .addApiTarget({ metadata: { baseUrl: 'http://api1.com' } })
      .addApiTarget({ metadata: { baseUrl: 'http://api2.com' } })

    const first = await limiter.schedule(({ apiTarget }) => apiTarget.metadata.baseUrl)

    assert.equal(first, 'http://api1.com')

    const second = await limiter.schedule(({ apiTarget }) => apiTarget.metadata.baseUrl)

    assert.equal(second, 'http://api2.com')
  }

  @Test()
  public async shouldBeAbleToTryWithTheSecondApiTargetIfTheFirstApiTargetIsAtFullCapacityInAConcurrentScenario({
    assert
  }: Context) {
    const limiter = RateLimiter.build()
      .maxConcurrent(2)
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })
      .addApiTarget({ metadata: { baseUrl: 'http://api1.com' } })
      .addApiTarget({ metadata: { baseUrl: 'http://api2.com' } })

    const barrier = this.createBarrier()
    const used: string[] = []

    const run = async ({ apiTarget }) => {
      used.push(apiTarget.metadata.baseUrl)

      await barrier.wait()

      return apiTarget.metadata.baseUrl
    }

    const p1 = limiter.schedule(run)
    const p2 = limiter.schedule(run)

    await Sleep.for(5).milliseconds().wait()

    barrier.release()

    const results = await Promise.all([p1, p2])

    results.sort()

    assert.deepEqual(results, ['http://api1.com', 'http://api2.com'])

    used.sort()
    assert.deepEqual(used, ['http://api1.com', 'http://api2.com'])
  }

  @Test()
  public async shouldBeAbleToTryWithTheSecondApiTargetIfTheFirstApiTargetIsAtFullCapacityInASequentialScenarioWithRoundRobinStrategy({
    assert
  }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .apiTargetSelectionStrategy('round_robin')
      .addRule({ type: 'second', limit: 1 })
      .addApiTarget({ id: 't1', metadata: { baseUrl: 'http://api1.com' } })
      .addApiTarget({ id: 't2', metadata: { baseUrl: 'http://api2.com' } })

    const used: string[] = []

    const tasks = Array.from({ length: 4 }, () =>
      limiter.schedule(({ apiTarget }) => {
        used.push(apiTarget.metadata.baseUrl)

        return apiTarget.metadata.baseUrl
      })
    )

    const results = await Promise.all(tasks)

    assert.deepEqual(results, used)
    assert.deepEqual(used, ['http://api1.com', 'http://api2.com', 'http://api1.com', 'http://api2.com'])
  }

  @Test()
  public async shouldThrowMissingRuleExceptionIfRateLimiterRulesAndApiTargetRulesAreNotDefined({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addApiTarget({ id: 't1', metadata: { baseUrl: 'http://api1.com' } })

    await assert.rejects(() => limiter.schedule(() => {}), MissingRuleException)
  }

  @Test()
  public async shouldNotThrowMissingRuleExceptionIfRateLimiterRulesAreNotDefinedButApiTargetRulesAreDefined({
    assert
  }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addApiTarget({ id: 't1', rules: [{ type: 'second', limit: 1 }], metadata: { baseUrl: 'http://api1.com' } })

    await assert.doesNotReject(() => limiter.schedule(() => {}), MissingRuleException)
  }

  @Test()
  public async shouldBeAbleToTryWithTheSecondApiTargetIfTheFirstApiTargetIsAtFullCapacityInAConcurrentScenarioWithRoundRobinStrategy({
    assert
  }: Context) {
    const limiter = RateLimiter.build()
      .maxConcurrent(2)
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .apiTargetSelectionStrategy('round_robin')
      .addRule({ type: 'second', limit: 1 })
      .addApiTarget({ id: 't1', metadata: { baseUrl: 'http://api1.com' } })
      .addApiTarget({ id: 't2', metadata: { baseUrl: 'http://api2.com' } })

    const barrier = this.createBarrier()
    const started: string[] = []

    const p1 = limiter.schedule(async ({ apiTarget }) => {
      started.push(apiTarget.metadata.baseUrl)

      await barrier.wait()

      return apiTarget.metadata.baseUrl
    })
    const p2 = limiter.schedule(async ({ apiTarget }) => {
      started.push(apiTarget.metadata.baseUrl)

      await barrier.wait()

      return apiTarget.metadata.baseUrl
    })

    for (let i = 0; i < 20 && started.length < 2; i++) {
      await Sleep.for(1).milliseconds().wait()
    }

    assert.deepEqual(started, ['http://api1.com', 'http://api2.com'])

    barrier.release()

    const result = await Promise.all([p1, p2])

    result.sort()

    assert.deepEqual(result, ['http://api1.com', 'http://api2.com'])
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterDefiningRulesInApiTarget({ assert }: Context) {
    assert.plan(6)

    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addApiTarget({ rules: [{ type: 'second', limit: 1 }], metadata: { baseUrl: 'http://api0.com' } })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(
        limiter.schedule(({ apiTarget }) => {
          assert.isDefined(apiTarget)

          return 'ok' + i
        })
      )
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldNotBeAbleToRetryRequestWithoutARetryStrategy({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addApiTarget({ rules: [{ type: 'second', limit: 1 }], metadata: { baseUrl: 'http://api0.com' } })

    await assert.rejects(() =>
      limiter.schedule(({ apiTarget }) => {
        throw new Error(apiTarget.metadata.baseUrl)
      })
    )
  }

  @Test()
  public async shouldAlwaysFailTheRequestIfRetryStrategyDecideItShouldFail({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store('memory', { windowMs: { second: 100 } })
      .key('request:api-key:/profile')
      .addApiTarget({ rules: [{ type: 'second', limit: 1 }], metadata: { baseUrl: 'http://api0.com' } })
      .retryStrategy(ctx => {
        if (ctx.error.message === 'fail') {
          return { type: 'fail' }
        }
      })

    await assert.rejects(() =>
      limiter.schedule(() => {
        throw new Error('fail')
      })
    )
  }

  @Test()
  public async shouldAlwaysCooldownAndRetryTheRequestWithTheSameApiIfRetryStrategyDecideItShouldWaitToTryAgainWithSame({
    assert
  }: Context) {
    const limiter = RateLimiter.build()
      .key('request:api-key:/profile')
      .store('memory', { windowMs: { second: 100 } })
      .addApiTarget({ rules: [{ type: 'second', limit: 1 }], metadata: { baseUrl: 'http://api0.com' } })
      .addApiTarget({ rules: [{ type: 'second', limit: 1 }], metadata: { baseUrl: 'http://api1.com' } })
      .retryStrategy(() => {
        return { type: 'cooldown', cooldownMs: 100, then: 'retry_same' }
      })

    const apiTargetUsed = []
    let isFirstRequest = true

    await limiter.schedule(({ apiTarget }) => {
      apiTargetUsed.push(apiTarget.metadata.baseUrl)

      if (isFirstRequest) {
        isFirstRequest = false

        throw new Error('fail')
      }
    })

    assert.deepEqual(apiTargetUsed, ['http://api0.com', 'http://api0.com'])
  }
}
