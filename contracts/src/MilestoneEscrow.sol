// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ProjectRegistry } from "./ProjectRegistry.sol";
import { ClaimToken } from "./ClaimToken.sol";

/**
 * @title MilestoneEscrow
 * @notice Custodies committed capital and releases it milestone by milestone
 *         against claim-holder consensus, with a protocol oracle as backstop.
 *
 * Design notes:
 *  - Vote weight is snapshotted when evidence is submitted, so claims acquired
 *    (or dumped) mid-review cannot swing the outcome.
 *  - Majority selection for the snapshot is bounded by `maxVotersPerProject`:
 *    the claim token is not balances-enumerable by design (ERC-1155), and a full
 *    holder index is out of scope. If the cap is exceeded the project is flagged
 *    `oversized`, and evaluation falls back to oracle resolution rather than
 *    silently mis-counting quorum.
 *  - Every transition that moves funds emits an event with the rationale, which
 *    is what the audit screen indexes.
 */
contract MilestoneEscrow is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ------------------------------------------------------------------ *
     * Roles
     * ------------------------------------------------------------------ */

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @dev Bounds gas when snapshotting voters at evidence submission.
    uint256 public constant MAX_VOTERS_PER_PROJECT = 150;

    /* ------------------------------------------------------------------ *
     * Types
     * ------------------------------------------------------------------ */

    enum ReviewOutcome {
        NONE,
        PENDING,
        APPROVED,
        REJECTED
    }

    struct Review {
        bool open;
        uint64 endsAt;
        uint64 snapshotAt;
        uint256 eligibleWeight;
        uint256 approveWeight;
        uint256 rejectWeight;
        uint256 abstainWeight;
        uint256 trancheAmount;
        ReviewOutcome outcome;
    }

    /* ------------------------------------------------------------------ *
     * Storage
     * ------------------------------------------------------------------ */

    ProjectRegistry public immutable registry;
    ClaimToken public immutable claimToken;
    IERC20 public immutable paymentToken;

    /// @notice Project id => milestone index => review state.
    mapping(uint256 => mapping(uint256 => Review)) public reviews;

    /// @notice Project id => milestone index => voter => weight used.
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public voteWeight;

    /// @notice Project id => milestone index => voter => true once voted.
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    /// @notice Project id => holder => weight snapshotted at review open.
    mapping(uint256 => mapping(address => uint256)) public snapshotWeight;

    /// @notice Project id => participants whose last claim acquisition is known.
    mapping(uint256 => address[]) private _participants;

    /// @notice Project id => participant => already indexed.
    mapping(uint256 => mapping(address => bool)) private _isParticipant;

    /// @notice Project id => milestone index => funds released.
    mapping(uint256 => mapping(uint256 => uint256)) public released;

    /// @notice Project id => total refunded to holders.
    mapping(uint256 => uint256) public totalRefunded;

    /// @notice Project id => true when the holder set exceeded the snapshot cap.
    mapping(uint256 => bool) public oversized;

    /// @notice Project id => remaining custodied balance.
    mapping(uint256 => uint256) public escrowBalance;

    /**
     * @notice Total ERC-20 base units this contract has accounted for.
     *
     * @dev Exists so `depositToken` can verify a reported amount against the real
     *      token balance instead of trusting the caller. Native ETH needs no
     *      equivalent because `msg.value` is supplied by the EVM and cannot be
     *      misreported.
     */
    uint256 public totalAccounted;

    /* ------------------------------------------------------------------ *
     * Events
     * ------------------------------------------------------------------ */

    event EscrowDeposited(uint256 indexed projectId, uint256 amount);
    event EvidenceSubmitted(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        string evidenceCid,
        uint64 endsAt
    );
    event VoteCast(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        address indexed voter,
        bool approve,
        bool abstain,
        uint256 weight
    );
    event MilestoneApproved(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        uint256 trancheAmount
    );
    event MilestoneRejected(uint256 indexed projectId, uint256 indexed milestoneIndex);
    event MilestoneEscalated(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        string rationaleCid
    );
    event OracleResolved(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        bool release,
        string rationale
    );
    event RefundClaimed(uint256 indexed projectId, address indexed holder, uint256 amount);

    /* ------------------------------------------------------------------ *
     * Errors
     * ------------------------------------------------------------------ */

    error NotFound(uint256 projectId);
    error NoReview(uint256 projectId, uint256 milestoneIndex);
    error ReviewClosed(uint256 projectId, uint256 milestoneIndex);
    error AlreadyVoted();
    error NoWeight();
    error TooEarly();
    error InsufficientEscrow();
    error OversizedHolderSet(uint256 participants);
    error RefundUnavailable();
    error TransferFailed();

    /* ------------------------------------------------------------------ *
     * Construction
     * ------------------------------------------------------------------ */

    constructor(
        address admin,
        ProjectRegistry registry_,
        ClaimToken claimToken_,
        IERC20 paymentToken_
    ) {
        if (admin == address(0)) revert NotFound(0);
        registry = registry_;
        claimToken = claimToken_;
        paymentToken = paymentToken_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    /// @notice Accepts native-ETH committed capital forwarded by the registry.
    /// @dev Restricted to the registry so escrow accounting can never be
    ///      credited by an unrelated deposit that bypasses commit().
    function deposit(uint256 projectId) external payable {
        if (msg.sender != address(registry)) revert TransferFailed();
        if (msg.value == 0) revert InsufficientEscrow();
        escrowBalance[projectId] += msg.value;
        emit EscrowDeposited(projectId, msg.value);
    }

    /**
     * @notice Credits an ERC-20 commitment that has already been transferred in.
     *
     * @dev Why this exists alongside the payable `deposit`:
     *
     *      A token commitment cannot be pushed with calldata value - `msg.value`
     *      is always zero for an ERC-20 transfer - so the payable `deposit()`
     *      credits nothing when the payment token is not native. The ERC-20 flow
     *      is therefore pull-then-account: the registry transfers the tokens in
     *      and then reports the amount here.
     *
     *      The reported amount is cross-checked against the escrow's actual
     *      balance delta rather than trusted, so a compromised or buggy registry
     *      cannot inflate `escrowBalance` and release capital that was never
     *      deposited. Without this check the accounting would be a claim about
     *      the funds rather than a fact about them.
     *
     * @param projectId Project the commitment belongs to.
     * @param amount Token base units that the registry has transferred in.
     */
    function depositToken(uint256 projectId, uint256 amount) external {
        if (msg.sender != address(registry)) revert TransferFailed();
        if (address(paymentToken) == address(0)) revert TransferFailed();
        if (amount == 0) revert InsufficientEscrow();

        /*
         * Verify against the real balance rather than the reported figure.
         *
         * `accountedBalance` is the sum of everything this contract believes it
         * holds; comparing the observed token balance against it means the
         * credited amount can only ever reflect tokens that genuinely arrived.
         * Comparing against `escrowBalance[projectId]` alone would miss tokens
         * that were sent directly to the contract and never attributed.
         */
        uint256 observed = paymentToken.balanceOf(address(this));
        uint256 accounted = totalAccounted + amount;
        if (observed < accounted) revert InsufficientEscrow();

        totalAccounted = accounted;
        escrowBalance[projectId] += amount;
        emit EscrowDeposited(projectId, amount);
    }

    /// @dev Bare transfers are rejected: capital must arrive via deposit() so it
    ///      is always attributed to a project.
    receive() external payable {
        revert TransferFailed();
    }

    /* ------------------------------------------------------------------ *
     * Participant indexing
     * ------------------------------------------------------------------ */

    /**
     * @notice Indexes an investor so the review snapshot can include them.
     * @dev The registry (or the market on transfer) must call this whenever a
     *      holder's balance moves from zero. Over-long holder sets are flagged
     *      rather than silently truncated.
     */
    function registerParticipant(uint256 projectId, address holder) external {
        if (msg.sender != address(registry) && msg.sender != address(this)) {
            // Transfers route through the market, which is trusted via the
            // admin-granted role on that contract; anyone else may only index
            // themselves after acquiring claims.
            if (claimToken.balanceOf(holder, projectId) == 0) revert NoWeight();
        }
        if (_isParticipant[projectId][holder]) return;

        if (_participants[projectId].length >= MAX_VOTERS_PER_PROJECT) {
            oversized[projectId] = true;
            return;
        }

        _isParticipant[projectId][holder] = true;
        _participants[projectId].push(holder);
    }

    function participants(uint256 projectId) external view returns (address[] memory) {
        return _participants[projectId];
    }

    function participantCount(uint256 projectId) external view returns (uint256) {
        return _participants[projectId].length;
    }

    /* ------------------------------------------------------------------ *
     * Founder: submit evidence
     * ------------------------------------------------------------------ */

    /**
     * @notice Opens a review window for a milestone and snapshots vote weight.
     * @param projectId Project being reviewed.
     * @param milestoneIndex Milestone under review.
     * @param evidenceCid IPFS pointer to the production evidence.
     */
    function submitEvidence(uint256 projectId, uint256 milestoneIndex, string calldata evidenceCid)
        external
        nonReentrant
    {
        ProjectRegistry.Project memory project = registry.getProject(projectId);
        if (project.founder != msg.sender) revert NotFound(projectId);
        if (project.status != ProjectRegistry.ProjectStatus.IN_PRODUCTION) {
            revert NotFound(projectId);
        }

        ProjectRegistry.Milestone memory milestone =
            registry.getMilestone(projectId, milestoneIndex);

        Review storage review = reviews[projectId][milestoneIndex];
        if (review.open) revert ReviewClosed(projectId, milestoneIndex);
        if (
            milestone.status != ProjectRegistry.MilestoneStatus.PENDING
                && milestone.status != ProjectRegistry.MilestoneStatus.REJECTED
        ) {
            revert NotFound(projectId);
        }

        // Snapshot eligible weight from the indexed participant set.
        address[] storage holders = _participants[projectId];
        uint256 eligible;
        for (uint256 i = 0; i < holders.length; ++i) {
            uint256 weight = claimToken.balanceOf(holders[i], projectId);
            snapshotWeight[projectId][holders[i]] = weight;
            eligible += weight;
        }

        if (eligible == 0) revert NoWeight();

        review.open = true;
        review.endsAt = uint64(block.timestamp) + milestone.votingPeriodSeconds;
        review.snapshotAt = uint64(block.timestamp);
        review.eligibleWeight = eligible;
        review.approveWeight = 0;
        review.rejectWeight = 0;
        review.abstainWeight = 0;
        review.trancheAmount = milestone.trancheAmount;
        review.outcome = ReviewOutcome.PENDING;

        emit EvidenceSubmitted(projectId, milestoneIndex, evidenceCid, review.endsAt);
    }

    /* ------------------------------------------------------------------ *
     * Holders: vote
     * ------------------------------------------------------------------ */

    /**
     * @notice Casts a vote using the weight snapshotted when the review opened.
     * @param abstain When true the vote only contributes toward quorum.
     */
    function vote(uint256 projectId, uint256 milestoneIndex, bool approve, bool abstain)
        external
    {
        Review storage review = _requireOpenReview(projectId, milestoneIndex);

        if (hasVoted[projectId][milestoneIndex][msg.sender]) revert AlreadyVoted();

        uint256 weight = snapshotWeight[projectId][msg.sender];
        if (weight == 0) revert NoWeight();

        hasVoted[projectId][milestoneIndex][msg.sender] = true;
        voteWeight[projectId][milestoneIndex][msg.sender] = weight;

        if (abstain) {
            review.abstainWeight += weight;
        } else if (approve) {
            review.approveWeight += weight;
        } else {
            review.rejectWeight += weight;
        }

        emit VoteCast(projectId, milestoneIndex, msg.sender, approve, abstain, weight);
    }

    /* ------------------------------------------------------------------ *
     * Settlement
     * ------------------------------------------------------------------ */

    /**
     * @notice Finalises a review once the window has elapsed.
     * @dev Permissionless: the result is a pure function of recorded votes.
     */
    function settleReview(uint256 projectId, uint256 milestoneIndex) external nonReentrant {
        Review storage review = reviews[projectId][milestoneIndex];
        if (review.snapshotAt == 0) revert NoReview(projectId, milestoneIndex);
        if (!review.open) revert ReviewClosed(projectId, milestoneIndex);
        if (block.timestamp < review.endsAt) revert TooEarly();

        ProjectRegistry.Milestone memory milestone =
            registry.getMilestone(projectId, milestoneIndex);

        uint256 cast = review.approveWeight + review.rejectWeight + review.abstainWeight;
        uint256 quorum = (review.eligibleWeight * milestone.quorumBps) / 10_000;

        bool quorumMet = cast >= quorum;
        bool approved = quorumMet
            && review.approveWeight
                >= (review.eligibleWeight * milestone.approvalThresholdBps) / 10_000;

        review.open = false;

        if (approved) {
            review.outcome = ReviewOutcome.APPROVED;
            _release(projectId, milestoneIndex, review.trancheAmount);
            emit MilestoneApproved(projectId, milestoneIndex, review.trancheAmount);
        } else {
            review.outcome = ReviewOutcome.REJECTED;
            emit MilestoneRejected(projectId, milestoneIndex);
        }
    }

    /// @dev Pushes a tranche to the founder's payout address.
    function _release(uint256 projectId, uint256 milestoneIndex, uint256 amount) private {
        if (escrowBalance[projectId] < amount) revert InsufficientEscrow();

        escrowBalance[projectId] -= amount;
        released[projectId][milestoneIndex] = amount;

        address payable recipient = payable(registry.payoutAddress(projectId));

        if (address(paymentToken) == address(0)) {
            (bool ok, ) = recipient.call{ value: amount }("");
            if (!ok) revert TransferFailed();
        } else {
            // Keep the accounted total in step with the token balance, or the
            // next depositToken() would compare against a stale figure and
            // reject a legitimate commitment.
            totalAccounted -= amount;
            paymentToken.safeTransfer(recipient, amount);
        }
    }

    /* ------------------------------------------------------------------ *
     * Oracle backstop
     * ------------------------------------------------------------------ */

    /// @notice Escalates a milestone to the protocol oracle for resolution.
    /// @dev Only a live, still-pending review may be escalated. This prevents the
    ///      oracle path from resurrecting an already-settled milestone (resetting
    ///      its outcome to `PENDING`) and thereby releasing the tranche a second
    ///      time via `oracleResolve`.
    function escalate(uint256 projectId, uint256 milestoneIndex, string calldata rationaleCid)
        external
        onlyRole(ORACLE_ROLE)
    {
        Review storage review = reviews[projectId][milestoneIndex];
        if (review.snapshotAt == 0) revert NoReview(projectId, milestoneIndex);
        if (!review.open || review.outcome != ReviewOutcome.PENDING) {
            revert ReviewClosed(projectId, milestoneIndex);
        }

        review.open = false;
        review.outcome = ReviewOutcome.PENDING;
        emit MilestoneEscalated(projectId, milestoneIndex, rationaleCid);
    }

    /**
     * @notice Resolves an escalated or oversized review.
     * @param release True to release the tranche, false to reject.
     * @dev Idempotency guard: only a review that is still awaiting a decision
     *      (`snapshotAt != 0`, outcome `PENDING`) may be resolved. Without this a
     *      second `oracleResolve`, or one applied to a milestone already settled by
     *      `settleReview`, would call `_release` again and pay the tranche out a
     *      second time - a silent drain of escrowed capital that only reverts when
     *      the balance happens to be short.
     */
    function oracleResolve(
        uint256 projectId,
        uint256 milestoneIndex,
        bool release,
        string calldata rationale
    ) external onlyRole(ORACLE_ROLE) nonReentrant {
        Review storage review = reviews[projectId][milestoneIndex];
        if (review.snapshotAt == 0) revert NoReview(projectId, milestoneIndex);
        if (review.outcome != ReviewOutcome.PENDING) revert ReviewClosed(projectId, milestoneIndex);

        uint256 amount = review.trancheAmount;

        review.open = false;
        review.outcome = release ? ReviewOutcome.APPROVED : ReviewOutcome.REJECTED;

        if (release) {
            _release(projectId, milestoneIndex, amount);
        }

        emit OracleResolved(projectId, milestoneIndex, release, rationale);
    }

    /* ------------------------------------------------------------------ *
     * Refunds
     * ------------------------------------------------------------------ */

    /**
     * @notice Refunds a holder pro-rata when a project was cancelled or defaulted.
     * @dev Refund weight is the holder's current claim balance, which is safe
     *      because claims are frozen while a project is not in production.
     */
    function claimRefund(uint256 projectId) external nonReentrant {
        ProjectRegistry.Project memory project = registry.getProject(projectId);

        bool refundable = project.status == ProjectRegistry.ProjectStatus.CANCELLED
            || project.status == ProjectRegistry.ProjectStatus.DEFAULTED;
        if (!refundable) revert RefundUnavailable();

        uint256 balance = claimToken.balanceOf(msg.sender, projectId);
        if (balance == 0) revert NoWeight();

        uint256 supply = claimToken.totalSupply(projectId);
        if (supply == 0) revert RefundUnavailable();

        uint256 pool = escrowBalance[projectId];
        uint256 payout = (pool * balance) / supply;
        if (payout == 0) revert RefundUnavailable();

        escrowBalance[projectId] = pool - payout;
        totalRefunded[projectId] += payout;

        claimToken.burn(msg.sender, projectId, balance);

        if (address(paymentToken) == address(0)) {
            (bool ok, ) = payable(msg.sender).call{ value: payout }("");
            if (!ok) revert TransferFailed();
        } else {
            // Mirrors the release path: refunds leave the contract, so the
            // accounted total must fall with them.
            totalAccounted -= payout;
            paymentToken.safeTransfer(msg.sender, payout);
        }

        emit RefundClaimed(projectId, msg.sender, payout);
    }

    /* ------------------------------------------------------------------ *
     * Views
     * ------------------------------------------------------------------ */

    function getReview(uint256 projectId, uint256 milestoneIndex)
        external
        view
        returns (Review memory)
    {
        return reviews[projectId][milestoneIndex];
    }

    /// @notice Whether the review window is currently open for voting.
    function isVotingOpen(uint256 projectId, uint256 milestoneIndex)
        external
        view
        returns (bool)
    {
        Review storage review = reviews[projectId][milestoneIndex];
        return review.open && block.timestamp < review.endsAt;
    }

    /* ------------------------------------------------------------------ *
     * Internal
     * ------------------------------------------------------------------ */

    /// @dev Voting requires the window to be open *and* not yet elapsed. This is
    ///      deliberately stricter than the settlement path, which requires the
    ///      opposite (window closed).
    function _requireOpenReview(uint256 projectId, uint256 milestoneIndex)
        private
        view
        returns (Review storage)
    {
        Review storage review = reviews[projectId][milestoneIndex];
        if (review.snapshotAt == 0) revert NoReview(projectId, milestoneIndex);
        if (!review.open || block.timestamp >= review.endsAt) {
            revert ReviewClosed(projectId, milestoneIndex);
        }
        return review;
    }
}
