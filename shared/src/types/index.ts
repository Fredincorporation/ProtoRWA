/**
 * ProtoRWA domain model.
 *
 * Every screen in the design consumes a slice of these types. They are written
 * to mirror the on-chain contracts 1:1 so the mock data layer can be swapped for
 * real chain reads without changing component code.
 */

/** Addresses are hex strings; kept as a named alias so intent is explicit. */
export type Address = `0x${string}`;

/** 256-bit integer rendered as a decimal string (viem convention). */
export type BigIntString = `${bigint}`;

/** An IPFS content identifier, e.g. `bafybeig...`. */
export type Cid = string;

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

/**
 * Project lifecycle, mirroring ProjectRegistry.sol.
 *
 *   DRAFT      - created by founder, not yet accepting capital
 *   FUNDING    - open for commitments; claims mint on commit
 *   IN_PRODUCTION - target met or deadline forced production; milestones active
 *   COMPLETED  - all milestones released, hardware delivered
 *   CANCELLED  - cancelled by founder/admin; commitments refundable
 *   DEFAULTED  - failed to meet milestones; escrow refunds claim holders
 */
export type ProjectStatus =
  | 'DRAFT'
  | 'FUNDING'
  | 'IN_PRODUCTION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DEFAULTED';

/**
 * Milestone lifecycle, mirroring MilestoneEscrow.sol.
 *
 *   PENDING  - not yet reached
 *   EVIDENCE - founder submitted evidence, voting window open
 *   APPROVED - consensus approved, tranche released
 *   REJECTED - consensus rejected, founder may resubmit
 *   DISPUTED - escalated to protocol oracle
 */
export type MilestoneStatus =
  | 'PENDING'
  | 'EVIDENCE'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPUTED';

/** Supported hardware categories - drives the Explore filters. */
export type IndustryCategory =
  | 'COMPUTE'
  | 'ENERGY'
  | 'ROBOTICS'
  | 'SENSORS'
  | 'MOBILITY'
  | 'BIOTECH'
  | 'MANUFACTURING'
  | 'OTHER';

/* ------------------------------------------------------------------ *
 * Core entities
 * ------------------------------------------------------------------ */

/** A proof-of-production artefact attached to a milestone. */
export interface MilestoneEvidence {
  id: string;
  /** Human label, e.g. "Tooling invoice - batch 12". */
  label: string;
  /** IPFS hash of the artefact (image, PDF, video, invoice). */
  cid: Cid;
  mimeType: string;
  /** When the founder submitted it. */
  submittedAt: string;
  /** Address that submitted it. */
  submittedBy: Address;
}

/** Aggregate vote tally for an evidence review. */
export interface MilestoneVotes {
  /** Total claim weight that voted to approve. */
  approve: BigIntString;
  /** Total claim weight that voted to reject. */
  reject: BigIntString;
  /** Weight that abstained (counted toward quorum only). */
  abstain: BigIntString;
  /** Total claim weight eligible to vote at snapshot time. */
  eligible: BigIntString;
}

/** A funding/production checkpoint backed by an escrow tranche. */
export interface Milestone {
  /** Monotonic index within the project. */
  index: number;
  title: string;
  description: string;
  /** Escrow amount released when this milestone is approved, in wei. */
  trancheAmount: BigIntString;
  /** Target completion timestamp (ISO 8601). */
  dueAt: string;
  status: MilestoneStatus;
  /** Seconds the review window stays open once evidence is submitted. */
  votingPeriodSeconds: number;
  /** Unix seconds approvals open until; null when not voting. */
  votingEndsAt: string | null;
  /** Approval threshold in basis points (e.g. 6000 = 60%). */
  approvalThresholdBps: number;
  /** Quorum threshold in basis points of eligible weight. */
  quorumBps: number;
  votes: MilestoneVotes;
  /** Artefacts submitted for review. */
  evidence: MilestoneEvidence[];
  /** Set when status is APPROVED. */
  approvedAt: string | null;
  /** Set when status is DISPUTED. */
  disputeReason: string | null;
}

/** Escrow state for a project - the trust core of the protocol. */
export interface EscrowSummary {
  /** Total capital committed, in wei. */
  totalCommitted: BigIntString;
  /** Total released to the founder across approved milestones, in wei. */
  totalReleased: BigIntString;
  /** Total refunded to claim holders, in wei. */
  totalRefunded: BigIntString;
  /** Currently locked balance, in wei. */
  locked: BigIntString;
  /** Funding target, in wei. */
  target: BigIntString;
  /** Funding deadline (ISO 8601). */
  fundingDeadline: string;
}

/** A tokenized hardware project - the central entity. */
export interface Project {
  /** Numeric on-chain id, rendered as a string. */
  id: string;
  /** URL-safe identifier used in routes. */
  slug: string;
  title: string;
  /** Short one-liner for cards. */
  tagline: string;
  /** Long-form description (markdown). */
  description: string;
  status: ProjectStatus;
  category: IndustryCategory;
  /** Founder's wallet. */
  founder: Address;
  /** Optional display name / handle for the founder. */
  founderHandle?: string;
  /** Location of manufacturing, e.g. "Kaohsiung, TW". */
  manufacturingLocation: string;
  /** Cover image on IPFS. */
  coverCid: Cid;
  /** Gallery images on IPFS. */
  galleryCids: Cid[];
  /** Pitch video on IPFS, if supplied. */
  pitchVideoCid: Cid | null;
  /** Price per claim unit, in wei. */
  claimPrice: BigIntString;
  /** Total claim units offered. */
  totalClaims: BigIntString;
  /** Claim units committed so far. */
  claimsCommitted: BigIntString;
  /** Withheld ERC-1155 token id for this project's claims. */
  claimTokenId: BigIntString;
  escrow: EscrowSummary;
  milestones: Milestone[];
  /** When the project record was created (ISO 8601). */
  createdAt: string;
  /** Last mutation (ISO 8601). */
  updatedAt: string;
  /** Unverified off-chain metrics surfaced in the UI. */
  metrics?: ProjectMetrics;
  /**
   * Where the secondary-market book for this project comes from.
   *
   * - `real`  - the project exists on the target deployment; the order book,
   *   listings, bids and fills are read live from `SecondaryMarket`.
   * - `demo`  - a showcase fixture with no live book; a deterministic synthetic
   *   book is generated so the UI can be exercised offline.
   *
   * Defaults to `real`; the seeded demo projects explicitly opt into `demo`.
   */
  liquidityMode?: 'demo' | 'real';
  /**
   * The project's numeric id on the live deployment, when `liquidityMode` is
   * `real` and the project is wired to it. Keyed separately from `id` because
   * the mock catalogue's `id` is a display index, not the on-chain id.
   */
  onChainProjectId?: string;
}

/** Presentation metrics - some are indexed, some computed client-side. */
export interface ProjectMetrics {
  /** Distinct claim-holder addresses. */
  holders: number;
  /** Basis points of production progress reported by the founder. */
  productionProgressBps: number;
  /** Secondary-market volume over the trailing window, in wei. */
  secondaryVolume: BigIntString;
  /** Lowest active ask, in wei; null when no listings. */
  floorPrice: BigIntString | null;
  /** Percentage the founder has delivered, human-readable (0-100). */
  deliveryConfidence: number;
}

/* ------------------------------------------------------------------ *
 * Secondary market
 * ------------------------------------------------------------------ */

export type ListingStatus = 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'EXPIRED';

/** A peer-to-peer claim listing. */
export interface Listing {
  id: string;
  projectId: string;
  seller: Address;
  /** Claim units offered. */
  amount: BigIntString;
  /** Ask price per unit, in wei. */
  pricePerUnit: BigIntString;
  status: ListingStatus;
  createdAt: string;
  expiresAt: string | null;
}

export type OrderSide = 'BUY' | 'SELL';

/** A filled or resting order in the claims book. */
export interface Order {
  id: string;
  projectId: string;
  side: OrderSide;
  /** Taker's address. */
  account: Address;
  amount: BigIntString;
  pricePerUnit: BigIntString;
  /** Total consideration, in wei. */
  total: BigIntString;
  status: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
  createdAt: string;
}

/** Aggregate book view for a project's trading terminal. */
export interface OrderBook {
  projectId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface OrderBookLevel {
  pricePerUnit: BigIntString;
  amount: BigIntString;
  cumulative: BigIntString;
}

/* ------------------------------------------------------------------ *
 * Account side
 * ------------------------------------------------------------------ */

/** A holder's position in a project. */
export interface Position {
  projectId: string;
  /** Claim units held. */
  amount: BigIntString;
  /** Average entry price per unit, in wei. */
  avgCost: BigIntString;
  /** Committed capital still in escrow, in wei. */
  committed: BigIntString;
  /** Released to founder (sunk), in wei. */
  released: BigIntString;
  /** Refunded out, in wei. */
  refunded: BigIntString;
}

/** Append-only ledger entry for the audit / tax screen. */
export interface LedgerEntry {
  id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  kind:
    | 'COMMIT'
    | 'CLAIM_MINT'
    | 'LISTING_CREATE'
    | 'LISTING_FILL'
    | 'ORDER_FILL'
    | 'MILESTONE_RELEASE'
    | 'REFUND'
    | 'VOTE_CAST'
    | 'TRANSFER';
  projectId: string | null;
  /** Signed token amount; positive received, negative sent. */
  amount: BigIntString;
  /** Signed native value movement, in wei. */
  value: BigIntString;
  /** Transaction hash. */
  txHash: `0x${string}`;
  /** Gas paid, in wei. */
  gasPaid: BigIntString;
}

/* ------------------------------------------------------------------ *
 * Governance & oracle
 * ------------------------------------------------------------------ */

/** A claim holder's vote on a milestone. */
export interface Vote {
  milestoneIndex: number;
  projectId: string;
  voter: Address;
  choice: 'APPROVE' | 'REJECT' | 'ABSTAIN';
  /** Claim weight used at snapshot. */
  weight: BigIntString;
  castAt: string;
  reason: string | null;
}

/** Protocol-level intervention record on the oracle oversight terminal. */
export interface OracleAction {
  id: string;
  projectId: string;
  milestoneIndex: number;
  /** Admin address that acted. */
  actor: Address;
  kind: 'ESCALATED' | 'RESOLVED_RELEASE' | 'RESOLVED_REFUND' | 'PROJECT_DEFAULTED';
  rationale: string;
  evidenceCid: Cid | null;
  timestamp: string;
  txHash: `0x${string}`;
}

/* ------------------------------------------------------------------ *
 * Notifications & feed
 * ------------------------------------------------------------------ */

export type NotificationKind =
  | 'MILESTONE_EVIDENCE'
  | 'VOTING_OPEN'
  | 'VOTING_CLOSED'
  | 'TRANCHE_RELEASED'
  | 'LISTING_FILLED'
  | 'ORDER_FILLED'
  | 'FOUNDER_UPDATE'
  | 'PROTOCOL_ALERT'
  | 'REFUND_AVAILABLE';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  projectId: string | null;
  /** Severity drives styling on the alert stream. */
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  createdAt: string;
  readAt: string | null;
  /** Deep link into the app. */
  href: string | null;
}

/** Founder-posted changelog entry. */
export interface ProjectUpdate {
  id: string;
  projectId: string;
  author: Address;
  title: string;
  body: string;
  attachmentCids: Cid[];
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Users / auth (SIWE)
 * ------------------------------------------------------------------ */

export interface UserProfile {
  address: Address;
  handle: string | null;
  displayName: string | null;
  avatarCid: Cid | null;
  bio: string | null;
  /** Whether the address has been granted protocol-admin rights. */
  isProtocolAdmin: boolean;
  createdAt: string;
}

export interface AuthSession {
  address: Address;
  /** ISO 8601 expiry of the signed session. */
  expiresAt: string;
  /** The SIWE nonce that was signed. */
  nonce: string;
}

/* ------------------------------------------------------------------ *
 * AI assistant
 * ------------------------------------------------------------------ */

/** Server-only request to the AI layer (Groq primary, Gemini fallback). */
export interface AiAssistRequest {
  task: 'description' | 'milestones' | 'tokenomics' | 'risk' | 'chat';
  /** Free-form founder input. */
  prompt: string;
  /** Optional structured context gathered by the wizard. */
  context?: Record<string, string | number | boolean>;
}

export interface AiAssistResponse {
  task: AiAssistRequest['task'];
  text: string;
  /** Which provider served the request. */
  provider: 'groq' | 'gemini';
  model: string;
  /** Present when the primary provider failed and the fallback was used. */
  fallbackReason?: string;
}

/** Structured milestone suggestion returned by the AI helper. */
export interface AiMilestoneSuggestion {
  title: string;
  description: string;
  /** Suggested share of total raise, in basis points. */
  trancheBps: number;
  /** Suggested window in days from funding close. */
  durationDays: number;
}

export interface AiTokenomicsSuggestion {
  claimPrice: string;
  totalClaims: string;
  target: string;
  notes: string;
}

export interface AiRiskNote {
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  category: string;
  note: string;
  mitigation: string;
}
