import { describe, expect, it } from 'vitest';

import { COST_BASIS_METHOD, buildLots, computeTaxSummary, ledgerToCsv, totalGasPaid } from './ledger';
import type { BigIntString, LedgerEntry, Position } from '@protorwa/shared';

const ETH = 10n ** 18n;

/**
 * Negated wei carries a leading minus, which the branded `${bigint}` template
 * type rejects even though the domain model requires signed values on `value`
 * and `amount` (a commit moves capital *out*). The cast is confined to this
 * helper so the production code is still type-checked against the real brand.
 */
const wei = (value: bigint): BigIntString => value.toString() as BigIntString;

function entry(overrides: Partial<LedgerEntry> & { id: string }): LedgerEntry {
  return {
    timestamp: '2025-01-01T00:00:00.000Z',
    kind: 'COMMIT',
    projectId: '1',
    amount: '0',
    value: '0',
    txHash: '0xaaaaaaaa',
    gasPaid: '0',
    ...overrides,
  } as LedgerEntry;
}

describe('buildLots', () => {
  it('derives per-unit cost from a commit entry', () => {
    // 1000 units for 10 ETH => 0.01 ETH per unit.
    const ledger = [
      entry({
        id: 'c1',
        kind: 'COMMIT',
        amount: '1000',
        value: wei(-10n * ETH),
        timestamp: '2025-01-01T00:00:00.000Z',
      }),
    ];

    const lots = buildLots('1', ledger);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.units).toBe(1000n);
    expect(lots[0]!.costPerUnit).toBe((10n * ETH) / 1000n);
  });

  it('ignores non-commit entries when building lots', () => {
    const ledger = [
      entry({ id: 's1', kind: 'LISTING_FILL', amount: wei(-500n), value: `${5n * ETH}` }),
    ];
    expect(buildLots('1', ledger)).toHaveLength(0);
  });

  it('falls back to average cost when the ledger has no commit history', () => {
    // A position with holdings but no matching COMMIT must still be costed, or
    // the open basis understates what the user actually put in.
    const position: Position = {
      projectId: '1',
      amount: '800',
      avgCost: `${5n * ETH}`,
      committed: '0',
      released: '0',
      refunded: '0',
    };
    const lots = buildLots('1', [], position);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.units).toBe(800n);
    expect(lots[0]!.costPerUnit).toBe(5n * ETH);
  });
});

describe('computeTaxSummary', () => {
  it('consumes the oldest lot first (FIFO) on a disposal', () => {
    /*
     * Two lots: 100 @ 1 ETH, then 100 @ 2 ETH. Selling 150 units must take all
     * of lot one (100 @ 1) and 50 of lot two (@2) => basis 200 ETH.
     * LIFO or average cost would give a different, testable answer.
     */
    const ledger: LedgerEntry[] = [
      entry({ id: 'c1', kind: 'COMMIT', amount: '100', value: wei(-100n * ETH), timestamp: '2025-01-01T00:00:00.000Z' }),
      entry({ id: 'c2', kind: 'COMMIT', amount: '100', value: wei(-200n * ETH), timestamp: '2025-02-01T00:00:00.000Z' }),
      entry({
        id: 's1',
        kind: 'ORDER_FILL',
        amount: wei(-150n),
        value: `${300n * ETH}`,
        timestamp: '2025-06-01T00:00:00.000Z',
      }),
    ];

    const summary = computeTaxSummary(
      [{ projectId: '1', amount: '50', avgCost: `${2n * ETH}`, committed: '0', released: '0', refunded: '0' }],
      ledger,
    );

    expect(summary.disposals).toHaveLength(1);
    expect(summary.disposals[0]!.basis).toBe(200n * ETH);
    expect(summary.disposals[0]!.proceeds).toBe(300n * ETH);
    expect(summary.disposals[0]!.gain).toBe(100n * ETH);

    // 50 units remain, all from the second lot at 2 ETH each.
    expect(summary.openUnits).toBe(50n);
    expect(summary.openBasis).toBe(100n * ETH);
  });

  it('splits gains by holding period using the weighted lot age', () => {
    const ledger: LedgerEntry[] = [
      entry({ id: 'c1', kind: 'COMMIT', amount: '100', value: wei(-100n * ETH), timestamp: '2024-01-01T00:00:00.000Z' }),
      entry({
        id: 's1',
        kind: 'ORDER_FILL',
        amount: wei(-100n),
        value: `${150n * ETH}`,
        // ~1.5 years later => long term.
        timestamp: '2025-07-01T00:00:00.000Z',
      }),
    ];

    const summary = computeTaxSummary(
      [{ projectId: '1', amount: '0', avgCost: `${1n * ETH}`, committed: '0', released: '0', refunded: '0' }],
      ledger,
    );

    expect(summary.disposals[0]!.holdingDays).toBeGreaterThan(365);
    expect(summary.longTermGain).toBe(50n * ETH);
    expect(summary.shortTermGain).toBe(0n);
  });

  it('treats a sub-year holding as short term', () => {
    const ledger: LedgerEntry[] = [
      entry({ id: 'c1', kind: 'COMMIT', amount: '100', value: wei(-100n * ETH), timestamp: '2025-01-01T00:00:00.000Z' }),
      entry({ id: 's1', kind: 'ORDER_FILL', amount: wei(-100n), value: `${150n * ETH}`, timestamp: '2025-06-01T00:00:00.000Z' }),
    ];

    const summary = computeTaxSummary(
      [{ projectId: '1', amount: '0', avgCost: `${1n * ETH}`, committed: '0', released: '0', refunded: '0' }],
      ledger,
    );

    expect(summary.shortTermGain).toBe(50n * ETH);
    expect(summary.longTermGain).toBe(0n);
  });

  it('reports a negative gain on a losing disposal', () => {
    const ledger: LedgerEntry[] = [
      entry({ id: 'c1', kind: 'COMMIT', amount: '100', value: wei(-100n * ETH), timestamp: '2025-01-01T00:00:00.000Z' }),
      entry({ id: 's1', kind: 'ORDER_FILL', amount: wei(-100n), value: `${40n * ETH}`, timestamp: '2025-03-01T00:00:00.000Z' }),
    ];

    const summary = computeTaxSummary(
      [{ projectId: '1', amount: '0', avgCost: `${1n * ETH}`, committed: '0', released: '0', refunded: '0' }],
      ledger,
    );

    expect(summary.disposals[0]!.gain).toBe(-60n * ETH);
    expect(summary.realizedGain).toBe(-60n * ETH);
  });

  it('ignores ledger entries that do not reduce holdings', () => {
    const ledger: LedgerEntry[] = [
      entry({ id: 'c1', kind: 'COMMIT', amount: '100', value: wei(-100n * ETH) }),
      // A positive transfer is an acquisition, not a disposal.
      entry({ id: 't1', kind: 'TRANSFER', amount: '50', value: `${50n * ETH}` }),
    ];

    const summary = computeTaxSummary(
      [{ projectId: '1', amount: '100', avgCost: `${1n * ETH}`, committed: '0', released: '0', refunded: '0' }],
      ledger,
    );

    expect(summary.disposals).toHaveLength(0);
  });

  it('conservatively costs a disposal that exceeds recorded lots', () => {
    /*
     * Only 100 units are on record but 150 are sold. The extra 50 have no known
     * basis; costing them at zero overstates the gain. Understating it would
     * under-report taxable income, so zero is the safer default.
     */
    const ledger: LedgerEntry[] = [
      entry({ id: 'c1', kind: 'COMMIT', amount: '100', value: wei(-100n * ETH), timestamp: '2025-01-01T00:00:00.000Z' }),
      entry({ id: 's1', kind: 'ORDER_FILL', amount: wei(-150n), value: `${300n * ETH}`, timestamp: '2025-03-01T00:00:00.000Z' }),
    ];

    const summary = computeTaxSummary(
      [{ projectId: '1', amount: '0', avgCost: `${1n * ETH}`, committed: '0', released: '0', refunded: '0' }],
      ledger,
    );

    expect(summary.disposals[0]!.basis).toBe(100n * ETH);
    expect(summary.disposals[0]!.gain).toBe(200n * ETH);
  });

  it('returns zeroed totals for an empty ledger', () => {
    const summary = computeTaxSummary([], []);
    expect(summary.realizedGain).toBe(0n);
    expect(summary.openUnits).toBe(0n);
    expect(summary.disposals).toHaveLength(0);
  });

  it('declares which cost basis method produced the figures', () => {
    expect(COST_BASIS_METHOD).toBe('FIFO');
  });
});

describe('totalGasPaid', () => {
  it('sums gas across every entry', () => {
    const ledger = [
      entry({ id: '1', gasPaid: '1000' }),
      entry({ id: '2', gasPaid: '2500' }),
    ];
    expect(totalGasPaid(ledger)).toBe(3500n);
  });
});

describe('ledgerToCsv', () => {
  const projects = [
    { id: '1', title: 'HelioFrost Pro' },
  ] as unknown as Parameters<typeof ledgerToCsv>[1];

  it('emits a header and one row per entry', () => {
    const csv = ledgerToCsv([entry({ id: '1' }), entry({ id: '2' })], projects);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('timestamp,kind,project');
    expect(lines).toHaveLength(3);
  });

  it('quotes a project title containing a comma so columns do not shift', () => {
    const commaProjects = [{ id: '1', title: 'Widget, Mk II' }] as unknown as Parameters<
      typeof ledgerToCsv
    >[1];
    const csv = ledgerToCsv([entry({ id: '1' })], commaProjects);
    expect(csv).toContain('"Widget, Mk II"');
  });

  it('escapes embedded double quotes', () => {
    const quoteProjects = [{ id: '1', title: 'The "Big" One' }] as unknown as Parameters<
      typeof ledgerToCsv
    >[1];
    const csv = ledgerToCsv([entry({ id: '1' })], quoteProjects);
    expect(csv).toContain('"The ""Big"" One"');
  });

  it('emits raw wei so the file stays machine-readable', () => {
    const csv = ledgerToCsv(
      [entry({ id: '1', amount: '1000', value: `${5n * ETH}` })],
      projects,
    );
    expect(csv).toContain(`${5n * ETH}`);
    expect(csv).not.toContain(' ETH');
  });
});
