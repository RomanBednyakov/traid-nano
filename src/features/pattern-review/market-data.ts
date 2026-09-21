import type { MarketCatalog, MarketDataset } from './types'
import { prepareHistory } from './data-integrity'

const datasetCache = new Map<string, MarketDataset>()

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Не удалось загрузить ${url}: HTTP ${response.status}`)
  return response.json() as Promise<T>
}

export function loadMarketCatalog(signal?: AbortSignal) {
  return fetchJson<MarketCatalog>('/data/market/catalog.json', signal)
}

export async function loadMarketDataset(file: string, signal?: AbortSignal) {
  const cached = datasetCache.get(file)
  if (cached) return cached

  // Legacy 4H files grouped every four records, even across missing hours.
  const hourlyFile = file.replace(/-4h\.json$/, '-1h.json')
  const raw = await fetchJson<MarketDataset>(hourlyFile, signal)
  const dataset = prepareHistory(raw, file.endsWith('-4h.json') ? '4h' : '1h')
  datasetCache.set(file, dataset)
  return dataset
}
