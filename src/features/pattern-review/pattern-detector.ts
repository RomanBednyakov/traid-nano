import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'

import type { MarketDataset, PatternCase, PatternCriterion } from './types'

const FIBONACCI_THRESHOLD = 0.236
const FORMATION_LENGTH = 24
const MIN_PATTERN_SPACING = 34

type Candle = CandlestickData<UTCTimestamp>

interface DetectionCandidate {
  endIndex: number
  trendStartIndex: number
  counterLowIndex: number
  counterHighIndex: number
  formationStartIndex: number
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

function regressionChange(candles: Candle[], start: number, end: number) {
  const count = end - start + 1
  const xMean = (count - 1) / 2
  let yMean = 0
  for (let index = start; index <= end; index += 1) yMean += candles[index].close
  yMean /= count

  let numerator = 0
  let denominator = 0
  for (let offset = 0; offset < count; offset += 1) {
    numerator += (offset - xMean) * (candles[start + offset].close - yMean)
    denominator += (offset - xMean) ** 2
  }

  const slope = numerator / Math.max(denominator, 1)
  return (slope * (count - 1)) / Math.max(yMean, 0.000001)
}

function scoreCandidate(
  candles: Candle[],
  endIndex: number,
): DetectionCandidate | null {
  const formationStartIndex = endIndex - FORMATION_LENGTH + 1
  const highSearchStart = endIndex - 118
  const highSearchEnd = formationStartIndex - 10
  if (highSearchStart < 125 || highSearchEnd <= highSearchStart) return null

  const counterHighIndex = indexOfExtreme(
    candles,
    highSearchStart,
    highSearchEnd,
    'high',
    'max',
  )
  const counterLowSearchStart = Math.max(70, counterHighIndex - 96)
  const counterLowSearchEnd = counterHighIndex - 12
  if (counterLowSearchEnd <= counterLowSearchStart) return null

  const counterLowIndex = indexOfExtreme(
    candles,
    counterLowSearchStart,
    counterLowSearchEnd,
    'low',
    'min',
  )
  const trendSearchStart = Math.max(0, counterLowIndex - 115)
  const trendSearchEnd = Math.max(trendSearchStart, counterLowIndex - 35)
  const trendStartIndex = indexOfExtreme(
    candles,
    trendSearchStart,
    trendSearchEnd,
    'high',
    'max',
  )

  const upper = candles[counterHighIndex].high
  const counterLow = candles[counterLowIndex].low
  const trendStart = candles[trendStartIndex].high
  const rangeLowIndex = indexOfExtreme(
    candles,
    counterHighIndex + 1,
    endIndex,
    'low',
    'min',
  )
  const rangeLow = candles[rangeLowIndex].low
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
  const formationHigh = candles[formationHighIndex].high
  const formationLow = candles[formationLowIndex].low
  const rangeHeight = upper - rangeLow
  if (rangeHeight <= 0 || counterLow <= 0 || trendStart <= 0) return null

  const fibLevel = upper - rangeHeight * FIBONACCI_THRESHOLD
  const mainTrendDrop = (trendStart - counterLow) / trendStart
  const counterTrendRise = (upper - counterLow) / counterLow
  const formationHeight = (formationHigh - formationLow) / rangeHeight
  const formationTopDepth = (upper - formationHigh) / rangeHeight
  const formationLowDistance = (formationLow - rangeLow) / rangeHeight
  const regression = regressionChange(candles, trendStartIndex, counterLowIndex)
  const volatility = averageRangePercent(candles, trendStartIndex, endIndex)

  const mainThreshold = Math.max(0.025, volatility * 3.1)
  const counterThreshold = Math.max(0.022, volatility * 2.6)
  const mainTrendPassed = mainTrendDrop >= mainThreshold && regression <= -0.02
  const counterTrendPassed = counterTrendRise >= counterThreshold
  const topBelowCounterTrend = formationHigh <= upper * 1.006
  const belowFibLevel = formationHigh <= fibLevel * 1.012
  const compactFormation = formationHeight <= 0.68
  const formationNearLow = formationLowDistance <= 0.16

  const criteria: PatternCriterion[] = [
    {
      label: 'Основной тренд вниз',
      detail: `Падение до локального минимума, порог с учётом волатильности ${percent(mainThreshold * 100)}.`,
      value: percent(mainTrendDrop * 100),
      passed: mainTrendPassed,
    },
    {
      label: 'Локальный контртренд вверх',
      detail: `Рост от синего минимума до верхней красной границы, порог ${percent(counterThreshold * 100)}.`,
      value: percent(counterTrendRise * 100),
      passed: counterTrendPassed,
    },
    {
      label: 'Вершина не обновлена',
      detail: 'Максимум оранжевой формации не выше вершины локального контртренда.',
      value: `${price(formationHigh)} ≤ ${price(upper)}`,
      passed: topBelowCounterTrend,
    },
    {
      label: 'Фильтр Fibonacci 0,236',
      detail: 'Верх формации находится ниже уровня 0,236, отложенного от верхней границы к нижней.',
      value: `${percent(formationTopDepth * 100)} глубины`,
      passed: belowFibLevel,
    },
    {
      label: 'Формация компактна',
      detail: 'Высота оранжевой области не больше 68% полного локального диапазона.',
      value: percent(formationHeight * 100),
      passed: compactFormation,
    },
    {
      label: 'Формация у нижней границы',
      detail: 'Минимум формации расположен в нижних 16% диапазона.',
      value: percent(Math.max(formationLowDistance, 0) * 100),
      passed: formationNearLow,
    },
  ]

  const passedCount = criteria.filter((criterion) => criterion.passed).length
  const score = Math.round((passedCount / criteria.length) * 100)
  const strictMatch = criteria.every((criterion) => criterion.passed)

  if (!strictMatch && score < 83) return null

  return {
    endIndex,
    trendStartIndex,
    counterLowIndex,
    counterHighIndex,
    formationStartIndex,
    rangeLow,
    formationHigh,
    formationLow,
    fibLevel,
    score,
    strictMatch,
    criteria,
    mainTrendDropPercent: mainTrendDrop * 100,
    counterTrendRisePercent: counterTrendRise * 100,
    formationHeightPercent: formationHeight * 100,
    formationTopDepthPercent: formationTopDepth * 100,
  }
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
  const chartStart = Math.max(0, candidate.trendStartIndex - 18)
  const chartEnd = Math.min(candles.length, candidate.endIndex + 12)

  return {
    id: `${dataset.slug}-${eventTime}`,
    symbol: dataset.symbol,
    instrumentName: dataset.name,
    title: `${dataset.symbol}: формация у нижней границы`,
    subtitle: `Реальные дневные данные · завершение формации ${toDate(eventTime)}`,
    timeframe: dataset.interval.toUpperCase() as PatternCase['timeframe'],
    direction: 'short',
    status: candidate.strictMatch ? 'valid' : 'warning',
    statusLabel: candidate.strictMatch ? 'Все условия выполнены' : 'Близкий кандидат',
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
    explanation:
      `Зелёная стрелка показывает основной нисходящий импульс, синяя — локальный контртренд. Красные линии задают диапазон от вершины контртренда до локального минимума, оранжевая область — последние 24 свечи ${dataset.interval.toUpperCase()}.`,
    verdict: candidate.strictMatch
      ? 'Алгоритм считает участок совпадением с текущей формализацией: нисходящий контекст и контртренд присутствуют, вершина не обновлена, формация находится ниже уровня 0,236 и прижата к нижней границе.'
      : 'Это ближайший визуально-числовой кандидат. Одно условие не прошло строгий фильтр — оно выделено ниже, поэтому участок нельзя считать подтверждённым совпадением.',
    criteria: candidate.criteria,
  }
}

export function detectPatterns(dataset: MarketDataset): PatternCase[] {
  const candidates: DetectionCandidate[] = []

  for (let endIndex = 245; endIndex < dataset.candles.length - 10; endIndex += 1) {
    const candidate = scoreCandidate(dataset.candles, endIndex)
    if (candidate) candidates.push(candidate)
  }

  const selected: DetectionCandidate[] = []
  for (const candidate of candidates.sort((a, b) => {
    if (a.strictMatch !== b.strictMatch) return a.strictMatch ? -1 : 1
    if (a.score !== b.score) return b.score - a.score
    return b.endIndex - a.endIndex
  })) {
    const overlaps = selected.some(
      (item) => Math.abs(item.endIndex - candidate.endIndex) < MIN_PATTERN_SPACING,
    )
    if (!overlaps) selected.push(candidate)
  }

  return selected
    .sort((a, b) => b.endIndex - a.endIndex)
    .map((candidate) => toPatternCase(dataset, candidate))
}

export const detectorAssumptions = {
  fibonacciThreshold: FIBONACCI_THRESHOLD,
  formationLength: FORMATION_LENGTH,
}
