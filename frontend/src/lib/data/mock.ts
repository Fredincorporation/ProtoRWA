/**
 * Demo data layer.
 *
 * The UI is written against the domain types in `@protorwa/shared`, so screens
 * do not care where data comes from. This module is the single seeding point:
 *
 *   NEXT_PUBLIC_DATA_MODE=mock   -> this file (default for the hackathon demo)
 *   NEXT_PUBLIC_DATA_MODE=chain  -> live contract reads (implemented in `chain.ts`)
 *
 * Everything here is clearly synthetic. No figure is presented to a user as a
 * verified fact, and no project claims production, certification or revenue that
 * does not exist.
 */

import type {
  BigIntString,
  LedgerEntry,
  Listing,
  Milestone,
  Notification,
  OrderBook,
  OrderBookLevel,
  Position,
  Project,
  ProjectUpdate,
  UserProfile,
} from '@protorwa/shared';

import { PROTOCOL, SETTLEMENT_CURRENCIES } from '@protorwa/shared';

export const DATA_MODE = (process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock') as 'mock' | 'chain';

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

/**
 * Demo clock anchor.
 *
 * Deadlines and timestamps are expressed as day offsets from an anchor rather
 * than hardcoded dates. The anchor is resolved once per process, and rounded down
 * to the hour so server and client agree on the value (a mid-render millisecond
 * difference would otherwise produce a hydration mismatch on relative times).
 *
 * NOTE: an earlier version pinned this to a fixed calendar date. Once real time
 * moved past it, every "upcoming" deadline silently became months overdue - the
 * FUNDING project showed "Deadline passed" while still accepting capital. Anchoring
 * to the current time keeps the demo internally consistent whenever it is run.
 */
const HOUR_MS = 3_600_000;
const EPOCH = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;

function iso(offsetDays: number): string {
  return new Date(EPOCH + offsetDays * 86_400_000).toISOString();
}

/**
 * Converts a USD figure into a USDG base-unit string (6 decimals, 1 USDG = $1).
 *
 * Every demo money value is USDG-denominated because the deployed escrow settles
 * in USDG. Interpreting these as ETH wei (18 decimals) would be off by a factor
 * of 10^12 - the exact class of bug the settlement module guards against.
 */
function usdg(value: number): BigIntString {
  const { decimals } = SETTLEMENT_CURRENCIES.USDG;
  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(Math.floor(value));
  const fraction = BigInt(Math.round((value - Math.floor(value)) * 1e6));
  const base = whole * scale + (fraction * scale) / 1_000_000n;
  return base.toString() as BigIntString;
}

/** Demo wallet addresses. Distinct from any real deployer. */
export const demoAddresses = {
  founderHelio: '0x4f3a120e72c76c22ae802382fbae9519b61a6de1',
  founderAero: '0x9c1e5b8f7a2d3c4e5f60718293a4b5c6d7e8f901',
  founderRobo: '0x2b8d4f6a1c3e5f70819a2b3c4d5e6f708192a3b4',
  alice: '0x7a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4',
  bob: '0x8b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5',
  carol: '0x9c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6',
} as const;

/** The wallet treated as "connected" when no wallet is present (demo mode). */
export const demoViewer = {
  address: demoAddresses.alice,
  handle: 'alice.eth',
  displayName: 'Alice',
  isProtocolAdmin: false,
} as const;

/* ------------------------------------------------------------------ *
 * Milestone factory
 * ------------------------------------------------------------------ */

function milestones(
  specs: Array<{
    title: string;
    description: string;
    trancheEth: number;
    dueInDays: number;
    status: Milestone['status'];
    evidence?: Array<{ label: string; cid: string; mimeType: string }>;
    votes?: Partial<Milestone['votes']>;
    votingEndsInDays?: number;
  }>,
): Milestone[] {
  return specs.map((spec, index) => {
    const eligible = usdg(10_000);
    const voting = spec.status === 'EVIDENCE';

    return {
      index,
      title: spec.title,
      description: spec.description,
      trancheAmount: usdg(spec.trancheEth),
      dueAt: iso(spec.dueInDays),
      status: spec.status,
      votingPeriodSeconds: PROTOCOL.DEFAULT_VOTING_PERIOD_SECONDS,
      votingEndsAt: voting ? iso(spec.votingEndsInDays ?? 4) : null,
      approvalThresholdBps: PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS,
      quorumBps: PROTOCOL.DEFAULT_QUORUM_BPS,
      votes: {
        approve: spec.votes?.approve ?? '0',
        reject: spec.votes?.reject ?? '0',
        abstain: spec.votes?.abstain ?? '0',
        eligible,
      },
      evidence: (spec.evidence ?? []).map((item, i) => ({
        id: `${index}-${i}`,
        label: item.label,
        cid: item.cid,
        mimeType: item.mimeType,
        submittedAt: iso(spec.dueInDays - 1),
        submittedBy: demoAddresses.founderHelio,
      })),
      approvedAt: spec.status === 'APPROVED' ? iso(spec.dueInDays) : null,
      disputeReason: null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

/**
 * Three demo projects. They exist to exercise the UI across statuses:
 * one mid-production with a live vote, one funding, one completed.
 */
export const mockProjects: Project[] = [
  {
    id: '1',
    slug: 'heliofrost-pro',
    title: 'HelioFrost Pro',
    tagline: 'Off-grid solar vaccine cold-chain refrigeration for rural clinics.',
    description:
      'HelioFrost Pro is a solar-powered cold-chain unit designed for clinics without reliable grid power. It maintains a 2\u20138\u00b0C internal range using a phase-change thermal reservoir and a redundant compressor, and logs temperature telemetry locally.\n\nThis is demonstration data. No batch has been manufactured and no certification has been obtained.',
    status: 'IN_PRODUCTION',
    category: 'ENERGY',
    founder: demoAddresses.founderHelio,
    founderHandle: 'heliofrost',
    manufacturingLocation: 'Demonstration facility, TW',
    coverCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    galleryCids: [],
    pitchVideoCid: null,
    claimPrice: usdg(5),
    totalClaims: '1000',
    claimsCommitted: '1000',
    claimTokenId: '1',
    // Showcase asset: it renders on a simulated book (synthetic depth + a
    // simulated, ticking chart) rather than claiming a live on-chain market.
    // The genuinely-live data path is demonstrated by projects published to the
    // deployed registry (see chain.ts), not by this curated demo entry.
    liquidityMode: 'demo',
    // Pins this showcase to its real on-chain record so catalogue.ts suppresses the
    // live twin (id 1) instead of rendering HelioFrost twice. All chain reads gate
    // on liquidityMode === 'real', so this id never triggers a live fetch here.
    onChainProjectId: '1',
    escrow: {
      totalCommitted: usdg(5_000),
      totalReleased: usdg(3_000),
      totalRefunded: '0',
      locked: usdg(2_000),
      target: usdg(5_000),
      /* Funding closed; the project is in production. */
      fundingDeadline: iso(-10),
    },
    milestones: milestones([
      {
        title: 'M1: Tooling & Injection Moulds',
        description: 'CNC machined aluminum injection tooling delivered and certified by factory QA.',
        trancheEth: 1_500,
        dueInDays: -30,
        status: 'APPROVED',
        evidence: [
          { label: 'Tooling invoice', cid: 'bafkreigh2akiscaildc6b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v', mimeType: 'application/pdf' },
          { label: 'First article inspection report', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku', mimeType: 'application/pdf' },
        ],
        votes: { approve: usdg(680), reject: usdg(70), abstain: usdg(30) },
      },
      {
        title: 'M2: EVT Assembly & Telemetry Verification',
        description: 'First 50 engineering verification test units assembled with calibrated thermal sensors.',
        trancheEth: 1_500,
        dueInDays: -10,
        status: 'APPROVED',
        evidence: [
          { label: 'Pilot batch thermal logs', cid: 'bafkreieq5jui4j25lacwomsqgvn7u5y4lwnbcfnbisfndb5cfvcpzsvqkm', mimeType: 'application/pdf' },
        ],
        votes: { approve: usdg(720), reject: usdg(40), abstain: usdg(20) },
      },
      {
        title: 'M3: Production Batch 1',
        description: 'First 500 consumer production units packaged and palletized with serial attestation.',
        trancheEth: 1_000,
        dueInDays: 12,
        status: 'EVIDENCE',
        votingEndsInDays: 4,
        evidence: [
          { label: 'Production line photographs', cid: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e', mimeType: 'image/jpeg' },
          { label: 'QA test summary', cid: 'bafkreid7qoywk77r7rj3slobqf5zsd7baotcwkotcwkotcwkotcwkotcwk', mimeType: 'application/pdf' },
        ],
        votes: { approve: usdg(410), reject: usdg(90), abstain: usdg(50) },
      },
      {
        title: 'M4: Global Logistics Handover',
        description: 'Customs clearance docs, DHL freight bill of lading, and delivery tracking dispatch.',
        trancheEth: 1_000,
        dueInDays: 40,
        status: 'PENDING',
      },
    ]),
    createdAt: iso(-40),
    updatedAt: iso(-2),
    metrics: {
      holders: 318,
      productionProgressBps: 6_600,
      secondaryVolume: usdg(18_400),
      floorPrice: usdg(5.4),
      deliveryConfidence: 82,
    },
  },
  {
    id: '2',
    slug: 'aeropulse-m2-lidar',
    title: 'AeroPulse M2 LiDAR',
    tagline: 'Modular multi-spectral LiDAR payload for infrastructure inspection.',
    description:
      'AeroPulse M2 is a swappable LiDAR and multispectral payload for aerial inspection of bridges, transmission lines and forestry. It targets a 900 g all-up weight with a tool-free gimbal mount.\n\nThis is demonstration data. No purchase orders or certifications exist.',
    status: 'FUNDING',
    category: 'SENSORS',
    founder: demoAddresses.founderAero,
    founderHandle: 'aeropulse',
    manufacturingLocation: 'Demonstration facility, US',
    coverCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    galleryCids: [],
    pitchVideoCid: null,
    claimPrice: usdg(25),
    totalClaims: '8000',
    claimsCommitted: '3280',
    claimTokenId: '2',
    liquidityMode: 'demo',
    escrow: {
      totalCommitted: usdg(82_000),
      totalReleased: '0',
      totalRefunded: '0',
      locked: usdg(82_000),
      target: usdg(200_000),
      /* Open for commitments for another 9 days. */
      fundingDeadline: iso(9),
    },
    milestones: milestones([
      {
        title: 'Sensor integration',
        description: 'LiDAR and multispectral sensors integrated on the reference airframe.',
        trancheEth: 60_000,
        dueInDays: 30,
        status: 'PENDING',
      },
      {
        title: 'Calibration and flight trials',
        description: 'Radiometric calibration completed and flight trials flown.',
        trancheEth: 80_000,
        dueInDays: 60,
        status: 'PENDING',
      },
      {
        title: 'Production run',
        description: 'Production units assembled and shipped.',
        trancheEth: 60_000,
        dueInDays: 90,
        status: 'PENDING',
      },
    ]),
    createdAt: iso(-12),
    updatedAt: iso(-1),
    metrics: {
      holders: 74,
      productionProgressBps: 0,
      secondaryVolume: '0',
      floorPrice: null,
      deliveryConfidence: 0,
    },
  },
  {
    id: '3',
    slug: 'rigidgrip-cobot-gripper',
    title: 'RigidGrip Cobot Gripper',
    tagline: 'Force-controlled end effector for light assembly cobots.',
    description:
      'RigidGrip is a compliant, force-controlled gripper for collaborative robots performing light assembly. It reports grip force and slip detection over EtherCAT.\n\nThis is demonstration data. The project is shown as completed to exercise the delivered state; no units exist.',
    status: 'COMPLETED',
    category: 'ROBOTICS',
    founder: demoAddresses.founderRobo,
    founderHandle: 'rigidgrip',
    manufacturingLocation: 'Demonstration facility, DE',
    coverCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    galleryCids: [],
    pitchVideoCid: null,
    claimPrice: usdg(20),
    totalClaims: '5000',
    claimsCommitted: '5000',
    claimTokenId: '3',
    liquidityMode: 'demo',
    escrow: {
      totalCommitted: usdg(100_000),
      totalReleased: usdg(100_000),
      totalRefunded: '0',
      locked: '0',
      target: usdg(100_000),
      /* Delivered project: deadline long past. */
      fundingDeadline: iso(-90),
    },
    milestones: milestones([
      {
        title: 'Design freeze and tooling',
        description: 'Design frozen and tooling cut.',
        trancheEth: 40_000,
        dueInDays: -70,
        status: 'APPROVED',
      },
      {
        title: 'Production and delivery',
        description: 'Units produced and delivered to backers.',
        trancheEth: 60_000,
        dueInDays: -20,
        status: 'APPROVED',
      },
    ]),
    createdAt: iso(-120),
    updatedAt: iso(-20),
    metrics: {
      holders: 156,
      productionProgressBps: 10_000,
      secondaryVolume: usdg(42_100),
      floorPrice: usdg(24),
      deliveryConfidence: 100,
    },
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return mockProjects.find((project) => project.slug === slug);
}

export function getProjectById(id: string): Project | undefined {
  return mockProjects.find((project) => project.id === id);
}

/* ------------------------------------------------------------------ *
 * Market data
 * ------------------------------------------------------------------ */

export const mockListings: Listing[] = [
  {
    id: '1',
    projectId: '1',
    seller: demoAddresses.carol,
    amount: '500',
    pricePerUnit: usdg(5.4),
    status: 'ACTIVE',
    createdAt: iso(-3),
    expiresAt: iso(11),
  },
  {
    id: '2',
    projectId: '1',
    seller: demoAddresses.bob,
    amount: '180',
    pricePerUnit: usdg(5.65),
    status: 'ACTIVE',
    createdAt: iso(-1),
    expiresAt: null,
  },
  {
    id: '3',
    projectId: '3',
    // alice holds 800 units of project 3 (see mockPositions), so she is the
    // consistent seller here. An earlier version listed this under a different
    // address than the one holding the position.
    seller: demoAddresses.alice,
    amount: '800',
    pricePerUnit: usdg(24),
    status: 'ACTIVE',
    createdAt: iso(-5),
    expiresAt: iso(20),
  },
];

/** A simple ladder around the last traded price (USDG per claim unit). */
export function mockOrderBook(projectId: string): OrderBook {
  const mid = projectId === '3' ? 24 : projectId === '2' ? 25 : 5.4;

  const level = (multiplier: number, index: number, unit: number): OrderBookLevel => {
    const size = (index + 1) * unit;
    return {
      pricePerUnit: usdg(Number((mid * multiplier).toFixed(6))),
      amount: String(size) as BigIntString,
      cumulative: String((size * (index + 2)) / 2) as BigIntString,
    };
  };

  return {
    projectId,
    asks: [1.0, 1.02, 1.05, 1.1, 1.15].map((m, i) => level(m, i, 400)),
    bids: [0.98, 0.95, 0.92, 0.88, 0.85].map((m, i) => level(m, i, 350)),
  };
}

/* ------------------------------------------------------------------ *
 * Viewer position and activity
 * ------------------------------------------------------------------ */

export const mockPositions: Position[] = [
  {
    projectId: '1',
    amount: '600',
    avgCost: usdg(5),
    committed: usdg(3_000),
    released: usdg(1_800),
    refunded: '0',
  },
  {
    projectId: '3',
    amount: '800',
    avgCost: usdg(20),
    committed: usdg(16_000),
    released: usdg(16_000),
    refunded: '0',
  },
];

export const mockLedger: LedgerEntry[] = [
  {
    id: '1',
    timestamp: iso(-1),
    kind: 'VOTE_CAST',
    projectId: '1',
    amount: '0',
    value: '0',
    txHash: '0x9f2c1b4a7d3e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f',
    gasPaid: '18234000000',
  },
  {
    id: '2',
    timestamp: iso(-2),
    kind: 'MILESTONE_RELEASE',
    projectId: '1',
    amount: '0',
    value: usdg(1_500),
    txHash: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
    gasPaid: '98220000000',
  },
  {
    id: '3',
    timestamp: iso(-3),
    kind: 'LISTING_CREATE',
    projectId: '1',
    amount: '-500',
    value: '0',
    txHash: '0x2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2',
    gasPaid: '64210000000',
  },
  {
    id: '4',
    timestamp: iso(-9),
    kind: 'CLAIM_MINT',
    projectId: '1',
    amount: '600',
    value: usdg(-3_000),
    txHash: '0x3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3',
    gasPaid: '148900000',
  },
];

/* ------------------------------------------------------------------ *
 * Notifications & updates
 * ------------------------------------------------------------------ */

export const mockNotifications: Notification[] = [
  {
    id: '1',
    kind: 'VOTING_OPEN',
    title: 'Vote open: Production run and QA',
    body: 'HelioFrost Pro has submitted evidence for milestone 3. Review window closes in 4 days.',
    projectId: '1',
    severity: 'INFO',
    createdAt: iso(0),
    readAt: null,
    href: '/projects/heliofrost-pro#milestone-2',
  },
  {
    id: '2',
    kind: 'TRANCHE_RELEASED',
    title: 'Tranche released: 1,500 USDG',
    body: 'Milestone 2 (Pilot batch production) was approved by claim holders.',
    projectId: '1',
    severity: 'SUCCESS',
    createdAt: iso(-2),
    readAt: null,
    href: '/projects/heliofrost-pro',
  },
  {
    id: '3',
    kind: 'FOUNDER_UPDATE',
    title: 'Founder update posted',
    body: 'HelioFrost Pro published a production status update.',
    projectId: '1',
    severity: 'INFO',
    createdAt: iso(-4),
    readAt: iso(-3),
    href: '/projects/heliofrost-pro#updates',
  },
];

export const mockUpdates: ProjectUpdate[] = [
  {
    id: '1',
    projectId: '1',
    author: demoAddresses.founderHelio,
    title: 'Production run complete, QA in progress',
    body: 'The full production run is complete and units are in outgoing QA. We have submitted the QA test summary as milestone evidence; the review window is now open.',
    attachmentCids: [],
    createdAt: iso(-2),
  },
  {
    id: '2',
    projectId: '1',
    author: demoAddresses.founderHelio,
    title: 'Pilot batch thermal cycling passed',
    body: 'All ten pilot units completed 200 thermal cycles within the target band. Logs are attached to milestone 2.',
    attachmentCids: [],
    createdAt: iso(-6),
  },
];

/* ------------------------------------------------------------------ *
 * Leaderboards / oracle oversight
 * ------------------------------------------------------------------ */

export const mockUsers: UserProfile[] = [
  {
    address: demoAddresses.alice,
    handle: 'alice.eth',
    displayName: 'Alice',
    avatarCid: null,
    bio: null,
    isProtocolAdmin: false,
    createdAt: iso(-60),
  },
  {
    address: demoAddresses.bob,
    handle: 'bob.eth',
    displayName: 'Bob',
    avatarCid: null,
    bio: null,
    isProtocolAdmin: false,
    createdAt: iso(-55),
  },
  {
    address: demoAddresses.carol,
    handle: null,
    displayName: null,
    avatarCid: null,
    bio: null,
    isProtocolAdmin: true,
    createdAt: iso(-90),
  },
];

/* ------------------------------------------------------------------ *
 * Aggregates used by the landing page
 * ------------------------------------------------------------------ */

/** Total value locked across active projects, in USDG base units (6 decimals). */
export function totalLocked(): string {
  const sum = mockProjects.reduce((acc, project) => acc + BigInt(project.escrow.locked), 0n);
  return sum.toString();
}

/** Count of milestones currently in review across all projects. */
export function openReviewCount(): number {
  return mockProjects.reduce(
    (acc, project) => acc + project.milestones.filter((m) => m.status === 'EVIDENCE').length,
    0,
  );
}
