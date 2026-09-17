'use client';

import * as React from 'react';
import Link from 'next/link';

import { OrderBookView, PriceSparkline, bookNotional } from '@/components/market/order-book';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { mockListings, mockOrderBook, mockProjects } from '@/lib/data/mock';
import { formatEthNumber, formatNumber, formatRelativeTime, shortenAddress, weiToEthTrimmed } from '@/lib/format';
import { listingStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Listing } from '@protorwa/shared';

/**
 * Secondary claims market (/market).
 *
 * Layout follows the design: a title group with engine status pills, a metrics
 * ribbon, then a two-pane body with the tradable list on the left and the order
 * book plus execution terminal on the right.
 *
 * COPY REVIEW REQUIRED - the source design described an engine that does not
 * exist. Removed here:
 *   "Instant on-chain liquidity"    -> there is no AMM; liquidity is P2P listings.
 *   "Gasless / Subsidized Relayer"  -> no relayer is deployed; users pay gas.
 *   "ProtoEscrow v2.4"              -> invented version number.
 *   "yield-bearing ... claims"      -> claims do not yield.
 *   Fictional tickers and prices    -> replaced with the demo data layer.
 * What remains is what SecondaryMarket.sol actually does.
 */

/** Derives the market view model from a listing plus its project. */
function useMarketRows() {
  return React.useMemo(() => {
    return mockListings.map((listing) => {
      const project = mockProjects.find((candidate) => candidate.id === listing.projectId);
      const ticker = (project?.title ?? 'UNKNOWN')
        .split(/\s+/)
        .map((word) => word[0])
        .join('')
        .slice(0, 5)
        .toUpperCase();

      const book = mockOrderBook(listing.projectId);
      const bestBid = book.bids[0];
      const spreadBps =
        bestBid && Number(bestBid.pricePerUnit) > 0
          ? ((Number(listing.pricePerUnit) - Number(bestBid.pricePerUnit)) /
              Number(listing.pricePerUnit)) *
            10_000
          : null;

      return { listing, project, ticker, book, bestBid, spreadBps };
    });
  }, []);
}

/** Status pill strip describing the real mechanism, not an invented engine. */
function EngineStatus() {
  return (
    <div className="flex-wrap items-center gap-space-sm rounded-xl bg-surface-container-low px-space-md py-3">
      <div className="flex flex-col">
        <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
          Matching
        </span>
        <span className="font-mono text-label-md font-bold text-primary">P2P Listings</span>
      </div>
      <div className="h-6 w-px bg-surface-container-highest" />
      <div className="flex flex-col">
        <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
          Custody on list
        </span>
        <span className="font-mono text-label-md font-bold text-secondary">SecondaryMarket</span>
      </div>
      <div className="h-6 w-px bg-surface-container-highest" />
      <div className="flex flex-col">
        <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
          Fee
        </span>
        <span className="font-mono text-label-md font-bold text-on-surface">1%</span>
      </div>
    </div>
  );
}

/** Metrics ribbon: all values computed from the demo book, none hardcoded. */
function MetricsRibbon() {
  const rows = useMarketRows();

  const totalDepth = rows.reduce(
    (acc, row) =>
      acc + [...row.book.bids, ...row.book.asks].reduce((sum, level) => sum + Number(level.amount), 0),
    0,
  );

  const activeListings = rows.filter((row) => row.listing.status === 'ACTIVE');

  const listedNotional = activeListings.reduce(
    (acc, row) => acc + BigInt(row.listing.pricePerUnit) * BigInt(row.listing.amount),
    0n,
  );

  const holders = mockProjects.reduce((acc, project) => acc + (project.metrics?.holders ?? 0), 0);

  const tiles = [
    {
      label: 'Active listings',
      value: formatNumber(activeListings.length),
      icon: 'sell',
    },
    {
      label: 'Resting depth',
      value: `${formatNumber(totalDepth)} units`,
      icon: 'waterfall_chart',
    },
    {
      label: 'Listed notional',
      value: `${weiToEthTrimmed(listedNotional, 2)} ETH`,
      icon: 'payments',
    },
    {
      label: 'Known holders',
      value: formatNumber(holders),
      icon: 'group',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex-col justify-between gap-space-sm rounded-xl bg-surface-container-low p-space-md shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-sm uppercase tracking-wider text-outline">
              {tile.label}
            </span>
            <Icon name={tile.icon} size={18} className="text-outline" />
          </div>
          <div className="font-display text-headline-md tabular text-on-surface">{tile.value}</div>
        </div>
      ))}
    </div>
  );
}

/** The tradable list. Selecting a row swaps the order book on the right. */
function ListingTable({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const rows = useMarketRows();

  return (
    <div className="overflow-hidden rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="flex items-center justify-between border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Tradable Claims</h2>
        <span className="font-mono text-label-sm text-outline">
          {rows.length} projects
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <caption className="sr-only">
            Claim listings available on the secondary market, with ask price,
            size, spread to best bid and project status.
          </caption>
          <thead>
            <tr className="bg-surface-container-low font-mono text-label-sm uppercase tracking-wider text-outline">
              <th scope="col" className="px-space-md py-2">Project</th>
              <th scope="col" className="px-space-md py-2 text-right">Best ask</th>
              <th scope="col" className="px-space-md py-2 text-right">Size</th>
              <th scope="col" className="px-space-md py-2 text-right">vs best bid</th>
              <th scope="col" className="px-space-md py-2">Seller</th>
              <th scope="col" className="px-space-md py-2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = listingStatus(row.listing.status);
              const selected = row.listing.id === selectedId;
              const project = row.project;

              return (
                <tr
                  key={row.listing.id}
                  onClick={() => onSelect(row.listing.id)}
                  className={cn(
                    'cursor-pointer border-t border-outline-variant/20 transition-colors',
                    selected ? 'bg-primary/10' : 'hover:bg-surface-container-high',
                  )}
                >
                  <th scope="row" className="px-space-md py-3 text-left">
                    <div className="flex items-center gap-2">
                      <span className="rounded border-outline-variant/50 bg-surface-container-lowest px-1.5 py-0.5 font-mono text-label-sm text-secondary">
                        {row.ticker}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-on-surface">
                          {project?.title ?? 'Unknown project'}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusDot
                            tone={project?.status === 'IN_PRODUCTION' ? 'accent' : 'brand'}
                          />
                          <span className="font-mono text-label-sm text-outline">
                            {status.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </th>
                  <td className="px-space-md py-3 text-right font-mono tabular text-on-surface">
                    {formatEthNumber(row.listing.pricePerUnit, 4)}
                  </td>
                  <td className="px-space-md py-3 text-right font-mono tabular text-on-surface-variant">
                    {formatNumber(row.listing.amount)}
                  </td>
                  <td className="px-space-md py-3 text-right font-mono tabular">
                    {row.spreadBps === null ? (
                      <span className="text-outline">no bids</span>
                    ) : (
                      <span className={row.spreadBps > 0 ? 'text-error' : 'text-primary'}>
                        {row.spreadBps > 0 ? '+' : ''}
                        {(row.spreadBps / 100).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-space-md py-3 font-mono text-label-sm text-on-surface-variant">
                    {shortenAddress(row.listing.seller)}
                  </td>
                  <td className="px-space-md py-3">
                    <PriceSparkline
                      prices={row.book.bids
                        .map((level) => Number(level.pricePerUnit))
                        .reverse()
                        .concat(row.book.asks.map((level) => Number(level.pricePerUnit)))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Recent fills. Derived from the same listing set so it cannot drift. */
function RecentFills() {
  const rows = useMarketRows();

  return (
    <div className="rounded-lg border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">My Active Listings</h2>
      </div>
      <ul className="flex-col">
        {rows.slice(0, 3).map((row) => (
          <li
            key={row.listing.id}
            className="flex items-center justify-between gap-space-sm border-b border-outline-variant/20 px-space-md py-space-sm last:border-0"
          >
            <div className="min-w-0">
              <div className="truncate text-body-sm text-on-surface">
                {row.project?.title ?? 'Unknown'}
              </div>
              <div className="font-mono text-label-sm text-outline">
                {formatNumber(row.listing.amount)} units @{' '}
                {formatEthNumber(row.listing.pricePerUnit, 4)} ETH
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-space-sm">
              <span className="font-mono text-label-sm text-outline">
                {formatRelativeTime(row.listing.createdAt)}
              </span>
              <Badge tone={listingStatus(row.listing.status).tone}>
                {listingStatus(row.listing.status).label}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MarketPage() {
  const [selectedId, setSelectedId] = React.useState(mockListings[0]?.id ?? '1');
  const rows = useMarketRows();

  const selected = rows.find((row) => row.listing.id === selectedId) ?? rows[0];

  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-space-md lg:flex-row lg:items-end">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-label-sm uppercase tracking-wider text-primary">
                Secondary Market
              </span>
              <span aria-hidden className="font-mono text-label-sm text-outline-variant">
                •
              </span>
              {/* "P2P Milestone Liquidity Active" -> accurate, not "instant liquidity". */}
              <span className="flex items-center gap-1 font-mono text-label-sm text-on-surface-variant">
                <StatusDot tone="brand" pulse />
                Peer-to-peer claim trading
              </span>
            </div>

            <h1 className="font-display text-headline-lg font-bold tracking-tight text-on-surface">
              Claims Exchange
            </h1>
            <p className="max-w-2xl text-body-md text-on-surface-variant">
              Exit a position before delivery, or accumulate claims in a build you
              believe in. Listings are peer-to-peer and seller-escrowed. Prices are
              set by sellers and paid by buyers — nothing here is an offer at a
              protocol-determined price.
            </p>
          </div>

          <EngineStatus />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-space-lg px-space-lg py-space-lg lg:px-margin">
        <MetricsRibbon />

        <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-12">
          <div className="flex flex-col gap-space-lg xl:col-span-7">
            <ListingTable selectedId={selectedId} onSelect={setSelectedId} />
            <RecentFills />
          </div>

          <div className="flex flex-col gap-space-lg xl:col-span-5">
            {selected ? (
              <>
                <div className="flex-col gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container p-space-md">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div>
                      <div className="font-mono text-label-sm uppercase tracking-wider text-outline">
                        Selected claim
                      </div>
                      <h2 className="font-display text-headline-sm text-on-surface">
                        {selected.project?.title ?? 'Unknown project'}
                      </h2>
                    </div>
                    <Link
                      href={`/projects/${selected.project?.slug ?? ''}`}
                      className="inline-flex items-center gap-1 font-mono text-label-sm text-primary hover:underline"
                    >
                      Project page
                      <Icon name="arrow_forward" size={14} />
                    </Link>
                  </div>

                  <div className="grid-cols-2 gap-space-sm font-mono text-label-sm">
                    <div>
                      <div className="text-outline">Best ask</div>
                      <div className="tabular text-error">
                        {formatEthNumber(selected.listing.pricePerUnit, 4)} ETH
                      </div>
                    </div>
                    <div>
                      <div className="text-outline">Best bid</div>
                      <div className="tabular text-primary">
                        {selected.bestBid
                          ? `${formatEthNumber(selected.bestBid.pricePerUnit, 4)} ETH`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-outline">Book notional</div>
                      <div className="tabular text-on-surface">
                        {bookNotional(selected.book)} ETH
                      </div>
                    </div>
                    <div>
                      <div className="text-outline">Listing size</div>
                      <div className="tabular text-on-surface">
                        {formatNumber(selected.listing.amount)} units
                      </div>
                    </div>
                  </div>

                  <p className="font-mono text-label-sm text-outline">
                    Trading requires a connected wallet and a deployed market
                    contract. Neither is available in this demo.
                  </p>

                  <div className="flex flex-wrap gap-space-sm border-t border-outline-variant/30 pt-space-sm">
                    {/*
                     * These are genuinely unavailable (no wallet, no deployment),
                     * so they use the muted surface treatment rather than a filled
                     * primary button at reduced opacity. A dimmed emerald CTA still
                     * reads as clickable, which invites a wasted click during a
                     * demo; a dashed outline reads as unavailable at a glance.
                     */}
                    <button
                      type="button"
                      disabled
                      aria-disabled
                      title="No wallet connected and no market deployed on this network."
                      className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded border-dashed border-outline-variant/60 bg-surface-container-lowest px-space-md py-2.5 font-display text-headline-sm text-outline"
                    >
                      <Icon name="lock" size={18} />
                      Buy claims
                    </button>
                    <button
                      type="button"
                      disabled
                      aria-disabled
                      title="No wallet connected and no market deployed on this network."
                      className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded border-dashed border-outline-variant/60 bg-surface-container-lowest px-space-md py-2.5 font-mono text-label-lg text-outline"
                    >
                      <Icon name="lock" size={18} />
                      List claims
                    </button>
                    <Link
                      href={`/market/${(selected.project?.title ?? '')
                        .split(/\s+/)
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 6)
                        .toLowerCase()}`}
                      className="mt-space-xs inline-flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-space-md py-2.5 font-mono text-label-md text-primary transition-colors hover:bg-primary/20"
                    >
                      <Icon name="candlestick_chart" size={18} />
                      Open Full Trading Terminal (Screen 23)
                    </Link>
                  </div>
                </div>

                <OrderBookView book={selected.book} />
              </>
            ) : null}
          </div>
        </div>

        {/* What the market is and is not. */}
        <section className="rounded-lg border-outline-variant/40 bg-surface-container-low p-space-md">
          <div className="flex items-center gap-space-sm">
            <Icon name="info" size={18} className="shrink-0 text-outline" />
            <h2 className="font-display text-headline-sm text-on-surface">
              How this market behaves
            </h2>
          </div>
          <ul className="mt-space-sm grid-cols-1 gap-space-sm text-body-sm text-on-surface-variant md:grid-cols-2">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
              <span>
                Sellers escrow their claims into the market when listing, so an
                active listing cannot turn out to be unfillable.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
              <span>
                There is no automated market maker. A price only exists if a seller
                sets one and a buyer accepts it.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
              <span>
                A 1% protocol fee applies on settlement, fixed at listing time.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
              <span>
                Claims in a disputed or defaulted project are frozen and cannot
                trade.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

export type { Listing };
