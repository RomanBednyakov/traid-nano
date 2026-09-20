import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'

import type { MarketDataset, PatternCase, PatternCriterion } from './types'

const FIBONACCI_THRESHOLD = 0.236
const FIBONACCI_WICK_TOLERANCE = 1.1
const FORMATION_LENGTHS = {
  '1h': [2, 3, 4, 6, 8],
  '4h': [1, 2, 3, 4, 6],
} as const
const MIN_PATTERN_SPACING = { '1h': 18, '4h': 4 } as const

type Candle = CandlestickData<UTCTimestamp>

interface DetectionCandidate {
  endIndex: number
  trendStartIndex: number
  counterLowIndex: number
  counterHighIndex: number
  formationStartIndex: number
  formationLength: number
  rangeLow: number
  formationHigh: number
  formationLow: number
  fibLevel: number
  score: number
  strictMatch: boolean
  criteria: PatternCriterion[]
  mainTrendDropPercent: number
  counterTrendRisePercent: number
  formationHeightPercent: number
  formationTopDepthPercent: number
}

const percent = (value: number) => `${value.toFixed(1)}%`
const price = (value: number) =>
  value >= 1_000
    ? value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
    : value.toFixed(value < 10 ? 4 : 2)

function indexOfExtreme(
  candles: Candle[],
  start: number,
  end: number,
  field: 'high' | 'low',
  mode: 'max' | 'min',
) {
  let selected = start
  for (let index = start + 1; index <= end; index += 1) {
    const wins = mode === 'max'
      ? candles[index][field] > candles[selected][field]
      : candles[index][field] < candles[selected][field]
    if (wins) selected = index
  }
  return selected
}

function averageRangePercent(candles: Candle[], start: number, end: number) {
  let sum = 0
  for (let index = start; index <= end; index += 1) {
    const candle = candles[index]
    sum += (candle.high - candle.low) / Math.max(candle.close, 0.000001)
  }
  return sum / Math.max(end - start + 1, 1)
}

function scoreCandidate(
  candles: Candle[],
  endIndex: number,
  interval: MarketDataset['interval'],
): DetectionCandidate | null {
  const counterLookback = interval === '1h' ? 72 : 36
  const trendLookback = interval === '1h' ? 96 : 48

  for (const formationLength of FORMATION_LENGTHS[interval]) {
    const formationStartIndex = endIndex - formationLength + 1
    const highSearchStart = Math.max(0, formationStartIndex - counterLookback)
    const highSearchEnd = formationStartIndex - 2
    if (highSearchEnd - highSearchStart < 8) continue

    const counterHighIndex = indexOfExtreme(
      candles,
      highSearchStart,
      highSearchEnd,
      'high',
      'max',
    )
    const counterLowSearchStart = Math.max(0, counterHighIndex - trendLookback)
    const counterLowSearchEnd = counterHighIndex - 2
    if (counterLowSearchEnd - counterLowSearchStart < 8) continue

    const counterLowIndex = indexOfExtreme(
      candles,
      counterLowSearchStart,
      counterLowSearchEnd,
      'low',
      'min',
    )
    const trendSearchStart = Math.max(0, counterLowIndex - trendLookback * 4)
    const trendSearchEnd = counterLowIndex - 2
    if (trendSearchEnd - trendSearchStart < 8) continue

    const trendStartIndex = indexOfExtreme(
      candles,
      trendSearchStart,
      trendSearchEnd,
      'high',
      'max',
    )
    const rangeLowIndex = indexOfExtreme(
      candles,
      counterHighIndex + 1,
      endIndex,
      'low',
      'min',
    )
    const formationHighIndex = indexOfExtreme(
      candles,
      formationStartIndex,
      endIndex,
      'high',
      'max',
    )
    const formationLowIndex = indexOfExtreme(
      candles,
      formationStartIndex,
      endIndex,
      'low',
      'min',
    )

    const upper = candles[counterHighIndex].high
    const counterLow = candles[counterLowIndex].low
    const trendStart = candles[trendStartIndex].high
    const rangeLow = candles[rangeLowIndex].low
    const formationHigh = candles[formationHighIndex].high
    const formationLow = candles[formationLowIndex].low
    const rangeHeight = upper - rangeLow
    if (rangeHeight <= 0 || counterLow <= 0 || trendStart <= 0) continue

    const fibLevel = rangeLow + rangeHeight * FIBONACCI_THRESHOLD
    const mainTrendDrop = (trendStart - counterLow) / trendStart
    const counterTrendRise = (upper - counterLow) / counterLow
    const mainTrendMove = trendStart - counterLow
    const counterTrendMove = upper - counterLow
    const mainTrendDuration = counterLowIndex - trendStartIndex
    const counterTrendDuration = counterHighIndex - counterLowIndex
    const formationHeight = (formationHigh - formationLow) / rangeHeight
    const formationTopDepth = (upper - formationHigh) / rangeHeight
    const formationTopFromLow = (formationHigh - rangeLow) / rangeHeight
    const volatility = averageRangePercent(candles, trendStartIndex, endIndex)
    const mainThreshold = Math.max(interval === '1h' ? 0.004 : 0.007, volatility * 0.8)
    const counterThreshold = Math.max(interval === '1h' ? 0.0035 : 0.006, volatility * 0.75)

    const criteria: PatternCriterion[] = [
      {
        label: 'Основной тренд вниз',
        detail: `Падение уже видно к моменту сигнала; адаптивный порог ${percent(mainThreshold * 100)}.`,
        value: percent(mainTrendDrop * 100),
        passed: mainTrendDrop >= mainThreshold,
      },
      {
        label: 'Локальный контртренд вверх',
        detail: `Рост от локального минимума к верхней границе; адаптивный порог ${percent(counterThreshold * 100)}.`,
        value: percent(counterTrendRise * 100),
        passed: counterTrendRise >= counterThreshold,
      },
      {
        label: 'Вершина не обновлена',
        detail: 'На момент сигнала цена не обновила вершину локального контртренда.',
        value: `${price(formationHigh)} ≤ ${price(upper)}`,
        passed: formationHigh <= upper * 1.004,
      },
      {
        label: 'Начало формации в зоне 0,236',
        detail: 'Верх первых свечей формации находится в нижней зоне 0,236 диапазона; оставлен небольшой допуск на тени.',
        value: percent(formationTopFromLow * 100),
        passed: formationTopFromLow <= FIBONACCI_THRESHOLD * FIBONACCI_WICK_TOLERANCE,
      },
      {
        label: 'Основной тренд больше по высоте',
        detail: 'Абсолютное движение основного тренда должно превышать высоту локального контртренда.',
        value: `${price(mainTrendMove)} > ${price(counterTrendMove)}`,
        passed: mainTrendMove > counterTrendMove,
      },
      {
        label: 'Основной тренд дольше',
        detail: 'Основной тренд должен занимать больше свечей, чем локальное контртрендовое движение.',
        value: `${mainTrendDuration} > ${counterTrendDuration} свечей`,
        passed: mainTrendDuration > counterTrendDuration,
      },
    ]

    if (!criteria.every((criterion) => criterion.passed)) continue

    return {
      endIndex,
      trendStartIndex,
      counterLowIndex,
      counterHighIndex,
      formationStartIndex,
      formationLength,
      rangeLow,
      formationHigh,
      formationLow,
      fibLevel,
      score: 100,
      strictMatch: true,
      criteria,
      mainTrendDropPercent: mainTrendDrop * 100,
      counterTrendRisePercent: counterTrendRise * 100,
      formationHeightPercent: formationHeight * 100,
      formationTopDepthPercent: formationTopDepth * 100,
    }
  }

  return null
}

function toDate(time: UTCTimestamp) {
  return new Date(time * 1_000).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function toPatternCase(
  dataset: MarketDataset,
  candidate: DetectionCandidate,
): PatternCase {
  const candles = dataset.candles
  const upper = candles[candidate.counterHighIndex].high
  const counterLow = candles[candidate.counterLowIndex].low
  const eventTime = candles[candidate.endIndex].time
  const chartStart = Math.max(0, candidate.trendStartIndex - 10)
  const requestedOutcomeBars = dataset.interval === '1h' ? 40 : 16
  const outcomeEndIndex = Math.min(candles.length - 1, candidate.endIndex + requestedOutcomeBars)
  const chartEnd = outcomeEndIndex + 1
  const signalClose = candles[candidate.endIndex].close
  const outcomeCandles = candles.slice(candidate.endIndex + 1, outcomeEndIndex + 1)
  const outcomeLow = outcomeCandles.length
    ? Math.min(...outcomeCandles.map((candle) => candle.low))
    : signalClose
  const outcomeHigh = outcomeCandles.length
    ? Math.max(...outcomeCandles.map((candle) => candle.high))
    : signalClose
  const outcomeClose = candles[outcomeEndIndex].close
  const maxDropPercent = ((signalClose - outcomeLow) / signalClose) * 100
  const maxRisePercent = ((outcomeHigh - signalClose) / signalClose) * 100
  const closeChangePercent = ((outcomeClose - signalClose) / signalClose) * 100
  const outcomeLabel = outcomeCandles.length === 0
    ? 'После сигнала данных пока нет'
    : maxDropPercent > maxRisePercent
      ? 'После сигнала преобладало падение'
      : 'После сигнала преобладал рост'

  return {
    id: `${dataset.slug}-${eventTime}`,
    symbol: dataset.symbol,
    instrumentName: dataset.name,
    title: `${dataset.symbol}: начало формации у нижней границы`,
    subtitle: `Реальные ${dataset.interval.toUpperCase()} данные · сигнал появился ${toDate(eventTime)}`,
    timeframe: dataset.interval.toUpperCase() as PatternCase['timeframe'],
    direction: 'short',
    status: candidate.strictMatch ? 'valid' : 'warning',
    statusLabel: 'Сигнал сформирован',
    strictMatch: candidate.strictMatch,
    score: candidate.score,
    eventDate: toDate(eventTime),
    candles: candles.slice(chartStart, chartEnd),
    trend: {
      startTime: candles[candidate.trendStartIndex].time,
      startPrice: candles[candidate.trendStartIndex].high,
      endTime: candles[candidate.counterLowIndex].time,
      endPrice: counterLow,
    },
    counterTrend: {
      startTime: candles[candidate.counterLowIndex].time,
      startPrice: counterLow,
      endTime: candles[candidate.counterHighIndex].time,
      endPrice: upper,
    },
    range: {
      startTime: candles[candidate.counterHighIndex].time,
      endTime: eventTime,
      high: upper,
      low: candidate.rangeLow,
    },
    formation: {
      startTime: candles[candidate.formationStartIndex].time,
      endTime: eventTime,
      high: candidate.formationHigh,
      low: candidate.formationLow,
    },
    fibLevel: candidate.fibLevel,
    metrics: {
      mainTrendDropPercent: candidate.mainTrendDropPercent,
      counterTrendRisePercent: candidate.counterTrendRisePercent,
      formationHeightPercent: candidate.formationHeightPercent,
      formationTopDepthPercent: candidate.formationTopDepthPercent,
    },
    outcome: {
      bars: outcomeCandles.length,
      endTime: candles[outcomeEndIndex].time,
      closeChangePercent,
      maxDropPercent,
      maxRisePercent,
      label: outcomeLabel,
    },
    explanation:
      `Оранжевая область содержит первые ${candidate.formationLength} ${candidate.formationLength === 1 ? 'свечу' : 'свечи'} формации ${dataset.interval.toUpperCase()}. Свечи справа от метки «Сигнал» показаны только для проверки результата и не участвовали в поиске.`,
    verdict:
      'Сигнал появляется сразу после входа первых свечей формации в нижнюю зону 0,236. Основной тренд одновременно больше контртренда по высоте и продолжительности. Последующее движение не влияет на обнаружение.',
    criteria: candidate.criteria,
  }
}

export function detectPatterns(dataset: MarketDataset): PatternCase[] {
  const candidates: DetectionCandidate[] = []

  for (let endIndex = 160; endIndex < dataset.candles.length; endIndex += 1) {
    const candidate = scoreCandidate(dataset.candles, endIndex, dataset.interval)
    if (candidate) candidates.push(candidate)
  }

  const selected: DetectionCandidate[] = []
  for (const candidate of candidates) {
    const previous = selected.at(-1)
    if (!previous || candidate.endIndex - previous.endIndex >= MIN_PATTERN_SPACING[dataset.interval]) {
      selected.push(candidate)
    }
  }

  return selected
    .sort((a, b) => b.endIndex - a.endIndex)
    .map((candidate) => toPatternCase(dataset, candidate))
}

export const detectorAssumptions = {
  fibonacciThreshold: FIBONACCI_THRESHOLD,
  formationLengths: FORMATION_LENGTHS,
}
