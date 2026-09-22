import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareHistory } from './data-integrity'
import { detectPatterns } from './pattern-detector'
import type { MarketDataset } from './types'

// Real archived OHLC matching the two labelled levels in the user's AAPL
// screenshot. Its later fall must not override the explicit dominance rule.
// These anchors are a reference fixture, never hard-coded into detection.
const times = {
  a: 1780939800, // 2026-06-08 17:30 UTC
  b: 1782405000, // 2026-06-25 16:30 UTC
  c: 1784295000, // 2026-07-17 13:30 UTC
  d: 1784813400, // 2026-07-23 13:30 UTC
  e: 1784899800, // 2026-07-24 13:30 UTC
  externalBreak: 1785159000,
  returnBelow: 1785418200,
} as const

let dataset: MarketDataset
const index = (time: number) => dataset.candles.findIndex(c => c.time === time)
const bar = (time: number) => dataset.candles[index(time)]

beforeAll(async () => {
  const source = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../../../public/data/market/aapl-1h.json'), 'utf8')) as MarketDataset
  dataset = prepareHistory(source, '1h')
})

describe('AAPL screenshot: July 2026 reference audit', () => {
  it('matches the pictured range, but its depicted main trend is smaller AND shorter', () => {
    expect(bar(times.c).high).toBeCloseTo(334.98, 2)
    expect(bar(times.d).low).toBeCloseTo(319.35, 2)
    const mainHeight = bar(times.a).high - bar(times.b).low
    const counterHeight = bar(times.c).high - bar(times.b).low
    expect(mainHeight).toBeCloseTo(43.65, 2)
    expect(counterHeight).toBeCloseTo(61.23, 2)
    expect(mainHeight).toBeLessThan(counterHeight)
    expect(index(times.b) - index(times.a)).toBe(83)
    expect(index(times.c) - index(times.b)).toBe(102)
  })

  it('does not admit that C/D range as the base pattern, before or after the later fall', () => {
    for (const until of [index(times.e) + 3, index(times.externalBreak), dataset.candles.length]) {
      const patterns = detectPatterns({ ...dataset, candles: dataset.candles.slice(0, until) })
      expect(patterns.some(p => p.range.startTime === times.c && p.formation.startTime === times.d)).toBe(false)
    }
  })

  it('preserves evidence of the subsequent breakout, return and fall separately', () => {
    const after = dataset.candles.slice(index(times.e) + 1)
    expect(after.find(c => c.high > bar(times.c).high)?.time).toBe(times.externalBreak)
    const afterBreak = dataset.candles.slice(index(times.externalBreak))
    expect(afterBreak.find(c => c.close < bar(times.c).high)?.time).toBe(times.returnBelow)
    const throughJuly31 = dataset.candles.filter(c => c.time >= times.returnBelow && c.time < Date.parse('2026-08-01T00:00Z') / 1000)
    expect(Math.min(...throughJuly31.map(c => c.low))).toBeCloseTo(300, 2)
  })
})
