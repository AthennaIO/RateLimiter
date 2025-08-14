import { Path, Sleep } from '@athenna/common'
import { CacheProvider } from '@athenna/cache'
import { MemoryStore, RateLimiter } from '#src'
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
          .store(new MemoryStore())
          .addRule({ type: 'second', limit: 1 })
          .schedule(async () => {}),
      MissingKeyException
    )
  }

  @Test()
  public async shouldThrowAMissingRuleExceptionWhenBuildingARateLimiterWithoutRule({ assert }: Context) {
    assert.throws(
      () =>
        RateLimiter.build()
          .key('request:api-key:/profile')
          .store(new MemoryStore())
          .schedule(async () => {}),
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
          .schedule(async () => {}),
      MissingStoreException
    )
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerSecond({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { second: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(async () => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerMinute({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { minute: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'minute', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(async () => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerHour({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { hour: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'hour', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(async () => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerDay({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { day: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'day', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(async () => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithARuleOfOneRequestPerMonth({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { month: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'month', limit: 1 })

    const promises = []
    const dateStart = Date.now()
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(async () => 'ok' + i))
    }

    await Promise.all(promises)

    assert.isAtLeast(Date.now() - dateStart, 400)
  }

  @Test()
  public async shouldBeAbleToBuildARateLimiterWithSecondAndMinutesRules({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { second: 300, minute: 400 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })
      .addRule({ type: 'minute', limit: 2 })

    const starts = []
    const promises = []
    const numberOfRequests = 6

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(
        limiter.schedule(async () => {
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
      .store(new MemoryStore({ windowMs: { second: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const numberOfRequests = 10

    for (let i = 0; i < numberOfRequests; i++) {
      limiter.schedule(async () => 'ok' + i)
    }

    limiter.truncate()

    assert.equal(limiter.getActiveCount(), 0)
    assert.equal(limiter.getQueuedCount(), 0)
  }

  @Test()
  public async shouldBeAbleToGetTheQueuedCountOfTheLimiter({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { second: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const promises = []
    const numberOfRequests = 5

    for (let i = 0; i < numberOfRequests; i++) {
      promises.push(limiter.schedule(async () => 'ok' + i))
    }

    assert.equal(limiter.getQueuedCount(), 5)

    limiter.truncate()
  }

  @Test()
  public async shouldBeAbleToGetTheActiveCountOfTheLimiter({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { second: 100 } }))
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
      .store(new MemoryStore({ windowMs: { second: 100 } }))
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
      .store(new MemoryStore({ windowMs: { second: 100 } }))
      .key('request:api-key:/profile')
      .jitterMs(0)
      .maxConcurrent(10)
      .addRule({ type: 'second', limit: 1 })

    limiter.schedule(async () => new Promise<void>(() => {}))
    limiter.schedule(async () => 'ok')

    await Sleep.for(0).milliseconds().wait()

    assert.isAtLeast(limiter.getAvailableInMs(), 60)
    assert.isAtMost(limiter.getAvailableInMs(), 120)

    await this.waitUntil(() => limiter.getAvailableInMs() === 0, 5, 800)

    assert.equal(limiter.getAvailableInMs(), 0)
  }

  @Test()
  public async shouldBeAbleToAbortARateLimiterTaskThatIsEnqueuedUsingAnAbortController({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { second: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    const barrier = this.createBarrier()
    const abortController = new AbortController()

    const p0 = limiter.schedule(async () => {
      await barrier.wait()
      return 'ok0'
    })

    const p1 = limiter.schedule(async () => 'ok1', { signal: abortController.signal }).catch(err => err)
    const p2 = limiter.schedule(async () => 'ok2')

    abortController.abort('testing')
    await Sleep.for(30).milliseconds().wait()

    assert.equal(limiter.getQueuedCount(), 2)

    barrier.release()

    const [r0, r1, r2] = await Promise.all([p0, p1, p2])

    assert.equal(r0, 'ok0')
    assert.equal(r2, 'ok2')
    assert.equal(r1?.name, 'AbortError')
  }

  @Test()
  public async shouldNotBeAbleToCancelAlreadyStartedRateLimiterTask({ assert }: Context) {
    const limiter = RateLimiter.build()
      .store(new MemoryStore({ windowMs: { second: 100 } }))
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
      .store(new MemoryStore({ windowMs: { second: 100 } }))
      .key('request:api-key:/profile')
      .addRule({ type: 'second', limit: 1 })

    let started = false
    const abortController = new AbortController()

    const p = limiter.schedule(
      async signal => {
        started = true

        await this.cancellableSleep(1_000, signal)

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
}
