import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { RazvorotkaPage } from './razvorotka-page'

const mocks = vi.hoisted(() => ({
  loadMarketCatalog: vi.fn(), loadMarketDataset: vi.fn(), prepareHistory: vi.fn(), detectRazvorotka: vi.fn(), dailyContext: vi.fn(), fourHourContext: vi.fn(),
}))
vi.mock('@/features/pattern-review/market-data', () => ({ loadMarketCatalog: mocks.loadMarketCatalog, loadMarketDataset: mocks.loadMarketDataset }))
vi.mock('@/features/pattern-review/data-integrity', () => ({ prepareHistory: mocks.prepareHistory }))
vi.mock('./razvorotka-detector', () => ({ detectRazvorotka: mocks.detectRazvorotka, dailyContext: mocks.dailyContext, fourHourContext: mocks.fourHourContext }))
vi.mock('./razvorotka-chart', () => ({ RazvorotkaChart: ({ pattern, revealed, showAnnotations, focusOnSignal }: { pattern: { id: string }; revealed: number; showAnnotations: boolean; focusOnSignal: boolean }) => <div data-testid="razvorotka-chart">{pattern.id} · {revealed} · {showAnnotations ? 'on' : 'off'} · {focusOnSignal ? 'focus' : 'overview'}</div> }))

const catalog = { instruments: [{ symbol: 'AAPL', slug: 'aapl', name: 'Apple', category: 'stocks', datasets: {
  '1h': { file: '/data/market/aapl-1h.json', startDate: '2025-01-01', endDate: '2026-01-01' },
  '4h': { file: '/data/market/aapl-4h.json', startDate: '2025-01-01', endDate: '2026-01-01' },
} }] }
const twoInstrumentCatalog = { ...catalog, instruments: [...catalog.instruments, { symbol: 'MSFT', slug: 'msft', name: 'Microsoft', category: 'stocks', datasets: {
  '1h': { file: '/data/market/msft-1h.json', startDate: '2025-01-01', endDate: '2026-01-01' },
  '4h': { file: '/data/market/msft-4h.json', startDate: '2025-01-01', endDate: '2026-01-01' },
} }] }
const candle = (time: number) => ({ time, open: 100, high: 103, low: 98, close: 101 })
const hourly = { slug: 'aapl', interval: '1h', candles: [candle(1)], quality: { aggregation: 'test', breakBeforeTimes: [] } }
const caseData = (id: string) => ({
  id, symbol: 'AAPL', timeframe: '1h', direction: 'short', detectedTime: 3,
  source: { start: 1, end: 2, high: 110, low: 100 },
  breakout: { start: 3, end: 4, high: 113, low: 110 },
  cancellation: { start: 5, end: 6, high: 110, low: 100 },
  sourceBars: 12, holdBars: 2, breakoutDepthPercent: 30, coveragePercent: 100,
  stop: 113.1, target: 100, riskReward: 3.2, entryZone: 110,
  entryOptions: [{ label: 'Ретест границы', price: 110, riskReward: 3.2 }],
  context: ['Консолидация ≥ 12 свечей'], uncertainties: ['Контекст требует проверки'],
  candles: [candle(1)], futureCandles: [candle(2), candle(3)],
})

function renderPage() { return render(<MemoryRouter><TooltipProvider><RazvorotkaPage /></TooltipProvider></MemoryRouter>) }

beforeEach(() => {
  mocks.loadMarketCatalog.mockReset().mockResolvedValue(catalog)
  mocks.loadMarketDataset.mockReset().mockResolvedValue(hourly)
  mocks.prepareHistory.mockReset().mockImplementation(dataset => ({ ...dataset, interval: '4h' }))
  mocks.dailyContext.mockReset().mockReturnValue([])
  mocks.fourHourContext.mockReset().mockReturnValue([])
  mocks.detectRazvorotka.mockReset().mockImplementation(dataset => dataset.interval === '1h' ? [caseData('first'), caseData('second')] : [])
})

describe('Разворотка page', () => {
  it('shows the available continuation for a short history and allows candle replay', async () => {
    renderPage()
    expect(await screen.findByText('AAPL · «Разворотка» short')).toBeInTheDocument()
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 2 · on')
    expect(screen.getByText(/справа: 2 из 2 свечи после сигнала/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Вся дальнейшая история' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть продолжение' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 0 · on')
    fireEvent.click(screen.getByRole('button', { name: '+1 свеча' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 1 · on')
    fireEvent.click(screen.getByRole('button', { name: 'Ближайшие 2 свечи' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 2 · on')
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть разметку' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 2 · off')
    fireEvent.click(screen.getByRole('button', { name: 'Приблизить сигнал' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 2 · off · focus')
    fireEvent.click(screen.getByRole('button', { name: 'Показать весь график' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 2 · off · overview')
    fireEvent.click(screen.getByRole('button', { name: 'Приблизить сигнал' }))
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('second · 2 · off · overview')
  })

  it('previews 80 hourly or 40 four-hour bars and can reveal the entire saved continuation', async () => {
    mocks.detectRazvorotka.mockImplementation(dataset => [{
      ...caseData(`${dataset.interval}-case`),
      timeframe: dataset.interval,
      futureCandles: Array.from({ length: dataset.interval === '1h' ? 105 : 55 }, (_, i) => candle(i + 10)),
    }])
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '1 час' }))
    await waitFor(() => expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('1h-case · 80 · on'))
    expect(screen.getByText('Открыто 80 из 105 следующих свечей')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Вся дальнейшая история' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('1h-case · 105 · on')
    expect(screen.getByText('Открыто 105 из 105 следующих свечей')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ближайшие 80 свечей' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('1h-case · 80 · on')

    fireEvent.click(screen.getByRole('button', { name: '4 часа' }))
    await waitFor(() => expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('4h-case · 40 · on'))
    expect(screen.getByText('Открыто 40 из 55 следующих свечей')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Вся дальнейшая история' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('4h-case · 55 · on')
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть продолжение' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('4h-case · 0 · on')
    fireEvent.click(screen.getByRole('button', { name: '+1 свеча' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('4h-case · 1 · on')
  })

  it('shows an honest empty result and switches timeframe', async () => {
    mocks.detectRazvorotka.mockReturnValue([])
    renderPage()
    expect(await screen.findByText('Подходящих формаций пока нет.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '4 часа' }))
    await waitFor(() => expect(mocks.prepareHistory).toHaveBeenCalledTimes(2))
    expect(screen.getByText('0 кандидатов')).toBeInTheDocument()
  })

  it('combines instruments and timeframes, then filters the cached cases', async () => {
    mocks.loadMarketCatalog.mockResolvedValue(twoInstrumentCatalog)
    mocks.loadMarketDataset.mockImplementation(file => Promise.resolve({ ...hourly, slug: file.includes('msft') ? 'msft' : 'aapl' }))
    mocks.detectRazvorotka.mockImplementation(dataset => [{
      ...caseData(`${dataset.slug}-${dataset.interval}`),
      symbol: dataset.slug === 'msft' ? 'MSFT' : 'AAPL',
      timeframe: dataset.interval,
    }])
    renderPage()
    expect(await screen.findByText(/Выборка: 2 инструмента · 1H: 2 · 4H: 2/)).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.getAttribute('aria-live') === 'polite' && element.textContent?.trim() === '4 кандидата')).toBeInTheDocument()
    expect(mocks.detectRazvorotka).toHaveBeenCalledTimes(4)
    fireEvent.click(screen.getByRole('button', { name: '4 часа' }))
    await waitFor(() => expect(screen.getByText((_, element) => element?.getAttribute('aria-live') === 'polite' && element.textContent?.trim() === '2 кандидата')).toBeInTheDocument())
    expect(mocks.detectRazvorotka).toHaveBeenCalledTimes(4)
  })
})
