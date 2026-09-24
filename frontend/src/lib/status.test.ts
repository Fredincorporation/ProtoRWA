import { describe, expect, it } from 'vitest';

import {
  REFUNDABLE_STATUSES,
  TRADABLE_STATUSES,
  isRefundableStatus,
  isTradableStatus,
} from './status';

/**
 * These two predicates are the single source of truth for the "can this be
 * traded?" and "can this be refunded?" gates (market listing, project CTA,
 * terminal route, refund panel). Getting them wrong either lets a holder trade a
 * frozen claim or refund an escrow that is still funding, so the whole status
 * space is pinned here rather than spot-checked.
 */

const ALL_STATUSES = [
  'DRAFT',
  'FUNDING',
  'IN_PRODUCTION',
  'COMPLETED',
  'CANCELLED',
  'DEFAULTED',
] as const;

describe('isTradableStatus', () => {
  it('allows only settled rounds (in production or delivered)', () => {
    expect(isTradableStatus('IN_PRODUCTION')).toBe(true);
    expect(isTradableStatus('COMPLETED')).toBe(true);
  });

  it('rejects rounds with nothing settled to trade', () => {
    expect(isTradableStatus('DRAFT')).toBe(false);
    expect(isTradableStatus('FUNDING')).toBe(false);
  });

  it('rejects frozen rounds whose claims are being refunded', () => {
    expect(isTradableStatus('CANCELLED')).toBe(false);
    expect(isTradableStatus('DEFAULTED')).toBe(false);
  });
});

describe('isRefundableStatus', () => {
  it('allows only the escrow-return states', () => {
    expect(isRefundableStatus('CANCELLED')).toBe(true);
    expect(isRefundableStatus('DEFAULTED')).toBe(true);
  });

  it('rejects live and not-yet-closed rounds', () => {
    for (const s of ['DRAFT', 'FUNDING', 'IN_PRODUCTION', 'COMPLETED'] as const) {
      expect(isRefundableStatus(s)).toBe(false);
    }
  });
});

describe('the tradable / refundable partition', () => {
  it('never overlaps - a claim cannot be both tradeable and refundable', () => {
    for (const s of ALL_STATUSES) {
      expect(isTradableStatus(s) && isRefundableStatus(s)).toBe(false);
    }
  });

  it('matches the exported lists exactly', () => {
    for (const s of ALL_STATUSES) {
      expect(isTradableStatus(s)).toBe((TRADABLE_STATUSES as readonly string[]).includes(s));
      expect(isRefundableStatus(s)).toBe((REFUNDABLE_STATUSES as readonly string[]).includes(s));
    }
  });

  it('leaves DRAFT and FUNDING in neither set', () => {
    // Those rounds are gated out of the market entirely (see FUNDING hiding).
    for (const s of ['DRAFT', 'FUNDING'] as const) {
      expect(isTradableStatus(s) || isRefundableStatus(s)).toBe(false);
    }
  });

  it('treats an unknown status from the API as neither', () => {
    expect(isTradableStatus('WHATEVER')).toBe(false);
    expect(isRefundableStatus('')).toBe(false);
  });
});
