import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Database, Eye, EyeOff, LineChart, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { prepareHistory } from '@/features/pattern-review/data-integrity'
import { loadMarketCatalog, loadMarketDataset } from '@/features/pattern-review/market-data'
import type { MarketCatalog, MarketCategory, MarketDataset, MarketTimeframe } from '@/features/pattern-review/types'

import { RazvorotkaChart } from './razvorotka-chart'
import { dailyContext, detectRazvorotka, fourHourContext, type RazvorotkaCase } from './razvorotka-detector'

const categoryOrder: MarketCategory[] = ['stocks', 'gold', 'bonds', 'crypto']
const categoryLabels: Record<MarketCategory, string> = { stocks: 'Акции', gold: 'Золото', bonds: 'Облигации', crypto: 'Криптовалюты' }
const formatTime = (time: number) => new Date(time * 1000).toLocaleString('ru-RU', { timeZone: 'UTC' })
const formatPrice = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: value < 10 ? 5 : 3 })
const formatPeriod = (value?: string) => value ? new Date(value).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
const plural = (count: number, one: string, few: string, many: string) => count % 100 >= 11 && count % 100 <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many

export function RazvorotkaPage() {
  const [catalog, setCatalog] = useState<MarketCatalog | null>(null)
  const [selectedSlug, setSelectedSlug] = useState('all')
  const [timeframe, setTimeframe] = useState<MarketTimeframe | 'all'>('all')
  const [patterns, setPatterns] = useState<RazvorotkaCase[]>([])
  const [loadedDataset, setLoadedDataset] = useState<MarketDataset | null>(null)
  const [processed, setProcessed] = useState(0)
  const [index, setIndex] = useState(0)
  const [replay, setReplay] = useState<{ key: string; bars: number } | null>(null)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [status, setStatus] = useState<'catalog' | 'loading' | 'ready' | 'empty' | 'error'>('catalog')
  const casesCache = useRef(new Map<string, RazvorotkaCase[]>())

  useEffect(() => {
    const controller = new AbortController()
    loadMarketCatalog(controller.signal)
      .then(next => {
        if (controller.signal.aborted) return
        setCatalog(next)
        setSelectedSlug(current => current === 'all' || next.instruments.some(item => item.slug === current) ? current : 'all')
        setStatus('loading')
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [])

  const selectedInstruments = useMemo(() => catalog?.instruments.filter(item => selectedSlug === 'all' || item.slug === selectedSlug) ?? [], [catalog, selectedSlug])
  const selectedTimeframes: MarketTimeframe[] = timeframe === 'all' ? ['1h', '4h'] : [timeframe]
  const datasetDates = selectedInstruments.flatMap(item => selectedTimeframes.map(frame => item.datasets[frame]))
  const periodStart = datasetDates.map(item => item.startDate).sort()[0]
  const periodEnd = datasetDates.map(item => item.endDate).sort().at(-1)
  const hourlyCount = patterns.filter(item => item.timeframe === '1h').length
  const fourHourCount = patterns.length - hourlyCount

  const resetForSelection = () => {
    setStatus('loading')
    setPatterns([])
    setLoadedDataset(null)
    setProcessed(0)
    setIndex(0)
    setReplay(null)
  }

  useEffect(() => {
    if (!catalog || !selectedInstruments.length) return
    const controller = new AbortController()
    const scan = async () => {
      const hourlyDatasets = await Promise.all(selectedInstruments.map(item => loadMarketDataset(item.datasets['1h'].file, controller.signal)))
      const matches: RazvorotkaCase[] = []
      for (const [position, hourly] of hourlyDatasets.entries()) {
        if (controller.signal.aborted) return
        const frames = timeframe === 'all' ? ['1h', '4h'] as const : [timeframe]
        const uncached = frames.filter(frame => !casesCache.current.has(`${hourly.slug}:${frame}`))
        const fourHour = uncached.length || (selectedInstruments.length === 1 && timeframe === '4h') ? prepareHistory(hourly, '4h') : null
        if (uncached.length) {
          for (const frame of uncached) {
            const dataset = frame === '1h' ? hourly : fourHour!
            const higher = frame === '1h' ? fourHourContext(fourHour!) : dailyContext(hourly)
            casesCache.current.set(`${hourly.slug}:${frame}`, detectRazvorotka(dataset, higher))
          }
        }
        for (const frame of frames) matches.push(...(casesCache.current.get(`${hourly.slug}:${frame}`) ?? []))
        if (selectedInstruments.length === 1 && timeframe !== 'all') setLoadedDataset(timeframe === '1h' ? hourly : fourHour)
        setProcessed(position + 1)
        // Give the browser a chance to paint progress during the full archive scan.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0))
      }
      if (controller.signal.aborted) return
      matches.sort((left, right) => right.detectedTime - left.detectedTime || left.id.localeCompare(right.id))
      setPatterns(matches)
      setStatus(matches.length ? 'ready' : 'empty')
    }
    void scan().catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [catalog, selectedInstruments, timeframe])

  const move = useCallback((direction: number) => {
    setIndex(current => patterns.length ? (current + direction + patterns.length) % patterns.length : 0)
    setReplay(null)
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
  const revealed = pattern && replay?.key === pattern.id ? replay.bars : pattern?.futureCandles.length ?? 0
  const lastVisible = pattern && revealed ? pattern.futureCandles[revealed - 1] : null
  const change = pattern && lastVisible ? (lastVisible.close - pattern.candles.at(-1)!.close) / pattern.candles.at(-1)!.close * 100 : null

  return <div className="min-h-screen bg-[#071011] text-[#e8f0ef]">
    <header className="border-b border-[#203032] bg-[#081214]">
      <div className="mx-auto flex min-h-16 max-w-[1560px] flex-wrap items-center gap-5 px-4 py-2 sm:px-6">
        <Link to="/market" className="flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-white">
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-400 text-[#071011]"><LineChart className="size-4" /></span>KOLA
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Основная навигация">
          <Link to="/market" className="rounded-lg px-3 py-2 text-[#829695] hover:bg-[#122123] hover:text-white">Рынок</Link>
          <Link to="/mocks/pattern-review" className="rounded-lg px-3 py-2 text-[#829695] hover:bg-[#122123] hover:text-white">Разбор формаций</Link>
          <Link to="/mocks/razvorotka" className="rounded-lg bg-[#17302f] px-3 py-2 text-teal-200">Разворотка</Link>
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-[1560px] p-4 sm:p-6">
      <section className="mb-4 grid gap-4 rounded-2xl border border-[#203032] bg-[#0b1517] p-4 lg:grid-cols-[minmax(260px,420px)_auto_1fr] lg:items-end">
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607675]">Торговый инструмент</label>
          <Select value={selectedSlug} onValueChange={slug => { resetForSelection(); setSelectedSlug(slug) }} disabled={!catalog}>
            <SelectTrigger aria-label="Торговый инструмент" className="h-11 w-full border-[#2b4042] bg-[#091315] text-white"><SelectValue placeholder="Выбрать инструмент" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Все инструменты · {catalog?.instruments.length ?? 0}</SelectItem>{categoryOrder.map(category => {
              const instruments = catalog?.instruments.filter(item => item.category === category) ?? []
              return instruments.length ? <SelectGroup key={category}><SelectLabel>{categoryLabels[category]}</SelectLabel>{instruments.map(item => <SelectItem key={item.slug} value={item.slug}>{item.symbol} · {item.name}</SelectItem>)}</SelectGroup> : null
            })}</SelectContent>
          </Select>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607675]">Таймфрейм</div>
          <div className="grid grid-cols-3 rounded-xl border border-[#2b4042] bg-[#091315] p-1">
            {(['all', '1h', '4h'] as const).map(item => <button key={item} type="button" onClick={() => { if (item !== timeframe) { resetForSelection(); setTimeframe(item) } }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${timeframe === item ? 'bg-teal-400 text-[#061112]' : 'text-[#829695] hover:text-white'}`}>{item === 'all' ? 'Оба' : item === '1h' ? '1 час' : '4 часа'}</button>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="rounded-lg border border-[#2b4042] bg-[#091315] px-3 py-2 text-xs text-[#829695]">История: <strong className="font-medium text-white">{formatPeriod(periodStart)} — {formatPeriod(periodEnd)}</strong></span>
          <span className="rounded-lg border border-teal-400/20 bg-teal-400/10 px-3 py-2 text-xs text-teal-200" aria-live="polite">{status === 'ready' ? <><strong>{patterns.length}</strong> {plural(patterns.length, 'кандидат', 'кандидата', 'кандидатов')}</> : status === 'empty' ? '0 кандидатов' : status === 'error' ? 'Ошибка загрузки' : status === 'loading' ? `Ищем формации… ${processed}/${selectedInstruments.length}` : 'Загружаем каталог…'}</span>
        </div>
      </section>

      {(status === 'ready' || status === 'empty') && <div className="mb-4 rounded-xl border border-[#203032] px-4 py-3 text-xs text-[#9badaa]"><p>Выборка: {selectedInstruments.length} {plural(selectedInstruments.length, 'инструмент', 'инструмента', 'инструментов')} · 1H: {hourlyCount} · 4H: {fourHourCount}. Это кандидаты для просмотра, а не подтверждённые сделки.</p><details className="mt-2"><summary className="cursor-pointer">О данных{loadedDataset?.quality ? ` · ${loadedDataset.quality.aggregation}` : ''}</summary><p className="mt-2 leading-5">Используются закрытые свечи. Поиск не соединяет участки через найденные пропуски. Объёмы в сохранённой истории отсутствуют: исключение для 6–11 свечей и объёмные факторы не проверяются.</p></details></div>}

      {status !== 'ready' || !pattern ? <div className="flex min-h-[560px] items-center justify-center rounded-2xl border border-[#203032] bg-[#0b1517] p-6 text-center text-[#829695]"><div>
        {status === 'error' ? <AlertTriangle className="mx-auto mb-4 size-7 text-rose-400" /> : status === 'empty' ? <LineChart className="mx-auto mb-4 size-7" /> : <LoaderCircle className="mx-auto mb-4 size-7 animate-spin text-teal-400" />}
        <p>{status === 'error' ? 'Не удалось загрузить данные.' : status === 'empty' ? 'Подходящих формаций пока нет.' : 'Ищем «Разворотку» в рыночных данных…'}</p>
      </div></div> : <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[#203032] bg-[#0b1517]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#203032] p-5">
            <div><div className="mb-1 text-xs font-medium uppercase tracking-wider text-teal-300">Случай {index + 1} из {patterns.length} · {pattern.timeframe.toUpperCase()}</div><h1 className="text-xl font-semibold text-white">{pattern.symbol} · «Разворотка» {pattern.direction === 'short' ? 'short' : 'long'}</h1><p className="mt-1 text-sm text-[#829695]">Свеча распознавания: {formatTime(pattern.detectedTime)} UTC</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(index)} onValueChange={value => { setIndex(Number(value)); setReplay(null) }}>
                <SelectTrigger aria-label="Найденный случай" className="h-9 min-w-52 border-[#2b4042] bg-[#091315] text-xs text-white"><SelectValue /></SelectTrigger>
                <SelectContent>{patterns.map((item, caseIndex) => <SelectItem key={item.id} value={String(caseIndex)}>{caseIndex + 1}. {item.symbol} {item.timeframe.toUpperCase()} {item.direction} · {formatTime(item.detectedTime)} UTC</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setShowAnnotations(value => !value)} className="border-[#2b4042] bg-transparent">{showAnnotations ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{showAnnotations ? 'Скрыть разметку' : 'Показать разметку'}</Button>
            </div>
          </div>
          <div className="border-b border-[#203032] px-5 py-3 text-xs leading-5 text-[#9badaa]">Фазы 1–3 определяют формацию. Вход и продолжение не участвуют в поиске; сигнал направлен по исходному тренду.</div>
          <RazvorotkaChart key={pattern.id} pattern={pattern} revealed={revealed} showAnnotations={showAnnotations} />
          <div className="flex flex-wrap items-center gap-2 border-t border-[#203032] p-4">
            <Button variant="outline" size="sm" disabled={revealed === pattern.futureCandles.length} onClick={() => setReplay({ key: pattern.id, bars: pattern.futureCandles.length })}>Показать продолжение</Button>
            <Button variant="outline" size="sm" disabled={revealed >= pattern.futureCandles.length} onClick={() => setReplay({ key: pattern.id, bars: revealed + 1 })}>+1 свеча</Button>
            <Button variant="ghost" size="sm" disabled={!revealed} onClick={() => setReplay({ key: pattern.id, bars: 0 })}>Скрыть продолжение</Button>
            <span className="text-xs text-[#829695]" aria-live="polite">Открыто {revealed} из {pattern.futureCandles.length} следующих свечей</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#203032] p-4 text-xs text-[#829695]">
            {[['#fbbf24', 'Консолидация'], ['#60a5fa', 'Ложный выход'], ['#fb7185', 'Отмена'], ['#4ade80', 'Цель']].map(([color, label]) => <span key={label} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: color }} /><span className="text-white">{label}</span></span>)}
          </div>
        </section>
        <aside className="flex flex-col rounded-2xl border border-[#203032] bg-[#0b1517] p-5">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4"><div className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-300" /><strong className="text-amber-200">Кандидат по доступным OHLC</strong></div><p className="mt-2 text-xs leading-5 text-[#9badaa]">Формация найдена по фазам 1–3. Контекст и возможность входа требуют проверки трейдером.</p></div>
          <div className="mt-5 space-y-3">{pattern.context.map(item => <div key={item} className="flex items-center gap-2.5 text-sm"><CheckCircle2 className="size-4 shrink-0 text-teal-300" /><span>{item}</span></div>)}</div>
          <details className="mt-5 rounded-xl border border-[#203032] bg-[#091315] text-xs"><summary className="cursor-pointer px-3 py-3 font-medium text-[#9badaa]">Технические детали</summary><div className="space-y-2 border-t border-[#203032] p-3 text-[#9badaa]"><p>Консолидация: {pattern.sourceBars} свечей, {formatPrice(pattern.source.low)}–{formatPrice(pattern.source.high)}</p><p>Закрепление: {pattern.holdBars} свечей · глубина: {pattern.breakoutDepthPercent.toFixed(1)}%</p><p>Перекрытие диапазона: {pattern.coveragePercent.toFixed(1)}%</p><p>Стоп: {formatPrice(pattern.stop)} · цель: {formatPrice(pattern.target)}</p>{pattern.entryOptions.map(option => <p key={option.label}>{option.label}: {formatPrice(option.price)} · расчётный RR 1:{option.riskReward.toFixed(2)}</p>)}<p>Вход не найден и не выставлен автоматически. Повторный подход и уровень 90% трейдер оценивает вручную. Расчёты без комиссии и проскальзывания.</p></div></details>
          <div className="mt-5 rounded-xl border border-[#203032] bg-[#091315] p-4"><div className="text-xs font-semibold uppercase tracking-wider text-[#829695]">Что требует проверки</div><ul className="mt-2 space-y-2 text-xs leading-5 text-amber-100/80">{pattern.uncertainties.map(item => <li key={item}>• {item}</li>)}</ul></div>
          <div className="mt-5 rounded-xl border border-[#203032] bg-[#091315] p-4"><div className="text-xs font-semibold uppercase tracking-wider text-[#829695]">Что произошло после</div>{change === null ? <p className="mt-2 text-xs text-[#9badaa]">Продолжение скрыто или отсутствует.</p> : <><p className="mt-2 text-sm font-medium text-white">Цена к последней открытой свече: {change > 0 ? '+' : ''}{change.toFixed(2)}%</p><p className="mt-2 text-xs text-[#9badaa]">Показаны только {revealed} открытых свечей после распознавания. Это изменение цены, не результат сделки.</p></>}</div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-5"><Button variant="outline" onClick={() => move(-1)} className="border-[#2b4042] bg-transparent"><ChevronLeft className="size-4" /> Назад</Button><Button onClick={() => move(1)} className="bg-teal-400 text-[#061112] hover:bg-teal-300">{index === patterns.length - 1 ? 'Сначала' : 'Далее'} <ChevronRight className="size-4" /></Button></div>
        </aside>
      </div>}

      <footer className="mt-4 flex flex-col gap-2 rounded-xl border border-[#203032] bg-[#091315] px-4 py-3 text-xs text-[#607675] sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2"><Database className="size-3.5" /> Локальный adjusted OHLC snapshot · внешних запросов со страницы нет</span><span>Исследовательский поиск · не торговый сигнал</span></footer>
    </main>
  </div>
}
