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

    /**
     * @notice A resting buy order. The buyer escrows `amount * pricePerUnit` of
     *         the payment token up front (mirroring how a seller escrows claims
     *         in a listing), so a bid is real capital, not intent.
     * @dev Funds are tracked as a cash balance in `_bidEscrow`, independent of
     *      `remaining`: a taker bid that crosses a cheaper ask spends only the
     *      ask price, and the price-improvement surplus is refunded on fill or
     *      cancel. Deriving the refund from `remaining * pricePerUnit` would
     *      strand that surplus.
     */
    struct Bid {
        uint256 id;
        uint256 projectId;
        address buyer;
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

    uint256 public nextBidId = 1;

    mapping(uint256 => Bid) private _bids;

    /// @notice Project id => bid ids ever placed (active or not).
    mapping(uint256 => uint256[]) private _projectBids;

    /// @notice Bid id => unspent escrowed payment held by this contract.
    mapping(uint256 => uint256) public bidEscrow;

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
    event BidPlaced(
        uint256 indexed bidId,
        uint256 indexed projectId,
        address indexed buyer,
        uint256 amount,
        uint256 pricePerUnit
    );
    event BidCancelled(uint256 indexed bidId);
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
    error NotBuyer();
    error UnknownBid(uint256 bidId);

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

        // Newly resting ask is the taker against any bids already on the book.
        _matchListingAgainstBids(listingId);
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
     * Bids
     * ------------------------------------------------------------------ */

    /**
     * @notice Places a resting buy order, escrowing its full notional in the
     *         payment token, and crosses it against any asks priced at or below
     *         `pricePerUnit`.
     * @param projectId Project whose claims are being bid on.
     * @param amount Claim units to buy.
     * @param pricePerUnit Bid price per unit, in wei (payment-token smallest unit).
     * @param expiresAt Unix seconds after which the bid stops resting (0 = none).
     */
    function placeBid(uint256 projectId, uint256 amount, uint256 pricePerUnit, uint64 expiresAt)
        external
        payable
        nonReentrant
        returns (uint256 bidId)
    {
        if (amount == 0 || pricePerUnit == 0) revert ZeroAmount();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert ExpiredListing();

        bidId = nextBidId++;
        uint256 gross = amount * pricePerUnit;

        _bids[bidId] = Bid({
            id: bidId,
            projectId: projectId,
            buyer: msg.sender,
            amount: amount,
            remaining: amount,
            pricePerUnit: pricePerUnit,
            feeBps: feeBps,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            active: true
        });

        _projectBids[projectId].push(bidId);
        bidEscrow[bidId] = gross;
        _collect(gross);

        emit BidPlaced(bidId, projectId, msg.sender, amount, pricePerUnit);

        _matchBidAgainstAsks(bidId);
    }

    /// @notice Cancels a resting bid and refunds its unspent escrow to the buyer.
    function cancelBid(uint256 bidId) external nonReentrant {
        Bid storage bid = _requireBid(bidId);
        if (bid.buyer != msg.sender) revert NotBuyer();
        if (!bid.active) revert NotActive();

        bid.active = false;
        bid.remaining = 0;
        _refundBid(bidId);

        emit BidCancelled(bidId);
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

    function getBid(uint256 bidId) external view returns (Bid memory) {
        if (_bids[bidId].id == 0) revert UnknownBid(bidId);
        return _bids[bidId];
    }

    /// @notice All bid ids ever placed for a project (active or not).
    function projectBids(uint256 projectId) external view returns (uint256[] memory) {
        return _projectBids[projectId];
    }

    /// @notice Highest active bid for a project; zero when none.
    function bestBid(uint256 projectId) external view returns (uint256 best) {
        uint256[] storage ids = _projectBids[projectId];
        for (uint256 i = 0; i < ids.length; ++i) {
            Bid storage bid = _bids[ids[i]];
            if (!bid.active) continue;
            if (bid.expiresAt != 0 && block.timestamp >= bid.expiresAt) continue;
            if (bid.pricePerUnit > best) best = bid.pricePerUnit;
        }
    }

    /// @notice Bid-side depth: total units currently bid for a project.
    function bidDepth(uint256 projectId) external view returns (uint256 depth) {
        uint256[] storage ids = _projectBids[projectId];
        for (uint256 i = 0; i < ids.length; ++i) {
            Bid storage bid = _bids[ids[i]];
            if (!bid.active) continue;
            if (bid.expiresAt != 0 && block.timestamp >= bid.expiresAt) continue;
            depth += bid.remaining;
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

    function _requireBid(uint256 bidId) private view returns (Bid storage bid) {
        bid = _bids[bidId];
        if (bid.id == 0) revert UnknownBid(bidId);
    }

    /// @dev Returns the escrowed, unspent payment of a bid to its buyer.
    function _refundBid(uint256 bidId) private {
        uint256 amount = bidEscrow[bidId];
        if (amount == 0) return;
        bidEscrow[bidId] = 0;
        _payout(_bids[bidId].buyer, amount);
    }

    /**
     * @dev Cross a freshly placed bid against resting asks (price-time: lowest
     *      ask first, ties by lowest id), executing at the maker ask price.
     */
    function _matchBidAgainstAsks(uint256 bidId) private {
        Bid storage bid = _bids[bidId];
        while (bid.remaining > 0 && bid.active) {
            uint256 askId = _bestAskToSell(bid.projectId, bid.pricePerUnit);
            if (askId == 0) break;
            Listing storage ask = _listings[askId];
            uint256 fill = bid.remaining < ask.remaining ? bid.remaining : ask.remaining;
            _settleFill(ask, bid, fill, ask.pricePerUnit);
        }
        if (bid.remaining == 0) {
            bid.active = false;
            _refundBid(bidId);
        }
    }

    /**
     * @dev Cross a freshly placed ask against resting bids (highest bid first,
     *      ties by lowest id), executing at the maker bid price.
     */
    function _matchListingAgainstBids(uint256 listingId) private {
        Listing storage ask = _listings[listingId];
        while (ask.remaining > 0 && ask.active) {
            uint256 bidId = _bestBidToBuy(ask.projectId, ask.pricePerUnit);
            if (bidId == 0) break;
            Bid storage bid = _bids[bidId];
            uint256 fill = ask.remaining < bid.remaining ? ask.remaining : bid.remaining;
            _settleFill(ask, bid, fill, bid.pricePerUnit);
            if (bid.remaining == 0) {
                bid.active = false;
                _refundBid(bidId);
            }
        }
    }

    /// @dev Best active, unexpired ask at or below `maxPrice`; lowest price wins.
    function _bestAskToSell(uint256 projectId, uint256 maxPrice)
        private
        view
        returns (uint256 bestId)
    {
        uint256[] storage ids = _projectListings[projectId];
        uint256 bestPrice;
        for (uint256 i = 0; i < ids.length; ++i) {
            Listing storage l = _listings[ids[i]];
            if (!l.active) continue;
            if (l.expiresAt != 0 && block.timestamp >= l.expiresAt) continue;
            if (l.pricePerUnit > maxPrice) continue;
            if (bestId == 0 || l.pricePerUnit < bestPrice) {
                bestId = l.id;
                bestPrice = l.pricePerUnit;
            }
        }
    }

    /// @dev Best active, unexpired bid at or above `minPrice`; highest price wins.
    function _bestBidToBuy(uint256 projectId, uint256 minPrice)
        private
        view
        returns (uint256 bestId)
    {
        uint256[] storage ids = _projectBids[projectId];
        uint256 bestPrice;
        for (uint256 i = 0; i < ids.length; ++i) {
            Bid storage b = _bids[ids[i]];
            if (!b.active) continue;
            if (b.expiresAt != 0 && block.timestamp >= b.expiresAt) continue;
            if (b.pricePerUnit < minPrice) continue;
            if (bestId == 0 || b.pricePerUnit > bestPrice) {
                bestId = b.id;
                bestPrice = b.pricePerUnit;
            }
        }
    }

    /**
     * @dev Settles one crossing: claims move from the ask's escrow to the buyer,
     *      payment moves from the bid's escrow to the seller (net of fee).
     */
    function _settleFill(Listing storage ask, Bid storage bid, uint256 fill, uint256 price)
        private
    {
        uint256 gross = fill * price;
        uint256 fee = (gross * ask.feeBps) / 10_000;
        uint256 proceeds = gross - fee;

        ask.remaining -= fill;
        if (ask.remaining == 0) ask.active = false;
        bid.remaining -= fill;

        bidEscrow[bid.id] -= gross;

        claimToken.safeTransferFrom(address(this), bid.buyer, bid.projectId, fill, "");
        escrow.registerParticipant(bid.projectId, bid.buyer);
        accruedFees += fee;
        _payout(ask.seller, proceeds);

        emit Sold(ask.id, bid.projectId, bid.buyer, ask.seller, fill, gross, fee);
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
