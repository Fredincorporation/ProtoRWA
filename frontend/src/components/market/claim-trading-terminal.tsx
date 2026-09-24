'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { erc20Abi } from 'viem';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { CandlestickChart } from '@/components/market/candlestick-chart';
import { OrderBookView } from '@/components/market/order-book';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useMarketData } from '@/lib/data/useMarketData';
import {
  formatDate,
  formatNumber,
  formatUsdg,
  formatUsdgNumber,
  shortenAddress,
} from '@/lib/format';
import { protocolChain } from '@/lib/wagmi';
import { isTradableStatus, projectStatus } from '@/lib/status';
import { bidGross, grossFor, needsApproval } from '@/lib/market-order';
import { cn } from '@/lib/utils';
import {
  claimTokenAbi,
  defaultChain,
  getChain,
  getContracts,
  protocolAddressUrl,
  protocolTxUrl,
  secondaryMarketAbi,
  toBaseUnits,
  type Project,
} from '@protorwa/shared';

/**
 * Individual Claim Trading Terminal (Screen 23 — per-asset view).
 *
 * A Bloomberg-style terminal for one hardware claim asset. The order book,
 * listings, stats and the Sell action are read from / written to the deployed
 * SecondaryMarket when the project carries real liquidity; demo projects get a
 * synthetic book and a disabled slip.
 *
 * It receives the `project` as a prop (resolved by the /market/p/[id] server
 * route via the unified catalogue), so it renders both curated demo projects
 * and any project published to the deployed registry.
 *
 * Settlement is USDG throughout (a USD-pegged, 6-decimal stablecoin). Native ETH
 * is gas only and is never quoted as a price here - the earlier version offered
 * ETH as a settlement currency against a USDG escrow, which priced every claim
 * 10^12 too low.
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

/** USDG base units -> human dollars, tolerating the BigIntString form. */
function usdgDollars(baseUnits: string | undefined): number {
  if (!baseUnits) return 0;
  try {
    return Number(BigInt(baseUnits)) / 1e6;
  } catch {
    return 0;
  }
}

export function ClaimTradingTerminal({ project }: { project: Project }) {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();

  const liquidityMode = project.liquidityMode ?? 'demo';
  const market = useMarketData(project.id, liquidityMode, project.onChainProjectId);

  const [side, setSide] = React.useState<'buy' | 'sell'>('sell');
  const [amount, setAmount] = React.useState('');
  const [priceUsdg, setPriceUsdg] = React.useState<string>('');
  const [priceTouched, setPriceTouched] = React.useState(false);

  /**
   * The whole terminal drives one order machine. Every write that moves value
   * needs a preceding approval, so a step has two stages: an approval tx, then
   * the action tx. `flow` records which action we are building toward so the
   * receipt effect can chain approval → execution without a per-order branch.
   *
   * - `list` (sell): approves the market to pull claims (ERC-1155), then lists.
   * - `placeBid` (buy tab): approves USDG spend, then posts a resting bid that
   *   auto-crosses asks at or under the bid price.
   * - `buy`: approves USDG spend for a specific ask's gross, then takes it.
   * - `cancel` / `cancelBid`: withdraw a resting order; no approval or payment.
   */
  const [flow, setFlow] = React.useState<
    | { step: 'idle' }
    | { step: 'approving'; next: 'list' | 'placeBid' | 'buy' }
    | { step: 'executing'; name: 'list' | 'placeBid' | 'buy' | 'cancel' | 'cancelBid' }
  >({ step: 'idle' });
  /** The ask being taken when flow is for a direct buy. */
  const [buyTarget, setBuyTarget] = React.useState<
    { listingId: bigint; amount: bigint; gross: bigint } | null
  >(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const onChainProjectId = React.useMemo(() => {
    if (liquidityMode !== 'real' || !project.onChainProjectId) return undefined;
    try {
      return BigInt(project.onChainProjectId);
    } catch {
      return undefined;
    }
  }, [liquidityMode, project.onChainProjectId]);

  const marketAddress = getContracts(protocolChain.id).secondaryMarket as `0x${string}` | undefined;
  const claimTokenAddress = getContracts(protocolChain.id).claimToken as `0x${string}` | undefined;
  const usdgAddress = getChain(protocolChain.id)?.usdg as `0x${string}` | undefined;

  /** Has the seller already approved the market to move their claims? */
  const approval = useReadContract({
    address: claimTokenAddress,
    abi: claimTokenAbi,
    functionName: 'isApprovedForAll',
    args: address && marketAddress ? [address, marketAddress] : undefined,
    chainId: protocolChain.id,
    query: { enabled: Boolean(address && marketAddress && claimTokenAddress) },
  });

  /** Claim units the connected wallet holds for this project (token id == project id). */
  const balance = useReadContract({
    address: claimTokenAddress,
    abi: claimTokenAbi,
    functionName: 'balanceOf',
    args: address && onChainProjectId !== undefined ? [address, onChainProjectId] : undefined,
    chainId: protocolChain.id,
    query: { enabled: Boolean(address && claimTokenAddress && onChainProjectId !== undefined) },
  });

  /** USDG the market is still allowed to pull from the connected wallet. */
  const usdgAllowance = useReadContract({
    address: usdgAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && marketAddress ? [address, marketAddress] : undefined,
    chainId: protocolChain.id,
    query: { enabled: Boolean(address && usdgAddress && marketAddress) },
  });

  const {
    writeContract,
    data: txHash,
    isPending: isSubmitting,
    error: writeError,
    reset: resetTx,
  } = useWriteContract();

  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  /* The receipt effect must fire exactly once per confirmed tx hash and read the
     intent without re-subscribing on every flow change, so the current flow is
     mirrored in a ref and each hash is guarded against double processing. */
  const flowRef = React.useRef(flow);
  React.useEffect(() => {
    flowRef.current = flow;
  }, [flow]);
  const processedHash = React.useRef<`0x${string}` | undefined>(undefined);

  const book = market.book;
  const bestAsk = book.asks[0];
  const bestBid = book.bids[0];
  const askDollars = usdgDollars(bestAsk?.pricePerUnit);
  const bidDollars = usdgDollars(bestBid?.pricePerUnit);

  /* Pre-fill the price box with the book edge until the user edits it. */
  React.useEffect(() => {
    if (priceTouched) return;
    const edge = side === 'buy' ? askDollars : bidDollars;
    setPriceUsdg(edge > 0 ? String(edge) : '');
  }, [side, askDollars, bidDollars, priceTouched]);

  /* After an approval mines, fire the action it unlocked; after the action
     mines, settle and refresh the reads that the order moved. */
  React.useEffect(() => {
    if (!receipt.isSuccess || !txHash) return;
    if (processedHash.current === txHash) return;
    processedHash.current = txHash;

    const current = flowRef.current;
    if (current.step === 'approving') {
      setFlow({ step: 'executing', name: current.next });
      if (current.next === 'list') {
        approval.refetch();
        execList();
      } else if (current.next === 'placeBid') {
        usdgAllowance.refetch();
        execPlaceBid();
      } else if (current.next === 'buy') {
        usdgAllowance.refetch();
        execBuy();
      }
    } else if (current.step === 'executing') {
      const settled = current.name;
      setFlow({ step: 'idle' });
      setBuyTarget(null);
      setAmount('');
      balance.refetch();
      usdgAllowance.refetch();
      approval.refetch();
      router.refresh();
      setNotice(
        settled === 'cancel'
          ? 'Listing cancelled - your claims are back in your wallet.'
          : settled === 'cancelBid'
            ? 'Bid cancelled - your escrowed USDG was refunded.'
            : settled === 'buy'
              ? 'Order filled - the claims are now yours.'
              : settled === 'placeBid'
                ? 'Buy order placed - it rests on the book until it fills or you cancel.'
                : 'Listing posted - your ask now rests on the book.',
      );
    }
  }, [receipt.isSuccess, txHash]);

  const amountNum = Math.floor(Number(amount) || 0);
  const priceNum = Number(priceUsdg) || 0;
  const subtotal = amountNum * priceNum;
  const feeBps = market.stats.feeBps || 100;
  const fee = (subtotal * feeBps) / 10_000;
  /*
   * The buyer pays the listing/bid gross exactly; the protocol fee is deducted
   * from the seller's proceeds (see SecondaryMarket.buy / _matchBidAgainstAsks),
   * so it never inflates the buyer's cost.
   */
  const total = side === 'buy' ? subtotal : subtotal - fee;
  const heldUnits = balance.data !== undefined ? Number(balance.data) : 0;

  const onTargetChain = chainId === protocolChain.id;
  const isBusy = isSubmitting || receipt.isLoading || flow.step !== 'idle';

  /**
   * A claim only represents a settled production commitment once its funding
   * round has closed, so a DRAFT/FUNDING asset has nothing real to trade, and a
   * CANCELLED/DEFAULTED one has its claims frozen for refund. The market exists
   * for IN_PRODUCTION and COMPLETED projects only.
   */
  const tradingOpen = isTradableStatus(project.status);

  const orderable =
    tradingOpen &&
    market.source === 'chain' &&
    Boolean(onChainProjectId) &&
    isConnected &&
    onTargetChain &&
    !isBusy;

  const sellEnabled =
    orderable && side === 'sell' && amountNum > 0 && priceNum > 0 && amountNum <= heldUnits;
  const buyEnabled = orderable && side === 'buy' && amountNum > 0 && priceNum > 0;

  function execList() {
    if (!onChainProjectId || !marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: secondaryMarketAbi,
      functionName: 'list',
      // claims transferred in (token id == project id); price in USDG base units.
      args: [onChainProjectId, BigInt(amountNum), toBaseUnits(priceNum, 'USDG'), 0n],
      chainId: protocolChain.id,
    });
  }

  function execPlaceBid() {
    if (!onChainProjectId || !marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: secondaryMarketAbi,
      functionName: 'placeBid',
      args: [onChainProjectId, BigInt(amountNum), toBaseUnits(priceNum, 'USDG'), 0n],
      // USDG settlement: no native value, the market pulls the bid gross via allowance.
      value: 0n,
      chainId: protocolChain.id,
    });
  }

  function execBuy(target = buyTarget) {
    if (!target || !marketAddress) return;
    writeContract({
      address: marketAddress,
      abi: secondaryMarketAbi,
      functionName: 'buy',
      args: [target.listingId, target.amount],
      value: 0n,
      chainId: protocolChain.id,
    });
  }

  function handleSell() {
    if (!sellEnabled || !claimTokenAddress || !marketAddress) return;
    resetTx();
    setNotice(null);
    if (approval.data !== true) {
      setFlow({ step: 'approving', next: 'list' });
      writeContract({
        address: claimTokenAddress,
        abi: claimTokenAbi,
        functionName: 'setApprovalForAll',
        args: [marketAddress, true],
        chainId: protocolChain.id,
      });
    } else {
      setFlow({ step: 'executing', name: 'list' });
      execList();
    }
  }

  /** Posts a resting buy order, topping up the market's USDG allowance first. */
  function handlePlaceBid() {
    if (!buyEnabled || !usdgAddress || !marketAddress) return;
    resetTx();
    setNotice(null);
    const gross = bidGross(amountNum, priceNum);
    if (needsApproval(usdgAllowance.data ?? 0n, gross)) {
      setFlow({ step: 'approving', next: 'placeBid' });
      writeContract({
        address: usdgAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [marketAddress, gross],
        chainId: protocolChain.id,
      });
    } else {
      setFlow({ step: 'executing', name: 'placeBid' });
      execPlaceBid();
    }
  }

  /** Takes a specific resting ask, topping up the market's USDG allowance first. */
  function handleTakeListing(listingId: bigint, qty: bigint, pricePerUnit: bigint) {
    if (!orderable || !usdgAddress || !marketAddress) return;
    resetTx();
    setNotice(null);
    const gross = grossFor(qty, pricePerUnit);
    const target = { listingId, amount: qty, gross };
    setBuyTarget(target);
    if (needsApproval(usdgAllowance.data ?? 0n, gross)) {
      setFlow({ step: 'approving', next: 'buy' });
      writeContract({
        address: usdgAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [marketAddress, gross],
        chainId: protocolChain.id,
      });
    } else {
      setFlow({ step: 'executing', name: 'buy' });
      execBuy(target);
    }
  }

  function handleCancelListing(listingId: bigint) {
    if (!orderable || !marketAddress) return;
    resetTx();
    setNotice(null);
    setFlow({ step: 'executing', name: 'cancel' });
    writeContract({
      address: marketAddress,
      abi: secondaryMarketAbi,
      functionName: 'cancel',
      args: [listingId],
      chainId: protocolChain.id,
    });
  }

  function handleCancelBid(bidId: bigint) {
    if (!orderable || !marketAddress) return;
    resetTx();
    setNotice(null);
    setFlow({ step: 'executing', name: 'cancelBid' });
    writeContract({
      address: marketAddress,
      abi: secondaryMarketAbi,
      functionName: 'cancelBid',
      args: [bidId],
      chainId: protocolChain.id,
    });
  }

  const displayTicker = deriveTicker(project.title);
  const status = projectStatus(project.status);
  const completedMilestones = project.milestones.filter((m) => m.status === 'APPROVED').length;
  const askPriceLabel =
    tradingOpen && bestAsk ? formatUsdgNumber(bestAsk.pricePerUnit, 2) : '—';
  const bidPriceLabel =
    tradingOpen && bestBid ? formatUsdgNumber(bestBid.pricePerUnit, 2) : '—';
  const myBids =
    address && market.source === 'chain'
      ? market.bids.filter((b) => b.buyer.toLowerCase() === address.toLowerCase())
      : [];

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
                {defaultChain.name}
              </Badge>
              <Badge tone={market.source === 'chain' ? 'brand' : 'neutral'} className="font-mono text-label-sm">
                <Icon name="payments" size={11} className="mr-1" />
                {market.source === 'chain' ? 'Live USDG book' : 'Simulated book'}
              </Badge>
            </div>
          </div>

          {/* Stats ribbon */}
          <div className="mt-space-md grid grid-cols-2 gap-px bg-outline-variant/20 rounded-lg overflow-hidden sm:grid-cols-4">
            {[
              { label: 'Best Ask', value: `${askPriceLabel} USDG`, color: 'text-error' },
              { label: 'Best Bid', value: `${bidPriceLabel} USDG`, color: 'text-primary' },
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
        {tradingOpen ? (
        <div className="grid gap-space-lg lg:grid-cols-[1fr_360px]">

          {/* ── LEFT: Chart + Orderbook + listings + provenance ──── */}
          <div className="flex flex-col gap-space-lg">
            <CandlestickChart
              ticker={displayTicker}
              projectTitle={project.title}
              project={project}
              book={book}
            />

            {/* Orderbook */}
            <section>
              <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                Order Book
              </h2>
              <OrderBookView
                book={book}
                onSelectLevel={(level) => {
                  setPriceTouched(true);
                  setPriceUsdg(String(usdgDollars(level.pricePerUnit)));
                }}
              />
            </section>

            {/* Recent fills. The chain book is honest: no indexer yet, so trades
                that have not settled are simply not shown rather than faked. */}
            <section>
              <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                Recent Fills
              </h2>
              <div className="overflow-hidden rounded-lg border border-outline-variant/40">
                <div className="grid grid-cols-4 border-b border-outline-variant/40 bg-surface-container px-space-md py-space-xs font-mono text-label-sm uppercase tracking-wider text-outline">
                  <span>Time</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Price / claim</span>
                  <span className="text-right">Counterparty</span>
                </div>
                {market.fills.length > 0 ? (
                  market.fills.map((fill, i) => (
                    <div
                      key={`${fill.timestamp}-${i}`}
                      className="grid grid-cols-4 border-b border-outline-variant/20 bg-surface-container-lowest px-space-md py-space-xs font-mono text-label-sm last:border-0"
                    >
                      <span className="text-outline">{formatDate(new Date(fill.timestamp).toISOString())}</span>
                      <span className="text-right text-on-surface">{formatNumber(fill.amount)}</span>
                      <span className="text-right text-primary">{formatUsdg(fill.pricePerUnit, 4)}</span>
                      <span className="text-right text-on-surface-variant">{shortenAddress(fill.account)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 bg-surface-container-lowest px-space-md py-space-sm font-mono text-label-sm text-outline">
                    <Icon name="info" size={14} />
                    No trades have settled on this asset yet. The book above reflects resting
                    orders, not executed fills.
                  </div>
                )}
              </div>
            </section>

            {/* Active listings - every ask on the book can be taken directly, and
                the ones you posted can be cancelled to claw your claims back. */}
            {market.listings.length > 0 && (
              <section>
                <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Active Listings
                </h2>
                <div className="overflow-hidden rounded-lg border border-outline-variant/40">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-space-md border-b border-outline-variant/40 bg-surface-container px-space-md py-space-xs font-mono text-label-sm uppercase tracking-wider text-outline">
                    <span>Seller</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">Price / claim</span>
                    <span className="text-right">Action</span>
                  </div>
                  {market.listings.map((listing) => {
                    const mine =
                      address && listing.seller.toLowerCase() === address.toLowerCase();
                    const listingId = BigInt(listing.id);
                    const qty = BigInt(listing.amount);
                    const pricePerUnit = BigInt(listing.pricePerUnit);
                    const isLive = orderable && !mine;
                    return (
                      <div
                        key={listing.id}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-space-md border-b border-outline-variant/20 bg-surface-container-lowest px-space-md py-space-xs font-mono text-label-sm last:border-0"
                      >
                        <span className="text-on-surface-variant">
                          {mine ? 'You' : shortenAddress(listing.seller)}
                        </span>
                        <span className="text-right text-on-surface">{formatNumber(Number(qty))}</span>
                        <span className="text-right text-error">{formatUsdg(listing.pricePerUnit, 4)}</span>
                        <span className="flex justify-end">
                          {mine ? (
                            <button
                              type="button"
                              onClick={() => handleCancelListing(listingId)}
                              disabled={!orderable || isBusy}
                              className="rounded border border-outline-variant/40 px-2 py-0.5 text-outline transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleTakeListing(listingId, qty, pricePerUnit)}
                              disabled={!isLive}
                              title={isLive ? 'Buy this ask in full at its price' : 'Connect on-chain to take this ask'}
                              className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Buy
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Your open bids - resting buy orders you placed; cancelling refunds
                the escrowed USDG back to your wallet. */}
            {myBids.length > 0 && (
              <section>
                <h2 className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
                  Your Open Bids
                </h2>
                <div className="overflow-hidden rounded-lg border border-outline-variant/40">
                  <div className="grid grid-cols-[auto_auto_1fr] gap-space-md border-b border-outline-variant/40 bg-surface-container px-space-md py-space-xs font-mono text-label-sm uppercase tracking-wider text-outline">
                    <span>Amount</span>
                    <span>Bid / claim</span>
                    <span className="text-right">Action</span>
                  </div>
                  {myBids.map((bid) => (
                    <div
                      key={bid.id}
                      className="grid grid-cols-[auto_auto_1fr] items-center gap-space-md border-b border-outline-variant/20 bg-surface-container-lowest px-space-md py-space-xs font-mono text-label-sm last:border-0"
                    >
                      <span className="text-on-surface">{formatNumber(Number(BigInt(bid.amount)))}</span>
                      <span className="text-primary">{formatUsdg(bid.pricePerUnit, 4)}</span>
                      <span className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleCancelBid(BigInt(bid.id))}
                          disabled={!orderable || isBusy}
                          className="rounded border border-outline-variant/40 px-2 py-0.5 text-outline transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <TokenProvenance project={project} onChainProjectId={onChainProjectId} />
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
                  onClick={() => { setSide('buy'); setPriceTouched(false); }}
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
                  onClick={() => { setSide('sell'); setPriceTouched(false); }}
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
                  <span className="flex items-center justify-between font-mono text-label-sm text-outline">
                    <span>Amount (claims)</span>
                    {isConnected && market.source === 'chain' ? (
                      <span className="text-on-surface-variant">
                        Hold {formatNumber(heldUnits)}
                      </span>
                    ) : null}
                  </span>
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
                  <span className="font-mono text-label-sm text-outline">Price per claim (USDG)</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={priceUsdg}
                    onChange={(e) => { setPriceTouched(true); setPriceUsdg(e.target.value); }}
                    placeholder={side === 'buy' ? askPriceLabel : bidPriceLabel}
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface-container-lowest px-space-sm py-2 font-mono text-label-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
                  />
                </label>

                {/* Totals */}
                <div className="flex flex-col gap-0.5 rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm">
                  <div className="flex justify-between">
                    <span className="text-outline">Subtotal</span>
                    <span className="tabular text-on-surface">{formatUsdg(toBaseUnits(subtotal, 'USDG'), 4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-outline">
                      Protocol fee ({(feeBps / 100).toFixed(2)}%{side === 'buy' ? ' · from seller' : ''})
                    </span>
                    <span className="tabular text-tertiary">{formatUsdg(toBaseUnits(fee, 'USDG'), 4)}</span>
                  </div>
                  <div className="flex justify-between border-t border-outline-variant/30 pt-0.5">
                    <span className="font-bold text-on-surface">
                      {side === 'buy' ? 'You pay' : 'You receive'}
                    </span>
                    <span className="tabular font-bold text-on-surface">
                      {formatUsdg(toBaseUnits(total, 'USDG'), 4)}
                    </span>
                  </div>
                </div>

                <OrderStatus
                  side={side}
                  market={market}
                  isConnected={isConnected}
                  onTargetChain={onTargetChain}
                  chainName={protocolChain.name}
                  heldUnits={heldUnits}
                  amountNum={amountNum}
                  error={writeError?.message ?? receipt.error?.message}
                  notice={notice}
                  txHash={flow.step === 'executing' ? txHash : undefined}
                />

                {side === 'buy' ? (
                  buyEnabled ? (
                    <>
                      <Button variant="primary" onClick={handlePlaceBid} className="w-full justify-center">
                        <Icon name="add_shopping_cart" size={16} />
                        {needsApproval(
                          usdgAllowance.data ?? 0n,
                          bidGross(amountNum, priceNum)
                        )
                          ? 'Approve USDG & place buy order'
                          : 'Place Buy Order'}
                      </Button>
                      <p className="text-center font-mono text-label-sm text-outline">
                        A bid escrows its USDG in the SecondaryMarket and auto-crosses any ask priced
                        at or below your price. The unmatched remainder rests on the book until it
                        fills or you cancel.
                      </p>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" disabled className="w-full justify-center" aria-disabled>
                        <Icon name="lock" size={16} />
                        Place Buy Order
                      </Button>
                    </>
                  )
                ) : sellEnabled ? (
                  <>
                    <Button variant="danger" onClick={handleSell} className="w-full justify-center">
                      <Icon name="sell" size={16} />
                      {approval.data === true ? 'List claim for sale' : 'Approve & list claim'}
                    </Button>
                    <p className="text-center font-mono text-label-sm text-outline">
                      Listing deposits your claims into the SecondaryMarket and posts a resting ask
                      at your price. Cancel or top up any time.
                    </p>
                  </>
                ) : (
                  <>
                    <Button variant="danger" disabled className="w-full justify-center" aria-disabled>
                      <Icon name="lock" size={16} />
                      List claim for sale
                    </Button>
                  </>
                )}

                {isBusy ? (
                  <p className="flex items-center justify-center gap-1.5 font-mono text-label-sm text-primary">
                    <Icon name="pending" size={14} className="animate-spin" />
                    {flow.step === 'approving'
                      ? 'Confirm the approval in your wallet…'
                      : flow.step === 'executing'
                        ? receipt.isLoading
                          ? 'Mining your order…'
                          : 'Confirm the order in your wallet…'
                        : 'Check your wallet…'}
                  </p>
                ) : null}
              </div>
            </section>

            {/* Settlement note. Static because USDG is the only settlement asset;
                ETH is gas and is deliberately not offered as a price currency. */}
            <section className="rounded-lg border border-outline-variant/40 bg-surface-container p-space-md font-mono text-label-sm">
              <div className="mb-1.5 flex items-center gap-1.5 uppercase tracking-wider text-on-surface-variant">
                <Icon name="currency_exchange" size={16} className="text-primary" />
                Settlement
              </div>
              <div className="flex items-center justify-between text-on-surface">
                <span className="text-outline">Prices &amp; settlement</span>
                <span>USDG (Global Dollar, 6 dp · ≈ $1)</span>
              </div>
              <div className="flex items-center justify-between text-on-surface">
                <span className="text-outline">Transaction gas</span>
                <span>Native ETH</span>
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
        ) : (
          <TradingNotOpenNotice project={project} />
        )}
      </div>
    </>
  );
}

/**
 * Shown instead of the trading UI when a project's claims are not yet (or no
 * longer) tradable - a funding round that has not closed, or a cancelled /
 * defaulted project whose claims are frozen for refund. We deliberately do not
 * render a book or chart here, because a price grid on an asset that cannot
 * trade would imply a market that does not exist.
 */
function TradingNotOpenNotice({ project }: { project: Project }) {
  const inFunding = project.status === 'FUNDING' || project.status === 'DRAFT';
  const frozen = project.status === 'CANCELLED' || project.status === 'DEFAULTED';

  return (
    <section className="flex-col gap-space-md rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-lg shadow-sm">
      <div className="flex items-center gap-space-sm">
        <Icon name={frozen ? 'block' : 'schedule'} size={22} className="text-tertiary" />
        <h2 className="font-display text-headline-sm text-on-surface">
          {frozen ? 'Trading is paused for this asset' : 'Not yet on the secondary market'}
        </h2>
      </div>

      <p className="max-w-prose text-body-md text-on-surface-variant">
        {frozen
          ? 'This project was cancelled or defaulted, so its claims are frozen and cannot be traded. Backers should claim their escrowed refund from the project page.'
          : 'Claims only become tradable once a project\'s funding round has closed and capital is settled into production escrow. While funding is open there is no production commitment to price, so this asset has no order book yet.'}
      </p>

      {inFunding && project.escrow.fundingDeadline ? (
        <div className="flex flex-col gap-1 rounded-lg bg-surface-container-lowest p-space-md font-mono text-label-sm">
          <span className="text-outline">Funding closes</span>
          <span className="text-headline-sm tabular text-on-surface">
            {formatDate(project.escrow.fundingDeadline)}
          </span>
          <span className="text-on-surface-variant">
            {formatNumber(project.claimsCommitted)} of {formatNumber(project.totalClaims)} claims
            committed · {formatUsdg(project.escrow.locked)} USDG locked
          </span>
        </div>
      ) : null}

      <Link
        href={`/projects/${project.slug}`}
        className="mt-space-xs inline-flex w-fit items-center gap-2 rounded border border-primary/40 bg-primary/10 px-space-md py-2.5 font-mono text-label-md text-primary transition-colors hover:bg-primary/20"
      >
        <Icon name="receipt_long" size={16} />
        Back to project page
      </Link>
    </section>
  );
}

/**
 * "What you're trading" - the provenance of the claim asset itself.
 *
 * The book, listings and slip answer "what is the price". This answers the
 * question a first-time backer always has: what token am I actually holding,
 * who minted it, and where does it live on-chain. It reads the shared ERC-1155
 * ClaimToken's `tokenName` for this project so the label shown is the one the
 * founder registered, not a copy string from the frontend.
 */
function TokenProvenance({
  project,
  onChainProjectId,
}: {
  project: Project;
  onChainProjectId: bigint | undefined;
}) {
  const claimTokenAddress = getContracts(protocolChain.id).claimToken as `0x${string}` | undefined;

  /** On-chain name the founder registered when funding opened (real assets only). */
  const tokenName = useReadContract({
    address: claimTokenAddress,
    abi: claimTokenAbi,
    functionName: 'tokenName',
    args: onChainProjectId !== undefined ? [onChainProjectId] : undefined,
    chainId: protocolChain.id,
    query: { enabled: Boolean(claimTokenAddress && onChainProjectId !== undefined) },
  });

  const explorerUrl = claimTokenAddress ? protocolAddressUrl(claimTokenAddress) : null;
  const isReal = project.liquidityMode === 'real' && onChainProjectId !== undefined;

  return (
    <section className="rounded-lg border border-outline-variant/40 bg-surface-container">
      <div className="border-b border-outline-variant/40 px-space-md py-space-sm">
        <h2 className="flex items-center gap-2 font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
          <Icon name="token" size={16} className="text-secondary" />
          What you&apos;re trading
        </h2>
      </div>

      <div className="flex flex-col gap-space-sm p-space-md text-body-sm text-on-surface-variant">
        <p>
          Every claim here is one unit of a shared <span className="text-on-surface">ERC-1155</span>{' '}
          token. This project occupies a single token id on that contract, and a claim is simply one
          unit of it — there is no separate ERC-20 per project.
        </p>

        <ul className="flex flex-col gap-1.5">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
            <span>
              <span className="text-on-surface">The founder registers it.</span> When funding opens,
              the ProjectRegistry asks the ClaimToken contract to reserve this project&apos;s token
              id. Nothing can be committed before that step.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
            <span>
              <span className="text-on-surface">Backers mint it.</span> Each commitment mints claim
              units straight to the backer&apos;s wallet — the same units that appear in the order
              slip above and that you list to sell.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-outline" />
            <span>
              <span className="text-on-surface">Refunds burn it.</span> If a milestone fails and
              backers claim a refund, those claim units are burned, retiring them from circulation.
            </span>
          </li>
        </ul>

        {/* On-chain coordinates */}
        <div className="mt-1 flex flex-col gap-px overflow-hidden rounded-lg bg-outline-variant/20 font-mono text-label-sm">
          <div className="flex items-center justify-between gap-2 bg-surface-container-lowest px-space-sm py-2">
            <span className="text-outline">Token standard</span>
            <span className="text-on-surface">ERC-1155 (multi-asset)</span>
          </div>
          <div className="flex items-center justify-between gap-2 bg-surface-container-lowest px-space-sm py-2">
            <span className="text-outline">Claim token id</span>
            <span className="text-on-surface">
              {isReal ? `#${onChainProjectId?.toString()}` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 bg-surface-container-lowest px-space-sm py-2">
            <span className="text-outline">On-chain name</span>
            <span className="truncate text-on-surface">
              {tokenName.data ?? (isReal ? 'Reading from chain…' : '—')}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 bg-surface-container-lowest px-space-sm py-2">
            <span className="text-outline">Contract</span>
            {claimTokenAddress && explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                {shortenAddress(claimTokenAddress)}
                <Icon name="open_in_new" size={12} />
              </a>
            ) : (
              <span className="text-on-surface-variant">not deployed</span>
            )}
          </div>
        </div>

        {!isReal ? (
          <p className="flex items-start gap-1.5 rounded bg-surface-container-lowest p-2 font-mono text-label-sm text-outline">
            <Icon name="science" size={13} className="mt-0.5 shrink-0" />
            <span>
              This is a showcase asset on a simulated book, so it has no token id on the live
              deployment. Projects published to the registry trade against the real ClaimToken
              contract shown above.
            </span>
          </p>
        ) : null}

        <p className="text-label-sm text-outline">
          Listing a claim transfers it into the SecondaryMarket contract until it fills or you
          cancel — so an active ask can never turn out to be unfillable.
        </p>
      </div>
    </section>
  );
}

/** Inline status for the order slip: network, balance, confirmation, errors. */
function OrderStatus({
  side,
  market,
  isConnected,
  onTargetChain,
  chainName,
  heldUnits,
  amountNum,
  notice,
  txHash,
  error,
}: {
  side: 'buy' | 'sell';
  market: ReturnType<typeof useMarketData>;
  isConnected: boolean;
  onTargetChain: boolean;
  chainName: string;
  heldUnits: number;
  amountNum: number;
  notice: string | null;
  txHash?: `0x${string}`;
  error?: string;
}) {
  let note: { tone: 'warn' | 'info' | 'error' | 'success'; text: string } | null = null;
  if (error) {
    note = {
      tone: 'error',
      text: error.includes('User rejected') ? 'Transaction cancelled in wallet.' : error,
    };
  } else if (notice) {
    note = { tone: 'success', text: notice };
  } else if (market.source !== 'chain') {
    note = {
      tone: 'info',
      text: 'This asset trades on a simulated book, so live orders are disabled here.',
    };
  } else if (!isConnected) {
    note = {
      tone: 'warn',
      text: `Connect a wallet on ${chainName} to ${side === 'buy' ? 'place a buy order' : 'list a claim'}.`,
    };
  } else if (!onTargetChain) {
    note = { tone: 'warn', text: `Switch your wallet to ${chainName} to place an order.` };
  } else if (side === 'sell' && amountNum > 0 && amountNum > heldUnits) {
    note = { tone: 'warn', text: `You hold ${formatNumber(heldUnits)} claims for this project.` };
  }

  if (!note && !txHash) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {note ? (
        <p
          className={cn(
            'flex items-start gap-1.5 rounded p-2 font-mono text-label-sm',
            note.tone === 'error' && 'bg-error/10 text-error',
            note.tone === 'warn' && 'bg-tertiary/10 text-tertiary',
            note.tone === 'success' && 'bg-primary/10 text-primary',
            note.tone === 'info' && 'bg-surface-container-lowest text-outline',
          )}
        >
          <Icon
            name={note.tone === 'error' ? 'error' : note.tone === 'success' ? 'check_circle' : 'info'}
            size={13}
            className="mt-0.5 shrink-0"
          />
          <span>{note.text}</span>
        </p>
      ) : null}
      {txHash ? (
        <a
          href={protocolTxUrl(txHash) ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-label-sm text-primary underline"
        >
          <Icon name="open_in_new" size={13} />
          View transaction
        </a>
      ) : null}
    </div>
  );
}
