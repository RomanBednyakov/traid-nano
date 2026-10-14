import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'

import type { MarketDataset } from '@/features/pattern-review/types'

type Candle = CandlestickData<UTCTimestamp>
export type Direction = 'short' | 'long'

export interface PhaseBox {
  start: UTCTimestamp
  end: UTCTimestamp
  high: number
  low: number
}

export interface RazvorotkaCase {
  id: string
  symbol: string
  timeframe: MarketDataset['interval']
  direction: Direction
  detectedTime: UTCTimestamp
  source: PhaseBox
  breakout: PhaseBox
  cancellation: PhaseBox
  sourceBars: number
  holdBars: number
  breakoutDepthPercent: number
  coveragePercent: number
  stop: number
  target: number
  riskReward: number
  entryZone: number
  entryOptions: Array<{ label: string; price: number; riskReward: number }>
  context: string[]
  uncertainties: string[]
  candles: Candle[]
  futureCandles: Candle[]
}

export interface HigherCandle {
  time: UTCTimestamp
  availableAt: number
  open: number
  high: number
  low: number
  close: number
}

const lengths = Array.from({ length: 85 }, (_, i) => 96 - i)
const minimumVisibleTrendBars = 160
const previousLevelLookbackBars = 200
const phaseThreeReturnFraction = 0.2

function bounds(candles: Candle[], start: number, end: number) {
  let high = -Infinity, low = Infinity
  for (let i = start; i < end; i++) {
    high = Math.max(high, candles[i].high)
    low = Math.min(low, candles[i].low)
  }
  return { high, low, height: high - low }
}

function sourceRange(candles: Candle[], breakoutAt: number, length: number) {
  const start = breakoutAt - length
  if (start < 0) return null
  const range = bounds(candles, start, breakoutAt)
  if (range.height <= 0) return null
  const first = candles[start].close, last = candles[breakoutAt - 1].close
  if (Math.abs(last - first) > range.height * 0.6) return null
  if (length >= 24) {
    const recentLength = Math.max(12, Math.floor(length * 0.75))
    const recent = bounds(candles, breakoutAt - recentLength, breakoutAt)
    // Do not extend a local accumulation backward into an older, wider move.
    if (recent.height <= 0 || range.height > recent.height * 1.35) return null
  }
  let topTouches = 0, bottomTouches = 0, transitions = 0
  let lastSide: 'top' | 'bottom' | null = null
  for (let i = start; i < breakoutAt; i++) {
    const top = candles[i].high >= range.high - range.height * 0.1
    const bottom = candles[i].low <= range.low + range.height * 0.1
    if (top) topTouches++
    if (bottom) bottomTouches++
    if (top === bottom) continue
    const side = top ? 'top' : 'bottom'
    if (lastSide && side !== lastSide) transitions++
    lastSide = side
  }
  const broadAccumulation = length >= 48 && topTouches >= 3 && bottomTouches >= 3 && transitions >= 1
  if (topTouches < 2 || bottomTouches < 2 || (transitions < 3 && !broadAccumulation)) return null
  let high = range.high, low = range.low
  if (length >= 48) {
    let secondHigh = -Infinity, secondLow = Infinity, highCount = 0, lowCount = 0
    for (let i = start; i < breakoutAt; i++) {
      if (candles[i].high === high) highCount++
      else secondHigh = Math.max(secondHigh, candles[i].high)
      if (candles[i].low === low) lowCount++
      else secondLow = Math.min(secondLow, candles[i].low)
    }
    // A single long wick need not redefine an otherwise repeated boundary.
    if (highCount === 1 && high - secondHigh > range.height * 0.05) high = secondHigh
    if (lowCount === 1 && secondLow - low > range.height * 0.05) low = secondLow
  }
  return { high, low, height: high - low, rawHigh: range.high, rawLow: range.low, start, length }
}

function classifyContext(sample: Pick<HigherCandle, 'open' | 'high' | 'low' | 'close'>[], direction: Direction, height: number) {
  if (sample.length < 8) return 'unknown' as const
  const middle = Math.floor(sample.length / 2)
  const early = sample.slice(0, middle)
  const late = sample.slice(middle)
  const earlyHigh = Math.max(...early.map(c => c.high)), lateHigh = Math.max(...late.map(c => c.high))
  const earlyLow = Math.min(...early.map(c => c.low)), lateLow = Math.min(...late.map(c => c.low))
  const expected = direction === 'short' ? -1 : 1
  const move = (late.at(-1)!.close - early[0].open) * expected
  const shiftHigh = (lateHigh - earlyHigh) * expected
  const shiftLow = (lateLow - earlyLow) * expected
  const threshold = Math.max(height * 0.5, (Math.max(...sample.map(c => c.high)) - Math.min(...sample.map(c => c.low))) * 0.15)
  if (move >= threshold && shiftHigh > 0 && shiftLow > 0) return 'aligned' as const
  if (move <= -threshold && shiftHigh < 0 && shiftLow < 0) return 'opposed' as const
  if (Math.abs(move) < threshold * 0.5 && Math.abs(shiftHigh) < threshold && Math.abs(shiftLow) < threshold) return 'range' as const
  return 'unknown' as const
}

function higherContext(candles: HigherCandle[], until: number, direction: Direction, height: number, expectedGap: number) {
  let left = 0, right = candles.length
  while (left < right) {
    const middle = (left + right) >> 1
    if (candles[middle].availableAt <= until) left = middle + 1
    else right = middle
  }
  let sampleStart = Math.max(0, left - 16)
  if (Number.isFinite(expectedGap)) {
    for (let i = left - 1; i > sampleStart; i--) {
      if (candles[i].availableAt - candles[i - 1].availableAt > expectedGap) { sampleStart = i; break }
    }
  }
  const sample = candles.slice(sampleStart, left)
  return classifyContext(sample, direction, height)
}

function gapAgainstBreakout(candles: Candle[], breakoutAt: number, direction: Direction, height: number, nominalSeconds: number) {
  if (breakoutAt === 0) return false
  const gap = candles[breakoutAt].open - candles[breakoutAt - 1].close
  const breakoutSign = direction === 'short' ? 1 : -1
  // Small differences between successive adjusted bars are not opening gaps.
  return gap * breakoutSign < -height * 0.15 &&
    candles[breakoutAt].time - candles[breakoutAt - 1].time > nominalSeconds
}

/** Reject a breakout that merely reaches a repeatedly tested older level. */
function overlapsPreviousLevel(candles: Candle[], segmentStart: number, sourceStart: number, edge: number, apex: number, height: number, direction: Direction) {
  const tolerance = height * 0.02
  const prior = candles.slice(Math.max(segmentStart, sourceStart - previousLevelLookbackBars), sourceStart)
  const touches = prior.filter(c => Math.abs((direction === 'short' ? c.high : c.low) - apex) <= tolerance)
  if (touches.length < 5) return false
  const sessions = new Set(touches.map(c => new Date(c.time * 1000).toISOString().slice(0, 10)))
  if (sessions.size < 3) return false
  const levels = touches.map(c => direction === 'short' ? c.high : c.low).sort((a, b) => a - b)
  const previousLevel = levels[Math.floor(levels.length / 2)]
  const sign = direction === 'short' ? 1 : -1
  const previousZoneHeight = (previousLevel - edge) * sign
  if (previousZoneHeight < height * 0.15) return false
  const penetration = (apex - edge) * sign / previousZoneHeight
  return penetration > 0.5 && penetration < 2
}

/** A smaller source cannot use the far edge of an enclosing range as its breakout. */
function insideLargerRange(candles: Candle[], segmentStart: number, sourceStart: number, breakoutAt: number, source: { high: number; low: number; height: number }, apex: number, direction: Direction) {
  const outerStart = Math.max(segmentStart, sourceStart - 96)
  if (sourceStart - outerStart < 24) return false
  const outer = bounds(candles, outerStart, breakoutAt)
  if (direction === 'long') {
    return Math.abs(outer.high - source.high) <= source.height * 0.1 &&
      outer.low <= source.low - source.height * 0.25 &&
      Math.abs(apex - outer.low) <= source.height * 0.15
  }
  return Math.abs(outer.low - source.low) <= source.height * 0.1 &&
    outer.high >= source.high + source.height * 0.25 &&
    Math.abs(apex - outer.high) <= source.height * 0.15
}

function scanSegment(dataset: MarketDataset, higher: HigherCandle[], start: number, end: number): RazvorotkaCase[] {
  const candles = dataset.candles
  const found: RazvorotkaCase[] = []
  for (let breakoutAt = start + 12; breakoutAt < end - 2; breakoutAt++) {
    let match: RazvorotkaCase | null = null
    let matchedAt = -1
    for (const length of lengths) {
      if (breakoutAt - length < start) continue
      const source = sourceRange(candles, breakoutAt, length)
      if (!source) continue
      for (const direction of ['short', 'long'] as const) {
        const sign = direction === 'short' ? 1 : -1
        const edge = direction === 'short' ? source.high : source.low
        const confirmationEdge = direction === 'short' ? source.rawHigh : source.rawLow
        const openingExtreme = direction === 'short' ? candles[breakoutAt].high : candles[breakoutAt].low
        if ((openingExtreme - edge) * sign <= 0) continue
        if (gapAgainstBreakout(candles, breakoutAt, direction, source.height, dataset.interval === '1h' ? 3600 : 14400)) continue

        let hold = 0, consecutiveBodies = 0, apex = edge, lastBreakoutAt = breakoutAt - 1
        let cancellationStart = -1
        for (let i = breakoutAt; i < Math.min(end, breakoutAt + length + 1); i++) {
          const c = candles[i]
          // A shallow close inside the source still belongs to the breakout
          // test. A crossing candle belongs to Phase 2 because its wick still
          // overlaps that zone. Phase 3 starts with a fully separate candle.
          const outsideWick = direction === 'short' ? c.high : c.low
          const deepReturn = (edge - c.close) * sign >= source.height * phaseThreeReturnFraction
          if (deepReturn && (outsideWick - edge) * sign <= 0) {
            cancellationStart = i
            break
          }
          const wholeBodyOutside = (c.open - confirmationEdge) * sign >= 0 && (c.close - confirmationEdge) * sign > 0
          consecutiveBodies = wholeBodyOutside ? consecutiveBodies + 1 : 0
          hold = Math.max(hold, consecutiveBodies)
          apex = direction === 'short' ? Math.max(apex, c.high) : Math.min(apex, c.low)
          lastBreakoutAt = i
        }
        if (hold < 2 || cancellationStart < 0 || Math.abs(apex - edge) < source.height * 0.15) continue

        const localTrend = classifyContext(candles.slice(Math.max(start, source.start - 16), source.start), direction, source.height)
        if (localTrend === 'opposed' || localTrend === 'range') continue
        const longerTrend = classifyContext(candles.slice(Math.max(start, source.start - minimumVisibleTrendBars), source.start), direction, source.height)
        if (longerTrend === 'opposed') continue
        const expectedHigherGap = dataset.category === 'crypto' ? (dataset.interval === '1h' ? 14400 : 86400) : Infinity
        const higherTrend = higherContext(higher, candles[source.start].time, direction, source.height, expectedHigherGap)
        if (higherTrend === 'opposed' || higherTrend === 'range') continue
        if (source.start - start >= 32 && localTrend !== 'aligned' && longerTrend !== 'aligned' && higherTrend !== 'aligned') continue
        if (insideLargerRange(candles, start, source.start, breakoutAt, source, apex, direction)) continue
        if (overlapsPreviousLevel(candles, start, source.start, edge, apex, source.height, direction)) continue

        let detectedAt = -1, coverage = 0
        const cancelLimit = Math.min(end, cancellationStart + length)
        for (let i = cancellationStart; i < cancelLimit; i++) {
          // Once cancellation begins, its candles cannot revisit the false
          // breakout side of the source boundary, even with a wick.
          const outsideWick = direction === 'short' ? candles[i].high : candles[i].low
          if ((outsideWick - edge) * sign > 0) break
          const extreme = direction === 'short' ? candles[i].low : candles[i].high
          const fraction = direction === 'short'
            ? (source.high - extreme) / source.height
            : (extreme - source.low) / source.height
          if (fraction >= 0.9) {
            detectedAt = i
            coverage = Math.min(fraction, 1) * 100
            break
          }
        }
        if (detectedAt < 0) continue

        const stop = apex + sign * source.height * 0.01
        const target = direction === 'short' ? source.low : source.high
        const entries = [{ label: 'Ретест границы', entry: edge }, { label: '50% диапазона', entry: (source.high + source.low) / 2 }]
        const options = entries.map(({ label, entry }) => ({ label, entry, reward: (entry - target) * sign, risk: (stop - entry) * sign }))
          .filter(option => option.reward > 0 && option.risk > 0)
          .map(option => ({ ...option, rr: option.reward / option.risk }))
          .sort((a, b) => b.rr - a.rr)
        const best = options[0]
        // The actual fill is optional, but a feasible 1:2 plan at a standard
        // retest or midpoint is required before publishing the structure.
        if (!best || best.rr < 2) continue

        const context = ['Консолидация ≥ 12 свечей', 'Ложный выход ≥ 15%', 'Закрепление ≥ 2 закрытий', 'Отмена ≥ 90%']
        const uncertainties: string[] = []
        if (localTrend === 'aligned') context.push('Тренд рабочего ТФ совпадает с направлением сигнала')
        else uncertainties.push('Ступенчатый тренд на рабочем ТФ не подтверждён автоматически')
        if (longerTrend === 'aligned') context.push('Длинный контекст рабочего ТФ совпадает с направлением сигнала')
        else uncertainties.push('Длинный контекст рабочего ТФ требует ручной проверки')
        if (higherTrend === 'aligned') context.push('Тренд старшего ТФ совпадает с направлением сигнала')
        else uncertainties.push('Тренд старшего ТФ не подтверждён доступной историей')
        uncertainties.push('Симметрия предыдущих консолидаций требует ручной проверки')
        const breakoutEnd = Math.max(breakoutAt, lastBreakoutAt)
        const returnBounds = bounds(candles, breakoutEnd + 1, detectedAt + 1)
        let displaySourceStart = source.start
        const maximumExtension = Math.min(24, Math.floor(length * 0.25))
        while (displaySourceStart > start && source.start - displaySourceStart < maximumExtension) {
          const previous = candles[displaySourceStart - 1]
          if (previous.high > source.high || previous.low < source.low) break
          displaySourceStart--
        }
        match = {
          id: `${dataset.slug}-${dataset.interval}-${direction}-${candles[breakoutAt].time}`,
          symbol: dataset.symbol,
          timeframe: dataset.interval,
          direction,
          detectedTime: candles[detectedAt].time,
          source: { start: candles[displaySourceStart].time, end: candles[breakoutAt - 1].time, high: source.high, low: source.low },
          breakout: { start: candles[breakoutAt].time, end: candles[breakoutEnd].time, high: Math.max(edge, apex), low: Math.min(edge, apex) },
          cancellation: { start: candles[breakoutEnd + 1].time, end: candles[detectedAt].time, high: returnBounds.high, low: returnBounds.low },
          sourceBars: breakoutAt - displaySourceStart,
          holdBars: hold,
          breakoutDepthPercent: Math.abs(apex - edge) / source.height * 100,
          coveragePercent: coverage,
          stop, target, riskReward: best.rr, entryZone: best.entry,
          entryOptions: options.map(option => ({ label: option.label, price: option.entry, riskReward: option.rr })),
          context, uncertainties,
          // Preserve enough history to judge the move leading into Phase 1.
          // The chart may begin at a known data break when fewer bars exist.
          candles: candles.slice(Math.max(start, displaySourceStart - Math.max(minimumVisibleTrendBars, length * 3)), detectedAt + 1),
          futureCandles: candles.slice(detectedAt + 1, Math.min(end, detectedAt + 1 + (dataset.interval === '1h' ? 80 : 40))),
        }
        matchedAt = detectedAt
        break
      }
      if (match) break
    }
    if (match) {
      found.push(match)
      breakoutAt = matchedAt
    }
  }
  return found
}

/** Only closed candles at or before the Phase 3 marker participate in detection. */
export function detectRazvorotka(dataset: MarketDataset, higher: HigherCandle[]): RazvorotkaCase[] {
  const breaks = new Set(dataset.quality?.breakBeforeTimes ?? [])
  const boundaries = [0]
  dataset.candles.forEach((c, i) => { if (i && breaks.has(c.time)) boundaries.push(i) })
  boundaries.push(dataset.candles.length)
  return boundaries.slice(0, -1).flatMap((start, i) => scanSegment(dataset, higher, start, boundaries[i + 1])).reverse()
}

/** Build completed daily bars from the same prepared hourly history. */
export function dailyContext(hourly: MarketDataset): HigherCandle[] {
  const usSession = hourly.category === 'stocks' || hourly.category === 'bonds' || hourly.symbol === 'GLD'
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: usSession ? 'America/New_York' : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const groups = new Map<string, Candle[]>()
  for (const candle of hourly.candles) {
    const key = formatter.format(new Date(candle.time * 1000))
    const group = groups.get(key) ?? []
    group.push(candle)
    groups.set(key, group)
  }
  const bars: HigherCandle[] = []
  for (const group of groups.values()) {
    // Stock sessions have seven 1H bars; crypto days have 24. Futures hours vary.
    if (usSession && group.length !== 7) continue
    if (hourly.category === 'crypto' && group.length !== 24) continue
    if (!usSession && hourly.category !== 'crypto' && group.length < 20) continue
    bars.push({ time: group[0].time, availableAt: group.at(-1)!.time + (usSession ? 1800 : 3600), open: group[0].open, high: Math.max(...group.map(c => c.high)), low: Math.min(...group.map(c => c.low)), close: group.at(-1)!.close })
  }
  return bars
}

/** A 4H bar is available only once all its underlying session hours close. */
export function fourHourContext(dataset: MarketDataset): HigherCandle[] {
  const usSession = dataset.category === 'stocks' || dataset.category === 'bonds' || dataset.symbol === 'GLD'
  const ny = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return dataset.candles.map(c => {
    const localTime = usSession ? ny.format(new Date(c.time * 1000)) : ''
    return { ...c, availableAt: c.time + (localTime === '13:30' ? 9000 : 14400) }
  })
}
