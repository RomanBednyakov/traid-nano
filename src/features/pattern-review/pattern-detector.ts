import { describeContinuation } from './continuation'
import { scanStructures, scannerSettings, type StructureSignal } from './structure-scanner'
import type { MarketDataset, PatternCase, PatternCriterion } from './types'

const formatPrice = (p: number) => p.toLocaleString('ru-RU', { maximumFractionDigits: 4 })
const date = (time: number) => new Date(time * 1000).toLocaleString('ru-RU', { timeZone: 'UTC' })

function toPatternCase(dataset: MarketDataset, s: StructureSignal): PatternCase {
  const { candles } = dataset
  const a = s.trendStart, b = s.trendLow, c = s.outerHigh, d = s.rangeLow, e = s.innerHigh
  const signalTime = candles[s.detectedAt].time
  const mainMove = a.price - b.price
  const counterMove = c.price - b.price
  const mainBars = b.index - a.index
  const counterBars = c.index - b.index
  const height = c.price - d.price
  const criteria: PatternCriterion[] = [
    { label: 'Основной тренд вниз · A → B', detail: 'Связанный участок от вершины к минимуму, предшествующий контртренду.', value: formatPrice(a.price) + ' → ' + formatPrice(b.price), passed: true },
    { label: 'Контртренд вверх · B → C', detail: 'Локальное движение вверх завершилось внешней вершиной C.', value: formatPrice(b.price) + ' → ' + formatPrice(c.price), passed: true },
    { label: 'Основной тренд больше и дольше', detail: 'Сравниваются абсолютное движение цены и число торговых свечей.', value: formatPrice(mainMove) + ' > ' + formatPrice(counterMove) + '; ' + mainBars + ' > ' + counterBars + ' св.', passed: true },
    { label: 'Боковик · C — D', detail: 'Нижняя граница D возникла после вершины C. Обе границы сохранены к моменту распознавания.', value: formatPrice(c.price) + ' / ' + formatPrice(d.price), passed: true },
    { label: 'Внутренняя вершина · D → E → вниз', detail: 'После подъёма от D сформировалась вершина E. Подтверждение заняло ' + (s.detectedAt - e.index) + ' св. справа; они доступны в момент распознавания.', value: formatPrice(e.price), passed: true },
    { label: 'Fibonacci 0,236 от верхней границы', detail: 'Рабочая трактовка эталонов: E ≤ C − 0,236 × (C − D). Без допуска выше линии.', value: formatPrice(e.price) + ' ≤ ' + formatPrice(s.fibLevel), passed: true },
  ]

  // Outcomes are calculated after detection and cannot change eligibility or time.
  const futureCandles = candles.slice(s.detectedAt + 1, s.detectedAt + 1 + (dataset.interval === '1h' ? 80 : 40))
  return {
    id: dataset.slug + '-' + dataset.interval + '-' + candles[c.index].time + '-' + candles[d.index].time,
    symbol: dataset.symbol, instrumentName: dataset.name,
    title: dataset.symbol + ': внутренняя вершина в боковике',
    subtitle: 'Свеча распознавания: ' + date(signalTime) + ' UTC',
    timeframe: dataset.interval.toUpperCase() as PatternCase['timeframe'],
    direction: 'short', status: 'valid', statusLabel: 'Формация распознана',
    strictMatch: true, score: 100, eventDate: date(signalTime),
    candles: candles.slice(Math.max(0, a.index - 8), s.detectedAt + 1),
    futureCandles,
    structure: {
      innerPeakTime: candles[e.index].time, innerPeakPrice: e.price,
      detectedTime: signalTime, confirmationBars: s.detectedAt - e.index,
      mainBars, counterBars, mainMove, counterMove, radius: s.radius,
      indices: [a.index, b.index, c.index, d.index, e.index, s.detectedAt],
    },
    trend: { startTime: candles[a.index].time, startPrice: a.price, endTime: candles[b.index].time, endPrice: b.price },
    counterTrend: { startTime: candles[b.index].time, startPrice: b.price, endTime: candles[c.index].time, endPrice: c.price },
    range: { startTime: candles[c.index].time, endTime: signalTime, high: c.price, low: d.price },
    formation: { startTime: candles[d.index].time, endTime: signalTime, high: e.price, low: d.price },
    fibLevel: s.fibLevel,
    metrics: {
      mainTrendDropPercent: mainMove / a.price * 100,
      counterTrendRisePercent: counterMove / b.price * 100,
      formationHeightPercent: (e.price - d.price) / height * 100,
      formationTopDepthPercent: (c.price - e.price) / height * 100,
    },
    outcome: describeContinuation(candles[s.detectedAt], futureCandles, c.price, d.price, e.price),
    explanation: 'A → B: основной тренд; B → C: контртренд; C → D: границы боковика; D → E: внутренняя вершина. Метка стоит после подтверждения E, пока внешние границы ещё не пробиты.',
    verdict: 'Распознана структура по рабочей трактовке эталонов. Условие торгового входа согласуется отдельно; последующее падение не является условием отбора.',
    criteria,
  }
}

export function detectPatterns(dataset: MarketDataset): PatternCase[] {
  const breaks = new Set(dataset.quality?.breakBeforeTimes ?? [])
  const boundaries = [0, ...dataset.candles.flatMap((c, i) => i && breaks.has(c.time) ? [i] : []), dataset.candles.length]
  const signals: PatternCase[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1]
    const chunk = dataset.candles.slice(start, end)
    const shifted = scanStructures(chunk).map(s => ({
      ...s, detectedAt: s.detectedAt + start,
      ...Object.fromEntries((['trendStart', 'trendLow', 'outerHigh', 'rangeLow', 'innerHigh'] as const).map(key => [key, { ...s[key], index: s[key].index + start, confirmedAt: s[key].confirmedAt + start }])),
    })) as StructureSignal[]
    // Do not show post-gap outcomes as a continuous continuation, either.
    const segmentDataset = { ...dataset, candles: dataset.candles.slice(0, end) }
    signals.push(...shifted.map(s => toPatternCase(segmentDataset, s)))
  }
  return signals.reverse()
}

export const detectorAssumptions = scannerSettings
