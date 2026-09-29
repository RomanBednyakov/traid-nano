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
vi.mock('./razvorotka-chart', () => ({ RazvorotkaChart: ({ pattern, revealed, showAnnotations }: { pattern: { id: string }; revealed: number; showAnnotations: boolean }) => <div data-testid="razvorotka-chart">{pattern.id} · {revealed} · {showAnnotations ? 'on' : 'off'}</div> }))

const catalog = { instruments: [{ symbol: 'AAPL', slug: 'aapl', name: 'Apple', category: 'stocks', datasets: {
  '1h': { file: '/data/market/aapl-1h.json', startDate: '2025-01-01', endDate: '2026-01-01' },
  '4h': { file: '/data/market/aapl-4h.json', startDate: '2025-01-01', endDate: '2026-01-01' },
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
  mocks.prepareHistory.mockReset().mockReturnValue({ ...hourly, interval: '4h' })
  mocks.dailyContext.mockReset().mockReturnValue([])
  mocks.fourHourContext.mockReset().mockReturnValue([])
  mocks.detectRazvorotka.mockReset().mockReturnValue([caseData('first'), caseData('second')])
})

describe('Разворотка page', () => {
  it('navigates cases, replays only revealed candles and toggles annotations', async () => {
    renderPage()
    expect(await screen.findByText('AAPL · «Разворотка» short')).toBeInTheDocument()
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 2 · on')
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть продолжение' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 0 · on')
    fireEvent.click(screen.getByRole('button', { name: '+1 свеча' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 1 · on')
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть разметку' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('first · 1 · off')
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getByTestId('razvorotka-chart')).toHaveTextContent('second · 2 · off')
  })

  it('shows an honest empty result and switches timeframe', async () => {
    mocks.detectRazvorotka.mockReturnValue([])
    renderPage()
    expect(await screen.findByText('Подходящих формаций пока нет.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '4 часа' }))
    await waitFor(() => expect(mocks.prepareHistory).toHaveBeenCalledTimes(2))
    expect(screen.getByText('0 кандидатов')).toBeInTheDocument()
  })
})
