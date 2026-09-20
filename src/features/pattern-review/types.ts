import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'

export type MarketCategory = 'stocks' | 'gold' | 'bonds' | 'crypto'
export type MarketTimeframe = '1h' | '4h'
export type PatternStatus = 'valid' | 'warning'

export interface MarketDatasetMeta {
  interval: MarketTimeframe
  startDate: string
  endDate: string
  candleCount: number
  file: string
}

export interface MarketInstrument {
  symbol: string
  slug: string
  name: string
  category: MarketCategory
  currency: string
  exchange: string
  datasets: Record<MarketTimeframe, MarketDatasetMeta>
}

export interface MarketCatalog {
  generatedAt: string
  source: string
  instruments: MarketInstrument[]
}

export interface MarketDataset extends Omit<MarketInstrument, 'datasets'> {
  interval: MarketTimeframe
  adjusted: boolean
  source: string
  fetchedAt: string
  candles: CandlestickData<UTCTimestamp>[]
}

export interface PatternCriterion {
  label: string
  detail: string
  value: string
  passed: boolean
}

export interface PatternMockCase {
  id: string
  symbol: string
  title: string
  subtitle: string
  timeframe: '1h' | '4h'
  direction: 'long' | 'short'
  status: 'valid' | 'warning' | 'invalid'
  statusLabel: string
  expectedMatch: boolean
  candles: CandlestickData<UTCTimestamp>[]
  range: { startTime: UTCTimestamp; endTime: UTCTimestamp; high: number; low: number }
  internalLevel: number
  outerLevel: number
  sweep: { time: UTCTimestamp; price: number; label: string }
  entry: number
  stop: number
  target: number
  explanation: string
  verdict: string
  criteria: Array<{ label: string; detail: string; passed: boolean }>
}

export interface PatternCase {
  id: string
  symbol: string
  instrumentName: string
  title: string
  subtitle: string
  timeframe: '1H' | '4H'
  direction: 'short'
  status: PatternStatus
  statusLabel: string
  strictMatch: boolean
  score: number
  eventDate: string
  candles: CandlestickData<UTCTimestamp>[]
  trend: {
    startTime: UTCTimestamp
    startPrice: number
    endTime: UTCTimestamp
    endPrice: number
  }
  counterTrend: {
    startTime: UTCTimestamp
    startPrice: number
    endTime: UTCTimestamp
    endPrice: number
  }
  range: {
    startTime: UTCTimestamp
    endTime: UTCTimestamp
    high: number
    low: number
  }
  formation: {
    startTime: UTCTimestamp
    endTime: UTCTimestamp
    high: number
    low: number
  }
  fibLevel: number
  metrics: {
    mainTrendDropPercent: number
    counterTrendRisePercent: number
    formationHeightPercent: number
    formationTopDepthPercent: number
  }
  explanation: string
  verdict: string
  criteria: PatternCriterion[]
}
