'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { defaultChain, isDeployed } from '@protorwa/shared';
import type { Milestone, Project } from '@protorwa/shared';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { InvestFlow } from '@/components/project/invest-flow';
import { MilestoneVoteConsole } from '@/components/project/milestone-vote-console';
import { ClaimRefundPanel } from '@/components/project/claim-refund-panel';
import { ClaimTradingTerminal } from '@/components/market/claim-trading-terminal';
import { MilestoneEvidenceSubmit } from '@/components/studio/evidence-submit';
import { FounderWizard } from '@/components/studio/founder-wizard';
import {
  OracleMilestoneActions,
  ProjectLifecycleControl,
} from '@/components/admin/admin-actions-panel';
import {
  ActivityFeed,
  FleetControlPanel,
  InvestorAuditPanel,
  InvestorGovernancePanel,
  InvestorPositionsPanel,
  StatTiles,
  type StatTile,
} from '@/components/dashboard/surfaces';
import { useWalletHoldings } from '@/lib/data/useWalletHoldings';
import { mockPositions } from '@/lib/data/mock';
import { formatUsdg, formatUsdgNumber, formatNumber, percentOf } from '@/lib/format';
import { isRefundableStatus, projectStatus } from '@/lib/status';
import {
  buildQueue,
  participatedProjectIds,
  roleMeta,
  type DashboardRole,
  type QueueItem,
  type QueueSection,
} from '@/lib/dashboard';
import { cn } from '@/lib/utils';

/**
 * The single interactive surface behind every role dashboard.
 *
 * A persona's mission control: a derived KPI strip, then tabs that fold in the
 * dedicated pages' real components - the actionable queues (invest / vote /
 * trade / refund / evidence / oversight) render the same self-contained client
 * components the routes mount, and the read-only surfaces (governance, audit &
 * tax, fleet control, positions) render panels derived from the same project and
 * holdings state. Only the active tab is mounted, so chain reads stay scoped to
 * what the persona is looking at. An activity rail on the right is a function of
 * live escrow state, not authored copy.
 */

/** A dashboard tab: either a list of action rows or one embedded panel. */
type Tab =
  | { id: string; label: string; icon: string; kind: 'queue'; count: number; render: () => React.ReactNode }
  | { id: string; label: string; icon: string; kind: 'panel'; render: () => React.ReactNode };

export function DashboardShell({
  role,
  projects,
}: {
  role: DashboardRole;
  projects: Project[];
}) {
  const { address, isConnected } = useAccount();
  const deployed = isDeployed(defaultChain.id);

  const holdings = useWalletHoldings(address, projects);

  const heldIds = React.useMemo(
    () =>
      participatedProjectIds(
        projects,
        holdings.byProjectId,
        new Set(mockPositions.map((p) => p.projectId)),
      ),
    [projects, holdings.byProjectId],
  );

  const sections = React.useMemo(
    () => buildQueue(role, projects, address, Date.now(), role === 'investor' ? heldIds : undefined),
    [role, projects, address, heldIds],
  );

  const liveCount = projects.filter((p) => p.liquidityMode === 'real').length;
  const meta = roleMeta[role];

  const tabs = React.useMemo(
    () => buildTabs({ role, projects, sections, address, isConnected, deployed, heldIds, balances: holdings.byProjectId }),
    [role, projects, sections, address, isConnected, deployed, heldIds, holdings.byProjectId],
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const tiles = React.useMemo(
    () => buildTiles({ role, projects, heldIds, balances: holdings.byProjectId }),
    [role, projects, heldIds, holdings.byProjectId],
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-space-lg py-space-xl lg:px-margin">
      <Hero role={role} isConnected={isConnected} liveCount={liveCount} projectCount={projects.length} />

      <div className="mt-space-lg">
        <StatTiles tiles={tiles} />
      </div>

      <div className="mt-space-lg grid grid-cols-1 gap-space-lg xl:grid-cols-12">
        {/* Main column: tabs + active surface */}
        <div className="flex flex-col gap-space-md xl:col-span-8">
          <div
            role="tablist"
            aria-label={`${meta.label} sections`}
            className="flex flex-wrap gap-1 border-b border-outline-variant/40"
          >
            {tabs.map((tab) => {
              const selected = tab.id === active?.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveId(tab.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-t border-b-2 px-space-md py-2 font-label-md transition-colors',
                    selected
                      ? 'border-primary text-primary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <Icon name={tab.icon} size={16} />
                  {tab.label}
                  {tab.kind === 'queue' ? (
                    <span
                      className={cn(
                        'rounded-full px-1.5 font-mono text-label-sm',
                        selected ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-outline',
                      )}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {active ? (
            <div role="tabpanel" aria-label={active.label} className="flex flex-col gap-space-lg">
              {active.render()}
            </div>
          ) : null}
        </div>

        {/* Side rail: activity + quick links */}
        <aside className="flex flex-col gap-space-lg xl:col-span-4">
          <ActivityFeed projects={projects} />
          <QuickLinks role={role} />
        </aside>
      </div>

      <ProjectRoster projects={projects} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Hero
 * ------------------------------------------------------------------ */

function Hero({
  role,
  isConnected,
  liveCount,
  projectCount,
}: {
  role: DashboardRole;
  isConnected: boolean;
  liveCount: number;
  projectCount: number;
}) {
  const meta = roleMeta[role];
  const accent =
    role === 'investor' ? 'bg-primary/10 text-primary' : role === 'founder' ? 'bg-secondary/10 text-secondary' : 'bg-tertiary/10 text-tertiary';

  return (
    <header className="relative overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-low p-space-lg">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-space-md lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-space-sm">
          <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', accent)}>
            <Icon name={meta.icon} size={24} />
          </span>
          <div>
            <div className="font-mono text-label-sm uppercase tracking-widest text-primary">
              {'//'} Mission control
            </div>
            <h1 className="font-display text-headline-lg font-bold tracking-tight text-on-surface">
              {meta.title}
            </h1>
            <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">{meta.tagline}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isConnected ? 'success' : 'neutral'}>
            <StatusDot tone={isConnected ? 'success' : 'neutral'} pulse={isConnected} />
            {isConnected ? 'Wallet connected' : 'Connect for live state'}
          </Badge>
          <Badge tone={liveCount > 0 ? 'brand' : 'neutral'}>
            {liveCount} live · {projectCount - liveCount} demo
          </Badge>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * KPI tiles (derived from real state)
 * ------------------------------------------------------------------ */

function buildTiles({
  role,
  projects,
  heldIds,
  balances,
}: {
  role: DashboardRole;
  projects: Project[];
  heldIds: Set<string>;
  balances: Map<string, bigint>;
}): StatTile[] {
  const openVotes = projects.reduce(
    (n, p) => n + p.milestones.filter((m) => m.status === 'EVIDENCE').length,
    0,
  );
  const disputes = projects.reduce(
    (n, p) => n + p.milestones.filter((m) => m.status === 'DISPUTED').length,
    0,
  );
  const refundable = projects.filter((p) => isRefundableStatus(p.status)).length;

  if (role === 'founder') {
    return tilesFounder(projects);
  }
  if (role === 'admin') {
    const escrowUnderOversight = projects
      .filter((p) => p.liquidityMode === 'real')
      .reduce((acc, p) => acc + BigInt(p.escrow.locked || '0'), 0n);
    return [
      { label: 'Open disputes', value: formatNumber(disputes), icon: 'gavel', tone: disputes > 0 ? 'tertiary' : 'neutral', sub: 'Escalated to the oracle' },
      { label: 'Reviews pending', value: formatNumber(openVotes), icon: 'rule_folder', tone: 'primary', sub: 'Voting windows open' },
      { label: 'Live builds', value: formatNumber(projects.filter((p) => p.liquidityMode === 'real').length), icon: 'settings_ethernet', sub: `${refundable} refundable` },
      { label: 'Escrow under oversight', value: `${formatUsdgNumber(escrowUnderOversight, 0)} USDG`, icon: 'lock', tone: 'secondary', sub: 'Locked in real deployments' },
    ];
  }

  // investor
  const heldProjects = projects.filter((p) => heldIds.has(p.id));
  const claimUnits = heldProjects.reduce((acc, p) => {
    if (p.liquidityMode === 'real') {
      return acc + (p.onChainProjectId ? balances.get(p.onChainProjectId) ?? 0n : 0n);
    }
    return acc + BigInt(mockPositions.find((mp) => mp.projectId === p.id)?.amount ?? '0');
  }, 0n);
  const escrowInHeld = heldProjects.reduce((acc, p) => acc + BigInt(p.escrow.locked || '0'), 0n);

  return [
    { label: 'Positions held', value: formatNumber(heldProjects.length), icon: 'account_balance_wallet', tone: 'primary', sub: 'Projects you have claims in' },
    { label: 'Claim units', value: formatNumber(claimUnits), icon: 'token', sub: 'Across your positions' },
    { label: 'In escrow (your builds)', value: `${formatUsdgNumber(escrowInHeld, 0)} USDG`, icon: 'lock', tone: 'secondary', sub: 'Project escrow, not yet released' },
    { label: 'Votes open', value: formatNumber(openVotes), icon: 'how_to_vote', tone: openVotes > 0 ? 'primary' : 'neutral', sub: `${disputes} in dispute` },
  ];
}

function tilesFounder(projects: Project[]): StatTile[] {
  // Founder tiles are protocol-wide until a wallet is resolved; the queue and
  // fleet panel own the per-address filtering. These describe the whole board.
  const owned = projects;
  const locked = owned.reduce((acc, p) => acc + BigInt(p.escrow.locked || '0'), 0n);
  const released = owned.reduce((acc, p) => acc + BigInt(p.escrow.totalReleased || '0'), 0n);
  const awaiting = owned.reduce(
    (n, p) => n + p.milestones.filter((m) => m.status === 'PENDING' || m.status === 'REJECTED').length,
    0,
  );
  const inReview = owned.reduce((n, p) => n + p.milestones.filter((m) => m.status === 'EVIDENCE').length, 0);

  return [
    { label: 'Builds on protocol', value: formatNumber(owned.length), icon: 'precision_manufacturing', tone: 'secondary', sub: 'Your owned set is filtered below' },
    { label: 'Awaiting evidence', value: formatNumber(awaiting), icon: 'fact_check', tone: awaiting > 0 ? 'primary' : 'neutral', sub: 'Milestones you can submit' },
    { label: 'Tranches in review', value: formatNumber(inReview), icon: 'hourglass_top', sub: 'Backers deciding now' },
    { label: 'Released vs locked', value: `${formatUsdgNumber(released, 0)}/${formatUsdgNumber(locked, 0)}`, icon: 'savings', tone: 'primary', sub: 'USDG released / still escrowed' },
  ];
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

function buildTabs(args: {
  role: DashboardRole;
  projects: Project[];
  sections: QueueSection[];
  address: string | undefined;
  isConnected: boolean;
  deployed: boolean;
  heldIds: Set<string>;
  balances: Map<string, bigint>;
}): Tab[] {
  const { role, projects, sections, address, isConnected, deployed, heldIds, balances } = args;

  const queueTab = (section: QueueSection): Tab => ({
    id: section.id,
    label: section.label,
    icon: section.icon,
    kind: 'queue',
    count: section.items.length,
    render: () => (
      <QueueTabBody
        section={section}
        projects={projects}
        isConnected={isConnected}
        deployed={deployed}
        role={role}
        heldIds={heldIds}
      />
    ),
  });

  const panelTab = (id: string, label: string, icon: string, node: React.ReactNode): Tab => ({
    id,
    label,
    icon,
    kind: 'panel',
    render: () => node,
  });

  const tabs: Tab[] = sections.map(queueTab);

  if (role === 'investor') {
    tabs.unshift(
      panelTab(
        'positions',
        'Positions',
        'account_balance_wallet',
        <InvestorPositionsPanel
          projects={projects}
          heldIds={heldIds}
          balances={balances}
          connected={isConnected}
        />,
      ),
    );
    tabs.push(
      panelTab('governance', 'Governance', 'gavel', <InvestorGovernancePanel projects={projects} />),
      panelTab('audit', 'Audit & Tax', 'receipt_long', <InvestorAuditPanel projects={projects} />),
    );
  }

  if (role === 'founder') {
    tabs.unshift(panelTab('fleet', 'Fleet Control', 'settings_ethernet', <FleetControlPanel projects={projects} address={address} />));
  }

  return tabs;
}

/** Renders one queue section as embedded action cards, with honest empty states. */
function QueueTabBody({
  section,
  projects,
  isConnected,
  deployed,
  role,
  heldIds,
}: {
  section: QueueSection;
  projects: Project[];
  isConnected: boolean;
  deployed: boolean;
  role: DashboardRole;
  heldIds: Set<string>;
}) {
  if (section.items.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState sectionId={section.id} role={role} isConnected={isConnected} heldCount={heldIds.size} />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <p className="max-w-prose text-body-sm text-on-surface-variant">{section.description}</p>
      {section.items.map((item) => (
        <EmbeddedBlock
          key={item.key}
          item={item}
          project={lookup(projects, item.projectSlug)}
          isConnected={isConnected}
          deployed={deployed}
        />
      ))}
      {role === 'admin' ? <AdminNotice /> : null}
      {role === 'founder' && !isConnected ? (
        <p className="font-mono text-label-sm text-outline">
          Connect a founder wallet to submit evidence against a live escrow.
        </p>
      ) : null}
    </>
  );
}

function EmptyState({
  sectionId,
  role,
  isConnected,
  heldCount,
}: {
  sectionId: string;
  role: DashboardRole;
  isConnected: boolean;
  heldCount: number;
}) {
  const copy: Record<string, string> = {
    votes: 'No milestones have evidence under review right now.',
    refunds: 'No cancelled or defaulted builds - nothing is refundable.',
    invest: 'No open funding rounds to commit to right now.',
    evidence: 'No milestones awaiting your evidence submission.',
    raises: 'You have no project drafting or collecting capital.',
    disputes: 'No milestones are escalated to the oracle.',
    reviews: 'No voting windows need the oracle right now.',
    transitions: 'No live raises or productions to transition.',
    trade:
      role === 'investor'
        ? isConnected
          ? heldCount === 0
            ? 'You hold claims in no tradable project. The market here shows only positions you have participated in.'
            : 'None of your holdings are in a tradable (post-funding) project yet.'
          : 'Connect a wallet to see claims you hold on the secondary market.'
        : 'Nothing here for this persona right now.',
    new: 'Launch a hardware build from the Founder Studio tab.',
  };
  return (
    <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
      <Icon name="info" size={13} className="mt-0.5 shrink-0" />
      <span>{copy[sectionId] ?? 'Nothing here for this persona right now.'}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Embedded action card (unchanged behaviour, reused from the prior shell)
 * ------------------------------------------------------------------ */

function EmbeddedBlock({
  item,
  project,
  isConnected,
  deployed,
}: {
  item: QueueItem;
  project?: Project;
  isConnected: boolean;
  deployed: boolean;
}) {
  if (item.kind === 'launch') {
    return (
      <Card>
        <CardBody>
          <FounderWizard />
        </CardBody>
      </Card>
    );
  }

  const milestone =
    item.milestoneIndex != null ? project?.milestones[item.milestoneIndex] : undefined;

  const body = renderBody(item, project, milestone, isConnected, deployed);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/50 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {item.urgent ? <StatusDot tone="warn" pulse /> : null}
          <span className="truncate font-label-md text-on-surface">{project?.title ?? item.title}</span>
          {milestone ? (
            <span className="hidden truncate font-mono text-label-sm text-outline sm:inline">
              {milestone.title}
            </span>
          ) : null}
        </div>
        <Badge tone={item.source === 'live' ? 'success' : 'neutral'}>{item.source}</Badge>
      </div>
      <CardBody>{body}</CardBody>
    </Card>
  );
}

function renderBody(
  item: QueueItem,
  project: Project | undefined,
  milestone: Milestone | undefined,
  isConnected: boolean,
  deployed: boolean,
): React.ReactNode {
  if (!project) {
    return <FallbackLink item={item} />;
  }

  switch (item.kind) {
    case 'invest':
      return <InvestFlow project={project} connected={isConnected} deployed={deployed} />;
    case 'trade':
      return <ClaimTradingTerminal project={project} />;
    case 'refund':
      return <ClaimRefundPanel project={project} />;
    case 'vote':
      return milestone ? (
        <MilestoneVoteConsole
          project={project}
          milestone={milestone}
          milestoneIndex={item.milestoneIndex ?? milestone.index}
        />
      ) : (
        <FallbackLink item={item} />
      );
    case 'submit-evidence':
      return milestone ? (
        <MilestoneEvidenceSubmit
          project={project}
          milestone={milestone}
          milestoneIndex={item.milestoneIndex ?? milestone.index}
        />
      ) : (
        <FallbackLink item={item} />
      );
    case 'funding':
      return <FundingSummary project={project} />;
    case 'review':
      return milestone ? (
        <OracleMilestoneActions
          project={project}
          milestone={milestone}
          milestoneIndex={item.milestoneIndex ?? milestone.index}
        />
      ) : (
        <ProjectLifecycleControl project={project} />
      );
  }
}

function FallbackLink({ item }: { item: QueueItem }) {
  return (
    <Link href={item.href} className="font-label-md text-primary hover:underline">
      {item.detail} →
    </Link>
  );
}

function FundingSummary({ project }: { project: Project }) {
  const committed = BigInt(project.escrow.totalCommitted);
  const target = BigInt(project.escrow.target);
  const pct = Math.round(percentOf(committed, target));
  const s = projectStatus(project.status);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          <span className="font-mono text-label-sm text-outline">
            {formatUsdg(committed)} of {formatUsdg(target)} raised ({pct}%)
          </span>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          {project.claimsCommitted}/{project.totalClaims} claim units committed.
        </p>
      </div>
      <Link
        href={`/projects/${project.slug}`}
        className="inline-flex items-center gap-1 rounded border border-outline-variant px-3 py-1.5 font-mono text-label-sm text-on-surface-variant transition-colors hover:text-on-surface"
      >
        Open project
        <Icon name="arrow_forward" size={14} />
      </Link>
    </div>
  );
}

function AdminNotice() {
  return (
    <p className="flex items-start gap-1.5 font-mono text-label-sm text-outline">
      <Icon name="info" size={13} className="mt-0.5 shrink-0" />
      Oracle and administrator actions are wired to live contracts (escalate, oracleResolve,
      setProjectStatus) and enabled only when the connected wallet holds ORACLE_ROLE / ADMIN_ROLE on
      this deployment. Showcase rows stay inert because they have no on-chain escrow.
    </p>
  );
}

const QUICK_LINKS: Record<DashboardRole, Array<{ label: string; href: string; icon: string }>> = {
  investor: [
    { label: 'Explore builds', href: '/explore', icon: 'search' },
    { label: 'Secondary market', href: '/market', icon: 'swap_horiz' },
    { label: 'Governance', href: '/governance', icon: 'gavel' },
    { label: 'Audit & tax', href: '/account', icon: 'receipt_long' },
  ],
  founder: [
    { label: 'Founder studio', href: '/studio', icon: 'precision_manufacturing' },
    { label: 'Fleet control', href: '/studio/control', icon: 'settings_ethernet' },
    { label: 'Launch a build', href: '/studio/new', icon: 'rocket_launch' },
  ],
  admin: [
    { label: 'Oversight terminal', href: '/admin', icon: 'shield' },
    { label: 'Governance', href: '/governance', icon: 'gavel' },
    { label: 'Explore builds', href: '/explore', icon: 'search' },
  ],
};

function QuickLinks({ role }: { role: DashboardRole }) {
  return (
    <Card>
      <div className="border-b border-outline-variant/50 px-5 py-4">
        <h3 className="font-display text-headline-sm text-on-surface">Jump to</h3>
      </div>
      <CardBody className="flex flex-col gap-1">
        {QUICK_LINKS[role].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 rounded px-2 py-2 font-mono text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            <Icon name={link.icon} size={16} className="text-outline" />
            {link.label}
            <Icon name="arrow_forward" size={13} className="ml-auto text-outline" />
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

function ProjectRoster({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;
  return (
    <Card className="mt-space-lg">
      <div className="border-b border-outline-variant/50 px-5 py-4">
        <h3 className="font-display text-headline-sm text-on-surface">All builds</h3>
        <p className="text-body-sm text-on-surface-variant">
          Every project on the protocol, whichever persona owns it.
        </p>
      </div>
      <CardBody className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const s = projectStatus(p.status);
          return (
            <Link
              key={p.slug}
              href={`/projects/${p.slug}`}
              className="flex items-center justify-between gap-2 rounded border border-outline-variant/40 bg-surface-container-lowest p-3 transition-colors hover:border-primary/40 hover:bg-surface-container"
            >
              <span className="min-w-0">
                <span className="block truncate font-label-md text-on-surface">{p.title}</span>
                <span className="font-mono text-label-sm text-outline">{s.label}</span>
              </span>
              <Badge tone={p.liquidityMode === 'real' ? 'success' : 'neutral'}>
                {p.liquidityMode === 'real' ? 'live' : 'demo'}
              </Badge>
            </Link>
          );
        })}
      </CardBody>
    </Card>
  );
}

function lookup(projects: Project[], slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}
