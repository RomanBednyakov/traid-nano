import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type SeriesType } from 'lightweight-charts'

import type { PhaseBox, RazvorotkaCase } from './razvorotka-detector'

interface ChartProps {
  pattern: RazvorotkaCase
  revealed: number
  showAnnotations: boolean
}

interface Rect { left: number; top: number; width: number; height: number }
interface Geometry {
  source: Rect
  breakout: Rect
  cancellation: Rect
  stopY: number
  targetY: number
  markerX: number
  chartWidth: number
}

function phaseRect(chart: IChartApi, series: ISeriesApi<SeriesType>, box: PhaseBox): Rect | null {
  const x1 = chart.timeScale().timeToCoordinate(box.start)
  const x2 = chart.timeScale().timeToCoordinate(box.end)
  const y1 = series.priceToCoordinate(box.high)
  const y2 = series.priceToCoordinate(box.low)
  if (x1 === null || x2 === null || y1 === null || y2 === null) return null
  return {
    left: Math.min(x1, x2), top: Math.min(y1, y2),
    width: Math.max(Math.abs(x2 - x1) + chart.timeScale().options().barSpacing, 8),
    height: Math.max(Math.abs(y2 - y1), 4),
  }
}

function geometry(chart: IChartApi, series: ISeriesApi<SeriesType>, pattern: RazvorotkaCase): Geometry | null {
  const source = phaseRect(chart, series, pattern.source)
  const breakout = phaseRect(chart, series, pattern.breakout)
  const cancellation = phaseRect(chart, series, pattern.cancellation)
  const stopY = series.priceToCoordinate(pattern.stop)
  const targetY = series.priceToCoordinate(pattern.target)
  const markerX = chart.timeScale().timeToCoordinate(pattern.detectedTime)
  if (!source || !breakout || !cancellation || stopY === null || targetY === null || markerX === null) return null
  return { source, breakout, cancellation, stopY, targetY, markerX, chartWidth: chart.timeScale().width() }
}

const formatPrice = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: value < 10 ? 5 : 3 })

function Box({ rect, color, label }: { rect: Rect; color: string; label: string }) {
  return <div className="pointer-events-none absolute z-10 border-2" style={{ ...rect, borderColor: color, backgroundColor: `${color}12` }}>
    <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-[#071011e8] px-1.5 py-0.5 text-[10px] font-semibold" style={{ color }}>{label}</span>
  </div>
}

function Level({ y, width, color, label }: { y: number; width: number; color: string; label: string }) {
  return <div className="pointer-events-none absolute z-20 border-t-2" style={{ top: y, left: 0, width, borderColor: color }}>
    <span className="absolute right-0 top-1 whitespace-nowrap rounded bg-[#071011e8] px-1.5 py-0.5 font-mono text-[10px]" style={{ color }}>{label}</span>
  </div>
}

export function RazvorotkaChart({ pattern, revealed, showAnnotations }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [overlay, setOverlay] = useState<Geometry | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setOverlay(null)
    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#071011' }, textColor: '#8ca2a0', fontFamily: 'Geist Variable, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: '#122021' }, horzLines: { color: '#122021' } },
      rightPriceScale: { borderColor: '#1b2b2c', scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: '#1b2b2c', timeVisible: true, rightOffset: 7, barSpacing: 5 },
      localization: { locale: 'ru-RU', priceFormatter: formatPrice },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#2dd4bf', downColor: '#f87171', wickUpColor: '#2dd4bf', wickDownColor: '#f87171', borderVisible: false,
    })
    series.setData([...pattern.candles, ...pattern.futureCandles.slice(0, revealed)])
    chart.timeScale().fitContent()
    let disposed = false
    const update = () => { if (!disposed) setOverlay(geometry(chart, series, pattern)) }
    const frame = requestAnimationFrame(update)
    const resize = new ResizeObserver(() => requestAnimationFrame(update))
    resize.observe(container)
    chart.timeScale().subscribeVisibleLogicalRangeChange(update)
    container.addEventListener('pointermove', update)
    container.addEventListener('pointerup', update)
    container.addEventListener('wheel', update, { passive: true })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(update)
      container.removeEventListener('pointermove', update)
      container.removeEventListener('pointerup', update)
      container.removeEventListener('wheel', update)
      chart.remove()
    }
  }, [pattern, revealed])

  return <div className="relative h-[520px] min-h-[420px] w-full overflow-hidden rounded-xl bg-[#071011] lg:h-[660px]" data-testid="razvorotka-chart" data-case-id={pattern.id}>
    <div ref={containerRef} className="absolute inset-0" />
    {showAnnotations && overlay && <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {revealed > 0 && <div className="absolute bottom-7 top-0 border-l border-teal-300/30 bg-teal-300/[0.04]" style={{ left: overlay.markerX, width: Math.max(overlay.chartWidth - overlay.markerX, 1) }} />}
      <Box rect={overlay.source} color="#fbbf24" label="1 · консолидация" />
      <Box rect={overlay.breakout} color="#60a5fa" label="2 · ложный выход" />
      <Box rect={overlay.cancellation} color="#fb7185" label="3 · отмена" />
      <Level y={overlay.stopY} width={overlay.chartWidth} color="#fb7185" label={`СТОП · ${formatPrice(pattern.stop)}`} />
      <Level y={overlay.targetY} width={overlay.chartWidth} color="#4ade80" label={`ЦЕЛЬ · ${formatPrice(pattern.target)}`} />
      <div className="absolute bottom-7 top-0 z-30 border-l-2 border-dashed border-teal-300" style={{ left: overlay.markerX }}>
        <span className="absolute left-1 top-2 whitespace-nowrap rounded bg-teal-300 px-2 py-1 text-[9px] font-bold uppercase text-[#061112]">распознано</span>
      </div>
    </div>}
  </div>
}
