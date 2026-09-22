import { describe, expect, it } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'
import { confirmedPivots, fibonacciCeiling, scanStructures, scanStructureStages } from './structure-scanner'
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

  it('retains the higher inner peak after an early smaller bump (reference images 1, 3 and 6)', () => {
    // Approximate geometry manually read from the screenshots. These are NOT
    // recovered market candles; exact historical recall needs ticker/timeframe/date.
    const references: { points: [number, number][]; c: number; d: number; early: number; mature: number }[] = [
      { points: [[0,750],[17,770],[55,690],[71,710],[88,675],[110,700],[137,554],[148,630],[174,527],[194,556],[218,507],[248,583],[254,545],[285,667],[297,640],[310,694.2],[327,587.8],[334,631],[337,620],[343,655],[350,610],[365,593]], c:310,d:327,early:334,mature:343 },
      { points: [[0,5480],[14,5588],[22,5530],[29,5410],[37,5515],[38,5235],[53,5280],[56,5190],[64,5240],[82,5048],[105,5295.5],[128,5097.5],[144,5145],[147,5101],[153,5238],[157,5180],[162,5230],[170,5120]], c:105,d:128,early:144,mature:153 },
      { points: [[0,1028],[7,1048],[12,1038],[15,1045],[25,983],[30,989],[35,930],[42,931],[49,898],[56,936],[60,929],[64,958],[71,941],[78,970],[85,915],[89,933],[92,921],[98,946],[105,937],[112,932],[117,919]], c:78,d:85,early:89,mature:98 },
    ]
    for (const { points, c, d, early, mature } of references) {
      const bars = candles(points)
      const stages = scanStructureStages(bars).find(stages => stages[0].outerHigh.index === c && stages[0].rangeLow.index === d)!
      expect(stages.map(s => s.innerHigh.index)).toEqual([early, mature])
      // The earlier observation is immutable; later geometry only exists once
      // its own right-hand confirming bars have closed.
      for (let length = early + 1; length <= bars.length; length++) {
        const prefix = scanStructureStages(bars.slice(0, length)).find(stages => stages[0].outerHigh.index === c && stages[0].rangeLow.index === d) ?? []
        expect(prefix).toEqual(stages.filter(s => s.detectedAt < length))
      }
      const [first] = detectPatterns(dataset(bars)).filter(p => p.structure.indices[2] === c && p.structure.indices[3] === d)
      expect(first.structure.indices[4]).toBe(early)
      expect(first.revisions?.map(p => p.structure.indices[4])).toEqual([mature])
      expect(first.revisions?.[0].candles.at(-1)?.time).toBe(first.revisions?.[0].structure.detectedTime)
    }
  })

  it('does not add a stage after a range break or above the Fibonacci ceiling', () => {
    const broken = candles([...reference, [95,730], [102,761], [110,745]])
    const tooHigh = candles([...reference, [102,768], [110,745]])
    for (const bars of [broken, tooHigh]) {
      const stages = scanStructureStages(bars).find(stages => stages[0].outerHigh.index === 60 && stages[0].rangeLow.index === 72)!
      expect(stages).toHaveLength(1)
    }
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
