// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IProjectRegistry (read surface)
 * @notice Minimal view-only interface onto the deployed ProjectRegistry. The
 *         `Project` struct below MUST mirror `ProjectRegistry.Project` exactly
 *         (field order + types) or `getProject` decodes garbage. It is kept
 *         local so `FounderActivity` has no compile-time dependency on the full
 *         registry and can be deployed against an already-live registry without
 *         redeploying it.
 */
interface IProjectRegistry {
    enum ProjectStatus {
        DRAFT,
        FUNDING,
        IN_PRODUCTION,
        COMPLETED,
        CANCELLED,
        DEFAULTED
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

    function getProject(uint256 projectId) external view returns (Project memory);
}

/**
 * @title FounderActivity
 * @notice Social layer for ProtoRWA founders: a claimable founder profile, a
 *         founder-authored update feed, and a follow graph. Deployed standalone
 *         against the existing registry, so it never touches the money
 *         contracts.
 *
 * Design notes:
 *  - Trust surface is intentionally permissionless but *self-limiting*: an
 *    address only becomes a "founder" by proving ownership of a real project
 *    (a `registry.getProject(pid).founder == msg.sender` check) via
 *    `registerFounder` or by posting an update. Only those addresses can set a
 *    profile or be followed — so "only founders are followable" is enforced
 *    on-chain, not in the UI.
 *  - Content lives off-chain (IPFS). The chain stores only the CID + a
 *    timestamp + the authorship/ownership proof; the heavy update/profile bodies
 *    are pinned docs. This keeps writes cheap and the feed honest (a CID can be
 *    independently verified).
 *  - No reentrancy risk: the only external call is `getProject`, a view.
 */
contract FounderActivity {
    /* ------------------------------------------------------------------ *
     * Types
     * ------------------------------------------------------------------ */

    struct Update {
        uint256 id;
        uint256 projectId;
        address author;
        string cid;
        uint64 ts;
    }

    /* ------------------------------------------------------------------ *
     * Immutables
     * ------------------------------------------------------------------ */

    IProjectRegistry public immutable registry;

    /* ------------------------------------------------------------------ *
     * Storage
     * ------------------------------------------------------------------ */

    /// @dev An address is a founder once it has proven ownership of a project.
    mapping(address => bool) public isFounder;

    /// @dev Founder -> profile doc CID (name / avatar / bio JSON on IPFS).
    mapping(address => string) public profileCid;

    uint256 private _nextUpdateId = 1;

    mapping(uint256 => Update[]) private _projectUpdates;
    mapping(address => Update[]) private _founderUpdates;

    /// @dev follower => founder => following flag.
    mapping(address => mapping(address => bool)) private _following;

    /// @dev follower => list of followed founders, so the graph is enumerable
    ///      from the follower side (a viewer's feed needs "who do I follow?").
    mapping(address => address[]) private _followList;

    /// @dev founder => number of followers.
    mapping(address => uint256) public followerCount;

    /* ------------------------------------------------------------------ *
     * Events
     * ------------------------------------------------------------------ */

    event FounderRegistered(address indexed founder, uint256 proofProjectId);
    event ProfileSet(address indexed founder, string cid);
    event UpdatePosted(
        uint256 indexed updateId,
        uint256 indexed projectId,
        address indexed founder,
        string cid,
        uint64 ts
    );
    event Followed(address indexed follower, address indexed founder);
    event Unfollowed(address indexed follower, address indexed founder);

    /* ------------------------------------------------------------------ *
     * Errors
     * ------------------------------------------------------------------ */

    error NotProjectFounder(uint256 projectId, address caller);
    error NotAFollowableFounder(address target);
    error AlreadyFollowing(address target);
    error NotFollowing(address target);
    error SelfFollow();
    error EmptyCid();

    /* ------------------------------------------------------------------ *
     * Construction
     * ------------------------------------------------------------------ */

    constructor(IProjectRegistry registry_) {
        require(address(registry_) != address(0), "registry=0");
        registry = registry_;
    }

    /* ------------------------------------------------------------------ *
     * Founder onboarding
     * ------------------------------------------------------------------ */

    /**
     * @notice Claim founder status by proving ownership of `projectId`.
     *         Idempotent; a founder who already posted an update need not call
     *         this, but calling it lets a founder set up their page first.
     */
    function registerFounder(uint256 projectId) external {
        if (registry.getProject(projectId).founder != msg.sender) {
            revert NotProjectFounder(projectId, msg.sender);
        }
        if (!isFounder[msg.sender]) {
            isFounder[msg.sender] = true;
        }
        emit FounderRegistered(msg.sender, projectId);
    }

    /**
     * @notice Point the founder profile at an IPFS doc (JSON: display name,
     *         avatar CID, bio). Overwritable by the founder.
     */
    function setProfile(string calldata cid) external {
        if (!isFounder[msg.sender]) revert NotAFollowableFounder(msg.sender);
        if (bytes(cid).length == 0) revert EmptyCid();
        profileCid[msg.sender] = cid;
        emit ProfileSet(msg.sender, cid);
    }

    /* ------------------------------------------------------------------ *
     * Founder updates
     * ------------------------------------------------------------------ */

    /**
     * @notice Publish an update for a project the caller founded. `cid` is the
     *         IPFS doc (title / body / attachment CIDs). Posting also (re)affirms
     *         founder status, so it doubles as onboarding for a first update.
     */
    function postUpdate(uint256 projectId, string calldata cid) external returns (uint256 id) {
        if (registry.getProject(projectId).founder != msg.sender) {
            revert NotProjectFounder(projectId, msg.sender);
        }
        if (bytes(cid).length == 0) revert EmptyCid();

        isFounder[msg.sender] = true;

        uint64 ts = uint64(block.timestamp);
        id = _nextUpdateId++;
        Update memory entry = Update({id: id, projectId: projectId, author: msg.sender, cid: cid, ts: ts});
        _projectUpdates[projectId].push(entry);
        _founderUpdates[msg.sender].push(entry);

        emit UpdatePosted(id, projectId, msg.sender, cid, ts);
    }

    /* ------------------------------------------------------------------ *
     * Follow graph
     * ------------------------------------------------------------------ */

    function follow(address founder) external {
        if (founder == msg.sender) revert SelfFollow();
        if (!isFounder[founder]) revert NotAFollowableFounder(founder);
        if (_following[msg.sender][founder]) revert AlreadyFollowing(founder);

        _following[msg.sender][founder] = true;
        _followList[msg.sender].push(founder);
        unchecked {
            ++followerCount[founder];
        }
        emit Followed(msg.sender, founder);
    }

    function unfollow(address founder) external {
        if (!_following[msg.sender][founder]) revert NotFollowing(founder);

        _following[msg.sender][founder] = false;
        _removeFromFollowList(msg.sender, founder);
        unchecked {
            --followerCount[founder];
        }
        emit Unfollowed(msg.sender, founder);
    }

    /// @dev Swap-pop `founder` out of `follower`'s list. Order is not preserved;
    ///      a feed re-sorts by update timestamp anyway.
    function _removeFromFollowList(address follower, address founder) private {
        address[] storage list = _followList[follower];
        for (uint256 i = 0; i < list.length; ++i) {
            if (list[i] == founder) {
                list[i] = list[list.length - 1];
                list.pop();
                return;
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Views
     * ------------------------------------------------------------------ */

    function isFollowing(address follower, address founder) external view returns (bool) {
        return _following[follower][founder];
    }

    /// @notice Founders the given follower follows (enumerable for the feed).
    function getFollowing(address follower) external view returns (address[] memory) {
        return _followList[follower];
    }

    function getFounder(address founder)
        external
        view
        returns (bool registered, string memory cid, uint256 followers, uint256 updates)
    {
        return (isFounder[founder], profileCid[founder], followerCount[founder], _founderUpdates[founder].length);
    }

    function getProjectUpdates(uint256 projectId) external view returns (Update[] memory) {
        return _projectUpdates[projectId];
    }

    function getFounderUpdates(address founder) external view returns (Update[] memory) {
        return _founderUpdates[founder];
    }

    function projectUpdateCount(uint256 projectId) external view returns (uint256) {
        return _projectUpdates[projectId].length;
    }

    function founderUpdateCount(address founder) external view returns (uint256) {
        return _founderUpdates[founder].length;
    }
}
