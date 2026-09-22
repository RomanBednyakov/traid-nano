import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectPatterns } from './pattern-detector'
import { prepareHistory } from './data-integrity'
import type { MarketCatalog, MarketDataset } from './types'

describe('downloaded history: geometry and causality, never a count quota', () => {
  it('audits every detected structure on all nine instruments and both timeframes', async () => {
    const directory = path.resolve(import.meta.dirname, '../../../public/data/market')
    const catalog = JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')) as MarketCatalog
    expect(catalog.instruments).toHaveLength(9)
    let checked = 0
    for (const instrument of catalog.instruments) {
      for (const timeframe of ['1h', '4h'] as const) {
        const raw = JSON.parse(await readFile(path.join(directory, instrument.slug + '-1h.json'), 'utf8')) as MarketDataset
        const dataset = prepareHistory(raw, timeframe)
        const patterns = detectPatterns(dataset)
        console.info(instrument.symbol, timeframe, patterns.length, 'structures (not customer-validated)')
        console.info('history quality', dataset.quality)
        expect(new Set(patterns.map(p => p.id)).size).toBe(patterns.length)
        for (const p of patterns.flatMap(first => [first, ...(first.revisions ?? [])])) {
          checked++
          const [a, b, c, d, e, detected] = p.structure.indices
          expect(a < b && b < c && c < d && d < e && e < detected).toBe(true)
          expect(p.structure.mainMove).toBeGreaterThan(p.structure.counterMove)
          expect(p.structure.mainBars).toBeGreaterThan(p.structure.counterBars)
          expect(p.structure.innerPeakPrice).toBeLessThanOrEqual(p.fibLevel)
          expect(p.fibLevel).toBeCloseTo(p.range.high - 0.236 * (p.range.high - p.range.low), 7)
          expect(p.candles.at(-1)?.time).toBe(p.structure.detectedTime)
          expect(p.futureCandles.every(bar => bar.time > p.structure.detectedTime)).toBe(true)
          expect(p.outcome.bars).toBe(p.futureCandles.length)
          for (const bar of dataset.candles.slice(d + 1, detected + 1)) {
            expect(bar.low).toBeGreaterThanOrEqual(p.range.low)
            expect(bar.high).toBeLessThanOrEqual(p.range.high)
          }
        }
        // Earliest, middle, latest: exact metadata must survive truncation.
        const sample = [patterns[0], patterns[Math.floor(patterns.length / 2)], patterns.at(-1)].filter(p => p !== undefined)
        sample.push(...patterns.flatMap(p => p.revisions ?? []))
        for (const p of sample) {
          const prefix = detectPatterns({ ...dataset, candles: dataset.candles.slice(0, p.structure.indices[5] + 1) })
          const found = prefix.flatMap(first => [first, ...(first.revisions ?? [])]).find(other => other.id === p.id && other.structure.detectedTime === p.structure.detectedTime)!
          expect(found).toBeDefined()
          expect(found.structure).toEqual(p.structure)
          expect(found.formation).toEqual(p.formation)
          expect(found.range).toEqual(p.range)
          expect(found.futureCandles).toEqual([])
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  }, 60_000)
})
