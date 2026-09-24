// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ClaimToken } from "./ClaimToken.sol";
import { MilestoneEscrow } from "./MilestoneEscrow.sol";

/**
 * @title ProjectRegistry
 * @notice Source of truth for tokenized hardware projects and their funding
 *         state. Founders register a project, commit capital against it, and the
 *         registry mints claims and forwards the funds into MilestoneEscrow.
 *
 * Design notes:
 *  - The registry owns the project/milestone schedule; MilestoneEscrow owns the
 *    money. Payments are pushed to escrow at commit time so escrow custody is
 *    never split across contracts.
 *  - Funding uses a fixed price per claim unit, which makes the raise
 *    deterministic and avoids bonding-curve complexity on a hackathon timeline.
 *  - A `settleFunding` transition is deliberately explicit (not pure time-based
 *    in view functions) so status cannot flip mid-transaction.
 */
contract ProjectRegistry is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ------------------------------------------------------------------ *
     * Roles
     * ------------------------------------------------------------------ */

    bytes32 public constant FOUNDER_ROLE = keccak256("FOUNDER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /* ------------------------------------------------------------------ *
     * Types
     * ------------------------------------------------------------------ */

    enum ProjectStatus {
        DRAFT,
        FUNDING,
        IN_PRODUCTION,
        COMPLETED,
        CANCELLED,
        DEFAULTED
    }

    enum MilestoneStatus {
        PENDING,
        EVIDENCE,
        APPROVED,
        REJECTED,
        DISPUTED
    }

    struct Milestone {
        string title;
        string description;
        uint256 trancheAmount;
        uint64 dueAt;
        uint32 votingPeriodSeconds;
        uint16 approvalThresholdBps;
        uint16 quorumBps;
        MilestoneStatus status;
    }

    struct Project {
        uint256 id;
        address founder;
        string title;
        string tagline;
        string metadataCid;
        string coverCid;
        uint256 claimPrice;
        uint256 totalClaims;
        uint256 claimsCommitted;
        uint256 target;
        uint256 totalCommitted;
        uint64 fundingDeadline;
        uint64 createdAt;
        uint64 updatedAt;
        ProjectStatus status;
        bool milestonesInitialised;
    }

    /* ------------------------------------------------------------------ *
     * Storage
     * ------------------------------------------------------------------ */

    /// @notice Payment token used for commitments. Zero address = native ETH.
    IERC20 public immutable paymentToken;

    ClaimToken public immutable claimToken;

    /// @notice Escrow contract that custodies committed capital.
    address public escrow;

    uint256 public nextProjectId = 1;

    mapping(uint256 => Project) private _projects;
    mapping(uint256 => Milestone[]) private _milestones;

    /// @notice Project id => founder's payout address (may differ from creator).
    mapping(uint256 => address) public payoutAddress;

    /* ------------------------------------------------------------------ *
     * Events
     * ------------------------------------------------------------------ */

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed founder,
        string title,
        uint256 target,
        uint256 claimPrice,
        uint256 totalClaims,
        uint64 fundingDeadline
    );
    event MilestonesSet(uint256 indexed projectId, uint256 count, uint256 totalTranche);
    event FundingOpened(uint256 indexed projectId);
    event Committed(
        uint256 indexed projectId,
        address indexed investor,
        uint256 claimAmount,
        uint256 paid
    );
    event FundingSettled(uint256 indexed projectId, ProjectStatus status);
    event ProjectStatusChanged(uint256 indexed projectId, ProjectStatus status);
    event PayoutAddressUpdated(uint256 indexed projectId, address payoutAddress);
    event EscrowUpdated(address escrow);

    /* ------------------------------------------------------------------ *
     * Errors
     * ------------------------------------------------------------------ */

    error NotFound(uint256 projectId);
    error NotFounder(uint256 projectId, address caller);
    error InvalidState(ProjectStatus current, ProjectStatus required);
    error InvalidSchedule();
    error FundingClosed(uint256 projectId);
    error SoldOut(uint256 projectId);
    error ZeroAmount();
    error DeadlineInPast();
    error EscrowDepositFailed();

    /* ------------------------------------------------------------------ *
     * Construction
     * ------------------------------------------------------------------ */

    /**
     * @param admin Protocol admin (multisig) receiving ADMIN_ROLE.
     * @param claimToken_ The ERC-1155 claim token, which must grant this
     *        contract MINTER_ROLE.
     * @param paymentToken_ ERC-20 used for commitments, or address(0) for ETH.
     */
    constructor(address admin, ClaimToken claimToken_, IERC20 paymentToken_) {
        if (admin == address(0)) revert ZeroAmount();
        claimToken = claimToken_;
        paymentToken = paymentToken_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @dev The registry must not custody funds; receive() only exists so the
    ///      escrow contract can refund native value without a separate path.
    receive() external payable {
        if (msg.sender != escrow) revert InvalidSchedule();
    }

    /* ------------------------------------------------------------------ *
     * Admin
     * ------------------------------------------------------------------ */

    function setEscrow(address escrow_) external onlyRole(ADMIN_ROLE) {
        if (escrow_ == address(0)) revert ZeroAmount();
        escrow = escrow_;
        emit EscrowUpdated(escrow_);
    }

    function setProjectStatus(uint256 projectId, ProjectStatus status)
        external
        onlyRole(ADMIN_ROLE)
    {
        Project storage project = _requireProject(projectId);
        project.status = status;
        project.updatedAt = uint64(block.timestamp);
        emit ProjectStatusChanged(projectId, status);
    }

    /* ------------------------------------------------------------------ *
     * Founder flows
     * ------------------------------------------------------------------ */

    /**
     * @notice Registers a new hardware project.
     * @dev The caller becomes the founder. Commits are impossible until
     *      `openFunding` is called with a milestone schedule.
     *
     * @param params Packed creation input; see CreateProjectParams.
     * @return projectId The newly assigned id.
     */
    struct CreateProjectParams {
        string title;
        string tagline;
        string metadataCid;
        string coverCid;
        uint256 target;
        uint256 claimPrice;
        uint256 totalClaims;
        uint64 fundingDeadline;
    }

    function createProject(CreateProjectParams calldata params)
        external
        nonReentrant
        returns (uint256 projectId)
    {
        if (params.target == 0 || params.claimPrice == 0 || params.totalClaims == 0) {
            revert ZeroAmount();
        }
        if (params.fundingDeadline <= block.timestamp) revert DeadlineInPast();

        projectId = nextProjectId++;

        _projects[projectId] = Project({
            id: projectId,
            founder: msg.sender,
            title: params.title,
            tagline: params.tagline,
            metadataCid: params.metadataCid,
            coverCid: params.coverCid,
            claimPrice: params.claimPrice,
            totalClaims: params.totalClaims,
            claimsCommitted: 0,
            target: params.target,
            totalCommitted: 0,
            fundingDeadline: params.fundingDeadline,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            status: ProjectStatus.DRAFT,
            milestonesInitialised: false
        });

        payoutAddress[projectId] = msg.sender;
        _grantRole(FOUNDER_ROLE, msg.sender);

        emit ProjectCreated(
            projectId,
            msg.sender,
            params.title,
            params.target,
            params.claimPrice,
            params.totalClaims,
            params.fundingDeadline
        );
    }

    /**
     * @notice Sets the escrow milestone schedule. Tranche amounts must sum to
     *         the funding target, otherwise the raise cannot be fully released.
     */
    function setMilestones(uint256 projectId, Milestone[] calldata milestones)
        external
    {
        Project storage project = _requireFounder(projectId);
        if (project.milestonesInitialised) revert InvalidState(project.status, ProjectStatus.DRAFT);
        if (milestones.length == 0) revert InvalidSchedule();

        uint256 totalTranche;
        for (uint256 i = 0; i < milestones.length; ++i) {
            Milestone calldata milestone = milestones[i];
            if (milestone.trancheAmount == 0) revert ZeroAmount();
            if (milestone.approvalThresholdBps > 10_000) revert InvalidSchedule();
            if (milestone.quorumBps > 10_000) revert InvalidSchedule();
            if (milestone.votingPeriodSeconds == 0) revert InvalidSchedule();
            totalTranche += milestone.trancheAmount;
            _milestones[projectId].push(
                Milestone({
                    title: milestone.title,
                    description: milestone.description,
                    trancheAmount: milestone.trancheAmount,
                    dueAt: milestone.dueAt,
                    votingPeriodSeconds: milestone.votingPeriodSeconds,
                    approvalThresholdBps: milestone.approvalThresholdBps,
                    quorumBps: milestone.quorumBps,
                    status: MilestoneStatus.PENDING
                })
            );
        }

        if (totalTranche != project.target) revert InvalidSchedule();

        project.milestonesInitialised = true;
        project.updatedAt = uint64(block.timestamp);

        emit MilestonesSet(projectId, milestones.length, totalTranche);
    }

    /// @notice Transitions DRAFT -> FUNDING so investors may commit.
    function openFunding(uint256 projectId) external {
        Project storage project = _requireFounder(projectId);
        if (project.status != ProjectStatus.DRAFT) {
            revert InvalidState(project.status, ProjectStatus.DRAFT);
        }
        if (!project.milestonesInitialised) revert InvalidSchedule();
        if (block.timestamp >= project.fundingDeadline) revert FundingClosed(projectId);

        project.status = ProjectStatus.FUNDING;
        project.updatedAt = uint64(block.timestamp);

        claimToken.registerProject(projectId, project.title);

        emit FundingOpened(projectId);
    }

    function setPayoutAddress(uint256 projectId, address payout) external {
        Project storage project = _requireFounder(projectId);
        if (payout == address(0)) revert ZeroAmount();
        payoutAddress[projectId] = payout;
        project.updatedAt = uint64(block.timestamp);
        emit PayoutAddressUpdated(projectId, payout);
    }

    /* ------------------------------------------------------------------ *
     * Investor flows
     * ------------------------------------------------------------------ */

    /**
     * @notice Commits capital and mints the corresponding claim units.
     * @param projectId Project to commit into.
     * @param claimAmount Number of claim units to purchase.
     */
    function commit(uint256 projectId, uint256 claimAmount)
        external
        payable
        nonReentrant
    {
        Project storage project = _requireProject(projectId);

        if (project.status != ProjectStatus.FUNDING) {
            revert InvalidState(project.status, ProjectStatus.FUNDING);
        }
        if (block.timestamp >= project.fundingDeadline) revert FundingClosed(projectId);
        if (claimAmount == 0) revert ZeroAmount();

        uint256 remaining = project.totalClaims - project.claimsCommitted;
        if (claimAmount > remaining) revert SoldOut(projectId);

        uint256 cost = claimAmount * project.claimPrice;

        if (address(paymentToken) == address(0)) {
            if (msg.value != cost) revert ZeroAmount();
        } else {
            if (msg.value != 0) revert ZeroAmount();
            paymentToken.safeTransferFrom(msg.sender, address(this), cost);
        }

        project.claimsCommitted += claimAmount;
        project.totalCommitted += cost;
        project.updatedAt = uint64(block.timestamp);

        claimToken.mint(msg.sender, projectId, claimAmount);

        /*
         * Forward the commitment into escrow custody.
         *
         * Both branches must credit the escrow's per-project balance, not just
         * move the asset. Previously the ERC-20 branch transferred the tokens
         * with `safeTransfer` but never called `deposit()`, so
         * `escrowBalance[projectId]` stayed at zero while the tokens sat in the
         * contract. That stranded the funds: `_release()` reverts with
         * InsufficientEscrow, and `claimRefund()` computes a payout of zero
         * against an empty pool. Native ETH was unaffected because it took the
         * `deposit{value:}` path.
         */
        if (address(paymentToken) == address(0)) {
            // The escrow's receive() is deliberately closed, so native value must
            // arrive through the payable deposit().
            MilestoneEscrow(payable(escrow)).deposit{ value: cost }(projectId);
        } else {
            // Tokens are pushed to the escrow, then accounted for. The transfer
            // happens first so the escrow's own balance check cannot fail on an
            // under-funded registry.
            paymentToken.safeTransfer(escrow, cost);
            // `escrow` is a plain `address`, and MilestoneEscrow declares a
            // payable receive(), so the cast must be payable-qualified even
            // though depositToken itself is non-payable.
            MilestoneEscrow(payable(escrow)).depositToken(projectId, cost);
        }

        emit Committed(projectId, msg.sender, claimAmount, cost);
    }

    /**
     * @notice Settles funding after the deadline (or on sell-out) and moves the
     *         project into production or refund mode.
     * @dev Anyone may call: the outcome is fully determined by state, so there is
     *      no reason to gate it, and gating it risks a stuck project.
     */
    function settleFunding(uint256 projectId) external {
        Project storage project = _requireProject(projectId);
        if (project.status != ProjectStatus.FUNDING) {
            revert InvalidState(project.status, ProjectStatus.FUNDING);
        }

        bool soldOut = project.claimsCommitted == project.totalClaims;
        bool deadlinePassed = block.timestamp >= project.fundingDeadline;
        if (!soldOut && !deadlinePassed) revert FundingClosed(projectId);

        bool funded = project.totalCommitted >= project.target;

        if (funded) {
            project.status = ProjectStatus.IN_PRODUCTION;
        } else {
            // Target missed: refunds are enabled on the escrow side.
            project.status = ProjectStatus.CANCELLED;
        }

        project.updatedAt = uint64(block.timestamp);
        emit FundingSettled(projectId, project.status);
    }

    /* ------------------------------------------------------------------ *
     * Views
     * ------------------------------------------------------------------ */

    function getProject(uint256 projectId) external view returns (Project memory) {
        if (_projects[projectId].id == 0) revert NotFound(projectId);
        return _projects[projectId];
    }

    function getMilestone(uint256 projectId, uint256 index)
        external
        view
        returns (Milestone memory)
    {
        if (_projects[projectId].id == 0) revert NotFound(projectId);
        return _milestones[projectId][index];
    }

    function getMilestones(uint256 projectId) external view returns (Milestone[] memory) {
        if (_projects[projectId].id == 0) revert NotFound(projectId);
        return _milestones[projectId];
    }

    function milestoneCount(uint256 projectId) external view returns (uint256) {
        return _milestones[projectId].length;
    }

    /// @notice Total capital still held in escrow for a project.
    function totalRaised(uint256 projectId) external view returns (uint256) {
        return _projects[projectId].totalCommitted;
    }

    /// @notice Remaining claim units available to commit.
    function claimsAvailable(uint256 projectId) external view returns (uint256) {
        Project storage project = _projects[projectId];
        return project.totalClaims - project.claimsCommitted;
    }

    /* ------------------------------------------------------------------ *
     * Internal
     * ------------------------------------------------------------------ */

    function _requireProject(uint256 projectId) private view returns (Project storage) {
        Project storage project = _projects[projectId];
        if (project.id == 0) revert NotFound(projectId);
        return project;
    }

    function _requireFounder(uint256 projectId) private view returns (Project storage) {
        Project storage project = _requireProject(projectId);
        if (project.founder != msg.sender) revert NotFounder(projectId, msg.sender);
        return project;
    }
}
