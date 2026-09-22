import type { MarketDataset } from './types'

type Candle = MarketDataset['candles'][number]
export interface Pivot {
  index: number
  confirmedAt: number
  kind: 'high' | 'low'
  price: number
}

export interface StructureSignal {
  trendStart: Pivot
  trendLow: Pivot
  outerHigh: Pivot
  rangeLow: Pivot
  innerHigh: Pivot
  detectedAt: number
  radius: number
  fibLevel: number
}

// Engineering settings for noise resolution, not additional customer rules.
// Each radius is evaluated independently, using only closed bars up to confirmedAt.
export const scannerSettings = {
  radii: [2, 4, 8, 12],
  fibonacciDepth: 0.236,
  minimumRangeAtr: 3,
  minimumInnerSwingAtr: 1,
} as const

export function fibonacciCeiling(high: number, low: number) {
  return high - (high - low) * scannerSettings.fibonacciDepth
}

export function trueRangeAverage(candles: Candle[]) {
  const result: number[] = []
  const ranges: number[] = []
  let sum = 0
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const previous = candles[i - 1]?.close ?? c.open
    const range = Math.max(c.high - c.low, Math.abs(c.high - previous), Math.abs(c.low - previous))
    ranges.push(range)
    sum += range
    if (i >= 14) sum -= ranges[i - 14]
    result.push(sum / Math.min(i + 1, 14))
  }
  return result
}

// Both-side extrema on one OHLC bar have unknown intrabar order: omit them.
// Plateaus use their last extreme. A pivot is known only radius bars later.
export function confirmedPivots(candles: Candle[], radius: number): Pivot[] {
  const pivots: Pivot[] = []
  for (let i = radius; i + radius < candles.length; i++) {
    let high = true
    let low = true
    for (let j = i - radius; j <= i + radius; j++) {
      if (i === j) continue
      if (candles[j].high > candles[i].high || (j > i && candles[j].high === candles[i].high)) high = false
      if (candles[j].low < candles[i].low || (j > i && candles[j].low === candles[i].low)) low = false
    }
    if (high === low) continue
    pivots.push({ index: i, confirmedAt: i + radius, kind: high ? 'high' : 'low', price: high ? candles[i].high : candles[i].low })
  }
  return pivots
}

function isIntact(candles: Candle[], high: Pivot, low: Pivot, until: number) {
  for (let i = high.index + 1; i <= until; i++) {
    if (candles[i].high > high.price) return false
    if (i > low.index && candles[i].low < low.price) return false
  }
  return true
}

/** Full ordered structure: A down to B, B up to C, C down to D, D up to E.
 * E must turn down and become observable while the C-D range is still intact.
 * No future outcome, fixed candle rectangle, signal quota or timed cooldown.
 */
export function scanStructureStages(candles: Candle[], radii: readonly number[] = scannerSettings.radii): StructureSignal[][] {
  const atr = trueRangeAverage(candles)
  const signals: StructureSignal[] = []
  for (const radius of radii) {
    const swings: Pivot[] = []
    for (const pivot of confirmedPivots(candles, radius)) {
      const previous = swings.at(-1)
      if (previous?.kind === pivot.kind) {
        const moreExtreme = pivot.kind === 'high' ? pivot.price >= previous.price : pivot.price <= previous.price
        if (!moreExtreme) continue
        swings[swings.length - 1] = pivot
      } else swings.push(pivot)
      if (pivot.kind !== 'high' || swings.length < 5) continue

      const innerHigh = pivot
      // C-D-E can contain several swings. Walk outward through enclosing highs,
      // rather than requiring five immediately adjacent pivots.
      let rangeLow = swings.at(-2)!
      let interveningHigh = innerHigh.price
      for (let cIndex = swings.length - 3; cIndex >= 2; cIndex -= 2) {
        const outerHigh = swings[cIndex]
        if (outerHigh.price <= interveningHigh) continue
        interveningHigh = outerHigh.price
        const lows = swings.slice(cIndex + 1, -1).filter(p => p.kind === 'low')
        rangeLow = lows.reduce((lowest, p) => p.price < lowest.price ? p : lowest)
        // The whole orange structure, not just its final peak, must fit the ceiling.
        const orangeHigh = swings.slice(cIndex + 1).filter(p => p.kind === 'high' && p.index > rangeLow.index)
        if (orangeHigh.some(p => p.price > innerHigh.price)) continue
        // B is the lowest point of a multi-swing rally into C. A preceding high
        // above C separates that rally from the main downward context.
        let bIndex = cIndex - 1
        for (let j = cIndex - 2; j >= 0; j--) {
          if (swings[j].kind === 'high' && swings[j].price > outerHigh.price) break
          if (swings[j].kind === 'low' && swings[j].price < swings[bIndex].price) bIndex = j
        }
        const trendLow = swings[bIndex]
        const detectedAt = pivot.confirmedAt
        const height = outerHigh.price - rangeLow.price
        if (rangeLow.price < trendLow.price || height <= 0) continue
        const fibLevel = fibonacciCeiling(outerHigh.price, rangeLow.price)
        if (innerHigh.price > fibLevel || innerHigh.price <= rangeLow.price) continue
        if (height < atr[rangeLow.index] * scannerSettings.minimumRangeAtr) continue
        if (innerHigh.price - rangeLow.price < atr[rangeLow.index] * scannerSettings.minimumInnerSwingAtr) continue
        if (!isIntact(candles, outerHigh, rangeLow, detectedAt)) continue
        if (candles[detectedAt].close >= candles[innerHigh.index].close) continue

        // Find the actual preceding downward leg, allowing intermediate rallies.
        // Stop at a prior lower low: extending across it would invent a main trend.
        let trendStart: Pivot | undefined
        for (let j = bIndex - 1; j >= 0; j--) {
          const item = swings[j]
          if (item.kind === 'low' && item.price < trendLow.price) break
          if (item.kind !== 'high') continue
          if (!trendStart || item.price > trendStart.price) trendStart = item
        }
        if (!trendStart) continue
        const mainHeight = trendStart.price - trendLow.price
        const counterHeight = outerHigh.price - trendLow.price
        if (mainHeight <= counterHeight) continue
        if (trendLow.index - trendStart.index <= outerHigh.index - trendLow.index) continue
        // Check actual bars as well as pivots: spikes cannot be silently bridged.
        let contextIntact = true
        for (let i = trendStart.index; i <= outerHigh.index; i++) {
          if (candles[i].low < trendLow.price || candles[i].high > trendStart.price) contextIntact = false
        }
        if (!contextIntact) continue
        signals.push({ trendStart, trendLow, outerHigh, rangeLow, innerHigh, detectedAt, radius, fibLevel })
      }
    }
  }

  // A range is one case, but its inner structure can develop a higher peak.
  // Preserve each newly confirmed higher peak at its own observable time. Do
  // not move the first detection marker backwards or overwrite its geometry.
  const unique = new Map<string, StructureSignal[]>()
  for (const signal of signals.sort((a, b) => a.detectedAt - b.detectedAt || a.radius - b.radius)) {
    const key = `${signal.outerHigh.index}:${signal.rangeLow.index}`
    const stages = unique.get(key)
    if (!stages) unique.set(key, [signal])
    else if (signal.innerHigh.index > stages.at(-1)!.innerHigh.index && signal.innerHigh.price > stages.at(-1)!.innerHigh.price) stages.push(signal)
  }
  return [...unique.values()]
}

export function scanStructures(candles: Candle[], radii: readonly number[] = scannerSettings.radii): StructureSignal[] {
  // Freeze the first setup under this external peak. A subsequent lower D or
  // higher E is an outcome, not a replacement setup under the stale same C.
  // A new independent setup needs a new outer peak. Geometric stages above
  // remain available for diagnostics only, never as live level revisions.
  const fixed = new Map<number, StructureSignal>()
  for (const stages of scanStructureStages(candles, radii)) {
    const first = stages[0]
    if (!fixed.has(first.outerHigh.index)) fixed.set(first.outerHigh.index, first)
  }
  return [...fixed.values()]
}
