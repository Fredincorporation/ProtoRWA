'use client';

import * as React from 'react';

import {
  CANDLE_SERIES_IS_SYNTHETIC,
  TIMEFRAMES,
  buildCandleSeries,
  formatCandlePrice,
  formatCandleTime,
  seriesHigh,
  seriesLow,
  seriesMaxVolume,
  type Timeframe,
} from '@/lib/data/candles';
import { Icon } from '@/components/ui/icon';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OrderBook, Project } from '@protorwa/shared';

interface CandlestickChartProps {
  ticker: string;
  projectTitle: string;
  /**
   * Display price from the parent, kept for the caller's convenience. The chart
   * plots the series' own last close instead, so the two cannot disagree if the
   * book moves between renders - hence this is not read here.
   */
  currentPrice?: string;
  /** The project whose prices are plotted. All candle values derive from it. */
  project: Project;
  /** The book rendered beside the chart, so both agree on the anchor price. */
  book?: OrderBook;
}

/** Plot geometry. Kept as constants so the axis maths and the SVG cannot drift. */
const PAD_TOP = 16;
const PAD_BOTTOM = 48;
const PAD_LEFT = 8;
const PAD_RIGHT = 76;
const VOLUME_HEIGHT = 40;

/**
 * Interactive candlestick chart for the claim trading terminal.
 *
 * Renders a real OHLC series from `lib/data/candles`: every open/high/low/close
 * is derived from the project's order book and claim price, the price axis is
 * scaled to the visible range, and changing the timeframe re-plots different
 * candles. An earlier version was a hand-authored SVG with hardcoded candles and
 * a fixed axis, so the timeframe tabs changed nothing but their own highlight.
 *
 * The series is synthetic - there is no indexer behind it - and the component
 * says so in the UI rather than leaving a viewer to assume otherwise.
 */
export function CandlestickChart({
  ticker,
  projectTitle,
  project,
  book,
}: CandlestickChartProps) {
  const [timeframe, setTimeframe] = React.useState<Timeframe>('1H');
  const [viewMode, setViewMode] = React.useState<'candles' | 'line'>('candles');
  const [hovered, setHovered] = React.useState<number | null>(null);

  /**
   * `now` anchors the rightmost candle to the present. Captured once so the
   * series is stable across re-renders.
   */
  const [now] = React.useState(() => Date.now());

  /**
   * The candle timestamps are derived from `now`, and a `'use client'` component
   * is still prerendered on the server - where `now` differs from the client's.
   * Rendering candles during that first paint therefore throws a React hydration
   * mismatch on the time axis. So we hold the plot back until after mount; the
   * series is synthetic and a few frames without it is the correct trade-off.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const series = React.useMemo(
    () => buildCandleSeries(project, timeframe, book, now),
    [project, timeframe, book, now],
  );

  const { candles: baseCandles, markers } = series;

  /**
   * A demo project has no live order flow behind it, so the terminal would show
   * a frozen chart. For those only, we animate a tick tape: the rightmost candle
   * random-walks around its anchored close so the screen reads as an active
   * market. Real-liquidity projects get no simulation - their price comes from
   * the book, and fabricating ticks there would misrepresent settled trades.
   */
  const isDemo = project.liquidityMode !== 'real';

  const [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(query.matches);
    const onChange = () => setReduceMotion(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  interface LiveTick {
    price: number;
    /** Extra units traded since the candle anchored. */
    volumeAdded: number;
    /** Sign of the latest move, for the up/down colouring. */
    up: boolean;
  }
  const [live, setLive] = React.useState<LiveTick | null>(null);

  /** Reset the tape whenever the series is rebuilt (new timeframe/project). */
  React.useEffect(() => {
    setLive(null);
  }, [series]);

  const anchorRef = React.useRef<number>(0);
  const walkRef = React.useRef<number>(0);
  React.useEffect(() => {
    if (!isDemo || reduceMotion || baseCandles.length === 0) return;
    const anchor = baseCandles[baseCandles.length - 1]!.c;
    anchorRef.current = anchor;
    walkRef.current = anchor;
    const perTickVol = anchor * 0.0016;
    const band = anchor * 0.02;

    const id = window.setInterval(() => {
      const prev = walkRef.current;
      // Mean-reverting random walk: pull back toward the anchor so a long
      // session cannot drift the tape off the axis.
      const pull = (anchorRef.current - prev) * 0.04;
      let next = prev + pull + (Math.random() - 0.5) * 2 * perTickVol;
      next = Math.min(Math.max(next, anchorRef.current - band), anchorRef.current + band);
      walkRef.current = next;
      setLive((old) => ({
        price: next,
        up: next >= (old?.price ?? anchorRef.current),
        volumeAdded: (old?.volumeAdded ?? 0) + Math.round(Math.random() * 3) + 1,
      }));
    }, 1400);

    return () => window.clearInterval(id);
  }, [isDemo, reduceMotion, baseCandles]);

  /**
   * The plotted candles: identical to the series except, for a demo project, the
   * last candle is stretched to the live tape price. Only its high/low/close/vol
   * move; the open stays anchored so the body reads as a candle forming now.
   */
  const candles = React.useMemo(() => {
    if (!live || baseCandles.length === 0) return baseCandles;
    const last = baseCandles[baseCandles.length - 1]!;
    const updated = {
      ...last,
      c: live.price,
      h: Math.max(last.h, live.price),
      l: Math.min(last.l, live.price),
      v: last.v + live.volumeAdded,
    };
    const next = baseCandles.slice();
    next[next.length - 1] = updated;
    return next;
  }, [baseCandles, live]);

  /**
   * Price range with 8% headroom so the wicks never touch the plot edges. Scaled
   * to the *base* series, not the live tape, so the axis holds still while the
   * last candle ticks - rescaling every second would be unreadable.
   */
  const bounds = React.useMemo(() => {
    if (baseCandles.length === 0) return { min: 0, max: 1, maxVolume: 1 };
    const high = seriesHigh(baseCandles);
    const low = seriesLow(baseCandles);
    const span = high - low || high * 0.02 || 1;
    return {
      min: low - span * 0.08,
      max: high + span * 0.08,
      maxVolume: seriesMaxVolume(baseCandles) || 1,
    };
  }, [baseCandles]);

  const plotHeight = 260;
  const priceToY = React.useCallback(
    (price: number) =>
      PAD_TOP +
      ((bounds.max - price) / (bounds.max - bounds.min || 1)) * (plotHeight - VOLUME_HEIGHT - PAD_TOP),
    [bounds],
  );

  const tickCount = 5;
  const priceTicks = React.useMemo(
    () =>
      Array.from({ length: tickCount }, (_, i) =>
        bounds.min + ((bounds.max - bounds.min) * i) / (tickCount - 1),
      ).reverse(),
    [bounds],
  );

  /** Six time labels across the x-axis, from the base (stable) candle times. */
  const timeTicks = React.useMemo(() => {
    if (baseCandles.length === 0) return [];
    const step = Math.max(1, Math.floor(baseCandles.length / 5));
    return baseCandles
      .map((candle, index) => ({ candle, index }))
      .filter(({ index }) => index % step === 0 && index < baseCandles.length - 2)
      .slice(0, 5);
  }, [baseCandles]);

  if (!mounted) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-xl border border-outline-variant/40 bg-surface-container-low font-mono text-label-sm text-outline">
        <Icon name="show_chart" size={16} className="mr-2 animate-pulse" />
        Loading price history…
      </div>
    );
  }

  if (candles.length === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-xl border-outline-variant/40 bg-surface-container-low font-mono text-label-sm text-outline">
        No price history is available for this asset.
      </div>
    );
  }

  const lastCandle = candles[candles.length - 1]!;
  const firstCandle = candles[0]!;
  const change = lastCandle.c - firstCandle.o;
  const changePct = firstCandle.o > 0 ? (change / firstCandle.o) * 100 : 0;
  const hoveredCandle = hovered !== null ? candles[hovered] : undefined;

  return (
    <div className="flex w-full flex-col gap-space-sm rounded-xl border-outline-variant/40 bg-surface-container-low p-space-md shadow-md">
      {/* Chart controls */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
          <div className="flex items-center rounded-lg bg-surface-container p-0.5 text-on-surface-variant">
            {(Object.keys(TIMEFRAMES) as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                aria-pressed={timeframe === tf}
                title={TIMEFRAMES[tf].label}
                className={cn(
                  'rounded px-2 py-1 font-mono text-label-sm transition-colors',
                  timeframe === tf
                    ? 'bg-primary font-semibold text-on-primary shadow-sm'
                    : 'hover:text-on-surface',
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-space-xs pl-space-xs sm:flex">
            {(['candles', 'line'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={cn(
                  'rounded px-2 py-1 font-mono text-label-sm transition-colors',
                  viewMode === mode
                    ? 'bg-surface-container-high font-semibold text-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                )}
              >
                {mode === 'candles' ? 'Candles' : 'Close line'}
              </button>
            ))}
          </div>
        </div>

        {/* Last price + period change, computed from the series itself. */}
        <div className="flex flex-wrap items-baseline gap-space-sm font-mono">
          <span className="text-headline-sm tabular text-on-surface">
            {formatCandlePrice(lastCandle.c)}{' '}
            <span className="text-label-sm text-outline">USDG</span>
          </span>
          <span
            className={cn('text-label-sm tabular', change >= 0 ? 'text-primary' : 'text-error')}
          >
            {change >= 0 ? '▲' : '▼'} {formatCandlePrice(Math.abs(change))} ({changePct >= 0 ? '+' : '−'}
            {Math.abs(changePct).toFixed(2)}%)
          </span>
          <span className="text-label-sm text-outline">
            {series.count} × {TIMEFRAMES[timeframe].label}
          </span>
        </div>
      </div>

      {/*
          Milestone markers, read from the series rather than hardcoded. Each is
          positioned by its real timestamp, so a pin cannot drift away from the
          candle it belongs to.
        */}
        {markers.length > 0 ? (
          <div className="flex flex-wrap items-center gap-space-xs font-mono text-label-sm">
            {markers.map((marker) => (
              <div
                key={`${marker.index}-${marker.t}`}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2 py-1',
                  marker.status === 'EVIDENCE'
                    ? 'bg-primary/10 font-medium text-primary'
                    : marker.status === 'APPROVED'
                      ? 'bg-surface-container text-on-surface-variant'
                      : 'bg-surface-container text-outline',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    marker.status === 'EVIDENCE'
                      ? 'animate-pulse-dot bg-primary'
                      : marker.status === 'APPROVED'
                        ? 'bg-primary'
                        : 'bg-outline',
                  )}
                />
                <span>
                  M{String(marker.index + 1).padStart(2, '0')} {marker.title}
                </span>
              </div>
            ))}
          </div>
        ) : null}

      {/* â”€â”€ Plot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative w-full overflow-hidden rounded-lg border-outline-variant/20 bg-surface-container-lowest">
        <svg
          viewBox={`0 0 900 ${plotHeight}`}
          className="h-80 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${projectTitle} (${ticker}) price chart, ${series.count} ${TIMEFRAMES[timeframe].label} candles`}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Price gridlines + right-hand axis labels, scaled to the series. */}
          {priceTicks.map((price, i) => {
            const y = priceToY(price);
            return (
              <g key={`tick-${i}`}>
                <line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={900 - PAD_RIGHT}
                  y2={y}
                  stroke="#3c4a42"
                  strokeWidth="1"
                  opacity="0.5"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={900 - PAD_RIGHT + 6}
                  y={y + 3}
                  fill="#86948a"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Milestone guide lines at their true x positions. */}
          {markers.map((marker) => {
            const index = candles.findIndex((c) => c.t === marker.t);
            if (index < 0) return null;
            const x = ((index + 0.5) / candles.length) * (900 - PAD_RIGHT - PAD_LEFT) + PAD_LEFT;
            return (
              <line
                key={`m-${marker.index}`}
                x1={x}
                y1={PAD_TOP}
                x2={x}
                y2={plotHeight - PAD_BOTTOM}
                stroke={marker.status === 'EVIDENCE' ? '#ffb95f' : '#4edea3'}
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Volume histogram, scaled against the peak volume in the series. */}
          {candles.map((candle, index) => {
            const x = ((index + 0.5) / candles.length) * (900 - PAD_RIGHT - PAD_LEFT) + PAD_LEFT;
            const w = ((900 - PAD_RIGHT - PAD_LEFT) / candles.length) * 0.62;
            const h = (candle.v / bounds.maxVolume) * (VOLUME_HEIGHT - 6);
            return (
              <rect
                key={`v-${index}`}
                x={x - w / 2}
                y={plotHeight - PAD_BOTTOM - h}
                width={w}
                height={h}
                fill={candle.c >= candle.o ? '#4edea3' : '#ffb4ab'}
                opacity="0.25"
              />
            );
          })}

          {/* Candles: wick + body, each drawn from its own OHLC values. */}
          {viewMode === 'candles'
            ? candles.map((candle, index) => {
                const x = ((index + 0.5) / candles.length) * (900 - PAD_RIGHT - PAD_LEFT) + PAD_LEFT;
                const w = Math.max(((900 - PAD_RIGHT - PAD_LEFT) / candles.length) * 0.62, 0.5);
                const up = candle.c >= candle.o;
                const colour = up ? '#4edea3' : '#ffb4ab';
                const yHigh = priceToY(candle.h);
                const yLow = priceToY(candle.l);
                const yOpen = priceToY(candle.o);
                const yClose = priceToY(candle.c);
                const bodyTop = Math.min(yOpen, yClose);
                const bodyHeight = Math.max(Math.abs(yClose - yOpen), 0.8);

                return (
                  <g key={`c-${index}`}>
                    <line
                      x1={x}
                      y1={yHigh}
                      x2={x}
                      y2={yLow}
                      stroke={colour}
                      strokeWidth="1.2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <rect x={x - w / 2} y={bodyTop} width={w} height={bodyHeight} fill={colour} />
                  </g>
                );
              })
            : (
                <path
                  d={candles
                    .map((candle, index) => {
                      const x =
                        ((index + 0.5) / candles.length) * (900 - PAD_RIGHT - PAD_LEFT) + PAD_LEFT;
                      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${priceToY(candle.c).toFixed(2)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#4edea3"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              )}

          {/* Last-price marker on the right axis. */}
          <line
            x1={PAD_LEFT}
            y1={priceToY(lastCandle.c)}
            x2={900 - PAD_RIGHT}
            y2={priceToY(lastCandle.c)}
            stroke="#4edea3"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.5"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={900 - PAD_RIGHT}
            y={priceToY(lastCandle.c) - 9}
            width={PAD_RIGHT}
            height={18}
            fill="#4edea3"
          />
          <text
            x={900 - PAD_RIGHT + 5}
            y={priceToY(lastCandle.c) + 4}
            fill="#003824"
            fontSize="11"
            fontWeight="700"
            fontFamily="monospace"
          >
            {lastCandle.c.toFixed(2)}
          </text>

          {/* Invisible hit areas â€” one per candle, for the hover crosshair. */}
          {candles.map((_candle, index) => (
            <rect
              key={`hit-${index}`}
              x={(index / candles.length) * (900 - PAD_RIGHT - PAD_LEFT) + PAD_LEFT}
              y={0}
              width={(900 - PAD_RIGHT - PAD_LEFT) / candles.length}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
            />
          ))}

          {/* Hover crosshair. */}
          {hovered !== null && hoveredCandle ? (
            <line
              x1={
                ((hovered + 0.5) / candles.length) * (900 - PAD_RIGHT - PAD_LEFT) + PAD_LEFT
              }
              y1={PAD_TOP}
              x2={
                ((hovered + 0.5) / candles.length) * (900 - PAD_RIGHT - PAD_LEFT) + PAD_LEFT
              }
              y2={plotHeight - PAD_BOTTOM}
              stroke="#bbcabf"
              strokeWidth="1"
              opacity="0.4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {/* OHLC readout for the candle under the cursor. */}
        {hoveredCandle ? (
          <div className="pointer-events-none absolute left-space-sm top-space-sm rounded border-outline-variant/50 bg-surface-container-high/95 p-2 font-mono text-label-sm shadow-lg">
            <div className="text-outline">{formatCandleTime(hoveredCandle.t, series.intervalMs)} UTC</div>
            <div className="mt-1 grid-cols-2 gap-x-3 tabular">
              <span className="text-outline">O</span>
              <span className="text-right text-on-surface">{formatCandlePrice(hoveredCandle.o)}</span>
              <span className="text-outline">H</span>
              <span className="text-right text-on-surface">{formatCandlePrice(hoveredCandle.h)}</span>
              <span className="text-outline">L</span>
              <span className="text-right text-on-surface">{formatCandlePrice(hoveredCandle.l)}</span>
              <span className="text-outline">C</span>
              <span
                className={cn(
                  'text-right',
                  hoveredCandle.c >= hoveredCandle.o ? 'text-primary' : 'text-error',
                )}
              >
                {formatCandlePrice(hoveredCandle.c)}
              </span>
              <span className="text-outline">Vol</span>
              <span className="text-right text-on-surface-variant">
                {formatNumber(hoveredCandle.v)}
              </span>
            </div>
          </div>
        ) : null}

        {/*
          Time axis, labelled from the candles actually plotted rather than from
          a fixed "09:00 / 12:00 / 15:00" string list.
        */}
        <div className="flex justify-between border-t border-outline-variant/30 px-space-sm py-1 font-mono text-[10px] text-outline">
          {timeTicks.map(({ candle, index }) => (
            <span key={`time-${index}`}>{formatCandleTime(candle.t, series.intervalMs)} UTC</span>
          ))}
        </div>
      </div>

      {/*
        Honesty notice. The series is synthetic â€” derived deterministically from
        the project's own order book, but not observed market data. Saying so
        costs one line and prevents the chart from implying a market that has
        not traded.
      */}
      {CANDLE_SERIES_IS_SYNTHETIC ? (
        <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
          <Icon name="info" size={12} className="mt-0.5 shrink-0" />
          <span>
            Simulated price history, derived from this project&apos;s order book and
            claim price. No trades have settled on this series.
          </span>
        </p>
      ) : null}
    </div>
  );
}
