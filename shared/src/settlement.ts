/**
 * Settlement currency.
 *
 * ProtoRWA escrow originally assumed ETH only. Robinhood Chain settles RWA
 * flows in USDG (Paxos' Global Dollar) rather than USDC, and the buildathon
 * judging criteria give extra consideration to projects integrating USDG - so
 * settlement is now a named, per-chain concept rather than an implicit
 * "wei means ETH".
 *
 * The important constraint
 * ------------------------
 * ETH has 18 decimals; USDG has 6. Every place that converts a human figure to
 * a raw integer or back must therefore go through `toBaseUnits` /
 * `fromBaseUnits` with the currency's own decimals. A hardcoded `10n ** 18n`
 * against a 6-decimal token is off by a factor of a trillion, which is the kind
 * of bug that looks like a working demo right up until the money moves.
 *
 * Verified on-chain (symbol/name/decimals read via eth_call) for each address
 * registered in `shared/src/chains.ts`.
 */

/** Currencies the protocol can denominate a tranche in. */
export type SettlementCurrencyId = 'ETH' | 'USDG';

export interface SettlementCurrency {
  id: SettlementCurrencyId;
  /** Display symbol. */
  symbol: string;
  /** Full name, for prose and tooltips. */
  name: string;
  /** ERC-20 decimals. ETH is 18; USDG is 6. */
  decimals: number;
  /** True for the native gas token, which has no contract address. */
  native: boolean;
  /** One-line description shown in the settlement selector. */
  description: string;
}

export const SETTLEMENT_CURRENCIES: Record<SettlementCurrencyId, SettlementCurrency> = {
  ETH: {
    id: 'ETH',
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    native: true,
    description: 'Native gas token. No contract, no allowance required.',
  },
  USDG: {
    id: 'USDG',
    symbol: 'USDG',
    name: 'Global Dollar',
    decimals: 6,
    native: false,
    description: 'Paxos-issued stablecoin. ERC-20, requires an approval before escrow.',
  },
};

/**
 * USDG carries a built-in price assumption that ETH does not.
 *
 * A stablecoin is designed to hold ~1 USD, so a demo can show a dollar-denominated
 * tranche without inventing an ETH/USD rate. The rate is stated here rather than
 * inlined so the assumption is visible and testable, and it is deliberately not
 * used to convert between the two currencies - that would need a real oracle.
 */
export const USDG_USD_PARITY = 1 as const;

/** Converts a human-readable amount to raw base units for the currency. */
export function toBaseUnits(amount: number, currency: SettlementCurrencyId): bigint {
  const { decimals } = SETTLEMENT_CURRENCIES[currency];
  if (!Number.isFinite(amount) || amount < 0) return 0n;

  /*
   * Scaled through a decimal string rather than `amount * 10 ** decimals`.
   * `0.1 * 10 ** 6` is 100000.00001 in IEEE-754, so float multiplication
   * rounds unpredictably; the string path avoids that entirely.
   *
   * The string has to be normalised out of exponent form first. JS renders any
   * small enough number in scientific notation - `(1e-7).toString()` is
   * `'1e-7'`, not `'0.0001'` - and feeding that to the digit splitter below
   * produced `BigInt('1e-7000000')`, which throws rather than rounding. A crash
   * on a plausible input is worse than a rounding error, so exponent form is
   * expanded explicitly.
   */
  const normalised = expandExponent(amount);
  const [whole, fraction = ''] = normalised.split('.');
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals);
  const digits = `${whole ?? '0'}${padded}`.replace(/^0+(?=\d)/, '');
  return BigInt(digits === '' ? '0' : digits);
}

/**
 * Rewrites scientific notation as a plain decimal string.
 *
 * `1e-7` -> `0.0001`, `1.5e3` -> `1500`. Only the shapes `toString()` can
 * actually emit are handled, and anything unrecognised is passed through so the
 * caller still sees a deterministic failure rather than a silent zero.
 */
function expandExponent(value: number): string {
  const text = value.toString();
  if (!/[eE]/.test(text)) return text;

  const [mantissa = '0', exponentText = '0'] = text.split(/[eE]/);
  const exponent = Number(exponentText);
  const negative = mantissa.startsWith('-');
  const [intPart = '0', fracPart = ''] = mantissa.replace('-', '').split('.');

  const digits = intPart + fracPart;
  // Where the decimal point lands once the exponent is applied.
  const pointAt = intPart.length + exponent;

  let result: string;
  if (pointAt <= 0) {
    result = `0.${'0'.repeat(-pointAt)}${digits}`;
  } else if (pointAt >= digits.length) {
    result = `${digits}${'0'.repeat(pointAt - digits.length)}`;
  } else {
    result = `${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;
  }

  return negative ? `-${result}` : result;
}

/** Converts raw base units back to a number, for display and maths. */
export function fromBaseUnits(value: bigint | string, currency: SettlementCurrencyId): number {
  const { decimals } = SETTLEMENT_CURRENCIES[currency];
  let raw: bigint;
  try {
    raw = typeof value === 'bigint' ? value : BigInt(value || '0');
  } catch {
    return 0;
  }

  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;

  const fractionStr = fraction.toString().padStart(decimals, '0');
  const result = Number(`${whole}.${fractionStr}`);
  return negative ? -result : result;
}

/** Formats a base-unit amount for display, e.g. "1,250.00 USDG". */
export function formatSettlement(
  value: bigint | string,
  currency: SettlementCurrencyId,
  maxDecimals = 2,
): string {
  const amount = fromBaseUnits(value, currency);
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: maxDecimals,
    maximumFractionDigits: maxDecimals,
  })} ${SETTLEMENT_CURRENCIES[currency].symbol}`;
}

/** Formats a base-unit amount without the symbol, for table cells. */
export function formatSettlementNumber(
  value: bigint | string,
  currency: SettlementCurrencyId,
  maxDecimals = 2,
): string {
  return fromBaseUnits(value, currency).toLocaleString('en-US', {
    minimumFractionDigits: maxDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * The ERC-20 `approve(escrow, amount)` calldata an ERC-20 settlement requires.
 *
 * ETH transfers carry no allowance step; USDG does, and forgetting it is the
 * most common reason an ERC-20 escrow deposit reverts. Exposed so the UI can
 * state the requirement rather than surprise the user with a second signature.
 */
export function buildApproveCalldata(spender: string, amount: bigint): string {
  const selector = '095ea7b3'; // approve(address,uint256)
  const paddedSpender = spender.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return `0x${selector}${paddedSpender}${paddedAmount}`;
}
