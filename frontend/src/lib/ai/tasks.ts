/**
 * AI task definitions for the founder wizard.
 *
 * Each task pairs a system prompt with a Zod schema, so the model's output is
 * validated before it reaches the UI. A hallucinated shape becomes a clean
 * validation error instead of a broken form.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

export const milestoneSuggestionSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(600),
  /** Share of the total raise for this milestone, in basis points. */
  trancheBps: z.number().int().min(100).max(9_000),
  /** Window in days from funding close. */
  durationDays: z.number().int().min(7).max(365),
});

export const milestonePlanSchema = z.object({
  milestones: z.array(milestoneSuggestionSchema).min(2).max(6),
});

export const tokenomicsSuggestionSchema = z.object({
  claimPrice: z.string().regex(/^\d+(\.\d+)?$/),
  totalClaims: z.string().regex(/^\d+$/),
  target: z.string().regex(/^\d+(\.\d+)?$/),
  notes: z.string().max(800),
});

export const riskNoteSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  category: z.string().min(2).max(60),
  note: z.string().min(10).max(500),
  mitigation: z.string().min(10).max(500),
});

export const riskNotesSchema = z.object({
  risks: z.array(riskNoteSchema).min(2).max(6),
});

export const descriptionSchema = z.object({
  tagline: z.string().min(10).max(140),
  description: z.string().min(80).max(2_400),
  highlights: z.array(z.string().min(3).max(120)).min(3).max(6),
});

export type MilestonePlan = z.infer<typeof milestonePlanSchema>;
export type TokenomicsSuggestion = z.infer<typeof tokenomicsSuggestionSchema>;
export type RiskNotes = z.infer<typeof riskNotesSchema>;
export type ProjectCopy = z.infer<typeof descriptionSchema>;

/* ------------------------------------------------------------------ *
 * Prompts
 * ------------------------------------------------------------------ */

/**
 * Shared framing. Two things matter here:
 *  - the protocol context, so the model reasons about hardware escrow rather
 *    than generic crowdfunding;
 *  - "never promise returns", so generated copy stays on the compliant side of
 *    the line the risk-disclosure screens set up.
 */
const BASE_SYSTEM = `You are the structuring assistant inside ProtoRWA, a protocol that tokenizes
physical hardware products into escrow-backed on-chain claims.

How the protocol works:
- A founder raises capital against a hardware build, in exchange for claim units.
- Capital is held in escrow and released milestone by milestone.
- Claim holders vote on founder-submitted production evidence before each release.
- Claims are tradeable on a secondary market.

Rules:
- Be concrete and specific to hardware manufacturing. No generic startup filler.
- Never promise, imply, or forecast financial returns. This is not investment advice.
- Never invent audited figures, certifications, or partner names.
- Prefer plain language a manufacturing engineer would respect.
- Output JSON only when asked for JSON.`;

export interface AiTaskDefinition<T> {
  system: string;
  schema: z.ZodType<T>;
  /** Label used in error messages and logs. */
  label: string;
  /**
   * Output token budget for this task, sized to its schema.
   *
   * This matters: a single shared budget of 1400 truncated the `description`
   * task mid-string (it must emit a tagline plus 120-400 words plus highlights),
   * producing invalid JSON. A truncated response is indistinguishable from a
   * malformed one at parse time, so the budget has to match the expected output.
   */
  maxTokens: number;
}

export const aiTasks = {
  description: {
    label: 'project copy',
    system: `${BASE_SYSTEM}

Task: write the public-facing copy for a hardware project page.
Return JSON: { "tagline": string (<=140 chars), "description": string (markdown, 120-400 words),
"highlights": string[] (3-6 short bullet claims about the product, not the raise) }`,
    schema: descriptionSchema,
    // tagline + up to 2400 chars of prose + highlights, with headroom.
    maxTokens: 3_000,
  } satisfies AiTaskDefinition<ProjectCopy>,

  milestones: {
    label: 'milestone plan',
    system: `${BASE_SYSTEM}

Task: propose a milestone schedule that maps to how hardware is actually built
(tooling/DFM, first article, pilot batch, production, QA, fulfilment).
Each milestone unlocks a tranche of escrow.

Return JSON: { "milestones": [ { "title": string, "description": string,
"trancheBps": integer (basis points of total raise, all trancheBps must sum to 10000),
"durationDays": integer } ] } with 3-5 milestones, ordered by execution.`,
    schema: milestonePlanSchema,
    // Up to 6 milestones, each with a description.
    maxTokens: 2_500,
  } satisfies AiTaskDefinition<MilestonePlan>,

  tokenomics: {
    label: 'tokenomics',
    system: `${BASE_SYSTEM}

Task: suggest a claim price, total claim supply, and raise target that are
internally consistent (price * totalClaims should approximate target).
Frame numbers in ETH unless told otherwise.

Return JSON: { "claimPrice": string, "totalClaims": string, "target": string,
"notes": string (explain the trade-offs of this structure in <=120 words) }`,
    schema: tokenomicsSuggestionSchema,
    // Small structured payload.
    maxTokens: 1_200,
  } satisfies AiTaskDefinition<TokenomicsSuggestion>,

  risk: {
    label: 'risk notes',
    system: `${BASE_SYSTEM}

Task: identify the genuine production and delivery risks a claim holder should
know before committing. Be specific to this project and candid - this backs the
protocol's risk disclosure, so an under-stated list is a failure.

Return JSON: { "risks": [ { "severity": "LOW"|"MEDIUM"|"HIGH", "category": string,
"note": string, "mitigation": string } ] } with 3-5 entries.`,
    schema: riskNotesSchema,
    // Up to 6 risks x (note 500) + (mitigation 500) chars.
    maxTokens: 2_500,
  } satisfies AiTaskDefinition<RiskNotes>,
} as const;

export type AiTaskName = keyof typeof aiTasks;

/** True when `name` is a task the AI layer implements. */
export function isAiTaskName(name: string): name is AiTaskName {
  return Object.prototype.hasOwnProperty.call(aiTasks, name);
}

/**
 * Extracts a JSON object from a model response.
 *
 * Models sometimes wrap JSON in prose or fenced code blocks, so this trims to
 * the outermost braces before parsing rather than trusting the raw string.
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const slice = start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;

  return JSON.parse(slice);
}
