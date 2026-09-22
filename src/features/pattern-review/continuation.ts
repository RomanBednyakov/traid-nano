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
  let state: PatternCase['outcome']['state'] = 'waiting'
  const labels: Record<PatternCase['outcome']['state'], string> = {
    waiting: 'Ожидание выноса фиксированного уровня E',
    swept: 'Уровень E вынесен; возврат ещё не наблюдался',
    returned: 'После выноса есть закрытие ниже E — не подтверждение сделки',
    cancelled: 'Постановка отменена: нижняя граница достигнута до возврата',
    invalidated: 'Постановка завершена: внешняя вершина C пробита',
    'target-reached': 'Нижняя граница достигнута после наблюдаемого возврата',
    ambiguous: 'Порядок событий внутри свечи неоднозначен',
  }
  for (const bar of candles) {
    if (bar.high > upper && bar.low <= lower) {
      state = 'ambiguous'
      events.push({ time: bar.time, label: 'Обе внешние границы достигнуты: порядок внутри свечи неизвестен; постановка завершена' })
      break
    }
    if (bar.high > upper) {
      state = 'invalidated'
      events.push({ time: bar.time, label: 'Пробита внешняя верхняя граница C; постановка завершена' })
      break
    }
    // A touch already consumes the lower target. Never resurrect this setup on
    // subsequent bars. OHLC cannot resolve a sweep/return and target in one bar.
    if (bar.low <= lower) {
      if (state === 'returned') state = 'target-reached'
      else if (bar.high > inner || (state === 'swept' && bar.close < inner)) state = 'ambiguous'
      else state = 'cancelled'
      events.push({ time: bar.time, label: labels[state] })
      break
    }
    if (state === 'waiting' && bar.high > inner) {
      state = 'swept'
      events.push({ time: bar.time, label: 'Вынос внутренней вершины E' })
    }
    if (state === 'swept' && bar.close < inner) {
      state = 'returned'
      events.push({ time: bar.time, label: 'Закрытие обратно ниже E' })
    }
  }
  return {
    bars: candles.length, endTime: last.time,
    closeChangePercent: (last.close / reference - 1) * 100,
    maxDropPercent: (1 - min / reference) * 100,
    maxRisePercent: (max / reference - 1) * 100,
    state, label: candles.length ? labels[state] : 'Продолжение скрыто', events,
  }
}
