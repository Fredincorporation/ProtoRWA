/**
 * Shared formatting helpers.
 *
 * Crypto UIs are full of raw wei and basis points; these convert to the exact
 * presentation used across the designs (mono labels, tabular numbers).
 */

import { PROTOCOL } from '@protorwa/shared';

/** USDG has 6 decimals and is pegged ~1:1 to USD. */
const USDG_UNIT = 10n ** 6n;

/**
 * Formats USDG base units as a trimmed dollar string (no symbol).
 *
 * The protocol settles in USDG, so money coming from the chain must be read at
 * 6 decimals, not the 18-decimal ETH path above. Reading a $5 tranche (5_000_000
 * base units) as wei would render as 0.000000000005 - the exact scale bug the
 * settlement module warns about.
 */
export function formatUsdgNumber(baseUnits: bigint | string, maxDecimals = 4): string {
  const value = typeof baseUnits === 'string' ? BigInt(baseUnits || '0') : baseUnits;
  const whole = value / USDG_UNIT;
  const fraction = value % USDG_UNIT;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction
    .toString()
    .padStart(6, '0')
    .slice(0, maxDecimals)
    .replace(/0+$/, '');
  return fractionStr.length > 0 ? `${whole}.${fractionStr}` : whole.toString();
}

/** Formats USDG base units with a symbol, e.g. "5.40 USDG". */
export function formatUsdg(baseUnits: bigint | string, maxDecimals = 2): string {
  return `${formatUsdgNumber(baseUnits, maxDecimals)} USDG`;
}

/** Formats a large integer with thousands separators, e.g. "10,000". */
export function formatNumber(value: bigint | number | string): string {
  const asString = typeof value === 'bigint' ? value.toString() : String(value);
  return asString.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Converts basis points to a percentage string, e.g. 6000 -> "60%". */
export function formatBps(bps: number | bigint): string {
  const value = typeof bps === 'bigint' ? Number(bps) : bps;
  const percent = value / (PROTOCOL.BPS_DENOMINATOR / 100);
  // Trim trailing zeros: 62.50 -> 62.5, 60.00 -> 60
  return `${parseFloat(percent.toFixed(2))}%`;
}

/** Truncates an address for display, e.g. "0x1234…abcd". */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** Formats an ISO timestamp as a short relative time, e.g. "3d ago". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const seconds = Math.floor((now.getTime() - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

/** Formats an ISO timestamp as a month/year label, e.g. "Sep 2026". */
export function formatDate(iso: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
}

/** Countdown label for a voting window, e.g. "4d 12h left" or "closed". */
export function formatCountdown(endsAt: string | null, now: Date = new Date()): string {
  if (!endsAt) return 'closed';

  const remainingMs = new Date(endsAt).getTime() - now.getTime();
  if (Number.isNaN(remainingMs) || remainingMs <= 0) return 'closed';

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

/** Percentage of a pool, guarding against a zero denominator. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 10_000n) / whole) / 100;
}

/**
 * Formats a wei amount as gwei, for gas costs.
 *
 * Gas per transaction is on the order of 1e10 wei (tens of gwei). Rendering
 * that as ETH with 6 decimals rounds every row to "0", which is technically true
 * and completely useless - so gas is shown in gwei instead.
 */
export function weiToGwei(wei: bigint | string, decimals = 2): string {
  const value = typeof wei === 'string' ? BigInt(wei || '0') : wei;
  const gwei = Number(value) / 1e9;
  return gwei.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
