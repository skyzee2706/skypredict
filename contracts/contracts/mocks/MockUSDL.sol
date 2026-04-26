// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDL is ERC20, Ownable {
    uint256 public constant MINT_LIMIT = 100 * 10**6; // 100 tokens (6 decimals)
    uint256 public constant MINT_PERIOD = 24 hours;

    mapping(address => uint256) public lastMintTimestamp;
    mapping(address => uint256) public mintedInPeriod;
    mapping(address => bool) public admins;
    mapping(address => bool) public blockedAddresses;

    event AdminUpdated(address indexed account, bool status);
    event AddressBlocked(address indexed account, bool blocked);

    constructor() ERC20("Mock USDL", "USDL") Ownable(msg.sender) {}

    /// @notice Add or remove an address from admin list (can mint unlimited)
    function setAdmin(address account, bool status) external onlyOwner {
        admins[account] = status;
        emit AdminUpdated(account, status);
    }

    /// @notice Block or unblock an address from minting (callable by admins)
    function setBlocked(address account, bool blocked) external {
        require(isAdmin(msg.sender), "Not authorized");
        blockedAddresses[account] = blocked;
        emit AddressBlocked(account, blocked);
    }

    /// @notice Check if an address is an admin (owner or in admin list)
    function isAdmin(address account) public view returns (bool) {
        return account == owner() || admins[account];
    }

    /// @notice Mint tokens to an address (admins bypass rate limit)
    function mint(address to, uint256 amount) external {
        require(!blockedAddresses[to], "Address is blocked");
        if (!isAdmin(msg.sender)) {
            _enforceRateLimit(to, amount);
        }
        _mint(to, amount);
    }

    /// @notice Faucet function - mint 100 tokens to caller
    function drip() external {
        require(!blockedAddresses[msg.sender], "Address is blocked");
        _enforceRateLimit(msg.sender, MINT_LIMIT);
        _mint(msg.sender, MINT_LIMIT);
    }

    function _enforceRateLimit(address to, uint256 amount) internal {
        if (block.timestamp >= lastMintTimestamp[to] + MINT_PERIOD) {
            mintedInPeriod[to] = 0;
            lastMintTimestamp[to] = block.timestamp;
        }

        require(
            mintedInPeriod[to] + amount <= MINT_LIMIT,
            "Exceeds 24h mint limit of 100 tokens"
        );

        mintedInPeriod[to] += amount;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Check remaining mint allowance for an address
    function remainingMintAllowance(address account) external view returns (uint256) {
        if (block.timestamp >= lastMintTimestamp[account] + MINT_PERIOD) {
            return MINT_LIMIT;
        }
        return MINT_LIMIT > mintedInPeriod[account]
            ? MINT_LIMIT - mintedInPeriod[account]
            : 0;
    }

    /// @notice Get timestamp when rate limit resets for an address
    function nextResetTime(address account) external view returns (uint256) {
        if (lastMintTimestamp[account] == 0) {
            return 0;
        }
        return lastMintTimestamp[account] + MINT_PERIOD;
    }
}
