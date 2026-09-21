import type { PatternCase } from './types'

/** Describes only supplied, revealed candles. Never used by the detector. */
export function describeContinuation(
  referenceBar: PatternCase['candles'][number],
  candles: PatternCase['candles'],
  upper: number,
  lower: number,
  inner: number,
): PatternCase['outcome'] {
  const reference = referenceBar.close
  const min = Math.min(reference, ...candles.map(x => x.low))
  const max = Math.max(reference, ...candles.map(x => x.high))
  const last = candles.at(-1) ?? referenceBar
  const events: PatternCase['outcome']['events'] = []
  let swept = false, returned = false, lowerBroken = false, upperBroken = false
  for (const bar of candles) {
    if (bar.high > upper && bar.low < lower) {
      events.push({ time: bar.time, label: 'Обе внешние границы пересечены: порядок внутри свечи неизвестен' })
      break
    }
    if (!swept && bar.high > inner) {
      swept = true
      events.push({ time: bar.time, label: 'Вынос внутренней вершины E' })
    }
    if (swept && !returned && bar.close < inner) {
      returned = true
      events.push({ time: bar.time, label: 'Закрытие обратно ниже E' })
    }
    if (!upperBroken && bar.high > upper) {
      upperBroken = true
      events.push({ time: bar.time, label: 'Пробита внешняя верхняя граница C' })
    }
    if (!lowerBroken && bar.low < lower) {
      lowerBroken = true
      events.push({ time: bar.time, label: 'Пробита нижняя граница D' })
    }
  }
  return {
    bars: candles.length, endTime: last.time,
    closeChangePercent: (last.close / reference - 1) * 100,
    maxDropPercent: (1 - min / reference) * 100,
    maxRisePercent: (max / reference - 1) * 100,
    label: candles.length ? 'Движение после распознавания' : 'Продолжение скрыто', events,
  }
}
