'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { OrderBookView } from '@/components/market/order-book';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { mockListings, mockOrderBook, mockProjects } from '@/lib/data/mock';
import {
  formatDate,
  formatEthNumber,
  formatNumber,
  shortenAddress,
  weiToEthTrimmed,
} from '@/lib/format';
import { projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';

/**
 * Individual Claim Trading Terminal (Screen 23 — SHLFROST / per-asset view).
 *
 * A dedicated Bloomberg-style terminal for one hardware claim asset.
 * Shows the live orderbook, asset stats, order slip, physical delivery
 * context, and risk disclosure.
 */

/** Derive a URL-safe ticker slug from a project title. */
function deriveTickerSlug(title: string): string {
  return title
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 6)
    .toLowerCase();
}

/** Derive display ticker from a project title. */
function deriveTicker(title: string): string {
  return deriveTickerSlug(title).toUpperCase();
}

/** Mock recent fills for demo. */
const mockFills = [
  { ts: new Date(Date.now() - 3 * 60_000), amount: 200, price: '0.01312', buyer: '0x7a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4' },
  { ts: new Date(Date.now() - 18 * 60_000), amount: 450, price: '0.01318', buyer: '0x8b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5' },
  { ts: new Date(Date.now() - 47 * 60_000), amount: 100, price: '0.01320', buyer: '0x9c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6' },
  { ts: new Date(Date.now() - 2 * 3_600_000), amount: 750, price: '0.01305', buyer: '0x4f3a120e72c76c22ae802382fbae9519b61a6de1' },
];

function relativeTime(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function ClaimTradingTerminalPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const project = mockProjects.find((p) => deriveTickerSlug(p.title) === ticker);

  const [side, setSide] = React.useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = React.useState('');
  const [selectedLevel, setSelectedLevel] = React.useState<string>('');

  if (!project) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center font-mono text-outline">
        Asset <span className="mx-1 text-on-surface">{ticker?.toUpperCase()}</span> not found.{' '}
        <Link href="/market" className="ml-2 text-primary hover:underline">
          ← Back to market
        </Link>
      </div>
    );
  }

  const displayTicker = deriveTicker(project.title);
  const book = mockOrderBook(project.id);
  const listings = mockListings.filter((l) => l.projectId === project.id && l.status === 'ACTIVE');
  const bestAsk = book.asks[0];
  const bestBid = book.bids[0];
  const askPrice = bestAsk ? weiToEthTrimmed(bestAsk.pricePerUnit) : '—';
  const bidPrice = bestBid ? weiToEthTrimmed(bestBid.pricePerUnit) : '—';
  const status = projectStatus(project.status);

  const priceInput = selectedLevel || (side === 'buy' ? askPrice : bidPrice);
  const amountNum = Number(amount) || 0;
  const priceNum = Number(priceInput) || 0;
  const subtotal = amountNum * priceNum;
  const fee = subtotal * 0.01;
  const total = subtotal + (side === 'buy' ? fee : -fee);

  const completedMilestones = project.milestones.filter((m) => m.status === 'APPROVED').length;

  return (
    <>
      {/* ── Back nav ──────────────────────────────────────────────── */}
      <div className="border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-2 lg:px-margin">
        <Link
          href="/market"
          className="inline-flex items-center gap-space-xs font-mono text-label-sm text-outline transition-colors hover:text-primary"
        >
          <Icon name="arrow_back" size={14} />
          Secondary Market
        </Link>
      </div>

      {/* ── Asset header ──────────────────────────────────────────── */}
      <header className="border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-md lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex flex-wrap items-center gap-space-md">
              <div>
                <h1 className="font-display text-headline-md text-on-surface">{project.title}</h1>
                <p className="text-body-sm text-on-surface-variant">{project.tagline}</p>
              </div>
              <Badge tone="neutral" className="font-mono text-label-lg">
                {displayTicker}
              </Badge>
              <Badge tone={status.tone}>
                <StatusDot tone={status.tone === 'brand' ? 'brand' : 'neutral'} />
                {status.label}
              </Badge>
              <Badge tone="info" className="font-mono text-label-sm">
                <Icon name="settings_ethernet" size={11} className="mr-1" />
                Arbitrum Sepolia
              </Badge>
            </div>
          </div>

          {/* Stats ribbon */}
          <div className="mt-space-md grid grid-cols-2 gap-px bg-outline-variant/20 rounded-lg overflow-hidden sm:grid-cols-4">
            {[
              { label: 'Best Ask', value: askPrice + ' ETH', color: 'text-error' },
              { label: 'Best Bid', value: bidPrice + ' ETH', color: 'text-primary' },
              { label: 'Claims Outstanding', value: formatNumber(project.claimsCommitted) },
              {
                label: 'Delivery Target',
                value: project.escrow.fundingDeadline
                  ? formatDate(project.escrow.fundingDeadline)
                  : '—',
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="flex flex-col gap-0.5 bg-surface-container px-space-md py-space-sm"
              >
                <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
                  {label}
                </span>
                <span className={cn('font-mono text-headline-sm tabular text-on-surface', color)}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-space-lg py-space-xl lg:px-margin">
        <div className="grid gap-space-lg lg:grid-cols-[1fr_360px]">

          {/* ── LEFT: Orderbook + recent fills ───────────────────── */}
          <div className="flex flex-col gap-space-lg">
            {/* Orderbook */}
            <section>
              <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                Order Book
              </h2>
              <OrderBookView
                book={book}
                onSelectLevel={(level, _side) => setSelectedLevel(weiToEthTrimmed(level.pricePerUnit))}
              />
            </section>

            {/* Recent fills */}
            <section>
              <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                Recent Fills
              </h2>
              <div className="overflow-hidden rounded-lg border border-outline-variant/40">
                <div className="grid grid-cols-4 border-b border-outline-variant/40 bg-surface-container px-space-md py-space-xs font-mono text-label-sm uppercase tracking-wider text-outline">
                  <span>Time</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Price ETH</span>
                  <span className="text-right">Buyer</span>
                </div>
                {mockFills.map((fill, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-4 border-b border-outline-variant/20 bg-surface-container-lowest px-space-md py-space-xs font-mono text-label-sm last:border-0"
                  >
                    <span className="text-outline">{relativeTime(fill.ts)}</span>
                    <span className="text-right text-on-surface">{formatNumber(fill.amount)}</span>
                    <span className="text-right text-primary">{fill.price}</span>
                    <span className="text-right text-on-surface-variant">
                      {shortenAddress(fill.buyer)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Active listings */}
            {listings.length > 0 && (
              <section>
                <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Active Listings
                </h2>
                <div className="overflow-hidden rounded-lg border border-outline-variant/40">
                  <div className="grid grid-cols-3 border-b border-outline-variant/40 bg-surface-container px-space-md py-space-xs font-mono text-label-sm uppercase tracking-wider text-outline">
                    <span>Seller</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">Price / claim</span>
                  </div>
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="grid grid-cols-3 border-b border-outline-variant/20 bg-surface-container-lowest px-space-md py-space-xs font-mono text-label-sm last:border-0"
                    >
                      <span className="text-on-surface-variant">{shortenAddress(listing.seller)}</span>
                      <span className="text-right text-on-surface">{formatNumber(Number(listing.amount))}</span>
                      <span className="text-right text-error">{weiToEthTrimmed(listing.pricePerUnit)} ETH</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT: Order slip + delivery + risk ──────────────── */}
          <div className="flex flex-col gap-space-lg">
            {/* Order slip */}
            <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
              <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
                <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Order Slip
                </h2>
              </div>

              {/* BUY / SELL tabs */}
              <div className="grid grid-cols-2 border-b border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setSide('buy')}
                  className={cn(
                    'py-space-sm font-mono text-label-md font-bold transition-colors',
                    side === 'buy'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-outline hover:text-on-surface',
                  )}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setSide('sell')}
                  className={cn(
                    'py-space-sm font-mono text-label-md font-bold transition-colors',
                    side === 'sell'
                      ? 'border-b-2 border-error text-error'
                      : 'text-outline hover:text-on-surface',
                  )}
                >
                  Sell
                </button>
              </div>

              <div className="flex flex-col gap-space-sm p-space-md">
                {/* Amount */}
                <label className="block">
                  <span className="font-mono text-label-sm text-outline">Amount (claims)</span>
                  <input
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface-container-lowest px-space-sm py-2 font-mono text-label-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
                  />
                </label>

                {/* Price */}
                <label className="block">
                  <span className="font-mono text-label-sm text-outline">Price per claim (ETH)</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={priceInput}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    placeholder={side === 'buy' ? askPrice : bidPrice}
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface-container-lowest px-space-sm py-2 font-mono text-label-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
                  />
                </label>

                {/* Totals */}
                <div className="flex flex-col gap-0.5 rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm">
                  <div className="flex justify-between">
                    <span className="text-outline">Subtotal</span>
                    <span className="tabular text-on-surface">{subtotal.toFixed(6)} ETH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-outline">Protocol fee (1%)</span>
                    <span className="tabular text-tertiary">{fee.toFixed(6)} ETH</span>
                  </div>
                  <div className="flex justify-between border-t border-outline-variant/30 pt-0.5">
                    <span className="font-bold text-on-surface">
                      {side === 'buy' ? 'Total cost' : 'You receive'}
                    </span>
                    <span className="tabular font-bold text-on-surface">{total.toFixed(6)} ETH</span>
                  </div>
                </div>

                <Button
                  variant={side === 'buy' ? 'primary' : 'danger'}
                  disabled
                  className="w-full justify-center"
                  title="Connect wallet to trade"
                >
                  <Icon name={side === 'buy' ? 'shopping_cart' : 'sell'} size={16} />
                  Place {side === 'buy' ? 'Buy' : 'Sell'} Order
                </Button>
                <p className="text-center font-mono text-label-sm text-outline">
                  Connect wallet to trade on Arbitrum Sepolia
                </p>
              </div>
            </section>

            {/* Physical delivery card */}
            <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
              <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
                <h2 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Physical Delivery
                </h2>
              </div>
              <div className="flex flex-col gap-space-sm p-space-md font-mono text-label-sm">
                <div className="flex items-center justify-between">
                  <span className="text-outline">Project</span>
                  <span className="text-on-surface">{project.title}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-outline">Expected delivery</span>
                  <span className="text-on-surface">
                    {project.escrow.fundingDeadline
                      ? formatDate(project.escrow.fundingDeadline)
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-outline">Milestones</span>
                  <span className="text-on-surface">
                    {completedMilestones} / {project.milestones.length} complete
                  </span>
                </div>
                <Button variant="outline" disabled size="sm" className="mt-space-xs w-full justify-center">
                  <Icon name="package_2" size={14} />
                  Redeem physical unit
                </Button>
                <p className="text-center text-outline">
                  Redemption available after all milestones complete
                </p>
              </div>
            </section>

            {/* Risk disclosure */}
            <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-mono text-label-sm text-outline">
              <div className="mb-space-xs flex items-center gap-1 uppercase tracking-wider">
                <Icon name="info" size={12} />
                Risk Disclosure
              </div>
              <p>
                Claims represent commitment rights in a hardware production escrow, not securities.
                Physical delivery is contingent on milestone completion and backer consensus. Capital
                may be refunded if the project fails to meet milestones. Not financial advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

