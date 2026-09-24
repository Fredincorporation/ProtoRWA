import { describe, expect, it } from 'vitest';

import {
  SETTLEMENT_CURRENCIES,
  USDG_USD_PARITY,
  buildApproveCalldata,
  formatSettlement,
  fromBaseUnits,
  toBaseUnits,
} from './settlement.js';

/**
 * The decimals mismatch is the whole point of these tests.
 *
 * ETH is 18-decimal and USDG is 6-decimal *on the same escrow*. Any code that
 * assumes 18 for both is wrong by a factor of 10^12 - which produces a demo that
 * looks fine and moves the wrong amount, so the round-trip is pinned here.
 */

describe('SETTLEMENT_CURRENCIES', () => {
  it('records 18 decimals for ETH and 6 for USDG', () => {
    expect(SETTLEMENT_CURRENCIES.ETH.decimals).toBe(18);
    expect(SETTLEMENT_CURRENCIES.USDG.decimals).toBe(6);
  });

  it('marks only ETH as native, because USDG needs an approval', () => {
    expect(SETTLEMENT_CURRENCIES.ETH.native).toBe(true);
    expect(SETTLEMENT_CURRENCIES.USDG.native).toBe(false);
  });
});

describe('toBaseUnits', () => {
  it('scales ETH at 18 decimals', () => {
    expect(toBaseUnits(1, 'ETH')).toBe(10n ** 18n);
    expect(toBaseUnits(0.5, 'ETH')).toBe(5n * 10n ** 17n);
  });

  it('scales USDG at 6 decimals, not 18', () => {
    // The bug this catches: 1 USDG becoming 1e18 instead of 1e6.
    expect(toBaseUnits(1, 'USDG')).toBe(1_000_000n);
    expect(toBaseUnits(0.5, 'USDG')).toBe(500_000n);
    expect(toBaseUnits(1250, 'USDG')).toBe(1_250_000_000n);
  });

  it('handles the precision a 6-decimal token actually supports', () => {
    // 6 decimals is the floor: 0.000001 USDG is exactly 1 base unit.
    expect(toBaseUnits(0.000001, 'USDG')).toBe(1n);
    // 0.0001 USDG is 100 base units - well within resolution, and a value an
    // 18-decimal assumption would silently render as 1e14.
    expect(toBaseUnits(0.0001, 'USDG')).toBe(100n);
  });

  it('expands scientific notation instead of throwing', () => {
    /*
     * `(1e-7).toString()` is '1e-7'. Passing that through a naive
     * split-on-'.' produced BigInt('1e-7000000'), which throws - a crash on
     * ordinary numeric input, caught by probing rather than by reasoning.
     */
    expect(toBaseUnits(1e-7, 'USDG')).toBe(0n);
    expect(toBaseUnits(1.5e-6, 'USDG')).toBe(1n);
    // Positive exponents must expand too: 1e21 ETH is a real (if large) amount.
    expect(toBaseUnits(1e21, 'ETH')).toBe(10n ** 21n * 10n ** 18n);
  });

  it('handles small values that JS stringifies in exponent form', () => {
    // These are the realistic cases: a USDG amount of one micro-dollar or less.
    expect(() => toBaseUnits(5e-7, 'USDG')).not.toThrow();
    expect(() => toBaseUnits(1e-8, 'USDG')).not.toThrow();
    expect(toBaseUnits(5e-7, 'USDG')).toBe(0n);
  });

  it('does not introduce float drift for values that break naive scaling', () => {
    // 0.1 * 10**6 is 100000.00001 in IEEE-754; truncation direction matters.
    expect(toBaseUnits(0.1, 'USDG')).toBe(100_000n);
    expect(toBaseUnits(0.3, 'USDG')).toBe(300_000n);
    expect(toBaseUnits(1.1, 'USDG')).toBe(1_100_000n);
    expect(toBaseUnits(19.99, 'USDG')).toBe(19_990_000n);
  });

  it('returns zero for negative or non-finite input rather than throwing', () => {
    expect(toBaseUnits(-5, 'ETH')).toBe(0n);
    expect(toBaseUnits(Number.NaN, 'ETH')).toBe(0n);
    expect(toBaseUnits(Number.POSITIVE_INFINITY, 'USDG')).toBe(0n);
  });

  it('round-trips through fromBaseUnits for both currencies', () => {
    for (const amount of [0, 1, 12.5, 999.99, 0.000001]) {
      expect(fromBaseUnits(toBaseUnits(amount, 'USDG'), 'USDG')).toBeCloseTo(amount, 6);
    }
    for (const amount of [0, 1, 0.05, 42.123456]) {
      expect(fromBaseUnits(toBaseUnits(amount, 'ETH'), 'ETH')).toBeCloseTo(amount, 12);
    }
  });
});

describe('fromBaseUnits', () => {
  it('reads a 6-decimal USDG balance correctly', () => {
    expect(fromBaseUnits('1000000', 'USDG')).toBe(1);
    expect(fromBaseUnits(2_500_000_000n, 'USDG')).toBe(2500);
  });

  it('preserves fractional USDG below one unit', () => {
    expect(fromBaseUnits(1n, 'USDG')).toBeCloseTo(0.000001, 6);
  });

  it('handles negative values without losing the sign', () => {
    expect(fromBaseUnits(-1_500_000n, 'USDG')).toBe(-1.5);
  });

  it('returns zero for unparseable input', () => {
    expect(fromBaseUnits('not-a-number', 'USDG')).toBe(0);
  });
});

describe('formatSettlement', () => {
  it('labels the amount with the right symbol', () => {
    expect(formatSettlement(1_250_000_000n, 'USDG')).toBe('1,250.00 USDG');
    expect(formatSettlement(10n ** 18n, 'ETH')).toBe('1.00 ETH');
  });

  it('keeps a sub-dollar USDG amount legible', () => {
    // Default 2 decimals would render this as "0.00", hiding a real balance.
    expect(formatSettlement(500_000n, 'USDG')).toBe('0.50 USDG');
  });
});

describe('USDG_USD_PARITY', () => {
  it('states the peg assumption explicitly rather than burying it', () => {
    expect(USDG_USD_PARITY).toBe(1);
  });
});

describe('buildApproveCalldata', () => {
  it('encodes approve(address,uint256) with the right selector', () => {
    const data = buildApproveCalldata('0x19f2190C1c50B2E4403ff4bd78c05598aBabbD16', 1_000_000n);
    expect(data.startsWith('0x095ea7b3')).toBe(true);
  });

  it('left-pads the spender to 32 bytes and right-pads the amount', () => {
    const spender = '0x19f2190C1c50B2E4403ff4bd78c05598aBabbD16';
    const data = buildApproveCalldata(spender, 1_000_000n);

    const args = data.slice(10);
    const spenderWord = args.slice(0, 64);
    const amountWord = args.slice(64);

    expect(spenderWord).toBe(spender.toLowerCase().replace(/^0x/, '').padStart(64, '0'));
    expect(amountWord).toBe((1_000_000n).toString(16).padStart(64, '0'));
  });

  it('produces an approval sized for USDG, not ETH', () => {
    // 1 USDG is 1e6 base units; an 18-decimal encoding would be 1e18.
    const data = buildApproveCalldata('0x19f2190C1c50B2E4403ff4bd78c05598aBabbD16', toBaseUnits(1, 'USDG'));
    expect(data.endsWith('000f4240')).toBe(true);
  });
});
