import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { prepareHistory } from '@/features/pattern-review/data-integrity'
import type { MarketDataset } from '@/features/pattern-review/types'

import { detectRazvorotka, fourHourContext, type RazvorotkaCase } from './razvorotka-detector'

const reviewed = [
  { number: 1, slug: 'nvda', date: '2026-08-04T18:30:00Z', direction: 'long', accepted: false },
  { number: 2, slug: 'btc-usd', date: '2026-07-31T13:00:00Z', direction: 'short', accepted: true },
  { number: 3, slug: 'eth-usd', date: '2026-07-06T16:00:00Z', direction: 'long', accepted: false },
  { number: 4, slug: 'btc-usd', date: '2026-07-01T21:00:00Z', direction: 'long', accepted: false },
  { number: 5, slug: 'eth-usd', date: '2026-06-23T06:00:00Z', direction: 'short', accepted: true },
  { number: 6, slug: 'btc-usd', date: '2026-05-01T12:00:00Z', direction: 'long', accepted: false },
  { number: 7, slug: 'aapl', date: '2026-04-07T14:30:00Z', direction: 'short', accepted: false },
  { number: 8, slug: 'eth-usd', date: '2026-04-02T13:00:00Z', direction: 'short', accepted: false },
  { number: 9, slug: 'nvda', date: '2026-03-20T13:30:00Z', direction: 'short', accepted: false },
  { number: 10, slug: 'gld', date: '2026-03-13T14:30:00Z', direction: 'short', accepted: true },
] as const

const histories = new Map<string, MarketDataset>()
const found = new Map<string, RazvorotkaCase[]>()
const at = (date: string) => Date.parse(date) / 1000

function history(slug: string) {
  let hourly = histories.get(slug)
  if (!hourly) {
    const raw = JSON.parse(readFileSync(`public/data/market/${slug}-1h.json`, 'utf8')) as MarketDataset
    hourly = prepareHistory(raw, '1h')
    histories.set(slug, hourly)
  }
  return hourly
}

function matches(slug: string) {
  let cases = found.get(slug)
  if (!cases) {
    const hourly = history(slug)
    cases = detectRazvorotka(hourly, fourHourContext(prepareHistory(hourly, '4h')))
    found.set(slug, cases)
  }
  return cases
}

describe('Customer review of the first ten Razvorotka cases', () => {
  it.each(reviewed)('example $number: $slug $direction', ({ number, slug, date, direction, accepted }) => {
    const time = at(date)
    const nearby = matches(slug).filter(item => item.direction === direction && Math.abs(item.detectedTime - time) <= 3600)
    if (!accepted) {
      expect(nearby).toHaveLength(0)
      return
    }

    const match = nearby.find(item => item.detectedTime === time)
    expect(match).toBeDefined()
    if (!match) return
    expect(match.direction).toBe(direction)
    expect(match.holdBars).toBeGreaterThanOrEqual(2)
    expect(match.breakoutDepthPercent).toBeGreaterThanOrEqual(15)
    expect(match.coveragePercent).toBeGreaterThanOrEqual(90)
    const hourly = history(slug)
    const cancellation = hourly.candles.filter(c => c.time >= match.cancellation.start && c.time <= match.cancellation.end)
    expect(cancellation.length).toBeLessThanOrEqual(match.sourceBars)
    for (const candle of cancellation) {
      if (direction === 'short') expect(candle.high).toBeLessThanOrEqual(match.source.high)
      else expect(candle.low).toBeGreaterThanOrEqual(match.source.low)
    }

    if (number === 2) {
      expect(match.breakout.end).toBe(at('2026-07-31T01:00:00Z'))
      expect(match.breakout.high).toBeGreaterThan(65300)
      expect(match.cancellation.start).toBe(at('2026-07-31T02:00:00Z'))
    }
    if (number === 5) {
      expect(match.source.start).toBe(at('2026-06-18T19:00:00Z'))
      expect(match.source.end).toBe(at('2026-06-22T10:00:00Z'))
      expect(match.breakout.start).toBe(at('2026-06-22T11:00:00Z'))
      expect(match.breakout.high).toBeGreaterThan(1777)
      expect(match.cancellation.start).toBe(at('2026-06-22T18:00:00Z'))
    }
    if (number === 10) expect(match.source.start).toBe(at('2026-03-03T16:30:00Z'))
  }, 30000)

  it('keeps the corrected BTC signal unchanged when later candles are appended', () => {
    const hourly = history('btc-usd')
    const time = at('2026-07-31T13:00:00Z')
    const original = matches('btc-usd').find(item => item.detectedTime === time)
    const truncated = { ...hourly, candles: hourly.candles.filter(c => c.time <= time) }
    const earlier = detectRazvorotka(truncated, fourHourContext(prepareHistory(truncated, '4h')))
      .find(item => item.detectedTime === time)
    expect(earlier).toMatchObject({ id: original?.id, source: original?.source, breakout: original?.breakout, cancellation: original?.cancellation })
  }, 30000)
})
