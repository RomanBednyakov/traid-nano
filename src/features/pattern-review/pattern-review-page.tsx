import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  LineChart,
  LoaderCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { loadMarketCatalog, loadMarketDataset } from './market-data'
import { describeContinuation } from './continuation'
import { detectPatterns } from './pattern-detector'
import { PatternChart } from './pattern-chart'
import type {
  MarketCatalog,
  MarketDataset,
  MarketCategory,
  MarketTimeframe,
  PatternCase,
} from './types'

const categoryLabels: Record<MarketCategory, string> = {
  stocks: 'Акции',
  gold: 'Золото',
  bonds: 'Облигации',
  crypto: 'Криптовалюты',
}

const categoryOrder: MarketCategory[] = ['stocks', 'gold', 'bonds', 'crypto']

const legend = [
  { color: '#4ade80', title: 'Основной тренд', text: 'направлен вниз' },
  { color: '#60a5fa', title: 'Локальный контртренд', text: 'движение вверх к вершине диапазона' },
  { color: '#fb7185', title: 'Красные линии', text: 'верхняя и нижняя границы диапазона' },
  { color: '#fbbf24', title: 'Внутренняя структура D–E', text: 'подъём к внутренней вершине' },
  { color: '#a78bfa', title: '0,236 от верха', text: 'рабочая трактовка эталонов' },
]

const formatPeriod = (value?: string) => value
  ? new Date(value).toLocaleDateString('ru-RU', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  : '—'

export function PatternReviewPage() {
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null)
  const [selectedSlug, setSelectedSlug] = useState('aapl')
  const [timeframe, setTimeframe] = useState<MarketTimeframe>('1h')
  const [patterns, setPatterns] = useState<PatternCase[]>([])
  const [loadedDataset, setLoadedDataset] = useState<MarketDataset | null>(null)
  const [index, setIndex] = useState(0)
  const [replay, setReplay] = useState({ key: '', bars: 0 })
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [status, setStatus] = useState<'catalog' | 'loading' | 'ready' | 'empty' | 'error'>('catalog')

  useEffect(() => {
    const controller = new AbortController()
    loadMarketCatalog(controller.signal)
      .then((nextCatalog) => {
        if (controller.signal.aborted) return
        setCatalog(nextCatalog)
        setSelectedSlug(current => nextCatalog.instruments.some(item => item.slug === current) ? current : nextCatalog.instruments[0]?.slug ?? '')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [])

  const selectedInstrument = useMemo(
    () => catalog?.instruments.find((item) => item.slug === selectedSlug),
    [catalog, selectedSlug],
  )
  const selectedDataset = selectedInstrument?.datasets[timeframe]

  useEffect(() => {
    if (!selectedDataset) return
    const controller = new AbortController()
    setStatus('loading')
    setPatterns([])
    setLoadedDataset(null)
    setIndex(0)

    loadMarketDataset(selectedDataset.file, controller.signal)
      .then((dataset) => {
        if (controller.signal.aborted) return
        const matches = detectPatterns(dataset)
        setLoadedDataset(dataset)
        setPatterns(matches)
        setStatus(matches.length ? 'ready' : 'empty')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })

    return () => controller.abort()
  }, [selectedDataset])

  const move = useCallback((direction: number) => {
    if (!patterns.length) return
    setIndex((value) => (value + direction + patterns.length) % patterns.length)
    setReplay({ key: '', bars: 0 })
  }, [patterns.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[role="listbox"], [role="combobox"], input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [move])

  const pattern = patterns[index]
  const caseKey = selectedSlug + ':' + timeframe + ':' + pattern?.id
  const replayKey = caseKey + ':' + pattern?.structure.detectedTime
  const revealed = replay.key === replayKey
    ? replay.bars
    : pattern?.futureCandles.length ?? 0
  const displayPattern = useMemo(() => pattern ? {
    ...pattern, candles: [...pattern.candles, ...pattern.futureCandles.slice(0, revealed)],
  } : undefined, [pattern, revealed])
  const visibleOutcome = useMemo(() => pattern ? describeContinuation(
    pattern.candles.at(-1)!, pattern.futureCandles.slice(0, revealed),
    pattern.range.high, pattern.range.low, pattern.structure.innerPeakPrice,
  ) : undefined, [pattern, revealed])
  const passed = useMemo(
    () => pattern?.criteria.filter((item) => item.passed).length ?? 0,
    [pattern],
  )

  return (
    <div className="min-h-screen bg-[#071011] text-[#e8f0ef]">
      <header className="border-b border-[#203032] bg-[#081214]">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center px-4 sm:px-6">
          <div className="flex items-center gap-5">
            <Link to="/market" className="flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-white">
              <span className="flex size-8 items-center justify-center rounded-lg bg-teal-400 text-[#071011]">
                <LineChart className="size-4" />
              </span>
              KOLA
            </Link>
            <nav className="flex items-center gap-1 text-sm" aria-label="Основная навигация">
              <Link to="/market" className="rounded-lg px-3 py-2 text-[#829695] hover:bg-[#122123] hover:text-white">Рынок</Link>
              <Link to="/mocks/pattern-review" className="rounded-lg bg-[#17302f] px-3 py-2 text-teal-200">Разбор формаций</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1560px] p-4 sm:p-6">
        <section className="mb-4 grid gap-4 rounded-2xl border border-[#203032] bg-[#0b1517] p-4 lg:grid-cols-[minmax(260px,420px)_auto_1fr] lg:items-end">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607675]">
              Торговый инструмент
            </label>
            <Select value={selectedSlug} onValueChange={(slug) => { setSelectedSlug(slug); setReplay({ key: '', bars: 0 }) }} disabled={!catalog}>
              <SelectTrigger aria-label="Торговый инструмент" className="h-11 w-full border-[#2b4042] bg-[#091315] text-white">
                <SelectValue placeholder="Выбрать инструмент" />
              </SelectTrigger>
              <SelectContent>
                {categoryOrder.map((category) => {
                  const instruments = catalog?.instruments.filter((item) => item.category === category) ?? []
                  if (!instruments.length) return null
                  return (
                    <SelectGroup key={category}>
                      <SelectLabel>{categoryLabels[category]}</SelectLabel>
                      {instruments.map((instrument) => (
                        <SelectItem key={instrument.slug} value={instrument.slug}>
                          {instrument.symbol} · {instrument.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607675]">
              Таймфрейм
            </div>
            <div className="grid grid-cols-2 rounded-xl border border-[#2b4042] bg-[#091315] p-1">
              {(['1h', '4h'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setTimeframe(item); setReplay({ key: '', bars: 0 }) }}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${timeframe === item ? 'bg-teal-400 text-[#061112]' : 'text-[#829695] hover:text-white'}`}
                >
                  {item === '1h' ? '1 час' : '4 часа'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <span className="rounded-lg border border-[#2b4042] bg-[#091315] px-3 py-2 text-xs text-[#829695]">
              История: <strong className="font-medium text-white">{formatPeriod(selectedDataset?.startDate)} — {formatPeriod(selectedDataset?.endDate)}</strong>
            </span>
            <span className="rounded-lg border border-[#2b4042] bg-[#091315] px-3 py-2 text-xs text-[#829695]">
              Проверено: <strong className="font-medium text-white">{loadedDataset?.candles.length.toLocaleString('ru-RU') ?? '—'} свечей</strong>
            </span>
            <span className="rounded-lg border border-teal-400/20 bg-teal-400/10 px-3 py-2 text-xs text-teal-200">
              {status === 'ready' ? <><strong>{patterns.length}</strong> кандидатов</> : status === 'empty' ? '0 кандидатов' : status === 'error' ? 'Ошибка загрузки' : 'Ищем формации…'}
            </span>
          </div>
        </section>

        {loadedDataset?.quality && <details className="mb-4 rounded-xl border border-[#203032] px-4 py-3 text-xs text-[#9badaa]">
          <summary className="cursor-pointer">О данных · {loadedDataset.quality.aggregation}{loadedDataset.quality.breakBeforeTimes.length > 0 ? ` · разрывов: ${loadedDataset.quality.breakBeforeTimes.length}` : ''}</summary>
          <p className="mt-2 leading-5">Исключено незакрытых или вне сетки 1H: {loadedDataset.quality.excludedHourlyBars}. Неполных блоков 4H: {loadedDataset.quality.droppedBuckets}. Поиск не соединяет участки через обнаруженные пропуски.</p>
          {!loadedDataset.quality.calendarVerified && <p className="mt-2 leading-5">Полнота истории по календарю биржи пока не проверена. Для фьючерса на золото границы 4H заданы по UTC.</p>}
        </details>}

        {status !== 'ready' || !pattern ? (
          <div className="flex min-h-[560px] items-center justify-center rounded-2xl border border-[#203032] bg-[#0b1517] p-6 text-center text-[#829695]">
            <div>
              {status === 'error'
                ? <AlertTriangle className="mx-auto mb-4 size-7 text-rose-400" />
                : status === 'empty' ? <LineChart className="mx-auto mb-4 size-7 text-[#829695]" /> : <LoaderCircle className="mx-auto mb-4 size-7 animate-spin text-teal-400" />}
              <p>
                {status === 'catalog' || status === 'loading'
                  ? 'Ищем формации в рыночных данных…'
                  : status === 'empty'
                    ? 'Подходящих формаций пока нет.'
                    : 'Не удалось загрузить данные.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-[#203032] bg-[#0b1517]">
              <div className="flex flex-col gap-3 border-b border-[#203032] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-teal-300">
                    Случай {index + 1} из {patterns.length} · {pattern.timeframe}
                  </div>
                  <h1 className="text-xl font-semibold text-white">{pattern.symbol} · внутренняя вершина</h1>
                  <p className="mt-1 text-sm text-[#829695]">Свеча распознавания: {pattern.eventDate} UTC</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAnnotations((value) => !value)}
                  className="border-[#2b4042] bg-transparent"
                >
                  {showAnnotations ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {showAnnotations ? 'Скрыть разметку' : 'Показать разметку'}
                </Button>
              </div>
              <div className="border-b border-[#203032] px-5 py-3 text-xs leading-5 text-[#9badaa]">
                Уровни C, D и E зафиксированы при первом обнаружении. Продолжение не передвигает границы; после отмены эта постановка не возобновляется.
              </div>
              <PatternChart key={pattern.id} pattern={displayPattern!} showAnnotations={showAnnotations} />
              <div className="flex flex-wrap items-center gap-2 border-t border-[#203032] p-4">
                <Button variant="outline" size="sm" disabled={!pattern.futureCandles.length || revealed === pattern.futureCandles.length}
                  onClick={() => setReplay({ key: replayKey, bars: pattern.futureCandles.length })}>Показать продолжение</Button>
                <Button variant="outline" size="sm" disabled={revealed >= pattern.futureCandles.length}
                  onClick={() => setReplay({ key: replayKey, bars: revealed + 1 })}>+1 свеча</Button>
                <Button variant="ghost" size="sm" disabled={!revealed}
                  onClick={() => setReplay({ key: replayKey, bars: 0 })}>Скрыть продолжение</Button>
                <span className="text-xs text-[#829695]" aria-live="polite">
                  {pattern.futureCandles.length ? `Открыто ${revealed} из ${pattern.futureCandles.length} следующих свечей` : 'Данных о продолжении нет'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#203032] p-4 text-xs text-[#829695]">
                {legend.map((item) => (
                  <div key={item.title} className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
                    <span className="font-medium text-white">{item.title}</span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="flex flex-col rounded-2xl border border-[#203032] bg-[#0b1517] p-5">
              <div className={`rounded-xl border p-4 ${pattern.strictMatch ? 'border-teal-400/20 bg-teal-400/10' : 'border-amber-400/20 bg-amber-400/10'}`}>
                <div className="flex items-center gap-2">
                  {pattern.strictMatch ? <CheckCircle2 className="size-5 text-teal-300" /> : <AlertTriangle className="size-5 text-amber-300" />}
                  <span className={`font-semibold ${pattern.strictMatch ? 'text-teal-200' : 'text-amber-200'}`}>
                    {pattern.strictMatch ? 'Формация распознана' : 'Кандидат; боковик не подтверждён'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#9badaa]">
                  {pattern.strictMatch ? 'Кандидат по рабочим правилам. Не команда на вход: условие входа ещё не согласовано.' : 'Найдены экстремумы, но отдельная боковая фаза ещё не проверена по эталону. Это не подтверждённое вхождение и не команда на вход.'}
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {pattern.criteria.map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 text-sm">
                    {item.passed
                      ? <CheckCircle2 className="size-4 shrink-0 text-teal-300" />
                      : <AlertTriangle className="size-4 shrink-0 text-amber-300" />}
                    <span className={item.passed ? 'text-white' : 'text-amber-100'}>{item.label}</span>
                  </div>
                ))}
              </div>

              <details className="mt-5 rounded-xl border border-[#203032] bg-[#091315] text-xs">
                <summary className="cursor-pointer px-3 py-3 font-medium text-[#9badaa] hover:text-white">
                  Технические детали · {passed}/{pattern.criteria.length}
                </summary>
                <div className="space-y-3 border-t border-[#203032] p-3">
                  {pattern.criteria.map((criterion) => (
                    <div key={criterion.label}>
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-white">{criterion.label}</span>
                        <span className={criterion.passed ? 'text-teal-300' : 'text-amber-300'}>{criterion.value}</span>
                      </div>
                      <p className="mt-1 leading-4 text-[#607675]">{criterion.detail}</p>
                    </div>
                  ))}
                  <p className="border-t border-[#203032] pt-3 leading-4 text-violet-200/70">
                    Рабочая трактовка: верхняя граница − 0,236 × высота боковика. Требует подтверждения заказчиком. Распознавание использует только свечи до метки включительно.
                  </p>
                </div>
              </details>

              <div className="mt-5 rounded-xl border border-[#203032] bg-[#091315] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#829695]">Что произошло после</div>
                {revealed > 0 ? <>
                <div className="mt-2 text-sm font-medium text-white">{visibleOutcome!.label}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-rose-400/10 p-2">
                    <div className="text-[#607675]">Макс. падение</div>
                    <div className="mt-1 font-semibold text-rose-300">−{visibleOutcome!.maxDropPercent.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg bg-teal-400/10 p-2">
                    <div className="text-[#607675]">Макс. рост</div>
                    <div className="mt-1 font-semibold text-teal-300">+{visibleOutcome!.maxRisePercent.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.04] p-2">
                    <div className="text-[#607675]">Закрытие</div>
                    <div className={`mt-1 font-semibold ${visibleOutcome!.closeChangePercent <= 0 ? 'text-rose-300' : 'text-teal-300'}`}>
                      {visibleOutcome!.closeChangePercent > 0 ? '+' : ''}{visibleOutcome!.closeChangePercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-[#607675]">
                  Открыто {visibleOutcome!.bars} свечей после метки. Изменения цены — от закрытия свечи распознавания, не результат сделки.
                </p>
                <ul className="mt-3 space-y-2 text-xs text-[#9badaa]">
                  {visibleOutcome!.events.map((event) => <li key={event.time + event.label}>
                    {new Date(event.time * 1000).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC — {event.label}
                  </li>)}
                </ul>
                </> : <p className="mt-2 text-xs leading-5 text-[#9badaa]">Продолжение скрыто. Откройте следующие свечи кнопками под графиком, чтобы проверить развитие структуры.</p>}
              </div>

              <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                <Button variant="outline" onClick={() => move(-1)} className="border-[#2b4042] bg-transparent">
                  <ChevronLeft className="size-4" /> Назад
                </Button>
                <Button onClick={() => move(1)} className="bg-teal-400 text-[#061112] hover:bg-teal-300">
                  {index === patterns.length - 1 ? 'Сначала' : 'Далее'} <ChevronRight className="size-4" />
                </Button>
              </div>
            </aside>
          </div>
        )}

        <footer className="mt-4 flex flex-col gap-2 rounded-xl border border-[#203032] bg-[#091315] px-4 py-3 text-xs text-[#607675] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><Database className="size-3.5" /> Локальный adjusted OHLC snapshot · Yahoo Finance Chart · внешних запросов со страницы нет</span>
          <span>Исследовательский поиск структуры · правило входа не подтверждено</span>
        </footer>
      </main>
    </div>
  )
}
