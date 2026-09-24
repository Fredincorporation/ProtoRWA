'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { parseEventLogs } from 'viem';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import { AiAssistButton, RiskNotesList } from '@/components/studio/ai-assist-button';
import {
  CoverImageField,
  GalleryField,
  PitchVideoField,
} from '@/components/studio/media-fields';
import {
  Field,
  FormSection,
  Select,
  TextArea,
  TextInput,
} from '@/components/studio/form-primitives';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ipfsRef, pinProjectMetadata } from '@/lib/ipfs';
import {
  defaultMilestones,
  emptyDraft,
  impliedRaise,
  projectDraftSchema,
  type ProjectDraft,
} from '@/lib/studio/schema';
import { protocolChain } from '@/lib/wagmi';
import { categoryMap, projectStatus } from '@/lib/status';
import { cn } from '@/lib/utils';
import {
  getContracts,
  protocolAddressUrl,
  protocolTxUrl,
  projectRegistryAbi,
  type IndustryCategory,
} from '@protorwa/shared';

/**
 * Founder Studio wizard (/studio/new).
 *
 * Four steps that map onto the contract calls:
 *   1 Basics     -> title/tagline/description, folded into the metadata JSON
 *   2 Media      -> cover, gallery and the mandatory pitch video, pinned to IPFS
 *   3 Raise      -> fields of CreateProjectParams
 *   4 Milestones -> setMilestones(), then openFunding()
 *
 * Publishing runs createProject -> setMilestones -> openFunding in sequence on
 * the protocol chain, so it is gated on a connected wallet sitting on that chain
 * and a deployed registry. Amounts are USDG (6-decimal base units); gas is the
 * chain's native asset.
 */

const steps = [
  { id: 1, label: 'Hardware Basics', icon: 'inventory_2' },
  { id: 2, label: 'Project Media', icon: 'perm_media' },
  { id: 3, label: 'Raise Structure', icon: 'savings' },
  { id: 4, label: 'Milestone Schedule', icon: 'checklist' },
] as const;

type StepId = (typeof steps)[number]['id'];
const LAST_STEP: StepId = 4;

/** Decimal USDG string -> 6-decimal base-unit integer as a bigint. */
function toUsdgBase(value: string): bigint {
  const [whole, fraction = ''] = (value ?? '0').split('.');
  const padded = (fraction + '0'.repeat(6)).slice(0, 6);
  return BigInt(whole || '0') * 10n ** 6n + BigInt(padded || '0');
}

/** A project's registry address on the protocol chain, when deployed. */
const REGISTRY_ADDRESS = getContracts(protocolChain.id).projectRegistry as
  | `0x${string}`
  | undefined;

/** One publish run: which contract step it is on and the tx hashes so far. */
type PublishPhase =
  | 'idle'
  | 'pinning'
  | 'creating'
  | 'scheduling'
  | 'opening'
  | 'done';

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
    formState: { errors },
  } = form;

  const milestonesArray = useFieldArray({ control: form.control, name: 'milestones' });

  const draft = watch();
  const raise = impliedRaise(draft);

  /** Validates only the fields owned by a step before advancing. */
  const fieldsByStep: Record<StepId, Array<keyof ProjectDraft>> = {
    1: ['title', 'tagline', 'category', 'manufacturingLocation', 'description'],
    2: ['coverCid', 'galleryCids', 'pitchVideoCid'],
    3: ['targetEth', 'claimPriceEth', 'totalClaims', 'fundingWindowDays'],
    4: ['milestones'],
  };

  const goNext = async () => {
    const valid = await trigger(fieldsByStep[step]);
    if (!valid) {
      toast.error('Fix the highlighted fields before continuing');
      return;
    }
    setStep((current) => Math.min(LAST_STEP, current + 1) as StepId);
  };

  const goBack = () => setStep((current) => Math.max(1, current - 1) as StepId);

  /* ------------------------------------------------------------------ *
   * On-chain publish
   * ------------------------------------------------------------------ */
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: protocolChain.id });

  const [phase, setPhase] = React.useState<PublishPhase>('idle');
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [txHashes, setTxHashes] = React.useState<{
    create?: `0x${string}`;
    milestones?: `0x${string}`;
    funding?: `0x${string}`;
  }>({});
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const onProtocolChain = chainId === protocolChain.id;
  const canPublish = Boolean(
    isConnected && REGISTRY_ADDRESS && onProtocolChain && publicClient,
  );
  const publishing = phase !== 'idle' && phase !== 'done';

  /** Records a tx hash and waits for it to mine, returning the receipt. */
  const sendAndConfirm = async (
    write: { functionName: 'createProject' | 'setMilestones' | 'openFunding'; args: readonly unknown[] },
    slot: keyof typeof txHashes,
  ) => {
    if (!REGISTRY_ADDRESS || !publicClient) throw new Error('Registry not available');
    const hash = await writeContractAsync({
      address: REGISTRY_ADDRESS,
      abi: projectRegistryAbi,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      functionName: write.functionName as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: write.args as any,
      chainId: protocolChain.id,
    });
    setTxHashes((current) => ({ ...current, [slot]: hash }));
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(`${write.functionName} reverted on-chain`);
    }
    return receipt;
  };

  const publish = async (values: ProjectDraft) => {
    setPublishError(null);
    setProjectId(null);
    setTxHashes({});

    if (!canPublish) {
      setPublishError('Connect a wallet on the protocol network before publishing.');
      return;
    }

    const fundingDeadline = Math.floor(Date.now() / 1000) + values.fundingWindowDays * 86_400;
    const milestones = values.milestones.map((milestone) => ({
      title: milestone.title,
      description: milestone.description,
      trancheAmount: toUsdgBase(milestone.trancheEth),
      dueAt: fundingDeadline + milestone.durationDays * 86_400,
      votingPeriodSeconds: milestone.votingPeriodDays * 86_400,
      approvalThresholdBps: milestone.approvalThresholdPct * 100,
      quorumBps: milestone.quorumPct * 100,
      status: 0,
    }));

    try {
      // 0. Pin the metadata document; its CID is stored on-chain.
      setPhase('pinning');
      const { cid: metadataCid } = await pinProjectMetadata({
        name: values.title,
        description: values.description,
        image: values.coverCid ? ipfsRef(values.coverCid) : null,
        gallery: values.galleryCids.map(ipfsRef),
        video: values.pitchVideoCid ? ipfsRef(values.pitchVideoCid) : null,
      });

      // 1. createProject -> recover projectId from the ProjectCreated event.
      setPhase('creating');
      const createReceipt = await sendAndConfirm(
        {
          functionName: 'createProject',
          args: [
            {
              title: values.title,
              tagline: values.tagline,
              metadataCid,
              coverCid: values.coverCid,
              target: toUsdgBase(values.targetEth),
              claimPrice: toUsdgBase(values.claimPriceEth),
              totalClaims: BigInt(values.totalClaims),
              fundingDeadline,
            },
          ],
        },
        'create',
      );
      const created = parseEventLogs({
        abi: projectRegistryAbi,
        eventName: 'ProjectCreated',
        logs: createReceipt.logs,
      });
      const onChainId = created[created.length - 1]?.args.projectId;
      if (onChainId === undefined) throw new Error('ProjectCreated event not found in the receipt');
      setProjectId(onChainId.toString());

      // 2. setMilestones for the freshly created project.
      setPhase('scheduling');
      await sendAndConfirm(
        { functionName: 'setMilestones', args: [onChainId, milestones] },
        'milestones',
      );

      // 3. openFunding so backers can commit.
      setPhase('opening');
      await sendAndConfirm({ functionName: 'openFunding', args: [onChainId] }, 'funding');

      setPhase('done');
      toast.success('Project published', {
        description: `#${onChainId} is now raising on ${protocolChain.name}.`,
      });
    } catch (error) {
      setPhase('idle');
      const message = error instanceof Error ? error.message : 'Unknown error';
      const rejected = /user rejected|rejected|denied|cancelled/i.test(message);
      setPublishError(rejected ? 'Publishing cancelled in the wallet.' : message);
    }
  };

  const onSubmit = handleSubmit((values) => {
    void publish(values);
  });

  const switchToProtocolChain = async () => {
    try {
      await switchChainAsync({ chainId: protocolChain.id });
    } catch {
      setPublishError(`Could not switch to ${protocolChain.name}. Switch it in your wallet.`);
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-[220px_1fr] lg:px-margin">
      {/* Step rail */}
      <nav aria-label="Wizard steps" className="lg:sticky lg:top-24 lg:self-start">
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

      <form onSubmit={onSubmit} className="flex-col gap-space-md">
        {/* STEP 1 — basics */}
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

        {/* STEP 2 — media */}
        {step === 2 ? (
          <FormSection
            title="Project media"
            description="Backers judge a hardware raise by what they can see. The pitch video is required; the cover and photos render on the public project page."
          >
            <PitchVideoField
              value={draft.pitchVideoCid}
              error={errors.pitchVideoCid?.message}
              onChange={(cid) => setValue('pitchVideoCid', cid, { shouldValidate: true })}
            />

            <div className="grid-cols-1 gap-space-md lg:grid-cols-2">
              <CoverImageField
                value={draft.coverCid}
                error={errors.coverCid?.message}
                onChange={(cid) => setValue('coverCid', cid, { shouldValidate: true })}
              />
              <GalleryField
                value={draft.galleryCids}
                error={errors.galleryCids?.message}
                onChange={(cids) => setValue('galleryCids', cids, { shouldValidate: true })}
              />
            </div>
          </FormSection>
        ) : null}

        {/* STEP 3 — raise */}
        {step === 3 ? (
          <FormSection
            title="Raise structure"
            description="Claims are sold at a fixed USDG price. The contracts require target, price and supply to be positive, and the deadline to be in the future."
          >
            <div className="grid-cols-1 gap-space-md md:grid-cols-3">
              <Field
                label="Raise target (USDG)"
                error={errors.targetEth?.message}
                hint="Must equal the sum of milestone tranches."
              >
                {(props) => <TextInput {...props} {...register('targetEth')} inputMode="decimal" />}
              </Field>

              <Field label="Claim price (USDG)" error={errors.claimPriceEth?.message}>
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
                Price × supply = <span className="tabular">{raise.implied.toFixed(2)} USDG</span>{' '}
                against a target of <span className="tabular">{raise.target} USDG</span>.
                {raise.mismatch
                  ? ' These differ. That is allowed, but if supply sells out you will raise a different amount than the target.'
                  : ' Consistent with the target.'}
              </div>
            </div>
          </FormSection>
        ) : null}

        {/* STEP 4 — milestones */}
        {step === 4 ? (
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
                prompt={`Propose a 3-5 milestone production schedule for: ${getValues('description')?.slice(0, 400) || getValues('tagline') || 'a hardware build'}. Total raise is ${getValues('targetEth')} USDG.`}
                context={{ target: getValues('targetEth'), category: getValues('category') }}
                onApply={(data) => {
                  if (!data.milestones?.length) return;
                  // Convert basis-point shares back into absolute USDG tranches so
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

            <AllocationBar draft={draft} />

            <ul className="flex-col gap-space-md">
              {milestonesArray.fields.map((field, index) => {
                const milestoneErrors = errors.milestones?.[index];
                const milestone = draft.milestones?.[index];
                const share = trancheShare(draft, milestone?.trancheEth);
                const dueLabel = dueDateLabel(draft, milestone?.durationDays);
                return (
                  <li
                    key={field.id}
                    className="flex-col gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container-lowest p-space-md"
                  >
                    {/* Header: index, live tranche share, and edit controls. */}
                    <div className="flex-wrap items-center justify-between gap-space-sm">
                      <div className="flex items-center gap-space-sm">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-label-sm text-primary">
                          {index + 1}
                        </span>
                        <span className="font-mono text-label-md uppercase tracking-wider text-on-surface">
                          Milestone {String(index + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-label-xs tabular',
                            share === null
                              ? 'bg-surface-container text-outline'
                              : 'bg-primary/10 text-primary',
                          )}
                        >
                          {share === null ? '—% of raise' : `${share.toFixed(1)}% of raise`}
                        </span>
                        {dueLabel ? (
                          <span className="hidden font-mono text-label-xs text-outline sm:inline">
                            due {dueLabel}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => milestonesArray.move(index, index - 1)}
                          disabled={index === 0}
                          aria-label="Move milestone earlier"
                          className="rounded border border-outline-variant/50 p-1 text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Icon name="arrow_upward" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => milestonesArray.move(index, index + 1)}
                          disabled={index === milestonesArray.fields.length - 1}
                          aria-label="Move milestone later"
                          className="rounded border border-outline-variant/50 p-1 text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Icon name="arrow_downward" size={14} />
                        </button>
                        {milestonesArray.fields.length > 2 ? (
                          <button
                            type="button"
                            onClick={() => milestonesArray.remove(index)}
                            aria-label="Remove milestone"
                            className="ml-1 inline-flex items-center gap-1 rounded border border-outline-variant/50 px-1.5 py-1 font-mono text-label-sm text-on-surface-variant transition-colors hover:border-error hover:text-error"
                          >
                            <Icon name="delete" size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Tranche share bar: this milestone's slice of the raise target. */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, share ?? 0)}%` }}
                      />
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
                      <Field label="Tranche (USDG)" error={milestoneErrors?.trancheEth?.message}>
                        {(props) => (
                          <TextInput
                            {...props}
                            {...register(`milestones.${index}.trancheEth`)}
                            inputMode="decimal"
                          />
                        )}
                      </Field>
                      <Field
                        label="Due date"
                        hint={
                          milestone?.durationDays
                            ? `${milestone.durationDays} days after funding closes`
                            : undefined
                        }
                        error={milestoneErrors?.durationDays?.message}
                      >
                        {(props) => (
                          <TextInput
                            {...props}
                            type="date"
                            value={dueDateValue(draft, milestone?.durationDays)}
                            min={dueDateValue(draft, 7)}
                            max={dueDateValue(draft, 365)}
                            onChange={(event) => {
                              const days = durationDaysFromDueDate(draft, event.target.value);
                              if (days !== null) {
                                setValue(`milestones.${index}.durationDays`, days, {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                });
                              }
                            }}
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

              <span className="font-mono text-label-sm text-outline">
                {milestonesArray.fields.length} / 12 milestones
              </span>
            </div>
          </FormSection>
        ) : null}

        {/* Risk notes: generated on demand, never auto-applied to the project. */}
        {step === 4 ? (
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

        {/* Review & publish: fires the three on-chain calls in sequence. */}
        {step === 4 ? (
          <FormSection
            title="Review and publish"
            description={`Publishing runs createProject, setMilestones then openFunding on ${protocolChain.name}. Amounts settle in USDG (6-decimal base units); the wallet pays gas in the network's native asset.`}
          >
            <PublishReview draft={draft} />

            {!REGISTRY_ADDRESS ? (
              <p className="flex items-center gap-2 rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm text-tertiary">
                <Icon name="cloud_off" size={16} />
                No registry is deployed on {protocolChain.name}. Set its address to enable publishing.
              </p>
            ) : !isConnected ? (
              <p className="flex items-center gap-2 rounded bg-surface-container-lowest p-space-sm font-mono text-label-sm text-on-surface-variant">
                <Icon name="account_balance_wallet" size={16} />
                Connect your {protocolChain.name} wallet to publish.
              </p>
            ) : !onProtocolChain ? (
              <div className="flex flex-wrap items-center justify-between gap-space-sm rounded bg-surface-container-lowest p-space-sm">
                <span className="font-mono text-label-sm text-on-surface-variant">
                  Wallet is on chain {String(chainId)}. Switch to {protocolChain.name} ({protocolChain.id}).
                </span>
                <Button type="button" size="sm" variant="outline" onClick={switchToProtocolChain}>
                  <Icon name="swap_horiz" size={16} />
                  Switch network
                </Button>
              </div>
            ) : null}

            <PublishProgress phase={phase} txHashes={txHashes} />

            {publishError ? (
              <p className="flex items-start gap-2 rounded bg-error/10 p-space-sm font-mono text-label-sm text-error" role="alert">
                <Icon name="error" size={16} className="mt-0.5 shrink-0" />
                {publishError}
              </p>
            ) : null}

            {phase === 'done' && projectId ? (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-space-md">
                <div className="flex items-center gap-2 font-mono text-label-md text-primary">
                  <Icon name="check_circle" size={18} />
                  Project #{projectId} is live and accepting commitments.
                </div>
                <div className="flex flex-wrap items-center gap-space-sm font-mono text-label-sm">
                  {REGISTRY_ADDRESS && (
                    <a
                      href={protocolAddressUrl(REGISTRY_ADDRESS) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline"
                    >
                      <Icon name="open_in_new" size={13} /> Registry
                    </a>
                  )}
                  {txHashes.funding && (
                    <a
                      href={protocolTxUrl(txHashes.funding) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline"
                    >
                      <Icon name="open_in_new" size={13} /> openFunding tx
                    </a>
                  )}
                </div>
                {address && (
                  <p className="font-mono text-label-sm text-outline">
                    The public page appears in Explore once the indexer sees it. Find it as project #{projectId}.
                  </p>
                )}
              </div>
            ) : null}

            <div className="flex-wrap items-center justify-between gap-space-sm">
              <p className="flex items-center gap-2 font-mono text-label-sm text-outline">
                <Icon name="info" size={16} />
                This sends real testnet transactions and cannot be undone.
              </p>
              <Button
                type="submit"
                disabled={!canPublish || publishing || phase === 'done'}
              >
                <Icon
                  name={publishing ? 'pending' : phase === 'done' ? 'check' : 'rocket_launch'}
                  size={18}
                  className={publishing ? 'animate-spin' : ''}
                />
                {phase === 'pinning'
                  ? 'Pinning metadata…'
                  : phase === 'creating'
                    ? 'Confirm createProject…'
                    : phase === 'scheduling'
                      ? 'Confirm setMilestones…'
                      : phase === 'opening'
                        ? 'Confirm openFunding…'
                        : phase === 'done'
                          ? 'Published'
                          : 'Publish on-chain'}
              </Button>
            </div>
          </FormSection>
        ) : null}

        {/*
         * Step navigation. A 3-column grid rather than `justify-between`: with
         * flex the middle label was squeezed behind the Continue button when the
         * Back button was hidden on the first step.
         */}
        <div className="grid-cols-[1fr_auto_1fr] items-center gap-space-sm">
          <div className="justify-self-start">
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
            {step < LAST_STEP ? (
              <Button type="button" onClick={goNext}>
                Continue
                <Icon name="arrow_forward" size={18} />
              </Button>
            ) : (
              <span className="font-mono text-label-sm text-outline">Review below</span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/** Compact summary of what the publish will send, read from the live draft. */
function PublishReview({ draft }: { draft: ProjectDraft }) {
  const rows = [
    { label: 'Title', value: draft.title || '—' },
    { label: 'Target', value: `${draft.targetEth || '0'} USDG` },
    { label: 'Claim price', value: `${draft.claimPriceEth || '0'} USDG` },
    { label: 'Total claims', value: draft.totalClaims || '—' },
    { label: 'Funding window', value: `${draft.fundingWindowDays || 0} days` },
    { label: 'Milestones', value: `${draft.milestones?.length ?? 0}` },
    {
      label: 'Media',
      value: `${draft.coverCid ? 'cover' : 'no cover'} · ${draft.galleryCids?.length ?? 0} photos · ${
        draft.pitchVideoCid ? 'pitch video' : 'no video'
      }`,
    },
  ];

  return (
    <dl className="flex flex-col gap-space-xs rounded border-outline-variant/40 bg-surface-container-lowest p-space-sm font-mono text-label-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-1 last:border-0"
        >
          <dt className="text-on-surface-variant">{row.label}</dt>
          <dd className="text-right text-on-surface">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const PUBLISH_STEPS: Array<{ phase: PublishPhase; label: string }> = [
  { phase: 'pinning', label: 'Pin metadata to IPFS' },
  { phase: 'creating', label: 'createProject' },
  { phase: 'scheduling', label: 'setMilestones' },
  { phase: 'opening', label: 'openFunding' },
];

const PHASE_ORDER: Record<PublishPhase, number> = {
  idle: -1,
  pinning: 0,
  creating: 1,
  scheduling: 2,
  opening: 3,
  done: 4,
};

/** Per-transaction progress for the sequential publish. */
function PublishProgress({
  phase,
  txHashes,
}: {
  phase: PublishPhase;
  txHashes: { create?: `0x${string}`; milestones?: `0x${string}`; funding?: `0x${string}` };
}) {
  if (phase === 'idle') return null;
  const current = PHASE_ORDER[phase];
  // PUBLISH_STEPS is ordered 0..3 and maps onto the three writes after pinning.
  const stepHashes: Array<`0x${string}` | undefined> = [
    undefined,
    txHashes.create,
    txHashes.milestones,
    txHashes.funding,
  ];

  return (
    <ol className="flex flex-col gap-1 rounded border-outline-variant/40 bg-surface-container-lowest p-space-sm font-mono text-label-sm">
      {PUBLISH_STEPS.map((item, index) => {
        const done = index < current;
        const active = index === current;
        const hash = stepHashes[index];
        return (
          <li key={item.phase} className="flex items-center justify-between gap-space-sm">
            <span className={cn('flex items-center gap-2', done ? 'text-primary' : active ? 'text-on-surface' : 'text-outline')}>
              <Icon
                name={done ? 'check_circle' : active ? 'pending' : 'radio_button_unchecked'}
                size={15}
                className={active ? 'animate-spin' : ''}
              />
              {item.label}
            </span>
            {hash ? (
              <a
                href={protocolTxUrl(hash) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                view tx
              </a>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** USDG base units from a decimal string, tolerating empty/partial input. */
function safeUsdg(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return toUsdgBase(value);
  } catch {
    return 0n;
  }
}

function scheduleTotal(draft: ProjectDraft): bigint {
  return (draft.milestones ?? []).reduce((acc, m) => acc + safeUsdg(m?.trancheEth), 0n);
}

/** This milestone's tranche as a percentage of the raise target; null if unset. */
function trancheShare(draft: ProjectDraft, trancheEth: string | undefined): number | null {
  const target = safeUsdg(draft.targetEth);
  if (target <= 0n) return null;
  return (Number(safeUsdg(trancheEth)) / Number(target)) * 100;
}

/** Human due date: funding deadline + this milestone's offset, in days. */
function dueDateLabel(draft: ProjectDraft, durationDays: string | number | undefined): string | null {
  const window = Number(draft.fundingWindowDays);
  const offset = Number(durationDays);
  if (!Number.isFinite(window) || !Number.isFinite(offset)) return null;
  const at = Date.now() + (window + offset) * 86_400_000;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Formats a Date as the `yyyy-mm-dd` value a native date input expects. */
function toInputDate(at: number): string {
  const d = new Date(at);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** The `yyyy-mm-dd` value for a milestone's due date, derived from durationDays. */
function dueDateValue(draft: ProjectDraft, durationDays: string | number | undefined): string {
  const window = Number(draft.fundingWindowDays);
  const offset = Number(durationDays);
  if (!Number.isFinite(window) || !Number.isFinite(offset)) return '';
  return toInputDate(Date.now() + (window + offset) * 86_400_000);
}

/**
 * Inverse of `dueDateValue`: converts a picked calendar date back into the
 * `durationDays` offset (days after funding closes) the contract stores, clamped
 * to the schema's 7–365 range. Returns null for an empty/invalid selection so a
 * cleared input never writes NaN into the form.
 */
function durationDaysFromDueDate(draft: ProjectDraft, dateStr: string): number | null {
  if (!dateStr) return null;
  const window = Number(draft.fundingWindowDays);
  if (!Number.isFinite(window)) return null;
  const picked = new Date(`${dateStr}T00:00:00`).getTime();
  if (!Number.isFinite(picked)) return null;
  const fundingClose = Date.now() + window * 86_400_000;
  const days = Math.round((picked - fundingClose) / 86_400_000);
  return Math.min(365, Math.max(7, days));
}

const ALLOC_COLORS = ['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-primary-fixed', 'bg-secondary/60', 'bg-tertiary/60'];

/**
 * Stacked allocation bar: every tranche as a slice of the raise target, plus the
 * running total against it. Tranches must total the target exactly, so this is the
 * one place the founder can see the whole schedule's balance at a glance.
 */
function AllocationBar({ draft }: { draft: ProjectDraft }) {
  const target = safeUsdg(draft.targetEth);
  const total = scheduleTotal(draft);
  const matches = target > 0n && total === target;
  const over = target > 0n && total > target;
  const segments = (draft.milestones ?? []).map((m) => safeUsdg(m?.trancheEth));
  const denominator = target > 0n ? target : total;

  return (
    <div className="flex-col gap-2 rounded-lg border-outline-variant/40 bg-surface-container-lowest p-space-md">
      <div className="flex-wrap items-center justify-between gap-space-sm">
        <span className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
          Escrow allocation
        </span>
        <span
          className={cn(
            'font-mono text-label-sm tabular',
            matches ? 'text-primary' : over ? 'text-error' : 'text-tertiary',
          )}
        >
          {(Number(total) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} /{' '}
          {(Number(target) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })} USDG
          <span className="ml-1 text-outline">
            {matches ? '— balanced' : over ? '— over target' : '— under target'}
          </span>
        </span>
      </div>

      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container"
        role="img"
        aria-label={`Tranches allocate ${(Number(total) / 1e6).toFixed(0)} of ${(Number(target) / 1e6).toFixed(0)} USDG target`}
      >
        {denominator > 0n &&
          segments.map((segment, index) =>
            segment > 0n ? (
              <div
                key={index}
                className={cn('h-full', ALLOC_COLORS[index % ALLOC_COLORS.length])}
                style={{ width: `${Math.min(100, (Number(segment) / Number(denominator)) * 100)}%` }}
              />
            ) : null,
          )}
      </div>
    </div>
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
