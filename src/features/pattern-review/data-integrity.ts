import type { MarketDataset, MarketTimeframe } from './types'

type Candle = MarketDataset['candles'][number]
const ny = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function session(time: number) {
  const parts = Object.fromEntries(ny.formatToParts(new Date(time * 1000)).map(p => [p.type, p.value]))
  return { day: parts.year + '-' + parts.month + '-' + parts.day, minute: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Rebuilds 4H from real 1H OHLC. Never fills gaps or uses a live quote as a bar.
 * US shares/ETFs: regular session anchored 09:30 NY, final group 13:30–16:00.
 * Crypto and gold futures: complete UTC 4-hour buckets (not exchange-session bars).
 */
export function prepareHistory(raw: MarketDataset, interval: MarketTimeframe): MarketDataset {
  if (raw.interval !== '1h') throw new Error('Для подготовки истории требуются исходные свечи 1H')
  const fetched = Date.parse(raw.fetchedAt) / 1000
  if (!Number.isFinite(fetched)) throw new Error('Неизвестна дата загрузки истории')
  const regularSession = raw.category === 'stocks' || raw.category === 'bonds' || raw.symbol === 'GLD'
  const sessions = new Map<number, ReturnType<typeof session>>()
  const sessionAt = (time: number) => {
    if (!sessions.has(time)) sessions.set(time, session(time))
    return sessions.get(time)!
  }
  const hourly = raw.candles.filter((c, i) => {
    if (!Number.isFinite(c.time) || (i && c.time <= raw.candles[i - 1].time)) throw new Error('Нарушен порядок временных меток')
    if (![c.open, c.high, c.low, c.close].every(x => Number.isFinite(x) && x > 0) || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) throw new Error('Некорректная OHLC-свеча')
    if (!regularSession) return c.time % 3600 === 0 && c.time + 3600 <= fetched
    const s = sessionAt(c.time)
    const offset = s.minute - 570
    return c.time % 60 === 0 && offset >= 0 && offset <= 360 && offset % 60 === 0 && c.time + (offset === 360 ? 1800 : 3600) <= fetched
  })

  let candles = hourly
  let droppedBuckets = 0
  if (interval === '4h') {
    const buckets = new Map<string, Candle[]>()
    for (const c of hourly) {
      const s = regularSession ? sessionAt(c.time) : null
      const key = s ? s.day + ':' + Math.floor((s.minute - 570) / 240) : String(Math.floor(c.time / 14400))
      const bucket = buckets.get(key) ?? []
      bucket.push(c)
      buckets.set(key, bucket)
    }
    candles = []
    for (const bucket of buckets.values()) {
      const first = bucket[0]
      const minute = regularSession ? sessionAt(first.time).minute : 0
      const expected = regularSession && minute === 810 ? 3 : 4
      const aligned = regularSession ? minute === 570 || minute === 810 : first.time % 14400 === 0
      if (!aligned || bucket.length !== expected || bucket.some((b, i) => b.time !== first.time + i * 3600)) {
        droppedBuckets++
        continue
      }
      candles.push({ time: first.time, open: first.open, high: Math.max(...bucket.map(b => b.high)), low: Math.min(...bucket.map(b => b.low)), close: bucket.at(-1)!.close })
    }
  }

  const breakBeforeTimes: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1], current = candles[i]
    const delta = current.time - previous.time
    if (raw.category === 'crypto' && delta !== (interval === '1h' ? 3600 : 14400)) breakBeforeTimes.push(current.time)
    // Exchange closures are not data holes. Check intraday gaps without claiming
    // to validate the full holiday/session calendar for these instruments.
    if (regularSession && sessionAt(previous.time).day === sessionAt(current.time).day && delta !== (interval === '1h' ? 3600 : 14400)) breakBeforeTimes.push(current.time)
  }
  return { ...raw, interval, candles, quality: {
    sourceBars: raw.candles.length, excludedHourlyBars: raw.candles.length - hourly.length,
    droppedBuckets, breakBeforeTimes,
    aggregation: interval === '1h' ? '1H источника; закрытые свечи' : regularSession ? '4H от 09:30 New York; последний блок сессии 2,5 часа' : '4H UTC; только полные блоки',
    calendarVerified: raw.category === 'crypto',
  } }
}
