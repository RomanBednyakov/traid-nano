import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, LineChart, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

type MarketGroup = 'Крипто' | 'Валюты' | 'Акции' | 'Товары'

interface MarketInstrument {
  symbol: string
  ticker: string
  name: string
  group: MarketGroup
  venue: string
  session: string
}

const instruments: MarketInstrument[] = [
  { symbol: 'BINANCE:BTCUSDT', ticker: 'BTC / USDT', name: 'Bitcoin', group: 'Крипто', venue: 'Binance', session: '24/7' },
  { symbol: 'BINANCE:ETHUSDT', ticker: 'ETH / USDT', name: 'Ethereum', group: 'Крипто', venue: 'Binance', session: '24/7' },
  { symbol: 'BINANCE:SOLUSDT', ticker: 'SOL / USDT', name: 'Solana', group: 'Крипто', venue: 'Binance', session: '24/7' },
  { symbol: 'FX_IDC:USDRUB', ticker: 'USD / RUB', name: 'Доллар / рубль', group: 'Валюты', venue: 'IDC', session: 'Будни' },
  { symbol: 'FX:EURUSD', ticker: 'EUR / USD', name: 'Евро / доллар', group: 'Валюты', venue: 'FX', session: 'Будни' },
  { symbol: 'TVC:DXY', ticker: 'DXY', name: 'Индекс доллара', group: 'Валюты', venue: 'TVC', session: 'Будни' },
  { symbol: 'NASDAQ:NVDA', ticker: 'NVDA', name: 'NVIDIA', group: 'Акции', venue: 'Nasdaq', session: 'Будни' },
  { symbol: 'NASDAQ:AAPL', ticker: 'AAPL', name: 'Apple', group: 'Акции', venue: 'Nasdaq', session: 'Будни' },
  { symbol: 'NASDAQ:MSFT', ticker: 'MSFT', name: 'Microsoft', group: 'Акции', venue: 'Nasdaq', session: 'Будни' },
  { symbol: 'COMEX:GC1!', ticker: 'GOLD', name: 'Фьючерс на золото', group: 'Товары', venue: 'COMEX', session: 'Будни' },
]

const groups: MarketGroup[] = ['Крипто', 'Валюты', 'Акции', 'Товары']
const intervals = [
  { value: '5', label: '5м' },
  { value: '15', label: '15м' },
  { value: '60', label: '1ч' },
  { value: '240', label: '4ч' },
  { value: 'D', label: '1д' },
] as const

function TradingViewChart({ symbol, interval }: { symbol: string; interval: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.replaceChildren()

    const widget = document.createElement('div')
    widget.className = 'tradingview-widget-container__widget h-full w-full'
    const copyright = document.createElement('div')
    copyright.className = 'tradingview-widget-copyright sr-only'
    copyright.textContent = 'График предоставлен TradingView'
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Europe/Moscow',
      theme: 'dark',
      style: '1',
      locale: 'ru',
      backgroundColor: 'rgba(7, 16, 17, 1)',
      gridColor: 'rgba(32, 48, 50, 0.55)',
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    })

    container.append(widget, copyright, script)
    return () => container.replaceChildren()
  }, [interval, symbol])

  return <div ref={containerRef} className="tradingview-widget-container h-full min-h-[520px] w-full" aria-label="Интерактивный график TradingView" />
}

export function MarketTerminalPage() {
  const [selectedSymbol, setSelectedSymbol] = useState(instruments[0].symbol)
  const [interval, setInterval] = useState('60')
  const [query, setQuery] = useState('')
  const selected = instruments.find((item) => item.symbol === selectedSymbol) ?? instruments[0]
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU')
    if (!normalized) return instruments
    return instruments.filter((item) => `${item.ticker} ${item.name} ${item.venue}`.toLocaleLowerCase('ru-RU').includes(normalized))
  }, [query])

  return (
    <div className="min-h-screen bg-[#071011] text-[#e8f0ef]">
      <header className="border-b border-[#203032] bg-[#081214]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1720px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-5">
            <Link to="/market" className="flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-white">
              <span className="flex size-8 items-center justify-center rounded-lg bg-teal-400 text-[#071011]"><LineChart className="size-4" aria-hidden="true" /></span>
              KOLA
            </Link>
            <nav className="hidden items-center gap-1 text-sm sm:flex" aria-label="Основная навигация">
              <Link to="/market" className="rounded-lg bg-[#17302f] px-3 py-2 text-teal-200">Рынок</Link>
              <Link to="/mocks/pattern-review" className="rounded-lg px-3 py-2 text-[#829695] transition hover:bg-[#122123] hover:text-white">Разбор формаций</Link>
            </nav>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#829695]">
            <span className="size-2 rounded-full bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.7)]" />
            Данные TradingView
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1720px] gap-4 p-4 sm:p-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-[#203032] bg-[#0b1517] xl:min-h-[calc(100vh-7rem)]">
          <div className="border-b border-[#203032] p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#607675]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти инструмент" className="h-10 w-full rounded-xl border border-[#26393a] bg-[#091315] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[#607675] focus:border-teal-400/70 focus:ring-2 focus:ring-teal-400/10" />
            </label>
          </div>
          <div className="max-h-[calc(100vh-10.5rem)] overflow-y-auto p-2">
            {groups.map((group) => {
              const groupItems = filtered.filter((item) => item.group === group)
              if (!groupItems.length) return null
              return (
                <section key={group} className="mb-3" aria-labelledby={`group-${group}`}>
                  <h2 id={`group-${group}`} className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.14em] text-[#607675]">{group}</h2>
                  <div className="space-y-1">
                    {groupItems.map((item) => {
                      const active = item.symbol === selectedSymbol
                      return (
                        <button key={item.symbol} type="button" onClick={() => setSelectedSymbol(item.symbol)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${active ? 'bg-[#17302f] text-white ring-1 ring-teal-400/25' : 'text-[#b8c8c6] hover:bg-[#112022] hover:text-white'}`}>
                          <span><span className="block text-sm font-semibold">{item.ticker}</span><span className="mt-0.5 block text-xs text-[#738987]">{item.name}</span></span>
                          <span className="text-[11px] text-[#607675]">{item.venue}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
            {!filtered.length ? <p className="px-3 py-8 text-center text-sm text-[#738987]">Ничего не найдено</p> : null}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-[#203032] bg-[#0b1517]">
          <div className="flex flex-col gap-4 border-b border-[#203032] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight text-white">{selected.ticker}</h1><span className="rounded-md bg-[#162729] px-2 py-1 text-xs text-[#91a5a3]">{selected.venue}</span><span className="rounded-md bg-teal-400/10 px-2 py-1 text-xs text-teal-300">{selected.session}</span></div>
              <p className="mt-1 text-sm text-[#738987]">{selected.name} · интерактивный график</p>
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#26393a] bg-[#091315] p-1">
              {intervals.map((item) => <button key={item.value} type="button" onClick={() => setInterval(item.value)} className={`min-w-10 rounded-lg px-2.5 py-2 text-sm font-medium transition ${interval === item.value ? 'bg-teal-400 text-[#061112]' : 'text-[#829695] hover:bg-[#152426] hover:text-white'}`}>{item.label}</button>)}
            </div>
          </div>
          <div className="h-[calc(100vh-13.5rem)] min-h-[540px] bg-[#071011]"><TradingViewChart symbol={selected.symbol} interval={interval} /></div>
          <footer className="flex flex-col gap-2 border-t border-[#203032] px-4 py-3 text-xs text-[#738987] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p>Биржевые данные могут отображаться с задержкой — точный статус указан внутри графика.</p>
            <Button asChild variant="ghost" size="sm" className="h-8 justify-start px-2 text-[#91a5a3] hover:bg-[#162729] hover:text-white"><a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(selected.symbol)}`} target="_blank" rel="noreferrer">Открыть в TradingView <ExternalLink className="size-3.5" /></a></Button>
          </footer>
        </section>
      </main>
    </div>
  )
}
