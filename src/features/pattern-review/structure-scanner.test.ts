import { describe, expect, it } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'
import { confirmedPivots, fibonacciCeiling, scanStructures } from './structure-scanner'
import { detectPatterns } from './pattern-detector'
import type { MarketDataset } from './types'

// Synthetic geometry for unit tests only; never served as market history.
function candles(points: [number, number][]) {
  const result: MarketDataset['candles'] = []
  for (let i = 0; i <= points.at(-1)![0]; i++) {
    const right = points.findIndex(([index]) => index >= i)
    const [end, price] = points[right]
    const [start, previous] = points[Math.max(0, right - 1)]
    const p = end === start ? price : previous + (price - previous) * (i - start) / (end - start)
    result.push({ time: (1_700_000_000 + i * 3600) as UTCTimestamp, open: p - 0.02, close: p + 0.02, high: p + 0.05, low: p - 0.05 })
  }
  return result
}
const reference: [number, number][] = [[0, 820], [4, 840], [44, 728], [60, 770], [72, 735.4], [86, 760], [92, 748]]
const dataset = (bars: MarketDataset['candles']): MarketDataset => ({ symbol: 'TEST', slug: 'test', name: 'Geometry fixture', category: 'stocks', currency: 'USD', exchange: 'test', interval: '1h', adjusted: false, source: 'synthetic unit test', fetchedAt: '', candles: bars })

describe('customer reference structure (not a profitability test)', () => {
  it('places 0.236 down from the upper boundary, consistent with screenshot 3', () => {
    expect(fibonacciCeiling(770, 735.4)).toBeCloseTo(761.8344, 4)
    expect(760).toBeLessThan(fibonacciCeiling(770, 735.4))
  })

  it('recognizes the full A-B-C-D-E structure before a range break', () => {
    const signals = scanStructures(candles(reference), [2])
    expect(signals).toHaveLength(1)
    const s = signals[0]
    expect([s.trendStart.index, s.trendLow.index, s.outerHigh.index, s.rangeLow.index, s.innerHigh.index, s.detectedAt]).toEqual([4, 44, 60, 72, 86, 88])
  })

  it('does not call the first bars at the bottom a formation', () => {
    expect(scanStructures(candles(reference).slice(0, 76), [2])).toEqual([])
    expect(scanStructures(candles(reference).slice(0, 88), [2])).toEqual([])
  })

  it('rejects an inner peak above the Fibonacci ceiling', () => {
    expect(scanStructures(candles(reference.map(([i, p]) => [i, i === 86 ? 765 : p])), [2])).toEqual([])
  })

  it('requires the main trend to be both higher and longer', () => {
    expect(scanStructures(candles(reference.map(([i, p]) => [i, i === 4 ? 760 : i === 0 ? 750 : p])), [2])).toEqual([])
    const shortMain: [number, number][] = [[0, 820], [4, 840], [14, 728], [40, 770], [52, 735.4], [66, 760], [72, 748]]
    expect(scanStructures(candles(shortMain), [2])).toEqual([])
  })

  it('rejects a lower boundary break before the peak can be confirmed', () => {
    const bars = candles(reference)
    bars[88] = { ...bars[88], low: 730, close: 734 }
    expect(scanStructures(bars, [2])).toEqual([])
  })

  it('deduplicates repeated internal peaks by the same fixed range', () => {
    const points: [number, number][] = [...reference, [98, 758], [104, 746]]
    const signals = scanStructures(candles(points))
    expect(signals.filter(s => s.outerHigh.index === 60 && s.rangeLow.index === 72)).toHaveLength(1)
  })

  it('allows intermediate swings within the countertrend and orange structure', () => {
    const complex: [number, number][] = [[0, 820], [4, 840], [44, 728], [51, 752], [55, 745], [64, 770], [78, 735.4], [84, 747], [88, 740], [98, 760], [104, 750]]
    const signals = scanStructures(candles(complex), [2])
    expect(signals.some(s => s.trendLow.index === 44 && s.outerHigh.index === 64 && s.rangeLow.index === 78)).toBe(true)
  })

  it('never exposes an unconfirmed pivot', () => {
    for (let length = 10; length <= 93; length++) {
      const pivots = confirmedPivots(candles(reference).slice(0, length), 2)
      expect(pivots.every(p => p.confirmedAt < length && p.confirmedAt === p.index + 2)).toBe(true)
    }
  })

  it('does not connect a pattern or outcome across a known data gap', () => {
    const bars = candles([...reference, [100, 780], [115, 700]])
    const source = dataset(bars)
    source.quality = { sourceBars: bars.length, excludedHourlyBars: 0, droppedBuckets: 0, breakBeforeTimes: [bars[70].time], aggregation: 'test', calendarVerified: true }
    expect(detectPatterns(source).some(p => p.structure.indices[2] === 60)).toBe(false)
    source.quality.breakBeforeTimes = [bars[96].time]
    const found = detectPatterns(source).find(p => p.structure.indices[2] === 60)!
    expect(found).toBeDefined()
    expect(found.futureCandles.at(-1)?.time).toBe(bars[95].time)
  })

  it('has identical detection on every historical prefix and arbitrary futures', () => {
    const bars = candles([...reference, [100, 780], [115, 700]])
    const all = scanStructures(bars)
    for (let length = 70; length <= bars.length; length++) {
      expect(scanStructures(bars.slice(0, length))).toEqual(all.filter(s => s.detectedAt < length))
    }
    const signal = detectPatterns(dataset(bars)).find(p => p.structure.indices[2] === 60)!
    expect(signal).toBeDefined()
    const prefix = detectPatterns(dataset(bars.slice(0, signal.structure.indices[5] + 1))).find(p => p.id === signal.id)!
    expect(prefix.structure).toEqual(signal.structure)
    expect(prefix.candles).toEqual(signal.candles)
    expect(prefix.futureCandles).toEqual([])
    expect(signal.futureCandles.length).toBeGreaterThan(0)
  })
})
