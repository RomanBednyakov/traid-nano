import type { MarketCatalog, MarketDataset } from './types'

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

  const dataset = await fetchJson<MarketDataset>(file, signal)
  datasetCache.set(file, dataset)
  return dataset
}
