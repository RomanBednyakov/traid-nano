import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { prepareHistory } from '@/features/pattern-review/data-integrity'
import type { MarketDataset } from '@/features/pattern-review/types'

import { dailyContext, detectRazvorotka, fourHourContext } from './razvorotka-detector'

function history(slug: string) {
  const raw = JSON.parse(readFileSync(`public/data/market/${slug}-1h.json`, 'utf8')) as MarketDataset
  return prepareHistory(raw, '1h')
}

describe('Разворотка on saved market history', () => {
  it('scans both timeframes without crossing data breaks or using future bars for detection', () => {
    let found = 0
    const directions = new Set<string>()
    const ids = new Set<string>()
    for (const slug of ['aapl', 'msft', 'nvda', 'gc-f', 'gld', 'tlt', 'ief', 'btc-usd', 'eth-usd']) {
      const hourly = history(slug)
      const fourHour = prepareHistory(hourly, '4h')
      for (const [dataset, higher] of [[hourly, fourHourContext(fourHour)], [fourHour, dailyContext(hourly)]] as const) {
        const matches = detectRazvorotka(dataset, higher)
        found += matches.length
        for (const match of matches) {
          ids.add(match.id)
          directions.add(match.direction)
          expect(match.source.start).toBeLessThan(match.breakout.start)
          expect(match.breakout.start).toBeLessThan(match.cancellation.start)
          expect(match.cancellation.start).toBeLessThanOrEqual(match.detectedTime)
          expect(match.candles.at(-1)?.time).toBe(match.detectedTime)
          expect(match.futureCandles.every(c => c.time > match.detectedTime)).toBe(true)
          expect(match.sourceBars).toBeGreaterThanOrEqual(12)
          expect(match.holdBars).toBeGreaterThanOrEqual(2)
          expect(match.breakoutDepthPercent).toBeGreaterThanOrEqual(15)
          if (match.cancellationException === 'single_uncovered_source_wick') {
            expect(match.coveragePercent).toBeLessThan(90)
            const source = dataset.candles.filter(c => c.time >= match.source.start && c.time <= match.source.end)
            const completion = dataset.candles.find(c => c.time === match.detectedTime)!
            if (match.direction === 'short') {
              expect(source.filter(c => c.low < completion.low)).toHaveLength(1)
              expect(source.every(c => Math.min(c.open, c.close) >= completion.low)).toBe(true)
            } else {
              expect(source.filter(c => c.high > completion.high)).toHaveLength(1)
              expect(source.every(c => Math.max(c.open, c.close) <= completion.high)).toBe(true)
            }
          } else {
            expect(match.coveragePercent).toBeGreaterThanOrEqual(90)
          }
          expect(match.riskReward).toBeGreaterThanOrEqual(2)
        }
        console.info(`${slug} ${dataset.interval}: ${matches.length} candidates`)
      }
    }
    expect(found).toBeGreaterThan(0)
    expect(directions).toEqual(new Set(['short', 'long']))
    // These four visually reviewed structures have a preceding move against
    // the proposed signal on both medium and long windows.
    for (const id of [
      'aapl-4h-short-1739975400', 'btc-usd-4h-long-1756468800',
      'gc-f-4h-short-1749772800', 'gld-1h-short-1746538200',
    ]) expect(ids.has(id)).toBe(false)
  }, 30000)
})
