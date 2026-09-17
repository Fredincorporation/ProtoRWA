'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { AiAssistButton, RiskNotesList } from '@/components/studio/ai-assist-button';
import {
  Field,
  FormSection,
  Select,
  TextArea,
  TextInput,
} from '@/components/studio/form-primitives';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  defaultMilestones,
  emptyDraft,
  impliedRaise,
  projectDraftSchema,
  type ProjectDraft,
} from '@/lib/studio/schema';
import { categoryMap, projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { IndustryCategory } from '@protorwa/shared';

/**
 * Founder Studio wizard (/studio/new).
 *
 * Three steps that map onto the contract calls:
 *   1 Basics     -> createProject()
 *   2 Raise      -> fields of CreateProjectParams
 *   3 Milestones -> setMilestones(), then openFunding()
 *
 * The final action is deliberately a *review* screen plus a disabled submit: the
 * on-chain write path needs a deployed registry and a connected wallet, and it
 * would be misleading to render a button that appears to raise capital when
 * nothing is deployed. The exact calldata the submit would send is shown instead,
 * so the wizard is verifiably correct without pretending to be live.
 */

const steps = [
  { id: 1, label: 'Hardware Basics', icon: 'inventory_2' },
  { id: 2, label: 'Raise Structure', icon: 'savings' },
  { id: 3, label: 'Milestone Schedule', icon: 'checklist' },
] as const;

type StepId = (typeof steps)[number]['id'];

export function FounderWizard() {
  const [step, setStep] = React.useState<StepId>(1);
  const [riskNotes, setRiskNotes] = React.useState<
    Array<{ severity: string; category: string; note: string; mitigation: string }>
  >([]);

  const form = useForm<ProjectDraft>({
    resolver: zodResolver(projectDraftSchema),
    defaultValues: emptyDraft(),
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = form;

  const milestonesArray = useFieldArray({ control: form.control, name: 'milestones' });

  const draft = watch();
  const raise = impliedRaise(draft);

  /** Validates only the fields owned by a step before advancing. */
  const fieldsByStep: Record<StepId, Array<keyof ProjectDraft>> = {
    1: ['title', 'tagline', 'category', 'manufacturingLocation', 'description'],
    2: ['targetEth', 'claimPriceEth', 'totalClaims', 'fundingWindowDays'],
    3: ['milestones'],
  };

  const goNext = async () => {
    const valid = await trigger(fieldsByStep[step]);
    if (!valid) {
      toast.error('Fix the highlighted fields before continuing');
      return;
    }
    setStep((current) => Math.min(3, current + 1) as StepId);
  };

  const goBack = () => setStep((current) => Math.max(1, current - 1) as StepId);

  /**
   * Builds the calldata the contract call would use, so the review step shows
   * something real rather than a summary that could drift from the contracts.
   */
  const calldata = React.useMemo(() => {
    const toWei = (value: string): string => {
      const [whole, fraction = ''] = value.split('.');
      const padded = (fraction + '0'.repeat(18)).slice(0, 18);
      return (BigInt(whole ?? '0') * 10n ** 18n + BigInt(padded || '0')).toString();
    };

    const target = toWei(draft.targetEth || '0');
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      createProject: {
        title: draft.title,
        tagline: draft.tagline,
        metadataCid: 'ipfs://<uploaded-metadata>',
        coverCid: 'ipfs://<uploaded-cover>',
        target,
        claimPrice: toWei(draft.claimPriceEth || '0'),
        totalClaims: draft.totalClaims,
        fundingDeadline: nowSeconds + (draft.fundingWindowDays || 0) * 86_400,
      },
      setMilestones: (draft.milestones ?? []).map((milestone) => ({
        title: milestone.title,
        description: milestone.description,
        trancheAmount: toWei(milestone.trancheEth),
        approvalThresholdBps: (milestone.approvalThresholdPct ?? 60) * 100,
        quorumBps: (milestone.quorumPct ?? 25) * 100,
        votingPeriodSeconds: (milestone.votingPeriodDays ?? 7) * 86_400,
      })),
    };
  }, [draft]);

  const onSubmit = async (values: ProjectDraft) => {
    // Intentionally does not broadcast: no registry is deployed and no wallet is
    // connected in this demo, so a "success" would be a lie. The validated draft
    // is surfaced instead so it can be inspected or handed to a deploy script.
    toast.info('Draft validated', {
      description:
        'Contracts are not deployed on this network, so nothing was submitted. The calldata below is what would be sent.',
    });
    // eslint-disable-next-line no-console
    console.info('[studio] validated project draft', values, calldata);
  };

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-[220px_1fr] lg:px-margin">
      {/* Step rail */}
      <nav aria-label="Wizard steps" className="lg:sticky lg:top-24 lg:self-start">
        {/*
         * A vertical list on large screens and a horizontal scroller on small
         * ones. `flex` is explicit here: relying on `lg:flex-col` alone left the
         * items in block flow, which indented steps 2 and 3 under step 1.
         */}
        <ol className="flex gap-space-sm overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {steps.map((item) => {
            const active = step === item.id;
            const complete = step > item.id;
            return (
              <li key={item.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setStep(item.id)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-space-sm rounded px-space-sm py-2 text-left font-mono text-label-md transition-colors',
                    active
                      ? 'bg-surface-container-high text-primary'
                      : complete
                        ? 'text-on-surface'
                        : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full text-label-sm',
                      active
                        ? 'bg-primary text-on-primary'
                        : complete
                          ? 'bg-primary/20 text-primary'
                          : 'bg-surface-container text-outline',
                    )}
                  >
                    {complete ? <Icon name="check" size={13} /> : item.id}
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form onSubmit={handleSubmit(onSubmit)} className="flex-col gap-space-md">
        {/* STEP 1 */}
        {step === 1 ? (
          <FormSection
            title="Hardware basics"
            description="What is being built, and where. This becomes the public project page."
          >
            <Field label="Product name" error={errors.title?.message}>
              {(props) => (
                <TextInput {...props} {...register('title')} placeholder="e.g. HelioFrost Pro" />
              )}
            </Field>

            <Field
              label="One-line summary"
              error={errors.tagline?.message}
              hint="Shown on project cards. Lead with what it does, not how it is funded."
            >
              {(props) => (
                <TextInput
                  {...props}
                  {...register('tagline')}
                  placeholder="e.g. Off-grid solar cold-chain refrigeration"
                />
              )}
            </Field>

            <div className="grid-cols-1 gap-space-md md:grid-cols-2">
              <Field label="Category" error={errors.category?.message}>
                {(props) => (
                  <Select {...props} {...register('category')}>
                    {(Object.keys(categoryMap) as IndustryCategory[]).map((key) => (
                      <option key={key} value={key}>
                        {categoryMap[key].label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Manufacturing location"
                error={errors.manufacturingLocation?.message}
                hint="Backers check this against the milestone evidence."
              >
                {(props) => (
                  <TextInput
                    {...props}
                    {...register('manufacturingLocation')}
                    placeholder="e.g. Kaohsiung, TW"
                  />
                )}
              </Field>
            </div>

            <Field
              label="Full description"
              error={errors.description?.message}
              hint="Markdown supported. Describe the build, not projected returns."
              action={
                <AiAssistButton<{ tagline: string; description: string; highlights: string[] }>
                  task="description"
                  label="Draft with AI"
                  prompt={`Write project copy for a hardware project named "${getValues('title') || 'the product'}" in the ${getValues('category')} category, built at ${getValues('manufacturingLocation') || 'an unspecified facility'}.`}
                  context={{
                    title: getValues('title'),
                    category: getValues('category'),
                    location: getValues('manufacturingLocation'),
                  }}
                  onApply={(data) => {
                    if (data.tagline) setValue('tagline', data.tagline, { shouldValidate: true });
                    if (data.description)
                      setValue('description', data.description, { shouldValidate: true });
                    toast.success('Copy drafted', {
                      description: 'Edit it before publishing — the model can be wrong.',
                    });
                  }}
                />
              }
            >
              {(props) => (
                <TextArea
                  {...props}
                  {...register('description')}
                  rows={8}
                  placeholder="What problem does this hardware solve? What is the bill of materials? What has been built so far?"
                />
              )}
            </Field>
          </FormSection>
        ) : null}

        {/* STEP 2 */}
        {step === 2 ? (
          <FormSection
            title="Raise structure"
            description="Claims are sold at a fixed price. The contracts require target, price and supply to be positive, and the deadline to be in the future."
          >
            <div className="grid-cols-1 gap-space-md md:grid-cols-3">
              <Field
                label="Raise target (ETH)"
                error={errors.targetEth?.message}
                hint="Must equal the sum of milestone tranches."
              >
                {(props) => <TextInput {...props} {...register('targetEth')} inputMode="decimal" />}
              </Field>

              <Field label="Claim price (ETH)" error={errors.claimPriceEth?.message}>
                {(props) => (
                  <TextInput {...props} {...register('claimPriceEth')} inputMode="decimal" />
                )}
              </Field>

              <Field label="Total claims" error={errors.totalClaims?.message}>
                {(props) => (
                  <TextInput {...props} {...register('totalClaims')} inputMode="numeric" />
                )}
              </Field>
            </div>

            <Field
              label="Funding window (days)"
              error={errors.fundingWindowDays?.message}
              hint="Commits are rejected after this deadline; funding then settles automatically."
            >
              {(props) => (
                <TextInput {...props} {...register('fundingWindowDays')} inputMode="numeric" />
              )}
            </Field>

            {/* Internal consistency check: legal but usually a mistake. */}
            <div
              className={cn(
                'grid-cols-[auto_1fr] gap-space-sm rounded border p-space-sm font-mono text-label-sm',
                raise.mismatch
                  ? 'border-tertiary/40 bg-tertiary/5'
                  : 'border-outline-variant/40 bg-surface-container-lowest',
              )}
            >
              <Icon
                name={raise.mismatch ? 'warning' : 'info'}
                size={18}
                className={raise.mismatch ? 'text-tertiary' : 'text-outline'}
              />
              <div className={raise.mismatch ? 'text-tertiary' : 'text-on-surface-variant'}>
                Price × supply = <span className="tabular">{raise.implied.toFixed(4)} ETH</span>{' '}
                against a target of <span className="tabular">{raise.target} ETH</span>.
                {raise.mismatch
                  ? ' These differ. That is allowed, but if supply sells out you will raise a different amount than the target.'
                  : ' Consistent with the target.'}
              </div>
            </div>
          </FormSection>
        ) : null}

        {/* STEP 3 */}
        {step === 3 ? (
          <FormSection
            title="Milestone schedule"
            description="Each milestone releases one tranche, only after claim holders approve the founder's evidence. Tranches must total the raise target exactly."
          >
            <div className="flex-wrap items-center justify-between gap-space-sm">
              <AiAssistButton<{
                milestones: Array<{
                  title: string;
                  description: string;
                  trancheBps: number;
                  durationDays: number;
                }>;
              }>
                task="milestones"
                label="Suggest schedule with AI"
                prompt={`Propose a 3-5 milestone production schedule for: ${getValues('description')?.slice(0, 400) || getValues('tagline') || 'a hardware build'}. Total raise is ${getValues('targetEth')} ETH.`}
                context={{ target: getValues('targetEth'), category: getValues('category') }}
                onApply={(data) => {
                  if (!data.milestones?.length) return;
                  // Convert basis-point shares back into absolute ETH tranches so
                  // the total matches the target exactly.
                  const target = Number(getValues('targetEth')) || 0;
                  const converted = data.milestones.map((milestone, index, all) => {
                    const isLast = index === all.length - 1;
                    const share = milestone.trancheBps / 10_000;
                    return {
                      title: milestone.title.slice(0, 120),
                      description: milestone.description.slice(0, 600),
                      // Last milestone absorbs rounding so the sum is exact.
                      trancheEth: isLast
                        ? remainingTranche(target, all, index)
                        : (target * share).toFixed(4),
                      durationDays: Math.min(365, Math.max(7, milestone.durationDays)),
                      approvalThresholdPct: 60,
                      quorumPct: 25,
                      votingPeriodDays: 7,
                    };
                  });
                  milestonesArray.replace(converted);
                  toast.success('Schedule suggested', {
                    description: 'Tranches were rescaled to total your raise target. Review each one.',
                  });
                }}
              />
              <span className="font-mono text-label-sm text-outline">
                {milestonesArray.fields.length} milestones
              </span>
            </div>

            {errors.milestones?.message ? (
              <p className="rounded border-error/40 bg-error/5 p-space-sm font-mono text-label-sm text-error" role="alert">
                {errors.milestones.message}
              </p>
            ) : null}

            <ul className="flex-col gap-space-md">
              {milestonesArray.fields.map((field, index) => {
                const milestoneErrors = errors.milestones?.[index];
                return (
                  <li
                    key={field.id}
                    className="flex-col gap-space-sm rounded border-outline-variant/40 bg-surface-container-lowest p-space-sm"
                  >
                    <div className="flex-wrap items-center justify-between gap-space-sm">
                      <span className="font-mono text-label-md uppercase tracking-wider text-primary">
                        Milestone {String(index + 1).padStart(2, '0')}
                      </span>
                      {milestonesArray.fields.length > 2 ? (
                        <button
                          type="button"
                          onClick={() => milestonesArray.remove(index)}
                          className="inline-flex items-center gap-1 font-mono text-label-sm text-on-surface-variant transition-colors hover:text-error"
                        >
                          <Icon name="delete" size={14} />
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <Field label="Title" error={milestoneErrors?.title?.message}>
                      {(props) => (
                        <TextInput {...props} {...register(`milestones.${index}.title`)} />
                      )}
                    </Field>

                    <Field
                      label="What it proves"
                      error={milestoneErrors?.description?.message}
                    >
                      {(props) => (
                        <TextArea
                          {...props}
                          {...register(`milestones.${index}.description`)}
                          rows={2}
                        />
                      )}
                    </Field>

                    <div className="grid-cols-2 gap-space-sm lg:grid-cols-5">
                      <Field label="Tranche (ETH)" error={milestoneErrors?.trancheEth?.message}>
                        {(props) => (
                          <TextInput
                            {...props}
                            {...register(`milestones.${index}.trancheEth`)}
                            inputMode="decimal"
                          />
                        )}
                      </Field>
                      <Field label="Due in (days)" error={milestoneErrors?.durationDays?.message}>
                        {(props) => (
                          <TextInput
                            {...props}
                            {...register(`milestones.${index}.durationDays`)}
                            inputMode="numeric"
                          />
                        )}
                      </Field>
                      <Field label="Approval %" error={milestoneErrors?.approvalThresholdPct?.message}>
                        {(props) => (
                          <TextInput
                            {...props}
                            {...register(`milestones.${index}.approvalThresholdPct`)}
                            inputMode="numeric"
                          />
                        )}
                      </Field>
                      <Field label="Quorum %" error={milestoneErrors?.quorumPct?.message}>
                        {(props) => (
                          <TextInput
                            {...props}
                            {...register(`milestones.${index}.quorumPct`)}
                            inputMode="numeric"
                          />
                        )}
                      </Field>
                      <Field label="Vote window (days)" error={milestoneErrors?.votingPeriodDays?.message}>
                        {(props) => (
                          <TextInput
                            {...props}
                            {...register(`milestones.${index}.votingPeriodDays`)}
                            inputMode="numeric"
                          />
                        )}
                      </Field>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex-wrap items-center justify-between gap-space-sm">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => milestonesArray.append(defaultMilestones()[0]!)}
                disabled={milestonesArray.fields.length >= 12}
              >
                <Icon name="add" size={16} />
                Add milestone
              </Button>

              <TrancheTotal draft={draft} />
            </div>
          </FormSection>
        ) : null}

        {/* Risk notes: generated on demand, never auto-applied to the project. */}
        {step === 3 ? (
          <FormSection
            title="Risk disclosure"
            description="The protocol asks founders to disclose production risk honestly. Generate a draft, then edit it — you are responsible for what it says."
          >
            <AiAssistButton<{
              risks: Array<{ severity: string; category: string; note: string; mitigation: string }>;
            }>
              task="risk"
              label="Draft risk notes with AI"
              prompt={`Identify genuine production and delivery risks for: ${getValues('description')?.slice(0, 400) || getValues('tagline') || 'a hardware build'}.`}
              context={{ target: getValues('targetEth'), location: getValues('manufacturingLocation') }}
              onApply={(data) => {
                setRiskNotes(data.risks ?? []);
                toast.success('Risk notes drafted', {
                  description: 'These are a starting point, not a complete disclosure.',
                });
              }}
            />

            {riskNotes.length > 0 ? (
              <RiskNotesList notes={riskNotes} />
            ) : (
              <p className="rounded border-dashed border-outline-variant/40 bg-surface-container-lowest p-space-md text-center font-mono text-label-sm text-outline">
                No risk notes yet.
              </p>
            )}
          </FormSection>
        ) : null}

        {/* Review: shows the exact calldata the contract calls would carry. */}
        {step === 3 ? (
          <FormSection
            title="Review and submit"
            description="Submitting calls createProject(), then setMilestones(), then openFunding(). Nothing is broadcast until contracts are deployed and a wallet is connected."
          >
            <pre className="overflow-x-auto rounded border-outline-variant/40 bg-surface-container-lowest p-space-sm font-mono text-label-sm text-on-surface-variant">
              {JSON.stringify(calldata, null, 2)}
            </pre>

            <div className="flex-wrap items-center justify-between gap-space-sm">
              <p className="flex items-center gap-2 font-mono text-label-sm text-outline">
                <Icon name="info" size={16} />
                Preview only — no transaction will be sent.
              </p>
              <Button type="submit" disabled={isSubmitting}>
                <Icon name="rocket_launch" size={18} />
                Validate draft
              </Button>
            </div>
          </FormSection>
        ) : null}

        {/*
         * Step navigation. A 3-column grid rather than `justify-between`: with
         * flex the middle label was squeezed behind the Continue button when the
         * Back button was hidden on step 1.
         */}
        <div className="grid-cols-[1fr_auto_1fr] items-center gap-space-sm">
          <div className="justify-self-start">
            {/* `invisible` would still reserve width and unbalance the row, so the
                button is omitted entirely on the first step. */}
            {step > 1 ? (
              <Button type="button" variant="ghost" onClick={goBack}>
                <Icon name="arrow_back" size={18} />
                Back
              </Button>
            ) : null}
          </div>

          <span className="justify-self-center whitespace-nowrap font-mono text-label-sm text-outline">
            Step {step} of {steps.length}
          </span>

          <div className="justify-self-end">
            {step < 3 ? (
              <Button type="button" onClick={goNext}>
                Continue
                <Icon name="arrow_forward" size={18} />
              </Button>
            ) : (
              <span className="font-mono text-label-sm text-outline">Review complete</span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/** Sums tranche values for the total row, in integer wei. */
function TrancheTotal({ draft }: { draft: ProjectDraft }) {
  const toWei = (value: string): bigint => {
    if (!value) return 0n;
    const [whole, fraction = ''] = value.split('.');
    const padded = (fraction + '0'.repeat(18)).slice(0, 18);
    try {
      return BigInt(whole ?? '0') * 10n ** 18n + BigInt(padded || '0');
    } catch {
      return 0n;
    }
  };

  const total = (draft.milestones ?? []).reduce(
    (acc, milestone) => acc + toWei(milestone?.trancheEth ?? '0'),
    0n,
  );
  const target = toWei(draft.targetEth ?? '0');
  const matches = total === target;

  return (
    <span
      className={cn(
        'font-mono text-label-sm',
        matches ? 'text-primary' : 'text-tertiary',
      )}
    >
      Tranches: {(Number(total) / 1e18).toFixed(4)} / {(Number(target) / 1e18).toFixed(4)} ETH
      {matches ? ' — matches target' : ' — must match target'}
    </span>
  );
}

/** Computes the final tranche so the schedule sums to the target exactly. */
function remainingTranche(
  target: number,
  all: Array<{ trancheBps: number }>,
  lastIndex: number,
): string {
  const priorShare = all
    .slice(0, lastIndex)
    .reduce((acc, milestone) => acc + milestone.trancheBps / 10_000, 0);
  const remaining = target * (1 - priorShare);
  return Math.max(0, remaining).toFixed(4);
}

/** Exported for the studio landing page to link into. */
export const studioStatus = projectStatus('DRAFT');
