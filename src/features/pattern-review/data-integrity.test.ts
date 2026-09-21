import { describe, expect, it } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'
import { prepareHistory } from './data-integrity'
import type { MarketDataset } from './types'

function raw(times: number[], stocks = false): MarketDataset {
  return { symbol: stocks ? 'AAPL' : 'BTC-USD', slug: 'test', name: 'test', category: stocks ? 'stocks' : 'crypto', currency: 'USD', exchange: 'test', interval: '1h', adjusted: false, source: 'test', fetchedAt: '2026-01-10T12:30:00Z', candles: times.map(time => ({ time: time as UTCTimestamp, open: 100, high: 102, low: 99, close: 101 })) }
}
const at = (s: string) => Date.parse(s) / 1000

describe('historical data preparation', () => {
  it('excludes live crypto bars and trailing quote timestamps', () => {
    const d = raw([at('2026-01-10T11:00Z'), at('2026-01-10T12:00Z'), at('2026-01-10T12:29:37Z')])
    expect(prepareHistory(d, '1h').candles).toHaveLength(1)
    expect(prepareHistory(d, '1h').quality?.excludedHourlyBars).toBe(2)
  })
  it('never groups four records across a missing hour', () => {
    const start = at('2026-01-09T00:00Z')
    const d = raw([0, 1, 3, 4, 5, 6, 7].map(h => start + h * 3600))
    const prepared = prepareHistory(d, '4h')
    expect(prepared.candles.map(c => c.time)).toEqual([start + 4 * 3600])
    expect(prepared.quality?.droppedBuckets).toBe(1)
    expect(prepareHistory(d, '1h').quality?.breakBeforeTimes).toEqual([start + 3 * 3600])
  })
  it('uses NY session boundaries, including the shorter final block', () => {
    const start = at('2026-01-09T14:30Z')
    const d = raw([0, 1, 2, 3, 4, 5, 6, 6.5].map(h => start + h * 3600), true)
    const prepared = prepareHistory(d, '4h')
    expect(prepared.candles.map(c => c.time)).toEqual([start, start + 4 * 3600])
    expect(prepared.quality?.excludedHourlyBars).toBe(1)
  })
  it('rejects duplicate timestamps and malformed OHLC', () => {
    const time = at('2026-01-09T00:00Z')
    expect(() => prepareHistory(raw([time, time]), '1h')).toThrow()
    const d = raw([time]); d.candles[0].high = 90
    expect(() => prepareHistory(d, '1h')).toThrow()
  })
})
