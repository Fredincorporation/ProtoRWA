import { toBaseUnits } from '@protorwa/shared';

/**
 * USDG order math for the secondary market.
 *
 * These mirror `SecondaryMarket.sol` exactly and use base units (6 decimals) with
 * integer arithmetic, because the on-chain settlement is integer: the buyer's
 * cost is `amount * pricePerUnit` with no rounding, the protocol fee is
 * `(gross * feeBps) / 10_000` truncated toward zero, and the seller receives the
 * difference. The UI previously recomputed this inline in three places (bid
 * approval, take-ask approval, the buy button label); centralising it here means
 * the number the wallet is asked to approve is provably the number the contract
 * pulls - a mismatch would either fail the tx or, worse, approve more than is
 * spent.
 *
 * ETH never appears: USDG is the only settlement asset and native ETH is gas.
 */

/** Fee basis points -> a bigint divisor of 10_000. */
const BPS = 10_000n;

/**
 * Gross cost, in USDG base units, of taking `qty` units at `pricePerUnit` base
 * units - identical to the contract's `amount * pricePerUnit`.
 */
export function grossFor(qty: bigint, pricePerUnit: bigint): bigint {
  return qty * pricePerUnit;
}

/**
 * Gross USDG base units a bid of `claims` units at `priceUsdg` dollars commits
 * up-front. `claims` is floored to an integer count (the input box is whole
 * claims); the price is scaled through `toBaseUnits` so 6-decimal fractions are
 * exact. This is the amount the buyer must approve the market to pull.
 */
export function bidGross(claims: number, priceUsdg: number): bigint {
  const units = Number.isFinite(claims) ? BigInt(Math.max(0, Math.floor(claims))) : 0n;
  return grossFor(units, toBaseUnits(priceUsdg, 'USDG'));
}

/** Protocol fee in base units, truncated toward zero exactly like Solidity. */
export function feeFor(gross: bigint, feeBps: number): bigint {
  return (gross * BigInt(Math.max(0, Math.trunc(feeBps)))) / BPS;
}

/** What the seller actually receives: gross less the fee taken from proceeds. */
export function sellerProceeds(gross: bigint, feeBps: number): bigint {
  return gross - feeFor(gross, feeBps);
}

/**
 * Whether an approval step is needed before an order that will pull `gross`
 * base units. Uses `<` (not `<=`) so an exact allowance is reused rather than
 * re-approved, matching how the terminal decides to skip the approve tx.
 */
export function needsApproval(allowance: bigint, gross: bigint): boolean {
  return allowance < gross;
}
