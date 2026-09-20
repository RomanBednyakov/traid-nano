import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { detectPatterns } from './pattern-detector'
import type { MarketCatalog, MarketDataset } from './types'

describe('detectPatterns on the downloaded market snapshot', () => {
  it('returns navigable candidates for every configured instrument', async () => {
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

        console.info(`${instrument.symbol} ${timeframe}: ${patterns.length} candidates, ${strict} strict`)
        expect(patterns.length, `${instrument.symbol} ${timeframe}`).toBeGreaterThan(0)
      }
    }
  })
})
