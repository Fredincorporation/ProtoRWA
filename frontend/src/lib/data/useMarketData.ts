'use client';

/**
 * Live secondary-market data for one project's trading terminal.
 *
 * A project is either `real` (backed by the deployed SecondaryMarket on the
 * target chain) or `demo` (a synthetic book so the UI can be exercised offline).
 * `useMarketData` resolves the asks/bids/fills from whichever source applies and
 * returns them in the domain types the terminal components already render.
 *
 * All amounts are USDG base units (6 decimals); display goes through
 * `formatSettlementNumber(..., 'USDG', ...)`. Never interpret these as ETH wei.
 */

import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';

import {
  getContracts,
  secondaryMarketAbi,
  type BigIntString,
  type Listing,
  type OrderBook,
  type OrderBookLevel,
} from '@protorwa/shared';
import { protocolChain } from '@/lib/wagmi';
import { mockListings, mockOrderBook } from '@/lib/data/mock';

/** A resting bid read from the book (mirror of Listing on the bid side). */
export interface RestingBid {
  id: string;
  projectId: string;
  buyer: `0x${string}`;
  amount: BigIntString;
  pricePerUnit: BigIntString;
  expiresAt: string | null;
}

/** A recent fill for the "Recent Fills" tape. */
export interface MarketFill {
  timestamp: number;
  amount: string;
  pricePerUnit: string;
  account: string;
}

export interface MarketStats {
  /** Lowest active ask, USDG base units. */
  floorPrice: string;
  /** Highest active bid, USDG base units. */
  bestBid: string;
  /** Total claim units offered on the ask side. */
  askDepth: string;
  /** Total claim units offered on the bid side. */
  bidDepth: string;
  /** Protocol fee in basis points. */
  feeBps: number;
}

export interface MarketData {
  source: 'chain' | 'demo';
  loading: boolean;
  book: OrderBook;
  listings: Listing[];
  bids: RestingBid[];
  fills: MarketFill[];
  stats: MarketStats;
  /** A market contract is configured on the protocol chain. */
  marketDeployed: boolean;
}

/** Aggregate per-order entries into price levels, summing remaining, with cumulative depth. */
function toLevels(
  rows: Array<{ pricePerUnit: bigint; remaining: bigint }>,
  direction: 'ask' | 'bid',
): OrderBookLevel[] {
  const byPrice = new Map<string, { price: bigint; size: bigint }>();
  for (const row of rows) {
    if (row.remaining <= 0n) continue;
    const key = row.pricePerUnit.toString();
    const agg = byPrice.get(key) ?? { price: row.pricePerUnit, size: 0n };
    agg.size += row.remaining;
    byPrice.set(key, agg);
  }

  const sorted = [...byPrice.values()].sort((a, b) =>
    direction === 'ask'
      ? a.price < b.price ? -1 : a.price > b.price ? 1 : 0
      : a.price > b.price ? -1 : a.price < b.price ? 1 : 0,
  );

  let cumulative = 0n;
  return sorted.map((level) => {
    cumulative += level.size;
    return {
      pricePerUnit: level.price.toString() as BigIntString,
      amount: level.size.toString() as BigIntString,
      cumulative: cumulative.toString() as BigIntString,
    };
  });
}

function secondsToIso(seconds: bigint | number): string | null {
  const n = Number(seconds);
  return n > 0 ? new Date(n * 1000).toISOString() : null;
}

/** viem decodes the getListing/getBid struct into a named-field object. */
interface RawOrder {
  id: bigint;
  amount: bigint;
  remaining: bigint;
  pricePerUnit: bigint;
  createdAt: bigint;
  expiresAt: bigint;
  active: boolean;
  /** Present for listings. */
  seller?: `0x${string}`;
  /** Present for bids. */
  buyer?: `0x${string}`;
}

/** Normalize a getListing / getBid struct into the shared order fields. */
function decodeOrder(raw: unknown) {
  const o = raw as RawOrder;
  const account = (o.seller ?? o.buyer ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
  return {
    id: o.id,
    account,
    remaining: o.remaining,
    pricePerUnit: o.pricePerUnit,
    expiresAt: o.expiresAt,
    active: o.active,
  };
}

interface ChainBookResult {
  book: OrderBook;
  listings: Listing[];
  bids: RestingBid[];
}

function useChainMarket(onChainProjectId: bigint): ChainBookResult & { fills: MarketFill[]; stats: MarketStats; loading: boolean } {
  const market = getContracts(protocolChain.id).secondaryMarket as `0x${string}` | undefined;

  const listingIds = useReadContract({
    address: market,
    abi: secondaryMarketAbi,
    functionName: 'projectListings',
    args: [onChainProjectId],
    chainId: protocolChain.id,
    query: { enabled: Boolean(market) },
  });
  const bidIds = useReadContract({
    address: market,
    abi: secondaryMarketAbi,
    functionName: 'projectBids',
    args: [onChainProjectId],
    chainId: protocolChain.id,
    query: { enabled: Boolean(market) },
  });

  const asksAndBids = useReadContracts({
    contracts: [
      ...((listingIds.data as bigint[] | undefined) ?? []).map((id) => ({
        address: market as `0x${string}`,
        abi: secondaryMarketAbi,
        functionName: 'getListing' as const,
        args: [id] as const,
      })),
      ...((bidIds.data as bigint[] | undefined) ?? []).map((id) => ({
        address: market as `0x${string}`,
        abi: secondaryMarketAbi,
        functionName: 'getBid' as const,
        args: [id] as const,
      })),
    ],
    allowFailure: true,
    query: {
      enabled: Boolean(market) && !listingIds.isLoading && !bidIds.isLoading,
    },
  });

  const scalars = useReadContracts({
    contracts: [
      { address: market as `0x${string}`, abi: secondaryMarketAbi, functionName: 'floorPrice', args: [onChainProjectId] },
      { address: market as `0x${string}`, abi: secondaryMarketAbi, functionName: 'bestBid', args: [onChainProjectId] },
      { address: market as `0x${string}`, abi: secondaryMarketAbi, functionName: 'askDepth', args: [onChainProjectId] },
      { address: market as `0x${string}`, abi: secondaryMarketAbi, functionName: 'bidDepth', args: [onChainProjectId] },
      { address: market as `0x${string}`, abi: secondaryMarketAbi, functionName: 'feeBps' },
    ],
    allowFailure: true,
    query: { enabled: Boolean(market) },
  });

  const nAsk = ((listingIds.data as bigint[] | undefined) ?? []).length;
  const decoded = (asksAndBids.data ?? []).slice(0, nAsk).map((r) => (r.status === 'success' ? decodeOrder(r.result) : null));
  const decodedBids = (asksAndBids.data ?? []).slice(nAsk).map((r) => (r.status === 'success' ? decodeOrder(r.result) : null));

  const liveAsks = decoded.filter((d): d is NonNullable<typeof d> => d !== null && d.active && d.remaining > 0n);
  const liveBids = decodedBids.filter((d): d is NonNullable<typeof d> => d !== null && d.active && d.remaining > 0n);

  const book: OrderBook = {
    projectId: onChainProjectId.toString(),
    asks: toLevels(liveAsks.map((a) => ({ pricePerUnit: a.pricePerUnit, remaining: a.remaining })), 'ask'),
    bids: toLevels(liveBids.map((b) => ({ pricePerUnit: b.pricePerUnit, remaining: b.remaining })), 'bid'),
  };

  const listings: Listing[] = liveAsks.map((a) => ({
    id: a.id.toString(),
    projectId: onChainProjectId.toString(),
    seller: a.account,
    amount: a.remaining.toString() as BigIntString,
    pricePerUnit: a.pricePerUnit.toString() as BigIntString,
    status: 'ACTIVE',
    createdAt: '',
    expiresAt: secondsToIso(a.expiresAt),
  }));

  const bids: RestingBid[] = liveBids.map((b) => ({
    id: b.id.toString(),
    projectId: onChainProjectId.toString(),
    buyer: b.account,
    amount: b.remaining.toString() as BigIntString,
    pricePerUnit: b.pricePerUnit.toString() as BigIntString,
    expiresAt: secondsToIso(b.expiresAt),
  }));

  const scalarResults = scalars.data ?? [];
  const stats: MarketStats = {
    floorPrice: (scalarResults[0]?.result as bigint | undefined)?.toString() ?? '0',
    bestBid: (scalarResults[1]?.result as bigint | undefined)?.toString() ?? '0',
    askDepth: (scalarResults[2]?.result as bigint | undefined)?.toString() ?? '0',
    bidDepth: (scalarResults[3]?.result as bigint | undefined)?.toString() ?? '0',
    feeBps: Number((scalarResults[4]?.result as number | undefined) ?? 0),
  };

  // Recent fills are emitted as Sold events; a freshly deployed book has none,
  // so the tape is honestly empty until the first on-chain trade settles.
  const loading = Boolean(market) && (listingIds.isLoading || bidIds.isLoading || asksAndBids.isLoading);

  return { book, listings, bids, fills: [], stats, loading };
}

function useDemoMarket(projectId: string): MarketData {
  const book = mockOrderBook(projectId);
  const listings = mockListings.filter((l) => l.projectId === projectId && l.status === 'ACTIVE');
  const bestAsk = book.asks[0];
  const bestBid = book.bids[0];
  const askDepth = book.asks.reduce((acc, l) => acc + BigInt(l.amount), 0n);
  const bidDepth = book.bids.reduce((acc, l) => acc + BigInt(l.amount), 0n);
  return {
    source: 'demo',
    loading: false,
    book,
    listings,
    bids: [],
    fills: [],
    stats: {
      floorPrice: bestAsk?.pricePerUnit ?? '0',
      bestBid: bestBid?.pricePerUnit ?? '0',
      askDepth: askDepth.toString(),
      bidDepth: bidDepth.toString(),
      feeBps: 100,
    },
    marketDeployed: false,
  };
}

/**
 * @param mockProjectId   the demo-catalogue id ('1'|'2'|'3') used to key the synthetic book.
 * @param liquidityMode   'real' reads the chain; 'demo' synthesises.
 * @param onChainProjectId the numeric id on the deployment, required for 'real'.
 */
export function useMarketData(
  mockProjectId: string,
  liquidityMode: 'demo' | 'real',
  onChainProjectId: string | undefined,
): MarketData {
  const marketDeployed = Boolean(getContracts(protocolChain.id).secondaryMarket);

  const pid = useMemo(() => {
    if (liquidityMode === 'real' && onChainProjectId) return BigInt(onChainProjectId);
    return undefined;
  }, [liquidityMode, onChainProjectId]);

  const demo = useDemoMarket(mockProjectId);
  const chain = useChainMarket(pid ?? 0n);

  if (liquidityMode === 'real' && pid !== undefined && marketDeployed) {
    return { ...chain, source: 'chain', marketDeployed };
  }
  return { ...demo, marketDeployed };
}
