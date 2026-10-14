import { describe, expect, it } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'

import type { MarketDataset } from '@/features/pattern-review/types'

import { dailyContext, detectRazvorotka, fourHourContext } from './razvorotka-detector'

type Candle = MarketDataset['candles'][number]
const start = Date.parse('2026-01-01T00:00:00Z') / 1000

function bar(index: number, open: number, high: number, low: number, close: number): Candle {
  return { time: (start + index * 3600) as UTCTimestamp, open, high, low, close }
}

function dataset(candles: Candle[], category: MarketDataset['category'] = 'crypto'): MarketDataset {
  return { symbol: 'TEST', slug: 'test', name: 'Test', category, currency: 'USD', exchange: 'test', interval: '1h', adjusted: true, source: 'test', fetchedAt: '2026-02-01T00:00:00Z', candles }
}

function shortSetup() {
  const candles: Candle[] = []
  for (let i = 0; i < 24; i++) {
    const value = 160 - i * 2
    candles.push(bar(i, value + 0.5, value + 1, value - 1, value))
  }
  for (let i = 24; i < 36; i++) {
    const close = i % 2 ? 106 : 104
    candles.push(bar(i, close, i % 3 === 0 ? 110 : 108, i % 3 === 1 ? 100 : 102, close))
  }
  candles.push(bar(36, 110, 112, 109, 111))
  candles.push(bar(37, 111, 113, 110, 112))
  candles.push(bar(38, 112, 112, 105, 107))
  candles.push(bar(39, 107, 108, 100.5, 101))
  return candles
}

function singleUncoveredWickSetup() {
  const candles = shortSetup()
  for (let i = 24; i < 36; i++) {
    candles[i] = i % 2 === 0
      ? bar(i, 106, 110, 105, 106)
      : bar(i, 104, 108, 103, 104)
  }
  candles[25] = bar(25, 104, 108, 100, 104)
  candles[39] = bar(39, 107, 108, 102.8, 103.5)
  return candles
}

describe('Разворотка detector', () => {
  it('marks short only when Phase 3 completes and keeps later bars separate', () => {
    const candles = shortSetup()
    expect(detectRazvorotka(dataset(candles.slice(0, 39)), [])).toHaveLength(0)
    const result = detectRazvorotka(dataset(candles), [])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ direction: 'short', sourceBars: 12, holdBars: 2 })
    expect(result[0].detectedTime).toBe(candles[39].time)
    expect(result[0].breakoutDepthPercent).toBeGreaterThanOrEqual(15)
    expect(result[0].coveragePercent).toBeGreaterThanOrEqual(90)
    const extended = detectRazvorotka(dataset([...candles, bar(40, 101, 102, 95, 96)]), [])
    expect(extended[0].id).toBe(result[0].id)
    expect(extended[0].detectedTime).toBe(result[0].detectedTime)
    expect(result[0].futureCandles).toHaveLength(0)
    expect(extended[0].futureCandles).toHaveLength(1)
    const continuation = Array.from({ length: 100 }, (_, i) => bar(40 + i, 96, 97, 95, 96))
    const longHistory = detectRazvorotka(dataset([...candles, ...continuation]), [])
    expect(longHistory.find(item => item.id === result[0].id)?.futureCandles).toHaveLength(100)
  })

  it('starts Phase 3 after a deep crossing wick and rejects a repeated breakout', () => {
    const continuous = shortSetup()
    continuous[39] = bar(39, 107, 108, 105, 109)
    continuous.push(bar(40, 109, 109.5, 100.5, 101))
    const result = detectRazvorotka(dataset(continuous), [])
    expect(result).toHaveLength(1)
    expect(result[0].breakout.end).toBe(continuous[38].time)
    expect(result[0].cancellation.start).toBe(continuous[39].time)
    expect(result[0].detectedTime).toBe(continuous[40].time)

    const repeated = shortSetup()
    repeated[39] = bar(39, 111, 113, 109, 112)
    repeated.push(bar(40, 112, 112, 105, 107))
    repeated.push(bar(41, 107, 108, 100.5, 101))
    expect(detectRazvorotka(dataset(repeated), [])).toHaveLength(0)
    const mirrored = repeated.map(c => ({ ...c, open: 300 - c.open, close: 300 - c.close,
      high: 300 - c.low, low: 300 - c.high }))
    expect(detectRazvorotka(dataset(mirrored), [])).toHaveLength(0)
  })

  it('resets an unconfirmed false breakout after a deep return', () => {
    const candles = shortSetup()
    candles[36] = bar(36, 110, 112, 102, 103)
    candles[37] = bar(37, 110, 112, 109, 111)
    candles[38] = bar(38, 111, 113, 110, 112)
    candles[39] = bar(39, 112, 112, 105, 107)
    candles.push(bar(40, 107, 108, 100.5, 101))
    expect(detectRazvorotka(dataset(candles), [])).toHaveLength(0)
  })

  it('keeps a longer preceding move visible before the source range', () => {
    const leadIn = Array.from({ length: 160 }, (_, i) => {
      const value = 500 - i * 2.12
      return bar(i, value + 0.5, value + 1, value - 1, value)
    })
    const formation = shortSetup().map(c => ({ ...c, time: (c.time + 160 * 3600) as UTCTimestamp }))
    const result = detectRazvorotka(dataset([...leadIn, ...formation]), [])
    expect(result).toHaveLength(1)
    expect(result[0].candles.filter(c => c.time < result[0].source.start)).toHaveLength(160)
  })

  it('finds the mirror long setup', () => {
    const mirrored = shortSetup().map(c => ({ ...c, open: 300 - c.open, close: 300 - c.close, high: 300 - c.low, low: 300 - c.high }))
    const result = detectRazvorotka(dataset(mirrored), [])
    expect(result).toHaveLength(1)
    expect(result[0].direction).toBe('long')
    expect(result[0].stop).toBeLessThan(result[0].source.low)
  })

  it('rejects a repeatedly tested outer edge on either side while preserving a two-touch breakout', () => {
    const setup = (threeDays: boolean) => {
      const original = shortSetup()
      const lead = original.slice(0, 24)
      const prior = Array.from({ length: 24 }, (_, i) => {
        const close = 109 - i * 0.25
        const thirdTouch = i === 17 && threeDays
        const high = i === 11 || i === 23 || thirdTouch ? 113 : Math.min(close + 1, 110)
        return bar(24 + i, close + 0.2, high, close - 1, close)
      })
      return [...lead, ...prior, ...original.slice(24)].map((c, i) => ({
        ...c, time: (start + i * 14400) as UTCTimestamp,
      }))
    }
    const scan = (candles: Candle[]) => detectRazvorotka({ ...dataset(candles), interval: '4h' }, [])
    const mirror = (candles: Candle[]) => candles.map(c => ({ ...c,
      open: 300 - c.open, close: 300 - c.close, high: 300 - c.low, low: 300 - c.high,
    }))
    const twoTouches = setup(false)
    const threeTouches = setup(true)
    const marker = twoTouches.at(-1)!.time
    expect(scan(twoTouches).some(item => item.direction === 'short' && item.detectedTime === marker)).toBe(true)
    expect(scan(threeTouches).some(item => item.direction === 'short' && item.detectedTime === marker)).toBe(false)
    expect(scan(mirror(twoTouches)).some(item => item.direction === 'long' && item.detectedTime === marker)).toBe(true)
    expect(scan(mirror(threeTouches)).some(item => item.direction === 'long' && item.detectedTime === marker)).toBe(false)
  })

  it('marks a single uncovered source wick as a weakened short or long, preserving raw coverage', () => {
    const candles = singleUncoveredWickSetup()
    const short = detectRazvorotka(dataset(candles), [])
    expect(short).toHaveLength(1)
    expect(short[0]).toMatchObject({ direction: 'short', detectedTime: candles[39].time,
      sourceBars: 12, cancellationException: 'single_uncovered_source_wick' })
    expect(short[0].coveragePercent).toBeCloseTo(72)
    expect(short[0].context).not.toContain('Отмена ≥ 90%')
    expect(short[0].uncertainties).toContain('Ослабленный сигнал: тело консолидации перекрыто, но один фитиль не перекрыт')

    const mirrored = candles.map(c => ({ ...c, open: 300 - c.open, close: 300 - c.close,
      high: 300 - c.low, low: 300 - c.high }))
    const long = detectRazvorotka(dataset(mirrored), [])
    expect(long).toHaveLength(1)
    expect(long[0]).toMatchObject({ direction: 'long', detectedTime: candles[39].time,
      sourceBars: 12, cancellationException: 'single_uncovered_source_wick' })
    expect(long[0].coveragePercent).toBeCloseTo(72)
  })

  it('rejects two uncovered source wicks even when every source body is covered', () => {
    const candles = singleUncoveredWickSetup()
    candles[27] = bar(27, 104, 108, 100.5, 104)
    expect(detectRazvorotka(dataset(candles), [])).toHaveLength(0)
    const mirrored = candles.map(c => ({ ...c, open: 300 - c.open, close: 300 - c.close,
      high: 300 - c.low, low: 300 - c.high }))
    expect(detectRazvorotka(dataset(mirrored), [])).toHaveLength(0)
  })

  it('accepts a trimmed source as a regular cancellation when its original wick is also covered by 90%', () => {
    const candles = singleUncoveredWickSetup()
    candles[39] = bar(39, 107, 108, 100.5, 103.5)
    const short = detectRazvorotka(dataset(candles), [])
    expect(short).toHaveLength(1)
    expect(short[0].coveragePercent).toBeCloseTo(95)
    expect(short[0].cancellationException).toBeUndefined()

    const mirrored = candles.map(c => ({ ...c, open: 300 - c.open, close: 300 - c.close,
      high: 300 - c.low, low: 300 - c.high }))
    const long = detectRazvorotka(dataset(mirrored), [])
    expect(long).toHaveLength(1)
    expect(long[0].coveragePercent).toBeCloseTo(95)
    expect(long[0].cancellationException).toBeUndefined()
  })

  it('accepts the exact 15% breakout and 90% cancellation boundaries', () => {
    const candles = shortSetup()
    candles[36] = bar(36, 110, 111.5, 109, 110.8)
    candles[37] = bar(37, 110.8, 111.5, 110.1, 111)
    candles[38] = bar(38, 111, 111.4, 105, 107)
    candles[39] = bar(39, 107, 108, 101, 101.5)
    const result = detectRazvorotka(dataset(candles), [])
    expect(result).toHaveLength(1)
    expect(result[0].breakoutDepthPercent).toBe(15)
    expect(result[0].coveragePercent).toBe(90)
  })

  it('rejects short source, shallow breakout, weak hold and incomplete cancellation', () => {
    const shortSource = shortSetup().filter((_, i) => i !== 25).map((c, i) => ({ ...c, time: (start + i * 3600) as UTCTimestamp }))
    expect(detectRazvorotka(dataset(shortSource), [])).toHaveLength(0)

    const shallow = shortSetup()
    shallow[36] = bar(36, 110, 111.3, 109, 110.6)
    shallow[37] = bar(37, 110.6, 111.4, 110.1, 110.8)
    shallow[38] = bar(38, 110.8, 111.4, 105, 107)
    expect(detectRazvorotka(dataset(shallow), [])).toHaveLength(0)

    const oneClose = shortSetup()
    oneClose[37] = bar(37, 111, 112, 108, 109)
    expect(detectRazvorotka(dataset(oneClose), [])).toHaveLength(0)

    const noCancellation = shortSetup()
    noCancellation[39] = bar(39, 107, 108, 101.2, 102)
    expect(detectRazvorotka(dataset(noCancellation), [])).toHaveLength(0)

    const poorRiskReward = shortSetup()
    poorRiskReward[36] = bar(36, 110, 116, 109, 111)
    poorRiskReward[37] = bar(37, 111, 116, 110, 112)
    expect(detectRazvorotka(dataset(poorRiskReward), [])).toHaveLength(0)
  })

  it('rejects a clearly opposing higher-timeframe trend', () => {
    const candles = shortSetup()
    const higher = Array.from({ length: 16 }, (_, i) => ({ time: (start - (16 - i) * 14400) as UTCTimestamp, availableAt: start - (15 - i) * 14400, open: 100 + i * 3, close: 102 + i * 3, high: 104 + i * 3, low: 99 + i * 3 }))
    expect(detectRazvorotka(dataset(candles), higher)).toHaveLength(0)
  })

  it('rejects a preceding flat range instead of calling it a trend', () => {
    const flat = shortSetup()
    for (let i = 0; i < 24; i++) flat[i] = bar(i, 115, 118, 112, 115)
    expect(detectRazvorotka(dataset(flat), [])).toHaveLength(0)
  })

  it('does not inspect a higher-timeframe candle before it closes', () => {
    const candles = shortSetup()
    const unclosed = Array.from({ length: 16 }, (_, i) => ({ time: (start - (16 - i) * 14400) as UTCTimestamp, availableAt: start + 25 * 3600, open: 100 + i * 3, close: 102 + i * 3, high: 104 + i * 3, low: 99 + i * 3 }))
    expect(detectRazvorotka(dataset(candles), unclosed)).toHaveLength(1)
  })

  it('rejects an opening gap against the false breakout and never joins a data break', () => {
    const gap = shortSetup()
    gap[36] = bar(36, 101, 112, 100.5, 111)
    gap[37] = bar(37, 111, 113, 110, 112)
    gap[38] = bar(38, 112, 113, 110.5, 112.5)
    gap[39] = bar(39, 112.5, 112.5, 105, 107)
    gap.push(bar(40, 107, 108, 100.5, 101))
    for (let i = 36; i < gap.length; i++) gap[i].time = (gap[i].time + 48 * 3600) as UTCTimestamp

    // A true session gap below the previous low opposes the short breakout.
    expect(gap[36].open).toBeLessThan(gap[35].low)
    expect(detectRazvorotka(dataset(gap), [])).toHaveLength(0)

    // Opening inside the previous candle's range is a valid, overlapping
    // session open even if it is below the previous close.
    const overlapping = gap.map(c => ({ ...c }))
    overlapping[36] = { ...overlapping[36], open: 103, low: 102.5 }
    expect(overlapping[36].open).toBeGreaterThan(overlapping[35].low)
    expect(overlapping[36].open).toBeLessThan(overlapping[35].high)
    expect(detectRazvorotka(dataset(overlapping), [])).toHaveLength(1)

    // A sub-tick rounding difference is not a meaningful non-overlapping gap.
    const rounded = gap.map(c => ({ ...c }))
    rounded[36] = { ...rounded[36], open: 101.995, low: 101.5 }
    expect(detectRazvorotka(dataset(rounded), [])).toHaveLength(1)

    const mirror = (candles: Candle[]) => candles.map(c => ({ ...c,
      open: 300 - c.open, close: 300 - c.close, high: 300 - c.low, low: 300 - c.high,
    }))
    expect(detectRazvorotka(dataset(mirror(gap)), [])).toHaveLength(0)
    expect(detectRazvorotka(dataset(mirror(overlapping)), [])).toHaveLength(1)

    const broken = dataset(shortSetup())
    broken.quality = { sourceBars: 40, excludedHourlyBars: 0, droppedBuckets: 0, breakBeforeTimes: [broken.candles[37].time], aggregation: 'test', calendarVerified: false }
    expect(detectRazvorotka(broken, [])).toHaveLength(0)
  })

  it('builds daily context only from complete crypto days', () => {
    const candles = Array.from({ length: 30 }, (_, i) => bar(i, 100, 102, 99, 101))
    expect(dailyContext(dataset(candles))).toHaveLength(1)
    expect(dailyContext(dataset(candles))[0].availableAt).toBe(start + 24 * 3600)
  })

  it('uses the actual New York close for the shorter last 4H stock bar', () => {
    const first = Date.parse('2026-01-09T14:30:00Z') / 1000
    const second = Date.parse('2026-01-09T18:30:00Z') / 1000
    const data = dataset([bar(0, 100, 102, 99, 101), bar(1, 100, 102, 99, 101)], 'stocks')
    data.interval = '4h'
    data.candles = [first, second].map((time, i) => ({ ...data.candles[i], time: time as UTCTimestamp }))
    expect(fourHourContext(data).map(c => c.availableAt)).toEqual([first + 14400, second + 9000])
  })
})
