/**
 * Founder studio form schema.
 *
 * Mirrors `ProjectRegistry.CreateProjectParams` plus the milestone schedule, so
 * the wizard can only produce input the contract will accept. Each rule here
 * corresponds to a revert in the contracts:
 *
 *   target/claimPrice/totalClaims > 0  -> ZeroAmount
 *   fundingDeadline > now              -> DeadlineInPast
 *   milestones non-empty               -> InvalidSchedule
 *   sum(trancheAmounts) === target     -> InvalidSchedule
 *   threshold/quotum <= 10000 bps      -> InvalidSchedule
 *   votingPeriodSeconds > 0            -> InvalidSchedule
 */

import { z } from 'zod';

import { PROTOCOL } from '@protorwa/shared';

/**
 * Decimal USDG string, positive.
 *
 * The registry/escrow settle in USDG (6 decimals), so a raise amount is entered
 * in dollars and converted to 6-decimal base units on submit - not 18-decimal
 * wei. The `Eth` field names are legacy; the values are USDG.
 */
const usdgAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Enter a positive USDG amount (max 6 decimals)')
  .refine((value) => Number(value) > 0, 'Must be greater than zero');

const positiveInt = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Whole numbers only')
  .refine((value) => Number(value) > 0, 'Must be greater than zero');

export const milestoneSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(120),
  description: z.string().trim().min(10, 'Describe what this milestone proves').max(600),
  trancheEth: usdgAmount,
  /** Days from funding close until this milestone is due. */
  durationDays: z.coerce.number().int().min(7, 'At least 7 days').max(365),
  approvalThresholdPct: z.coerce.number().int().min(1).max(100),
  quorumPct: z.coerce.number().int().min(1).max(100),
  votingPeriodDays: z.coerce.number().int().min(1).max(30),
});

export const projectDraftSchema = z
  .object({
    // Step 1: basics
    title: z.string().trim().min(3, 'At least 3 characters').max(120),
    tagline: z.string().trim().min(10, 'At least 10 characters').max(140),
    category: z.enum([
      'COMPUTE',
      'ENERGY',
      'ROBOTICS',
      'SENSORS',
      'MOBILITY',
      'BIOTECH',
      'MANUFACTURING',
      'OTHER',
    ]),
    manufacturingLocation: z.string().trim().min(2, 'Where is it built?').max(120),
    description: z.string().trim().min(80, 'At least 80 characters').max(2_400),

    // Step 2: media. These are IPFS CIDs pinned by the upload step; the
    // registry stores `coverCid` directly and the pitch video is what a backer
    // watches before committing, so it is mandatory.
    coverCid: z.string().trim().min(1, 'Upload a cover image'),
    galleryCids: z
      .array(z.string().trim().min(1))
      .min(1, 'Add at least one project photo'),
    pitchVideoCid: z.string().trim().min(1, 'A founder pitch video is required'),

    // Step 3: raise (USDG amounts)
    targetEth: usdgAmount,
    claimPriceEth: usdgAmount,
    totalClaims: positiveInt,
    /** Days from now until the funding deadline. */
    fundingWindowDays: z.coerce.number().int().min(1, 'At least 1 day').max(90),

    // Step 4: milestone schedule
    milestones: z
      .array(milestoneSchema)
      .min(2, 'At least 2 milestones')
      .max(PROTOCOL.MAX_MILESTONES, `At most ${PROTOCOL.MAX_MILESTONES} milestones`),
  })
  .superRefine((draft, ctx) => {
    /**
     * Tranches must sum exactly to the target. A mismatch would revert on-chain
     * with InvalidSchedule, so it is surfaced here as a field error instead.
     * Comparison is done in integer USDG base units to avoid float drift.
     */
    const toUsdg = (value: string): bigint => {
      const [whole, fraction = ''] = value.split('.');
      const padded = (fraction + '0'.repeat(6)).slice(0, 6);
      return BigInt(whole ?? '0') * 10n ** 6n + BigInt(padded || '0');
    };

    let sum = 0n;
    for (const milestone of draft.milestones) {
      try {
        sum += toUsdg(milestone.trancheEth);
      } catch {
        return; // Field-level regex already reported this.
      }
    }

    /*
     * Assigned in both the try and the catch, so the `= 0n` initialiser was
     * dead: nothing could read it before the assignment. Declared without a
     * value instead of seeded with one that never survives.
     */
    let target: bigint;
    try {
      target = toUsdg(draft.targetEth);
    } catch {
      return;
    }

    if (sum !== target) {
      ctx.addIssue({
        // Zod v3 exposes issue codes as string literals on `z.ZodIssueCode`;
        // `custom` is the value used to attach a message without a code-specific
        // payload. Written as the literal to stay compatible across v3 releases.
        code: 'custom',
        path: ['milestones'],
        message: `Tranches total ${sum / 10n ** 6n} USDG but the raise target is ${target / 10n ** 6n} USDG. They must match exactly.`,
      });
    }
  });

export type ProjectDraft = z.infer<typeof projectDraftSchema>;
export type MilestoneDraft = z.infer<typeof milestoneSchema>;

/** Sensible starting schedule, used before the founder edits anything. */
export function defaultMilestones(): MilestoneDraft[] {
  return [
    {
      title: 'Tooling and first article',
      description:
        'Tooling is paid for and the first article is inspected against the released drawing set.',
      trancheEth: '15000',
      durationDays: 45,
      approvalThresholdPct: PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100,
      quorumPct: PROTOCOL.DEFAULT_QUORUM_BPS / 100,
      votingPeriodDays: PROTOCOL.DEFAULT_VOTING_PERIOD_SECONDS / 86_400,
    },
    {
      title: 'Pilot batch',
      description: 'A short pilot batch is assembled and functionally tested.',
      trancheEth: '15000',
      durationDays: 90,
      approvalThresholdPct: PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100,
      quorumPct: PROTOCOL.DEFAULT_QUORUM_BPS / 100,
      votingPeriodDays: PROTOCOL.DEFAULT_VOTING_PERIOD_SECONDS / 86_400,
    },
    {
      title: 'Production run and QA',
      description: 'The full production run completes and units pass outgoing quality control.',
      trancheEth: '20000',
      durationDays: 150,
      approvalThresholdPct: PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100,
      quorumPct: PROTOCOL.DEFAULT_QUORUM_BPS / 100,
      votingPeriodDays: PROTOCOL.DEFAULT_VOTING_PERIOD_SECONDS / 86_400,
    },
  ];
}

/** Empty draft for a new project. */
export function emptyDraft(): ProjectDraft {
  return {
    title: '',
    tagline: '',
    category: 'MANUFACTURING',
    manufacturingLocation: '',
    description: '',
    coverCid: '',
    galleryCids: [],
    pitchVideoCid: '',
    // A realistic hardware raise: 50,000 USDG (~$50k) across 10,000 claims at
    // 5 USDG each, open for a month. 100 USDG is a demo number, not a build.
    targetEth: '50000',
    claimPriceEth: '5',
    totalClaims: '10000',
    fundingWindowDays: 30,
    milestones: defaultMilestones(),
  };
}

/** Warns when price x total is far from the target, which is legal but unusual. */
export function impliedRaise(draft: ProjectDraft): { implied: number; target: number; mismatch: boolean } {
  const price = Number(draft.claimPriceEth) || 0;
  const claims = Number(draft.totalClaims) || 0;
  const target = Number(draft.targetEth) || 0;
  const implied = price * claims;
  // 1% tolerance: exact equality is not required by the contracts.
  const mismatch = target > 0 && Math.abs(implied - target) / target > 0.01;
  return { implied, target, mismatch };
}
