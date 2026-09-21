import { useEffect, useId, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from 'lightweight-charts'

import type { PatternCase } from './types'

interface PatternChartProps {
  pattern: PatternCase
  showAnnotations: boolean
}

interface Point {
  x: number
  y: number
}

interface OverlayGeometry {
  width: number
  height: number
  chartRight: number
  trendStart: Point
  trendEnd: Point
  counterStart: Point
  counterEnd: Point
  innerPeak: Point
  rangeLeft: number
  rangeRight: number
  rangeHighY: number
  rangeLowY: number
  fibY: number
  formationLeft: number
  formationRight: number
  formationTop: number
  formationBottom: number
}

function getPoint(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  time: PatternCase['trend']['startTime'],
  price: number,
): Point | null {
  const x = chart.timeScale().timeToCoordinate(time)
  const y = series.priceToCoordinate(price)
  return x === null || y === null ? null : { x, y }
}

function getCoordinates(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  container: HTMLDivElement,
  pattern: PatternCase,
): OverlayGeometry | null {
  const trendStart = getPoint(
    chart,
    series,
    pattern.trend.startTime,
    pattern.trend.startPrice,
  )
  const trendEnd = getPoint(
    chart,
    series,
    pattern.trend.endTime,
    pattern.trend.endPrice,
  )
  const counterStart = getPoint(
    chart,
    series,
    pattern.counterTrend.startTime,
    pattern.counterTrend.startPrice,
  )
  const counterEnd = getPoint(
    chart,
    series,
    pattern.counterTrend.endTime,
    pattern.counterTrend.endPrice,
  )
  const rangeLeft = chart.timeScale().timeToCoordinate(pattern.range.startTime)
  const rangeRight = chart.timeScale().timeToCoordinate(pattern.range.endTime)
  const rangeHighY = series.priceToCoordinate(pattern.range.high)
  const rangeLowY = series.priceToCoordinate(pattern.range.low)
  const fibY = series.priceToCoordinate(pattern.fibLevel)
  const formationLeft = chart.timeScale().timeToCoordinate(pattern.formation.startTime)
  const formationRight = chart.timeScale().timeToCoordinate(pattern.formation.endTime)
  const formationTop = series.priceToCoordinate(pattern.formation.high)
  const formationBottom = series.priceToCoordinate(pattern.formation.low)
  const innerPeak = getPoint(chart, series, pattern.structure.innerPeakTime, pattern.structure.innerPeakPrice)

  const scalarValues = [
    rangeLeft,
    rangeRight,
    rangeHighY,
    rangeLowY,
    fibY,
    formationLeft,
    formationRight,
    formationTop,
    formationBottom,
  ]

  if (
    !trendStart ||
    !trendEnd ||
    !counterStart ||
    !counterEnd ||
    !innerPeak ||
    scalarValues.some((value) => value === null)
  ) {
    return null
  }

  return {
    width: container.clientWidth,
    height: container.clientHeight,
    chartRight: chart.timeScale().width(),
    trendStart,
    trendEnd,
    counterStart,
    counterEnd,
    innerPeak,
    rangeLeft: rangeLeft!,
    rangeRight: rangeRight!,
    rangeHighY: rangeHighY!,
    rangeLowY: rangeLowY!,
    fibY: fibY!,
    formationLeft: formationLeft!,
    formationRight: formationRight!,
    formationTop: formationTop!,
    formationBottom: formationBottom!,
  }
}

function HorizontalLevel({
  top,
  left,
  right,
  color,
  label,
  dashed = false,
}: {
  top: number
  left: number
  right: number
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <div
      className="absolute z-20 border-t-2"
      style={{
        top,
        left,
        width: Math.max(right - left, 20),
        borderColor: color,
        borderTopStyle: dashed ? 'dashed' : 'solid',
      }}
    >
      <span
        className="absolute right-0 top-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
        style={{ color, background: '#071011e6' }}
      >
        {label}
      </span>
    </div>
  )
}

function ChartOverlay({
  geometry,
  pattern,
}: {
  geometry: OverlayGeometry
  pattern: PatternCase
}) {
  const markerId = useId().replaceAll(':', '')

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
      {pattern.candles.at(-1)!.time > pattern.structure.detectedTime && <div
        className="absolute bottom-7 top-0 z-0 border-l border-teal-300/25 bg-teal-300/[0.035]"
        style={{
          left: geometry.formationRight,
          width: Math.max(geometry.chartRight - geometry.formationRight, 1),
        }}
      >
        <span className="absolute right-2 top-2 rounded bg-[#071011cc] px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#607675]">
          продолжение · не участвует в поиске
        </span>
      </div>}
      <svg
        className="absolute inset-0"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id={`${markerId}-green`}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8" fill="none" stroke="#4ade80" strokeWidth="1.6" />
          </marker>
          <marker
            id={`${markerId}-blue`}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8" fill="none" stroke="#60a5fa" strokeWidth="1.6" />
          </marker>
        </defs>
        <line
          x1={geometry.trendStart.x}
          y1={geometry.trendStart.y}
          x2={geometry.trendEnd.x}
          y2={geometry.trendEnd.y}
          stroke="#4ade80"
          strokeWidth="2.5"
          opacity="0.9"
          markerEnd={`url(#${markerId}-green)`}
        />
        <line
          x1={geometry.counterStart.x}
          y1={geometry.counterStart.y}
          x2={geometry.counterEnd.x}
          y2={geometry.counterEnd.y}
          stroke="#60a5fa"
          strokeWidth="2.5"
          opacity="0.95"
          markerEnd={`url(#${markerId}-blue)`}
        />
        <circle cx={geometry.innerPeak.x} cy={geometry.innerPeak.y} r="5" fill="#fbbf24" stroke="#071011" strokeWidth="2" />
        <text x={geometry.innerPeak.x} y={geometry.innerPeak.y - 12} fill="#fbbf24" fontSize="12" fontWeight="600" textAnchor="middle">E</text>
      </svg>

      <HorizontalLevel
        top={geometry.rangeHighY}
        left={geometry.rangeLeft}
        right={geometry.chartRight}
        color="#fb7185"
        label={`C · верх ${pattern.range.high.toFixed(2)}`}
      />
      <HorizontalLevel
        top={geometry.rangeLowY}
        left={geometry.rangeLeft}
        right={geometry.chartRight}
        color="#fb7185"
        label={`D · низ ${pattern.range.low.toFixed(2)}`}
      />
      <HorizontalLevel
        top={geometry.fibY}
        left={geometry.rangeLeft}
        right={geometry.chartRight}
        color="#a78bfa"
        label={`FIB 0.236 · ${pattern.fibLevel.toFixed(2)}`}
        dashed
      />

      <div
        className="absolute z-30 border-2 border-amber-400 bg-amber-400/[0.07] shadow-[inset_0_0_28px_rgba(251,191,36,0.05)]"
        style={{
          left: geometry.formationLeft,
          top: Math.min(geometry.formationTop, geometry.formationBottom),
          width: Math.max(geometry.formationRight - geometry.formationLeft, 1),
          height: Math.max(Math.abs(geometry.formationBottom - geometry.formationTop), 1),
        }}
      >
        <span className="absolute left-1.5 top-1.5 rounded bg-[#071011e6] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-300">
          формация
        </span>
      </div>

      <div
        className="absolute bottom-7 top-5 z-40 border-l-2 border-dashed border-teal-300/90"
        style={{ left: geometry.formationRight }}
      >
        <span className="absolute -left-8 top-0 whitespace-nowrap rounded bg-teal-300 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#061112]">
          распознано
        </span>
      </div>

      <span
        className="absolute z-30 -translate-x-1/2 rounded bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-emerald-300"
        style={{ left: geometry.trendStart.x, top: geometry.trendStart.y - 22 }}
      >
        A · основной тренд
      </span>
      <span
        className="absolute z-30 -translate-x-1/2 rounded bg-blue-400/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-blue-300"
        style={{ left: geometry.counterStart.x, top: geometry.counterStart.y + 8 }}
      >
        B · контртренд
      </span>
    </div>
  )
}

export function PatternChart({ pattern, showAnnotations }: PatternChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState<OverlayGeometry | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setGeometry(null)

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#071011' },
        textColor: '#7f9292',
        fontFamily: 'Geist Variable, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#122021' },
        horzLines: { color: '#122021' },
      },
      crosshair: {
        vertLine: { color: '#64748b66', labelBackgroundColor: '#1e293b' },
        horzLine: { color: '#64748b66', labelBackgroundColor: '#1e293b' },
      },
      rightPriceScale: {
        borderColor: '#1b2b2c',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#1b2b2c',
        timeVisible: true,
        rightOffset: 7,
        barSpacing: 5,
        minBarSpacing: 0.1,
      },
      handleScale: true,
      handleScroll: true,
      localization: {
        locale: 'ru-RU',
        priceFormatter: (value: number) =>
          value >= 1_000
            ? value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
            : value.toFixed(value < 10 ? 4 : 2),
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#2dd4bf',
      downColor: '#f87171',
      wickUpColor: '#2dd4bf',
      wickDownColor: '#f87171',
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    series.setData(pattern.candles)

    let disposed = false
    const updateOverlay = () => {
      if (disposed) return
      const nextGeometry = getCoordinates(chart, series, container, pattern)
      setGeometry(nextGeometry)
    }

    chart.timeScale().fitContent()
    const frame = requestAnimationFrame(updateOverlay)
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateOverlay)

    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(updateOverlay))
    resizeObserver.observe(container)
    // Price-axis drag does not emit a logical-time range change.
    container.addEventListener('pointermove', updateOverlay)
    container.addEventListener('pointerup', updateOverlay)
    container.addEventListener('wheel', updateOverlay, { passive: true })

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      container.removeEventListener('pointermove', updateOverlay)
      container.removeEventListener('pointerup', updateOverlay)
      container.removeEventListener('wheel', updateOverlay)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateOverlay)
      chart.remove()
    }
  }, [pattern])

  return (
    <div
      className="relative h-[520px] min-h-[420px] w-full overflow-hidden rounded-xl bg-[#071011] lg:h-[660px]"
      data-testid="pattern-chart"
      data-case-id={pattern.id}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {showAnnotations && geometry ? (
        <ChartOverlay geometry={geometry} pattern={pattern} />
      ) : null}
    </div>
  )
}
