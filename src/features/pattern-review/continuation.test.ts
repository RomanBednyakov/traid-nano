import { describe, expect, it } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'
import { describeContinuation } from './continuation'

const bar = (time: number, high: number, low: number, close: number) => ({ time: time as UTCTimestamp, high, low, close, open: close })
const reference = bar(1, 95, 85, 90)
const outcome = (bars: ReturnType<typeof bar>[]) => describeContinuation(reference, bars, 110, 80, 100)

describe('fixed inner-level setup lifecycle from the meeting', () => {
  it('cancels on a target touch, not only a break, and never revives on later sweep/return', () => {
    const cancelled = bar(2, 96, 80, 84)
    expect(outcome([cancelled]).state).toBe('cancelled')
    const later = outcome([cancelled, bar(3, 104, 85, 97), bar(4, 112, 70, 90)])
    expect(later.state).toBe('cancelled')
    expect(later.events).toEqual(outcome([cancelled]).events)
    expect(later.bars).toBe(3)
  })
  it('keeps E fixed through a sweep, a later close below E and then lower target', () => {
    const bars = [bar(2, 104, 90, 102), bar(3, 103, 90, 96), bar(4, 96, 80, 85)]
    expect(outcome(bars.slice(0, 1)).state).toBe('swept')
    expect(outcome(bars.slice(0, 2)).state).toBe('returned')
    expect(outcome(bars).state).toBe('target-reached')
    expect(outcome(bars).events).toHaveLength(3)
  })
  it('can observe high above E then closing below E on the same bar, without calling it a trade', () => {
    expect(outcome([bar(2, 104, 90, 97)]).state).toBe('returned')
    expect(outcome([bar(2, 104, 90, 97)]).label).toContain('не подтверждение сделки')
  })
  it('does not guess the intrabar order of a target and sweep/return', () => {
    expect(outcome([bar(2, 104, 79, 97)]).state).toBe('ambiguous')
    expect(outcome([bar(2, 104, 90, 102), bar(3, 99, 79, 90)]).state).toBe('ambiguous')
    expect(outcome([bar(2, 112, 79, 97)]).state).toBe('ambiguous')
  })
  it('invalidates on an external peak break and does not resume', () => {
    const invalidated = bar(2, 111, 85, 105)
    expect(outcome([invalidated, bar(3, 105, 89, 95)]).events).toEqual(outcome([invalidated]).events)
    expect(outcome([invalidated]).state).toBe('invalidated')
  })
  it('does not leak hidden future events', () => {
    expect(outcome([])).toMatchObject({ state: 'waiting', label: 'Продолжение скрыто', events: [] })
    expect(outcome([bar(2, 99, 81, 90)]).state).toBe('waiting')
  })
})
