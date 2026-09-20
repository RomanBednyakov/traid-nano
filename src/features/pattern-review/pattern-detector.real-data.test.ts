import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { detectPatterns } from './pattern-detector'
import type { MarketCatalog, MarketDataset } from './types'

describe('detectPatterns on the downloaded market snapshot', () => {
  it('returns frequent causal signals for every configured instrument', async () => {
    const dataDirectory = path.resolve(import.meta.dirname, '../../../public/data/market')
    const catalog = JSON.parse(
      await readFile(path.join(dataDirectory, 'catalog.json'), 'utf8'),
    ) as MarketCatalog

    expect(catalog.instruments).toHaveLength(9)

    for (const instrument of catalog.instruments) {
      for (const timeframe of ['1h', '4h'] as const) {
        const dataset = JSON.parse(
          await readFile(path.join(dataDirectory, `${instrument.slug}-${timeframe}.json`), 'utf8'),
        ) as MarketDataset
        const patterns = detectPatterns(dataset)
        const strict = patterns.filter((pattern) => pattern.strictMatch).length

        console.info(`${instrument.symbol} ${timeframe}: ${patterns.length} signals, ${strict} strict`)
        expect(patterns.length, `${instrument.symbol} ${timeframe}`).toBeGreaterThanOrEqual(30)
        expect(strict).toBe(patterns.length)
        for (const pattern of patterns) {
          expect(pattern.range.endTime).toBe(pattern.formation.endTime)
          expect(pattern.outcome.bars).toBeLessThanOrEqual(timeframe === '1h' ? 40 : 16)
        }

        if (instrument.slug === 'aapl') {
          const earliest = patterns.at(-1)!
          const signalIndex = dataset.candles.findIndex(
            (candle) => candle.time === earliest.formation.endTime,
          )
          const prefixSignals = detectPatterns({
            ...dataset,
            candles: dataset.candles.slice(0, signalIndex + 1),
          })
          expect(prefixSignals.some((signal) => signal.id === earliest.id)).toBe(true)
        }
      }
    }
  }, 20_000)
})
