'use client';

import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { formatUsdgNumber, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OrderBook, OrderBookLevel } from '@protorwa/shared';

/**
 * Order book and depth display for the secondary market.
 *
 * Ported from the design's "Order Book & Depth": a two-column bid/ask ladder with
 * cumulative size, plus a depth bar showing the balance of resting liquidity.
 *
 * The ladder is rendered from `OrderBook` (bids/asks arrays of levels), so it
 * works against real data once the indexer feeds it. Depth bars are scaled to
 * the largest level so relative size is readable regardless of magnitude.
 */

export interface OrderBookProps {
  book: OrderBook;
  /** Called when a level is clicked, to prefill an order form. */
  onSelectLevel?: (level: OrderBookLevel, side: 'bid' | 'ask') => void;
  className?: string;
}

function LadderRow({
  level,
  side,
  maxAmount,
  onSelect,
}: {
  level: OrderBookLevel;
  side: 'bid' | 'ask';
  maxAmount: number;
  onSelect?: () => void;
}) {
  const amount = Number(level.amount);
  const width = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative grid w-full grid-cols-3 gap-2 overflow-hidden px-2 py-1 text-left font-mono text-label-sm transition-colors',
        'hover:bg-surface-container-high',
      )}
    >
      {/*
       * Depth bar drawn behind the row content.
       *
       * Uses an explicit solid colour rather than a low-opacity fill: an
       * `opacity-15` overlay composites differently against each row background,
       * which made bid bars look outlined and ask bars look filled.
       */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 right-0 border-l',
          side === 'bid'
            ? 'border-primary/40 bg-[rgba(78,222,163,0.12)]'
            : 'border-error/40 bg-[rgba(255,180,171,0.12)]',
        )}
        style={{ width: `${width}%` }}
      />
      <span
        className={cn(
          'relative tabular font-medium',
          side === 'bid' ? 'text-primary' : 'text-error',
        )}
      >
        {formatUsdgNumber(level.pricePerUnit, 4)}
      </span>
      <span className="relative tabular text-right text-on-surface">
        {formatNumber(amount)}
      </span>
      <span className="relative tabular text-right text-on-surface-variant">
        {formatNumber(Number(level.cumulative))}
      </span>
    </button>
  );
}

export function OrderBookView({ book, onSelectLevel, className }: OrderBookProps) {
  const maxAmount = Math.max(
    ...book.bids.map((level) => Number(level.amount)),
    ...book.asks.map((level) => Number(level.amount)),
    1,
  );

  const bidDepth = book.bids.reduce((acc, level) => acc + Number(level.amount), 0);
  const askDepth = book.asks.reduce((acc, level) => acc + Number(level.amount), 0);
  const totalDepth = bidDepth + askDepth;
  const bidShare = totalDepth > 0 ? (bidDepth / totalDepth) * 100 : 50;

  const bestBid = book.bids[0];
  const bestAsk = book.asks[0];
  const spread =
    bestBid && bestAsk
      ? Number(bestAsk.pricePerUnit) - Number(bestBid.pricePerUnit)
      : null;

  return (
    <div className={cn('flex-col gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container p-space-md', className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-headline-sm text-on-surface">Order Book &amp; Depth</h3>
        <span className="font-mono text-label-sm text-outline">Price · Size · Cum.</span>
      </div>

      {/* Asks above bids, both descending outward from the mid — the convention
          traders expect, since the cheapest ask sits next to the best bid. */}
      <div className="flex-col gap-1">
        <div className="grid grid-cols-3 gap-2 px-2 font-mono text-label-sm uppercase tracking-wider text-outline">
          <span>Ask Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Cumulative</span>
        </div>
        {[...book.asks].reverse().map((level) => (
          <LadderRow
            key={`ask-${level.pricePerUnit}`}
            level={level}
            side="ask"
            maxAmount={maxAmount}
            onSelect={() => onSelectLevel?.(level, 'ask')}
          />
        ))}
      </div>

      {/* Spread marker */}
      <div className="flex items-center justify-between rounded bg-surface-container-lowest px-2 py-1.5 font-mono text-label-sm">
        <span className="text-on-surface-variant">
          Best bid <span className="tabular text-primary">{bestBid ? formatUsdgNumber(bestBid.pricePerUnit, 4) : '—'}</span>
        </span>
        <span className="text-outline">
          Spread{' '}
          <span className="tabular text-on-surface">
            {spread !== null && bestAsk ? `${formatUsdgNumber(String(spread), 4)} USDG` : '—'}
          </span>
        </span>
        <span className="text-on-surface-variant">
          Best ask <span className="tabular text-error">{bestAsk ? formatUsdgNumber(bestAsk.pricePerUnit, 4) : '—'}</span>
        </span>
      </div>

      <div className="flex-col gap-1">
        {book.bids.map((level) => (
          <LadderRow
            key={`bid-${level.pricePerUnit}`}
            level={level}
            side="bid"
            maxAmount={maxAmount}
            onSelect={() => onSelectLevel?.(level, 'bid')}
          />
        ))}
        <div className="grid grid-cols-3 gap-2 px-2 font-mono text-label-sm uppercase tracking-wider text-outline">
          <span>Bid Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Cumulative</span>
        </div>
      </div>

      {/* Depth balance. A visual only - it is resting orders, not a valuation. */}
      <div className="space-y-1 border-t border-outline-variant/30 pt-space-sm">
        <div className="flex justify-between font-mono text-label-sm">
          <span className="text-primary">Bids {formatNumber(bidDepth)}</span>
          <span className="text-error">Asks {formatNumber(askDepth)}</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded bg-surface-container-lowest">
          <span
            aria-hidden
            className="h-full bg-primary/70"
            style={{ width: `${bidShare}%` }}
          />
          <span
            aria-hidden
            className="h-full bg-error/70"
            style={{ width: `${100 - bidShare}%` }}
          />
        </div>
        <p className="font-mono text-label-sm text-outline">
          Resting order size only. Not a price target or valuation.
        </p>
      </div>
    </div>
  );
}

/** Compact price sparkline used on the market list. */
export function PriceSparkline({
  prices,
  className,
}: {
  prices: number[];
  className?: string;
}) {
  if (prices.length < 2) {
    return (
      <span className={cn('font-mono text-label-sm text-outline', className)}>
        No trades
      </span>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 100;
  const height = 28;

  const points = prices
    .map((price, index) => {
      const x = (index / (prices.length - 1)) * width;
      const y = height - ((price - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const rising = prices[prices.length - 1]! >= prices[0]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-7 w-24', className)}
      aria-hidden
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={rising ? '#4edea3' : '#ffb4ab'}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Total notional resting in a book, in USDG, for the metrics ribbon. */
export function bookNotional(book: OrderBook): string {
  const sum = [...book.bids, ...book.asks].reduce((acc, level) => {
    const price = BigInt(level.pricePerUnit);
    const amount = BigInt(level.amount);
    return acc + price * amount;
  }, 0n);
  return formatUsdgNumber(sum, 2);
}

export { Icon };
