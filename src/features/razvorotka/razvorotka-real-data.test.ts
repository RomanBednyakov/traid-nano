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
  it('does not mistake the lower edge of the broader NVDA 4H range for a false breakout', () => {
    const hourly = history('nvda')
    const fourHour = prepareHistory(hourly, '4h')
    const sourceStart = Date.parse('2026-07-08T17:30:00Z') / 1000
    const breakoutStart = Date.parse('2026-07-27T13:30:00Z') / 1000
    const sourceIndex = fourHour.candles.findIndex(c => c.time === sourceStart)
    const breakoutIndex = fourHour.candles.findIndex(c => c.time === breakoutStart)
    expect(sourceIndex).toBeGreaterThanOrEqual(24)
    expect(breakoutIndex).toBeGreaterThan(sourceIndex)
    const outer = fourHour.candles.slice(sourceIndex - 24, breakoutIndex)
    expect(Math.min(...outer.map(c => c.low))).toBeCloseTo(189.8)
    expect(Math.max(...outer.map(c => c.high))).toBeCloseTo(214.39)

    const matches = detectRazvorotka(fourHour, dailyContext(hourly))
    expect(matches.some(item => item.id === 'nvda-4h-long-1785159000')).toBe(false)
  }, 30000)

  it('does not count a trimmed AAPL wick as extra breakout depth', () => {
    const hourly = history('aapl')
    const higher = fourHourContext(prepareHistory(hourly, '4h'))
    expect(detectRazvorotka(hourly, higher).some(item => item.id === 'aapl-1h-short-1739975400')).toBe(false)
  })

  it('does not mistake the lower edge of the broader BTC 4H range for a long breakout', () => {
    const hourly = history('btc-usd')
    const fourHour = prepareHistory(hourly, '4h')
    expect(detectRazvorotka(fourHour, dailyContext(hourly)).some(item => item.id === 'btc-usd-4h-long-1786636800')).toBe(false)
  })

  it('finds reviewed long consolidations without replacing shorter confirmed cases', () => {
    const hourly = history('ief')
    const higher = fourHourContext(prepareHistory(hourly, '4h'))
    const matches = detectRazvorotka(hourly, higher)
    for (const id of ['ief-1h-long-1705501800', 'ief-1h-short-1732717800']) {
      const match = matches.find(item => item.id === id)
      expect(match?.sourceBars).toBeGreaterThan(96)
      expect(match?.uncertainties).toContain('Длинная консолидация: границы и контекст требуют ручной сверки')
    }
  })

  it('does not join the two ETH breakout attempts around 30 December 2024', () => {
    const hourly = history('eth-usd')
    const higher = fourHourContext(prepareHistory(hourly, '4h'))
    const reviewedTime = Date.parse('2024-12-30T14:00:00Z') / 1000
    const nearby = detectRazvorotka(hourly, higher).filter(item =>
      item.direction === 'short' && Math.abs(item.detectedTime - reviewedTime) <= 3600)
    expect(nearby).toHaveLength(0)
  })

  it('rejects the AAPL long whose false breakout starts after an opposing opening gap', () => {
    const hourly = history('aapl')
    const higher = fourHourContext(prepareHistory(hourly, '4h'))
    const breakoutTime = Date.parse('2025-06-13T13:30:00Z') / 1000
    const breakoutIndex = hourly.candles.findIndex(c => c.time === breakoutTime)
    expect(breakoutIndex).toBeGreaterThan(0)
    const previous = hourly.candles[breakoutIndex - 1]
    const breakout = hourly.candles[breakoutIndex]
    expect(breakout.time - previous.time).toBeGreaterThan(3600)
    expect(breakout.open).toBeGreaterThan(previous.high)

    const reviewedTime = Date.parse('2025-06-30T18:30:00Z') / 1000
    const nearby = detectRazvorotka(hourly, higher).filter(item =>
      item.direction === 'long' && Math.abs(item.detectedTime - reviewedTime) <= 3600)
    expect(nearby).toHaveLength(0)
  })

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
          const sourceBars = dataset.candles.filter(c => c.time >= match.source.start && c.time <= match.source.end)
          const rawHigh = Math.max(...sourceBars.map(c => c.high))
          const rawLow = Math.min(...sourceBars.map(c => c.low))
          const apex = match.direction === 'short' ? match.breakout.high : match.breakout.low
          const rawDepth = (match.direction === 'short' ? apex - rawHigh : rawLow - apex) / (rawHigh - rawLow) * 100
          expect(rawDepth).toBeGreaterThanOrEqual(15)
          expect(match.breakoutDepthPercent).toBeCloseTo(rawDepth, 6)
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
