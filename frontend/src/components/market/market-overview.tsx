'use client';

import * as React from 'react';
import Link from 'next/link';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

import { OrderBookView, bookNotional } from '@/components/market/order-book';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { mockListings, mockOrderBook } from '@/lib/data/mock';
import { formatNumber, formatRelativeTime, formatUsdgNumber, shortenAddress } from '@/lib/format';
import { isTradableStatus, listingStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { Listing, OrderBook, OrderBookLevel, Project } from '@protorwa/shared';

/**
 * Secondary claims market (/market).
 *
 * Layout follows the design: a title group with engine status pills, a metrics
 * ribbon, then a two-pane body with the tradable list on the left and the order
 * book plus execution terminal on the right.
 *
 * It renders the *unified* catalogue passed down by the server wrapper: the
 * curated showcase projects (which carry a featured listing on a sample book)
 * plus any project published to the deployed registry. Live on-chain projects
 * have no sample listing, so their book cells read "Live - open terminal" and
 * the real USDG book is shown on the per-asset terminal (Screen 23), which
 * reads the deployed SecondaryMarket directly.
 *
 * Copy is deliberately conservative about the mechanism: there is no AMM, no
 * relayer and no protocol-set price - liquidity is peer-to-peer listings that
 * the seller escrows into SecondaryMarket.
 */

/** Derive the display ticker for a project (matches the terminal's derivation). */
function deriveTicker(title: string): string {
  return title
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 6)
    .toUpperCase();
}

/** Route to the per-asset terminal. Slug is collision-free across demo ids. */
function terminalHref(project: Project): string {
  return `/market/p/${project.slug}`;
}

/** A row in the tradable table, merging the catalogue with any sample listing. */
interface MarketRow {
  project: Project;
  ticker: string;
  /** Featured sample listing for showcase projects; null for live on-chain ones. */
  listing: Listing | null;
  book: OrderBook;
  bestBid: OrderBookLevel | null;
  spreadBps: number | null;
}

/** Build the table view-model from the catalogue projects. */
function useMarketRows(projects: Project[]): MarketRow[] {
  return React.useMemo(() => {
    return projects.map((project) => {
      // Live on-chain assets have a real USDG book behind the terminal, so the
      // overview shows no fabricated numbers for them. Keying the sample listing
      // off `id` alone would be unsafe anyway: showcase projects use a display
      // index ('1'|'2'|'3') that overlaps on-chain ids, so a live project could
      // otherwise inherit a different project's sample listing. Branching on
      // `liquidityMode` first keeps the two namespaces from bleeding together.
      const isReal = project.liquidityMode === 'real';
      const listing = isReal
        ? null
        : mockListings.find((l) => l.projectId === project.id && l.status === 'ACTIVE') ?? null;
      const book: OrderBook = isReal
        ? { projectId: project.id, asks: [], bids: [] }
        : mockOrderBook(project.id);
      const bestBid = book.bids[0] ?? null;
      const spreadBps =
        listing && bestBid && Number(bestBid.pricePerUnit) > 0
          ? ((Number(listing.pricePerUnit) - Number(bestBid.pricePerUnit)) /
              Number(listing.pricePerUnit)) *
            10_000
          : null;
      return { project, ticker: deriveTicker(project.title), listing, book, bestBid, spreadBps };
    });
  }, [projects]);
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

/** Metrics ribbon: computed from the sample book; live books settle per asset. */
function MetricsRibbon({ projects }: { projects: Project[] }) {
  const rows = useMarketRows(projects);

  const totalDepth = rows.reduce(
    (acc, row) =>
      acc + [...row.book.bids, ...row.book.asks].reduce((sum, level) => sum + Number(level.amount), 0),
    0,
  );

  const activeListings = rows.filter((row) => row.listing);

  const listedNotional = activeListings.reduce(
    (acc, row) => acc + BigInt(row.listing!.pricePerUnit) * BigInt(row.listing!.amount),
    0n,
  );

  const holders = projects.reduce((acc, project) => acc + (project.metrics?.holders ?? 0), 0);

  const liveCount = projects.filter((p) => p.liquidityMode === 'real').length;

  const tiles = [
    { label: 'Tradable assets', value: formatNumber(projects.length), icon: 'inventory_2' },
    {
      label: 'Live on-chain',
      value: formatNumber(liveCount),
      icon: 'settings_ethernet',
    },
    {
      label: 'Listed notional',
      value: `${formatUsdgNumber(listedNotional, 2)} USDG`,
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
      {/* Keep resting-depth visible as a caption rather than a headline tile. */}
      <span className="sr-only">{`${totalDepth} units of resting depth on the sample book.`}</span>
    </div>
  );
}

/** The tradable list with category filter and search bar from Stitch Screen 09. */
function ListingTable({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [category, setCategory] = React.useState<string>('all');
  const [search, setSearch] = React.useState<string>('');
  const rows = useMarketRows(projects);

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      const matchesCategory =
        category === 'all' ||
        (category === 'energy' && row.project.category === 'ENERGY') ||
        (category === 'robotics' && row.project.category === 'ROBOTICS') ||
        (category === 'sensors' && row.project.category === 'SENSORS');

      const matchesSearch =
        search === '' ||
        row.project.title.toLowerCase().includes(search.toLowerCase()) ||
        row.ticker.toLowerCase().includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [rows, category, search]);

  return (
    <div className="flex flex-col gap-space-sm">
      {/* Category and search control bar (Screen 09) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm rounded-xl bg-surface-container-low p-space-sm">
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'all', label: 'All Hardware' },
            { id: 'energy', label: 'Energy' },
            { id: 'robotics', label: 'Robotics' },
            { id: 'sensors', label: 'Sensors' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id)}
              className={cn(
                'px-space-sm py-1 rounded font-mono text-label-sm uppercase transition-colors',
                category === tab.id
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Icon name="search" size={16} className="absolute left-2.5 top-2 text-outline" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter ticker or SKU..."
            className="w-full sm:w-48 rounded bg-surface-container-lowest py-1 pl-8 pr-3 font-mono text-label-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container">
        <div className="flex items-center justify-between border-b border-outline-variant/40 px-space-md py-space-sm">
          <div className="flex items-center gap-2">
            <Icon name="table_chart" size={18} className="text-primary" />
            <h2 className="font-display text-headline-sm text-on-surface">Live Product Claims</h2>
          </div>
          <span className="font-mono text-label-sm text-outline">
            {filteredRows.length} projects
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">
              Claim assets available on the secondary market, with ask price, size, spread to best
              bid and project status.
            </caption>
            <thead>
              <tr className="bg-surface-container-low font-mono text-label-sm uppercase tracking-wider text-outline">
                <th scope="col" className="px-space-md py-2">Project</th>
                <th scope="col" className="px-space-md py-2 text-right">Best ask</th>
                <th scope="col" className="px-space-md py-2 text-right">Size</th>
                <th scope="col" className="px-space-md py-2 text-right">vs best bid</th>
                <th scope="col" className="px-space-md py-2">Seller</th>
                <th scope="col" className="px-space-md py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const selected = row.project.id === selectedId;
                const project = row.project;
                const isLive = project.liquidityMode === 'real';

                return (
                  <tr
                    key={project.id}
                    onClick={() => onSelect(project.id)}
                    className={cn(
                      'cursor-pointer border-t border-outline-variant/20 transition-colors',
                      selected ? 'bg-primary/10' : 'hover:bg-surface-container-high',
                    )}
                  >
                    <th scope="row" className="px-space-md py-3 text-left">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-outline-variant/50 bg-surface-container-lowest px-1.5 py-0.5 font-mono text-label-sm text-secondary">
                          {row.ticker}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-on-surface">
                            {project.title}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <StatusDot tone={isLive ? 'brand' : 'accent'} />
                            <span className="font-mono text-label-sm text-outline">
                              {isLive ? 'On-chain' : 'Showcase'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </th>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface">
                      {row.listing ? formatUsdgNumber(row.listing.pricePerUnit, 4) : '—'}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular text-on-surface-variant">
                      {row.listing ? formatNumber(row.listing.amount) : '—'}
                    </td>
                    <td className="px-space-md py-3 text-right font-mono tabular">
                      {row.listing ? (
                        row.spreadBps === null ? (
                          <span className="text-outline">no bids</span>
                        ) : (
                          <span className={row.spreadBps > 0 ? 'text-error' : 'text-primary'}>
                            {row.spreadBps > 0 ? '+' : ''}
                            {(row.spreadBps / 100).toFixed(2)}%
                          </span>
                        )
                      ) : (
                        <span className="text-outline">live book</span>
                      )}
                    </td>
                    <td className="px-space-md py-3 font-mono text-label-sm text-on-surface-variant">
                      {row.listing ? shortenAddress(row.listing.seller) : '—'}
                    </td>
                    <td className="px-space-md py-3 text-right">
                      <Link
                        href={terminalHref(project)}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded bg-surface-container-highest px-2 py-1 font-mono text-label-sm text-primary hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        Terminal
                        <Icon name="arrow_forward" size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Featured sample listings. Not the connected wallet's orders. */
function RecentFills({ projects }: { projects: Project[] }) {
  const rows = useMarketRows(projects).filter((row) => row.listing);

  return (
    <div className="rounded-lg border border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="font-display text-headline-sm text-on-surface">Featured Listings</h2>
      </div>
      <ul className="flex-col">
        {rows.slice(0, 3).map((row) => (
          <li
            key={row.project.id}
            className="flex items-center justify-between gap-space-sm border-b border-outline-variant/20 px-space-md py-space-sm last:border-0"
          >
            <div className="min-w-0">
              <div className="truncate text-body-sm text-on-surface">{row.project.title}</div>
              <div className="font-mono text-label-sm text-outline">
                {formatNumber(row.listing!.amount)} units @{' '}
                {formatUsdgNumber(row.listing!.pricePerUnit, 4)} USDG
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-space-sm">
              <span className="font-mono text-label-sm text-outline">
                {formatRelativeTime(row.listing!.createdAt)}
              </span>
              <Badge tone={listingStatus(row.listing!.status).tone}>
                {listingStatus(row.listing!.status).label}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hardware Claim Lifecycle Schematic Explainer Card (Screen 09) */
function LifecycleExplainer() {
  return (
    <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm flex flex-col gap-space-md border border-outline-variant/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <Icon name="verified_user" size={18} className="text-secondary" />
          <h3 className="font-display text-headline-sm text-on-surface font-semibold">
            Physical RWA Milestones &amp; Secondary Liquidity
          </h3>
        </div>
        <span className="font-mono text-label-sm text-primary font-bold">SMART ESCROW GUARANTEED</span>
      </div>

      <div className="grid grid-cols-1 gap-space-sm font-mono text-label-sm sm:grid-cols-2 md:grid-cols-4">
        {[
          { n: '01', title: 'Prototype', body: 'CAD, BOM and an initial proof are verified by review nodes.' },
          { n: '02', title: 'Tooling', body: 'Moulds are fabricated and checked on-site by an oracle.' },
          { n: '03', title: 'Assembly', body: 'A pilot batch is assembled, tested and reported to holders.' },
          { n: '04', title: 'Payout', body: 'Tranches release as milestones pass holder votes.' },
        ].map((step) => (
          <div key={step.n} className="flex flex-col gap-1 rounded-lg bg-surface-container p-space-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-container-highest font-bold text-secondary">
                {step.n}
              </span>
              <span className="font-bold uppercase tracking-wider text-on-surface">{step.title}</span>
            </div>
            <p className="font-sans text-body-sm text-on-surface-variant">{step.body}</p>
          </div>
        ))}
      </div>
      <p className="font-mono text-label-sm text-outline">
        A schematic of how milestone escrow works — not this asset&apos;s live progress. A
        project&apos;s current stage is shown by its own milestones on its page.
      </p>
    </div>
  );
}

/**
 * The selected project's summary card. Renders for both showcase projects (with
 * sample ask/bid/depth) and live on-chain projects (which point to the terminal
 * for the real book). Guards the listing-derived cells against a null listing.
 */
function SelectedPanel({ row }: { row: MarketRow }) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const isLive = row.project.liquidityMode === 'real';

  return (
    <div className="flex-col gap-space-sm rounded-lg border border-outline-variant/40 bg-surface-container p-space-md">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <div className="font-mono text-label-sm uppercase tracking-wider text-outline">
            Selected claim
          </div>
          <h2 className="font-display text-headline-sm text-on-surface">{row.project.title}</h2>
        </div>
        <Link
          href={`/projects/${row.project.slug}`}
          className="inline-flex items-center gap-1 font-mono text-label-sm text-primary hover:underline"
        >
          Project page
          <Icon name="arrow_forward" size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-space-sm font-mono text-label-sm">
        <div>
          <div className="text-outline">Best ask</div>
          <div className="tabular text-error">
            {row.listing ? `${formatUsdgNumber(row.listing.pricePerUnit, 4)} USDG` : '—'}
          </div>
        </div>
        <div>
          <div className="text-outline">Best bid</div>
          <div className="tabular text-primary">
            {row.bestBid ? `${formatUsdgNumber(row.bestBid.pricePerUnit, 4)} USDG` : '—'}
          </div>
        </div>
        <div>
          <div className="text-outline">Book notional</div>
          <div className="tabular text-on-surface">
            {row.listing ? `${bookNotional(row.book)} USDG` : 'live in terminal'}
          </div>
        </div>
        <div>
          <div className="text-outline">Listing size</div>
          <div className="tabular text-on-surface">
            {row.listing ? `${formatNumber(row.listing.amount)} units` : '—'}
          </div>
        </div>
      </div>

      <p className="font-mono text-label-sm text-outline">
        {isLive
          ? 'This asset is live on the deployed SecondaryMarket. The order book, your balance and the Sell action read the chain on the trading terminal.'
          : 'This showcase project is illustrated on a sample book. Open the terminal to see the full layout; live projects read the deployed SecondaryMarket.'}
      </p>

      <div className="flex flex-wrap gap-space-sm border-t border-outline-variant/30 pt-space-sm">
        {!isConnected ? (
          <button
            type="button"
            onClick={openConnectModal}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-primary-container px-space-md py-2.5 font-mono text-label-lg text-on-primary-container shadow-[0_0_0_1px_rgba(78,222,163,0.25)] transition-colors hover:bg-primary"
          >
            <Icon name="account_balance_wallet" size={18} />
            Connect wallet to trade
          </button>
        ) : null}
        <Link
          href={terminalHref(row.project)}
          className="mt-space-xs inline-flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-space-md py-2.5 font-mono text-label-md text-primary transition-colors hover:bg-primary/20"
        >
          <Icon name="candlestick_chart" size={18} />
          Open Full Trading Terminal
        </Link>
      </div>
    </div>
  );
}

/**
 * Whether a project's claims are tradable on the secondary market.
 *
 * Delegates to `isTradableStatus` so the exchange listing, the project-page CTA
 * and the terminal route all agree on which lifecycle states can trade.
 */
function isTradable(project: Project): boolean {
  return isTradableStatus(project.status);
}

export function MarketOverview({ projects }: { projects: Project[] }) {
  // Funding gating: only assets past their funding round belong here. Everything
  // below (metrics, table, featured listings, default selection) reads this
  // filtered list, so a project still in FUNDING cannot appear anywhere.
  const tradable = React.useMemo(() => projects.filter(isTradable), [projects]);
  const rows = useMarketRows(tradable);

  const [selectedId, setSelectedId] = React.useState(
    () => rows.find((row) => row.listing)?.project.id ?? tradable[0]?.id ?? '',
  );

  const selected =
    rows.find((row) => row.project.id === selectedId) ??
    rows.find((row) => row.listing) ??
    rows[0];

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
              <span className="flex items-center gap-1 font-mono text-label-sm text-on-surface-variant">
                <StatusDot tone="brand" pulse />
                Peer-to-peer claim trading
              </span>
            </div>

            <h1 className="font-display text-headline-lg font-bold tracking-tight text-on-surface">
              Claims Exchange
            </h1>
            <p className="max-w-2xl text-body-md text-on-surface-variant">
              Exit a position before delivery, or accumulate claims in a build you believe in.
              Listings are peer-to-peer and seller-escrowed. Prices are set by sellers and paid by
              buyers — nothing here is an offer at a protocol-determined price.
            </p>
          </div>

          <EngineStatus />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-space-lg px-space-lg py-space-lg lg:px-margin">
        <MetricsRibbon projects={tradable} />

        <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-12">
          <div className="flex flex-col gap-space-lg xl:col-span-7">
            <ListingTable projects={tradable} selectedId={selectedId} onSelect={setSelectedId} />
            <LifecycleExplainer />
            <RecentFills projects={tradable} />
          </div>

          <div className="flex flex-col gap-space-lg xl:col-span-5">
            {selected ? (
              <>
                <SelectedPanel row={selected} />

                {/* SVG Depth Chart Visualizer (Screen 09) */}
                <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-md shadow-md overflow-hidden flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between font-mono text-label-sm uppercase text-outline">
                    <span className="flex items-center gap-1">
                      <Icon name="waterfall_chart" size={16} className="text-secondary" />
                      Order Book Depth Chart
                    </span>
                    <span className="text-on-surface-variant font-bold">{selected.ticker} / USDG</span>
                  </div>

                  <div className="w-full h-16 relative flex items-center bg-surface-container-lowest rounded-lg overflow-hidden border border-outline-variant/30">
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 320 40">
                      {/* Bids Gradient Area */}
                      <path className="text-primary/25" d="M 0 38 L 40 32 L 80 28 L 120 22 L 155 18 L 155 40 L 0 40 Z" fill="currentColor" />
                      <path className="text-primary" d="M 0 38 L 40 32 L 80 28 L 120 22 L 155 18" fill="none" stroke="currentColor" strokeWidth="2" />
                      {/* Midpoint Dotted Guideline */}
                      <line x1="160" y1="5" x2="160" y2="40" stroke="currentColor" strokeDasharray="2 2" className="text-outline-variant" />
                      {/* Asks Gradient Area */}
                      <path className="text-error/25" d="M 165 19 L 200 24 L 240 30 L 280 34 L 320 38 L 320 40 L 165 40 Z" fill="currentColor" />
                      <path className="text-error" d="M 165 19 L 200 24 L 240 30 L 280 34 L 320 38" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>

                    <div className="absolute inset-0 flex items-center justify-between px-space-sm font-mono text-[10px] pointer-events-none">
                      <span className="text-primary font-bold">
                        BIDS · {formatUsdgNumber(selected.book.bids[selected.book.bids.length - 1]?.pricePerUnit ?? '0', 3)}–
                        {formatUsdgNumber(selected.book.bids[0]?.pricePerUnit ?? '0', 3)} USDG
                      </span>
                      <span className="text-error font-bold">
                        ASKS · {formatUsdgNumber(selected.book.asks[0]?.pricePerUnit ?? '0', 3)}–
                        {formatUsdgNumber(selected.book.asks[selected.book.asks.length - 1]?.pricePerUnit ?? '0', 3)} USDG
                      </span>
                    </div>
                  </div>

                  {/* Compact Bid/Ask Quick Spread Ribbon */}
                  <div className="py-1 px-2 rounded bg-surface-container-high flex items-center justify-between font-mono text-[10px]">
                    <span className="text-primary font-bold flex items-center gap-1">
                      <Icon name="arrow_upward" size={12} />
                      Best Ask:{' '}
                      {selected.listing ? `${formatUsdgNumber(selected.listing.pricePerUnit, 4)} USDG` : 'live in terminal'}
                    </span>
                    <span className="text-outline uppercase tracking-wider">
                      Spread: {selected.spreadBps ? (selected.spreadBps / 100).toFixed(2) + '%' : '—'}
                    </span>
                  </div>
                </div>

                <OrderBookView book={selected.book} />
              </>
            ) : null}
          </div>
        </div>

        {/* What the market is and is not. */}
        <section className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-space-md">
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
                Sellers escrow their claims into the market when listing, so an active listing
                cannot turn out to be unfillable.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
              <span>
                There is no automated market maker. A price only exists if a seller sets one and a
                buyer accepts it.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
              <span>A 1% protocol fee applies on settlement, fixed at listing time.</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
              <span>Claims in a disputed or defaulted project are frozen and cannot trade.</span>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
