import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { PatternReviewPage } from './pattern-review-page'

const mocks = vi.hoisted(() => ({
  loadMarketCatalog: vi.fn(),
  loadMarketDataset: vi.fn(),
  detectPatterns: vi.fn(),
}))

vi.mock('./market-data', () => ({
  loadMarketCatalog: mocks.loadMarketCatalog,
  loadMarketDataset: mocks.loadMarketDataset,
}))

vi.mock('./pattern-detector', () => ({
  detectPatterns: mocks.detectPatterns,
  detectorAssumptions: { fibonacciThreshold: 0.236, formationLengths: { '1h': [2, 3], '4h': [1, 2] } },
}))

vi.mock('./pattern-chart', () => ({
  PatternChart: ({
    pattern,
    showAnnotations,
  }: {
    pattern: { id: string; candles: unknown[] }
    showAnnotations: boolean
  }) => (
    <div data-testid="pattern-chart">
      {pattern.id} · candles:{pattern.candles.length} · annotations:{showAnnotations ? 'on' : 'off'}
    </div>
  ),
}))

const catalog = {
  generatedAt: '2026-09-20T00:00:00.000Z',
  source: 'test',
  instruments: [
    {
      symbol: 'AAPL',
      slug: 'aapl',
      name: 'Apple',
      category: 'stocks',
      currency: 'USD',
      exchange: 'Nasdaq',
      datasets: {
        '1h': { interval: '1h', startDate: '2023-10-01', endDate: '2026-09-18', candleCount: 5083, file: '/data/market/aapl-1h.json' },
        '4h': { interval: '4h', startDate: '2023-10-01', endDate: '2026-09-18', candleCount: 1451, file: '/data/market/aapl-4h.json' },
      },
    },
    {
      symbol: 'GLD',
      slug: 'gld',
      name: 'SPDR Gold Shares',
      category: 'gold',
      currency: 'USD',
      exchange: 'NYSE',
      datasets: {
        '1h': { interval: '1h', startDate: '2023-10-01', endDate: '2026-09-18', candleCount: 5083, file: '/data/market/gld-1h.json' },
        '4h': { interval: '4h', startDate: '2023-10-01', endDate: '2026-09-18', candleCount: 1451, file: '/data/market/gld-4h.json' },
      },
    },
  ],
}

function pattern(id: string, title: string, strictMatch = true) {
  return {
    id,
    symbol: 'AAPL',
    instrumentName: 'Apple',
    title,
    subtitle: 'Реальные часовые данные',
    timeframe: '1H',
    direction: 'short',
    status: strictMatch ? 'valid' : 'warning',
    statusLabel: strictMatch ? 'Все условия выполнены' : 'Близкий кандидат',
    strictMatch,
    score: strictMatch ? 100 : 83,
    eventDate: '20 сент. 2025 г.',
    candles: [{ time: 5, open: 90, close: 90, high: 92, low: 88 }],
    futureCandles: [
      { time: 6, open: 90, close: 96, high: 98, low: 89 },
      { time: 7, open: 96, close: 76, high: 97, low: 75 },
    ],
    structure: { innerPeakTime: 4, innerPeakPrice: 95, detectedTime: 5, confirmationBars: 2, mainBars: 40, counterBars: 16, mainMove: 30, counterMove: 20, radius: 2, indices: [] },
    trend: { startTime: 1, startPrice: 120, endTime: 2, endPrice: 90 },
    counterTrend: { startTime: 2, startPrice: 90, endTime: 3, endPrice: 110 },
    range: { startTime: 3, endTime: 4, high: 110, low: 80 },
    formation: { startTime: 4, endTime: 5, high: 95, low: 82 },
    fibLevel: 102.92,
    metrics: {
      mainTrendDropPercent: 25,
      counterTrendRisePercent: 22,
      formationHeightPercent: 43,
      formationTopDepthPercent: 50,
    },
    outcome: {
      bars: 16,
      endTime: 6,
      closeChangePercent: -4.2,
      maxDropPercent: 8.1,
      maxRisePercent: 1.4,
      label: 'После сигнала преобладало падение',
    },
    explanation: 'Описание',
    verdict: 'Вывод',
    criteria: [
      { label: 'Основной тренд вниз', detail: 'Описание', value: '25%', passed: true },
    ],
  }
}

const detectedPatterns = [
  pattern('aapl-first', 'AAPL: первый найденный участок'),
  pattern('aapl-second', 'AAPL: второй найденный участок'),
]

function renderPage() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <PatternReviewPage />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.loadMarketCatalog.mockReset().mockResolvedValue(catalog)
  mocks.loadMarketDataset.mockReset().mockResolvedValue({ slug: 'aapl', candles: [] })
  mocks.detectPatterns.mockReset().mockReturnValue(detectedPatterns)
})

describe('PatternReviewPage', () => {
  it('shows the full continuation by default and still supports candle replay', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('AAPL · внутренняя вершина')
    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('candles:3')
    expect(screen.getByText('Макс. падение')).toBeInTheDocument()
    expect(screen.getByText(/Пробита нижняя граница D/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Скрыть продолжение' }))
    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('candles:1')
    await user.click(screen.getByRole('button', { name: '+1 свеча' }))
    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('candles:2')
    expect(screen.queryByText(/Пробита нижняя граница D/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('aapl-second · candles:3')
  })

  it('shows an honest empty result, not an endless search', async () => {
    mocks.detectPatterns.mockReturnValue([])
    renderPage()
    expect(await screen.findByText('0 формаций')).toBeInTheDocument()
    expect(screen.getByText('Подходящих формаций пока нет.')).toBeInTheDocument()
    expect(screen.queryByText('Ищем формации…')).not.toBeInTheDocument()
  })

  it('loads real-data candidates and moves to the next match', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('AAPL · внутренняя вершина')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('aapl-second')
  })

  it('hides and restores chart annotations', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('AAPL · внутренняя вершина')
    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('annotations:on')
    await user.click(screen.getByRole('button', { name: 'Скрыть разметку' }))
    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('annotations:off')
    await user.click(screen.getByRole('button', { name: 'Показать разметку' }))
    expect(screen.getByTestId('pattern-chart')).toHaveTextContent('annotations:on')
  })

  it('supports arrow-key navigation and wraps backwards', async () => {
    renderPage()
    await screen.findByText('AAPL · внутренняя вершина')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('pattern-chart')).toHaveTextContent('aapl-second'))
    expect(screen.getByRole('button', { name: 'Сначала' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByTestId('pattern-chart')).toHaveTextContent('aapl-first'))
  })
})
