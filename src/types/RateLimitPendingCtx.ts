export type RateLimitPendingCtx = {
  reason: 'rate_limit' | 'cooldown' | 'concurrency'
  delay: number
  key: string
  targetId?: string
  attempt?: number
  queued: number
  active: number
  nextWakeUpAt: number
}
