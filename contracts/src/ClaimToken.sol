// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ClaimToken
 * @notice ERC-1155 token representing investor claims on tokenized physical
 *         hardware projects. One token id per project; balances represent
 *         units of committed capital.
 *
 * Design notes:
 *  - ERC-1155 keeps all projects in one contract, so a single approval covers a
 *    holder's entire portfolio and secondary-market transfers stay cheap.
 *  - Minting and burning are restricted to protocol contracts (escrow and the
 *    secondary market) via role-gated entry points.
 *  - Transfers can be frozen per project: while a project is under dispute or
 *    defaulted, claims must not change hands.
 */
contract ClaimToken is ERC1155, AccessControl, Pausable {
    /* ------------------------------------------------------------------ *
     * Roles
     * ------------------------------------------------------------------ */

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    /* ------------------------------------------------------------------ *
     * Storage
     * ------------------------------------------------------------------ */

    /// @notice Project id => human-readable token name, e.g. "HelioFrost Pro Claim".
    mapping(uint256 => string) private _tokenNames;

    /// @notice Project id => true when transfers of that claim are blocked.
    mapping(uint256 => bool) public frozen;

    /// @notice Total units ever minted per project, for supply accounting.
    mapping(uint256 => uint256) public totalMinted;

    /// @notice Total units burned per project.
    mapping(uint256 => uint256) public totalBurned;

    string private _contractUri;

    /* ------------------------------------------------------------------ *
     * Events
     * ------------------------------------------------------------------ */

    event TokenRegistered(uint256 indexed projectId, string name);
    event ClaimMinted(uint256 indexed projectId, address indexed to, uint256 amount);
    event ClaimBurned(uint256 indexed projectId, address indexed from, uint256 amount);
    event ProjectFrozen(uint256 indexed projectId, bool isFrozen);
    event ContractUriUpdated(string newUri);

    /* ------------------------------------------------------------------ *
     * Errors
     * ------------------------------------------------------------------ */

    error TransferBlocked(uint256 projectId);
    error UnknownProject(uint256 projectId);
    error ZeroAmount();

    /* ------------------------------------------------------------------ *
     * Construction
     * ------------------------------------------------------------------ */

    /**
     * @param admin Address granted the default admin role (protocol multisig).
     * @param baseUri ERC-1155 metadata base; `{id}` is substituted per token.
     * @param contractUri_ Off-chain contract-level metadata pointer.
     */
    constructor(address admin, string memory baseUri, string memory contractUri_)
        ERC1155(baseUri)
    {
        if (admin == address(0)) revert ZeroAmount();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _contractUri = contractUri_;
    }

    /* ------------------------------------------------------------------ *
     * Metadata
     * ------------------------------------------------------------------ */

    function contractURI() external view returns (string memory) {
        return _contractUri;
    }

    function setContractURI(string calldata newUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _contractUri = newUri;
        emit ContractUriUpdated(newUri);
    }

    /// @notice Display name for a project's claim token.
    function tokenName(uint256 projectId) external view returns (string memory) {
        return _tokenNames[projectId];
    }

    /// @notice Circulating supply for a project's claim token.
    function totalSupply(uint256 projectId) external view returns (uint256) {
        return totalMinted[projectId] - totalBurned[projectId];
    }

    /* ------------------------------------------------------------------ *
     * Project lifecycle hooks
     * ------------------------------------------------------------------ */

    /**
     * @notice Registers metadata for a new project's claim token.
     * @dev Called once per project by the registry. Reverts on re-registration
     *      so a project id can never be silently repointed at new metadata.
     */
    function registerProject(uint256 projectId, string calldata name)
        external
        onlyRole(MINTER_ROLE)
    {
        if (bytes(_tokenNames[projectId]).length != 0) revert UnknownProject(projectId);
        _tokenNames[projectId] = name;
        emit TokenRegistered(projectId, name);
    }

    /// @notice Freezes or unfreezes transfers for a project's claims.
    function setFrozen(uint256 projectId, bool isFrozen) external onlyRole(FREEZER_ROLE) {
        frozen[projectId] = isFrozen;
        emit ProjectFrozen(projectId, isFrozen);
    }

    /* ------------------------------------------------------------------ *
     * Supply
     * ------------------------------------------------------------------ */

    /// @notice Issues claim units against committed capital.
    function mint(address to, uint256 projectId, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        totalMinted[projectId] += amount;
        _mint(to, projectId, amount, "");
        emit ClaimMinted(projectId, to, amount);
    }

    /// @notice Destroys claim units, e.g. on refund after a defaulted project.
    function burn(address from, uint256 projectId, uint256 amount)
        external
        onlyRole(BURNER_ROLE)
    {
        if (amount == 0) revert ZeroAmount();
        totalBurned[projectId] += amount;
        _burn(from, projectId, amount);
        emit ClaimBurned(projectId, from, amount);
    }

    /* ------------------------------------------------------------------ *
     * Transfers
     * ------------------------------------------------------------------ */

    /// @dev Blocks transfers of frozen projects and while the contract is paused.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override whenNotPaused {
        uint256 length = ids.length;
        for (uint256 i = 0; i < length; ++i) {
            if (frozen[ids[i]]) revert TransferBlocked(ids[i]);
        }
        super._update(from, to, ids, values);
    }

    /* ------------------------------------------------------------------ *
     * Admin
     * ------------------------------------------------------------------ */

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @dev Resolves the diamond inheritance between ERC1155 and AccessControl.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
