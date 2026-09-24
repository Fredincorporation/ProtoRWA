/**
 * Presentation mapping for domain enums.
 *
 * Status strings appear in dozens of places (cards, badges, terminal rows), so
 * the label and tone live here rather than being re-decided per screen.
 */

import type {
  IndustryCategory,
  ListingStatus,
  MilestoneStatus,
  ProjectStatus,
  NotificationKind,
} from '@protorwa/shared';

type Tone = 'neutral' | 'brand' | 'accent' | 'warn' | 'danger' | 'success';

export interface StatusPresentation {
  label: string;
  tone: Tone;
  description: string;
}

export const projectStatusMap: Record<ProjectStatus, StatusPresentation> = {
  DRAFT: {
    label: 'Draft',
    tone: 'neutral',
    description: 'Not yet accepting capital.',
  },
  FUNDING: {
    label: 'Funding',
    tone: 'brand',
    description: 'Open for commitments. Claims mint on commit.',
  },
  IN_PRODUCTION: {
    label: 'In production',
    tone: 'accent',
    description: 'Capital escrowed. Milestones under review.',
  },
  COMPLETED: {
    label: 'Delivered',
    tone: 'success',
    description: 'All milestones released and hardware delivered.',
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'warn',
    description: 'Raise withdrawn. Commitments refundable.',
  },
  DEFAULTED: {
    label: 'Defaulted',
    tone: 'danger',
    description: 'Milestones failed. Escrow refunds claim holders.',
  },
};

export const milestoneStatusMap: Record<MilestoneStatus, StatusPresentation> = {
  PENDING: {
    label: 'Pending',
    tone: 'neutral',
    description: 'Not yet reached.',
  },
  EVIDENCE: {
    label: 'In review',
    tone: 'brand',
    description: 'Evidence submitted. Voting window open.',
  },
  APPROVED: {
    label: 'Approved',
    tone: 'success',
    description: 'Consensus reached. Tranche released.',
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'danger',
    description: 'Consensus rejected. Founder may resubmit.',
  },
  DISPUTED: {
    label: 'Disputed',
    tone: 'warn',
    description: 'Escalated to the protocol oracle.',
  },
};

export const listingStatusMap: Record<ListingStatus, StatusPresentation> = {
  ACTIVE: { label: 'Active', tone: 'brand', description: 'Fillable now.' },
  FILLED: { label: 'Filled', tone: 'success', description: 'Fully sold.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', description: 'Withdrawn by seller.' },
  EXPIRED: { label: 'Expired', tone: 'warn', description: 'Past its expiry.' },
};

export const categoryMap: Record<IndustryCategory, { label: string; icon: string }> = {
  COMPUTE: { label: 'Compute', icon: 'memory' },
  ENERGY: { label: 'Energy', icon: 'bolt' },
  ROBOTICS: { label: 'Robotics', icon: 'precision_manufacturing' },
  SENSORS: { label: 'Sensors', icon: 'sensors' },
  MOBILITY: { label: 'Mobility', icon: 'directions_car' },
  BIOTECH: { label: 'Biotech', icon: 'biotech' },
  MANUFACTURING: { label: 'Manufacturing', icon: 'factory' },
  OTHER: { label: 'Other', icon: 'category' },
};

export const notificationTone: Record<
  NotificationKind,
  { tone: Tone; icon: string }
> = {
  MILESTONE_EVIDENCE: { tone: 'brand', icon: 'fact_check' },
  VOTING_OPEN: { tone: 'brand', icon: 'how_to_vote' },
  VOTING_CLOSED: { tone: 'neutral', icon: 'ballot' },
  TRANCHE_RELEASED: { tone: 'success', icon: 'payments' },
  LISTING_FILLED: { tone: 'success', icon: 'sell' },
  ORDER_FILLED: { tone: 'success', icon: 'swap_horiz' },
  FOUNDER_UPDATE: { tone: 'accent', icon: 'campaign' },
  PROTOCOL_ALERT: { tone: 'warn', icon: 'warning' },
  REFUND_AVAILABLE: { tone: 'danger', icon: 'currency_exchange' },
};

export const severityTone: Record<'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL', Tone> = {
  INFO: 'neutral',
  SUCCESS: 'success',
  WARNING: 'warn',
  CRITICAL: 'danger',
};

/** Safe lookup: an unknown status from the API must not crash a screen. */
export function projectStatus(status: string): StatusPresentation {
  return (
    projectStatusMap[status as ProjectStatus] ?? {
      label: status,
      tone: 'neutral',
      description: '',
    }
  );
}

/**
 * Statuses whose claims are tradable on the secondary market.
 *
 * A claim only represents an escrowed production commitment once its funding
 * round has closed, so DRAFT and FUNDING assets have nothing settled to trade.
 * CANCELLED and DEFAULTED projects freeze their claims for refund, so they are
 * untradeable too. Only a delivered build (COMPLETED) or one in production
 * (IN_PRODUCTION) can change hands. Single source of truth for every "can this
 * be traded?" gate (market listing, project CTA, terminal route).
 */
export const TRADABLE_STATUSES: readonly ProjectStatus[] = ['IN_PRODUCTION', 'COMPLETED'];

export function isTradableStatus(status: string): boolean {
  return (TRADABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Statuses whose escrow is being returned to claim holders.
 *
 * The mirror of {@link TRADABLE_STATUSES}: a CANCELLED or DEFAULTED project
 * freezes its claims and lets each holder burn their balance for a pro-rata
 * share of whatever is still locked, via `MilestoneEscrow.claimRefund()`.
 * Single source of truth for every "can this be refunded?" gate.
 */
export const REFUNDABLE_STATUSES: readonly ProjectStatus[] = ['CANCELLED', 'DEFAULTED'];

export function isRefundableStatus(status: string): boolean {
  return (REFUNDABLE_STATUSES as readonly string[]).includes(status);
}


export function milestoneStatus(status: string): StatusPresentation {
  return (
    milestoneStatusMap[status as MilestoneStatus] ?? {
      label: status,
      tone: 'neutral',
      description: '',
    }
  );
}

export function listingStatus(status: string): StatusPresentation {
  return (
    listingStatusMap[status as ListingStatus] ?? {
      label: status,
      tone: 'neutral',
      description: '',
    }
  );
}
