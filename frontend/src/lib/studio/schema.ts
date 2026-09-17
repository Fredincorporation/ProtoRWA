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

/** Decimal ETH string, positive. */
const ethAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,18})?$/, 'Enter a positive decimal amount')
  .refine((value) => Number(value) > 0, 'Must be greater than zero');

const positiveInt = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Whole numbers only')
  .refine((value) => Number(value) > 0, 'Must be greater than zero');

export const milestoneSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(120),
  description: z.string().trim().min(10, 'Describe what this milestone proves').max(600),
  trancheEth: ethAmount,
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

    // Step 2: raise
    targetEth: ethAmount,
    claimPriceEth: ethAmount,
    totalClaims: positiveInt,
    /** Days from now until the funding deadline. */
    fundingWindowDays: z.coerce.number().int().min(1, 'At least 1 day').max(90),

    // Step 3: milestone schedule
    milestones: z
      .array(milestoneSchema)
      .min(2, 'At least 2 milestones')
      .max(PROTOCOL.MAX_MILESTONES, `At most ${PROTOCOL.MAX_MILESTONES} milestones`),
  })
  .superRefine((draft, ctx) => {
    /**
     * Tranches must sum exactly to the target. A mismatch would revert on-chain
     * with InvalidSchedule, so it is surfaced here as a field error instead.
     * Comparison is done in integer wei to avoid float drift.
     */
    const toWei = (value: string): bigint => {
      const [whole, fraction = ''] = value.split('.');
      const padded = (fraction + '0'.repeat(18)).slice(0, 18);
      return BigInt(whole ?? '0') * 10n ** 18n + BigInt(padded || '0');
    };

    let sum = 0n;
    for (const milestone of draft.milestones) {
      try {
        sum += toWei(milestone.trancheEth);
      } catch {
        return; // Field-level regex already reported this.
      }
    }

    let target = 0n;
    try {
      target = toWei(draft.targetEth);
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
        message: `Tranches total ${sum / 10n ** 18n} ETH but the raise target is ${target / 10n ** 18n} ETH. They must match exactly.`,
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
      trancheEth: '30',
      durationDays: 45,
      approvalThresholdPct: PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100,
      quorumPct: PROTOCOL.DEFAULT_QUORUM_BPS / 100,
      votingPeriodDays: PROTOCOL.DEFAULT_VOTING_PERIOD_SECONDS / 86_400,
    },
    {
      title: 'Pilot batch',
      description: 'A short pilot batch is assembled and functionally tested.',
      trancheEth: '30',
      durationDays: 75,
      approvalThresholdPct: PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS / 100,
      quorumPct: PROTOCOL.DEFAULT_QUORUM_BPS / 100,
      votingPeriodDays: PROTOCOL.DEFAULT_VOTING_PERIOD_SECONDS / 86_400,
    },
    {
      title: 'Production run and QA',
      description: 'The full production run completes and units pass outgoing quality control.',
      trancheEth: '40',
      durationDays: 120,
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
    targetEth: '100',
    claimPriceEth: '0.01',
    totalClaims: '10000',
    fundingWindowDays: 14,
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
