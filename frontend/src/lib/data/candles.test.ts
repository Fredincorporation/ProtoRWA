import { describe, expect, it } from 'vitest';

import {
  TIMEFRAMES,
  anchorPrice,
  buildCandleSeries,
  formatCandleTime,
  seriesHigh,
  seriesLow,
  seriesMaxVolume,
  type Timeframe,
} from './candles';
import { mockOrderBook, mockProjects } from './mock';

/**
 * These tests exist because the chart previously rendered a hardcoded SVG that
 * could not be wrong in an observable way - there was nothing to assert against.
 * Now that candles are derived, the invariants that make them a *chart* are
 * pinned here: OHLC ordering, price/axis agreement, timeframe responsiveness.
 */

const project = mockProjects[0]!;
const book = mockOrderBook(project.id);
const NOW = 1_700_000_000_000;

describe('buildCandleSeries', () => {
  it('produces the configured number of candles per timeframe', () => {
    for (const [tf, config] of Object.entries(TIMEFRAMES) as Array<[Timeframe, { candles: number }]>) {
      const series = buildCandleSeries(project, tf, book, NOW);
      expect(series.candles).toHaveLength(config.candles);
      expect(series.count).toBe(config.candles);
    }
  });

  it('satisfies OHLC invariants on every candle', () => {
    const series = buildCandleSeries(project, '1H', book, NOW);

    for (const candle of series.candles) {
      expect(candle.h).toBeGreaterThanOrEqual(Math.max(candle.o, candle.c));
      expect(candle.l).toBeLessThanOrEqual(Math.min(candle.o, candle.c));
      expect(candle.h).toBeGreaterThan(0);
      expect(candle.l).toBeGreaterThan(0);
      expect(candle.v).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic for the same project and timeframe', () => {
    const a = buildCandleSeries(project, '1D', book, NOW);
    const b = buildCandleSeries(project, '1D', book, NOW);
    expect(a.candles).toEqual(b.candles);
  });

  it('gives different projects different histories', () => {
    const other = mockProjects[2]!;
    const a = buildCandleSeries(project, '1H', mockOrderBook(project.id), NOW);
    const b = buildCandleSeries(other, '1H', mockOrderBook(other.id), NOW);
    expect(a.candles.map((c) => c.c)).not.toEqual(b.candles.map((c) => c.c));
  });

  it('pins the last close to the live anchor price', () => {
    const series = buildCandleSeries(project, '4H', book, NOW);
    const mid = anchorPrice(project, book);
    const last = series.candles[series.candles.length - 1]!;
    expect(last.c).toBeCloseTo(mid, 5);
  });

  it('actually changes the series when the timeframe changes', () => {
    // The bug this guards: timeframe buttons that changed nothing.
    const a = buildCandleSeries(project, '15M', book, NOW);
    const b = buildCandleSeries(project, '1W', book, NOW);
    expect(a.candles.map((c) => c.c)).not.toEqual(b.candles.map((c) => c.c));
    expect(a.intervalMs).not.toBe(b.intervalMs);
  });

  it('spaces candles by exactly one interval and ends at the current bucket', () => {
    const series = buildCandleSeries(project, '1H', book, NOW);
    for (let i = 1; i < series.candles.length; i += 1) {
      expect(series.candles[i]!.t - series.candles[i - 1]!.t).toBe(series.intervalMs);
    }
    expect(series.candles[series.candles.length - 1]!.t).toBeLessThanOrEqual(NOW);
  });

  it('places milestone markers inside the plotted range', () => {
    const series = buildCandleSeries(project, '1D', book, NOW);
    const first = series.candles[0]!.t;
    const last = series.candles[series.candles.length - 1]!.t;

    for (const marker of series.markers) {
      expect(marker.t).toBeGreaterThanOrEqual(first);
      expect(marker.t).toBeLessThanOrEqual(last);
    }
  });

  it('returns an empty series rather than throwing for a project with no data', () => {
    const bare = { ...project, claimPrice: '0' } as typeof project;
    const series = buildCandleSeries(bare, '1H', { projectId: project.id, bids: [], asks: [] }, NOW);
    expect(series.candles).toHaveLength(0);
    expect(series.count).toBe(0);
  });
});

describe('axis scaling helpers', () => {
  it('reports a high above the low and a positive peak volume', () => {
    const series = buildCandleSeries(project, '1H', book, NOW);
    expect(seriesHigh(series.candles)).toBeGreaterThan(seriesLow(series.candles));
    expect(seriesMaxVolume(series.candles)).toBeGreaterThan(0);
  });

  it('does not return Infinity for an empty series', () => {
    expect(seriesLow([])).toBe(0);
    expect(seriesHigh([])).toBe(0);
    expect(seriesMaxVolume([])).toBe(0);
  });
});

describe('formatCandleTime', () => {
  it('uses clock time for intraday intervals and dates for daily ones', () => {
    const intraday = formatCandleTime(NOW, TIMEFRAMES['1H'].intervalMs);
    const daily = formatCandleTime(NOW, TIMEFRAMES['1D'].intervalMs);
    expect(intraday).toMatch(/^\d{2}:\d{2}$/);
    expect(daily).not.toMatch(/^\d{2}:\d{2}$/);
  });
});
