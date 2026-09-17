// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC1155Holder } from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

import { ClaimToken } from "./ClaimToken.sol";
import { ProjectRegistry } from "./ProjectRegistry.sol";
import { MilestoneEscrow } from "./MilestoneEscrow.sol";

/**
 * @title SecondaryMarket
 * @notice Peer-to-peer listing and settlement of claims, with escrowed asks and
 *         protocol-fee accounting.
 *
 * Design notes:
 *  - Sellers escrow their claims into this contract when listing. That removes
 *    the "seller moved the tokens" failure mode entirely, at the cost of needing
 *    an explicit cancel path.
 *  - A flat protocol fee on settlement funds oracle operations; the fee is
 *    snapshotted per listing so a later fee change cannot alter an open order.
 *  - Settlement pulls the buyer's payment and splits it seller/fee/t residual in
 *    one transaction, so no intermediate custody exists.
 */
contract SecondaryMarket is AccessControl, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;

    /* ------------------------------------------------------------------ *
     * Roles
     * ------------------------------------------------------------------ */

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /* ------------------------------------------------------------------ *
     * Types
     * ------------------------------------------------------------------ */

    struct Listing {
        uint256 id;
        uint256 projectId;
        address seller;
        uint256 amount;
        uint256 remaining;
        uint256 pricePerUnit;
        uint16 feeBps;
        uint64 createdAt;
        uint64 expiresAt;
        bool active;
    }

    /* ------------------------------------------------------------------ *
     * Storage
     * ------------------------------------------------------------------ */

    ClaimToken public immutable claimToken;
    ProjectRegistry public immutable registry;
    MilestoneEscrow public immutable escrow;
    IERC20 public immutable paymentToken;
    address public immutable feeRecipient;

    uint256 public nextListingId = 1;

    mapping(uint256 => Listing) private _listings;

    /// @notice Project id => active listing ids.
    mapping(uint256 => uint256[]) private _projectListings;

    /// @notice Protocol fee on secondary settlement, in basis points.
    uint16 public feeBps = 100;

    /// @notice Accumulated fees awaiting withdrawal.
    uint256 public accruedFees;

    /* ------------------------------------------------------------------ *
     * Events
     * ------------------------------------------------------------------ */

    event Listed(
        uint256 indexed listingId,
        uint256 indexed projectId,
        address indexed seller,
        uint256 amount,
        uint256 pricePerUnit
    );
    event ListingCancelled(uint256 indexed listingId);
    event Sold(
        uint256 indexed listingId,
        uint256 indexed projectId,
        address indexed buyer,
        address seller,
        uint256 amount,
        uint256 gross,
        uint256 fee
    );
    event FeeUpdated(uint16 feeBps);
    event FeesWithdrawn(address indexed to, uint256 amount);

    /* ------------------------------------------------------------------ *
     * Errors
     * ------------------------------------------------------------------ */

    error NotFound(uint256 listingId);
    error NotSeller();
    error NotActive();
    error ExpiredListing();
    error ZeroAmount();
    error InsufficientClaims();
    error WrongPayment();
    error TransferFailed();
    error FeeTooHigh();

    /* ------------------------------------------------------------------ *
     * Construction
     * ------------------------------------------------------------------ */

    constructor(
        address admin,
        ClaimToken claimToken_,
        ProjectRegistry registry_,
        MilestoneEscrow escrow_,
        IERC20 paymentToken_,
        address feeRecipient_
    ) {
        if (admin == address(0) || feeRecipient_ == address(0)) revert ZeroAmount();
        claimToken = claimToken_;
        registry = registry_;
        escrow = escrow_;
        paymentToken = paymentToken_;
        feeRecipient = feeRecipient_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /* ------------------------------------------------------------------ *
     * Admin
     * ------------------------------------------------------------------ */

    function setFeeBps(uint16 feeBps_) external onlyRole(ADMIN_ROLE) {
        if (feeBps_ > 1_000) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function withdrawFees() external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 amount = accruedFees;
        if (amount == 0) revert ZeroAmount();
        accruedFees = 0;

        if (address(paymentToken) == address(0)) {
            (bool ok, ) = payable(feeRecipient).call{ value: amount }("");
            if (!ok) revert TransferFailed();
        } else {
            paymentToken.safeTransfer(feeRecipient, amount);
        }

        emit FeesWithdrawn(feeRecipient, amount);
    }

    /* ------------------------------------------------------------------ *
     * Listing
     * ------------------------------------------------------------------ */

    /**
     * @notice Lists claims for sale, escrowing them in this contract.
     * @param projectId Project whose claims are offered.
     * @param amount Claim units to sell.
     * @param pricePerUnit Ask price per unit, in wei.
     * @param expiresAt Unix seconds after which the listing cannot be filled.
     */
    function list(uint256 projectId, uint256 amount, uint256 pricePerUnit, uint64 expiresAt)
        external
        nonReentrant
        returns (uint256 listingId)
    {
        if (amount == 0 || pricePerUnit == 0) revert ZeroAmount();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert ExpiredListing();

        listingId = nextListingId++;

        _listings[listingId] = Listing({
            id: listingId,
            projectId: projectId,
            seller: msg.sender,
            amount: amount,
            remaining: amount,
            pricePerUnit: pricePerUnit,
            feeBps: feeBps,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            active: true
        });

        _projectListings[projectId].push(listingId);

        // Escrow the claims so a listing can never be unfillable.
        claimToken.safeTransferFrom(msg.sender, address(this), projectId, amount, "");

        emit Listed(listingId, projectId, msg.sender, amount, pricePerUnit);
    }

    /// @notice Cancels a listing and returns the unsold claims to the seller.
    function cancel(uint256 listingId) external nonReentrant {
        Listing storage listing = _requireListing(listingId);
        if (listing.seller != msg.sender) revert NotSeller();
        if (!listing.active) revert NotActive();

        uint256 remaining = listing.remaining;
        listing.active = false;
        listing.remaining = 0;

        claimToken.safeTransferFrom(address(this), listing.seller, listing.projectId, remaining, "");

        emit ListingCancelled(listingId);
    }

    /* ------------------------------------------------------------------ *
     * Settlement
     * ------------------------------------------------------------------ */

    /// @notice Buys `amount` units from a listing at its ask price.
    function buy(uint256 listingId, uint256 amount) external payable nonReentrant {
        Listing storage listing = _requireListing(listingId);
        if (!listing.active) revert NotActive();
        if (listing.expiresAt != 0 && block.timestamp >= listing.expiresAt) {
            revert ExpiredListing();
        }
        if (amount == 0) revert ZeroAmount();
        if (amount > listing.remaining) revert InsufficientClaims();

        uint256 gross = amount * listing.pricePerUnit;
        uint256 fee = (gross * listing.feeBps) / 10_000;
        uint256 proceeds = gross - fee;

        _collect(gross);

        listing.remaining -= amount;
        if (listing.remaining == 0) listing.active = false;

        accruedFees += fee;

        // Claims leave escrow to the buyer.
        claimToken.safeTransferFrom(address(this), msg.sender, listing.projectId, amount, "");

        // Index the buyer so milestone snapshots include them.
        escrow.registerParticipant(listing.projectId, msg.sender);

        _payout(listing.seller, proceeds);

        emit Sold(
            listingId,
            listing.projectId,
            msg.sender,
            listing.seller,
            amount,
            gross,
            fee
        );
    }

    /// @notice Returns the total cost of buying `amount` units from a listing.
    function quote(uint256 listingId, uint256 amount) external view returns (uint256 gross) {
        Listing storage listing = _listings[listingId];
        return amount * listing.pricePerUnit;
    }

    /* ------------------------------------------------------------------ *
     * Views
     * ------------------------------------------------------------------ */

    function getListing(uint256 listingId) external view returns (Listing memory) {
        if (_listings[listingId].id == 0) revert NotFound(listingId);
        return _listings[listingId];
    }

    /// @dev Resolves the diamond between AccessControl and ERC1155Holder so the
    ///      market advertises both its role interface and ERC-1155 receiver.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @notice All listing ids ever created for a project (active or not).
    function projectListings(uint256 projectId) external view returns (uint256[] memory) {
        return _projectListings[projectId];
    }

    /// @notice Lowest active ask for a project; zero when none.
    function floorPrice(uint256 projectId) external view returns (uint256 floor) {
        uint256[] storage ids = _projectListings[projectId];
        for (uint256 i = 0; i < ids.length; ++i) {
            Listing storage listing = _listings[ids[i]];
            if (!listing.active) continue;
            if (listing.expiresAt != 0 && block.timestamp >= listing.expiresAt) continue;
            if (floor == 0 || listing.pricePerUnit < floor) floor = listing.pricePerUnit;
        }
    }

    /// @notice Liquidity depth: total units currently offered for a project.
    function askDepth(uint256 projectId) external view returns (uint256 depth) {
        uint256[] storage ids = _projectListings[projectId];
        for (uint256 i = 0; i < ids.length; ++i) {
            Listing storage listing = _listings[ids[i]];
            if (!listing.active) continue;
            depth += listing.remaining;
        }
    }

    /* ------------------------------------------------------------------ *
     * Internal
     * ------------------------------------------------------------------ */

    function _requireListing(uint256 listingId) private view returns (Listing storage) {
        Listing storage listing = _listings[listingId];
        if (listing.id == 0) revert NotFound(listingId);
        return listing;
    }

    function _collect(uint256 gross) private {
        if (address(paymentToken) == address(0)) {
            if (msg.value != gross) revert WrongPayment();
        } else {
            if (msg.value != 0) revert WrongPayment();
            paymentToken.safeTransferFrom(msg.sender, address(this), gross);
        }
    }

    function _payout(address to, uint256 amount) private {
        if (address(paymentToken) == address(0)) {
            (bool ok, ) = payable(to).call{ value: amount }("");
            if (!ok) revert TransferFailed();
        } else {
            paymentToken.safeTransfer(to, amount);
        }
    }
}
