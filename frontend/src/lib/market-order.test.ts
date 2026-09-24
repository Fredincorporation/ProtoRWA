import { describe, expect, it } from 'vitest';

import {
  bidGross,
  feeFor,
  grossFor,
  needsApproval,
  sellerProceeds,
} from './market-order';

/**
 * Contract parity is the whole point of `market-order`: the number the wallet is
 * asked to approve must be provably the number `SecondaryMarket.sol` pulls, or a
 * buy/bid reverts (under-approve) or leaks allowance (over-approve). Each test
 * below restates the corresponding on-chain expression - `amount * pricePerUnit`
 * and `(gross * feeBps) / 10_000` in integer base units - rather than a float
 * approximation of it.
 */

describe('grossFor', () => {
  it('is the integer product amount * pricePerUnit (no rounding)', () => {
    // 3 claims at $10 (10e6 base units) = 30 USDG = 30e6 base units.
    expect(grossFor(3n, 10_000_000n)).toBe(30_000_000n);
  });

  it('keeps 6-decimal price fractions exact', () => {
    // 7 claims at $1.5 (1.5e6) = 10.5 USDG = 10_500_000 base units.
    expect(grossFor(7n, 1_500_000n)).toBe(10_500_000n);
  });

  it('is zero when either side is zero', () => {
    expect(grossFor(0n, 5_000_000n)).toBe(0n);
    expect(grossFor(12n, 0n)).toBe(0n);
  });
});

describe('bidGross', () => {
  it('matches grossFor for the same unit/price after scaling dollars', () => {
    // A bid of 4 claims at $2.50 must equal the on-chain pull for 4 * 2.5e6.
    expect(bidGross(4, 2.5)).toBe(grossFor(4n, 2_500_000n));
    expect(bidGross(4, 2.5)).toBe(10_000_000n);
  });

  it('floors a fractional claim count rather than throwing', () => {
    // The whole-claims box can still receive "3.9"; the contract takes integer
    // claims, so the approval must be for 3 units, never a fractional BigInt.
    expect(bidGross(3.9, 10)).toBe(grossFor(3n, 10_000_000n));
  });

  it('clamps negative or NaN inputs to zero', () => {
    expect(bidGross(-5, 10)).toBe(0n);
    expect(bidGross(NaN, 10)).toBe(0n);
    expect(bidGross(2, NaN)).toBe(0n);
  });
});

describe('feeFor', () => {
  it('truncates toward zero like Solidity integer division', () => {
    // 1% of 14e6 = 140_000 exactly.
    expect(feeFor(14_000_000n, 100)).toBe(140_000n);
    // 1% of 105 base units is 1.05 -> truncated to 1, not rounded to 1.
    expect(feeFor(105n, 100)).toBe(1n);
  });

  it('is zero at 0 bps and at zero gross', () => {
    expect(feeFor(50_000_000n, 0)).toBe(0n);
    expect(feeFor(0n, 100)).toBe(0n);
  });

  it('never exceeds the gross for the capped fee range', () => {
    // feeBps is bounded <= 1000 (10%) on-chain; the fee is always a slice.
    const gross = 1_000_000n;
    expect(feeFor(gross, 1000)).toBeLessThanOrEqual(gross);
  });
});

describe('sellerProceeds', () => {
  it('is gross minus the fee taken from proceeds', () => {
    // The fee is deducted from the SELLER, so buyer cost stays the full gross.
    const gross = 20_000_000n;
    expect(sellerProceeds(gross, 100)).toBe(gross - feeFor(gross, 100));
    expect(sellerProceeds(gross, 100)).toBe(19_800_000n);
  });

  it('equals gross when there is no fee', () => {
    expect(sellerProceeds(20_000_000n, 0)).toBe(20_000_000n);
  });

  it('rounds the same way as the contract (proceeds never overpaid)', () => {
    // gross = fee + proceeds exactly, so no base unit is created by rounding.
    const gross = 1_000_003n;
    const fee = feeFor(gross, 100);
    expect(fee + sellerProceeds(gross, 100)).toBe(gross);
  });
});

describe('needsApproval', () => {
  it('is true only when the allowance is short of the gross', () => {
    expect(needsApproval(0n, 100n)).toBe(true);
    expect(needsApproval(99n, 100n)).toBe(true);
  });

  it('reuses an exact allowance (strict <, not <=)', () => {
    // Re-approving when allowance === gross would fire a needless tx.
    expect(needsApproval(100n, 100n)).toBe(false);
    expect(needsApproval(101n, 100n)).toBe(false);
  });

  it('does not approve for a zero-gross order', () => {
    expect(needsApproval(0n, 0n)).toBe(false);
  });
});
