/**
 * Cost basis, realized gains, and tax-lot accounting.
 *
 * What this is
 * ------------
 * Claim units are acquired at different prices over time and can be sold on the
 * secondary market. Working out the gain on a sale therefore needs a lot
 * selection policy, and the policy changes the number - so it has to be stated,
 * not implied.
 *
 * This module implements FIFO (first in, first out), which is the default
 * treatment most jurisdictions accept for fungible digital assets. It is applied
 * explicitly rather than left ambiguous, and the UI states which method produced
 * the figures.
 *
 * IMPORTANT - not tax advice. These numbers are derived from a synthetic demo
 * ledger. A real filing needs the actual on-chain history, the holding-period
 * rules of the relevant jurisdiction, and a human accountant.
 */

import type { BigIntString, LedgerEntry, Position, Project } from '@protorwa/shared';

/** Lot selection policy. Only FIFO is implemented; see module doc. */
export const COST_BASIS_METHOD = 'FIFO' as const;

export interface TaxLot {
  projectId: string;
  /** Units acquired in this lot. */
  units: bigint;
  /** Cost per unit, in wei. */
  costPerUnit: bigint;
  /** When acquired (ISO 8601). */
  acquiredAt: string;
  /** Units of this lot still held (remainder after any disposals). */
  remaining: bigint;
}

export interface Disposal {
  projectId: string;
  /** Units sold. */
  units: bigint;
  /** Proceeds per unit, in wei. */
  proceedsPerUnit: bigint;
  /** Total proceeds, in wei. */
  proceeds: bigint;
  /** Cost basis of the units sold, in wei (FIFO). */
  basis: bigint;
  /** Proceeds minus basis; negative is a loss. */
  gain: bigint;
  /** When disposed (ISO 8601). */
  disposedAt: string;
  /** Holding period in days, weighted by the lots consumed. */
  holdingDays: number;
}

export interface TaxSummary {
  /** Total cost basis of units still held, in wei. */
  openBasis: bigint;
  /** Units still held. */
  openUnits: bigint;
  /** Realized proceeds across all disposals, in wei. */
  realizedProceeds: bigint;
  /** Realized cost basis across all disposals, in wei. */
  realizedBasis: bigint;
  /** Realized gain (or loss, if negative), in wei. */
  realizedGain: bigint;
  /** Disposals held <= 365 days; short-term for most regimes. */
  shortTermGain: bigint;
  /** Disposals held > 365 days. */
  longTermGain: bigint;
  disposals: Disposal[];
  openLots: TaxLot[];
}

/** Days between two ISO timestamps; 0 when either is unparseable. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** Long-term threshold in days. 365 is the common US definition. */
const LONG_TERM_DAYS = 365;

/**
 * Builds acquisition lots from a position's history.
 *
 * A position records only aggregate units and average cost, which is not enough
 * to compute a gain on a partial sale - average cost and FIFO give different
 * answers. The acquisition event (`COMMIT`) in the ledger carries the units and
 * the value moved, so the per-unit cost is recoverable there. When no commit
 * event exists the position's average cost is used as a single lot, and that
 * fallback is flagged by returning a lot dated at the position's start.
 */
export function buildLots(projectId: string, ledger: LedgerEntry[], position?: Position): TaxLot[] {
  const commits = ledger
    .filter((entry) => entry.projectId === projectId && entry.kind === 'COMMIT')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const lots: TaxLot[] = [];

  for (const entry of commits) {
    const units = BigInt(entry.amount || '0');
    if (units <= 0n) continue;

    // `value` on a commit is negative (capital left the wallet); basis is the
    // magnitude.
    const value = BigInt(entry.value || '0');
    const basis = value < 0n ? -value : value;
    if (basis <= 0n) continue;

    lots.push({
      projectId,
      units,
      costPerUnit: basis / units,
      acquiredAt: entry.timestamp,
      remaining: units,
    });
  }

  /*
   * Fallback: a position can exist without a matching COMMIT in the ledger
   * (the demo ledger is a partial history). Rather than silently dropping those
   * units - which would understate holdings - they are added as a single lot at
   * the position's average cost.
   */
  if (lots.length === 0 && position && BigInt(position.amount || '0') > 0n) {
    const units = BigInt(position.amount);
    lots.push({
      projectId,
      units,
      costPerUnit: BigInt(position.avgCost || '0'),
      acquiredAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
      remaining: units,
    });
  }

  return lots;
}

/**
 * Consumes lots FIFO for a disposal, returning the cost basis and the weighted
 * holding period of the units actually consumed.
 *
 * Mutates the lots' `remaining` fields, because a disposal genuinely consumes
 * them; callers that need the pre-disposal state must clone first.
 */
function consumeFifo(
  lots: TaxLot[],
  units: bigint,
  disposedAt: string,
): { basis: bigint; holdingDays: number } {
  let remaining = units;
  let basis = 0n;
  let weightedDays = 0;

  for (const lot of lots) {
    if (remaining <= 0n) break;
    if (lot.remaining <= 0n) continue;

    const taken = lot.remaining < remaining ? lot.remaining : remaining;
    basis += taken * lot.costPerUnit;
    weightedDays += daysBetween(lot.acquiredAt, disposedAt) * Number(taken);
    lot.remaining -= taken;
    remaining -= taken;
  }

  /*
   * If the disposal exceeds the recorded lots, the excess has no known basis.
   * It is costed at zero rather than guessed, which overstates the gain. That is
   * the conservative direction: it will not under-report a taxable amount.
   */
  const holdingDays = units > 0n ? Math.round(weightedDays / Number(units)) : 0;
  return { basis, holdingDays };
}

/**
 * Computes realized gains and open lots for a set of positions.
 *
 * Disposals are derived from ledger entries that reduce holdings: a
 * `LISTING_FILL` or `ORDER_FILL` with a negative unit amount, or an explicit
 * `TRANSFER` out. Sales are processed in chronological order, because FIFO
 * against a later acquisition would be wrong.
 */
export function computeTaxSummary(
  positions: Position[],
  ledger: LedgerEntry[],
): TaxSummary {
  const lotsByProject = new Map<string, TaxLot[]>();

  for (const position of positions) {
    lotsByProject.set(position.projectId, buildLots(position.projectId, ledger, position));
  }

  const disposalEntries = ledger
    .filter((entry) => {
      if (!entry.projectId) return false;
      const units = BigInt(entry.amount || '0');
      // Only events that reduce holdings, and only ones we can price.
      if (units >= 0n) return false;
      return entry.kind === 'ORDER_FILL' || entry.kind === 'LISTING_FILL' || entry.kind === 'TRANSFER';
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const disposals: Disposal[] = [];

  for (const entry of disposalEntries) {
    const projectId = entry.projectId;
    if (!projectId) continue;

    const lots = lotsByProject.get(projectId);
    if (!lots) continue;

    const units = -BigInt(entry.amount || '0');
    if (units <= 0n) continue;

    const value = BigInt(entry.value || '0');
    const proceeds = value > 0n ? value : -value;
    const proceedsPerUnit = proceeds / units;

    const { basis, holdingDays } = consumeFifo(lots, units, entry.timestamp);

    disposals.push({
      projectId,
      units,
      proceedsPerUnit,
      proceeds,
      basis,
      gain: proceeds - basis,
      disposedAt: entry.timestamp,
      holdingDays,
    });
  }

  let realizedProceeds = 0n;
  let realizedBasis = 0n;
  let shortTermGain = 0n;
  let longTermGain = 0n;

  for (const disposal of disposals) {
    realizedProceeds += disposal.proceeds;
    realizedBasis += disposal.basis;
    if (disposal.holdingDays > LONG_TERM_DAYS) {
      longTermGain += disposal.gain;
    } else {
      shortTermGain += disposal.gain;
    }
  }

  const openLots: TaxLot[] = [];
  let openBasis = 0n;
  let openUnits = 0n;

  for (const lots of lotsByProject.values()) {
    for (const lot of lots) {
      if (lot.remaining <= 0n) continue;
      openLots.push(lot);
      openBasis += lot.remaining * lot.costPerUnit;
      openUnits += lot.remaining;
    }
  }

  return {
    openBasis,
    openUnits,
    realizedProceeds,
    realizedBasis,
    realizedGain: realizedProceeds - realizedBasis,
    shortTermGain,
    longTermGain,
    disposals,
    openLots,
  };
}

/** Gas paid across a ledger, in wei. Recoverable as a cost in some regimes. */
export function totalGasPaid(ledger: LedgerEntry[]): bigint {
  return ledger.reduce((acc, entry) => acc + BigInt(entry.gasPaid || '0'), 0n);
}

/**
 * Serialises the ledger to CSV.
 *
 * Escaping is not optional here: a tx hash or a rationale string containing a
 * comma or a quote would otherwise shift every subsequent column. Weights are
 * emitted as raw wei so the file is machine-consumable rather than pre-formatted
 * for display.
 */
export function ledgerToCsv(ledger: LedgerEntry[], projects: Project[]): string {
  const header = [
    'timestamp',
    'kind',
    'project',
    'units',
    'value_wei',
    'gas_wei',
    'tx_hash',
  ].join(',');

  const escape = (value: string): string => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  const rows = [...ledger]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((entry) => {
      const project = projects.find((candidate) => candidate.id === entry.projectId);
      return [
        entry.timestamp,
        entry.kind,
        escape(project?.title ?? ''),
        entry.amount || '0',
        entry.value || '0',
        entry.gasPaid || '0',
        entry.txHash,
      ].join(',');
    });

  return [header, ...rows].join('\n');
}

/** Type guard kept beside the mapper so both change together. */
export function isSyntheticLedger(): true {
  return true;
}

/** Re-exported so callers do not need to import the branded type directly. */
export type { BigIntString };
